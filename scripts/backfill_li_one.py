#!/usr/bin/env python3
"""Sync one LinkedIn campaign's MEMBER_COMPANY touchpoints. Usage: python backfill_li_one.py <campaign_id>"""
import json, os, sys, time
from datetime import datetime, timezone
from pathlib import Path
import requests, psycopg2

camp_id = sys.argv[1]
CREDS = json.loads(Path(os.path.expanduser("~/.config/linkedin-ads/credentials.json")).read_text())
TOKEN = CREDS["access_token"]
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
BASE = "https://api.linkedin.com/v2"
conn = psycopg2.connect("postgresql://localhost:5432/dghub")
cur = conn.cursor()
now = datetime.now(timezone.utc)
today = datetime.now()

# Campaign name
cur.execute('SELECT name FROM "Campaign" WHERE "platformId"=%s', (camp_id,))
row = cur.fetchone()
camp_name = row[0] if row else f"Campaign {camp_id}"

# Org->domain mappings
try:
    cur.execute('SELECT "linkedinOrgId", "cleanDomain" FROM "LinkedInOrgMapping" WHERE "cleanDomain" IS NOT NULL')
    org_domains = {r[0]: r[1] for r in cur.fetchall()}
except:
    conn.rollback()
    org_domains = {}

count = 0
start = 0
while True:
    url = (
        f"{BASE}/adAnalyticsV2?q=analytics&pivot=MEMBER_COMPANY"
        f"&dateRange.start.day=1&dateRange.start.month=3&dateRange.start.year=2025"
        f"&dateRange.end.day={today.day}&dateRange.end.month={today.month}&dateRange.end.year={today.year}"
        f"&timeGranularity=ALL"
        f"&campaigns[0]=urn:li:sponsoredCampaign:{camp_id}"
        f"&fields=impressions,clicks,costInLocalCurrency,pivotValues"
        f"&count=500&start={start}"
    )
    r = requests.get(url, headers=HEADERS)
    if r.status_code == 429:
        time.sleep(30)
        continue
    if r.status_code != 200:
        print(f"ERROR {r.status_code}")
        break
    data = r.json()
    elements = data.get("elements", [])
    for el in elements:
        pivot = (el.get("pivotValues") or [""])[0]
        if not pivot or "organization" not in pivot:
            for ae in el.get("adEntities", []):
                v = ae.get("value", {})
                org_urn = v.get("organization", v.get("member_company", ""))
                if org_urn and "organization" in org_urn:
                    pivot = org_urn
                    break
        if "organization" not in pivot:
            continue
        org_id = pivot.split(":")[-1]
        domain = org_domains.get(org_id, f"li_org:{org_id}")
        record_id = f"li_{org_id}_{camp_id}"
        cur.execute("""
            INSERT INTO "AdImpression" (id, domain, "campaignId", "campaignName",
                impressions, clicks, cost, "dateFrom", "dateTo", "lastSyncedAt", "createdAt", "updatedAt", platform)
            VALUES (%s, %s, %s, %s, %s, %s, %s, '2025-03-01', %s, %s, %s, %s, 'linkedin')
            ON CONFLICT (id) DO UPDATE SET
                domain = EXCLUDED.domain, impressions = EXCLUDED.impressions,
                clicks = EXCLUDED.clicks, cost = EXCLUDED.cost,
                "lastSyncedAt" = EXCLUDED."lastSyncedAt", "updatedAt" = EXCLUDED."updatedAt", platform = 'linkedin'
        """, (record_id, domain, f"li_{camp_id}", camp_name,
              el.get("impressions", 0), el.get("clicks", 0),
              float(el.get("costInLocalCurrency", "0") or "0"),
              now.strftime("%Y-%m-%d"), now, now, now))
        count += 1
    # Only first page (top 500 companies by impressions) to avoid OOM
    break

conn.commit()
print(f"{count}")
conn.close()
