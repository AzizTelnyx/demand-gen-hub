#!/usr/bin/env python3
"""
Match LinkedIn org IDs to SF accounts via vanity name lookup.
Check ALL SF account domains (not just deal accounts).
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

# Get all unmatched LinkedIn org IDs
cur.execute("SELECT DISTINCT REPLACE(domain, 'li_org:', '') FROM \"AdImpression\" WHERE domain LIKE 'li_org:%'")
unmatched_org_ids = {row[0] for row in cur.fetchall()}
print(f"Unmatched LinkedIn org IDs: {len(unmatched_org_ids)}")

# Get SF opp account domains (these are the ones we need to match for pipeline)
cur.execute("""
    SELECT DISTINCT "accountDomain" 
    FROM "SFOpportunity" 
    WHERE "accountDomain" IS NOT NULL AND "accountDomain" != ''
""")
opp_domains = {row[0].lower().strip() for row in cur.fetchall()}
print(f"SF opportunity domains: {len(opp_domains)}")

# Also get all SF account domains  
cur.execute('SELECT "cleanDomain" FROM "SFAccount" WHERE "cleanDomain" IS NOT NULL AND "cleanDomain" != \'\'')
all_sf_domains = {row[0].lower().strip() for row in cur.fetchall()}
print(f"All SF account domains: {len(all_sf_domains)}")

# Prioritize: opp domains first, then all SF domains
# Extract base names for vanity lookup
skip_providers = {'amazonaws', 'cloudfront', 'azurewebsites', 'herokuapp', 'github', 
                  'shopify', 'wixsite', 'squarespace', 'wordpress', 's3', 'google', 
                  'outlook', 'yahoo', 'gmail', 'hotmail', 'aol', 'icloud'}

def extract_base(domain):
    domain = re.sub(r'^(https?://|www\.)', '', domain.lower().strip())
    parts = domain.split('.')
    if any(s in domain for s in skip_providers):
        return None
    base = parts[0] if len(parts) >= 2 else parts[0]
    if len(base) < 3:
        return None
    return base

# Build candidate list: (base, full_domain)
seen_bases = set()
candidates = []

# Opp domains first (higher priority)
for domain in sorted(opp_domains):
    base = extract_base(domain)
    if base and base not in seen_bases:
        seen_bases.add(base)
        candidates.append((base, domain))

# Then all SF domains
for domain in sorted(all_sf_domains):
    base = extract_base(domain)
    if base and base not in seen_bases:
        seen_bases.add(base)
        candidates.append((base, domain))

print(f"Unique domain bases to check: {len(candidates)}")
print(f"  From opp accounts: {len([c for c in candidates if c[1] in opp_domains])}")

matched = 0
checked = 0
updates = []

for base, domain in candidates:
    checked += 1
    if checked % 100 == 0:
        print(f"  Checked {checked}/{len(candidates)}, matched {matched}...", flush=True)
        conn.commit()
    
    try:
        r = requests.get(f"{BASE}/organizations?q=vanityName&vanityName={base}", headers=HEADERS, timeout=10)
        if r.status_code == 200:
            els = r.json().get("elements", [])
            if els:
                org_id = str(els[0].get("id", ""))
                org_name = els[0].get("localizedName", "")
                if org_id in unmatched_org_ids:
                    updates.append((org_id, domain))
                    matched += 1
                    print(f"  ✓ {base} → {org_name} (org:{org_id}) → {domain}", flush=True)
        elif r.status_code == 429:
            print("  Rate limited, sleeping 30s...", flush=True)
            time.sleep(30)
        
        time.sleep(0.2)  # ~5 req/sec
    except Exception:
        pass

print(f"\nMatched {matched} orgs to SF domains out of {checked} checked")

# Apply
if updates:
    print("Updating impression records...")
    updated = 0
    for org_id, domain in updates:
        cur.execute('UPDATE "AdImpression" SET domain = %s WHERE domain = %s', (domain, f"li_org:{org_id}"))
        updated += cur.rowcount
    conn.commit()
    print(f"Updated {updated} impression records")

# Summary
cur.execute("SELECT COUNT(DISTINCT domain) FROM \"AdImpression\" WHERE \"campaignId\" LIKE 'li_%' AND domain NOT LIKE 'li_org:%'")
total = cur.fetchone()[0]
cur.execute("SELECT SUM(impressions) FROM \"AdImpression\" WHERE \"campaignId\" LIKE 'li_%' AND domain NOT LIKE 'li_org:%'")
imps = cur.fetchone()[0] or 0
print(f"\n✅ Total LinkedIn domains matched to SF: {total}")
print(f"Total matched impressions: {imps:,}")

cur.close()
conn.close()
