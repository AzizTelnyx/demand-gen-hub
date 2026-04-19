#!/usr/bin/env python3
"""
ABM → StackAdapt Push Script
=============================
Pushes DB changes to live StackAdapt campaigns via the write connector.

Called by Lobster workflows AFTER the agent execute step.
Reads from ABMExclusion / ABMAccount / ABMCampaignSegment tables
and applies changes to StackAdapt audiences and campaigns.

Usage:
  python3 scripts/abm_push_to_stackadapt.py --pruner
  python3 scripts/abm_push_to_stackadapt.py --expander
  python3 scripts/abm_push_to_stackadapt.py --negative-builder
  python3 scripts/abm_push_to_stackadapt.py --all
  python3 scripts/abm_push_to_stackadapt.py --dry-run --pruner
"""

import argparse
import json
import os
import sys
import time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from stackadapt_write_connector import StackAdaptConnector

DB_URL = "postgresql://localhost:5432/dghub"
PSQL = "/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"

def get_db():
    import psycopg2
    return psycopg2.connect(DB_URL)


def push_pruner(dry_run=False):
    """
    Push pruner results to StackAdapt.
    
    Logic:
    1. Find ABMExclusion rows added by pruner that haven't been pushed yet
    2. For each excluded domain, remove it from the relevant StackAdapt audience
    3. If the domain has relevance=0 and spend>0, also detach the audience from campaign
    """
    import psycopg2
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    sa = StackAdaptConnector()
    
    # Find pruner exclusions not yet pushed to StackAdapt
    cur.execute("""
        SELECT e.id, e.domain, e.category, e.reason, e.notes, e."addedBy"
        FROM "ABMExclusion" e
        WHERE e."addedBy" = 'pruner'
          AND (e."pushedToSa" IS NULL OR e."pushedToSa" = false)
        ORDER BY e."addedAt" DESC
    """)
    exclusions = cur.fetchall()
    
    if not exclusions:
        print("No pruner exclusions to push to StackAdapt")
        return {"pushed": 0, "failed": 0, "skipped": 0}
    
    print(f"Found {len(exclusions)} pruner exclusions to push")
    
    # Group by product (category) to find the right audience
    by_product = defaultdict(list)
    for exc in exclusions:
        exc_id, domain, category, reason, notes, added_by = exc
        by_product[category].append({"id": exc_id, "domain": domain, "category": category})
    
    results = {"pushed": 0, "failed": 0, "skipped": 0}
    
    for category, items in by_product.items():
        print(f"\n--- Product: {category} ({len(items)} domains) ---")
        
        # Find StackAdapt campaign segments for this product
        product_name = category.split("/")[0] if "/" in category else category
        cur.execute("""
            SELECT DISTINCT cs."segmentId", cs."campaignId", cs."segmentName", 
                   cs."campaignName", cs."campaignStatus"
            FROM "ABMCampaignSegment" cs
            WHERE cs."parsedProduct" = %s
              AND cs."platform" = 'stackadapt'
              AND cs."campaignStatus" = 'enabled'
        """, (product_name,))
        segments = cur.fetchall()
        
        if not segments:
            print(f"  No active StackAdapt segments for {product_name} — skipping")
            results["skipped"] += len(items)
            continue
        
        # Group by segment (audience) — each audience may need domain removals
        by_segment = defaultdict(list)
        for seg in segments:
            segment_id, campaign_id, segment_name, campaign_name, status = seg
            by_segment[segment_id].append({
                "segment_id": segment_id,
                "campaign_id": campaign_id,
                "segment_name": segment_name,
                "campaign_name": campaign_name,
            })
        
        domains_to_remove = [item["domain"] for item in items]
        
        for segment_id, campaigns in by_segment.items():
            print(f"  Audience {segment_id} ({campaigns[0]['segment_name']}) — removing {len(domains_to_remove)} domains")
            
            if not dry_run:
                try:
                    # Remove domains from the audience
                    sa.update_audience_with_domains(segment_id, domains_to_remove, action="REMOVE")
                    print(f"    ✅ Removed {len(domains_to_remove)} domains from audience {segment_id}")
                except Exception as e:
                    print(f"    ❌ Failed to update audience: {e}")
                    results["failed"] += len(items)
                    continue
                
                # Mark exclusions as pushed
                for item in items:
                    cur.execute(
                        'UPDATE "ABMExclusion" SET "pushedToSa" = true, "saPushedAt" = NOW() WHERE id = %s',
                        (item["id"],)
                    )
                
                results["pushed"] += len(items)
                conn.commit()
            else:
                print(f"    🔍 DRY RUN: Would remove {len(domains_to_remove)} domains from audience {segment_id}")
                results["pushed"] += len(items)
    
    cur.close()
    conn.close()
    print(f"\nPruner push complete: pushed={results['pushed']}, failed={results['failed']}, skipped={results['skipped']}")
    return results


def push_expander(dry_run=False):
    """
    Push expander results to StackAdapt.
    
    Logic:
    1. Find ABMAccount rows added by expander that haven't been pushed yet
    2. For each account, add the domain to the relevant StackAdapt audience
    3. If the audience isn't attached to the campaign, attach it
    """
    import psycopg2
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    sa = StackAdaptConnector()
    
    # Find expander accounts not yet pushed to StackAdapt
    # Join via ABMListMember.accountId → ABMAccount.id
    cur.execute("""
        SELECT a.id, a.domain, a.company, l."name" as list_name, lm."listId"
        FROM "ABMAccount" a
        JOIN "ABMListMember" lm ON a.id = lm."accountId"
        JOIN "ABMList" l ON lm."listId" = l.id
        WHERE a."source" = 'expander'
          AND (a."pushedToSa" IS NULL OR a."pushedToSa" = false)
        ORDER BY a."createdAt" DESC
    """)
    accounts = cur.fetchall()
    
    if not accounts:
        print("No expander accounts to push to StackAdapt")
        return {"pushed": 0, "failed": 0, "skipped": 0}
    
    print(f"Found {len(accounts)} expander accounts to push")
    
    # Group by product to find the right audience
    by_product = defaultdict(list)
    for acct in accounts:
        acct_id, domain, company, list_name, list_id = acct
        # Parse product from list name (e.g. "AI Agent - ABM" → "AI Agent")
        product = list_name.split(" - ")[0] if list_name else "Unknown"
        by_product[(product, "")].append({
            "acct_id": acct_id, "domain": domain, "company": company, "list_id": list_id
        })
    
    results = {"pushed": 0, "failed": 0, "skipped": 0}
    
    for (product, variant), items in by_product.items():
        print(f"\n--- Product: {product}/{variant or 'generic'} ({len(items)} domains) ---")
        
        # Find StackAdapt segments for this product
        cur.execute("""
            SELECT DISTINCT cs."segmentId", cs."campaignId", cs."segmentName",
                   cs."campaignName", cs."campaignStatus"
            FROM "ABMCampaignSegment" cs
            WHERE cs."parsedProduct" = %s
              AND (cs."parsedVariant" = %s OR cs."parsedVariant" IS NULL)
              AND cs."platform" = 'stackadapt'
              AND cs."campaignStatus" = 'enabled'
        """, (product, variant if variant else None))
        segments = cur.fetchall()
        
        if not segments:
            print(f"  No active StackAdapt segments for {product}/{variant or 'generic'} — skipping")
            results["skipped"] += len(items)
            continue
        
        domains_to_add = [item["domain"] for item in items]
        
        # Group by segment (audience)
        by_segment = defaultdict(list)
        for seg in segments:
            segment_id, campaign_id, segment_name, campaign_name, status = seg
            by_segment[segment_id].append({
                "segment_id": segment_id,
                "campaign_id": campaign_id,
                "segment_name": segment_name,
                "campaign_name": campaign_name,
            })
        
        for segment_id, campaigns in by_segment.items():
            print(f"  Audience {segment_id} ({campaigns[0]['segment_name']}) — adding {len(domains_to_add)} domains")
            
            if not dry_run:
                try:
                    # Add domains to the audience
                    sa.update_audience_with_domains(segment_id, domains_to_add, action="ADD")
                    print(f"    ✅ Added {len(domains_to_add)} domains to audience {segment_id}")
                except Exception as e:
                    print(f"    ❌ Failed to update audience: {e}")
                    results["failed"] += len(items)
                    continue
                
                # Mark accounts as pushed
                for item in items:
                    cur.execute(
                        'UPDATE "ABMAccount" SET "pushedToSa" = true, "saPushedAt" = NOW() WHERE id = %s',
                        (item["acct_id"],)
                    )
                
                results["pushed"] += len(items)
                conn.commit()
            else:
                print(f"    🔍 DRY RUN: Would add {len(domains_to_add)} domains to audience {segment_id}")
                results["pushed"] += len(items)
    
    cur.close()
    conn.close()
    print(f"\nExpander push complete: pushed={results['pushed']}, failed={results['failed']}, skipped={results['skipped']}")
    return results


def push_negative_builder(dry_run=False):
    """
    Push negative builder results to StackAdapt.
    
    Logic:
    1. Find ABMExclusion rows added by negative_builder that haven't been pushed yet
    2. Group by product
    3. Create/update a single exclusion audience per product
    4. Attach exclusion audience to all active campaigns for that product
    """
    import psycopg2
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    sa = StackAdaptConnector()
    
    # Find negative builder exclusions not yet pushed
    cur.execute("""
        SELECT e.id, e.domain, e.category, e.reason
        FROM "ABMExclusion" e
        WHERE e."addedBy" = 'negative_builder'
          AND (e."pushedToSa" IS NULL OR e."pushedToSa" = false)
        ORDER BY e.category, e."addedAt" DESC
    """)
    exclusions = cur.fetchall()
    
    if not exclusions:
        print("No negative builder exclusions to push to StackAdapt")
        return {"pushed": 0, "failed": 0, "skipped": 0}
    
    print(f"Found {len(exclusions)} negative builder exclusions to push")
    
    # Group by product
    by_product = defaultdict(list)
    for exc in exclusions:
        exc_id, domain, category, reason = exc
        product = category.split("/")[0] if "/" in category else category
        by_product[product].append({"id": exc_id, "domain": domain})
    
    results = {"pushed": 0, "failed": 0, "skipped": 0}
    
    for product, items in by_product.items():
        print(f"\n--- Product: {product} ({len(items)} exclusion domains) ---")
        
        # Check if we already have an exclusion audience for this product
        exclusion_audience_name = f"ABM Exclusions - {product}"
        existing_audiences = sa.list_audiences()
        matching = [a for a in existing_audiences if a.get("name") == exclusion_audience_name]
        
        domains = [item["domain"] for item in items]
        
        if not dry_run:
            try:
                if matching:
                    # Update existing exclusion audience with new domains
                    audience_id = matching[0]["id"]
                    sa.update_audience_with_domains(audience_id, domains, action="ADD")
                    print(f"  ✅ Updated exclusion audience {audience_id} with {len(domains)} domains")
                else:
                    # Create new exclusion audience
                    audience_id = sa.create_abm_audience(exclusion_audience_name, domains=domains)
                    print(f"  ✅ Created exclusion audience {audience_id} with {len(domains)} domains")
                
                # Attach exclusion audience to all active campaigns for this product
                cur.execute("""
                    SELECT DISTINCT cs."campaignId", cs."campaignName"
                    FROM "ABMCampaignSegment" cs
                    WHERE cs."parsedProduct" = %s
                      AND cs."platform" = 'stackadapt'
                      AND cs."campaignStatus" = 'enabled'
                """, (product,))
                campaigns = cur.fetchall()
                
                for camp in campaigns:
                    campaign_id, campaign_name = camp
                    try:
                        sa.add_exclusion_to_campaign(audience_id, int(campaign_id))
                        print(f"    ✅ Added exclusion to campaign {campaign_name}")
                    except Exception as e:
                        print(f"    ❌ Failed to add exclusion to campaign {campaign_name}: {e}")
                
                # Mark exclusions as pushed
                for item in items:
                    cur.execute(
                        'UPDATE "ABMExclusion" SET "pushedToSa" = true, "saPushedAt" = NOW() WHERE id = %s',
                        (item["id"],)
                    )
                
                results["pushed"] += len(items)
                conn.commit()
            except Exception as e:
                print(f"  ❌ Failed: {e}")
                results["failed"] += len(items)
        else:
            print(f"  🔍 DRY RUN: Would create/update exclusion audience with {len(domains)} domains and attach to campaigns")
            results["pushed"] += len(items)
    
    cur.close()
    conn.close()
    print(f"\nNegative builder push complete: pushed={results['pushed']}, failed={results['failed']}, skipped={results['skipped']}")
    return results


def main():
    parser = argparse.ArgumentParser(description="Push ABM changes to StackAdapt")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    parser.add_argument("--pruner", action="store_true", help="Push pruner exclusions")
    parser.add_argument("--expander", action="store_true", help="Push expander additions")
    parser.add_argument("--negative-builder", action="store_true", help="Push negative builder exclusions")
    parser.add_argument("--all", action="store_true", help="Push all agent changes")
    args = parser.parse_args()
    
    if not any([args.pruner, args.expander, args.negative_builder, args.all]):
        parser.print_help()
        return
    
    results = {}
    
    if args.pruner or args.all:
        results["pruner"] = push_pruner(dry_run=args.dry_run)
    
    if args.expander or args.all:
        results["expander"] = push_expander(dry_run=args.dry_run)
    
    if args.negative_builder or args.all:
        results["negative_builder"] = push_negative_builder(dry_run=args.dry_run)
    
    print(f"\n{'='*60}")
    print(f"📊 PUSH SUMMARY")
    for agent, result in results.items():
        print(f"  {agent}: pushed={result['pushed']}, failed={result['failed']}, skipped={result['skipped']}")
    
    return results


if __name__ == "__main__":
    main()
