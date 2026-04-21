#!/usr/bin/env python3
"""
ABM Builder Step 3: Enrich
Clearbit enrichment for discovered domains.
Adds firmographics: employees, industry, tags, tech stack, description.

Input: --domains-json '[{name, domain, snippet}, ...]'
Output: JSON array of enriched accounts to stdout
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from abm_builder_lib import clearbit_enrich, check_hallucination


def main():
    parser = argparse.ArgumentParser(description="ABM Builder: Clearbit enrichment")
    parser.add_argument("--domains-json", required=True, help="JSON array of domains from search step")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between Clearbit calls (seconds)")
    args = parser.parse_args()

    try:
        companies = json.loads(args.domains_json)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid domains JSON"}))
        sys.exit(1)

    enriched = []
    failed = 0
    hallucinated = 0

    for i, company in enumerate(companies):
        domain = company.get("domain", "")
        name = company.get("name", "")

        if not domain:
            print(f"  [{i+1}/{len(companies)}] Skipping {name} — no domain", file=sys.stderr)
            continue

        print(f"  [{i+1}/{len(companies)}] Enriching {domain}...", file=sys.stderr)

        cb_data = clearbit_enrich(domain)

        if not cb_data:
            print(f"    No Clearbit data for {domain}", file=sys.stderr)
            failed += 1
            continue

        # Hallucination check — does the search result name match Clearbit?
        ok, reason = check_hallucination(name, cb_data)
        if not ok:
            print(f"    Hallucination: {reason}", file=sys.stderr)
            hallucinated += 1
            # Use Clearbit's name instead
            name = cb_data.get("name", name)

        # Extract useful fields
        enriched.append({
            "name": name,
            "domain": domain,
            "snippet": company.get("snippet", ""),
            "clearbit_name": cb_data.get("name", ""),
            "description": cb_data.get("description", ""),
            "industry": (cb_data.get("category") or {}).get("industry", ""),
            "tags": cb_data.get("tags", []),
            "tech": cb_data.get("tech", []),
            "employees": (cb_data.get("metrics") or {}).get("employees"),
            "country": (cb_data.get("geo") or {}).get("country"),
            "clearbit_raw_id": cb_data.get("id"),
        })

        # Rate limit
        time.sleep(args.delay)

    print(f"\nEnriched: {len(enriched)} | No data: {failed} | Hallucinated: {hallucinated}", file=sys.stderr)
    print(json.dumps(enriched, indent=2))


if __name__ == "__main__":
    main()
