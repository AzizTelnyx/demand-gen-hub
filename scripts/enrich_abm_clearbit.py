#!/usr/bin/env python3
"""ABM Account Enrichment via Clearbit Company API."""

import json
import sys
import time
import subprocess
import requests
from datetime import datetime

CLEARBIT_API_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"
CLEARBIT_URL = "https://company.clearbit.com/v2/companies/find"
PSQL = "/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"
DB = "dghub"
OUTPUT_PATH = "/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/abm-enrichment-results.json"

COMPETITORS = ["twilio", "vonage", "bandwidth", "plivo", "sinch", "messagebird", "telnyx"]

# Revenue string to number mapping (Clearbit estimatedAnnualRevenue range)
REVENUE_RANGES = {
    "$0-$1M": 500_000,
    "$1M-$10M": 5_000_000,
    "$10M-$50M": 30_000_000,
    "$50M-$100M": 75_000_000,
    "$100M-$250M": 175_000_000,
    "$250M-$500M": 375_000_000,
    "$500M-$1B": 750_000_000,
    "$1B-$10B": 5_000_000_000,
    "$10B+": 15_000_000_000,
}

EMPLOYEE_RANGES = {
    "1-10": 5,
    "11-50": 30,
    "51-200": 125,
    "201-500": 350,
    "501-1000": 750,
    "1001-5000": 3000,
    "5001-10000": 7500,
    "10001+": 15000,
}


def run_psql(query):
    result = subprocess.run(
        [PSQL, "-d", DB, "-t", "-A", "-F", "|", "-c", query],
        capture_output=True, text=True, timeout=30
    )
    return result.stdout.strip()


def get_accounts():
    rows = run_psql(
        """SELECT id, company, domain FROM "ABMAccount" WHERE status != 'dead_domain' AND domain IS NOT NULL ORDER BY id;"""
    )
    accounts = []
    for line in rows.split("\n"):
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 3:
            accounts.append({"id": parts[0].strip(), "company": parts[1].strip(), "domain": parts[2].strip()})
    return accounts


def call_clearbit(domain):
    headers = {"Authorization": f"Bearer {CLEARBIT_API_KEY}"}
    resp = requests.get(CLEARBIT_URL, params={"domain": domain}, headers=headers, timeout=15)
    return resp


def parse_revenue(revenue_range):
    if not revenue_range:
        return 0
    return REVENUE_RANGES.get(revenue_range, 0)


def parse_employees(emp_range):
    if not emp_range:
        return 0
    return EMPLOYEE_RANGES.get(emp_range, 0)


def detect_competitors(tech_list):
    if not tech_list:
        return [], False
    found = []
    for t in tech_list:
        t_lower = t.lower()
        for comp in COMPETITORS:
            if comp in t_lower:
                found.append(comp)
    return list(set(found)), len(found) > 0


def auto_tier(emp_count, revenue, has_competitor):
    if has_competitor or emp_count >= 500 or revenue >= 50_000_000:
        return "T1"
    if (100 <= emp_count < 500) or (10_000_000 <= revenue < 50_000_000):
        return "T2"
    return "T3"


def escape_sql(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def main():
    accounts = get_accounts()
    print(f"Found {len(accounts)} accounts to enrich", flush=True)

    results = []
    errors = []
    enriched_count = 0
    tier_counts = {"T1": 0, "T2": 0, "T3": 0}
    competitor_detections = []
    verticals = {}
    skipped = 0

    for i, acct in enumerate(accounts):
        domain = acct["domain"].strip()
        if not domain or "/" in domain or " " in domain:
            errors.append({"domain": domain, "error": "invalid domain format"})
            skipped += 1
            continue

        try:
            resp = call_clearbit(domain)
        except Exception as e:
            errors.append({"domain": domain, "error": str(e)})
            skipped += 1
            time.sleep(1)
            continue

        if resp.status_code == 404:
            errors.append({"domain": domain, "error": "not found (404)"})
            skipped += 1
            time.sleep(0.6)
            continue
        elif resp.status_code == 422:
            errors.append({"domain": domain, "error": "invalid domain (422)"})
            skipped += 1
            time.sleep(0.6)
            continue
        elif resp.status_code == 402:
            errors.append({"domain": domain, "error": "quota exceeded (402)"})
            print(f"⚠️  Quota exceeded at account {i+1}/{len(accounts)}. Stopping.")
            break
        elif resp.status_code == 429:
            print(f"⚠️  Rate limited at {i+1}. Waiting 10s...")
            time.sleep(10)
            try:
                resp = call_clearbit(domain)
            except:
                errors.append({"domain": domain, "error": "rate limit retry failed"})
                continue
        elif resp.status_code != 200:
            errors.append({"domain": domain, "error": f"HTTP {resp.status_code}"})
            skipped += 1
            time.sleep(0.6)
            continue

        if resp.status_code != 200:
            errors.append({"domain": domain, "error": f"HTTP {resp.status_code} after retry"})
            skipped += 1
            time.sleep(0.6)
            continue

        data = resp.json()

        # Extract fields
        name = data.get("name")
        sector = data.get("category", {}).get("sector") if data.get("category") else None
        industry = data.get("category", {}).get("industry") if data.get("category") else None
        sub_industry = data.get("category", {}).get("subIndustry") if data.get("category") else None
        emp_range = data.get("metrics", {}).get("employeesRange") if data.get("metrics") else None
        revenue_range = data.get("metrics", {}).get("estimatedAnnualRevenue") if data.get("metrics") else None
        tech = data.get("tech", []) or []
        country = data.get("geo", {}).get("country") if data.get("geo") else None
        city = data.get("geo", {}).get("city") if data.get("geo") else None
        founded_year = data.get("foundedYear")
        linkedin_url = data.get("linkedin", {}).get("handle") if data.get("linkedin") else None
        if linkedin_url and not linkedin_url.startswith("http"):
            linkedin_url = f"https://linkedin.com/{linkedin_url}"
        description = data.get("description")

        emp_count = parse_employees(emp_range)
        revenue = parse_revenue(revenue_range)
        competitors_found, has_competitor = detect_competitors(tech)
        tier = auto_tier(emp_count, revenue, has_competitor)

        # Vertical from industry/sector
        vertical = industry or sector or sub_industry

        # Track stats
        tier_counts[tier] += 1
        if vertical:
            verticals[vertical] = verticals.get(vertical, 0) + 1
        if has_competitor:
            competitor_detections.append({
                "domain": domain,
                "company": acct["company"],
                "competitors": competitors_found
            })

        # Build enrichment record
        enrichment = {
            "id": acct["id"],
            "domain": domain,
            "company": name or acct["company"],
            "sector": sector,
            "industry": industry,
            "subIndustry": sub_industry,
            "employeesRange": emp_range,
            "estimatedRevenue": revenue_range,
            "tech": tech,
            "country": country,
            "city": city,
            "foundedYear": founded_year,
            "linkedinUrl": linkedin_url,
            "description": description,
            "competitorsFound": competitors_found,
            "tier": tier,
        }
        results.append(enrichment)

        # Update DB
        current_provider = ", ".join(competitors_found) if competitors_found else None
        switch_signal = "competitor_detected" if has_competitor else None
        notes_append = f"[Clearbit {datetime.now().strftime('%Y-%m-%d')}] {emp_range or '?'} employees, {revenue_range or '?'} revenue, tier={tier}"
        if competitors_found:
            notes_append += f", competitors: {', '.join(competitors_found)}"

        set_clauses = []
        if vertical:
            set_clauses.append(f"vertical = {escape_sql(vertical)}")
        if country:
            set_clauses.append(f"country = {escape_sql(country)}")
        if emp_range:
            set_clauses.append(f'"companySize" = {escape_sql(emp_range)}')
        set_clauses.append(f"tier = {escape_sql(tier)}")
        if current_provider:
            set_clauses.append(f'"currentProvider" = {escape_sql(current_provider)}')
        if switch_signal:
            set_clauses.append(f'"switchSignal" = {escape_sql(switch_signal)}')
        set_clauses.append(f"notes = COALESCE(notes, '') || E'\\n' || {escape_sql(notes_append)}")

        update_sql = f'UPDATE "ABMAccount" SET {", ".join(set_clauses)} WHERE id = {escape_sql(acct["id"])};'
        try:
            run_psql(update_sql)
        except Exception as e:
            errors.append({"domain": domain, "error": f"DB update failed: {e}"})

        enriched_count += 1

        if (i + 1) % 50 == 0:
            print(f"  Processed {i+1}/{len(accounts)} ({enriched_count} enriched, {skipped} skipped)", flush=True)

        time.sleep(0.7)  # Conservative rate limiting

    # Save results
    output = {
        "timestamp": datetime.now().isoformat(),
        "totalAccounts": len(accounts),
        "enriched": enriched_count,
        "skipped": skipped,
        "errors": len(errors),
        "tierBreakdown": tier_counts,
        "competitorDetections": competitor_detections,
        "topVerticals": dict(sorted(verticals.items(), key=lambda x: -x[1])[:20]),
        "errorDetails": errors[:50],
        "results": results,
    }
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n{'='*60}")
    print(f"ENRICHMENT COMPLETE")
    print(f"{'='*60}")
    print(f"Total accounts: {len(accounts)}")
    print(f"Enriched: {enriched_count}")
    print(f"Skipped/Errors: {skipped + len(errors) - skipped}")
    print(f"\nTier Breakdown:")
    for t, c in tier_counts.items():
        print(f"  {t}: {c}")
    print(f"\nCompetitor Detections: {len(competitor_detections)}")
    for cd in competitor_detections[:10]:
        print(f"  {cd['company']} ({cd['domain']}): {', '.join(cd['competitors'])}")
    print(f"\nTop Verticals:")
    for v, c in list(sorted(verticals.items(), key=lambda x: -x[1]))[:10]:
        print(f"  {v}: {c}")
    print(f"\nAPI Errors: {len(errors)}")
    if errors:
        # Summarize error types
        error_types = {}
        for e in errors:
            et = e["error"]
            error_types[et] = error_types.get(et, 0) + 1
        for et, c in sorted(error_types.items(), key=lambda x: -x[1]):
            print(f"  {et}: {c}")
    print(f"\nResults saved to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
