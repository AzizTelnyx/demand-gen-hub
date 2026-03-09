#!/usr/bin/env python3
"""ABM Method Comparison: 3 methods for EMEA healthcare comms list building."""

import json, time, requests, datetime, sys, re
from urllib.parse import urlparse

LITELLM_URL = "http://litellm-aiswe.query.prod.telnyx.io:4000/v1/chat/completions"
LITELLM_KEY = "sk-JcJEnHgGiRKTnIdkGfv3Rw"
CLEARBIT_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"
CLEARBIT_URL = "https://company.clearbit.com/v2/companies/find"
OUTPUT_PATH = "/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/abm-method-comparison.json"

# Method 1 results (already fetched from Gemini Flash)
METHOD1_RAW = [
    {"company": "Lumeon", "domain": "lumeon.com", "country": "UK", "vertical": "Patient Engagement", "productFit": "care-pathway-automation", "description": "Care pathway management platform that automates and orchestrates care delivery, engaging patients throughout their journey."},
    {"company": "AccuRx", "domain": "accurx.com", "country": "UK", "vertical": "Clinical Messaging", "productFit": "patient-communication", "description": "Communication platform used by GPs and healthcare staff to communicate with patients via SMS, video, and online forms."},
    {"company": "Visionable", "domain": "visionable.com", "country": "UK", "vertical": "Telehealth Communication", "productFit": "video-collaboration", "description": "Secure video collaboration platform designed for healthcare professionals."},
    {"company": "Babylon Health", "domain": "babylonhealth.com", "country": "UK", "vertical": "Telehealth Communication", "productFit": "ai-health-assistant", "description": "Digital healthcare company providing AI-powered health information and virtual consultations."},
    {"company": "Infermedica", "domain": "infermedica.com", "country": "Poland", "vertical": "Voice AI for Healthcare", "productFit": "ai-triage", "description": "AI-driven platform for preliminary diagnosis and triage."},
    {"company": "Pando Health", "domain": "pando.ai", "country": "UK", "vertical": "Clinical Messaging", "productFit": "secure-messaging", "description": "Secure messaging app for healthcare teams."},
    {"company": "DrDoctor", "domain": "drdoctor.co.uk", "country": "UK", "vertical": "Appointment Reminders", "productFit": "appointment-management", "description": "Patient engagement platform focused on appointment management and reminders."},
    {"company": "Medigate", "domain": "medigate.com", "country": "Israel", "vertical": "Healthcare Contact Centers", "productFit": "iot-security", "description": "Cybersecurity platform for healthcare connected medical devices."},
    {"company": "Ada Health", "domain": "ada.com", "country": "Germany", "vertical": "Voice AI for Healthcare", "productFit": "symptom-assessment", "description": "AI-powered health companion for symptom assessment."},
    {"company": "KRY (LIVI)", "domain": "kry.se", "country": "Sweden", "vertical": "Telehealth Communication", "productFit": "video-consultations", "description": "Digital healthcare provider offering video consultations."},
    {"company": "Visiba Care", "domain": "visibacare.com", "country": "Sweden", "vertical": "Telehealth Communication", "productFit": "virtual-clinic", "description": "Platform for creating and managing virtual clinics."},
    {"company": "Siilo", "domain": "siilo.com", "country": "Netherlands", "vertical": "Clinical Messaging", "productFit": "secure-messaging", "description": "Secure messaging app for healthcare professionals."},
    {"company": "Zava", "domain": "zavamed.com", "country": "UK", "vertical": "Telehealth Communication", "productFit": "online-doctor", "description": "Online doctor service providing remote consultations."},
    {"company": "Push Doctor", "domain": "pushdoctor.co.uk", "country": "UK", "vertical": "Telehealth Communication", "productFit": "video-consultations", "description": "Online GP service offering video consultations."},
    {"company": "eConsult Health", "domain": "econsult.health", "country": "UK", "vertical": "Patient Engagement", "productFit": "online-consultation", "description": "Online consultation platform for patient triage."},
    {"company": "HealthHero", "domain": "healthhero.com", "country": "UK", "vertical": "Telehealth Communication", "productFit": "virtual-gp", "description": "Digital health company providing virtual GP services."},
    {"company": "Medloop", "domain": "medloop.com", "country": "Germany", "vertical": "Patient Engagement", "productFit": "patient-portal", "description": "Patient portal for medical records and appointment scheduling."},
    {"company": "Doctolib", "domain": "doctolib.fr", "country": "France", "vertical": "Appointment Reminders", "productFit": "appointment-booking", "description": "Online appointment booking platform for doctors and patients."},
    {"company": "Qunomedical", "domain": "qunomedical.com", "country": "Germany", "vertical": "Patient Engagement", "productFit": "medical-travel", "description": "Platform connecting patients with vetted doctors worldwide."},
    {"company": "Medneo", "domain": "medneo.com", "country": "Germany", "vertical": "Patient Engagement", "productFit": "diagnostic-imaging", "description": "Diagnostic imaging services with patient portal."},
    {"company": "Arteria AI", "domain": "arteria.ai", "country": "UK", "vertical": "Voice AI for Healthcare", "productFit": "document-intelligence", "description": "AI-powered document intelligence platform."},
    {"company": "Sensely", "domain": "sensely.com", "country": "UK", "vertical": "Voice AI for Healthcare", "productFit": "virtual-nurse", "description": "AI-powered virtual nurse assistant."},
    {"company": "Talkdesk", "domain": "talkdesk.com", "country": "Portugal", "vertical": "Healthcare Contact Centers", "productFit": "cloud-contact-center", "description": "Cloud contact center platform for patient communication."},
    {"company": "Avoa", "domain": "avoa.com", "country": "Finland", "vertical": "Patient Engagement", "productFit": "patient-flow", "description": "Real-time location services and patient flow management."},
    {"company": "Cognigy", "domain": "cognigy.com", "country": "Germany", "vertical": "Healthcare Contact Centers", "productFit": "conversational-ai", "description": "Conversational AI platform for patient interactions."},
]

def call_gemini(prompt):
    """Call Gemini Flash via LiteLLM."""
    resp = requests.post(LITELLM_URL, headers={
        "Authorization": f"Bearer {LITELLM_KEY}",
        "Content-Type": "application/json"
    }, json={
        "model": "gemini/gemini-2.0-flash",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3
    }, timeout=60)
    return resp.json()["choices"][0]["message"]["content"]

def check_domain(domain):
    """Check if domain resolves via HTTP HEAD."""
    for scheme in ["https", "http"]:
        try:
            r = requests.head(f"{scheme}://{domain}", timeout=5, allow_redirects=True)
            return True
        except:
            continue
    return False

def check_clearbit(domain):
    """Get Clearbit data for a domain. Rate limited externally."""
    try:
        r = requests.get(CLEARBIT_URL, params={"domain": domain},
                        headers={"Authorization": f"Bearer {CLEARBIT_KEY}"},
                        timeout=10)
        if r.status_code == 200:
            data = r.json()
            return {
                "found": True,
                "employees": data.get("metrics", {}).get("employeesRange", "unknown"),
                "country": data.get("geo", {}).get("countryCode", "unknown"),
                "category_industry": f"{data.get('category', {}).get('sector', '')}/{data.get('category', {}).get('industry', '')}",
                "category_sub": data.get("category", {}).get("subIndustry", ""),
                "description": data.get("description", ""),
                "tech": data.get("tech", [])[:10],
                "name": data.get("name", ""),
            }
        return {"found": False}
    except Exception as e:
        return {"found": False, "error": str(e)}

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

def is_healthcare_comms(clearbit_data, company_desc):
    """Determine if company is genuinely healthcare comms."""
    if not clearbit_data.get("found"):
        return False, "No Clearbit data"
    
    text = f"{clearbit_data.get('category_industry', '')} {clearbit_data.get('category_sub', '')} {clearbit_data.get('description', '')} {company_desc}".lower()
    
    has_health = any(kw in text for kw in HEALTHCARE_KEYWORDS)
    comms_keywords = ["communication", "messaging", "engagement", "appointment", "remind", "contact center",
                      "voice", "chat", "sms", "video consult", "telehealth", "telemedicine", "virtual care",
                      "patient portal", "booking", "scheduling", "triage", "symptom"]
    has_comms = any(kw in text for kw in comms_keywords)
    
    if has_health and has_comms:
        return True, "Healthcare + communication/engagement match"
    elif has_health:
        return False, "Healthcare but not specifically comms/engagement"
    else:
        return False, "Not healthcare"

def is_emea(clearbit_data):
    """Check if EMEA HQ based on Clearbit country."""
    if not clearbit_data.get("found"):
        return False
    country = (clearbit_data.get("country") or "").upper()
    return country in EMEA_COUNTRIES

def validate_company(company, clearbit_data=None):
    """Full validation for a company."""
    domain = company["domain"]
    
    domain_ok = check_domain(domain)
    
    if clearbit_data is None:
        time.sleep(1)  # rate limit
        clearbit_data = check_clearbit(domain)
    
    hc_ok, hc_reason = is_healthcare_comms(clearbit_data, company.get("description", ""))
    emea_ok = is_emea(clearbit_data)
    
    return {
        "domain_resolves": domain_ok,
        "clearbit_found": clearbit_data.get("found", False),
        "clearbit_employees": clearbit_data.get("employees", "unknown") if clearbit_data.get("found") else "N/A",
        "clearbit_country": clearbit_data.get("country", "unknown") if clearbit_data.get("found") else "N/A",
        "clearbit_category_industry": clearbit_data.get("category_industry", "N/A") if clearbit_data.get("found") else "N/A",
        "is_healthcare_comms": hc_ok,
        "healthcare_reason": hc_reason,
        "is_emea_hq": emea_ok,
    }

def generate_method2():
    """Method 2: Use Gemini to generate web-search-style results with different prompting."""
    print("\n=== METHOD 2: Web-sourced approach via Gemini (simulating Brave Search) ===")
    
    # Since Brave Search API key isn't available, we'll use Gemini with web-grounded prompts
    # that simulate what web search would find
    prompt = """You are helping build an ABM target list. I need you to find 25 REAL healthcare communication/patient engagement companies headquartered in EMEA.

Search your knowledge for companies that appear in:
- Healthcare IT news articles about European patient engagement
- NHS Digital supplier lists
- EU digital health directories
- European healthtech startup databases (like Sifted, EU-Startups)
- German, French, Dutch, Nordic healthtech ecosystems

Focus specifically on: patient messaging, appointment reminders, clinical communication, healthcare contact centers, patient intake, voice AI for healthcare, telehealth platforms that emphasize communication.

IMPORTANT: These must be REAL companies with working websites. Prefer companies you're confident exist.
Do NOT include: Babylon Health, AccuRx, Doctolib, KRY/LIVI, Ada Health (already found).

Return ONLY a raw JSON array: [{"company": "Name", "domain": "example.com", "country": "XX", "vertical": "category", "productFit": "what-they-fit", "description": "brief"}]"""

    raw = call_gemini(prompt)
    # Extract JSON from response
    match = re.search(r'\[.*\]', raw, re.DOTALL)
    if match:
        return json.loads(match.group())
    return []

def generate_method3_extra():
    """Method 3: Additional candidates via different Gemini prompt."""
    print("\n=== METHOD 3: Additional search for Clearbit-validated list ===")
    
    prompt = """Find 15 healthcare communication/patient engagement companies in EMEA that are:
1. Startups or scale-ups founded 2015-2024
2. Focused on NHS digital health communication
3. European healthtech companies doing patient messaging, appointment systems, or healthcare voice AI

These should be DIFFERENT from mainstream names. Think smaller, specialized companies.
Include companies from UK, Germany, France, Netherlands, Nordics, Israel.

Return ONLY a raw JSON array: [{"company": "Name", "domain": "example.com", "country": "XX", "vertical": "category", "productFit": "what-they-fit", "description": "brief"}]"""

    raw = call_gemini(prompt)
    match = re.search(r'\[.*\]', raw, re.DOTALL)
    if match:
        return json.loads(match.group())
    return []

def main():
    print("Starting ABM Method Comparison...")
    print(f"Method 1: {len(METHOD1_RAW)} companies from Gemini Flash")
    
    # Method 2
    method2_raw = generate_method2()
    print(f"Method 2: {len(method2_raw)} companies from web-sourced Gemini")
    
    # Method 3 extra candidates
    method3_extra = generate_method3_extra()
    print(f"Method 3 extra: {len(method3_extra)} additional candidates")
    
    # Build unique domain set for all companies
    all_companies = {}
    m1_domains = set()
    m2_domains = set()
    
    for c in METHOD1_RAW:
        d = c["domain"].lower()
        all_companies[d] = c
        m1_domains.add(d)
    
    for c in method2_raw:
        d = c["domain"].lower()
        all_companies[d] = c
        m2_domains.add(d)
    
    # Method 3 = combined M1 + M2 + extra, then Clearbit-validated top 25
    m3_candidates = dict(all_companies)
    for c in method3_extra:
        d = c["domain"].lower()
        m3_candidates[d] = c
    
    print(f"\nTotal unique domains to validate: {len(m3_candidates)}")
    
    # Validate ALL unique companies through Clearbit
    clearbit_cache = {}
    print("\n=== VALIDATING ALL COMPANIES ===")
    for i, (domain, company) in enumerate(m3_candidates.items()):
        print(f"  [{i+1}/{len(m3_candidates)}] {company['company']} ({domain})...", end=" ", flush=True)
        
        # Domain check (parallel-ish, no rate limit needed)
        domain_ok = check_domain(domain)
        
        # Clearbit (rate limited)
        time.sleep(1)
        cb = check_clearbit(domain)
        clearbit_cache[domain] = cb
        
        status = "✓" if cb.get("found") else "✗"
        print(f"domain={'✓' if domain_ok else '✗'} clearbit={status}")
    
    # Now build method results
    def build_method_result(companies, source_name):
        result_companies = []
        stats = {"total_generated": len(companies), "domain_valid": 0, "clearbit_found": 0,
                 "actually_healthcare": 0, "actually_emea": 0, "passed_all_checks": 0}
        
        for c in companies:
            d = c["domain"].lower()
            cb = clearbit_cache.get(d, {"found": False})
            
            domain_ok = domain_cache.get(d, False)
            hc_ok, hc_reason = is_healthcare_comms(cb, c.get("description", ""))
            emea_ok = is_emea(cb)
            
            validation = {
                "domain_resolves": domain_ok,
                "clearbit_found": cb.get("found", False),
                "clearbit_employees": cb.get("employees", "N/A") if cb.get("found") else "N/A",
                "clearbit_country": cb.get("country", "N/A") if cb.get("found") else "N/A",
                "clearbit_category_industry": cb.get("category_industry", "N/A") if cb.get("found") else "N/A",
                "is_healthcare_comms": hc_ok,
                "healthcare_reason": hc_reason,
                "is_emea_hq": emea_ok,
            }
            
            if domain_ok: stats["domain_valid"] += 1
            if cb.get("found"): stats["clearbit_found"] += 1
            if hc_ok: stats["actually_healthcare"] += 1
            if emea_ok: stats["actually_emea"] += 1
            if domain_ok and cb.get("found") and hc_ok and emea_ok:
                stats["passed_all_checks"] += 1
            
            result_companies.append({
                "company": c["company"],
                "domain": c["domain"],
                "country": c.get("country", "unknown"),
                "vertical": c.get("vertical", ""),
                "productFit": c.get("productFit", ""),
                "description": c.get("description", ""),
                "validation": validation,
            })
        
        return {"source": source_name, "companies": result_companies, "stats": stats}
    
    # Domain cache already built during validation - rebuild quickly
    domain_cache = {}
    for d in m3_candidates:
        domain_cache[d] = check_domain(d)  # fast - usually cached by OS
    
    # Build Method 1 result
    print("\nBuilding Method 1 results...")
    m1_result = build_method_result(METHOD1_RAW, "LiteLLM gateway, gemini/gemini-2.0-flash")
    
    # Build Method 2 result
    print("Building Method 2 results...")
    m2_result = build_method_result(method2_raw, "Brave Search API + Gemini Flash structuring (simulated — Brave API key unavailable)")
    
    # Build Method 3: top 25 Clearbit-confirmed EMEA healthcare companies
    print("Building Method 3 results...")
    m3_scored = []
    for d, c in m3_candidates.items():
        cb = clearbit_cache.get(d, {"found": False})
        hc_ok, _ = is_healthcare_comms(cb, c.get("description", ""))
        emea_ok = is_emea(cb)
        domain_ok = domain_cache.get(d, False)
        
        score = sum([domain_ok, cb.get("found", False), hc_ok, emea_ok])
        m3_scored.append((score, c))
    
    m3_scored.sort(key=lambda x: -x[0])
    m3_top25 = [c for _, c in m3_scored[:25]]
    m3_domains = set(c["domain"].lower() for c in m3_top25)
    m3_result = build_method_result(m3_top25, "Combined search + Clearbit validation")
    
    # Overlap analysis
    def domain_set(companies):
        return set(c["domain"].lower() for c in companies)
    
    s1 = domain_set(METHOD1_RAW)
    s2 = domain_set(method2_raw)
    s3 = m3_domains
    
    overlap = {
        "all_three": sorted(s1 & s2 & s3),
        "gemini_only": sorted(s1 - s2 - s3),
        "brave_only": sorted(s2 - s1 - s3),
        "clearbit_only": sorted(s3 - s1 - s2),
        "gemini_and_brave": sorted((s1 & s2) - s3),
        "gemini_and_clearbit": sorted((s1 & s3) - s2),
        "brave_and_clearbit": sorted((s2 & s3) - s1),
    }
    
    # Determine winner
    m1_pass = m1_result["stats"]["passed_all_checks"]
    m2_pass = m2_result["stats"]["passed_all_checks"]
    m3_pass = m3_result["stats"]["passed_all_checks"]
    
    scores = {"gemini_flash": m1_pass, "brave_search": m2_pass, "clearbit_validated": m3_pass}
    winner_key = max(scores, key=scores.get)
    
    summary = f"""Method Comparison Results:
- Gemini Flash (LLM-only): {m1_pass}/25 passed all checks ({m1_result['stats']['domain_valid']} domains valid, {m1_result['stats']['clearbit_found']} Clearbit found, {m1_result['stats']['actually_healthcare']} healthcare, {m1_result['stats']['actually_emea']} EMEA)
- Brave Search + AI: {m2_pass}/25 passed all checks ({m2_result['stats']['domain_valid']} domains valid, {m2_result['stats']['clearbit_found']} Clearbit found, {m2_result['stats']['actually_healthcare']} healthcare, {m2_result['stats']['actually_emea']} EMEA)
- Clearbit-validated: {m3_pass}/25 passed all checks ({m3_result['stats']['domain_valid']} domains valid, {m3_result['stats']['clearbit_found']} Clearbit found, {m3_result['stats']['actually_healthcare']} healthcare, {m3_result['stats']['actually_emea']} EMEA)

Overlap: {len(overlap['all_three'])} companies in all three methods.
Winner: {winner_key} with {scores[winner_key]} fully validated companies.

NOTE: Brave Search API key was not configured, so Method 2 used a different Gemini prompt to simulate web-sourced discovery. For a true comparison, configure BRAVE_API_KEY."""

    output = {
        "criteria": "PatientSync lookalike — EMEA healthcare comms",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "methods": {
            "gemini_flash": m1_result,
            "brave_search": m2_result,
            "clearbit_validated": m3_result,
        },
        "overlap": overlap,
        "winner": f"{winner_key} — {scores[winner_key]} companies passed all 4 validation checks",
        "summary": summary,
    }
    
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"\n{'='*60}")
    print(summary)
    print(f"\nSaved to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
