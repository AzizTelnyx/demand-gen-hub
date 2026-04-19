#!/usr/bin/env python3
"""Match LinkedIn orgs to SF domains, prioritized by deal value. Small batches."""
import json, os, sys, time, argparse
from pathlib import Path
import requests, psycopg2

CREDS = json.loads(Path(os.path.expanduser("~/.config/linkedin-ads/credentials.json")).read_text())
TOKEN = CREDS["access_token"]
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
DB_URL = "postgresql://localhost:5432/dghub"

parser = argparse.ArgumentParser()
parser.add_argument("--limit", type=int, default=50)
args = parser.parse_args()

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# Ensure columns exist on the actual tables (created by prior migrations)
cur.execute('ALTER TABLE "LinkedInOrgMapping" ADD COLUMN IF NOT EXISTS "cleanDomain" TEXT')
cur.execute('ALTER TABLE "LinkedInOrgMapping" ADD COLUMN IF NOT EXISTS "vanityName" TEXT')
conn.commit()

# Priority: biggest new business deals first (no renewals/upsells/cross-sells)
cur.execute("""
    SELECT o."accountDomain", SUM(o.amount) as pipe
    FROM "SFOpportunity" o
    WHERE o."accountDomain" IS NOT NULL AND o."accountDomain" != ''
    AND o."oppType" NOT IN ('Renewal', 'Upsell', 'Cross-sell', 'Cross-Sell')
    AND o."accountDomain" NOT IN (SELECT id FROM "LinkedInVanityAttempt")
    GROUP BY o."accountDomain"
    ORDER BY pipe DESC
    LIMIT %s
""", (args.limit,))
domains = [(r[0], r[1]) for r in cur.fetchall()]

cur.execute("SELECT DISTINCT replace(domain, 'li_org:', '') FROM \"AdImpression\" WHERE domain LIKE 'li_org:%%'")
unmatched = {r[0] for r in cur.fetchall()}

matched = 0
updated = 0
print(f"Processing {len(domains)} domains (by deal value), {len(unmatched)} unmatched orgs")

def upsert_vanity(domain, org_id, vanity, success):
    """Insert or update a LinkedInVanityAttempt record."""
    # Use separate insert/update to avoid NULLIF/COALESCE issues with parameterized queries
    cur.execute('SELECT 1 FROM "LinkedInVanityAttempt" WHERE id = %s', (domain,))
    exists = cur.fetchone()
    if exists:
        if org_id:
            cur.execute('UPDATE "LinkedInVanityAttempt" SET "orgId" = %s, "attempted" = %s, "success" = %s WHERE id = %s',
                (org_id, vanity, success, domain))
        else:
            cur.execute('UPDATE "LinkedInVanityAttempt" SET "attempted" = %s, "success" = %s WHERE id = %s',
                (vanity, success, domain))
    else:
        cur.execute('INSERT INTO "LinkedInVanityAttempt" ("id","orgId","attempted","success") VALUES (%s,%s,%s,%s)',
            (domain, org_id or '', vanity, success))

for i, (domain, pipe) in enumerate(domains):
    vanity = domain.split(".")[0].lower().strip()
    if not vanity or len(vanity) < 2:
        upsert_vanity(domain, None, vanity, False)
        conn.commit()
        continue
    try:
        r = requests.get(f"https://api.linkedin.com/v2/organizations?q=vanityName&vanityName={vanity}", headers=HEADERS, timeout=10)
        if r.status_code == 429:
            print(f"  Rate limited, sleeping 60s...")
            conn.commit()
            time.sleep(60)
            r = requests.get(f"https://api.linkedin.com/v2/organizations?q=vanityName&vanityName={vanity}", headers=HEADERS, timeout=10)

        org_id = None
        if r.status_code == 200:
            els = r.json().get("elements", [])
            if els:
                org = els[0]
                org_id = str(org["id"])
                name = org.get("localizedName", "")
                cur.execute('''INSERT INTO "LinkedInOrgMapping" ("id","orgId","orgName","cleanDomain","vanityName")
                    VALUES (%s,%s,%s,%s,%s)
                    ON CONFLICT ("id") DO UPDATE SET "cleanDomain"=EXCLUDED."cleanDomain", "vanityName"=EXCLUDED."vanityName"''',
                    (org_id, org_id, name, domain, vanity))
                if org_id in unmatched:
                    cur.execute('UPDATE "AdImpression" SET domain=%s WHERE domain=%s', (domain, f"li_org:{org_id}"))
                    n = cur.rowcount
                    updated += n
                    matched += 1
                    print(f"  ✓ [{i+1}] {vanity} → {name} (org {org_id}) — {n} impressions (${pipe:,.0f} pipeline)")

        upsert_vanity(domain, org_id, vanity, org_id is not None)
        conn.commit()
        time.sleep(0.3)
    except Exception as e:
        print(f"  ✗ [{i+1}] {vanity}: {e}")
        conn.rollback()
        try:
            upsert_vanity(domain, None, vanity, False)
            conn.commit()
        except Exception:
            conn.rollback()

cur.execute("SELECT COUNT(*), SUM(impressions) FROM \"AdImpression\" WHERE platform='linkedin' AND domain NOT LIKE 'li_org:%%'")
total_matched, total_impr = cur.fetchone()
print(f"\n✅ New: {matched} matches, {updated} impressions. Total matched: {total_matched} records, {total_impr:,} impr")
conn.close()
