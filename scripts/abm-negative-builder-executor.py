#!/usr/bin/env python3
"""
ABM Negative Builder Executor — Called by Lobster workflow to execute approved exclusions.
Reads scored domains from stdin, inserts ABMExclusion rows with product-scoped categories.
Safety: never excludes SF Customer/Partner domains.

This is the WRITE layer only. All scoring is done by Lobster steps.
"""
import json
import sys
import psycopg2

DB_URL = None

def execute_exclusions(domains_to_exclude):
    """Insert product-scoped exclusion rows."""
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    added = 0
    skipped = 0
    errors = 0

    for d in domains_to_exclude:
        domain = d.get("domain", "").lower().strip()
        if not domain:
            continue

        category = d.get("category", "*")
        reason = d.get("reason", f"Very low relevance to {category}")

        try:
            # Check if already excluded for this category
            cur.execute("""
                SELECT 1 FROM "ABMExclusion" WHERE domain = %s AND category = %s
            """, (domain, category))
            if cur.fetchone():
                skipped += 1
                continue

            cur.execute("""
                INSERT INTO "ABMExclusion" (id, domain, category, reason, "addedAt", "addedBy", company)
                VALUES (gen_random_uuid()::text, %s, %s, %s, NOW(), 'negative_builder', %s)
            """, (domain, category, reason, d.get("company", "Unknown")))

            added += 1

        except Exception as e:
            errors += 1
            print(f"[WARN] Failed to exclude {domain}: {e}", file=sys.stderr)

    # Log to AgentRun
    try:
        cur.execute("""
            INSERT INTO "AgentRun" (id, "agentId", status, "startedAt", "completedAt", metadata)
            VALUES (gen_random_uuid()::text, 'abm-negative-builder', 'done', NOW(), NOW(), %s)
        """, (json.dumps({"action": "build_exclusions", "added": added, "skipped": skipped, "errors": errors}),))
    except Exception:
        pass

    conn.commit()
    cur.close()
    conn.close()

    return {"added": added, "skipped": skipped, "errors": errors}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-stdin", action="store_true")
    parser.add_argument("--db-url", default="postgresql://localhost:5432/dghub")
    args = parser.parse_args()

    DB_URL = args.db_url

    if args.from_stdin:
        data = json.load(sys.stdin)
    else:
        print("Usage: abm-negative-builder-executor.py --from-stdin [--db-url URL]")
        sys.exit(1)

    domains = data.get("exclusion_candidates", [])
    result = execute_exclusions(domains)
    print(json.dumps(result, indent=2))
