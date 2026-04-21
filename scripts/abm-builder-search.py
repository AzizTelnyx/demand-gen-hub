#!/usr/bin/env python3
"""
ABM Builder Step 2: Search
Runs Brave web searches using criteria from Step 1.
Extracts real company names + domains from search results.

Input: --criteria-json '{...}'
Output: JSON array of {name, domain, snippet} to stdout
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from abm_builder_lib import brave_search, extract_domains_from_results


def main():
    parser = argparse.ArgumentParser(description="ABM Builder: Web search")
    parser.add_argument("--criteria-json", required=True, help="JSON criteria from interpret step")
    args = parser.parse_args()

    try:
        criteria = json.loads(args.criteria_json)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid criteria JSON"}))
        sys.exit(1)

    queries = criteria.get("searchQueries", [])
    if not queries:
        # Build queries from criteria if not provided
        profile = criteria.get("targetCompanyProfile", "")
        products = " ".join(criteria.get("products", []))
        regions = " ".join(criteria.get("regions", []))
        queries = [
            f"{products} companies {regions}",
            f"{products} platform providers {regions}",
            f"{products} vendors {regions}",
        ]

    all_companies = []
    seen_domains = set()

    for query in queries:
        print(f"Searching: {query}", file=sys.stderr)
        results = brave_search(query, count=20)

        if not results:
            print(f"  No results for: {query}", file=sys.stderr)
            continue

        extracted = extract_domains_from_results(results)

        for company in extracted:
            if company["domain"] not in seen_domains:
                seen_domains.add(company["domain"])
                all_companies.append(company)

        print(f"  Found {len(extracted)} domains (total unique: {len(all_companies)})", file=sys.stderr)

        # Rate limit
        time.sleep(1)

    print(f"Total unique domains found: {len(all_companies)}", file=sys.stderr)
    print(json.dumps(all_companies, indent=2))


if __name__ == "__main__":
    main()
