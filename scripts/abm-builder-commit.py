#!/usr/bin/env python3
"""
ABM Builder Step 6: Commit
Upserts validated accounts to ABMAccount + ABMListMember.
Creates ABMList if it doesn't exist.

Input: --accounts-json '[...validated accounts...]' --list-name "AI Agent APAC" --criteria-json '{...}'
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from abm_builder_lib import get_db, salesforce_should_skip, PRODUCT_MAP


def main():
    parser = argparse.ArgumentParser(description="ABM Builder: Commit accounts to DB")
    parser.add_argument("--input-file", help="Read JSON from file instead of --arg")
    parser.add_argument("--accounts-json", required=True, help="JSON array of validated accounts")
    parser.add_argument("--list-name", required=True, help="Name for the ABM list")
    parser.add_argument("--criteria-json", required=True, help="JSON criteria from interpret step")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    try:
        accounts = json.loads(args.accounts_json)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid accounts JSON"}))
        sys.exit(1)

    try:
        criteria = json.loads(args.criteria_json)
    except json.JSONDecodeError:
        criteria = {}

    conn = get_db()
    cur = conn.cursor()

    # Create list
    list_id = None
    if not args.dry_run:
        cur.execute("""
            INSERT INTO "ABMList" (id, name, "listType", description, source, count, "createdBy", "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), %s, %s, %s, 'builder-research', 0, 'abm-builder', NOW(), NOW())
            RETURNING id
        """, (
            args.list_name,
            criteria.get("listType", "use-case"),
            criteria.get("description", ""),
        ))
        list_id = cur.fetchone()[0]
        print(f"Created list: {args.list_name} ({list_id})", file=sys.stderr)
    else:
        print(f"[DRY RUN] Would create list: {args.list_name}", file=sys.stderr)

    # Map product back to builder format
    reverse_map = {v: k for k, v in PRODUCT_MAP.items()}

    committed = 0
    skipped = 0
    duplicates = 0

    for account in accounts:
        domain = account.get("domain", "")
        name = account.get("name", "")
        scored_product = account.get("scored_product", "")
        product_fit = reverse_map.get(scored_product, scored_product)
        score = account.get("score", 0)

        if not domain:
            skipped += 1
            continue

        # Check for existing account
        cur.execute('SELECT id FROM "ABMAccount" WHERE domain = %s', (domain,))
        existing = cur.fetchone()

        if existing:
            account_id = existing[0]
            # Check if already in this list
            if list_id:
                cur.execute(
                    'SELECT id FROM "ABMListMember" WHERE "listId" = %s AND "accountId" = %s',
                    (list_id, account_id)
                )
                if cur.fetchone():
                    duplicates += 1
                    continue

            # Update productFit if we have a better score
            if not args.dry_run and score > 0:
                cur.execute("""
                    UPDATE "ABMAccount" SET "productFit" = COALESCE("productFit", %s),
                    "clearbitDesc" = COALESCE("clearbitDesc", %s),
                    "updatedAt" = NOW() WHERE id = %s AND ("productFit" IS NULL OR "productFit" = '')
                """, (product_fit, account.get("description", "")[:500], account_id))
        else:
            # Insert new account
            if not args.dry_run:
                cur.execute("""
                    INSERT INTO "ABMAccount" (id, domain, company, "productFit", country, region,
                    "clearbitDesc", "clearbitTags", "clearbitTech", industry, source, status, "updatedAt")
                    VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, 'builder-research', 'identified', NOW())
                    RETURNING id
                """, (
                    domain, name, product_fit,
                    account.get("country"),
                    criteria.get("regions", [None])[0],
                    account.get("description", "")[:500],
                    json.dumps(account.get("tags", [])),
                    json.dumps(account.get("tech", [])),
                    account.get("industry", ""),
                ))
                account_id = cur.fetchone()[0]
            else:
                print(f"  [DRY RUN] Would add: {name} ({domain}) — {product_fit} score={score}", file=sys.stderr)

        # Add to list
        if not args.dry_run and list_id and account_id:
            try:
                cur.execute("""
                    INSERT INTO "ABMListMember" (id, "listId", "accountId", "addedBy", reason, status, "addedAt")
                    VALUES (gen_random_uuid(), %s, %s, 'builder-research', %s, 'active', NOW())
                """, (list_id, account_id, f"score={score} product={product_fit}"))
                committed += 1
            except psycopg2.errors.UniqueViolation:
                duplicates += 1
                conn.rollback()
                continue

    # Update list count
    if not args.dry_run and list_id:
        cur.execute('SELECT COUNT(*) FROM "ABMListMember" WHERE "listId" = %s', (list_id,))
        count = cur.fetchone()[0]
        cur.execute('UPDATE "ABMList" SET count = %s, "updatedAt" = NOW() WHERE id = %s', (count, list_id))

    if not args.dry_run:
        conn.commit()

    print(f"\nCommitted: {committed} | Duplicates: {duplicates} | Skipped: {skipped}", file=sys.stderr)
    result = {
        "listId": str(list_id) if list_id else None,
        "listName": args.list_name,
        "committed": committed,
        "duplicates": duplicates,
        "skipped": skipped,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
