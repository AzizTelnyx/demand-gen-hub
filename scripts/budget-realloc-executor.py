#!/usr/bin/env python3
"""
Budget Reallocation Executor
=============================
Reads pending budget recommendations from DB, validates against guardrails,
executes approved changes via Google Ads API, logs results.

Run: python scripts/budget-realloc-executor.py [--dry-run]
Called by: approval buttons in Telegram, or manually
"""

import json
import os
import sys
import argparse
from datetime import datetime

# Add scripts/ to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from platforms import get_connector

# ─── Config ───────────────────────────────────────────

DB_URL = os.environ.get("POSTGRES_URL_NON_POOLING") or os.environ.get("POSTGRES_PRISMA_URL", "postgresql://localhost:5432/dghub")
if "localhost" in DB_URL or "127.0.0.1" in DB_URL:
    DB_URL = DB_URL.split("?")[0]

# Default guardrails (overridden by DB)
DEFAULT_GUARDRAILS = {
    "budget_floor_min": 10.0,
    "budget_change_max_no_approval": 500.0,
    "cross_product_realloc": False,
}


# ─── Guardrails ──────────────────────────────────────

def load_guardrails(cur) -> dict:
    """Load guardrails from AgentGuardrail table, with defaults."""
    guardrails = dict(DEFAULT_GUARDRAILS)
    try:
        cur.execute("""
            SELECT key, value FROM "AgentGuardrail"
            WHERE key IN ('budget_floor_min', 'budget_change_max_no_approval', 'cross_product_realloc')
        """)
        for key, value in cur.fetchall():
            if key in ("budget_floor_min", "budget_change_max_no_approval"):
                guardrails[key] = float(value)
            elif key == "cross_product_realloc":
                guardrails[key] = value.lower() in ("true", "1", "yes")
    except Exception as e:
        print(f"  Warning: could not load guardrails from DB, using defaults: {e}", file=sys.stderr)
    return guardrails


# ─── Load Recommendations ────────────────────────────

def load_pending_recommendations(cur) -> list[dict]:
    """Load approved budget-realloc recommendations from DB."""
    cur.execute("""
        SELECT r.id, r.action, r.rationale, r.impact, r.target, r."targetId",
               c."platformId", c.platform, c.name, c."parsedProduct"
        FROM "Recommendation" r
        LEFT JOIN "Campaign" c ON c.id = r."targetId"
        WHERE r.status = 'approved' AND r.type = 'budget-realloc'
        ORDER BY r."createdAt" ASC
    """)
    rows = cur.fetchall()
    results = []
    for row in rows:
        rec_id, action, rationale, impact_raw, target, target_id, platform_id, platform, campaign_name, product_group = row
        impact = json.loads(impact_raw) if impact_raw else {}
        results.append({
            "id": rec_id,
            "data": {"action": action, "rationale": rationale},
            "campaignDbId": target_id,
            "platformId": impact.get("platformId") or platform_id,
            "platform": impact.get("platform") or platform or "google_ads",
            "campaignName": campaign_name or target,
            "productGroup": product_group,
            "newBudget": impact.get("newBudget"),
            "oldBudget": impact.get("oldBudget"),
            "change": impact.get("change"),
            "direction": impact.get("direction"),
        })
    return results


# ─── Validation ──────────────────────────────────────

def validate_recommendation(rec: dict, guardrails: dict, all_recs: list[dict]) -> tuple[bool, str]:
    """Validate a recommendation against guardrails. Returns (ok, reason)."""
    new_budget = rec.get("newBudget")
    old_budget = rec.get("oldBudget")

    if new_budget is None:
        return False, "Missing newBudget in recommendation data"

    # Floor check
    floor = guardrails["budget_floor_min"]
    if new_budget < floor:
        return False, f"New budget ${new_budget:.2f} below floor ${floor:.2f}"

    # Change amount check
    if old_budget is not None:
        change = abs(new_budget - old_budget)
        max_change = guardrails["budget_change_max_no_approval"]
        if change > max_change:
            return False, f"Budget change ${change:.2f} exceeds max ${max_change:.2f} without additional approval"

    # Cross-product check
    if not guardrails["cross_product_realloc"]:
        # If this is a rebalance (source+target), check product groups match
        source_group = rec.get("data", {}).get("sourceProductGroup")
        target_group = rec.get("productGroup")
        if source_group and target_group and source_group != target_group:
            return False, f"Cross-product reallocation not allowed ({source_group} → {target_group})"

    return True, ""


# ─── Execute ─────────────────────────────────────────

def execute_budget_change(rec: dict, dry_run: bool = False) -> dict:
    """Execute a single budget change. Returns result dict."""
    platform = rec["platform"]
    platform_id = rec["platformId"]
    new_budget = rec["newBudget"]
    campaign_name = rec["campaignName"]

    result = {
        "recId": rec["id"],
        "campaign": campaign_name,
        "platform": platform,
        "platformId": platform_id,
        "newBudget": new_budget,
        "oldBudget": rec.get("oldBudget"),
    }

    if dry_run:
        result["status"] = "dry-run"
        result["message"] = f"Would update {campaign_name} to ${new_budget:.2f}/day"
        return result

    try:
        connector = get_connector(platform)
        write_result = connector.update_budget(platform_id, new_budget)

        if write_result.success:
            result["status"] = "applied"
            result["resourceName"] = write_result.resource_name
            result["message"] = f"Updated {campaign_name} to ${new_budget:.2f}/day"
        else:
            result["status"] = "failed"
            result["message"] = write_result.error
    except Exception as e:
        result["status"] = "failed"
        result["message"] = str(e)

    return result


# ─── DB Logging ──────────────────────────────────────

def log_change(cur, rec: dict, result: dict):
    """Log the budget change to CampaignChange and update recommendation status."""
    try:
        # Log to CampaignChange
        cur.execute("""
            INSERT INTO "CampaignChange" (id, "campaignId", "campaignName", platform, "changeType", description, "oldValue", "newValue", source, actor)
            VALUES (gen_random_uuid(), %s, %s, %s, 'budget', %s, %s, %s, 'budget-realloc-executor', 'ares')
        """, (
            rec["campaignDbId"],
            rec["campaignName"],
            rec["platform"],
            f"Budget {rec.get('direction', 'change')}: ${rec.get('oldBudget', '?')} → ${rec.get('newBudget', '?')}/day",
            str(rec.get("oldBudget", "")),
            str(rec.get("newBudget", "")),
        ))

        # Update recommendation status
        new_status = "applied" if result["status"] == "applied" else "failed"
        cur.execute("""
            UPDATE "Recommendation" SET status = %s, "appliedAt" = NOW() WHERE id = %s
        """, (new_status, rec["id"]))
    except Exception as e:
        print(f"  Warning: DB logging failed for rec {rec['id']}: {e}", file=sys.stderr)


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Budget Reallocation Executor")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print but don't execute")
    args = parser.parse_args()

    print(f"Budget Reallocation Executor — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    import psycopg2
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Load guardrails
    guardrails = load_guardrails(cur)
    print(f"  Guardrails: floor=${guardrails['budget_floor_min']}, max_change=${guardrails['budget_change_max_no_approval']}, cross_product={guardrails['cross_product_realloc']}")

    # Load pending recommendations
    recs = load_pending_recommendations(cur)
    print(f"  Pending recommendations: {len(recs)}")

    if not recs:
        print("\n  No approved budget recommendations to execute.")
        cur.close()
        conn.close()
        return

    results = []
    for rec in recs:
        print(f"\n  Processing: {rec['campaignName']} ({rec['platform']})")
        print(f"    Budget: ${rec.get('oldBudget', '?')} → ${rec.get('newBudget', '?')}")

        # Validate
        ok, reason = validate_recommendation(rec, guardrails, recs)
        if not ok:
            print(f"    ❌ Validation failed: {reason}")
            # Mark as failed in DB
            if not args.dry_run:
                cur.execute("""
                    UPDATE "Recommendation" SET status = 'rejected' WHERE id = %s
                """, (rec["id"],))
                conn.commit()
            results.append({"recId": rec["id"], "status": "rejected", "message": reason})
            continue

        print(f"    ✅ Validation passed")

        # Execute
        result = execute_budget_change(rec, dry_run=args.dry_run)
        print(f"    {'🔄' if args.dry_run else '✅' if result['status'] == 'applied' else '❌'} {result['message']}")

        if not args.dry_run and result["status"] in ("applied", "failed"):
            log_change(cur, rec, result)
            conn.commit()

        results.append(result)

    # Summary
    print(f"\n{'=' * 50}")
    applied = sum(1 for r in results if r["status"] == "applied")
    failed = sum(1 for r in results if r["status"] in ("failed", "rejected"))
    dry = sum(1 for r in results if r["status"] == "dry-run")
    print(f"  Results: {applied} applied, {failed} failed/rejected, {dry} dry-run")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
