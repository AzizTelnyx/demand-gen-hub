#!/usr/bin/env python3
"""
ABM Pruner Executor — Called by Lobster workflow to execute approved pruning.
Reads scored accounts from stdin, inserts ABMExclusion rows.
Safety: never prunes accounts with active SF opportunity.

This is the WRITE layer only. All scoring is done by Lobster steps.
"""
import json
import sys
import psycopg2

DB_URL = None

def execute_prune(accounts_to_prune):
    """Insert exclusion rows for pruned accounts."""
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    excluded = 0
    errors = 0

    for a in accounts_to_prune:
        domain = a.get("domain", "").lower().strip()
        if not domain:
            continue

        category = a.get("category", "prune:*")
        reason = a.get("reason", "Low relevance")

        try:
            cur.execute("""
                INSERT INTO "ABMExclusion" (id, domain, category, reason, "addedAt", "addedBy", company)
                VALUES (gen_random_uuid()::text, %s, %s, %s, NOW(), 'abm-pruner', %s)
                ON CONFLICT DO NOTHING
            """, (domain, category, reason, a.get("company", "Unknown")))

            # Log to AgentRun
            cur.execute("""
                INSERT INTO "AgentRun" (id, "agentId", status, "startedAt", "completedAt", metadata)
                VALUES (gen_random_uuid()::text, 'abm-pruner', 'done', NOW(), NOW(), %s)
            """, (json.dumps({"action": "prune", "domain": domain, "category": category, "relevance": a.get("relevanceScore", 0)}),))

            excluded += 1

        except Exception as e:
            errors += 1
            print(f"[WARN] Failed to prune {domain}: {e}", file=sys.stderr)

    conn.commit()
    cur.close()
    conn.close()

    return {"excluded": excluded, "errors": errors}


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
        print("Usage: abm-pruner-executor.py --from-stdin [--db-url URL]")
        sys.exit(1)

    accounts = data.get("prune_candidates", [])
    result = execute_prune(accounts)
    print(json.dumps(result, indent=2))
