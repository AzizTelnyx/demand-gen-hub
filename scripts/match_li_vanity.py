#!/usr/bin/env python3
"""
Match LinkedIn org IDs to SF account domains via vanity name lookup.
Takes SF account domains, tries them as LinkedIn vanity names, maps org_id → domain.
Then updates AdImpression records from li_org:XXX to real domains.
Usage: python match_li_vanity.py [--limit 200]
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
    parser.add_argument("--limit", type=int, default=200)
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Create mapping table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "LinkedInOrgMapping" (
            "linkedinOrgId" TEXT PRIMARY KEY,
            "orgName" TEXT,
            "cleanDomain" TEXT,
            "vanityName" TEXT,
            "resolvedAt" TIMESTAMP DEFAULT NOW()
        )
    """)
    # Track attempted domains so we don't retry
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "LinkedInVanityAttempt" (
            domain TEXT PRIMARY KEY,
            "orgId" TEXT,
            "attemptedAt" TIMESTAMP DEFAULT NOW()
        )
    """)
    conn.commit()

    # Get SF account domains that have deals AND haven't been attempted
    cur.execute("""
        SELECT DISTINCT o."accountDomain"
        FROM "SFOpportunity" o
        WHERE o."accountDomain" IS NOT NULL 
        AND o."accountDomain" != ''
        AND o."accountDomain" NOT IN (SELECT domain FROM "LinkedInVanityAttempt")
        ORDER BY o."accountDomain"
        LIMIT %s
    """, (args.limit,))
    domains = [r[0] for r in cur.fetchall()]
    print(f"Trying {len(domains)} SF domains as LinkedIn vanity names...")

    # Get current unmatched org IDs
    cur.execute("""
        SELECT DISTINCT replace(domain, 'li_org:', '') 
        FROM "AdImpression" WHERE domain LIKE 'li_org:%%'
    """)
    unmatched_orgs = {r[0] for r in cur.fetchall()}
    print(f"Unmatched org IDs in AdImpression: {len(unmatched_orgs)}")

    matched = 0
    impressions_updated = 0

    for i, domain in enumerate(domains):
        # Extract company name from domain (e.g. "twilio.com" → "twilio")
        vanity = domain.split(".")[0].lower().strip()
        if not vanity or len(vanity) < 2:
            cur.execute('INSERT INTO "LinkedInVanityAttempt" (domain) VALUES (%s) ON CONFLICT DO NOTHING', (domain,))
            continue

        try:
            url = f"https://api.linkedin.com/v2/organizations?q=vanityName&vanityName={vanity}"
            r = requests.get(url, headers=HEADERS, timeout=10)
            
            if r.status_code == 200:
                els = r.json().get("elements", [])
                if els:
                    org = els[0]
                    org_id = str(org["id"])
                    org_name = org.get("localizedName", "")
                    
                    # Store mapping
                    cur.execute("""
                        INSERT INTO "LinkedInOrgMapping" ("linkedinOrgId", "orgName", "cleanDomain", "vanityName")
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT ("linkedinOrgId") DO UPDATE SET
                            "cleanDomain" = EXCLUDED."cleanDomain", "vanityName" = EXCLUDED."vanityName"
                    """, (org_id, org_name, domain, vanity))
                    
                    # Update AdImpression if this org_id exists in unmatched
                    if org_id in unmatched_orgs:
                        cur.execute("""
                            UPDATE "AdImpression" SET domain = %s 
                            WHERE domain = %s
                        """, (domain, f"li_org:{org_id}"))
                        count = cur.rowcount
                        impressions_updated += count
                        matched += 1
                        print(f"  [{i+1}/{len(domains)}] {vanity} → org {org_id} ({org_name}) ✓ {count} impressions updated")
                    else:
                        print(f"  [{i+1}/{len(domains)}] {vanity} → org {org_id} ({org_name}) — no matching impressions")
                        
            elif r.status_code == 429:
                print(f"  Rate limited at {i+1}, sleeping 60s...")
                conn.commit()
                time.sleep(60)
                continue

            # Record attempt
            cur.execute("""
                INSERT INTO "LinkedInVanityAttempt" (domain, "orgId") 
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (domain, els[0]["id"] if r.status_code == 200 and els else None))
            conn.commit()
            
            if (i + 1) % 50 == 0:
                print(f"  Progress: {i+1}/{len(domains)}, {matched} matched, {impressions_updated} impressions updated")
            
            time.sleep(0.3)
            
        except Exception as e:
            print(f"  [{i+1}] {vanity}: ERROR {e}")
            cur.execute('INSERT INTO "LinkedInVanityAttempt" (domain) VALUES (%s) ON CONFLICT DO NOTHING', (domain,))
            conn.commit()

    conn.commit()
    
    # Summary
    cur.execute("SELECT COUNT(*) FROM \"AdImpression\" WHERE platform='linkedin' AND domain NOT LIKE 'li_org:%%'")
    total_matched_impr = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT domain) FROM \"AdImpression\" WHERE platform='linkedin' AND domain NOT LIKE 'li_org:%%'")
    total_matched_domains = cur.fetchone()[0]
    
    print(f"\n✅ Done. New matches: {matched}, Impressions updated: {impressions_updated}")
    print(f"Total matched LinkedIn impressions: {total_matched_impr} across {total_matched_domains} domains")
    conn.close()

if __name__ == "__main__":
    main()
