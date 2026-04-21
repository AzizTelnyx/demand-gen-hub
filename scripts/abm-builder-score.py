#!/usr/bin/env python3
"""
ABM Builder Step 4: Score
Deterministic relevance scoring using Clearbit data.
Drops junk (score < 0.15), auto-accepts strong matches (> 0.6),
flags borderline (0.15-0.6) for AI validation.

Input: --accounts-json '[{...enriched accounts...}]' --products '["voice-ai"]'
Output: JSON array of scored accounts with verdict to stdout
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from abm_builder_lib import relevance_score, PRODUCT_MAP


def main():
    parser = argparse.ArgumentParser(description="ABM Builder: Relevance scoring")
    parser.add_argument("--accounts-json", required=True, help="JSON array of enriched accounts")
    parser.add_argument("--products", required=True, help="JSON array of productFit values (e.g. [\"voice-ai\"])")
    parser.add_argument("--min-score", type=float, default=0.15, help="Minimum score to keep (default: 0.15)")
    args = parser.parse_args()

    try:
        accounts = json.loads(args.accounts_json)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid accounts JSON"}))
        sys.exit(1)

    try:
        products = json.loads(args.products)
    except json.JSONDecodeError:
        products = ["voice-ai"]

    # Map to scorer product names
    scorer_products = []
    for p in products:
        mapped = PRODUCT_MAP.get(p, p)
        if mapped not in scorer_products:
            scorer_products.append(mapped)

    scored = []
    dropped = 0
    auto_accepted = 0
    needs_validation = 0

    for account in accounts:
        # Build fake clearbit_data structure for scorer
        clearbit_data = {
            "description": account.get("description", ""),
            "tags": account.get("tags", []),
            "tech": account.get("tech", []),
            "metrics": {"employees": account.get("employees")},
            "category": {"industry": account.get("industry", "")},
        }

        best_score = 0
        best_product = None
        best_reasoning = {}

        # Score against each product, keep best
        for product_name in scorer_products:
            score, reasoning = relevance_score(clearbit_data, product_name)
            if score > best_score:
                best_score = score
                best_product = product_name
                best_reasoning = reasoning

        account["score"] = best_score
        account["scored_product"] = best_product
        account["score_reasoning"] = best_reasoning

        # Verdict
        if best_score < args.min_score:
            account["verdict"] = "drop"
            dropped += 1
        elif best_score >= 0.6:
            account["verdict"] = "auto_accept"
            auto_accepted += 1
        else:
            account["verdict"] = "needs_validation"
            needs_validation += 1

        scored.append(account)

    print(f"Scored: {len(scored)} | Auto-accept: {auto_accepted} | Needs validation: {needs_validation} | Dropped: {dropped}", file=sys.stderr)

    # Only output non-dropped accounts
    kept = [a for a in scored if a["verdict"] != "drop"]
    print(json.dumps(kept, indent=2))


if __name__ == "__main__":
    main()
