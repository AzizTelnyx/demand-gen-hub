#!/usr/bin/env python3
"""
APAC ISP Builder - Batched with checkpointing
Processes 50 at a time, saves after each batch.
"""

import json, time, requests, re, sys
from datetime import timezone, datetime

LITELLM_URL = "http://litellm-aiswe.query.prod.telnyx.io:4000/v1/chat/completions"
LITELLM_KEY = "sk-JcJEnHgGiRKTnIdkGfv3Rw"
CLEARBIT_URL = "https://company.clearbit.com/v2/companies/find"
CLEARBIT_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"

APAC = {"AU", "NZ", "SG", "MY", "TH", "ID", "PH", "VN", "HK", "TW", "JP", "KR", "IN"}

def gemini(prompt):
    r = requests.post(LITELLM_URL, headers={"Authorization": f"Bearer {LITELLM_KEY}"},
        json={"model": "gemini/gemini-2.0-flash", "messages": [{"role": "user", "content": prompt}]}, timeout=60)
    return r.json()["choices"][0]["message"]["content"]

def clearbit(domain):
    try:
        r = requests.get(CLEARBIT_URL, params={"domain": domain},
            headers={"Authorization": f"Bearer {CLEARBIT_KEY}"}, timeout=8)
        if r.status_code == 200:
            d = r.json()
            return {"found": True, "country": (d.get("geo") or {}).get("countryCode", "")}
    except: pass
    return {"found": False, "country": ""}

def gen_au(n):
    raw = gemini(f"List {n} REAL Australian ISPs. Include major, regional, NBN RSPs, business fiber. JSON only: [{{\"company\":\"Name\",\"domain\":\"example.com.au\"}}]")
    m = re.search(r'\[.*\]', raw, re.DOTALL)
    return json.loads(m.group()) if m else []

def gen_apac(n):
    raw = gemini(f"List {n} REAL APAC ISPs (NZ:30%, SG:20%, MY:15%, JP:15%, KR:10%, others:10%). JSON only: [{{\"company\":\"Name\",\"domain\":\"example.com\",\"country\":\"XX\"}}]")
    m = re.search(r'\[.*\]', raw, re.DOTALL)
    return json.loads(m.group()) if m else []

def process_batch(isps, output_file, append=False):
    """Process a batch and save immediately."""
    results = []
    
    if append:
        try:
            with open(output_file) as f:
                existing = json.load(f)
                results = existing.get("results", [])
        except: pass
    
    start = len(results)
    
    for i, isp in enumerate(isps, 1):
        name = isp.get("company", "")
        domain = isp.get("domain", "")
        cb = clearbit(domain)
        country = cb.get("country", "")
        
        results.append({
            "company": name,
            "domain": domain,
            "country": country,
            "clearbit_found": cb["found"],
            "is_au": country == "AU",
            "is_apac": country in APAC
        })
        
        # Save after each one
        passed = [r for r in results if r["clearbit_found"]]
        au = [r for r in passed if r["is_au"]]
        
        with open(output_file, "w") as f:
            json.dump({
                "timestamp": str(datetime.now(timezone.utc)),
                "stats": {"total": len(results), "passed": len(passed), "australia": len(au)},
                "results": results
            }, f)
        
        print(f"[{start + i}] {name}: {'✓' if cb['found'] else '✗'} {'🇦🇺' if country == 'AU' else ''}")
        sys.stdout.flush()
    
    return results

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--batch", type=int, default=50)
    p.add_argument("--output", default="apac-isp-results.json")
    p.add_argument("--au", type=int, default=160)
    p.add_argument("--apac", type=int, default=140)
    args = p.parse_args()
    
    print(f"Generating {args.au} AU + {args.apac} APAC ISPs in batches of {args.batch}")
    
    # Generate all candidates first
    print("\nGenerating Australian ISPs...")
    au_isps = gen_au(args.au)
    print(f"Got {len(au_isps)}")
    
    print("\nGenerating APAC ISPs...")
    apac_isps = gen_apac(args.apac)
    print(f"Got {len(apac_isps)}")
    
    all_isps = au_isps + apac_isps
    print(f"\nTotal: {len(all_isps)} candidates")
    
    # Process in batches
    for i in range(0, len(all_isps), args.batch):
        batch = all_isps[i:i+args.batch]
        print(f"\n--- Batch {i//args.batch + 1} ({len(batch)} ISPs) ---")
        process_batch(batch, args.output, append=(i > 0))
    
    # Final stats
    with open(args.output) as f:
        final = json.load(f)
    print(f"\n✓ Done: {final['stats']['passed']} validated, {final['stats']['australia']} Australia")
    print(f"Saved to {args.output}")
