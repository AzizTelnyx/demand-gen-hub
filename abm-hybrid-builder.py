#!/usr/bin/env python3
"""
ABM Hybrid List Builder: Gemini → Perplexica → Clearbit

1. Gemini generates EMEA healthcare comms candidates
2. Perplexica verifies each company (real? current? what do they do?)
3. Clearbit validates domain + employee count + country HQ

Usage: python abm-hybrid-builder.py [--limit 25] [--output results.json]
"""

import argparse
import json
import time
import requests
import datetime
import re
import sys
from datetime import timezone

# ========== CONFIG ==========
LITELLM_URL = "http://litellm-aiswe.query.prod.telnyx.io:4000/v1/chat/completions"
LITELLM_KEY = "sk-JcJEnHgGiRKTnIdkGfv3Rw"
PERPLEXICA_URL = "http://localhost:3001"
CLEARBIT_URL = "https://company.clearbit.com/v2/companies/find"
CLEARBIT_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"

EMEA_COUNTRIES = {
    "GB", "UK", "DE", "FR", "NL", "SE", "NO", "DK", "FI", "IE", "ES", "IT", "PT", "PL",
    "CZ", "AT", "CH", "BE", "LU", "HU", "RO", "BG", "HR", "SK", "SI", "LT", "LV", "EE",
    "GR", "CY", "MT", "IS", "IL", "AE", "SA", "QA", "BH", "KW", "OM", "TR", "ZA", "NG",
    "KE", "EG", "MA", "TN", "GH", "TZ", "UG", "RW", "ET", "JO", "LB", "PS",
}

HEALTHCARE_KEYWORDS = [
    "health", "medical", "clinical", "patient", "hospital", "pharma", "biotech",
    "telemedicine", "telehealth", "wellness", "care", "nurs", "doctor", "diagnostic",
]

COMMS_KEYWORDS = [
    "communication", "messaging", "engagement", "appointment", "remind", "contact center",
    "voice", "chat", "sms", "video consult", "telehealth", "telemedicine", "virtual care",
    "patient portal", "booking", "scheduling", "triage", "symptom"
]

# ========== LAYER 1: GEMINI GENERATION ==========

def call_gemini(prompt: str, model: str = "gemini/gemini-2.0-flash") -> str:
    """Call Gemini via LiteLLM proxy."""
    resp = requests.post(LITELLM_URL, headers={
        "Authorization": f"Bearer {LITELLM_KEY}",
        "Content-Type": "application/json"
    }, json={
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3
    }, timeout=90)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def generate_candidates(limit: int = 25) -> list[dict]:
    """Generate EMEA healthcare comms candidates via Gemini, in batches of 50."""
    BATCH_SIZE = 50
    all_candidates = []
    batches = (limit + BATCH_SIZE - 1) // BATCH_SIZE
    
    existing_names = set()  # Track for dedup across batches
    
    for i in range(batches):
        batch_limit = min(BATCH_SIZE, limit - len(all_candidates))
        if batch_limit <= 0:
            break
        
        exclude_list = "Doctolib, Babylon Health, KRY/LIVI"
        if all_candidates:
            exclude_list += ", " + ", ".join(c["company"] for c in all_candidates)
        
        prompt = f"""You are building an ABM target list for Telnyx (CPaaS/telecom). 

Generate {batch_limit} REAL healthcare communication/patient engagement companies headquartered in EMEA (UK, Germany, France, Netherlands, Nordics, Israel, etc.).

Focus on companies that would need:
- SIP trunking for voice AI
- SMS API for patient messaging
- Phone numbers for contact centers
- Video infrastructure for telehealth

Categories: patient messaging, appointment reminders, clinical communication, healthcare contact centers, voice AI for healthcare, telehealth platforms.

IMPORTANT: 
- These must be REAL companies with working websites
- Include companies founded 2015-2025 (startups and scale-ups)
- Prefer smaller companies over enterprise giants
- Do NOT include: {exclude_list}

Return ONLY a raw JSON array:
[{{"company": "Name", "domain": "example.com", "country": "XX", "vertical": "category", "productFit": "telnyx-product-fit", "description": "brief"}}]"""

        raw = call_gemini(prompt)
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            try:
                batch = json.loads(match.group())
                # Dedup by domain
                for c in batch:
                    domain = c.get("domain", "").lower().strip()
                    if domain and domain not in existing_names:
                        existing_names.add(domain)
                        all_candidates.append(c)
            except json.JSONDecodeError:
                print(f"  Warning: Batch {i+1} returned invalid JSON, skipping")
        
        print(f"  Batch {i+1}/{batches}: {len(batch) if match else 0} candidates (total: {len(all_candidates)})")
        
        if i < batches - 1:
            time.sleep(2)  # Rate limit between batches
    
    return all_candidates


# ========== LAYER 2: PERPLEXICA VERIFICATION ==========

def perplexica_search(query: str, mode: str = "balanced") -> dict:
    """Search via Perplexica API."""
    payload = {
        "chatModel": {"providerId": "449be310-cb57-4601-86af-a3fd02362ad7", "key": "openai/gpt-4o-mini"},
        "embeddingModel": {"providerId": "a8688d79-9404-4e04-b046-cdd7bb979fef", "key": "Xenova/all-MiniLM-L6-v2"},
        "sources": ["web"],
        "optimizationMode": mode,
        "query": query
    }
    
    try:
        resp = requests.post(f"{PERPLEXICA_URL}/api/search", 
                             headers={"Content-Type": "application/json"},
                             json=payload, timeout=60)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e), "message": None, "sources": []}


def verify_company_perplexica(company: dict) -> dict:
    """Verify company via Perplexica web search."""
    name = company.get("company", "")
    domain = company.get("domain", "")
    
    # Query 1: Does this company exist? What do they do?
    query1 = f"{name} {domain} healthcare company what do they do"
    result1 = perplexica_search(query1, mode="speed")
    
    # Query 2: Are they still operating? Any recent news?
    query2 = f"{name} company news 2025 2026"
    result2 = perplexica_search(query2, mode="speed")
    
    # Extract verification signals
    message1 = result1.get("message", "").lower()
    message2 = result2.get("message", "").lower()
    
    # Check if company appears to exist
    exists_signals = [
        name.lower() in message1,
        domain.lower() in message1,
        "healthcare" in message1 or "medical" in message1,
        "founded" in message1 or "startup" in message1 or "company" in message1,
    ]
    
    # Check if still operating (no shutdown/acquisition signals)
    shutdown_signals = [
        "shut down" in message2,
        "acquired by" in message2,
        "ceased operations" in message2,
        "bankrupt" in message2,
    ]
    
    # Check healthcare comms relevance
    healthcare_comms = any(kw in message1 for kw in HEALTHCARE_KEYWORDS + COMMS_KEYWORDS)
    
    verification = {
        "perplexica_verified": sum(exists_signals) >= 2,
        "perplexica_confidence": "high" if sum(exists_signals) >= 3 else "medium" if sum(exists_signals) >= 2 else "low",
        "still_operating": not any(shutdown_signals),
        "healthcare_comms_relevant": healthcare_comms,
        "perplexica_summary": result1.get("message", "")[:500],
        "perplexica_sources": [s.get("metadata", {}).get("url", "") for s in result1.get("sources", [])[:3]],
    }
    
    return verification


# ========== LAYER 3: CLEARBIT VALIDATION ==========

def check_clearbit(domain: str) -> dict:
    """Get Clearbit data for domain."""
    try:
        resp = requests.get(CLEARBIT_URL, 
                           params={"domain": domain},
                           headers={"Authorization": f"Bearer {CLEARBIT_KEY}"},
                           timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "found": True,
                "name": data.get("name", ""),
                "employees": data.get("metrics", {}).get("employeesRange", "unknown"),
                "country": data.get("geo", {}).get("countryCode", "unknown"),
                "category": f"{data.get('category', {}).get('sector', '')}/{data.get('category', {}).get('industry', '')}",
                "description": data.get("description", "")[:200],
                "tech": data.get("tech", [])[:5],
            }
        return {"found": False}
    except Exception as e:
        return {"found": False, "error": str(e)}


def validate_company_clearbit(company: dict) -> dict:
    """Validate company via Clearbit."""
    domain = company.get("domain", "")
    clearbit_data = check_clearbit(domain)
    
    if not clearbit_data.get("found"):
        return {
            "clearbit_found": False,
            "clearbit_emea": False,
            "clearbit_employees": "N/A",
        }
    
    country = (clearbit_data.get("country") or "").upper()
    
    return {
        "clearbit_found": True,
        "clearbit_name": clearbit_data.get("name", ""),
        "clearbit_country": country,
        "clearbit_emea": country in EMEA_COUNTRIES,
        "clearbit_employees": clearbit_data.get("employees", "unknown"),
        "clearbit_category": clearbit_data.get("category", ""),
        "clearbit_description": clearbit_data.get("description", ""),
        "clearbit_tech": clearbit_data.get("tech", []),
    }


# ========== MAIN PIPELINE ==========

def process_company(company: dict, verbose: bool = True) -> dict:
    """Run full pipeline on a single company."""
    name = company.get("company", "")
    domain = company.get("domain", "")
    
    if verbose:
        print(f"  {name} ({domain})...", end=" ", flush=True)
    
    # Layer 2: Perplexica verification
    perplexica_result = verify_company_perplexica(company)
    
    # Layer 3: Clearbit validation
    clearbit_result = validate_company_clearbit(company)
    
    # Score the company
    score = 0
    if perplexica_result.get("perplexica_verified"):
        score += 2
    if perplexica_result.get("still_operating"):
        score += 1
    if perplexica_result.get("healthcare_comms_relevant"):
        score += 1
    if clearbit_result.get("clearbit_found"):
        score += 1
    if clearbit_result.get("clearbit_emea"):
        score += 1
    
    if verbose:
        status = "✓" if score >= 4 else "⚠" if score >= 2 else "✗"
        print(f"{status} (score={score}/6)")
    
    return {
        "company": name,
        "domain": domain,
        "country_input": company.get("country", ""),
        "vertical": company.get("vertical", ""),
        "productFit": company.get("productFit", ""),
        "description_input": company.get("description", ""),
        "verification": perplexica_result,
        "validation": clearbit_result,
        "score": score,
        "passed": score >= 4,
    }


# ========== LAYER 4: ICP + DOMAIN QC ==========

ICP_PROFILES = """
ICP 1 — Developer:
- Software developers/engineering teams building comms features
- Company size: 10-10,000+
- Industries: SaaS, HealthTech, FinTech, AI/ML startups
- Needs: Quick API start, good docs, low cost, no vendor lock-in
- Buying trigger: New product needing SMS/Voice, scaling issues, cost pressure

ICP 2 — Enterprise Contact Center:
- 500+ employees, 50+ agents
- Industries: Insurance, Healthcare, Banking, Retail
- Needs: 99.99% uptime, compliance (HIPAA/PCI), CRM integration, AI capabilities
- Buying trigger: Contract renewal, CSAT drop, cost reduction mandate, AI modernization
"""

def icp_domain_qc(companies: list[dict], batch_size: int = 30) -> list[dict]:
    """Layer 4: Validate ICP fit and name→domain correctness via LLM."""
    rejected = []
    
    for i in range(0, len(companies), batch_size):
        batch = companies[i:i+batch_size]
        
        company_list = "\n".join(
            f"{j+1}. {c['company']} | {c.get('domain','')} | {c.get('country_input','')} | {c.get('vertical','')} | {c.get('productFit','')}"
            for j, c in enumerate(batch)
        )
        
        prompt = f"""You are reviewing an ABM target list for Telnyx (CPaaS/telecom). 

ICP PROFILES:
{ICP_PROFILES}

For each company below, check:
1. DOMAIN MATCH: Does the domain look correct for the company name? Flag any where the domain seems wrong (e.g., wrong TLD, misspelling, unrelated domain).
2. ICP FIT: Does this company match EITHER ICP profile above? Consider: Would they buy SMS/Voice/SIP APIs? Are they the right size and industry?

Companies:
{company_list}

Return ONLY a JSON array of companies to REJECT:
[{{"index": <number>, "company": "<name>", "reason": "<domain_mismatch OR icp_mismatch OR both>", "detail": "<brief explanation>"}}]

If a company passes both checks, do NOT include it. Be strict on domain accuracy but reasonable on ICP fit (healthcare comms companies inherently fit)."""

        raw = call_gemini(prompt)
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            try:
                rejects = json.loads(match.group())
                rejected.extend(rejects)
            except json.JSONDecodeError:
                print(f"  Warning: ICP QC batch returned invalid JSON")
        
        if i + batch_size < len(companies):
            time.sleep(1)
    
    return rejected


# ========== EXISTING LIST OVERLAP CHECK ==========

def check_existing_overlap(companies: list[dict]) -> list[str]:
    """Check for overlap with existing ABM lists."""
    existing_domains = set()
    
    # Load existing ABM results
    for filepath in [
        "apac-abm-clean.json",
        "au-abm-strict.json", 
        "abm-hybrid-results.json",
        "abm-enrichment-results.json",
    ]:
        try:
            with open(filepath) as f:
                data = json.load(f)
                if isinstance(data, list):
                    for entry in data:
                        d = entry.get("domain", "").lower().strip()
                        if d:
                            existing_domains.add(d)
                elif isinstance(data, dict) and "results" in data:
                    for entry in data["results"]:
                        d = entry.get("domain", "").lower().strip()
                        if d:
                            existing_domains.add(d)
                        # Also check nested validation
                        val = entry.get("validation", {})
                        if isinstance(val, dict):
                            cd = val.get("clearbit_domain", "").lower().strip()
                            if cd:
                                existing_domains.add(cd)
        except (FileNotFoundError, json.JSONDecodeError):
            pass
    
    overlaps = []
    for c in companies:
        domain = c.get("domain", "").lower().strip()
        if domain in existing_domains:
            overlaps.append(domain)
    
    return overlaps


def main():
    parser = argparse.ArgumentParser(description="ABM Hybrid List Builder")
    parser.add_argument("--limit", type=int, default=25, help="Number of candidates to generate")
    parser.add_argument("--output", type=str, default="abm-hybrid-results.json", help="Output file")
    parser.add_argument("--quiet", action="store_true", help="Suppress verbose output")
    args = parser.parse_args()
    
    verbose = not args.quiet
    
    print("=" * 60)
    print("ABM Hybrid List Builder: Gemini → Perplexica → Clearbit")
    print("=" * 60)
    
    # Layer 1: Generate candidates
    if verbose:
        print(f"\n[Layer 1] Generating {args.limit} candidates via Gemini...")
    
    candidates = generate_candidates(args.limit)
    print(f"  Generated {len(candidates)} candidates")
    
    # Dedup by domain
    seen = set()
    deduped = []
    for c in candidates:
        d = c.get("domain", "").lower().strip()
        if d and d not in seen:
            seen.add(d)
            deduped.append(c)
    if len(deduped) < len(candidates):
        print(f"  Deduped: {len(candidates)} → {len(deduped)} (removed {len(candidates)-len(deduped)} duplicates)")
    candidates = deduped
    
    # Check overlap with existing lists
    overlaps = check_existing_overlap(candidates)
    if overlaps:
        print(f"  Overlap with existing lists: {len(overlaps)} companies")
        candidates = [c for c in candidates if c.get("domain","").lower().strip() not in overlaps]
        print(f"  After removing overlaps: {len(candidates)} candidates")
    
    # Process each candidate
    if verbose:
        print(f"\n[Layer 2+3] Verifying via Perplexica + validating via Clearbit...")
    
    results = []
    for company in candidates:
        result = process_company(company, verbose)
        results.append(result)
        time.sleep(1)  # Rate limiting
    
    # Sort by score
    results.sort(key=lambda x: -x["score"])
    
    # Layer 4: ICP + Domain QC on passed companies
    passed = [r for r in results if r["passed"]]
    if verbose and passed:
        print(f"\n[Layer 4] ICP + Domain QC on {len(passed)} passed companies...")
    
    icp_rejections = icp_domain_qc(passed) if passed else []
    
    # Apply rejections
    rejected_domains = {r.get("company", "").lower() for r in icp_rejections}
    final_results = []
    for r in results:
        if r["company"].lower() in rejected_domains:
            r["icp_rejected"] = True
            matching_reject = next((rej for rej in icp_rejections if rej.get("company","").lower() == r["company"].lower()), {})
            r["icp_reject_reason"] = matching_reject.get("reason", "unknown")
            r["icp_reject_detail"] = matching_reject.get("detail", "")
            r["passed"] = False  # Downgrade
        else:
            r["icp_rejected"] = False
        final_results.append(r)
    
    results = final_results
    
    # Summary stats
    passed = [r for r in results if r["passed"]]
    icp_rejected = [r for r in results if r.get("icp_rejected")]
    perplexica_verified = [r for r in results if r["verification"].get("perplexica_verified")]
    clearbit_found = [r for r in results if r["validation"].get("clearbit_found")]
    emea_confirmed = [r for r in results if r["validation"].get("clearbit_emea")]
    
    summary = f"""
Results Summary:
- Total candidates: {len(results)}
- Deduped/overlap removed: {len(results) - len(passed) - len(icp_rejected) + len([r for r in icp_rejected if r.get('score',0) >= 4])}
- Perplexica verified: {len(perplexica_verified)} ({len(perplexica_verified)/len(results)*100:.0f}%)
- Clearbit found: {len(clearbit_found)} ({len(clearbit_found)/len(results)*100:.0f}%)
- EMEA confirmed: {len(emea_confirmed)} ({len(emea_confirmed)/len(results)*100:.0f}%)
- Passed Perplexica+Clearbit (score ≥ 4): {len(passed) + len(icp_rejected)}
- ICP/domain rejected (Layer 4): {len(icp_rejected)}
- FINAL passed (all layers): {len(passed)} ({len(passed)/len(results)*100:.0f}%)

Top 10 Validated Companies:
"""
    
    for i, r in enumerate(results[:10], 1):
        status = "✓" if r["passed"] else "⚠"
        perplexica = "✓" if r["verification"].get("perplexica_verified") else "✗"
        clearbit = "✓" if r["validation"].get("clearbit_found") else "✗"
        emea = "✓" if r["validation"].get("clearbit_emea") else "?"
        print(f"  {i:2}. {status} {r['company']} ({r['domain']}) - Perplexica:{perplexica} Clearbit:{clearbit} EMEA:{emea} Score:{r['score']}/6")
    
    # Save results
    output = {
        "timestamp": datetime.datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "method": "Gemini → Perplexica → Clearbit hybrid",
        "summary": summary,
        "stats": {
            "total": len(results),
            "perplexica_verified": len(perplexica_verified),
            "clearbit_found": len(clearbit_found),
            "emea_confirmed": len(emea_confirmed),
            "passed": len(passed),
        },
        "results": results,
    }
    
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"\nSaved to {args.output}")
    print(summary)


if __name__ == "__main__":
    main()
