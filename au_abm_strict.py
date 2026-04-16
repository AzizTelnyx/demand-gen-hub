#!/usr/bin/env python3
import json, re, time, requests, csv
from datetime import datetime, timezone

LITELLM_URL = "http://litellm-aiswe.query.prod.telnyx.io:4000/v1/chat/completions"
LITELLM_KEY = "sk-JcJEnHgGiRKTnIdkGfv3Rw"
CLEARBIT_URL = "https://company.clearbit.com/v2/companies/find"
CLEARBIT_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"

TARGET = 100
COUNTRY = "AU"

EXCLUDE_TERMS = [
    "telecommunications","telecom","wireless","carrier","mobile network",
    "internet service provider","isp","broadband","fiber network","network operator",
    "cpaas","communications platform","ucaas","ccaas","contact center software",
    "voip provider","sip trunk provider","sms gateway","wholesale voice","wholesale sms",
    "marketplace","graphic design","design platform","project management","accounting software"
]
EXCLUDE_NAMES = {
    "telstra","optus","vodafone","tpg","iinet","aussie broadband","internode","dodo",
    "twilio","vonage","bandwidth","plivo","sinch","messagebird","infobip","signalwire",
    "vapi","retell","livekit","bland","deepgram","assemblyai","kore.ai","voiceflow",
    "genesys","talkdesk","five9","nice","dialpad","ringcentral","8x8","nextiva","aircall",
    "canva","atlassian","xero","airwallex"
}

PROMPT = """Find real AUSTRALIA-headquartered companies that are strong buyers of Telnyx Voice AI infrastructure.

Include only these types of companies:
1. AI agent / voice agent builders — companies building AI agents, voice agents, conversational AI, AI receptionists, AI SDRs, AI support agents, AI calling products, dialers, voicebots, or call automation products.
2. Vertical software companies with a phone-native workflow — healthcare, fintech, collections, travel support, scheduling, patient access, verification, concierge, service operations, or customer support workflows where phone calls are central to the product/workflow.
3. Platform builders embedding voice automation — software companies where telephony, SIP, call routing, numbers, or AI calling is a core product component.

A company must have at least one strong signal:
- product/site mentions voice agents, AI agents, conversational AI, voicebot, call automation, dialer, phone assistant, or contact center automation
- OR job postings mention telephony, SIP, voice infrastructure, call center automation, Twilio, Vonage, Bandwidth, or Plivo
- OR the company clearly operates a phone-heavy workflow central to the product

Exclude:
- generic SaaS
- marketplaces
- broad ecommerce companies
- design/accounting/project-management software
- telecom carriers
- ISPs
- CPaaS / UCaaS / CCaaS vendors
- wholesale voice/SMS providers
- network operators
- direct competitors

Return JSON only with fields:
company, domain, country, icpBucket, voiceSignal, whyFit
"""

def llm(prompt):
    r = requests.post(LITELLM_URL, headers={"Authorization": f"Bearer {LITELLM_KEY}"}, json={
        "model": "gemini/gemini-2.0-flash",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3
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
                "employees": d.get("metrics", {}).get("employees")
            }
    except Exception:
        pass
    return {"found": False}

def parse_array(raw):
    m = re.search(r'\[.*\]', raw, re.DOTALL)
    return json.loads(m.group()) if m else []

def excluded(name, domain, cb):
    n = (name or "").strip().lower()
    d = (domain or "").replace("www.","").lower()
    if n in EXCLUDE_NAMES or d in EXCLUDE_NAMES:
        return True, "excluded_name"
    blob = " ".join([name or "", domain or "", cb.get("industry",""), cb.get("sector",""), cb.get("description","")]).lower()
    for t in EXCLUDE_TERMS:
        if t in blob:
            return True, t
    return False, ""

def main():
    accepted, rejected = [], []
    seen = set()
    batch = 1
    while len(accepted) < TARGET and batch <= 12:
        prompt = PROMPT + f"\nBatch {batch}. Return 25 fresh Australian companies only. Avoid repeats."
        raw = llm(prompt)
        arr = parse_array(raw)
        for c in arr:
            name = c.get("company","").strip()
            domain = c.get("domain","").strip().lower()
            if not name or not domain:
                continue
            key = (name.lower(), domain)
            if key in seen:
                continue
            seen.add(key)
            cb = clearbit(domain)
            if not cb.get("found"):
                rejected.append({**c, "reason": "clearbit_not_found"})
                continue
            if cb.get("country") != COUNTRY:
                rejected.append({**c, "reason": f"not_au:{cb.get('country','')}"})
                continue
            bad, reason = excluded(name, domain, cb)
            if bad:
                rejected.append({**c, "reason": f"excluded:{reason}", "clearbit": cb})
                continue
            row = {
                "company": name,
                "domain": domain,
                "country": cb.get("country"),
                "icpBucket": c.get("icpBucket", ""),
                "voiceSignal": c.get("voiceSignal", ""),
                "whyFit": c.get("whyFit", ""),
                "clearbit_industry": cb.get("industry", ""),
                "clearbit_sector": cb.get("sector", ""),
                "employees": cb.get("employees")
            }
            accepted.append(row)
            print(f"[{len(accepted)}] {name} — {row['icpBucket']}")
            if len(accepted) >= TARGET:
                break
            time.sleep(0.15)
        batch += 1
        time.sleep(1)
    out = {
        "timestamp": str(datetime.now(timezone.utc)),
        "target": TARGET,
        "country": COUNTRY,
        "stats": {"accepted": len(accepted), "rejected": len(rejected), "seen": len(seen)},
        "results": accepted,
        "rejected": rejected[:200]
    }
    with open("au-abm-strict.json", "w") as f:
        json.dump(out, f, indent=2)
    with open("au-abm-strict.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["company","domain","country","icpBucket","voiceSignal","whyFit","clearbit_industry","clearbit_sector","employees"])
        w.writeheader(); w.writerows(accepted)
    print(json.dumps(out["stats"], indent=2))

if __name__ == "__main__":
    main()
