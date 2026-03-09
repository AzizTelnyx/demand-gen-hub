#!/usr/bin/env python3
"""Seed WorkItem table from existing Recommendations and AgentRun findings."""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib.db import get_conn, _cuid
from datetime import datetime

def main():
    conn = get_conn()
    now = datetime.utcnow()
    cur = conn.cursor()

    # 1. Create work items from Recommendations
    cur.execute('SELECT id, type, severity, action, target, rationale, status, "agentRunId" FROM "Recommendation"')
    recs = cur.fetchall()
    print(f"Found {len(recs)} recommendations")

    priority_map = {"high": "p0", "medium": "p1", "low": "p2"}
    count = 0

    for rec in recs:
        rec_id, rtype, severity, action, target, rationale, status, agent_run_id = rec
        # Skip if already applied
        if status == "applied":
            continue

        item_id = _cuid()
        title = action[:200] if action else f"{rtype} recommendation"
        desc = f"**Target:** {target or 'N/A'}\n\n**Rationale:** {rationale or 'N/A'}"
        priority = priority_map.get(severity, "p1")
        tags = [rtype, "recommendation"]
        platform = "google-ads" if "negative" in (rtype or "") else None

        cur.execute(
            """INSERT INTO "WorkItem" (id, title, description, type, status, priority, platform, source, "sourceRef", tags, "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING""",
            (item_id, title, desc, "optimization", "backlog", priority, platform, "agent", f"rec:{rec_id}", tags, now, now),
        )
        count += 1

    # 2. Create work items from AgentRun findings (runs with findings but no recs)
    cur.execute("""SELECT ar.id, ar."agentId", ar."findingsCount", ar.output, a.name
                   FROM "AgentRun" ar JOIN "Agent" a ON ar."agentId" = a.id
                   WHERE ar."findingsCount" > 0 AND ar."recsCount" = 0""")
    runs = cur.fetchall()
    print(f"Found {len(runs)} agent runs with findings (no recs)")

    for run in runs:
        run_id, agent_id, findings_count, output, agent_name = run
        item_id = _cuid()
        title = f"{agent_name}: {findings_count} findings to review"
        desc = f"Agent run produced {findings_count} findings. Review output for actionable items.\n\nAgent: {agent_name}"

        cur.execute(
            """INSERT INTO "WorkItem" (id, title, description, type, status, priority, platform, source, "sourceRef", tags, "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING""",
            (item_id, title, desc, "review", "backlog", "p1", None, "agent", f"run:{run_id}", ["agent-findings"], now, now),
        )
        count += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"Created {count} work items")

if __name__ == "__main__":
    main()
