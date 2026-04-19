#!/usr/bin/env python3
"""
Batch Clearbit enrichment for StackAdapt domains.

Enriches all unique domains from AdImpression (StackAdapt) with Clearbit
Company API data: tags (industry), description, tech, employees, revenue.

Rate limit: 600 requests/min on Clearbit free tier.
Run: python3 scripts/abm-clearbit-batch.py [--dry-run] [--limit N]
"""

import json
import os
import sys
import time
import argparse
import requests
import psycopg2
from datetime import datetime, timezone

DB_URL = "postgresql://localhost:5432/dghub"
CLEARBIT_API_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"
CLEARBIT_URL = "https://company.clearbit.com/v2/companies/find"
BATCH_SIZE = 50
RATE_LIMIT_PER_SEC = 10  # 600/min = 10/sec


def get_db():
    return psycopg2.connect(DB_URL)


def enrich_domain(domain):
    """Call Clearbit Company API for a single domain. Returns dict or None."""
    try:
        resp = requests.get(
            CLEARBIT_URL,
            params={"domain": domain},
            headers={"Authorization": f"Bearer {CLEARBIT_API_KEY}"},
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json()
        elif resp.status_code == 202:
            return None  # Pending — Clearbit still fetching
        else:
            return None
    except Exception:
        return None


def upsert_account(cur, domain, clearbit_data):
    """Upsert an ABMAccount with Clearbit enrichment data.
    
    Since the unique constraint is (company, domain), we first try to update
    existing rows by domain, then insert if none exist.
    """
    if not clearbit_data:
        return

    tags = clearbit_data.get("tags", [])
    tech = clearbit_data.get("tech", [])
    desc = clearbit_data.get("description", "")
    metrics = clearbit_data.get("metrics", {})
    employees = metrics.get("employees")
    revenue_range = metrics.get("estimatedAnnualRevenue")
    
    industry = tags[0] if tags else None
    name = clearbit_data.get("name") or domain.split(".")[0]
    vertical = tags[0] if tags else None
    
    country = clearbit_data.get("geo", {}).get("country")
    region = None
    if country:
        region_map = {
            "US": "AMER", "CA": "AMER", "MX": "AMER", "BR": "AMER",
            "GB": "EMEA", "DE": "EMEA", "FR": "EMEA", "NL": "EMEA", "SE": "EMEA",
            "AU": "APAC", "JP": "APAC", "SG": "APAC", "IN": "APAC", "KR": "APAC",
        }
        region = region_map.get(country)
    
    now = datetime.now(timezone.utc)
    tags_json = json.dumps(tags)
    tech_list = [t for t in tech] if isinstance(tech, list) else []
    tech_json = json.dumps(tech_list)
    
    # First: update existing rows with this domain
    cur.execute("""
        UPDATE "ABMAccount" SET
            "industry" = %s,
            "clearbitTags" = %s,
            "clearbitTech" = %s,
            "clearbitDesc" = %s,
            "employeeCount" = %s,
            "annualRevenue" = %s,
            "lastEnrichedAt" = %s,
            "enrichmentSource" = 'clearbit',
            "updatedAt" = %s
        WHERE domain = %s
    """, (industry, tags_json, tech_json, desc, employees, revenue_range,
          now, now, domain))
    
    updated = cur.rowcount
    
    # If no rows updated, insert a new one
    if updated == 0:
        import uuid
        cur.execute("""
            INSERT INTO "ABMAccount" (id, domain, company, vertical, region, country,
                "companySize", "industry", "clearbitTags", "clearbitTech", "clearbitDesc",
                "employeeCount", "annualRevenue", "lastEnrichedAt", "enrichmentSource",
                "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (str(uuid.uuid4()), domain, name, vertical, region, country,
              str(employees) if employees else None,
              industry, tags_json, tech_json, desc,
              employees, revenue_range,
              now, "clearbit", now, now))


def main():
    parser = argparse.ArgumentParser(description="Batch Clearbit enrichment")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Max domains to process (0=all)")
    parser.add_argument("--offset", type=int, default=0, help="Skip first N domains")
    args = parser.parse_args()
    
    conn = get_db()
    cur = conn.cursor()
    
    # Get domains that need enrichment
    cur.execute("""
        SELECT DISTINCT i.domain
        FROM "AdImpression" i
        LEFT JOIN "ABMAccount" a ON i.domain = a.domain
        WHERE i.platform = 'stackadapt'
          AND i.domain != '__campaign__'
          AND (a.domain IS NULL OR a."lastEnrichedAt" IS NULL)
        ORDER BY i.domain
    """)
    domains = [row[0] for row in cur.fetchall()]
    
    if args.offset:
        domains = domains[args.offset:]
    if args.limit:
        domains = domains[:args.limit]
    
    print(f"🔍 Enriching {len(domains)} domains via Clearbit")
    print(f"   Dry run: {args.dry_run}")
    
    enriched = 0
    failed = 0
    pending = 0
    
    for i, domain in enumerate(domains):
        if i > 0 and i % 50 == 0:
            print(f"  Progress: {i}/{len(domains)} ({enriched} enriched, {failed} failed, {pending} pending)")
            if not args.dry_run:
                conn.commit()
        
        # Rate limit
        if i > 0 and i % RATE_LIMIT_PER_SEC == 0:
            time.sleep(1)
        
        data = enrich_domain(domain)
        
        if data is None:
            # Could be 202 (pending) or error — check if it's a real domain
            pending += 1
            continue
        
        if not args.dry_run:
            try:
                upsert_account(cur, domain, data)
                enriched += 1
            except Exception as e:
                print(f"  DB error for {domain}: {e}")
                failed += 1
                conn.rollback()
        else:
            enriched += 1
    
    if not args.dry_run:
        conn.commit()
    
    print(f"\n✅ Done: {enriched} enriched, {failed} failed, {pending} pending/cleared")
    
    # Quick stats
    cur.execute("""
        SELECT count(*) as total_enriched,
               count(CASE WHEN "clearbitDesc" IS NOT NULL AND "clearbitDesc" != '' THEN 1 END) as has_desc,
               count(CASE WHEN "clearbitTags" != '[]'::jsonb THEN 1 END) as has_tags,
               count(CASE WHEN "employeeCount" IS NOT NULL THEN 1 END) as has_employees
        FROM "ABMAccount" WHERE "lastEnrichedAt" IS NOT NULL
    """)
    row = cur.fetchone()
    print(f"   Total enriched accounts: {row[0]}")
    print(f"   With description: {row[1]}")
    print(f"   With tags: {row[2]}")
    print(f"   With employee count: {row[3]}")
    
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
