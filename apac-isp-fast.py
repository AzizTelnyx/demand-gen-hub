#!/usr/bin/env python3
"""
APAC ISP List Builder - Clearbit Only (faster, more reliable)
Run this first, then optionally verify with Perplexica later.
"""

import argparse
import json
import time
import requests
import datetime
import re
from datetime import timezone

LITELLM_URL = "http://litellm-aiswe.query.prod.telnyx.io:4000/v1/chat/completions"
LITELLM_KEY = "sk-JcJEnHgGiRKTnIdkGfv3Rw"
CLEARBIT_URL = "https://company.clearbit.com/v2/companies/find"
CLEARBIT_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"

APAC_COUNTRIES = {"AU", "NZ", "SG", "MY", "TH", "ID", "PH", "VN", "HK", "TW", "JP", "KR", "IN", "PK", "BD", "LK", "MM", "KH", "LA", "BN"}


def call_gemini(prompt: str) -> str:
    resp = requests.post(LITELLM_URL, headers={"Authorization": f"Bearer {LITELLM_KEY}"}, json={
        "model": "gemini/gemini-2.0-flash",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.4
    }, timeout=120)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def generate_au_isps(limit: int) -> list:
    prompt = f"""Generate {limit} REAL Australian ISPs. Include major (Telstra, Optus, TPG, Aussie Broadband), regional, NBN RSPs, business fiber, wireless providers. Return JSON: [{{"company":"Name","domain":"example.com.au","country":"AU","type":"nbn_rsp|fiber|wireless|regional"}}]"""
    raw = call_gemini(prompt)
    match = re.search(r'\[.*\]', raw, re.DOTALL)
    return json.loads(match.group()) if match else []


def generate_apac_isps(limit: int) -> list:
    prompt = f"""Generate {limit} REAL ISPs from APAC (NZ:25, SG:20, MY:20, JP:20, KR:15, HK:15, TW:10, IN:15, others:10). Return JSON: [{{"company":"Name","domain":"example.com","country":"XX","type":"consumer|business|carrier"}}]"""
    raw = call_gemini(prompt)
    match = re.search(r'\[.*\]', raw, re.DOTALL)
    return json.loads(match.group()) if match else []


def check_clearbit(domain: str) -> dict:
    try:
        resp = requests.get(CLEARBIT_URL, params={"domain": domain},
                           headers={"Authorization": f"Bearer {CLEARBIT_KEY}"}, timeout=15)
        if resp.status_code == 200:
            d = resp.json()
            return {"found": True, "name": d.get("name", ""), "country": (d.get("geo") or {}).get("countryCode", ""),
                    "employees": (d.get("metrics") or {}).get("employeesRange", "unknown")}
        return {"found": False}
    except:
        return {"found": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=300)
    parser.add_argument("--output", type=str, default="apac-isp-results.json")
    args = parser.parse_args()

    au = int(args.limit * 0.55)
    apac = args.limit - au

    print(f"Generating {args.limit} ISPs ({au} AU, {apac} APAC)...")

    print(f"  Australian ISPs...")
    au_isps = generate_au_isps(au)
    print(f"  Generated {len(au_isps)}")

    print(f"  APAC ISPs...")
    apac_isps = generate_apac_isps(apac)
    print(f"  Generated {len(apac_isps)}")

    all_isps = au_isps + apac_isps
    print(f"\nValidating {len(all_isps)} via Clearbit...")

    results = []
    for i, isp in enumerate(all_isps, 1):
        name = isp.get("company", "")
        domain = isp.get("domain", "")
        print(f"  [{i}/{len(all_isps)}] {name}...", end=" ", flush=True)
        
        cb = check_clearbit(domain)
        country = cb.get("country", "").upper() if cb.get("found") else ""
        
        passed = cb.get("found", False)
        status = "✓" if passed else "✗"
        au_flag = "🇦🇺" if country == "AU" else ""
        print(f"{status} {au_flag}")
        
        results.append({
            "company": name, "domain": domain,
            "country_input": isp.get("country", ""),
            "country_clearbit": country,
            "clearbit_found": cb.get("found", False),
            "clearbit_au": country == "AU",
            "clearbit_apac": country in APAC_COUNTRIES,
            "employees": cb.get("employees", "unknown") if cb.get("found") else "N/A",
            "passed": passed
        })
        time.sleep(0.3)

    passed = [r for r in results if r["passed"]]
    au_passed = [r for r in passed if r["clearbit_au"]]
    
    print(f"\nDone: {len(passed)}/{len(results)} validated, {len(au_passed)} Australia")

    output = {"timestamp": datetime.datetime.now(timezone.utc).isoformat(),
              "stats": {"total": len(results), "passed": len(passed), "australia": len(au_passed)},
              "results": results}
    
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)
    print(f"Saved to {args.output}")


if __name__ == "__main__":
    main()
