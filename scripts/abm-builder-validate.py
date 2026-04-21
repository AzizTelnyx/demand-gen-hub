#!/usr/bin/env python3
"""
ABM Builder Step 5: Validate
AI validates borderline accounts (score 0.15-0.6).
Auto-accepted accounts (>0.6) pass through without LLM call.

Input: --accounts-json '[...scored accounts...]' --criteria-json '{...}'
Output: JSON array of validated accounts to stdout
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from abm_builder_lib import llm_validate


def main():
    parser = argparse.ArgumentParser(description="ABM Builder: AI validation of borderline accounts")
    parser.add_argument("--input-file", help="Read JSON from file instead of --arg")
    parser.add_argument("--accounts-json", required=True, help="JSON array of scored accounts")
    parser.add_argument("--criteria-json", required=True, help="JSON criteria from interpret step")
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

    validated = []
    ai_approved = 0
    ai_rejected = 0
    auto_passed = 0

    for account in accounts:
        verdict = account.get("verdict", "needs_validation")

        if verdict == "auto_accept":
            account["final_verdict"] = "approved"
            account["validation_reason"] = "auto_accept_score"
            auto_passed += 1
            validated.append(account)
            continue

        # Borderline — run AI validation
        product_name = account.get("scored_product", "")
        clearbit_data = {
            "description": account.get("description", ""),
            "tags": account.get("tags", []),
            "tech": account.get("tech", []),
            "metrics": {"employees": account.get("employees")},
            "category": {"industry": account.get("industry", "")},
        }

        approved, reason = llm_validate(account, clearbit_data, product_name, criteria)

        if approved:
            account["final_verdict"] = "approved"
            account["validation_reason"] = reason
            ai_approved += 1
            validated.append(account)
        else:
            account["final_verdict"] = "rejected"
            account["validation_reason"] = reason
            ai_rejected += 1
            print(f"  Rejected: {account.get('name')} ({account.get('domain')}) — {reason}", file=sys.stderr)

        # Rate limit LLM calls
        time.sleep(0.5)

    print(f"\nAuto-passed: {auto_passed} | AI approved: {ai_approved} | AI rejected: {ai_rejected}", file=sys.stderr)
    print(f"Total approved: {len(validated)}", file=sys.stderr)
    print(json.dumps(validated, indent=2))


if __name__ == "__main__":
    main()
