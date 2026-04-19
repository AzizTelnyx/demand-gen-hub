#!/usr/bin/env python3
"""
ABM Expander Executor — Called by Lobster workflow to execute approved additions.
Reads scored candidates from stdin, inserts ABMAccount + ABMListMember rows,
and/or uploads to StackAdapt via the write connector.

This is the WRITE layer only. All scoring and research is done by Lobster steps.
"""
import json
import sys
import psycopg2
from datetime import datetime

DB_URL = None

def get_conn():
    return psycopg2.connect(DB_URL)

def execute_additions(candidates):
    """Insert approved candidates into DB and optionally StackAdapt."""
    conn = get_conn()
    cur = conn.cursor()
    added = 0
    skipped = 0
    errors = 0

    for c in candidates:
        domain = c.get("domain", "").lower().strip()
        if not domain:
            continue

        try:
            # Insert ABMAccount (upsert by domain)
            cur.execute("""
                INSERT INTO "ABMAccount" (id, domain, company, "clearbitDesc", "clearbitTags",
                    "clearbitTech", "employeeCount", industry, "enrichmentSource", "lastEnrichedAt", "createdAt")
                VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, 'expander', NOW(), NOW())
                ON CONFLICT (domain) DO UPDATE SET
                    "clearbitDesc" = COALESCE(EXCLUDED."clearbitDesc", "ABMAccount"."clearbitDesc"),
                    "clearbitTags" = COALESCE(EXCLUDED."clearbitTags", "ABMAccount"."clearbitTags"),
                    "lastEnrichedAt" = NOW()
            """, (
                domain,
                c.get("company", "Unknown"),
                c.get("description"),
                json.dumps(c.get("tags", [])),
                json.dumps(c.get("tech", [])),
                c.get("employees"),
                c.get("industry"),
            ))

            # Insert ABMListMember if segment specified
            if c.get("segmentId"):
                cur.execute("""
                    INSERT INTO "ABMListMember" (id, "listId", "accountId", "addedBy", "addedAt", "relevanceScore", "discoverySource")
                    SELECT gen_random_uuid()::text, %s, a.id, 'expander', NOW(), %s, %s
                    FROM "ABMAccount" a WHERE a.domain = %s
                    ON CONFLICT DO NOTHING
                """, (
                    c["segmentId"],
                    c.get("relevanceScore", 0),
                    c.get("discoverySource", "ai_research"),
                    domain,
                ))

            # Log to AgentRun
            cur.execute("""
                INSERT INTO "AgentRun" (id, "agentId", status, "startedAt", "completedAt", metadata)
                VALUES (gen_random_uuid()::text, 'abm-expander', 'done', NOW(), NOW(), %s)
            """, (json.dumps({"action": "add_domain", "domain": domain, "score": c.get("relevanceScore")}),))

            added += 1

        except Exception as e:
            errors += 1
            print(f"[WARN] Failed to add {domain}: {e}", file=sys.stderr)

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
        print("Usage: abm-expander-executor.py --from-stdin [--db-url URL]")
        sys.exit(1)

    candidates = data.get("scored_candidates", data.get("candidates", []))
    result = execute_additions(candidates)
    print(json.dumps(result, indent=2))
