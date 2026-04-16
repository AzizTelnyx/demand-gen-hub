#!/usr/bin/env python3
import json, re, time, requests
from datetime import datetime, timezone

LITELLM_URL = "http://litellm-aiswe.query.prod.telnyx.io:4000/v1/chat/completions"
LITELLM_KEY = "sk-JcJEnHgGiRKTnIdkGfv3Rw"
CLEARBIT_URL = "https://company.clearbit.com/v2/companies/find"
CLEARBIT_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"

APAC = {"AU","NZ","SG","MY","TH","ID","PH","VN","HK","TW","JP","KR","IN"}
EXCLUDE_TERMS = [
    "telecommunications","telecom","wireless","carrier","mobile network",
    "internet service provider","isp","broadband","fiber network","network operator",
    "cpaas","communications platform","ucaas","ccaas","contact center software",
    "voip provider","sip trunk provider","sms gateway","wholesale voice","wholesale sms"
]
EXCLUDE_NAMES = {"telstra","optus","vodafone","singtel","starhub","m1","airtel","jio",
                 "genesys","talkdesk","five9","twilio","vonage","bandwidth","plivo","sinch",
                 "messagebird","vapi","retell","livekit","bland","deepgram","assemblyai","kore.ai"}

PROFILE = """APAC-headquartered likely buyers of Telnyx Voice AI infrastructure: AI-native startups, SaaS platforms, healthcare tech, fintech, travel tech, BPOs, contact-center operators, and product companies building or deploying voice agents, conversational AI, calling automation, phone-based workflows, or real-time voice experiences. Exclude telecom carriers, ISPs, CPaaS/UCaaS/CCaaS vendors, wholesale voice/SMS providers, and network operators. Favor companies with clear voice use cases, engineering-led products, or customer operations automation."""


def gemini(prompt):
    r = requests.post(LITELLM_URL, headers={"Authorization": f"Bearer {LITELLM_KEY}"}, json={
        "model": "gemini/gemini-2.0-flash",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.4
    }, timeout=90)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def clearbit(domain):
    try:
        r = requests.get(CLEARBIT_URL, params={"domain": domain}, headers={"Authorization": f"Bearer {CLEARBIT_KEY}"}, timeout=10)
        if r.status_code == 200:
            d = r.json()
            geo = d.get("geo") or {}
            cat = d.get("category") or {}
            return {
                "found": True,
                "country": geo.get("countryCode", ""),
                "industry": d.get("industry", "") or cat.get("industry", ""),
                "sector": d.get("sector", "") or cat.get("sector", ""),
                "description": d.get("description", ""),
                "name": d.get("name", ""),
                "employees": d.get("metrics", {}).get("employees")
            }
    except Exception:
        pass
    return {"found": False}


def parse_json_array(raw):
    m = re.search(r'\[.*\]', raw, re.DOTALL)
    if not m:
        return []
    return json.loads(m.group())


def is_excluded(name, domain, cb):
    n = (name or "").strip().lower()
    d = (domain or "").replace("www.","").lower()
    if n in EXCLUDE_NAMES or d in EXCLUDE_NAMES:
        return True, "competitor/carrier"
    combined = " ".join([
        name or "", domain or "", cb.get("industry") or "", cb.get("sector") or "", cb.get("description") or ""
    ]).lower()
    for t in EXCLUDE_TERMS:
        if t in combined:
            return True, t
    return False, ""


def build_prompt(batch_num):
    return f'''Find 30 REAL APAC-headquartered companies matching this ICP:\n{PROFILE}\n\nReturn only JSON array with: company, domain, country, vertical, useCase, whyFit.\n\nRules:\n- Real companies only\n- HQ must be in APAC\n- Exclude telecom carriers, ISPs, CPaaS/UCaaS/CCaaS, wholesale voice/SMS, network operators\n- Prioritize AI-native startups, SaaS, healthcare tech, fintech, travel tech, BPO/contact center operators\n- Vary countries across APAC\n- Batch {batch_num}: give fresh names, avoid obvious repeats like Telstra/Optus/Vodafone/Singtel/Airtel/Jio\n'''


def main():
    candidates = []
    seen = set()
    for batch in range(1, 5):
        raw = gemini(build_prompt(batch))
        arr = parse_json_array(raw)
        for x in arr:
            key = (x.get("company","" ).lower(), x.get("domain","" ).lower())
            if key not in seen and x.get("company") and x.get("domain"):
                seen.add(key)
                candidates.append(x)
        time.sleep(1)

    results = []
    rejected = []
    for i, c in enumerate(candidates, 1):
        cb = clearbit(c.get("domain",""))
        if not cb.get("found"):
            rejected.append({**c, "reason": "clearbit_not_found"})
            continue
        country = cb.get("country", "") or c.get("country", "")
        if country not in APAC:
            rejected.append({**c, "reason": f"non_apac_hq:{country}"})
            continue
        bad, reason = is_excluded(c.get("company"), c.get("domain"), cb)
        if bad:
            rejected.append({**c, "reason": f"excluded:{reason}", "clearbit": cb})
            continue
        results.append({
            "company": c.get("company"),
            "domain": c.get("domain"),
            "country": country,
            "vertical": c.get("vertical"),
            "useCase": c.get("useCase"),
            "whyFit": c.get("whyFit"),
            "clearbit_industry": cb.get("industry"),
            "clearbit_sector": cb.get("sector"),
            "employees": cb.get("employees")
        })
        print(f"[{len(results)}] {c.get('company')} ({country})")
        if len(results) >= 60:
            break
        time.sleep(0.2)

    out = {
        "timestamp": str(datetime.now(timezone.utc)),
        "profile": PROFILE,
        "stats": {"candidates": len(candidates), "accepted": len(results), "rejected": len(rejected)},
        "results": results,
        "rejected": rejected[:100]
    }
    with open("apac-abm-clean.json", "w") as f:
        json.dump(out, f, indent=2)
    with open("apac-abm-clean.csv", "w") as f:
        f.write("company,domain,country,vertical,useCase,whyFit,clearbit_industry,clearbit_sector,employees\n")
        for r in results:
            vals = [r.get(k,"") for k in ["company","domain","country","vertical","useCase","whyFit","clearbit_industry","clearbit_sector","employees"]]
            vals = [str(v).replace('"','""') for v in vals]
            f.write('"' + '","'.join(vals) + '"\n')
    print(json.dumps(out["stats"], indent=2))

if __name__ == "__main__":
    main()
