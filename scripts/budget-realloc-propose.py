#!/usr/bin/env python3
"""
Budget Reallocation Proposer
==============================
Reads today's pacing agent output, creates concrete per-campaign Recommendation
rows in DB with status='pending', and outputs structured JSON for Lobster pipeline.

Usage:
  python scripts/budget-realloc-propose.py              # from today's pacing log
  python scripts/budget-realloc-propose.py --date 2026-03-09
  python scripts/budget-realloc-propose.py --json       # JSON to stdout (for Lobster)
"""

import json
import os
import sys
import argparse
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

DB_URL = os.environ.get("POSTGRES_URL_NON_POOLING", "postgresql://localhost:5432/dghub")
if "localhost" in DB_URL or "127.0.0.1" in DB_URL:
    DB_URL = DB_URL.split("?")[0]

LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "logs", "budget-pacing")
GUARDRAIL_MAX_CHANGE = 500.0
BUDGET_FLOOR = 10.0


def load_pacing_log(date_str: str) -> dict | None:
    path = os.path.join(LOG_DIR, f"{date_str}.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def load_guardrails(cur) -> dict:
    guardrails = {
        "budget_floor_min": BUDGET_FLOOR,
        "budget_change_max_no_approval": GUARDRAIL_MAX_CHANGE,
        "cross_product_realloc": False,
        "monthly_budget_cap": 140000,
    }
    try:
        cur.execute('SELECT key, value FROM "AgentGuardrail"')
        for key, value in cur.fetchall():
            if key in guardrails:
                if key == "cross_product_realloc":
                    guardrails[key] = value.lower() in ("true", "1")
                else:
                    guardrails[key] = float(value)
    except Exception:
        pass
    return guardrails


def resolve_campaigns(cur, names: list[str]) -> dict:
    """Map campaign names to DB records."""
    if not names:
        return {}
    placeholders = ",".join(["%s"] * len(names))
    cur.execute(f'SELECT id, name, "platformId", platform, "parsedProduct" FROM "Campaign" WHERE name IN ({placeholders})', names)
    return {row[1]: {"id": row[0], "platformId": row[2], "platform": row[3], "productGroup": row[4]} for row in cur.fetchall()}


def build_proposals(pacing_data: dict, guardrails: dict, campaign_map: dict) -> list[dict]:
    """Turn pacing recommendations into concrete per-campaign proposals."""
    proposals = []
    recs = pacing_data.get("recommendations", [])

    for rec in recs:
        if rec.get("type") != "rebalance":
            continue

        # Source campaigns: cut budget
        for source in rec.get("sources", []):
            name = source["name"]
            camp = campaign_map.get(name)
            if not camp:
                continue

            cut = min(source["cut"], guardrails["budget_change_max_no_approval"])
            new_budget = max(source["currentBudget"] - cut, guardrails["budget_floor_min"])
            actual_cut = source["currentBudget"] - new_budget

            if actual_cut < 1:
                continue

            proposals.append({
                "campaignName": name,
                "campaignDbId": camp["id"],
                "platformId": camp["platformId"],
                "platform": camp["platform"],
                "productGroup": camp["productGroup"],
                "direction": "decrease",
                "oldBudget": round(source["currentBudget"], 2),
                "newBudget": round(new_budget, 2),
                "change": round(-actual_cut, 2),
                "reason": f"Underpacing at {source.get('pacing', 0):.0f}% — wasting ${actual_cut:.0f}/day",
                "needsApproval": actual_cut > guardrails["budget_change_max_no_approval"],
            })

        # Target campaigns: increase budget
        total_freed = sum(abs(p["change"]) for p in proposals if p["direction"] == "decrease")
        remaining = total_freed

        for target in rec.get("targets", []):
            if remaining <= 0:
                break
            name = target["name"]
            camp = campaign_map.get(name)
            if not camp:
                continue

            need = target["need"]
            increase = min(need, remaining, guardrails["budget_change_max_no_approval"])
            remaining -= increase

            # We don't have current budget for targets in pacing data, estimate from need
            proposals.append({
                "campaignName": name,
                "campaignDbId": camp["id"],
                "platformId": camp["platformId"],
                "platform": camp["platform"],
                "productGroup": camp["productGroup"],
                "direction": "increase",
                "oldBudget": None,  # Unknown — executor will fetch current
                "newBudget": None,  # Will be oldBudget + increase
                "change": round(increase, 2),
                "reason": f"Budget-limited — losing {target.get('lostIS', 0):.0f}% impression share",
                "needsApproval": increase > guardrails["budget_change_max_no_approval"],
            })

    return proposals


def get_or_create_agent_run(cur) -> str:
    """Get or create an AgentRun for budget-realloc proposals."""
    # Find or create the budget-pacing agent
    cur.execute('SELECT id FROM "Agent" WHERE slug = %s', ("budget-pacing",))
    row = cur.fetchone()
    if not row:
        cur.execute("""
            INSERT INTO "Agent" (id, slug, name, description, model, enabled)
            VALUES (gen_random_uuid(), 'budget-pacing', 'Budget Pacing', 'Budget pacing and reallocation', 'platform-apis', true)
            RETURNING id
        """)
        row = cur.fetchone()
    agent_id = row[0]

    # Create a run for this batch
    cur.execute("""
        INSERT INTO "AgentRun" (id, "agentId", status, "startedAt")
        VALUES (gen_random_uuid(), %s, 'done', NOW())
        RETURNING id
    """, (agent_id,))
    return cur.fetchone()[0]


def save_proposals_to_db(cur, proposals: list[dict]) -> list[dict]:
    """Create Recommendation rows with status='pending'. Returns proposals with DB ids."""
    run_id = get_or_create_agent_run(cur)
    saved = []
    for p in proposals:
        severity = "high" if abs(p["change"]) > 100 else "medium"
        action_desc = f"{p['direction']} budget by ${abs(p['change']):.0f}/day"
        impact_data = json.dumps({
            "oldBudget": p["oldBudget"],
            "newBudget": p["newBudget"],
            "change": p["change"],
            "direction": p["direction"],
            "platform": p["platform"],
            "platformId": p["platformId"],
        })
        cur.execute("""
            INSERT INTO "Recommendation" (id, "agentRunId", type, severity, target, "targetId", action, rationale, impact, status, "createdAt")
            VALUES (gen_random_uuid(), %s, 'budget-realloc', %s, %s, %s, %s, %s, %s, 'pending', NOW())
            RETURNING id
        """, (
            run_id,
            severity,
            p["campaignName"],
            p["campaignDbId"],
            action_desc,
            p["reason"],
            impact_data,
        ))
        rec_id = cur.fetchone()[0]
        p["recommendationId"] = rec_id
        saved.append(p)
    return saved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=datetime.now().strftime("%Y-%m-%d"))
    parser.add_argument("--json", action="store_true", help="Output JSON to stdout for Lobster")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    pacing_data = load_pacing_log(args.date)
    if not pacing_data:
        result = {"status": "no_data", "message": f"No pacing log for {args.date}", "proposals": []}
        if args.json:
            print(json.dumps(result))
        else:
            print(f"No pacing log found for {args.date}")
        return

    import psycopg2
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    guardrails = load_guardrails(cur)

    # Collect all campaign names from recs
    all_names = set()
    for rec in pacing_data.get("recommendations", []):
        for s in rec.get("sources", []):
            all_names.add(s["name"])
        for t in rec.get("targets", []):
            all_names.add(t["name"])

    campaign_map = resolve_campaigns(cur, list(all_names))
    proposals = build_proposals(pacing_data, guardrails, campaign_map)

    if not proposals:
        result = {"status": "no_proposals", "message": "Pacing is healthy — no reallocation needed", "proposals": []}
        if args.json:
            print(json.dumps(result))
        else:
            print("No reallocation proposals generated.")
        cur.close()
        conn.close()
        return

    if args.dry_run:
        result = {"status": "dry_run", "proposals": proposals, "count": len(proposals)}
        if args.json:
            print(json.dumps(result, default=str))
        else:
            print(f"Would create {len(proposals)} proposals:")
            for p in proposals:
                print(f"  {p['direction'].upper()} {p['campaignName']}: ${p['change']:+.0f}/day — {p['reason']}")
        cur.close()
        conn.close()
        return

    saved = save_proposals_to_db(cur, proposals)
    conn.commit()

    auto_approve = [p for p in saved if not p["needsApproval"]]
    needs_approval = [p for p in saved if p["needsApproval"]]

    # Auto-approve within guardrails
    if auto_approve:
        ids = [p["recommendationId"] for p in auto_approve]
        placeholders = ",".join(["%s"] * len(ids))
        cur.execute(f'UPDATE "Recommendation" SET status = \'approved\' WHERE id IN ({placeholders})', ids)
        conn.commit()

    result = {
        "status": "proposed",
        "totalProposals": len(saved),
        "autoApproved": len(auto_approve),
        "needsApproval": len(needs_approval),
        "proposals": saved,
        "summary": f"{len(auto_approve)} auto-approved, {len(needs_approval)} need approval",
    }

    if args.json:
        print(json.dumps(result, default=str))
    else:
        print(f"\nBudget Reallocation Proposals — {args.date}")
        print("=" * 50)
        print(f"  Total: {len(saved)} proposals")
        print(f"  Auto-approved (within guardrails): {len(auto_approve)}")
        print(f"  Needs human approval: {len(needs_approval)}")
        for p in saved:
            status = "✅ auto-approved" if not p["needsApproval"] else "⏳ needs approval"
            print(f"  {p['direction'].upper()} {p['campaignName']}: ${p['change']:+.0f}/day — {status}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
