#!/usr/bin/env python3
"""Seed ABM tables from SFOpportunity data."""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib.db import get_conn, _cuid
from datetime import datetime

def main():
    conn = get_conn()
    now = datetime.utcnow()
    cur = conn.cursor()

    # 1. Create default ABM list
    list_id = _cuid()
    cur.execute(
        """INSERT INTO "ABMList" (id, name, description, "listType", source, status, "createdAt", "updatedAt", count)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (list_id, "Q1 2026 Target Accounts", "Top accounts by pipeline value from Salesforce opportunities", "vertical", "salesforce", "active", now, now, 0),
    )

    # 2. Get top accounts by total pipeline value
    cur.execute("""
        SELECT "accountName", "accountDomain", "accountSfId",
               SUM(amount) as total_pipeline,
               COUNT(*) as opp_count,
               BOOL_OR("isWon") as has_won
        FROM "SFOpportunity"
        WHERE "accountName" IS NOT NULL AND "accountName" != ''
        GROUP BY "accountName", "accountDomain", "accountSfId"
        ORDER BY total_pipeline DESC
        LIMIT 50
    """)
    accounts = cur.fetchall()
    print(f"Found {len(accounts)} unique accounts")

    member_count = 0
    for acct in accounts:
        name, domain, sf_id, pipeline, opp_count, has_won = acct
        account_id = _cuid()

        # Determine tier based on pipeline value
        if pipeline >= 200000:
            tier = "tier-1"
        elif pipeline >= 50000:
            tier = "tier-2"
        else:
            tier = "tier-3"

        status = "customer" if has_won else "identified"

        cur.execute(
            """INSERT INTO "ABMAccount" (id, company, domain, tier, status, source, "sfAccountId", "inPipeline", notes, "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (company, domain) DO UPDATE SET tier = EXCLUDED.tier, "updatedAt" = EXCLUDED."updatedAt"
            RETURNING id""",
            (account_id, name, domain, tier, status, "salesforce", sf_id, True,
             f"Pipeline: ${pipeline:,.0f} across {opp_count} opportunities", now, now),
        )
        actual_id = cur.fetchone()[0]

        # 3. Link to list
        member_id = _cuid()
        cur.execute(
            """INSERT INTO "ABMListMember" (id, "listId", "accountId", "addedBy", reason, status, "addedAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT ("listId", "accountId") DO NOTHING""",
            (member_id, list_id, actual_id, "system", f"Top pipeline account (${pipeline:,.0f})", "active", now),
        )
        member_count += 1

    # Update list count
    cur.execute('UPDATE "ABMList" SET count = %s WHERE id = %s', (member_count, list_id))

    conn.commit()
    cur.close()
    conn.close()
    print(f"Created 1 ABM list with {member_count} accounts")

if __name__ == "__main__":
    main()
