#!/usr/bin/env python3
"""
Sync LinkedIn company-level ad impressions into the hub database — MONTHLY granularity.
Uses MEMBER_COMPANY analytics with MONTHLY timeGranularity for attribution lookback support.
"""

import json, os, sys, time
from datetime import datetime, timezone, date, timedelta
from pathlib import Path
import requests
import psycopg2

CREDS_PATH = os.path.expanduser("~/.config/linkedin-ads/credentials.json")
creds = json.loads(Path(CREDS_PATH).read_text())
TOKEN = creds["access_token"]
ACCOUNT_ID = creds["ad_account_id"]
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
BASE = "https://api.linkedin.com/v2"

env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
DB_URL = None
for line in open(env_path):
    if line.startswith('POSTGRES_PRISMA_URL='):
        DB_URL = line.strip().split('=', 1)[1].strip('"').strip("'")
        break

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()
now = datetime.now(timezone.utc)
today = date.today()

# Start from March 2025 (when LinkedIn campaigns began)
START_DATE = date(2025, 3, 1)


def generate_monthly_windows(start_date, end_date):
    """Generate monthly (start, end) date pairs."""
    windows = []
    current = start_date.replace(day=1)
    while current <= end_date:
        window_end = (current.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        if window_end > end_date:
            window_end = end_date
        windows.append((current, window_end))
        current = (window_end + timedelta(days=1))
    return windows


def fetch_campaign_company_impressions_monthly(camp_id, camp_name, win_start, win_end):
    """Fetch company impressions for a campaign in a monthly window."""
    all_data = []
    start = 0
    while True:
        url = (
            f"{BASE}/adAnalyticsV2?q=analytics&pivot=MEMBER_COMPANY"
            f"&dateRange.start.day={win_start.day}&dateRange.start.month={win_start.month}&dateRange.start.year={win_start.year}"
            f"&dateRange.end.day={win_end.day}&dateRange.end.month={win_end.month}&dateRange.end.year={win_end.year}"
            f"&timeGranularity=ALL"
            f"&campaigns[0]=urn:li:sponsoredCampaign:{camp_id}"
            f"&fields=impressions,clicks,costInLocalCurrency,pivotValues"
            f"&count=500&start={start}"
        )
        r = requests.get(url, headers=HEADERS)
        if r.status_code == 429:
            print("  Rate limited, sleeping 30s...")
            time.sleep(30)
            continue
        if r.status_code != 200:
            print(f"  Error for {camp_id}: {r.status_code}")
            break
        data = r.json()
        elements = data.get("elements", [])
        
        for el in elements:
            pivot = (el.get("pivotValues") or [""])[0]
            if not pivot or "organization" not in pivot:
                for ae in el.get("adEntities", []):
                    org_urn = ae.get("value", {}).get("organization", ae.get("value", {}).get("member_company", ""))
                    if org_urn and "organization" in org_urn:
                        pivot = org_urn
                        break
            if "organization" not in pivot:
                continue
            org_id = pivot.split(":")[-1]
            all_data.append((
                org_id,
                el.get("impressions", 0),
                el.get("clicks", 0),
                float(el.get("costInLocalCurrency", "0") or "0"),
            ))

        has_next = any(l.get("rel") == "next" for l in data.get("paging", {}).get("links", []))
        if not has_next or not elements or start >= 1000:
            break
        start += 500
        time.sleep(0.3)
    
    return all_data


def get_org_domain_mappings():
    """Load org->domain mappings from LinkedInOrgMapping."""
    try:
        cur.execute('SELECT "linkedinOrgId", "cleanDomain" FROM "LinkedInOrgMapping" WHERE "cleanDomain" IS NOT NULL')
        existing = {row[0]: row[1] for row in cur.fetchall()}
        print(f"Existing org->domain mappings: {len(existing)}")
        return existing
    except Exception:
        conn.rollback()
        print("No LinkedInOrgMapping table — storing as li_org:ID")
        return {}


def main():
    print("=" * 60)
    print("LinkedIn Company Impression Sync — MONTHLY GRANULARITY")
    print("=" * 60)

    # Get active campaigns
    cur.execute("SELECT \"platformId\", name FROM \"Campaign\" WHERE platform='linkedin' AND status='enabled'")
    campaigns = cur.fetchall()
    print(f"Active LinkedIn campaigns: {len(campaigns)}")

    org_domains = get_org_domain_mappings()
    monthly_windows = generate_monthly_windows(START_DATE, today)
    print(f"Monthly windows: {len(monthly_windows)} ({START_DATE} to {today})")

    total_stored = 0
    total_matched = 0

    for i, (camp_id, camp_name) in enumerate(campaigns):
        camp_records = 0
        print(f"\n[{i+1}/{len(campaigns)}] {camp_name[:60]}")

        for win_start, win_end in monthly_windows:
            data = fetch_campaign_company_impressions_monthly(camp_id, camp_name, win_start, win_end)
            if not data:
                continue

            month_date = win_start.replace(day=1)

            for org_id, impressions, clicks, cost in data:
                if impressions == 0 and clicks == 0:
                    continue

                if org_id in org_domains:
                    domain = org_domains[org_id]
                    total_matched += 1
                else:
                    domain = f"li_org:{org_id}"

                record_id = f"li_{org_id}_{camp_id}_{month_date.strftime('%Y%m')}"
                cur.execute("""
                    INSERT INTO "AdImpression" (id, domain, "campaignId", "campaignName",
                        impressions, clicks, cost, "dateFrom", "dateTo",
                        "lastSyncedAt", "createdAt", "updatedAt", platform)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'linkedin')
                    ON CONFLICT (id) DO UPDATE SET
                        "campaignName" = EXCLUDED."campaignName",
                        impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
                        cost = EXCLUDED.cost, "lastSyncedAt" = EXCLUDED."lastSyncedAt",
                        "updatedAt" = EXCLUDED."updatedAt", platform = 'linkedin'
                """, (record_id, domain, f"li_{camp_id}", camp_name,
                      impressions, clicks, cost,
                      win_start, win_end,
                      now, now, now))
                camp_records += 1

            conn.commit()
            time.sleep(0.3)

        total_stored += camp_records
        if camp_records:
            print(f"  → {camp_records} domain-month records")

    # Summary
    cur.execute('SELECT COUNT(*) FROM "AdImpression" WHERE platform = \'linkedin\' AND "dateTo" IS NOT NULL')
    monthly_count = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM "AdImpression" WHERE platform = \'linkedin\' AND "dateTo" IS NULL')
    legacy_count = cur.fetchone()[0]

    print(f"\n✅ LinkedIn Monthly Impression Sync Complete")
    print(f"  New monthly records: {total_stored} ({total_matched} matched to SF domains)")
    print(f"  Total monthly records in DB: {monthly_count}")
    print(f"  Legacy cumulative records: {legacy_count}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
