#!/usr/bin/env python3
"""Sync LinkedIn Ads campaigns + analytics into the hub database."""

import json, os, sys, time
from datetime import datetime, timedelta
from pathlib import Path
import requests

# --- Config ---
CREDS_PATH = os.path.expanduser("~/.config/linkedin-ads/credentials.json")
creds = json.loads(Path(CREDS_PATH).read_text())
TOKEN = creds["access_token"]
ACCOUNT_ID = creds["ad_account_id"]
ACCOUNT_URN = f"urn:li:sponsoredAccount:{ACCOUNT_ID}"

HEADERS = {"Authorization": f"Bearer {TOKEN}"}
BASE = "https://api.linkedin.com/v2"

# DB
sys.path.insert(0, os.path.dirname(__file__))
import subprocess

DB_URL = None
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(env_path):
    for line in open(env_path):
        if line.startswith('POSTGRES_PRISMA_URL=') or line.startswith('DATABASE_URL='):
            DB_URL = line.strip().split('=', 1)[1].strip('"').strip("'")
            break

import psycopg2
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# --- Fetch all campaigns ---
def fetch_all_campaigns():
    campaigns = []
    start = 0
    count = 100
    while True:
        url = f"{BASE}/adCampaignsV2?q=search&search.account.values[0]={ACCOUNT_URN}&count={count}&start={start}"
        r = requests.get(url, headers=HEADERS)
        if r.status_code != 200:
            print(f"Error fetching campaigns: {r.status_code} {r.text[:200]}")
            break
        data = r.json()
        elements = data.get("elements", [])
        campaigns.extend(elements)
        total = data.get("paging", {}).get("total", 0)
        start += count
        if start >= total or not elements:
            break
        time.sleep(0.5)
    return campaigns

# --- Fetch analytics for campaigns ---
def fetch_analytics(campaign_ids, days=30):
    """Fetch campaign analytics in batches of 20."""
    end = datetime.utcnow()
    start_date = end - timedelta(days=days)

    analytics = {}
    for i in range(0, len(campaign_ids), 20):
        batch = campaign_ids[i:i+20]
        campaigns_param = "&".join([f"campaigns[{j}]=urn:li:sponsoredCampaign:{cid}" for j, cid in enumerate(batch)])
        url = (
            f"{BASE}/adAnalyticsV2?q=analytics&pivot=CAMPAIGN"
            f"&dateRange.start.day={start_date.day}&dateRange.start.month={start_date.month}&dateRange.start.year={start_date.year}"
            f"&dateRange.end.day={end.day}&dateRange.end.month={end.month}&dateRange.end.year={end.year}"
            f"&timeGranularity=ALL&fields=impressions,clicks,costInLocalCurrency,costInUsd,externalWebsiteConversions,oneClickLeads,dateRange,pivotValues"
            f"&{campaigns_param}"
        )
        r = requests.get(url, headers=HEADERS)
        if r.status_code != 200:
            print(f"Analytics error ({r.status_code}): {r.text[:200]}")
            time.sleep(1)
            continue

        for el in r.json().get("elements", []):
            # Extract campaign ID from pivotValues or adEntities fallback
            pivot_values = el.get("pivotValues", [])
            cid = None
            for pv in pivot_values:
                if "sponsoredCampaign" in pv:
                    cid = pv.split(":")[-1]
                    break
            if not cid:
                # pivotValues missing when fields param is set — use adEntities
                for ae in el.get("adEntities", []):
                    camp_urn = ae.get("value", {}).get("campaign", "")
                    if camp_urn:
                        cid = camp_urn.split(":")[-1]
                        break
            if not cid:
                pivot = el.get("pivotValue", "")
                cid = pivot.split(":")[-1] if ":" in pivot else None
            if cid:
                analytics[cid] = {
                    "impressions": el.get("impressions", 0),
                    "clicks": el.get("clicks", 0),
                    "spend": float(el.get("costInLocalCurrency", "0")) if el.get("costInLocalCurrency") else 0,
                    "conversions": el.get("externalWebsiteConversions", 0) + el.get("oneClickLeads", 0),
                }
        time.sleep(0.5)

    return analytics

# --- Status mapping ---
def map_status(li_status, serving_statuses):
    s = li_status.upper()
    if s == "ACTIVE":
        if "RUNNABLE" in serving_statuses:
            return "enabled"
        return "paused"  # active but not serving
    elif s == "PAUSED":
        return "paused"
    elif s in ("ARCHIVED", "COMPLETED", "CANCELED"):
        return "paused"
    elif s == "DRAFT":
        return "paused"
    elif s == "REMOVED":
        return "removed"
    return "paused"

# --- Main ---
def main():
    print("Fetching LinkedIn campaigns...")
    campaigns = fetch_all_campaigns()
    print(f"Found {len(campaigns)} campaigns")

    # Skip removed/draft
    active_and_paused = [c for c in campaigns if c.get("status") not in ("REMOVED",)]
    print(f"Syncing {len(active_and_paused)} campaigns (excluding removed)")

    # Get campaign IDs for analytics
    campaign_ids = [str(c["id"]) for c in active_and_paused if c.get("status") == "ACTIVE"]
    print(f"Fetching analytics for {len(campaign_ids)} active campaigns...")
    analytics = fetch_analytics(campaign_ids) if campaign_ids else {}
    print(f"Got analytics for {len(analytics)} campaigns")

    # Upsert campaigns
    upserted = 0
    for c in active_and_paused:
        cid = str(c["id"])
        name = c.get("name", "")
        status = map_status(c.get("status", ""), c.get("servingStatuses", []))
        budget_amount = None
        if c.get("dailyBudget"):
            budget_amount = float(c["dailyBudget"].get("amount", 0))
        elif c.get("totalBudget"):
            budget_amount = float(c["totalBudget"].get("amount", 0)) / 30  # rough daily

        campaign_type = c.get("type", c.get("format", ""))
        objective = c.get("objectiveType", "")

        stats = analytics.get(cid, {})

        # Parse start/end dates from runSchedule
        li_start = None
        li_end = None
        run_schedule = c.get("runSchedule", {})
        if run_schedule.get("start"):
            try:
                # LinkedIn uses epoch milliseconds
                li_start = datetime.utcfromtimestamp(run_schedule["start"] / 1000).strftime("%Y-%m-%d")
            except:
                pass
        if run_schedule.get("end"):
            try:
                li_end = datetime.utcfromtimestamp(run_schedule["end"] / 1000).strftime("%Y-%m-%d")
            except:
                pass

        meta = json.dumps({"campaignType": campaign_type, "objective": objective, "format": c.get("format", "")})
        cur.execute("""
            INSERT INTO "Campaign" (id, "platformId", name, platform, status, budget, spend,
                impressions, clicks, conversions, metadata, "startDate", "endDate", "updatedAt")
            VALUES (%s, %s, %s, 'linkedin', %s, %s, %s, %s, %s, %s, %s, %s::timestamp, %s::timestamp, NOW())
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name, status = EXCLUDED.status, budget = EXCLUDED.budget,
                spend = COALESCE(EXCLUDED.spend, "Campaign".spend),
                impressions = COALESCE(EXCLUDED.impressions, "Campaign".impressions),
                clicks = COALESCE(EXCLUDED.clicks, "Campaign".clicks),
                conversions = COALESCE(EXCLUDED.conversions, "Campaign".conversions),
                metadata = EXCLUDED.metadata,
                "startDate" = COALESCE(EXCLUDED."startDate", "Campaign"."startDate"),
                "endDate" = COALESCE(EXCLUDED."endDate", "Campaign"."endDate"),
                "updatedAt" = NOW()
        """, (
            f"li_{cid}", cid, name, status, budget_amount,
            stats.get("spend"), stats.get("impressions"), stats.get("clicks"),
            stats.get("conversions"), meta, li_start, li_end,
        ))
        upserted += 1

    conn.commit()
    print(f"\n✅ Synced {upserted} LinkedIn campaigns to database")

    # Update SyncState
    cur.execute("""
        INSERT INTO "SyncState" (id, platform, "lastSyncedAt", status, "updatedAt")
        VALUES ('linkedin-sync', 'linkedin', NOW(), 'idle', NOW())
        ON CONFLICT (id) DO UPDATE SET "lastSyncedAt" = NOW(), status = 'idle', "updatedAt" = NOW()
    """)
    conn.commit()

    # Summary
    cur.execute("SELECT status, COUNT(*) FROM \"Campaign\" WHERE platform='linkedin' GROUP BY status ORDER BY count DESC")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
