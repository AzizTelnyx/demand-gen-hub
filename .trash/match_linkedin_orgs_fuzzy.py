#!/usr/bin/env python3
"""
Match LinkedIn org IDs to SF accounts by resolving org names via LinkedIn API,
then fuzzy-matching to SF account names.
"""

import json, os, time, sys
from pathlib import Path
from difflib import SequenceMatcher
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

# Get LinkedIn org IDs with most impressions (prioritize high-impression orgs)
cur.execute("""
    SELECT REPLACE(domain, 'li_org:', '') as org_id, SUM(impressions) as total_imps
    FROM "AdImpression" 
    WHERE domain LIKE 'li_org:%'
    GROUP BY domain
    ORDER BY total_imps DESC
    LIMIT 500
""")
top_orgs = cur.fetchall()
print(f"Top {len(top_orgs)} LinkedIn org IDs by impressions to resolve")

# Get all SF account names for fuzzy matching
cur.execute('SELECT DISTINCT "accountName" FROM "SFOpportunity" WHERE "accountName" IS NOT NULL')
sf_names = {row[0] for row in cur.fetchall()}
# Also get SF account domains
cur.execute('SELECT name, "cleanDomain" FROM "SFAccount" WHERE "cleanDomain" IS NOT NULL')
sf_name_to_domain = {row[0]: row[1].lower().strip() for row in cur.fetchall()}
print(f"SF account names: {len(sf_names)}, with domains: {len(sf_name_to_domain)}")

def normalize(name):
    """Normalize company name for matching."""
    name = name.lower().strip()
    for suffix in [', inc.', ', inc', ' inc.', ' inc', ', llc', ' llc', ', ltd', ' ltd', 
                   ', corp', ' corp', ' corporation', ' company', ' co.', ' co',
                   ', s.a.', ' s.a.', ' ag', ' gmbh', ' plc', ' limited']:
        if name.endswith(suffix):
            name = name[:-len(suffix)].strip()
    return name

def best_match(org_name, sf_names, threshold=0.8):
    """Find best fuzzy match above threshold."""
    norm_org = normalize(org_name)
    best = None
    best_score = 0
    for sf_name in sf_names:
        norm_sf = normalize(sf_name)
        # Exact match
        if norm_org == norm_sf:
            return sf_name, 1.0
        # Fuzzy match
        score = SequenceMatcher(None, norm_org, norm_sf).ratio()
        if score > best_score:
            best_score = score
            best = sf_name
    if best_score >= threshold:
        return best, best_score
    return None, 0

# Resolve org IDs to names via LinkedIn API, then fuzzy match to SF
matched = 0
resolved = 0
updates = []  # (org_id, domain)

for i, (org_id, total_imps) in enumerate(top_orgs):
    if i % 50 == 0 and i > 0:
        print(f"  Checked {i}/{len(top_orgs)}, resolved {resolved}, matched {matched}...", flush=True)
    
    try:
        r = requests.get(f"{BASE}/organizations/{org_id}", headers=HEADERS, timeout=10)
        if r.status_code == 200:
            org = r.json()
            org_name = org.get("localizedName", "")
            website = org.get("websiteUrl", "") or ""
            resolved += 1
            
            # Try website domain first
            if website:
                import re
                domain = re.sub(r'^https?://(www\.)?', '', website.lower()).split('/')[0]
                # Check if this domain matches any SF account domain
                cur.execute('SELECT "accountDomain" FROM "SFOpportunity" WHERE LOWER("accountDomain") = %s LIMIT 1', (domain,))
                if cur.fetchone():
                    updates.append((org_id, domain))
                    matched += 1
                    print(f"  ✓ {org_name} → {domain} (website match, {total_imps} imps)", flush=True)
                    time.sleep(0.25)
                    continue
            
            # Try fuzzy name match
            sf_match, score = best_match(org_name, sf_names)
            if sf_match:
                # Get the domain for this SF account
                domain = sf_name_to_domain.get(sf_match)
                if not domain:
                    # Try accountDomain from opps
                    cur.execute('SELECT "accountDomain" FROM "SFOpportunity" WHERE "accountName" = %s AND "accountDomain" IS NOT NULL LIMIT 1', (sf_match,))
                    row = cur.fetchone()
                    if row:
                        domain = row[0].lower().strip()
                
                if domain:
                    updates.append((org_id, domain))
                    matched += 1
                    print(f"  ✓ {org_name} → {sf_match} → {domain} (fuzzy {score:.0%}, {total_imps} imps)", flush=True)
                else:
                    print(f"  ~ {org_name} → {sf_match} (no domain, skipped)", flush=True)
        elif r.status_code == 403:
            pass  # Can't access this org
        elif r.status_code == 429:
            print("  Rate limited, sleeping 30s...", flush=True)
            time.sleep(30)
        
        time.sleep(0.25)
    except Exception as e:
        pass

print(f"\nResolved {resolved}/{len(top_orgs)} org names")
print(f"Matched {matched} to SF accounts with domains")

# Apply updates
if updates:
    print(f"\nUpdating impression records...")
    updated = 0
    for org_id, domain in updates:
        cur.execute(
            'UPDATE "AdImpression" SET domain = %s WHERE domain = %s',
            (domain, f"li_org:{org_id}")
        )
        updated += cur.rowcount
    conn.commit()
    print(f"Updated {updated} impression records")

# Final summary
cur.execute("SELECT COUNT(DISTINCT domain) FROM \"AdImpression\" WHERE \"campaignId\" LIKE 'li_%' AND domain NOT LIKE 'li_org:%'")
total_matched = cur.fetchone()[0]
cur.execute("SELECT SUM(impressions) FROM \"AdImpression\" WHERE \"campaignId\" LIKE 'li_%' AND domain NOT LIKE 'li_org:%'")
matched_imps = cur.fetchone()[0] or 0
print(f"\nTotal LinkedIn domains matched to SF: {total_matched}")
print(f"Total matched impressions: {matched_imps:,}")

cur.close()
conn.close()
