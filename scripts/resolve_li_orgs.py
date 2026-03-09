#!/usr/bin/env python3
"""
Resolve LinkedIn org IDs to domains by querying LinkedIn API.
Processes in small batches to avoid OOM. Stores results in a mapping table.
Usage: python resolve_li_orgs.py [--limit 100] [--offset 0]
"""
import json, os, sys, time, argparse
from pathlib import Path
import requests, psycopg2

CREDS = json.loads(Path(os.path.expanduser("~/.config/linkedin-ads/credentials.json")).read_text())
TOKEN = CREDS["access_token"]
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
DB_URL = "postgresql://localhost:5432/dghub"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--offset", type=int, default=0)
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Create mapping table if not exists
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "LinkedInOrgMapping" (
            "linkedinOrgId" TEXT PRIMARY KEY,
            "orgName" TEXT,
            "cleanDomain" TEXT,
            "vanityName" TEXT,
            "resolvedAt" TIMESTAMP DEFAULT NOW()
        )
    """)
    conn.commit()

    # Get unresolved org IDs
    cur.execute("""
        SELECT DISTINCT replace(domain, 'li_org:', '') as org_id
        FROM "AdImpression" 
        WHERE domain LIKE 'li_org:%%'
        AND replace(domain, 'li_org:', '') NOT IN (
            SELECT "linkedinOrgId" FROM "LinkedInOrgMapping"
        )
        ORDER BY org_id
        LIMIT %s OFFSET %s
    """, (args.limit, args.offset))
    org_ids = [r[0] for r in cur.fetchall()]
    
    print(f"Resolving {len(org_ids)} org IDs (offset={args.offset})...")
    resolved = 0
    failed = 0

    for i, org_id in enumerate(org_ids):
        try:
            # Try to get org info via LinkedIn API
            url = f"https://api.linkedin.com/v2/organizations/{org_id}"
            r = requests.get(url, headers=HEADERS, timeout=10)
            
            if r.status_code == 200:
                data = r.json()
                name = data.get("localizedName", "")
                website = data.get("websiteUrl", "") or ""
                vanity = data.get("vanityName", "")
                
                # Extract domain from website
                domain = ""
                if website:
                    domain = website.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0].lower()
                
                cur.execute("""
                    INSERT INTO "LinkedInOrgMapping" ("linkedinOrgId", "orgName", "cleanDomain", "vanityName")
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT ("linkedinOrgId") DO UPDATE SET
                        "orgName" = EXCLUDED."orgName", "cleanDomain" = EXCLUDED."cleanDomain",
                        "vanityName" = EXCLUDED."vanityName", "resolvedAt" = NOW()
                """, (org_id, name, domain or None, vanity or None))
                
                if domain:
                    # Update AdImpression records
                    cur.execute("""
                        UPDATE "AdImpression" SET domain = %s 
                        WHERE domain = %s
                    """, (domain, f"li_org:{org_id}"))
                    resolved += 1
                    print(f"  [{i+1}/{len(org_ids)}] {org_id} → {domain} ({name})")
                else:
                    print(f"  [{i+1}/{len(org_ids)}] {org_id} → no website ({name})")
                    
            elif r.status_code == 403:
                # Store as unresolvable
                cur.execute("""
                    INSERT INTO "LinkedInOrgMapping" ("linkedinOrgId", "orgName", "cleanDomain")
                    VALUES (%s, '403_FORBIDDEN', NULL)
                    ON CONFLICT ("linkedinOrgId") DO NOTHING
                """, (org_id,))
                failed += 1
            elif r.status_code == 429:
                print(f"  Rate limited at {i+1}, sleeping 60s...")
                conn.commit()
                time.sleep(60)
                continue
            else:
                failed += 1
                
            conn.commit()
            time.sleep(0.3)  # Rate limit
            
        except Exception as e:
            print(f"  [{i+1}] {org_id} ERROR: {e}")
            failed += 1

    conn.commit()
    
    # Summary
    cur.execute('SELECT COUNT(*) FROM "LinkedInOrgMapping" WHERE "cleanDomain" IS NOT NULL')
    total_mapped = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM \"AdImpression\" WHERE platform='linkedin' AND domain NOT LIKE 'li_org:%%'")
    total_matched = cur.fetchone()[0]
    
    print(f"\nDone. Resolved: {resolved}, Failed/403: {failed}")
    print(f"Total mapped orgs: {total_mapped}, Total matched impressions: {total_matched}")
    conn.close()

if __name__ == "__main__":
    main()
