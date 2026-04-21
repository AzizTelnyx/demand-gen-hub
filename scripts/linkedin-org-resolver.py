#!/usr/bin/env python3
"""
LinkedIn Org Resolver — resolves li_org:XXXX IDs to company names + domains.
Uses the LinkedIn Ads API adTargetingEntities endpoint (works with r_ads scope).

Usage:
  # Sync impression data from LinkedIn and extract unique li_org: IDs
  python3 scripts/linkedin-org-resolver.py --sync

  # Resolve all unresolved li_org: IDs in LinkedInOrgLookup table
  python3 scripts/linkedin-org-resolver.py --resolve

  # Match resolved orgs to Salesforce accounts by domain
  python3 scripts/linkedin-org-resolver.py --match

  # Full pipeline: sync → resolve → match
  python3 scripts/linkedin-org-resolver.py --all
"""

import argparse
import json
import os
import re
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import quote

# DB
import psycopg2

DB_URL = os.environ.get("DATABASE_URL", "postgresql://localhost:5432/dghub")
LI_CREDS = os.path.expanduser("~/.config/linkedin-ads/credentials.json")


def get_db():
    return psycopg2.connect(DB_URL)


def load_token():
    with open(LI_CREDS) as f:
        creds = json.load(f)
    return creds["access_token"]


def api_get(token, url, max_retries=3):
    """Make an authenticated API GET request."""
    req = Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("LinkedIn-Version", "202604")
    req.add_header("X-Restli-Protocol-Version", "2.0.0")
    
    for attempt in range(max_retries):
        try:
            resp = urlopen(req)
            return json.loads(resp.read())
        except HTTPError as e:
            body = e.read().decode()
            if e.code == 429:
                wait = 2 ** (attempt + 1)
                print(f"  Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            if e.code == 401:
                print(f"  Auth error: {body[:200]}")
                return None
            print(f"  HTTP {e.code}: {body[:200]}")
            return None
    return None


def get_li_org_ids_from_api(token, ad_account_id):
    """Fetch campaign audience data from LinkedIn API to extract li_org: IDs."""
    # Get all campaigns for the ad account
    campaigns_url = f"https://api.linkedin.com/rest/adCampaigns?q=criteria&account=urn:li:sponsoredAccount:{ad_account_id}"
    data = api_get(token, campaigns_url)
    if not data:
        print("Failed to fetch campaigns")
        return set()
    
    org_ids = set()
    campaigns = data.get("elements", [])
    print(f"Found {len(campaigns)} campaigns")
    
    for campaign in campaigns:
        # Check targeting for company IDs
        targeting = campaign.get("targeting", {})
        for facet_key, facets in targeting.items():
            if isinstance(facets, list):
                for facet in facets:
                    urn = facet.get("urn", "")
                    if "urn:li:organization:" in urn:
                        org_id = urn.split(":")[-1]
                        org_ids.add(org_id)
    
    return org_ids


def get_li_org_ids_from_db():
    """Get unresolved li_org: IDs from the LinkedInOrgLookup table + any in AdImpression."""
    conn = get_db()
    cur = conn.cursor()
    
    # Get org IDs that haven't been resolved yet
    cur.execute("""
        SELECT "orgId" FROM "LinkedInOrgLookup" 
        WHERE name IS NULL AND error IS NULL
    """)
    unresolved = {row[0] for row in cur.fetchall()}
    
    # Also get org IDs from AdImpression domain field
    cur.execute("""
        SELECT DISTINCT SUBSTRING(domain FROM 'li_org:(\\d+)') 
        FROM "AdImpression" 
        WHERE domain LIKE 'li_org:%'
    """)
    from_impressions = {row[0] for row in cur.fetchall() if row[0]}
    
    cur.close()
    conn.close()
    
    return unresolved | from_impressions


def resolve_orgs(token, org_ids, batch_size=20):
    """Resolve org IDs to company names via adTargetingEntities endpoint."""
    conn = get_db()
    cur = conn.cursor()
    
    org_list = list(org_ids)
    resolved = 0
    errors = 0
    
    for i in range(0, len(org_list), batch_size):
        batch = org_list[i:i + batch_size]
        urns = ",".join(f"urn%3Ali%3Aorganization%3A{oid}" for oid in batch)
        url = f"https://api.linkedin.com/rest/adTargetingEntities?q=urns&urns=List({urns})"
        
        print(f"  Resolving batch {i//batch_size + 1}/{(len(org_list) + batch_size - 1)//batch_size} ({len(batch)} orgs)...")
        data = api_get(token, url)
        
        if not data:
            print(f"  Batch failed, marking as errors")
            for oid in batch:
                cur.execute(
                    'INSERT INTO "LinkedInOrgLookup" (id, "orgId", error, "resolved_at") VALUES (%s, %s, %s, NOW()) ON CONFLICT (id) DO UPDATE SET error = %s, "resolved_at" = NOW()',
                    (f"li_org:{oid}", oid, "API lookup failed", "API lookup failed")
                )
            errors += len(batch)
            conn.commit()
            continue
        
        # Parse results — each org appears multiple times (once per facetUrn)
        org_names = {}
        for element in data.get("elements", []):
            urn = element.get("urn", "")
            name = element.get("name", "")
            org_id = urn.split(":")[-1] if urn else None
            if org_id and name:
                # Use the companyPrimary facet as the canonical name
                facet = element.get("facetUrn", "")
                if "companyPrimary" in facet or org_id not in org_names:
                    org_names[org_id] = name
        
        # Store results
        for oid in batch:
            name = org_names.get(oid)
            if name:
                cur.execute(
                    'INSERT INTO "LinkedInOrgLookup" (id, "orgId", name, "resolved_at") VALUES (%s, %s, %s, NOW()) ON CONFLICT (id) DO UPDATE SET name = %s, "resolved_at" = NOW()',
                    (f"li_org:{oid}", oid, name, name)
                )
                resolved += 1
            else:
                cur.execute(
                    'INSERT INTO "LinkedInOrgLookup" (id, "orgId", error, "resolved_at") VALUES (%s, %s, %s, NOW()) ON CONFLICT (id) DO UPDATE SET error = %s, "resolved_at" = NOW()',
                    (f"li_org:{oid}", oid, "Not found in targeting API", "Not found in targeting API")
                )
                errors += 1
        
        conn.commit()
        
        # Rate limit: 5 requests per second max
        if i + batch_size < len(org_list):
            time.sleep(0.5)
    
    cur.close()
    conn.close()
    
    print(f"Resolved: {resolved}, Errors: {errors}, Total: {len(org_list)}")
    return resolved


def match_to_salesforce():
    """Match resolved org names to Salesforce account domains."""
    conn = get_db()
    cur = conn.cursor()
    
    # Get all resolved orgs without a domain
    cur.execute("""
        SELECT l.id, l."orgId", l.name 
        FROM "LinkedInOrgLookup" l
        WHERE l.name IS NOT NULL AND l.domain IS NULL
    """)
    orgs = cur.fetchall()
    print(f"Matching {len(orgs)} resolved orgs to Salesforce accounts...")
    
    matched = 0
    for lookup_id, org_id, name in orgs:
        # Try exact name match first
        cur.execute(
            'SELECT "domain", "name" FROM "SFAccount" WHERE "name" ILIKE %s LIMIT 1',
            (name.strip(),)
        )
        row = cur.fetchone()
        
        if row:
            sf_domain, sf_name = row
            cur.execute(
                'UPDATE "LinkedInOrgLookup" SET domain = %s WHERE id = %s',
                (sf_domain, lookup_id)
            )
            # Also add to LinkedInOrgMapping
            cur.execute(
                'INSERT INTO "LinkedInOrgMapping" (id, "orgId", "orgName", "vanityUrl") VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET "orgName" = %s, "vanityUrl" = %s',
                (f"li_org:{org_id}", org_id, name, sf_domain, name, sf_domain)
            )
            matched += 1
        else:
            # Try fuzzy match
            cur.execute(
                'SELECT "domain", "name" FROM "SFAccount" WHERE "name" ILIKE %s LIMIT 1',
                (f"%{name.strip()}%",)
            )
            row = cur.fetchone()
            if row:
                sf_domain, sf_name = row
                cur.execute(
                    'UPDATE "LinkedInOrgLookup" SET domain = %s WHERE id = %s',
                    (sf_domain, lookup_id)
                )
                cur.execute(
                    'INSERT INTO "LinkedInOrgMapping" (id, "orgId", "orgName", "vanityUrl") VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET "orgName" = %s, "vanityUrl" = %s',
                    (f"li_org:{org_id}", org_id, name, sf_domain, name, sf_domain)
                )
                matched += 1
    
    conn.commit()
    cur.close()
    conn.close()
    
    print(f"Matched {matched}/{len(orgs)} orgs to Salesforce accounts")
    return matched


def main():
    parser = argparse.ArgumentParser(description="LinkedIn Org Resolver")
    parser.add_argument("--sync", action="store_true", help="Sync impression data and extract li_org: IDs")
    parser.add_argument("--resolve", action="store_true", help="Resolve li_org: IDs to company names")
    parser.add_argument("--match", action="store_true", help="Match resolved orgs to Salesforce")
    parser.add_argument("--all", action="store_true", help="Full pipeline: sync → resolve → match")
    parser.add_argument("--batch-size", type=int, default=20, help="Batch size for API calls (default: 20)")
    parser.add_argument("--org-ids", nargs="+", help="Specific org IDs to resolve")
    args = parser.parse_args()
    
    if not any([args.sync, args.resolve, args.match, args.all, args.org_ids]):
        parser.print_help()
        sys.exit(1)
    
    token = load_token()
    
    if args.sync or args.all:
        print("=== Syncing li_org: IDs from LinkedIn API ===")
        with open(LI_CREDS) as f:
            creds = json.load(f)
        ad_account_id = creds.get("ad_account_id", "505973078")
        org_ids = get_li_org_ids_from_api(token, ad_account_id)
        print(f"Found {len(org_ids)} org IDs from API")
        
        # Also check DB
        db_ids = get_li_org_ids_from_db()
        org_ids = org_ids | db_ids
        print(f"Total unique org IDs: {len(org_ids)}")
        
        # Seed the lookup table
        conn = get_db()
        cur = conn.cursor()
        for oid in org_ids:
            cur.execute(
                'INSERT INTO "LinkedInOrgLookup" (id, "orgId") VALUES (%s, %s) ON CONFLICT (id) DO NOTHING',
                (f"li_org:{oid}", oid)
            )
        conn.commit()
        cur.close()
        conn.close()
        print(f"Seeded {len(org_ids)} org IDs into LinkedInOrgLookup")
    
    if args.resolve or args.all:
        print("=== Resolving li_org: IDs ===")
        if args.org_ids:
            org_ids = set(args.org_ids)
        else:
            org_ids = get_li_org_ids_from_db()
        print(f"Resolving {len(org_ids)} org IDs...")
        resolve_orgs(token, org_ids, batch_size=args.batch_size)
    
    if args.match or args.all:
        print("=== Matching to Salesforce ===")
        match_to_salesforce()
    
    print("Done!")


if __name__ == "__main__":
    main()
