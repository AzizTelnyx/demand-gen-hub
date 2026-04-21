#!/usr/bin/env python3
"""
ABM Builder shared library.
Reusable functions for the Lobster-driven research pipeline.
Extracted from abm-expander-agent.py for shared use.
"""

import json
import os
import re
import time
import urllib.request
import urllib.error
from difflib import SequenceMatcher

import psycopg2
import requests

# ─── Config ───────────────────────────────────────────

DB_URL = "postgresql://localhost:5432/dghub"
PSQL = "/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"

CLEARBIT_API_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"
CLEARBIT_URL = "https://company.clearbit.com/v2/companies/find"

LITELLM_URL = "http://litellm-aiswe.query.prod.telnyx.io:4000/v1/chat/completions"
LITELLM_KEY = "sk-JcJEnHgGiRKTnIdkGfv3Rw"

BRAVE_API_KEY = os.environ.get("BRAVE_API_KEY", "BSAsk8vZjTl-aldJt4FA2jxxd3tvYmA")
BRAVE_URL = "https://api.search.brave.com/res/v1/web/search"

# Relevance scoring weights (same as Expander)
W_DESCRIPTION = 0.40
W_TAGS = 0.30
W_TECH = 0.15
W_SIZE = 0.15

# ─── Competitor Domains ─────────────────────────────────
# Domains we conquest-target (run competitor campaigns against) — NOT ABM targets.
# These must be auto-excluded from Builder research results.
COMPETITOR_DOMAINS = {
    # CPaaS / telecom carriers
    "twilio.com", "vonage.com", "bandwidth.com", "plivo.com", "sinch.com",
    "messagebird.com", "telnyx.com",  # our own domain
    # Voice AI agent platforms
    "vapi.ai", "retellai.com", "bland.ai", "voiceflow.com", "bolna.ai",
    "vocs.ai", "synthflow.ai", "agentvoice.com",
    # CCaaS / contact center platforms
    "nice.com", "genesys.com", "five9.com", "talkdesk.com", "avaya.com",
    "ringcentral.com", "8x8.com", "dialpad.com",
}


def is_competitor(domain: str) -> bool:
    """Check if domain is a known competitor (auto-exclude from ABM)."""
    return domain.lower().strip() in COMPETITOR_DOMAINS

# ─── DB ────────────────────────────────────────────────

def get_db():
    return psycopg2.connect(DB_URL)

# ─── Clearbit ──────────────────────────────────────────

def clearbit_enrich(domain: str) -> dict | None:
    """Enrich a domain via Clearbit Company API. Retry on 202."""
    try:
        resp = requests.get(
            CLEARBIT_URL,
            params={"domain": domain},
            headers={"Authorization": f"Bearer {CLEARBIT_API_KEY}"},
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json()
        elif resp.status_code == 202:
            time.sleep(3)
            resp2 = requests.get(
                CLEARBIT_URL,
                params={"domain": domain},
                headers={"Authorization": f"Bearer {CLEARBIT_API_KEY}"},
                timeout=15,
            )
            if resp2.status_code == 200:
                return resp2.json()
        return None
    except Exception:
        return None

# ─── Hallucination Check ──────────────────────────────

def check_hallucination(suggested_name: str, clearbit_data: dict) -> tuple[bool, str]:
    """Verify LLM-suggested company matches Clearbit data."""
    if not clearbit_data:
        return True, "no_clearbit_to_compare"
    clearbit_name = (clearbit_data.get("name") or "").lower()
    suggested_lower = suggested_name.lower()
    if not clearbit_name:
        return True, "no_name_in_clearbit"
    ratio = SequenceMatcher(None, suggested_lower, clearbit_name).ratio()
    if ratio < 0.5:
        if suggested_lower in clearbit_name or clearbit_name in suggested_lower:
            return True, f"substring_match({ratio:.2f})"
        return False, f"name_mismatch({ratio:.2f}): '{suggested_name}' vs '{clearbit_data.get('name')}'"
    return True, f"name_match({ratio:.2f})"

# ─── Relevance Scoring ─────────────────────────────────

# Product keyword lists (from abm_product_scorer.py — kept in sync)
PRODUCT_KEYWORDS = {
    "AI Agent": {
        "core": ["ai agent", "voice ai", "conversational ai", "ai voice agent",
                 "autonomous agent", "voicebot", "chatbot", "virtual agent",
                 "ai assistant", "intelligent agent", "voice assistant",
                 "generative ai", "large language model", "llm applications",
                 "ai calling", "ai dialer", "predictive dialer",
                 "agent assist", "ai-powered customer service",
                 "natural language", "voice recognition",
                 "speech ai", "voice automation",
                 "conversational platform", "dialogue system"],
        "secondary": ["contact center ai", "call center ai", "ai customer service",
                      "ivr ai", "natural language processing", "nlp",
                      "speech recognition", "text to speech", "voice synthesis",
                      "ai-powered", "machine learning customer",
                      "deep learning voice", "neural voice",
                      "ai voicebot", "smart assistant",
                      "conversational ivr", "voice self-service"],
    },
    "Voice API": {
        "core": ["voice api", "voice application", "programmable voice",
                 "sip calling", "webrtc", "voice over ip",
                 "voip service", "cloud voice", "business voice",
                 "voice platform", "voice gateway", "sip trunking service"],
        "secondary": ["pbx", "ip pbx", "call routing", "ivr",
                      "voice communication", "voip phone", "cloud phone",
                      "voip gateway", "session border controller",
                      "sip server", "voice termination", "origination"],
    },
    "SMS": {
        "core": ["sms api", "sms platform", "text messaging api",
                 "a2p messaging", "sms gateway", "bulk sms",
                 "messaging api", "sms marketing", "sms automation",
                 "programmable sms", "sms notification", "otp sms",
                 "two-factor authentication", "2fa"],
        "secondary": ["a2p", "sms campaign", "text message marketing",
                      "sms provider", "messaging platform",
                      "communication api", "mms api"],
    },
    "SIP": {
        "core": ["sip trunking", "sip trunk", "sip trunking service",
                 "enterprise sip", "sip connection", "sip termination",
                 "sip origination", "sip calling"],
        "secondary": ["pbx", "ip pbx", "session border controller",
                      "sip server", "voip gateway", "voice gateway",
                      "unified communications", "uc platforms"],
    },
    "IoT SIM": {
        "core": ["iot sim", "iot connectivity", "cellular iot",
                 "iot platform", "connected device", "m2m sim",
                 "iot management", "fleet connectivity"],
        "secondary": ["asset tracking", "fleet management", "telematics",
                      "remote monitoring", "embedded sim", "esim",
                      "smart city", "industrial iot", "iiot"],
    },
    "Contact Center": {
        "core": ["contact center", "call center", "ccaaS",
                 "customer service platform", "helpdesk",
                 "customer experience platform", "support center"],
        "secondary": ["ivr", "automatic call distributor", "acd",
                      "workforce management", "quality management",
                      "omnichannel", "customer engagement"],
    },
}

WASTE_INDUSTRIES = [
    "gambling", "casino", "lottery",
    "tobacco", "cannabis",
    "weapons", "firearms",
    "adult entertainment",
]

TELECOM_PROVIDER_SIGNALS = [
    "telecom provider", "telecommunications provider", "isp",
    "internet service provider", "network operator", "mobile operator",
    "wireless carrier", "mobile network operator",
]

# Map from builder productFit values to scorer product names
PRODUCT_MAP = {
    "voice-ai": "AI Agent",
    "programmable-voice": "Voice API",
    "sms-api": "SMS",
    "sip-trunking": "SIP",
    "iot": "IoT SIM",
    "contact-center": "Contact Center",
}


def relevance_score(clearbit_data: dict, product_name: str) -> tuple[float, dict]:
    """
    Score a company's relevance to a Telnyx product.
    Weights: desc 40%, tags 30%, tech 15%, size 15%.
    Returns (score 0-1, reasoning dict).
    """
    if not clearbit_data:
        return 0.0, {"reason": "no_data"}

    keyword_sets = PRODUCT_KEYWORDS.get(product_name, {})
    core_kw = [k.lower() for k in keyword_sets.get("core", [])]
    secondary_kw = [k.lower() for k in keyword_sets.get("secondary", [])]
    all_kw = core_kw + secondary_kw

    scores = {}

    # 1. Description (40%)
    desc = (clearbit_data.get("description") or "").lower()
    if desc and all_kw:
        core_m = sum(1 for k in core_kw if k in desc)
        sec_m = sum(1 for k in secondary_kw if k in desc)
        d = 0
        if core_m > 0:
            d += 0.4 * min(core_m / 2.0, 1.0)
        if sec_m > 0:
            d += 0.15 * min(sec_m / 3.0, 1.0)
        scores["description"] = min(d, 1.0)
    else:
        scores["description"] = 0.3

    # 2. Tags (30%)
    tags = [t.lower() for t in clearbit_data.get("tags", [])]
    if tags and all_kw:
        tag_text = " ".join(tags)
        tag_m = sum(1 for k in all_kw if k in tag_text)
        scores["tags"] = min(1.0, tag_m / max(1, len(all_kw) * 0.3))
    else:
        scores["tags"] = 0.2

    # 3. Tech (15%)
    tech = [t.lower() for t in clearbit_data.get("tech", [])]
    tech_signals = ["aws", "google cloud", "azure", "kubernetes", "docker", "react", "node.js"]
    if tech:
        tech_m = sum(1 for s in tech_signals if any(s in t for t in tech))
        scores["tech"] = min(1.0, tech_m / 3)
    else:
        scores["tech"] = 0.3

    # 4. Size (15%)
    employees = (clearbit_data.get("metrics") or {}).get("employees")
    if employees:
        if 10 <= employees <= 10000:
            scores["size"] = 1.0
        elif employees < 10:
            scores["size"] = 0.3
        else:
            scores["size"] = 0.7
    else:
        scores["size"] = 0.5

    # Weighted total
    total = (
        scores.get("description", 0) * W_DESCRIPTION +
        scores.get("tags", 0) * W_TAGS +
        scores.get("tech", 0) * W_TECH +
        scores.get("size", 0) * W_SIZE
    )

    # Waste industry penalty
    industry = (clearbit_data.get("category", {}) or {}).get("industry", "") or ""
    if industry and any(w in industry.lower() for w in WASTE_INDUSTRIES):
        total *= 0.3

    # Telecom provider override
    if desc and any(s in desc for s in TELECOM_PROVIDER_SIGNALS):
        if product_name in ("SIP", "Voice API"):
            total = max(total, 0.5)
        elif product_name == "AI Agent":
            total *= 0.3

    return round(min(total, 1.0), 3), scores


# ─── Brave Search ──────────────────────────────────────

def ddg_search(query: str, count: int = 20) -> list[dict]:
    """Fallback: DuckDuckGo search via ddgs library."""
    try:
        from ddgs import DDGS
        ddgs = DDGS()
        results = list(ddgs.text(query, max_results=count))
        # Normalize to Brave format
        normalized = []
        for r in results:
            normalized.append({
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "description": r.get("body", ""),
            })
        return normalized
    except ImportError:
        print("  ddgs not installed, install with: pip install ddgs")
        return []
    except Exception as e:
        print(f"  DuckDuckGo failed: {e}")
        return []

def brave_search(query: str, count: int = 20) -> list[dict]:
    """Search Brave API and return results. Falls back to DuckDuckGo."""
    api_key = BRAVE_API_KEY
    if not api_key:
        brave_key_path = os.path.expanduser("~/.config/brave/api_key")
        if os.path.exists(brave_key_path):
            with open(brave_key_path) as f:
                api_key = f.read().strip()

    # Try Brave first
    if api_key:
        try:
            resp = requests.get(
                BRAVE_URL,
                params={"q": query, "count": count},
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": api_key,
                },
                timeout=15,
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("web", {}).get("results", [])
            elif resp.status_code == 429:
                print("  Brave rate limited, falling back to DuckDuckGo")
            else:
                print(f"  Brave error: {resp.status_code}")
        except Exception as e:
            print(f"  Brave failed: {e}")

    # Fallback: DuckDuckGo
    return ddg_search(query, count)


def extract_domains_from_results(results: list[dict]) -> list[dict]:
    """Extract company names and domains from Brave search results."""
    from urllib.parse import urlparse
    companies = []
    seen = set()

    for r in results:
        url = r.get("url", "")
        title = r.get("title", "")
        desc = r.get("description", "")

        if not url:
            continue

        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        # Strip www.
        if domain.startswith("www."):
            domain = domain[4:]

        # Skip non-company domains
        skip_domains = {
            "linkedin.com", "crunchbase.com", "g2.com", "capterra.com",
            "google.com", "facebook.com", "twitter.com", "x.com",
            "youtube.com", "wikipedia.org", "reddit.com", "github.com",
            "medium.com", "ycombinator.com", "producthunt.com",
            "zoominfo.com", "apollo.io", "glassdoor.com", "indeed.com",
            "angel.co", "wellfound.com",
        }
        root = domain.split(".")[-2] + "." + domain.split(".")[-1] if "." in domain else domain
        if any(s in root for s in skip_domains):
            continue

        if domain in seen:
            continue
        seen.add(domain)

        # Clean title — remove " - LinkedIn", " | Crunchbase" etc.
        clean_name = re.split(r"\s*[-|–—]\s*(LinkedIn|Crunchbase|G2|Capterra|Glassdoor|Indeed|ZoomInfo)", title, 1)[0].strip()

        companies.append({
            "name": clean_name,
            "domain": domain,
            "snippet": desc,
        })

    return companies


# ─── LLM Validation ────────────────────────────────────

def llm_validate(company: dict, clearbit_data: dict, product_name: str, criteria: dict) -> tuple[bool, str]:
    """Use cheap LLM to validate borderline companies (score 0.15-0.6)."""
    desc = (clearbit_data.get("description") or "")[:500]
    tags = ", ".join(clearbit_data.get("tags", [])[:5])
    employees = (clearbit_data.get("metrics") or {}).get("employees", "unknown")
    industry = (clearbit_data.get("category", {}) or {}).get("industry", "unknown")

    prompt = f"""Is this company a genuine target for Telnyx's {product_name} product?

Company: {company.get('name', 'Unknown')}
Domain: {company.get('domain', '')}
Clearbit description: {desc}
Industry: {industry}
Tags: {tags}
Employees: {employees}
Search snippet: {company.get('snippet', '')}

Research criteria: {criteria.get('targetCompanyProfile', criteria.get('description', ''))}

Telnyx provides cloud communications: Voice API, SIP Trunking, SMS API, IoT SIM, AI voice agents.
We target companies that BUILD or DEPLOY telecom/voice solutions, not pure end-users.
We also do NOT target competitors — companies that offer competing CPaaS, voice AI agent platforms, or CCaaS/contact center products (e.g. Twilio, Vonage, Vapi, Retell AI, Bland AI, Voiceflow, NICE, Genesys, Talkdesk, etc). Those are conquest campaign targets, not ABM targets.

Answer ONLY with:
APPROVE - [one sentence reason]
or
REJECT - [one sentence reason]"""

    try:
        payload = json.dumps({
            "model": "gpt-4.1-mini",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 100,
            "temperature": 0.1,
        }).encode("utf-8")

        req = urllib.request.Request(
            LITELLM_URL,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {LITELLM_KEY}",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"].strip()

            if content.upper().startswith("APPROVE"):
                reason = content.split("-", 1)[1].strip() if "-" in content else "llm_approved"
                return True, reason
            else:
                reason = content.split("-", 1)[1].strip() if "-" in content else "llm_rejected"
                return False, reason
    except Exception as e:
        # On error, pass through (don't block on LLM failure)
        return True, f"llm_error:{e}"


# ─── Salesforce Cross-Check ────────────────────────────

SF_SKIP_TYPES = {"Customer", "Partner"}

def salesforce_should_skip(sf_result: dict) -> tuple[bool, str]:
    """Only skip Customers and Partners."""
    if sf_result.get("status") != "exists":
        return False, "not_in_sf"
    acct_type = (sf_result.get("accountType") or "").strip()
    if acct_type in SF_SKIP_TYPES:
        return True, f"sf_{acct_type.lower()}"
    return False, f"sf_{acct_type.lower() or 'unknown'}_pass"
