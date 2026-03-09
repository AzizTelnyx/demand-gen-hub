#!/usr/bin/env python3
"""Build LinkedIn org ID → SF Account mapping by looking up SF account domains as LinkedIn vanity names."""

import json, os, time, re
from pathlib import Path
import requests
import psycopg2

# Config
CREDS_PATH = os.path.expanduser("~/.config/linkedin-ads/credentials.json")
creds = json.loads(Path(CREDS_PATH).read_text())
TOKEN = creds["access_token"]
ACCOUNT_ID = creds["ad_account_id"]
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
BASE = "https://api.linkedin.com/v2"

# DB
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
DB_URL = None
for line in open(env_path):
    if line.startswith('POSTGRES_PRISMA_URL='):
        DB_URL = line.strip().split('=', 1)[1].strip('"').strip("'")
        break

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

def extract_vanity(domain):
    """Extract likely LinkedIn vanity name from a domain."""
    # Remove common TLDs and subdomains
    domain = domain.lower().strip()
    # Remove protocol if present
    domain = re.sub(r'^https?://', '', domain)
    # Remove www.
    domain = re.sub(r'^www\.', '', domain)
    # Get the main domain part
    parts = domain.split('.')
    if len(parts) >= 2:
        # Skip subdomains of big providers
        skip_domains = {'amazonaws.com', 'cloudfront.net', 'azurewebsites.net', 'herokuapp.com', 'github.io', 'shopify.com'}
        full = '.'.join(parts[-2:])
        if full in skip_domains:
            return None
        return parts[-2] if parts[-2] not in ('co', 'com', 'org', 'net', 'io', 'ai') else parts[-3] if len(parts) > 2 else parts[0]
    return parts[0] if parts else None

def lookup_org(vanity_name):
    """Look up a LinkedIn organization by vanity name."""
    try:
        r = requests.get(f"{BASE}/organizations?q=vanityName&vanityName={vanity_name}", headers=HEADERS)
        if r.status_code == 200:
            data = r.json()
            els = data.get("elements", [])
            if els:
                return {
                    "id": str(els[0].get("id", "")),
                    "name": els[0].get("localizedName", ""),
                    "vanityName": els[0].get("vanityName", vanity_name),
                }
    except Exception as e:
        pass
    return None

def fetch_all_impression_orgs():
    """Fetch all org IDs that have impressions on our ads."""
    orgs = {}
    start = 0
    count = 500
    while True:
        url = (
            f"{BASE}/adAnalyticsV2?q=analytics&pivot=MEMBER_COMPANY"
            f"&dateRange.start.day=1&dateRange.start.month=1&dateRange.start.year=2025"
            f"&dateRange.end.day=19&dateRange.end.month=2&dateRange.end.year=2026"
            f"&timeGranularity=ALL&accounts[0]=urn:li:sponsoredAccount:{ACCOUNT_ID}"
            f"&fields=impressions,clicks,costInLocalCurrency,pivotValues"
            f"&count={count}&start={start}"
        )
        r = requests.get(url, headers=HEADERS)
        if r.status_code != 200:
            print(f"Analytics error: {r.status_code}")
            break
        data = r.json()
        elements = data.get("elements", [])
        for el in elements:
            pivot = el.get("pivotValues", [""])[0]
            org_id = pivot.split(":")[-1] if ":" in pivot else None
            if org_id:
                orgs[org_id] = {
                    "impressions": el.get("impressions", 0),
                    "clicks": el.get("clicks", 0),
                    "spend": float(el.get("costInLocalCurrency", "0") or "0"),
                }
        has_next = any(l.get("rel") == "next" for l in data.get("paging", {}).get("links", []))
        if not has_next or not elements:
            break
        start += count
        time.sleep(0.5)
    return orgs

def main():
    # Step 1: Get all orgs with ad impressions
    print("Fetching all companies with LinkedIn ad impressions...")
    impression_orgs = fetch_all_impression_orgs()
    print(f"Found {len(impression_orgs)} companies with impressions")

    # Step 2: Get SF accounts with domains
    cur.execute('SELECT id, name, "cleanDomain" FROM "SFAccount" WHERE "cleanDomain" IS NOT NULL')
    sf_accounts = cur.fetchall()
    print(f"Loaded {len(sf_accounts)} SF accounts with domains")

    # Step 3: Build domain → vanity name candidates
    domain_to_sf = {}
    for sf_id, sf_name, domain in sf_accounts:
        vanity = extract_vanity(domain)
        if vanity and len(vanity) >= 3:
            if vanity not in domain_to_sf:
                domain_to_sf[vanity] = []
            domain_to_sf[vanity].append((sf_id, sf_name, domain))

    print(f"Generated {len(domain_to_sf)} unique vanity candidates from SF domains")

    # Step 4: Look up vanity names on LinkedIn, match to impression orgs
    matched = 0
    checked = 0
    batch_size = len(domain_to_sf)

    for vanity, sf_entries in domain_to_sf.items():
        checked += 1
        if checked % 100 == 0:
            print(f"  Checked {checked}/{batch_size} vanity names, {matched} matched so far...")
            conn.commit()

        org = lookup_org(vanity)
        if not org:
            time.sleep(0.1)  # Rate limit
            continue

        org_id = org["id"]

        # Check if this org has impressions
        if org_id in impression_orgs:
            stats = impression_orgs[org_id]
            for sf_id, sf_name, domain in sf_entries:
                cur.execute("""
                    INSERT INTO "LinkedInOrgMapping" ("linkedinOrgId", "orgName", "sfAccountId", "cleanDomain", "vanityName", "matchMethod")
                    VALUES (%s, %s, %s, %s, %s, 'vanity_lookup')
                    ON CONFLICT DO NOTHING
                """, (org_id, org["name"], sf_id, domain, org.get("vanityName", vanity)))
                matched += 1
        else:
            # Still store the mapping even without impressions — useful for ABM
            for sf_id, sf_name, domain in sf_entries:
                cur.execute("""
                    INSERT INTO "LinkedInOrgMapping" ("linkedinOrgId", "orgName", "sfAccountId", "cleanDomain", "vanityName", "matchMethod")
                    VALUES (%s, %s, %s, %s, %s, 'vanity_lookup')
                    ON CONFLICT DO NOTHING
                """, (org_id, org["name"], sf_id, domain, org.get("vanityName", vanity)))

        time.sleep(0.2)  # LinkedIn rate limit: ~100 req/sec for most endpoints, be conservative

    conn.commit()

    # Step 5: Store impression data
    print("\nStoring LinkedIn impression data...")
    stored = 0
    for org_id, stats in impression_orgs.items():
        cur.execute("""
            INSERT INTO "AdImpression" (id, platform, domain, impressions, clicks, spend, "dateRange", "createdAt")
            VALUES (%s, 'linkedin', %s, %s, %s, %s, '2025-01-01 to 2026-02-19', NOW())
            ON CONFLICT (id) DO UPDATE SET
                impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
                spend = EXCLUDED.spend
        """, (f"li_org_{org_id}", f"li_org:{org_id}", stats["impressions"], stats["clicks"], stats["spend"]))
        stored += 1

    conn.commit()
    print(f"Stored {stored} LinkedIn company impression records")

    # Summary
    cur.execute('SELECT COUNT(*) FROM "LinkedInOrgMapping"')
    total_mappings = cur.fetchone()[0]
    cur.execute('SELECT COUNT(DISTINCT "sfAccountId") FROM "LinkedInOrgMapping"')
    matched_sf = cur.fetchone()[0]
    cur.execute('SELECT COUNT(DISTINCT "linkedinOrgId") FROM "LinkedInOrgMapping" WHERE "linkedinOrgId" IN (SELECT REPLACE(domain, \'li_org:\', \'\') FROM "AdImpression" WHERE platform=\'linkedin\')')
    with_impressions = cur.fetchone()[0]

    print(f"\n✅ LinkedIn Org Mapping Complete")
    print(f"  Total mappings: {total_mappings}")
    print(f"  SF accounts matched: {matched_sf}")
    print(f"  Matched orgs with ad impressions: {with_impressions}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
