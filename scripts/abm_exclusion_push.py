#!/usr/bin/env python3
"""
ABM Exclusion Push to StackAdapt — Full Lifecycle

Creates exclusion audiences per product, pushes unpushed domains,
attaches exclusion audiences to active campaigns, and updates DB.

Usage:
  python3 scripts/abm_exclusion_push.py --dry-run     # Preview what would be pushed
  python3 scripts/abm_exclusion_push.py --product "AI Agent"  # Push one product
  python3 scripts/abm_exclusion_push.py --all          # Push everything
  python3 scripts/abm_exclusion_push.py --attach-only   # Only attach audiences to campaigns (no domain push)
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime

import psycopg2

# Add parent to path for imports
sys.path.insert(0, ".")

DB_URL = "postgresql://localhost:5432/dghub"

# Product → SA campaign filter
PRODUCT_CAMPAIGN_FILTER = {
    "AI Agent": "AI Agent",
    "Voice API": "Voice API",
    "SIP": "SIP",
    "SMS": "SMS",
    "IoT SIM": "IoT SIM",
}

# Exclusion audience name pattern
EXCLUSION_AUDIENCE_PREFIX = "ABM Exclusion -"


def get_db():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    return conn


def get_or_create_exclusion_audience(sa_connector, product, dry_run=False):
    """Find or create the exclusion audience for a product in StackAdapt."""
    audience_name = f"{EXCLUSION_AUDIENCE_PREFIX} {product}"

    # Search existing audiences
    audiences = sa_connector.list_audiences(limit=500)
    for aud in audiences:
        if aud.get("name") == audience_name:
            print(f"  Found existing audience: {audience_name} (ID: {aud['id']})")
            return aud["id"]

    if dry_run:
        print(f"  [DRY RUN] Would create audience: {audience_name}")
        return None

    # Create new audience — SA API requires at least 1 domain
    audience_id = sa_connector.create_abm_audience(audience_name, domains=["placeholder-delete.example.com"])
    print(f"  Created audience: {audience_name} (ID: {audience_id})")
    time.sleep(1)  # Rate limit
    return audience_id


def push_domains_to_audience(sa_connector, audience_id, domains, dry_run=False):
    """Push a batch of domains to a StackAdapt exclusion audience."""
    if dry_run:
        print(f"  [DRY RUN] Would push {len(domains)} domains to audience {audience_id}")
        return len(domains), 0

    # StackAdapt API has batch limits — push in chunks of 500
    BATCH_SIZE = 500
    pushed = 0
    failed = 0

    for i in range(0, len(domains), BATCH_SIZE):
        batch = domains[i : i + BATCH_SIZE]
        try:
            sa_connector.update_audience_with_domains(
                audience_id, batch, action="ADD"
            )
            pushed += len(batch)
            print(f"  Pushed batch {i // BATCH_SIZE + 1}: {len(batch)} domains")
            time.sleep(1)  # Rate limit
        except Exception as e:
            failed += len(batch)
            print(f"  [ERROR] Failed to push batch starting at {i}: {e}")

    return pushed, failed


def attach_exclusion_to_campaigns(
    sa_connector, audience_id, product, dry_run=False
):
    """Attach an exclusion audience to all active SA campaigns for a product."""
    conn = get_db()
    cur = conn.cursor()

    # Find active SA campaigns for this product — need real SA campaign ID
    cur.execute(
        """
        SELECT DISTINCT c."platformId", cs."campaignName", cs."segmentId"
        FROM "ABMCampaignSegment" cs
        JOIN "Campaign" c ON c.id = cs."campaignId"
        WHERE cs."platform" = 'stackadapt'
          AND cs."campaignStatus" = 'live'
          AND cs."parsedProduct" = %s
          AND c."platformId" IS NOT NULL
    """,
        (product,),
    )
    campaigns = cur.fetchall()
    cur.close()
    conn.close()

    if not campaigns:
        print(f"  No active SA campaigns for {product} — skipping attachment")
        return 0, 0

    attached = 0
    already_attached = 0

    for platform_id, campaign_name, segment_id in campaigns:
        # Check if exclusion is already attached
        try:
            existing = sa_connector._read_campaign_audience(campaign_id)
            audience_ids = [a.get("id") or a.get("segmentId") for a in existing]
            if audience_id in audience_ids or str(audience_id) in [
                str(a) for a in audience_ids
            ]:
                already_attached += 1
                continue
        except Exception:
            pass  # If we can't read, try to attach anyway

        if dry_run:
            print(
                f"  [DRY RUN] Would attach exclusion {audience_id} to campaign {campaign_name} (SA ID: {platform_id})"
            )
            attached += 1
            continue

        try:
            # Use add_exclusion_to_campaign with the real SA campaign ID
            sa_connector.add_exclusion_to_campaign(audience_id, int(platform_id))
            attached += 1
            print(
                f"  Attached exclusion {audience_id} to campaign: {campaign_name}"
            )
            time.sleep(1)  # Rate limit
        except Exception as e:
            print(
                f"  [ERROR] Failed to attach to {campaign_name}: {e}"
            )

    return attached, already_attached


def update_db_pushed(conn, domain_ids, audience_id):
    """Mark exclusions as pushed in the database."""
    cur = conn.cursor()
    for domain_id in domain_ids:
        cur.execute(
            """
            UPDATE "ABMExclusion"
            SET "pushedToSa" = true, "saPushedAt" = NOW(), "saAudienceId" = %s
            WHERE id = %s
        """,
            (str(audience_id), domain_id),
        )
    conn.commit()
    cur.close()


def main():
    parser = argparse.ArgumentParser(description="Push ABM exclusions to StackAdapt")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    parser.add_argument("--product", type=str, help="Push only one product's exclusions")
    parser.add_argument("--all", action="store_true", help="Push all unpushed exclusions")
    parser.add_argument("--attach-only", action="store_true", help="Only attach audiences to campaigns (no domain push)")
    parser.add_argument(
        "--db-url", default="postgresql://localhost:5432/dghub", help="Database URL"
    )
    args = parser.parse_args()

    global DB_URL
    DB_URL = args.db_url

    if not args.product and not args.all and not args.attach_only:
        print("Specify --product <name>, --all, or --attach-only")
        sys.exit(1)

    from scripts.stackadapt_write_connector import StackAdaptConnector

    sa = StackAdaptConnector()

    conn = get_db()
    cur = conn.cursor()

    # Get unpushed exclusions grouped by category (product)
    products_to_push = []
    if args.product:
        products_to_push = [args.product]
    else:
        # All products that have unpushed exclusions
        cur.execute(
            """
            SELECT category, count(*)
            FROM "ABMExclusion"
            WHERE "pushedToSa" = false OR "pushedToSa" IS NULL
            GROUP BY category
            ORDER BY count(*) DESC
        """
        )
        products_to_push = [row[0] for row in cur.fetchall() if row[0] != "*"]

    # Handle wildcard (*) exclusions — push to ALL product audiences
    has_wildcard = False
    cur.execute(
        """
        SELECT count(*) FROM "ABMExclusion"
        WHERE category = '*' AND ("pushedToSa" = false OR "pushedToSa" IS NULL)
        """
    )
    wildcard_count = cur.fetchone()[0]
    if wildcard_count > 0:
        has_wildcard = True
        ALL_PRODUCTS = ["AI Agent", "Voice API", "SMS", "SIP", "IoT SIM"]
        for p in ALL_PRODUCTS:
            if p not in products_to_push:
                products_to_push.append(p)

    print(f"Products to push: {products_to_push}")
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print()

    total_pushed = 0
    total_failed = 0
    total_attached = 0

    for product in products_to_push:
        print(f"=== {product} ===")

        # Get unpushed domains for this product
        cur.execute(
            """
            SELECT id, domain, category, reason, company
            FROM "ABMExclusion"
            WHERE (category = %s OR category = '*')
              AND ("pushedToSa" = false OR "pushedToSa" IS NULL)
            ORDER BY domain
        """,
            (product,),
        )
        exclusions = cur.fetchall()

        if not exclusions and not args.attach_only:
            print(f"  No unpushed exclusions for {product}")
            continue

        domains = [e[1] for e in exclusions]
        domain_ids = [e[0] for e in exclusions]
        print(f"  {len(domains)} unpushed domains")

        # Step 1: Get or create exclusion audience
        audience_id = get_or_create_exclusion_audience(sa, product, dry_run=args.dry_run)

        if not args.attach_only and audience_id:
            # Step 2: Push domains to audience
            pushed, failed = push_domains_to_audience(
                sa, audience_id, domains, dry_run=args.dry_run
            )
            total_pushed += pushed
            total_failed += failed

            # Step 3: Update DB
            if not args.dry_run:
                update_db_pushed(conn, domain_ids, audience_id)
                print(f"  Updated {len(domain_ids)} DB rows: pushedToSa=true")

        # Step 4: Attach exclusion audience to campaigns
        if audience_id:
            attached, already = attach_exclusion_to_campaigns(
                sa, audience_id, product, dry_run=args.dry_run
            )
            total_attached += attached
            if already > 0:
                print(f"  {already} campaigns already had this exclusion attached")

        # Also handle wildcard (*) exclusions — push to ALL product audiences
        if product == "AI Agent":
            cur.execute(
                """
                SELECT id, domain FROM "ABMExclusion"
                WHERE category = '*' AND ("pushedToSa" = false OR "pushedToSa" IS NULL)
            """
            )
            wildcard = cur.fetchall()
            if wildcard and audience_id and not args.attach_only:
                wc_domains = [w[1] for w in wildcard]
                wc_ids = [w[0] for w in wildcard]
                pushed, failed = push_domains_to_audience(
                    sa, audience_id, wc_domains, dry_run=args.dry_run
                )
                total_pushed += pushed
                if not args.dry_run:
                    update_db_pushed(conn, wc_ids, audience_id)
                    print(f"  Pushed {len(wc_domains)} wildcard exclusions to AI Agent audience")

        print()

    cur.close()
    conn.close()

    print("=" * 50)
    print(f"Total domains pushed: {total_pushed}")
    print(f"Total failures: {total_failed}")
    print(f"Total campaign attachments: {total_attached}")
    if args.dry_run:
        print("(DRY RUN — no changes made)")

    return {
        "pushed": total_pushed,
        "failed": total_failed,
        "attached": total_attached,
        "dry_run": args.dry_run,
    }


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2))
