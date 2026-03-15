#!/usr/bin/env python3
"""
Resolve LinkedIn organization IDs to company names and domains.

Once Community Management API access is approved, this script will:
1. Extract unique li_org:XXXXX IDs from AdImpression table
2. Call LinkedIn Organization Lookup API for each
3. Store resolved company name + website in LinkedInOrgLookup table
4. Update AdImpression records with resolved domains

Prerequisites:
- Community Management API access (r_organization_admin scope)
- LinkedInOrgLookup table created (see schema below)

Schema for LinkedInOrgLookup table:
CREATE TABLE "LinkedInOrgLookup" (
  id TEXT PRIMARY KEY,              -- li_org:XXXXX
  "orgId" TEXT NOT NULL,            -- XXXXX (numeric ID)
  name TEXT,                        -- Company name from LinkedIn
  domain TEXT,                      -- Website domain from LinkedIn
  vanity TEXT,                      -- LinkedIn vanity name
  raw_response JSONB,               -- Full API response
  resolved_at TIMESTAMP,            -- When we resolved it
  error TEXT                        -- Error message if failed
);
"""

import json
import os
import time
import urllib.request
import urllib.error
import psycopg2
from datetime import datetime, timezone

DB_URL = "postgresql://azizalsinafi@localhost:5432/dghub"
LINKEDIN_CREDS_PATH = os.path.expanduser("~/.config/linkedin-ads/credentials.json")

# Rate limiting - LinkedIn allows ~100 requests per day per app for Organization Lookup
# We have ~9,738 orgs to resolve, so we'll need to batch this over multiple days
# or request higher rate limits
BATCH_SIZE = 100
REQUEST_DELAY_MS = 100  # 100ms between requests = 10 req/sec


def get_linkedin_token():
    """Get LinkedIn access token from credentials file."""
    creds = json.load(open(LINKEDIN_CREDS_PATH))
    return creds.get("access_token")


def fetch_unique_org_ids(cur):
    """Get all unique li_org IDs from AdImpression table."""
    cur.execute("""
        SELECT DISTINCT domain 
        FROM "AdImpression" 
        WHERE domain LIKE 'li_org:%'
        ORDER BY domain
    """)
    return [row[0] for row in cur.fetchall()]


def fetch_already_resolved(cur):
    """Get org IDs that we've already resolved."""
    cur.execute('SELECT id FROM "LinkedInOrgLookup"')
    return {row[0] for row in cur.fetchall()}


def resolve_org(org_id, token):
    """
    Resolve a single LinkedIn organization ID to company name + domain.
    
    Uses the Organization Lookup API from Community Management product.
    Returns dict with: name, domain, vanity, raw_response, error
    """
    numeric_id = org_id.replace("li_org:", "")
    url = f"https://api.linkedin.com/rest/organizations/{numeric_id}"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": "202603",  # March 2026 version
        "Content-Type": "application/json"
    }
    
    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            
            # Extract relevant fields
            name = data.get("name", {}).get("localized", {}).get("en_US") or data.get("localizedName")
            domain = data.get("localizedWebsite") or data.get("website")
            vanity = data.get("vanityName")
            
            return {
                "name": name,
                "domain": domain.lower().strip() if domain else None,
                "vanity": vanity,
                "raw_response": data,
                "error": None
            }
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        return {
            "name": None,
            "domain": None,
            "vanity": None,
            "raw_response": {"error": error_body},
            "error": f"HTTP {e.code}: {error_body[:200]}"
        }
    except Exception as e:
        return {
            "name": None,
            "domain": None,
            "vanity": None,
            "raw_response": {},
            "error": str(e)
        }


def save_resolution(cur, org_id, result):
    """Save resolution result to LinkedInOrgLookup table."""
    cur.execute("""
        INSERT INTO "LinkedInOrgLookup" (id, "orgId", name, domain, vanity, raw_response, resolved_at, error)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            domain = EXCLUDED.domain,
            vanity = EXCLUDED.vanity,
            raw_response = EXCLUDED.raw_response,
            resolved_at = EXCLUDED.resolved_at,
            error = EXCLUDED.error
    """, (
        org_id,
        org_id.replace("li_org:", ""),
        result["name"],
        result["domain"],
        result["vanity"],
        json.dumps(result["raw_response"]),
        datetime.now(timezone.utc),
        result["error"]
    ))


def update_ad_impressions(cur, org_id, domain):
    """Update AdImpression records with resolved domain."""
    cur.execute("""
        UPDATE "AdImpression"
        SET domain = %s
        WHERE domain = %s
    """, (domain, org_id))


def main():
    print("LinkedIn Organization Resolution Script")
    print("=" * 60)
    
    # Check if we have token
    token = get_linkedin_token()
    if not token:
        print("ERROR: No LinkedIn access token found")
        return
    
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    try:
        # Get orgs to resolve
        all_orgs = fetch_unique_org_ids(cur)
        already_done = fetch_already_resolved(cur)
        to_resolve = [org for org in all_orgs if org not in already_done]
        
        print(f"Total unique org IDs: {len(all_orgs)}")
        print(f"Already resolved: {len(already_done)}")
        print(f"Remaining: {len(to_resolve)}")
        
        if not to_resolve:
            print("\nAll orgs already resolved!")
            return
        
        # Process in batches
        batch_num = 0
        resolved_count = 0
        error_count = 0
        
        for i, org_id in enumerate(to_resolve):
            if i > 0 and i % BATCH_SIZE == 0:
                batch_num += 1
                conn.commit()
                print(f"\nBatch {batch_num} complete. Progress: {i}/{len(to_resolve)}")
            
            # Resolve
            result = resolve_org(org_id, token)
            save_resolution(cur, org_id, result)
            
            if result["domain"] and not result["error"]:
                # Update AdImpression records
                update_ad_impressions(cur, org_id, result["domain"])
                resolved_count += 1
                print(f"✓ {org_id} → {result['name']} ({result['domain']})")
            else:
                error_count += 1
                print(f"✗ {org_id}: {result['error'][:50] if result['error'] else 'Unknown error'}")
            
            # Rate limiting
            time.sleep(REQUEST_DELAY_MS / 1000)
        
        conn.commit()
        print(f"\n{'=' * 60}")
        print(f"COMPLETE: {resolved_count} resolved, {error_count} errors")
        print(f"{'=' * 60}")
        
    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
