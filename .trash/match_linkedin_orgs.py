#!/usr/bin/env python3
"""
Match LinkedIn org IDs to SF account domains.
Strategy: Look up SF account domains as LinkedIn vanity names.
If found, update AdImpression records from li_org:ID to the actual domain.
"""

import json, os, re, time, sys
from pathlib import Path
import requests
import psycopg2

CREDS_PATH = os.path.expanduser("~/.config/linkedin-ads/credentials.json")
creds = json.loads(Path(CREDS_PATH).read_text())
TOKEN = creds["access_token"]
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

# Get unique LinkedIn org IDs from impressions
cur.execute("SELECT DISTINCT domain FROM \"AdImpression\" WHERE domain LIKE 'li_org:%'")
li_org_domains = {row[0]: row[0].split(':')[1] for row in cur.fetchall()}
print(f"LinkedIn org IDs in impressions: {len(li_org_domains)}")

org_id_set = set(li_org_domains.values())

# Get SF accounts with open deals + domains
cur.execute("""
    SELECT DISTINCT a."cleanDomain", a.name 
    FROM "SFOpportunity" o 
    JOIN "SFAccount" a ON o."accountName" = a.name 
    WHERE a."cleanDomain" IS NOT NULL AND a."cleanDomain" != ''
""")
sf_accounts = cur.fetchall()
print(f"SF accounts with domains: {len(sf_accounts)}")

# Extract base domain names for vanity lookup
skip_providers = {'amazonaws', 'cloudfront', 'azurewebsites', 'herokuapp', 'github', 'shopify', 'wixsite', 'squarespace', 'wordpress', 's3', 'google', 'outlook'}
seen_bases = set()
candidates = []
for domain, sf_name in sf_accounts:
    domain = domain.lower().strip()
    domain = re.sub(r'^(https?://|www\.)', '', domain)
    parts = domain.split('.')
    if any(s in domain for s in skip_providers):
        continue
    base = parts[0] if len(parts) >= 2 else parts[0]
    if len(base) >= 3 and base not in seen_bases:
        seen_bases.add(base)
        candidates.append((base, domain, sf_name))

print(f"Unique domain bases to check: {len(candidates)}")

# Look up each as LinkedIn vanity name
matched = 0
checked = 0
updates = []  # (org_id, domain)

for base, domain, sf_name in candidates:
    checked += 1
    if checked % 50 == 0:
        print(f"  Checked {checked}/{len(candidates)}, matched {matched}...", flush=True)
        conn.commit()
    
    try:
        r = requests.get(f"{BASE}/organizations?q=vanityName&vanityName={base}", headers=HEADERS, timeout=10)
        if r.status_code == 200:
            els = r.json().get("elements", [])
            if els:
                org_id = str(els[0].get("id", ""))
                org_name = els[0].get("localizedName", "")
                if org_id in org_id_set:
                    updates.append((org_id, domain))
                    matched += 1
                    print(f"    ✓ {base} → {org_name} (org:{org_id}) → {domain}", flush=True)
        elif r.status_code == 429:
            print("  Rate limited, sleeping 30s...", flush=True)
            time.sleep(30)
        
        time.sleep(0.25)
    except Exception as e:
        pass

print(f"\nMatched {matched} SF accounts to LinkedIn org IDs")

# Update AdImpression records
if updates:
    print(f"Updating impression records...")
    updated = 0
    for org_id, domain in updates:
        cur.execute(
            'UPDATE "AdImpression" SET domain = %s WHERE domain = %s',
            (domain, f"li_org:{org_id}")
        )
        updated += cur.rowcount
    conn.commit()
    print(f"Updated {updated} impression records with real domains")

# Summary
cur.execute("SELECT COUNT(DISTINCT domain) FROM \"AdImpression\" WHERE \"campaignId\" LIKE 'li_%' AND domain NOT LIKE 'li_org:%'")
matched_domains = cur.fetchone()[0]
print(f"\nTotal LinkedIn domains matched to SF: {matched_domains}")

cur.close()
conn.close()
