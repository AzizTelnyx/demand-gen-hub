#!/usr/bin/env python3
"""
Live metrics query across all ad platforms.
Usage: python query_metrics.py --platform google_ads --from 2025-01-01 --to 2025-12-31
       python query_metrics.py --platform all --from 2025-02-01 --to 2025-02-25
       python query_metrics.py --platform google_ads --from 2025-01-01 --to 2025-12-31 --search "voice api"

Uses the platform connector abstraction (scripts/platforms/).
Outputs JSON to stdout for consumption by the hub API.
"""
import json
import sys
import os
import argparse

# Add scripts/ to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from platforms import get_connector, list_platforms


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Query live metrics from ad platforms")
    parser.add_argument("--platform", required=True, choices=list_platforms() + ["all"])
    parser.add_argument("--from", dest="date_from", required=True, help="Start date YYYY-MM-DD")
    parser.add_argument("--to", dest="date_to", required=True, help="End date YYYY-MM-DD")
    parser.add_argument("--search", help="Filter campaigns by name (case-insensitive)")
    parser.add_argument("--top", type=int, default=0, help="Only return top N campaigns by spend")
    parser.add_argument("--all-statuses", action="store_true", help="Include paused/disabled campaigns")
    args = parser.parse_args()

    active_only = not args.all_statuses
    slugs = list_platforms() if args.platform == "all" else [args.platform]

    all_results = []
    for slug in slugs:
        connector = get_connector(slug)
        result = connector.query_metrics(args.date_from, args.date_to, args.search, active_only)
        d = result.to_dict()
        if args.top and "campaigns" in d:
            d["campaigns"] = d["campaigns"][:args.top]
        all_results.append(d)

    if len(all_results) == 1:
        print(json.dumps(all_results[0], indent=2))
    else:
        combined = {
            "platforms": all_results,
            "dateFrom": args.date_from,
            "dateTo": args.date_to,
            "totalSpend": round(sum(r.get("totalSpend", 0) for r in all_results), 2),
            "totalImpressions": sum(r.get("totalImpressions", 0) for r in all_results),
            "totalClicks": sum(r.get("totalClicks", 0) for r in all_results),
            "totalConversions": round(sum(r.get("totalConversions", 0) for r in all_results), 1),
        }
        print(json.dumps(combined, indent=2))
