#!/usr/bin/env python3
"""
ABM Expander Agent v3
======================
Two-phase expansion: pipeline-driven (primary) + segment-size (fallback).

Phase 1 — Pipeline-Driven (PRIMARY):
  Pulls accounts with active SF opportunities, builds ICP profiles from their
  shared traits (industry, tags, tech stack), then uses AI to find lookalike companies.
  'Find companies like Agora, Rasa, SoundHound — AI platforms building voice agents'
  is much more targeted than 'find AI Agent ICP companies'.

Phase 2 — Segment-Size (FALLBACK):
  For products with no pipeline seeds, falls back to finding undersized segments
  and filling them with ICP-matching candidates.

7-step pipeline per phase:
1. Get seed data (pipeline accounts or undersized segments)
2. AI Research — find candidates via LLM (pipeline-aware or variant-aware prompting)
3. Clearbit validate — confirm firmographics + retry 202s + hallucination check
4. Salesforce cross-check — skip only Customers/Partners
5. Relevance score — weighted formula (description 40%, tags 30%, tech 15%, size 15%)
6. Cross-campaign dedup — check by list + by segment ID
7. Execute — add to DB + flag for platform upload + post review candidates to Telegram

Model strategy: gpt-4.1-mini via LiteLLM for research (fast, cheap).
                 Fallback: claude-3-5-haiku via LiteLLM if gpt-4.1-mini fails.

Run: python3 scripts/abm-expander-agent.py [--dry-run] [--limit N] [--product AI_Agent]
Cron: Weekly Tuesday 5 AM PST
"""

import json
import os
import sys
import time
import argparse
import subprocess
import urllib.request
import urllib.parse
import urllib.error
import traceback
import uuid as uuid_mod
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher

import psycopg2
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ─── Config ───────────────────────────────────────────

AGENT_SLUG = "abm-expander"
AGENT_NAME = "ABM Expander Agent v2"

DB_URL = "postgresql://localhost:5432/dghub"
PSQL = "/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"
LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/abm-expander")
os.makedirs(LOG_DIR, exist_ok=True)

CLEARBIT_API_KEY = "sk_6a6f1e4c6f26338d6340d688ad197d48"
CLEARBIT_URL = "https://company.clearbit.com/v2/companies/find"

# Model strategy: cheap primary, smarter fallback
LITELLM_URL = "http://litellm-aiswe.query.prod.telnyx.io:4000/v1/chat/completions"
LITELLM_KEY = "sk-JcJEnHgGiRKTnIdkGfv3Rw"
LITELLM_MODEL_PRIMARY = "gpt-4.1-mini"    # Fast, cheap, good enough for research
LITELLM_MODEL_FALLBACK = "claude-3-5-haiku-20241022"  # Smarter if primary fails

# Relevance scoring weights
W_DESCRIPTION = 0.40
W_TAGS = 0.30
W_TECH = 0.15
W_SIZE = 0.15

# Intent-stage-aware thresholds
THRESHOLDS = {
    "TOFU": {"auto_add": 0.6, "review": 0.35},   # Looser — awareness plays
    "MOFU": {"auto_add": 0.7, "review": 0.4},    # Default
    "BOFU": {"auto_add": 0.8, "review": 0.5},    # Stricter — targeting buyers
    "UPSELL": {"auto_add": 0.8, "review": 0.5},  # Same as BOFU
    "default": {"auto_add": 0.7, "review": 0.4},
}

# Platform minimum segment sizes (base + budget-scaled)
BASE_MIN_SEGMENT_SIZE = {"linkedin": 300, "stackadapt": 500, "google_ads": 100}
# If campaign is spending $X/mo, segment should be at least X*0.5
BUDGET_SEGMENT_FACTOR = 0.5

# Geo mapping from campaign name tokens to Clearbit country codes
GEO_MAP = {
    "NA": ["US", "CA", "MX"],
    "AMER": ["US", "CA", "MX", "BR", "AR", "CO", "CL"],
    "EMEA": ["GB", "DE", "FR", "NL", "IE", "SE", "NO", "DK", "FI", "IT", "ES", "PT", "BE", "AT", "CH", "PL", "ZA", "AE", "IL"],
    "APAC": ["AU", "SG", "JP", "IN", "KR", "NZ", "HK", "MY", "TH", "PH", "ID"],
    "GLOBAL": None,  # No geo filter
}

# Variant-aware target tags (Gap #4)
VARIANT_TAGS = {
    "Healthcare": ["health care", "medical", "hospital", "telemedicine", "biotechnology", "pharmaceuticals", "health"],
    "Fintech": ["financial", "banking", "payments", "fintech", "insurance", "trading"],
    "Travel": ["travel", "hospitality", "tourism", "airlines", "booking", "lodging"],
    "Contact Center": ["call center", "customer service", "contact center", "bpo", "outsourcing"],
    "Social Boost": ["social media", "marketing", "advertising", "influencer"],
    "ElevenLabs+Vapi": ["voice", "speech", "audio", "tts", "conversational"],
    "TTS API": ["speech", "tts", "voice", "audio", "synthesis"],
    "STT API": ["speech", "stt", "transcription", "voice", "recognition"],
    "Sabre": ["travel", "gds", "sabre", "booking", "distribution"],
    "Twilio": ["telecom", "voip", "communication", "cpaas", "twilio"],
}

# Competitor domains to seed in ABMExclusion (Gap #12)
COMPETITOR_DOMAINS = [
    # CPaaS / telecom carriers
    "twilio.com", "vonage.com", "bandwidth.com", "plivo.com",
    "signalwire.com", "messagebird.com", "infobip.com", "sinch.com",
    # Conversational AI / voice agent platforms (compete with Telnyx AI Agent)
    "kore.ai", "cognigy.com", "gupshup.io", "yellow.ai", "amplify.ai",
    "onereach.ai", "poly.ai", "voiceflow.com", "botsplash.com",
    # Contact center / CCaaS (compete with Telnyx Contact Center)
    "five9.com", "genesys.com", "nice.com", "talkdesk.com",
    "dialpad.com", "ringcentral.com", "8x8.com", "aircall.io",
    "callrail.com", "avaya.com",
    # CPaaS also-rans
    "telnyx.com",  # don't target ourselves
]

# SF account types to SKIP (Gap #1) — only these are truly not targets
SF_SKIP_TYPES = {"Customer", "Partner"}
# SF opportunity stages that mean active pipeline
SF_ACTIVE_OPP_STAGES = {"Negotiation", "Closed Won", "Proposal"}

# ─── DB ────────────────────────────────────────────────

def get_db():
    return psycopg2.connect(DB_URL)


def log(msg, level="INFO"):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{ts}] [{level}] {msg}", flush=True)


# ─── Step 1: Find Undersized Segments ─────────────────

def parse_geo_from_name(campaign_name):
    """Extract geo scope from campaign name (Gap #3)."""
    if not campaign_name:
        return None, None  # No filter
    name_upper = campaign_name.upper()
    for token, countries in GEO_MAP.items():
        # Check for exact token match (not substring — GLOBAL before NA matters)
        if f" {token}" in name_upper or name_upper.startswith(token):
            return token, countries
    return None, None


def find_undersized_segments(cur, product_filter=None):
    """Find campaign-segment pairs that need more companies.
    
    Budget-aware (Gap #9): Skip segments with zero spend AND zero impressions.
    Geo-aware (Gap #3): Parse geo from campaign name for later filtering.
    """
    sql = """
        SELECT cs."campaignId", cs."campaignName", cs.platform,
               cs."parsedProduct", cs."parsedVariant", cs."parsedIntent",
               cs."segmentId", cs."segmentName", cs."segmentSize",
               cs."healthFlags", cs."impressions30d", cs."spend30d"
        FROM "ABMCampaignSegment" cs
        WHERE cs."campaignStatus" IN ('enabled', 'live')
          AND cs."parsedProduct" IS NOT NULL
          AND cs."parsedProduct" != ''
    """
    params = []
    if product_filter:
        sql += ' AND cs."parsedProduct" = %s'
        params.append(product_filter)

    cur.execute(sql, params)
    rows = cur.fetchall()

    undersized = []
    for r in rows:
        campaign_id, camp_name, platform, product, variant, intent, seg_id, seg_name, seg_size, flags, imp, spend = r
        base_min = BASE_MIN_SEGMENT_SIZE.get(platform, 300)
        # Budget-scaled minimum (Gap #9)
        budget_min = int((spend or 0) * BUDGET_SEGMENT_FACTOR) if spend else 0
        min_size = max(base_min, budget_min)

        is_undersized = (
            seg_size is None
            or seg_size < min_size
            or (flags and "undersized" in json.dumps(flags))
        )

        # Gap #9: Skip zero-delivery campaigns (enabled but not spending)
        is_dead = (imp or 0) == 0 and (spend or 0) == 0

        if is_undersized and not is_dead:
            geo_token, geo_countries = parse_geo_from_name(camp_name)
            undersized.append({
                "campaignId": campaign_id,
                "campaignName": camp_name,
                "platform": platform,
                "product": product,
                "variant": variant,
                "intent": intent,
                "segmentId": seg_id,
                "segmentName": seg_name,
                "segmentSize": seg_size,
                "healthFlags": flags,
                "impressions30d": imp,
                "spend30d": spend,
                "geoToken": geo_token,
                "geoCountries": geo_countries,
            })

    return undersized


# ─── Step 1b: Get ICP Rules for a Product ────────────

def get_icp_rules(cur, product, variant=None):
    """Get ABMListRule for a given product/variant."""
    sql = """
        SELECT "useCaseKeywords", "competitorNames", "descriptionKeywords",
               verticals, regions, "excludeVerticals", "excludeCompetitors"
        FROM "ABMListRule"
        WHERE product = %s
          AND (variant = %s OR variant IS NULL)
        ORDER BY variant DESC NULLS LAST
        LIMIT 1
    """
    cur.execute(sql, (product, variant or ""))
    row = cur.fetchone()

    rules = {"useCaseKeywords": [], "competitorNames": [], "descriptionKeywords": [],
             "verticals": [], "regions": [], "excludeVerticals": [], "excludeCompetitors": []}
    if row:
        use_case, comp, desc_kw, verticals, regions, exc_vert, exc_comp = row
        if use_case:
            rules["useCaseKeywords"] = use_case if isinstance(use_case, list) else json.loads(use_case)
        if comp:
            rules["competitorNames"] = comp if isinstance(comp, list) else json.loads(comp)
        if desc_kw:
            rules["descriptionKeywords"] = desc_kw if isinstance(desc_kw, list) else json.loads(desc_kw)
        if verticals:
            rules["verticals"] = verticals if isinstance(verticals, list) else json.loads(verticals)
        if regions:
            rules["regions"] = regions if isinstance(regions, list) else json.loads(regions)
        if exc_vert:
            rules["excludeVerticals"] = exc_vert if isinstance(exc_vert, list) else json.loads(exc_vert)
        if exc_comp:
            rules["excludeCompetitors"] = exc_comp if isinstance(exc_comp, list) else json.loads(exc_comp)

    return rules

    return rules


# ─── Step 2: AI Research ──────────────────────────────

def ai_research(segment, icp_rules, max_candidates=20):
    """Use LLM to find candidate companies for a campaign segment.
    
    Gap #3: Includes geo targeting in prompt.
    Gap #14: Tags candidates as ai_research source.
    Uses primary model (gpt-4.1-mini), falls back to claude-3-5-haiku.
    """
    product = segment.get("product", "")
    variant = segment.get("variant", "")
    platform = segment.get("platform", "")
    intent = segment.get("intent", "")
    campaign_name = segment.get("campaignName", "")
    geo_token = segment.get("geoToken")
    geo_countries = segment.get("geoCountries")

    use_case_kw = ", ".join(icp_rules.get("useCaseKeywords", [])[:10])
    competitors = ", ".join(icp_rules.get("competitorKeywords", [])[:8])
    desc_kw = ", ".join(icp_rules.get("descriptionKeywords", [])[:10])

    # Build variant-specific guidance
    if variant:
        variant_guidance = f"""This is a VERTICAL-SPECIFIC campaign targeting the '{variant}' vertical.
Find companies that BUILD or DEPLOY {product} solutions specifically for the {variant} industry.
Do NOT suggest generic AI companies — they must have a clear {variant} use case."""
    else:
        variant_guidance = f"""This is a GENERIC {product} campaign — it targets companies across ALL industries.
Find companies that BUILD or DEPLOY {product} solutions in ANY industry.
Do NOT over-index on one vertical (e.g., don't only find healthcare companies).
Mix across verticals: healthcare, fintech, logistics, retail, manufacturing, etc.
If a company is only relevant to one specific vertical (e.g., only healthcare),
they likely belong on a vertical-specific campaign instead of this generic one."""

    # Build geo guidance (Gap #3)
    if geo_token and geo_token != "GLOBAL":
        country_names = {
            "US": "United States", "CA": "Canada", "MX": "Mexico", "GB": "United Kingdom",
            "DE": "Germany", "FR": "France", "NL": "Netherlands", "IE": "Ireland",
            "AU": "Australia", "SG": "Singapore", "JP": "Japan", "IN": "India",
        }
        country_list = ", ".join(country_names.get(c, c) for c in (geo_countries or [])[:5])
        geo_guidance = f"""GEOGRAPHIC RESTRICTION: This campaign targets {geo_token} ({country_list}).
Only suggest companies headquartered in these countries.
Do NOT suggest companies from outside this region."""
    else:
        geo_guidance = "This is a GLOBAL campaign — companies from any region are acceptable."

    prompt = f"""You are an account-based marketing research agent for Telnyx, a cloud communications platform.

CAMPAIGN CONTEXT:
- Campaign name: {campaign_name}
- Product: {product}
- Variant: {variant or 'None (generic)'}
- Intent stage: {intent}
- Platform: {platform}

{variant_guidance}

{geo_guidance}

ICP RULES:
- Use case keywords: {use_case_kw}
- Competitive alternatives: {competitors}
- Description signals: {desc_kw}

TASK: Find {max_candidates} real companies that would be good targets for this campaign.

For each company, provide:
1. Company name (exact, real company)
2. Domain (e.g., company.com)
3. Country code (ISO 2-letter, e.g., US, GB, DE)
4. Why they fit: 1-sentence explanation of their use case

RULES:
- Only include REAL companies you are confident exist
- Prefer mid-market companies (50-5000 employees)
- Exclude telecom carriers, ISPs, CPaaS platforms, and conversational AI/voice agent platforms (they are competitors: Twilio, Vonage, Kore.ai, Cognigy, Gupshup, Yellow.ai, Dialpad, Five9, Genesys, Nice, TalkDesk, Aircall, etc.)
- Exclude companies that are purely end-users (e.g., a hospital) without a software/AI product
- For competitive variants, find companies currently using {competitors}
- CRITICAL: Read the FULL campaign name above. A 'Travel' variant campaign targets travel companies,
  not generic AI companies. A generic 'AI Agent' campaign targets cross-industry AI companies, not just one vertical.
- Do NOT fabricate companies. If you're not confident a company exists, omit it.

Return as JSON array:
[{{"name": "Company Name", "domain": "example.com", "country": "US", "reason": "They build X for Y market"}}]"""

    # Try primary model, then fallback (model strategy)
    for model in [LITELLM_MODEL_PRIMARY, LITELLM_MODEL_FALLBACK]:
        try:
            payload = json.dumps({
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 2000,
                "temperature": 0.3,
            }).encode("utf-8")

            req = urllib.request.Request(
                LITELLM_URL,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {LITELLM_KEY}",
                },
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                content = data["choices"][0]["message"]["content"]

                # Parse JSON from response
                start = content.find("[")
                end = content.rfind("]") + 1
                if start >= 0 and end > start:
                    candidates = json.loads(content[start:end])
                    # Tag source (Gap #14)
                    for c in candidates:
                        c["discoverySource"] = "ai_research"
                        c["llmModel"] = model
                    return candidates
                return []
        except Exception as e:
            log(f"AI research failed with {model}: {e}", "WARN")
            continue
    
    log(f"AI research failed with all models", "ERROR")
    return []


# ─── Step 3: Clearbit Validate ───────────────────────

def clearbit_enrich(domain):
    """Enrich a domain via Clearbit Company API.
    
    Gap #6: Retry on 202 (async pending) after 3s delay.
    """
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
            # Async pending — Clearbit is fetching data. Retry after delay.
            log(f"    Clearbit 202 for {domain} — retrying in 3s")
            time.sleep(3)
            resp2 = requests.get(
                CLEARBIT_URL,
                params={"domain": domain},
                headers={"Authorization": f"Bearer {CLEARBIT_API_KEY}"},
                timeout=15,
            )
            if resp2.status_code == 200:
                return resp2.json()
            log(f"    Clearbit still pending for {domain} after retry")
        return None
    except Exception:
        return None


def check_hallucination(suggested_name, clearbit_data):
    """Gap #5: Verify LLM-suggested company matches Clearbit data.
    
    If the names are totally different, the LLM likely hallucinated.
    Returns (ok, reason).
    """
    if not clearbit_data:
        return True, "no_clearbit_to_compare"  # Can't verify, let it pass to scoring
    
    clearbit_name = (clearbit_data.get("name") or "").lower()
    suggested_lower = suggested_name.lower()
    
    if not clearbit_name:
        return True, "no_name_in_clearbit"
    
    # Fuzzy match — 0.5 threshold (lenient because names often differ: "Acme Inc" vs "Acme")
    ratio = SequenceMatcher(None, suggested_lower, clearbit_name).ratio()
    if ratio < 0.5:
        # Check if one name contains the other (e.g., "VoiceTech" in "VoiceTech AI Inc")
        if suggested_lower in clearbit_name or clearbit_name in suggested_lower:
            return True, f"substring_match({ratio:.2f})"
        return False, f"name_mismatch({ratio:.2f}): '{suggested_name}' vs '{clearbit_data.get("name")}'"
    
    return True, f"name_match({ratio:.2f})"


def clearbit_validate(clearbit_data, icp_rules, product):
    """Check if Clearbit data matches the ICP. Returns (valid, reason)."""
    if not clearbit_data:
        return False, "no_clearbit_data"

    tags = clearbit_data.get("tags", [])
    desc = clearbit_data.get("description", "") or ""
    employees = (clearbit_data.get("metrics") or {}).get("employees")

    # Check exclusions
    exclude_industries = ["ISP", "Telecom Carriers", "Broadcast Media"]
    for tag in tags:
        if tag in exclude_industries:
            return False, f"excluded_industry:{tag}"

    # Check description keywords
    desc_lower = desc.lower()
    desc_matches = sum(1 for kw in icp_rules.get("descriptionKeywords", [])
                       if kw.lower() in desc_lower)

    if not desc and not tags:
        return False, "no_signals"

    return True, f"tags:{len(tags)}_desc_matches:{desc_matches}"


# ─── Step 4: Salesforce Cross-Check ───────────────────

def salesforce_batch_check(domains):
    """Gap #8: Batch SF lookup for multiple domains at once.
    Gap #1: Only skip Customers and Partners. Prospects/ABM Targets pass through.
    
    Returns: dict mapping domain -> {status, accountType, name, hasActiveOpp}
    """
    if not domains:
        return {}
    
    try:
        # Query SF accounts by cleanDomain (exact match, no LIKE %substr%)
        domain_list = ", ".join(f"'{d}'" for d in domains)
        query = f"""SELECT Id, Name, Website, Type, CleanDomain__c FROM Account 
                   WHERE CleanDomain__c IN ({domain_list}) LIMIT 100"""
        result = subprocess.run(
            ["sf", "data", "query", "--target-org", "telnyx-prod", "--query", query, "--json"],
            capture_output=True, text=True, timeout=30
        )
        
        results_map = {}
        if result.returncode == 0:
            data = json.loads(result.stdout)
            records = data.get("result", {}).get("records", [])
            for rec in records:
                domain = (rec.get("CleanDomain__c") or rec.get("Website") or "").lower().strip()
                if domain.startswith("www."):
                    domain = domain[4:]
                results_map[domain] = {
                    "status": "exists",
                    "name": rec.get("Name"),
                    "accountType": rec.get("Type"),
                }
        
        # Fill in domains not found
        for d in domains:
            if d not in results_map:
                results_map[d] = {"status": "not_found"}
        
        return results_map
        
    except Exception as e:
        log(f"SF batch check failed: {e}", "WARN")
        return {d: {"status": "error"} for d in domains}


def salesforce_should_skip(sf_result):
    """Gap #1: Only skip Customers and Partners.
    Prospects, ABM Targets, and Target Accounts are companies we WANT to reach.
    """
    if sf_result.get("status") != "exists":
        return False, "not_in_sf"
    
    acct_type = (sf_result.get("accountType") or "").strip()
    if acct_type in SF_SKIP_TYPES:
        return True, f"sf_{acct_type.lower()}"
    
    # Prospect, ABM Target Account, Target Account, blank type — all PASS
    return False, f"sf_{acct_type.lower() or 'unknown'}_pass"


# ─── Step 5: Relevance Scoring ────────────────────────

def relevance_score(clearbit_data, icp_rules, product, variant=None):
    """
    Score a company's relevance to a campaign.

    Weights:
    - Description match: 40%
    - Tags match: 30%  (variant-aware — Gap #4)
    - Tech match: 15%
    - Size fit: 15%

    Returns: (score 0-1, reasoning dict)
    """
    if not clearbit_data:
        return 0.0, {"reason": "no_data"}

    scores = {}

    # 1. Description match (40%) — variant keywords boost when variant is set
    desc = (clearbit_data.get("description") or "").lower()
    desc_kw = [k.lower() for k in icp_rules.get("descriptionKeywords", [])]
    # Gap #4: Add variant-specific keywords to description matching
    if variant and variant in VARIANT_TAGS:
        desc_kw.extend(VARIANT_TAGS[variant])
    if desc and desc_kw:
        matches = sum(1 for kw in desc_kw if kw in desc)
        scores["description"] = min(1.0, matches / max(3, len(desc_kw) * 0.3))
    else:
        scores["description"] = 0.3  # No description = uncertain

    # 2. Tags match (30%) — variant-aware (Gap #4)
    tags = [t.lower() for t in clearbit_data.get("tags", [])]
    # Map product to target industries
    industry_map = {
        "AI Agent": ["software", "information technology", "saas", "artificial intelligence", "health care", "financial"],
        "Voice API": ["software", "information technology", "telecom", "voip", "communication"],
        "SIP": ["telecom", "voip", "software", "information technology", "communication"],
        "IoT SIM": ["iot", "software", "information technology", "manufacturing", "telecom"],
        "SMS": ["software", "information technology", "communication", "telecom"],
    }
    target_tags = [t.lower() for t in industry_map.get(product, ["software", "information technology"])]
    # Gap #4: Add variant-specific tags
    if variant and variant in VARIANT_TAGS:
        target_tags.extend(VARIANT_TAGS[variant])
    if tags:
        tag_matches = sum(1 for t in target_tags if any(t in tag for tag in tags))
        scores["tags"] = min(1.0, tag_matches / max(1, len(target_tags) * 0.5))
    else:
        scores["tags"] = 0.2

    # 3. Tech match (15%)
    tech = [t.lower() for t in clearbit_data.get("tech", [])]
    tech_signals = ["aws", "google cloud", "azure", "kubernetes", "docker", "react", "node.js"]
    if tech:
        tech_matches = sum(1 for s in tech_signals if any(s in t for t in tech))
        scores["tech"] = min(1.0, tech_matches / 3)
    else:
        scores["tech"] = 0.3

    # 4. Size fit (15%)
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

    return round(total, 3), scores


# ─── Step 6: Execute ──────────────────────────────────

def add_account_to_db(cur, domain, company, product, variant, relevance, reason, source="expander"):
    """Add a new ABMAccount + ABMListMember if not already present."""
    # Check if domain already exists
    cur.execute('SELECT id FROM "ABMAccount" WHERE domain = %s', (domain,))
    existing = cur.fetchone()

    if existing:
        account_id = existing[0]
        # Check if already in a list for this product
        cur.execute("""
            SELECT lm.id FROM "ABMListMember" lm
            JOIN "ABMList" l ON lm."listId" = l.id
            WHERE lm."accountId" = %s AND l.source = %s
        """, (account_id, source))
        if cur.fetchone():
            return account_id, "already_member"
    else:
        # Insert new account
        account_id = str(uuid.uuid4()) if 'uuid' in sys.modules else f"exp-{domain.replace('.','-')}"
        cur.execute("""
            INSERT INTO "ABMAccount" (id, company, domain, source, "productFit", "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, now(), now())
            ON CONFLICT DO NOTHING
        """, (account_id, company, domain, source, product))

    # Find or create a list for this product
    list_id = get_or_create_list(cur, product, variant)

    # Add to list member
    cur.execute("""
        INSERT INTO "ABMListMember" (id, "listId", "accountId", "addedAt", "addedBy", reason, status)
        VALUES (gen_random_uuid()::text, %s, %s, now(), 'expander', %s, 'active')
        ON CONFLICT DO NOTHING
    """, (list_id, account_id, f"Relevance: {relevance:.2f}. {reason}"))

    return account_id, "added"


def get_or_create_list(cur, product, variant=None):
    """Find or create an ABMList for the given product/variant."""
    list_name = f"Expander: {product}"
    if variant:
        list_name += f" / {variant}"

    cur.execute('SELECT id FROM "ABMList" WHERE name = %s', (list_name,))
    existing = cur.fetchone()
    if existing:
        return existing[0]

    list_id = f"exp-{product.lower().replace(' ','-')}"
    if variant:
        list_id += f"-{variant.lower().replace(' ','-')}"

    cur.execute("""
        INSERT INTO "ABMList" (id, name, source, "listType", status, "createdBy", "createdAt", "updatedAt")
        VALUES (%s, %s, 'expander', 'company_list', 'active', 'expander', now(), now())
        ON CONFLICT (id) DO UPDATE SET "updatedAt" = now()
        RETURNING id
    """, (list_id, list_name))
    result = cur.fetchone()
    return result[0] if result else list_id


# ─── Check Exclusions ────────────────────────────────

def is_shared_segment(cur, segment_id, product, variant):
    """Gap #2: Check if a platform segment is shared across campaigns with different variants.
    
    If segment X is on both 'AI Agent Healthcare' and 'AI Agent Fintech',
    adding a domain to this segment means it hits BOTH campaigns.
    Returns: (is_shared, list of conflicting campaigns)
    """
    cur.execute("""
        SELECT DISTINCT "parsedProduct", "parsedVariant", "campaignName"
        FROM "ABMCampaignSegment"
        WHERE "segmentId" = %s AND "campaignStatus" IN ('enabled', 'live')
    """, (segment_id,))
    attached_campaigns = cur.fetchall()
    
    if len(attached_campaigns) <= 1:
        return False, []
    
    # Check if there's a variant conflict
    variants_on_segment = set()
    products_on_segment = set()
    for prod, var, cname in attached_campaigns:
        if var:
            variants_on_segment.add(var)
        products_on_segment.add(prod or "unknown")
    
    # Shared across different products OR different variants = risky
    conflicts = []
    if len(variants_on_segment) > 1:
        conflicts = [f"{v or 'generic'}" for v in variants_on_segment]
    if len(products_on_segment) > 1:
        conflicts.append(f"multiple products: {products_on_segment}")
    
    return len(conflicts) > 0, conflicts


def is_excluded(cur, domain, product=None):
    """Check if domain is in ABMExclusion or is a known competitor."""
    # Fast in-memory check for known competitors
    if domain.lower() in COMPETITOR_DOMAINS:
        return True
    cur.execute("""
        SELECT id, category FROM "ABMExclusion"
        WHERE domain = %s
    """, (domain,))
    for row in cur.fetchall():
        category = row[1] or "*"
        if isinstance(category, str):
            pass  # category is text, not json
        if category == "*" or category == product:
            return True
    return False


def seed_competitor_exclusions(cur):
    """Gap #12: Seed ABMExclusion with competitor domains if not already present."""
    for domain in COMPETITOR_DOMAINS:
        cur.execute("""
            INSERT INTO "ABMExclusion" (id, domain, category, reason, "addedAt", "addedBy")
            VALUES (gen_random_uuid()::text, %s, '*', 'competitor', now(), 'expander')
            ON CONFLICT DO NOTHING
        """, (domain,))
    cur.execute("COMMIT")


def is_already_targeted(cur, domain, product, variant=None):
    """Check if a domain is already in an ABM list for the same product.
    
    Key: If domain is on a VARIANT-SPECIFIC list (e.g., AI Agent Healthcare),
    don't also add it to a GENERIC list — that causes double-serving.
    If domain is on a generic list and we're adding to a variant list, that's fine.
    """
    cur.execute("""
        SELECT l.name, l.source FROM "ABMListMember" lm
        JOIN "ABMList" l ON lm."listId" = l.id
        JOIN "ABMAccount" a ON lm."accountId" = a.id
        WHERE a.domain = %s AND lm.status = 'active'
    """, (domain,))
    existing_lists = cur.fetchall()
    
    for list_name, source in existing_lists:
        if variant:
            if variant.lower() in list_name.lower():
                return True, f"already on same variant list: {list_name}"
        else:
            if product.lower() in list_name.lower():
                return True, f"already on product list: {list_name}"
    
    return False, None


# ─── Main Pipeline ────────────────────────────────────

def check_geo_match(geo_countries, clearbit_data):
    """Gap #3: Verify company HQ country matches campaign geo targeting."""
    if not geo_countries:
        return True, "global_or_no_filter"
    
    hq_country = (clearbit_data.get("geo") or {}).get("countryCode")
    if not hq_country:
        return True, "no_hq_country_in_clearbit"  # Can't verify, let pass
    
    if hq_country in geo_countries:
        return True, f"hq_match:{hq_country}"
    
    return False, f"hq_mismatch:{hq_country}_need:{geo_countries[:3]}"


def get_thresholds(intent):
    """Gap #13: Get intent-aware thresholds."""
    return THRESHOLDS.get(intent, THRESHOLDS["default"])


def post_review_to_telegram(results):
    """Gap #7: Post moderate-review candidates to Telegram for human approval."""
    if not results:
        return
    
    lines = ["🟡 *ABM Expander — Review Candidates*\n"]
    for r in results[:10]:
        variant_str = f"/{r['variant']}" if r.get('variant') else ""
        lines.append(f"• *{r['name']}* ({r['domain']}) — {r['product']}{variant_str} Score: {r['score']:.2f}")
        lines.append(f"  {r['reason']}")
    
    if len(results) > 10:
        lines.append(f"\n_+{len(results)-10} more..._")
    
    msg = "\n".join(lines)
    
    try:
        import urllib.request as ur
        gateway_url = "http://127.0.0.1:18789/v1/chat/completions"
        gateway_token = "4048247f6c1914a3fd5bb11a05fda47ec3f8df15bc48b19c"
        payload = json.dumps({
            "model": "openclaw/main",
            "messages": [{"role": "user", "content": msg}],
            "channel": "telegram",
            "chat_id": "telegram:7675214611",
            "thread_id": 164,  # Agent Activity topic
        }).encode()
        req = ur.Request(gateway_url, data=payload, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {gateway_token}",
        })
        with ur.urlopen(req, timeout=10) as resp:
            log(f"Posted {len(results)} review candidates to Telegram")
    except Exception as e:
        log(f"Failed to post review to Telegram: {e}", "WARN")


def add_unique_constraint(conn):
    """Gap #11: Add unique constraint on (listId, accountId) if missing."""
    cur = conn.cursor()
    try:
        # Check if constraint already exists first
        cur.execute("""
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'ABMListMember'
              AND constraint_name = 'ABMListMember_list_account_unique'
        """)
        if cur.fetchone():
            log("Unique constraint already exists on ABMListMember")
            cur.close()
            return
        cur.execute("""
            ALTER TABLE "ABMListMember" 
            ADD CONSTRAINT "ABMListMember_list_account_unique" 
            UNIQUE ("listId", "accountId")
        """)
        conn.commit()
        log("Added unique constraint on ABMListMember(listId, accountId)")
    except Exception as e:
        conn.rollback()
        log(f"Could not add unique constraint: {e}", "WARN")
    finally:
        cur.close()


def get_pipeline_seeds(cur, product_filter=None):
    """Get pipeline accounts grouped by product — these are our ICP seed data.
    
    Pipeline accounts have active SF opportunities, meaning they're REAL buyers.
    Their shared traits (industry, tags, tech) define what a good prospect looks like.
    """
    sql = '''
        SELECT a.domain, a.company, a."productFit", 
               a."clearbitTags", a."clearbitDesc", a."clearbitTech",
               a.industry, a."annualRevenue", a.country
        FROM "ABMAccount" a
        WHERE a."inPipeline" = true
          AND a."productFit" IS NOT NULL
          AND a."productFit" != ''
    '''
    params = []
    if product_filter:
        sql += ' AND a."productFit" = %s'
        params.append(product_filter)
    sql += ' ORDER BY a."productFit", a.domain'
    
    cur.execute(sql, params)
    rows = cur.fetchall()
    
    # Group by product
    seeds = {}
    for r in rows:
        domain, company, product, tags, desc, tech, industry, revenue, country = r
        if product not in seeds:
            seeds[product] = []
        tags_list = tags if isinstance(tags, list) else (json.loads(tags) if tags else [])
        tech_list = tech if isinstance(tech, list) else (json.loads(tech) if tech else [])
        seeds[product].append({
            "domain": domain,
            "company": company,
            "tags": tags_list,
            "description": desc or "",
            "tech": tech_list,
            "industry": industry or "",
            "revenue": revenue,
            "country": country or "",
        })
    
    return seeds


def build_icp_profile_from_seeds(seeds_list):
    """Extract the common traits from pipeline accounts.
    
    Returns a profile with top tags, industries, and tech that define the ICP.
    """
    from collections import Counter
    
    all_tags = []
    all_industries = []
    all_tech = []
    
    for seed in seeds_list:
        all_tags.extend(seed.get("tags", []))
        if seed.get("industry"):
            all_industries.append(seed["industry"])
        all_tech.extend(seed.get("tech", []))
    
    # Top tags (excluding generic ones like B2B, Enterprise, etc.)
    generic_tags = {"B2B", "B2C", "Enterprise", "Information Technology & Services", 
                    "Technology", "Information", "Computers", "SAAS", "E-commerce"}
    tag_counts = Counter(t for t in all_tags if t not in generic_tags)
    top_tags = [t for t, _ in tag_counts.most_common(15)]
    
    # Top industries
    ind_counts = Counter(all_industries)
    top_industries = [i for i, _ in ind_counts.most_common(5)]
    
    # Top tech
    generic_tech = {"google_analytics", "google_tag_manager", "wordpress", "jquery"}
    tech_counts = Counter(t for t in all_tech if t not in generic_tech)
    top_tech = [t for t, _ in tech_counts.most_common(10)]
    
    # Company names for the prompt
    company_names = [s["company"] for s in seeds_list if s.get("company")]
    
    return {
        "top_tags": top_tags,
        "top_industries": top_industries,
        "top_tech": top_tech,
        "company_names": company_names[:10],
        "seed_count": len(seeds_list),
    }


def ai_research_pipeline(product, icp_profile, icp_rules, max_candidates=20):
    """Pipeline-driven AI research — find companies SIMILAR to our pipeline accounts.
    
    This is much more targeted than segment-size research because we're saying:
    'Find companies like THESE actual buyers' not 'find companies matching this generic ICP'.
    """
    company_examples = ", ".join(icp_profile["company_names"][:5])
    tag_signal = ", ".join(icp_profile["top_tags"][:8])
    tech_signal = ", ".join(icp_profile["top_tech"][:5])
    industry_signal = ", ".join(icp_profile["top_industries"][:3])
    
    use_case_kw = ", ".join(icp_rules.get("useCaseKeywords", [])[:8])
    
    prompt = f"""You are a B2B prospect researcher for Telnyx, a cloud communications platform.

We have {icp_profile['seed_count']} ACTIVE PIPELINE accounts for {product}. These are companies with open Salesforce opportunities — real buyers.

Our pipeline accounts include: {company_examples}

Common traits across our pipeline:
- Industries: {industry_signal}
- Business categories: {tag_signal}
- Tech stack: {tech_signal}

Their use cases: {use_case_kw}

TASK: Find 15-20 OTHER companies that are SIMILAR to these pipeline accounts.
They should:
1. Be in similar industries or serve similar markets
2. Have similar tech stacks or infrastructure needs
3. Build or deploy {product} solutions
4. Be the kind of company that would evaluate Telnyx

DO NOT suggest:
- Companies already in our pipeline
- Companies in waste industries (hospitals, airlines, retail, banking, government, law firms)
- Companies without a clear {product} use case
- Consumer-facing companies with no B2B angle

Return a JSON array of objects with: name, domain, reason (why they're similar to our pipeline accounts)
Return ONLY the JSON array, no other text."""

    # Try primary model, then fallback
    for model in [LITELLM_MODEL_PRIMARY, LITELLM_MODEL_FALLBACK]:
        try:
            payload = json.dumps({
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 2000,
                "temperature": 0.3,
            }).encode("utf-8")

            req = urllib.request.Request(
                LITELLM_URL,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {LITELLM_KEY}",
                },
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                content = data["choices"][0]["message"]["content"]

                # Parse JSON from response
                start = content.find("[")
                end = content.rfind("]") + 1
                if start >= 0 and end > start:
                    candidates = json.loads(content[start:end])
                    for c in candidates:
                        c["discoverySource"] = "pipeline_lookalike"
                        c["llmModel"] = model
                    return candidates
                return []
        except Exception as e:
            log(f"Pipeline research failed with {model}: {e}", "WARN")
            continue
    
    log(f"Pipeline research failed with all models", "ERROR")
    return []


def run_expander_pipeline(dry_run=False, limit=None, product_filter=None):
    """Pipeline-driven expansion — find lookalikes of accounts with active SF opps.
    
    This runs BEFORE the segment-size expander. If a product has pipeline accounts,
    we use them as seed data. If not, the segment-size fallback handles it.
    """
    log(f"🎯 Pipeline-driven expansion starting... (dry_run={dry_run})")

    conn = get_db()
    cur = conn.cursor()

    add_unique_constraint(conn)
    if not dry_run:
        seed_competitor_exclusions(cur)

    # Step 1: Get pipeline seeds grouped by product
    seeds = get_pipeline_seeds(cur, product_filter)
    log(f"Found pipeline seeds: {', '.join(f'{p} ({len(s)} accounts)' for p, s in seeds.items())}")

    total_added = 0
    total_skipped = 0
    total_review = 0
    results = []
    review_candidates = []

    for product, product_seeds in seeds.items():
        if limit and len(results) >= limit:
            break

        log(f"\n{'='*60}")
        log(f"🔬 Pipeline expansion: {product} ({len(product_seeds)} seed accounts)")

        # Build ICP profile from pipeline accounts
        icp_profile = build_icp_profile_from_seeds(product_seeds)
        log(f"  ICP Profile: tags={icp_profile['top_tags'][:5]}, industries={icp_profile['top_industries'][:3]}")

        # Get ICP rules for the product
        icp_rules = get_icp_rules(cur, product)

        # Step 2: AI Research — pipeline-driven prompt
        log(f"  🔍 Running pipeline-driven AI research...")
        candidates = ai_research_pipeline(product, icp_profile, icp_rules, max_candidates=20)
        log(f"  Found {len(candidates)} candidates from pipeline research")

        if not candidates:
            log(f"  No candidates found — skipping product")
            continue

        # Batch SF lookup
        candidate_domains = []
        for c in candidates:
            d = c.get("domain", "").lower().strip().rstrip("/")
            if d.startswith("www."):
                d = d[4:]
            c["domain"] = d
            if d:
                candidate_domains.append(d)
        
        sf_results = salesforce_batch_check(candidate_domains)

        for candidate in candidates:
            name = candidate.get("name", "")
            domain = candidate.get("domain", "")
            reason = candidate.get("reason", "")
            discovery_source = "pipeline_lookalike"

            if not domain or not name:
                total_skipped += 1
                continue

            log(f"  📋 Evaluating: {name} ({domain})")

            # Check exclusions
            if is_excluded(cur, domain, product):
                log(f"    ❌ Excluded")
                total_skipped += 1
                continue

            # Cross-campaign dedup
            already_targeted, dedup_reason = is_already_targeted(cur, domain, product)
            if already_targeted:
                log(f"    ❌ Already targeted: {dedup_reason}")
                total_skipped += 1
                continue

            # Clearbit validate
            clearbit_data = clearbit_enrich(domain)
            valid, validation_reason = clearbit_validate(clearbit_data, icp_rules, product)

            if not valid:
                log(f"    ❌ Clearbit validation failed: {validation_reason}")
                total_skipped += 1
                continue

            # Hallucination check
            hallucination_ok, hallucination_reason = check_hallucination(name, clearbit_data)
            if not hallucination_ok:
                log(f"    ❌ Hallucination check failed: {hallucination_reason}")
                total_skipped += 1
                continue

            # Relevance score
            score, score_detail = relevance_score(clearbit_data, icp_rules, product)
            log(f"    📊 Relevance: {score:.3f} ({score_detail})")

            # Pipeline lookalikes use MOFU thresholds (they're expansion from real buyers)
            thresholds = get_thresholds("MOFU")

            if score < thresholds["review"]:
                log(f"    ❌ Low relevance — skipping")
                total_skipped += 1
                continue

            # SF cross-check
            sf_result = sf_results.get(domain, {"status": "not_found"})
            should_skip, skip_reason = salesforce_should_skip(sf_result)
            if should_skip:
                log(f"    ❌ SF skip: {skip_reason}")
                total_skipped += 1
                continue

            # Execute
            if score >= thresholds["auto_add"]:
                if not dry_run:
                    account_id, status = add_account_to_db(
                        cur, domain, name, product, None, score, reason,
                        source=discovery_source
                    )
                    conn.commit()
                    log(f"    ✅ Added ({status}, score={score:.3f})")
                else:
                    log(f"    ✅ Would add (dry run, score={score:.3f})")
                total_added += 1
                results.append({
                    "name": name, "domain": domain, "score": score,
                    "reason": reason, "action": "added",
                    "product": product, "variant": None,
                    "discoverySource": discovery_source,
                })
            elif score >= thresholds["review"]:
                log(f"    🟡 Moderate fit — queue for review")
                total_review += 1
                review_candidates.append({
                    "name": name, "domain": domain, "score": score,
                    "reason": reason, "action": "review",
                    "product": product, "variant": None,
                    "discoverySource": discovery_source,
                })

        time.sleep(2)

    # Post review candidates
    if review_candidates and not dry_run:
        post_review_to_telegram(review_candidates)
    results.extend(review_candidates)

    log(f"\n{'='*60}")
    log(f"📊 PIPELINE EXPANSION SUMMARY")
    log(f"  Products processed: {len(seeds)}")
    log(f"  Candidates added: {total_added}")
    log(f"  Candidates for review: {total_review}")
    log(f"  Candidates skipped: {total_skipped}")

    # Log to AgentRun
    if not dry_run:
        cur.execute("""
            INSERT INTO "AgentRun" (id, "agentName", status, "startedAt", "completedAt", findings)
            VALUES (gen_random_uuid()::text, %s, 'done', now(), now(), %s)
        """, (AGENT_SLUG + "-pipeline", json.dumps({
            "version": "v3-pipeline",
            "productsProcessed": len(seeds),
            "added": total_added,
            "review": total_review,
            "skipped": total_skipped,
            "results": results[:50],
        })))
        conn.commit()

    cur.close()
    conn.close()

    return results


def run_expander(dry_run=False, limit=None, product_filter=None):
    """Run the full Expander pipeline (v3 — pipeline-driven + segment-size fallback).
    
    Pipeline-driven mode runs FIRST: for each product with pipeline accounts,
    find lookalikes based on shared traits of real buyers.
    
    Segment-size fallback runs AFTER: fills undersized segments that don't have
    pipeline seeds yet.
    """
    log(f"🚀 {AGENT_NAME} v3 starting... (dry_run={dry_run})")

    conn = get_db()
    cur = conn.cursor()

    # Gap #11: Ensure unique constraint exists
    add_unique_constraint(conn)

    # Gap #12: Seed competitor exclusions
    if not dry_run:
        seed_competitor_exclusions(cur)
    cur.close()
    conn.close()

    # PHASE 1: Pipeline-driven expansion
    pipeline_seeds = get_pipeline_seeds_via_db(product_filter)
    pipeline_products = set(pipeline_seeds.keys()) if pipeline_seeds else set()
    
    if pipeline_products:
        log(f"🎯 PHASE 1: Pipeline-driven expansion for: {', '.join(pipeline_products)}")
        pipeline_results = run_expander_pipeline(dry_run=dry_run, limit=limit, product_filter=product_filter)
    else:
        log(f"No pipeline seeds found — skipping pipeline-driven phase")
        pipeline_results = []

    # PHASE 2: Segment-size fallback (for products without pipeline seeds)
    conn = get_db()
    cur = conn.cursor()
    segments = find_undersized_segments(cur, product_filter)
    
    # Only process segments for products that DON'T have pipeline seeds
    # (pipeline mode already handled those)
    non_pipeline_segments = [s for s in segments if s.get("product") not in pipeline_products]
    
    if non_pipeline_segments:
        log(f"📐 PHASE 2: Segment-size expansion for {len(non_pipeline_segments)} undersized segments (no pipeline seeds)")
        # Run the original segment-size logic for remaining products
        _run_segment_expansion(cur, conn, non_pipeline_segments, dry_run=dry_run, limit=limit, results_so_far=pipeline_results)
    else:
        log(f"No undersized segments without pipeline seeds — done")

    cur.close()
    conn.close()


def get_pipeline_seeds_via_db(product_filter=None):
    """Quick check for pipeline seeds without opening a new connection in run_expander."""
    conn = get_db()
    cur = conn.cursor()
    seeds = get_pipeline_seeds(cur, product_filter)
    cur.close()
    conn.close()
    return seeds


def _run_segment_expansion(cur, conn, segments, dry_run=False, limit=None, results_so_far=None):
    """Original segment-size driven expansion (runs as Phase 2 fallback)."""
    if results_so_far is None:
        results_so_far = []
    
    total_added = sum(1 for r in results_so_far if r.get("action") == "added")
    total_review = sum(1 for r in results_so_far if r.get("action") == "review")
    total_skipped = 0
    results = list(results_so_far)
    review_candidates = []

    for seg in segments:
        product = seg.get("product", "")
        variant = seg.get("variant", "")
        platform = seg.get("platform", "")
        intent = seg.get("intent", "")
        segment_id = seg.get("segmentId", "")
        geo_countries = seg.get("geoCountries")

        log(f"\n{'='*60}")
        log(f"Processing: {seg['campaignName']} | {product}/{variant or 'generic'} | {platform}")
        log(f"  Segment: {seg['segmentName']} (size: {seg['segmentSize']})")

        is_shared, conflicts = is_shared_segment(cur, segment_id, product, variant)
        if is_shared:
            log(f"  ⚠ SHARED SEGMENT across {len(conflicts)} variants: {conflicts}")
            seg["sharedSegmentWarning"] = conflicts

        icp_rules = get_icp_rules(cur, product, variant)
        if not icp_rules.get("useCaseKeywords") and not icp_rules.get("descriptionKeywords"):
            log(f"  ⚠ No ICP rules found for {product}/{variant} — skipping")
            continue

        log(f"  ICP: {len(icp_rules['useCaseKeywords'])} use-case keywords, {len(icp_rules['descriptionKeywords'])} desc keywords")

        log(f"  🔍 Running AI research...")
        candidates = ai_research(seg, icp_rules, max_candidates=15)
        log(f"  Found {len(candidates)} candidates from AI research")

        if not candidates:
            log(f"  No candidates found — skipping segment")
            continue

        candidate_domains = []
        for c in candidates:
            d = c.get("domain", "").lower().strip().rstrip("/")
            if d.startswith("www."):
                d = d[4:]
            c["domain"] = d
            if d:
                candidate_domains.append(d)
        
        sf_results = salesforce_batch_check(candidate_domains)

        for candidate in candidates:
            name = candidate.get("name", "")
            domain = candidate.get("domain", "")
            reason = candidate.get("reason", "")
            discovery_source = candidate.get("discoverySource", "ai_research")

            if not domain or not name:
                total_skipped += 1
                continue

            log(f"  📋 Evaluating: {name} ({domain})")

            if is_excluded(cur, domain, product):
                log(f"    ❌ Excluded")
                total_skipped += 1
                continue

            already_targeted, dedup_reason = is_already_targeted(cur, domain, product, variant)
            if already_targeted:
                log(f"    ❌ Already targeted: {dedup_reason}")
                total_skipped += 1
                continue

            clearbit_data = clearbit_enrich(domain)
            valid, validation_reason = clearbit_validate(clearbit_data, icp_rules, product)

            if not valid:
                log(f"    ❌ Clearbit validation failed: {validation_reason}")
                total_skipped += 1
                continue

            hallucination_ok, hallucination_reason = check_hallucination(name, clearbit_data)
            if not hallucination_ok:
                log(f"    ❌ Hallucination check failed: {hallucination_reason}")
                total_skipped += 1
                continue

            geo_ok, geo_reason = check_geo_match(geo_countries, clearbit_data)
            if not geo_ok:
                log(f"    ❌ Geo mismatch: {geo_reason}")
                total_skipped += 1
                continue

            score, score_detail = relevance_score(clearbit_data, icp_rules, product, variant)
            log(f"    📊 Relevance: {score:.3f} ({score_detail})")

            thresholds = get_thresholds(intent)

            if score < thresholds["review"]:
                log(f"    ❌ Low relevance — skipping")
                total_skipped += 1
                continue

            sf_result = sf_results.get(domain, {"status": "not_found"})
            should_skip, skip_reason = salesforce_should_skip(sf_result)
            if should_skip:
                log(f"    ❌ SF skip: {skip_reason}")
                total_skipped += 1
                continue

            if score >= thresholds["auto_add"]:
                if not dry_run:
                    account_id, status = add_account_to_db(
                        cur, domain, name, product, variant, score, reason,
                        source=discovery_source
                    )
                    conn.commit()
                    log(f"    ✅ Added ({status}, score={score:.3f})")
                else:
                    log(f"    ✅ Would add (dry run, score={score:.3f})")
                total_added += 1
                results.append({
                    "name": name, "domain": domain, "score": score,
                    "reason": reason, "action": "added",
                    "product": product, "variant": variant,
                    "discoverySource": discovery_source,
                    "sharedSegmentWarning": seg.get("sharedSegmentWarning"),
                })
            elif score >= thresholds["review"]:
                log(f"    🟡 Moderate fit — queue for review")
                total_review += 1
                review_candidates.append({
                    "name": name, "domain": domain, "score": score,
                    "reason": reason, "action": "review",
                    "product": product, "variant": variant,
                    "discoverySource": discovery_source,
                })

        time.sleep(2)

    if review_candidates and not dry_run:
        post_review_to_telegram(review_candidates)
    results.extend(review_candidates)

    log(f"\n{'='*60}")
    log(f"📊 SEGMENT EXPANSION SUMMARY")
    log(f"  Segments processed: {len(segments)}")
    log(f"  Candidates added: {total_added}")
    log(f"  Candidates for review: {total_review}")
    log(f"  Candidates skipped: {total_skipped}")

    if not dry_run:
        cur.execute("""
            INSERT INTO "AgentRun" (id, "agentName", status, "startedAt", "completedAt", findings)
            VALUES (gen_random_uuid()::text, %s, 'done', now(), now(), %s)
        """, (AGENT_SLUG + "-segment", json.dumps({
            "version": "v3-segment",
            "segmentsProcessed": len(segments),
            "added": total_added,
            "review": total_review,
            "skipped": total_skipped,
            "results": results[:50],
        })))
        conn.commit()

    if limit:
        segments = segments[:limit]

    total_added = 0
    total_skipped = 0
    total_review = 0
    results = []
    review_candidates = []  # Gap #7: collect for Telegram posting

    for seg in segments:
        product = seg.get("product", "")
        variant = seg.get("variant", "")
        platform = seg.get("platform", "")
        intent = seg.get("intent", "")
        segment_id = seg.get("segmentId", "")
        geo_countries = seg.get("geoCountries")

        log(f"\n{'='*60}")
        log(f"Processing: {seg['campaignName']} | {product}/{variant or 'generic'} | {platform}")
        log(f"  Segment: {seg['segmentName']} (size: {seg['segmentSize']})")

        # Gap #2: Check if segment is shared across conflicting campaigns
        is_shared, conflicts = is_shared_segment(cur, segment_id, product, variant)
        if is_shared:
            log(f"  ⚠ SHARED SEGMENT across {len(conflicts)} variants: {conflicts}")
            log(f"  Flagging for Segment Engine — adding domains could hit multiple campaigns")
            seg["sharedSegmentWarning"] = conflicts

        # Get ICP rules
        icp_rules = get_icp_rules(cur, product, variant)
        if not icp_rules.get("useCaseKeywords") and not icp_rules.get("descriptionKeywords"):
            log(f"  ⚠ No ICP rules found for {product}/{variant} — skipping")
            continue

        log(f"  ICP: {len(icp_rules['useCaseKeywords'])} use-case keywords, {len(icp_rules['descriptionKeywords'])} desc keywords")

        # Step 2: AI Research (variant-aware, geo-aware, fallback model)
        log(f"  🔍 Running AI research...")
        candidates = ai_research(seg, icp_rules, max_candidates=15)
        log(f"  Found {len(candidates)} candidates from AI research")

        if not candidates:
            log(f"  No candidates found — skipping segment")
            continue

        # Gap #8: Batch SF lookup for all candidate domains
        candidate_domains = []
        for c in candidates:
            d = c.get("domain", "").lower().strip().rstrip("/")
            if d.startswith("www."):
                d = d[4:]
            c["domain"] = d
            if d:
                candidate_domains.append(d)
        
        sf_results = salesforce_batch_check(candidate_domains)

        for candidate in candidates:
            name = candidate.get("name", "")
            domain = candidate.get("domain", "")
            reason = candidate.get("reason", "")
            discovery_source = candidate.get("discoverySource", "ai_research")  # Gap #14
            llm_model = candidate.get("llmModel", "unknown")  # Gap #14

            if not domain or not name:
                total_skipped += 1
                continue

            log(f"  📋 Evaluating: {name} ({domain})")

            # Check exclusions (including competitor domains from Gap #12)
            if is_excluded(cur, domain, product):
                log(f"    ❌ Excluded")
                total_skipped += 1
                continue

            # Cross-campaign dedup
            already_targeted, dedup_reason = is_already_targeted(cur, domain, product, variant)
            if already_targeted:
                log(f"    ❌ Already targeted: {dedup_reason}")
                total_skipped += 1
                continue

            # Step 3: Clearbit validate (with 202 retry — Gap #6)
            clearbit_data = clearbit_enrich(domain)
            valid, validation_reason = clearbit_validate(clearbit_data, icp_rules, product)

            if not valid:
                log(f"    ❌ Clearbit validation failed: {validation_reason}")
                total_skipped += 1
                continue

            # Gap #5: Hallucination check
            hallucination_ok, hallucination_reason = check_hallucination(name, clearbit_data)
            if not hallucination_ok:
                log(f"    ❌ Hallucination check failed: {hallucination_reason}")
                total_skipped += 1
                continue

            # Gap #3: Geo match
            geo_ok, geo_reason = check_geo_match(geo_countries, clearbit_data)
            if not geo_ok:
                log(f"    ❌ Geo mismatch: {geo_reason}")
                total_skipped += 1
                continue

            # Step 5: Relevance score (variant-aware — Gap #4)
            score, score_detail = relevance_score(clearbit_data, icp_rules, product, variant)
            log(f"    📊 Relevance: {score:.3f} ({score_detail})")

            # Gap #13: Intent-aware thresholds
            thresholds = get_thresholds(intent)

            if score < thresholds["review"]:
                log(f"    ❌ Low relevance — skipping")
                total_skipped += 1
                continue

            # Step 4: Salesforce cross-check (Gap #1: only skip Customers/Partners)
            sf_result = sf_results.get(domain, {"status": "not_found"})
            should_skip, skip_reason = salesforce_should_skip(sf_result)
            if should_skip:
                log(f"    ❌ SF skip: {skip_reason}")
                total_skipped += 1
                continue

            # Step 7: Execute
            if score >= thresholds["auto_add"]:
                if not dry_run:
                    account_id, status = add_account_to_db(
                        cur, domain, name, product, variant, score, reason,
                        source=discovery_source
                    )
                    conn.commit()
                    log(f"    ✅ Added ({status}, score={score:.3f})")
                else:
                    log(f"    ✅ Would add (dry run, score={score:.3f})")
                total_added += 1
                results.append({
                    "name": name, "domain": domain, "score": score,
                    "reason": reason, "action": "added",
                    "product": product, "variant": variant,
                    "discoverySource": discovery_source,
                    "llmModel": llm_model,
                    "geoReason": geo_reason,
                    "sharedSegmentWarning": seg.get("sharedSegmentWarning"),
                })
            elif score >= thresholds["review"]:
                log(f"    🟡 Moderate fit — queue for review")
                total_review += 1
                review_candidates.append({
                    "name": name, "domain": domain, "score": score,
                    "reason": reason, "action": "review",
                    "product": product, "variant": variant,
                    "discoverySource": discovery_source,
                    "llmModel": llm_model,
                })

        # Rate limit between segments
        time.sleep(2)

    # Gap #7: Post review candidates to Telegram
    if review_candidates and not dry_run:
        post_review_to_telegram(review_candidates)
    results.extend(review_candidates)

    # Summary
    log(f"\n{'='*60}")
    log(f"📊 EXPANDER SUMMARY")
    log(f"  Segments processed: {len(segments)}")
    log(f"  Candidates added: {total_added}")
    log(f"  Candidates for review: {total_review}")
    log(f"  Candidates skipped: {total_skipped}")

    # Log to AgentRun
    if not dry_run:
        cur.execute("""
            INSERT INTO "AgentRun" (id, "agentName", status, "startedAt", "completedAt", findings)
            VALUES (gen_random_uuid()::text, %s, 'done', now(), now(), %s)
        """, (AGENT_SLUG, json.dumps({
            "version": "v2",
            "segmentsProcessed": len(segments),
            "added": total_added,
            "review": total_review,
            "skipped": total_skipped,
            "results": results[:50],
        })))
        conn.commit()

    cur.close()
    conn.close()

    return results


# ─── CLI ──────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=AGENT_NAME)
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no DB writes")
    parser.add_argument("--limit", type=int, default=None, help="Max segments to process")
    parser.add_argument("--product", type=str, default=None, help="Filter by product (e.g., 'AI Agent')")
    args = parser.parse_args()

    results = run_expander(dry_run=args.dry_run, limit=args.limit, product_filter=args.product)
    # run_expander now calls both pipeline-driven (phase 1) and segment-size (phase 2) internally
