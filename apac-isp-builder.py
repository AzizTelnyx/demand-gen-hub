#!/usr/bin/env python3
"""
APAC ISP List Builder: 300 ISPs, Australia-focused (50%+)

Pipeline:
1. Gemini generates ISP candidates (multiple batches for scale)
2. Perplexica verifies each (real? still operating? services?)
3. Clearbit validates (domain, employees, country HQ)

Usage: python apac-isp-builder.py --limit 300 --output apac-isp-results.json
"""

import argparse
import json
import time
import requests
import datetime
import re
import sys
from datetime import timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

# ========== CONFIG ==========
LITELLM_URL = "http://litellm-aiswe.query.prod.telnyx.io:4000/v1/chat/completions"
LITELLM_KEY = "sk-JcJEnHgGiRKTnIdkGfv3Rw"
PERPLEXICA_URL = "http://localhost:3001"
CLEARBIT_URL = "https://company.clearbit.com/v2/companies/find"
CLEARBIT_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"

APAC_COUNTRIES = {
    "AU", "NZ", "SG", "MY", "TH", "ID", "PH", "VN", "HK", "TW", 
    "JP", "KR", "IN", "PK", "BD", "LK", "MM", "KH", "LA", "BN",
}

ISP_KEYWORDS = [
    "internet", "broadband", "fiber", "nbn", "dsl", "adsl", "vdsl",
    "wireless", "isp", "internet service", "connectivity", "network",
    "telecommunications", "telco", "data", "bandwidth", "leased line",
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
        "temperature": 0.4
    }, timeout=120)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def generate_australian_isps(limit: int = 160) -> list[dict]:
    """Generate Australian ISP candidates."""
    prompt = f"""You are building a prospect list for Telnyx (CPaaS/telecom infrastructure).

Generate {limit} REAL Australian ISPs (Internet Service Providers). 

Include:
- Major ISPs (Telstra, Optus, TPG, Aussie Broadband, etc.)
- Regional ISPs serving specific states/territories
- NBN providers (retail service providers)
- Business/enterprise fiber providers
- Fixed wireless providers
- Smaller independent ISPs

IMPORTANT: 
- These must be REAL companies with working websites
- Include both large and small ISPs
- Prefer active, operating companies
- Do NOT include defunct/acquired companies

Return ONLY a raw JSON array:
[{{"company": "Name", "domain": "example.com.au", "country": "AU", "type": "nbn_rsp|business_fiber|regional|wireless|wholesale", "services": ["nbn", "fiber", "voip", ...], "coverage": "national|state_name|regional"}}]"""

    raw = call_gemini(prompt)
    match = re.search(r'\[.*\]', raw, re.DOTALL)
    if match:
        return json.loads(match.group())
    return []


def generate_apac_isps(limit: int = 150) -> list[dict]:
    """Generate APAC ISP candidates (non-Australia)."""
    prompt = f"""You are building a prospect list for Telnyx (CPaaS/telecom infrastructure).

Generate {limit} REAL ISPs from APAC (excluding Australia).

Distribution target:
- New Zealand: 25 ISPs
- Singapore: 20 ISPs
- Malaysia: 20 ISPs
- Japan: 20 ISPs
- South Korea: 15 ISPs
- Hong Kong: 15 ISPs
- Taiwan: 10 ISPs
- India: 15 ISPs
- Other APAC (Thailand, Indonesia, Philippines, Vietnam): 10 ISPs

Include:
- Major national carriers
- Regional ISPs
- Business/enterprise providers
- Data center connectivity providers

IMPORTANT: 
- These must be REAL companies with working websites
- Include both large and small ISPs
- Do NOT include defunct/acquired companies

Return ONLY a raw JSON array:
[{{"company": "Name", "domain": "example.com", "country": "XX", "type": "consumer|business|wholesale|carrier", "services": ["fiber", "broadband", "voip", ...], "coverage": "national|regional"}}]"""

    raw = call_gemini(prompt)
    match = re.search(r'\[.*\]', raw, re.DOTALL)
    if match:
        return json.loads(match.group())
    return []


# ========== LAYER 2: PERPLEXICA VERIFICATION ==========

def perplexica_search(query: str, mode: str = "speed") -> dict:
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
                             json=payload, timeout=45)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e), "message": None, "sources": []}


def verify_isp_perplexica(company: dict) -> dict:
    """Verify ISP via Perplexica web search."""
    name = company.get("company", "")
    domain = company.get("domain", "")
    
    # Single query for speed
    query = f"{name} {domain} ISP internet service provider"
    result = perplexica_search(query, mode="speed")
    
    message = (result.get("message") or "").lower()
    
    # Check ISP signals
    isp_signals = [
        name.lower() in message,
        domain.lower().replace("www.", "") in message,
        any(kw in message for kw in ISP_KEYWORDS),
    ]
    
    # Check shutdown signals
    shutdown_signals = [
        "shut down" in message,
        "ceased operations" in message,
        "bankrupt" in message,
        "acquired by" in message and "2024" in message or "2025" in message or "2026" in message,
    ]
    
    return {
        "perplexica_verified": sum(isp_signals) >= 2,
        "perplexica_confidence": "high" if sum(isp_signals) >= 2 else "low",
        "still_operating": not any(shutdown_signals),
        "is_isp": any(kw in message for kw in ISP_KEYWORDS),
        "perplexica_summary": (result.get("message") or "")[:300],
    }


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
                "country": (data.get("geo") or {}).get("countryCode", "unknown"),
                "category": f"{(data.get('category') or {}).get('sector', '')}/{(data.get('category') or {}).get('industry', '')}",
            }
        return {"found": False}
    except Exception as e:
        return {"found": False, "error": str(e)}


def validate_isp_clearbit(company: dict) -> dict:
    """Validate ISP via Clearbit."""
    domain = company.get("domain", "")
    clearbit_data = check_clearbit(domain)
    
    if not clearbit_data.get("found"):
        return {
            "clearbit_found": False,
            "clearbit_apac": False,
            "clearbit_australia": False,
        }
    
    country = (clearbit_data.get("country") or "").upper()
    
    return {
        "clearbit_found": True,
        "clearbit_name": clearbit_data.get("name", ""),
        "clearbit_country": country,
        "clearbit_apac": country in APAC_COUNTRIES,
        "clearbit_australia": country == "AU",
        "clearbit_employees": clearbit_data.get("employees", "unknown"),
        "clearbit_category": clearbit_data.get("category", ""),
    }


# ========== MAIN PIPELINE ==========

def process_isp(company: dict, idx: int, total: int, verbose: bool = True) -> dict:
    """Run full pipeline on a single ISP."""
    name = company.get("company", "")
    domain = company.get("domain", "")
    
    if verbose:
        print(f"  [{idx}/{total}] {name} ({domain})...", end=" ", flush=True)
    
    # Layer 2: Perplexica
    perplexica_result = verify_isp_perplexica(company)
    
    # Layer 3: Clearbit
    clearbit_result = validate_isp_clearbit(company)
    
    # Score
    score = 0
    if perplexica_result.get("perplexica_verified"):
        score += 2
    if perplexica_result.get("still_operating"):
        score += 1
    if perplexica_result.get("is_isp"):
        score += 1
    if clearbit_result.get("clearbit_found"):
        score += 1
    if clearbit_result.get("clearbit_apac"):
        score += 1
    
    if verbose:
        status = "✓" if score >= 4 else "⚠" if score >= 2 else "✗"
        au = "🇦🇺" if clearbit_result.get("clearbit_australia") else ""
        print(f"{status} {au} (score={score}/6)")
    
    return {
        "company": name,
        "domain": domain,
        "country_input": company.get("country", ""),
        "type": company.get("type", ""),
        "services": company.get("services", []),
        "coverage": company.get("coverage", ""),
        "verification": perplexica_result,
        "validation": clearbit_result,
        "score": score,
        "passed": score >= 4,
    }


def main():
    parser = argparse.ArgumentParser(description="APAC ISP List Builder")
    parser.add_argument("--limit", type=int, default=300, help="Total ISPs to generate")
    parser.add_argument("--output", type=str, default="apac-isp-results.json", help="Output file")
    parser.add_argument("--quiet", action="store_true", help="Suppress verbose output")
    args = parser.parse_args()
    
    verbose = not args.quiet
    
    # Calculate split
    au_count = int(args.limit * 0.55)  # 55% Australia
    apac_count = args.limit - au_count  # 45% rest of APAC
    
    print("=" * 60)
    print("APAC ISP List Builder: Gemini → Perplexica → Clearbit")
    print(f"Target: {args.limit} ISPs ({au_count} AU, {apac_count} other APAC)")
    print("=" * 60)
    
    # Layer 1: Generate candidates
    if verbose:
        print(f"\n[Layer 1] Generating candidates via Gemini...")
        print(f"  Australian ISPs: {au_count}...")
    
    au_isps = generate_australian_isps(au_count)
    print(f"  Generated {len(au_isps)} Australian ISPs")
    
    if verbose:
        print(f"  Other APAC ISPs: {apac_count}...")
    
    apac_isps = generate_apac_isps(apac_count)
    print(f"  Generated {len(apac_isps)} other APAC ISPs")
    
    all_isps = au_isps + apac_isps
    print(f"\n  Total: {len(all_isps)} candidates")
    
    # Process each
    if verbose:
        print(f"\n[Layer 2+3] Verifying via Perplexica + validating via Clearbit...")
    
    results = []
    total = len(all_isps)
    
    for i, isp in enumerate(all_isps, 1):
        result = process_isp(isp, i, total, verbose)
        results.append(result)
        time.sleep(0.5)  # Rate limiting
    
    # Sort by score
    results.sort(key=lambda x: -x["score"])
    
    # Stats
    passed = [r for r in results if r["passed"]]
    au_passed = [r for r in passed if r["validation"].get("clearbit_australia")]
    apac_passed = [r for r in passed if r["validation"].get("clearbit_apac")]
    
    print(f"\n{'='*60}")
    print(f"Results Summary:")
    print(f"- Total candidates: {len(results)}")
    print(f"- Passed validation (score ≥ 4): {len(passed)} ({len(passed)/len(results)*100:.0f}%)")
    print(f"- Australia confirmed: {len(au_passed)} ({len(au_passed)/len(results)*100:.0f}%)")
    print(f"- Other APAC confirmed: {len(apac_passed) - len(au_passed)}")
    print(f"{'='*60}")
    
    # Save
    output = {
        "timestamp": datetime.datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "method": "Gemini → Perplexica → Clearbit hybrid",
        "target": {"total": args.limit, "australia": au_count, "other_apac": apac_count},
        "stats": {
            "total": len(results),
            "passed": len(passed),
            "australia": len(au_passed),
            "apac": len(apac_passed),
        },
        "results": results,
    }
    
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
