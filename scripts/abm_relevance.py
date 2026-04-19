#!/usr/bin/env python3
"""
ABM Relevance Scoring Engine
=============================
Scores how relevant a company is to a specific campaign's product/variant.

Scoring model (reality-checked):
  - Industry match (30%) — Clearbit tags overlap with campaign target verticals
  - Description/use-case match (40%) — Clearbit description contains product-related keywords
  - Company type signal (15%) — SaaS/platform companies score higher for API products
  - Size + stage fit (15%) — Employee count matches ABMListRule ranges

Key insight from testing: Clearbit tags alone can't distinguish "healthcare SaaS" 
from "healthcare insurance." Description text is the strongest signal. 
When description is missing, score is unreliable — flag for AI research.

Usage:
    from scripts.abm_relevance import RelevanceScorer
    scorer = RelevanceScorer()
    score, reasoning = scorer.score(account_data, campaign_context)
"""

import json
import re
from typing import Optional

# ─── Product-Keyword Mapping ──────────────────────────────
# Maps parsedProduct to keywords that indicate a company might buy that product.
# These are what we look for in Clearbit descriptions and tags.

PRODUCT_KEYWORDS = {
    "AI Agent": {
        "description_keywords": [
            "AI", "artificial intelligence", "agent", "chatbot", "voice bot",
            "virtual assistant", "automation", "conversational", "LLM", "GPT",
            "natural language", "machine learning", "NLP", "generative",
            "SaaS", "platform", "software", "API", "cloud",
            "contact center", "call center", "customer service",
            "IVR", "VoIP", "voice", "telephony", "SMS",
            "communication", "messaging", "phone",
            "CPaaS", "UCaaS", "CCaaS",
        ],
        "buyer_industries": [
            "Information Technology & Services", "Technology", "Software",
            "Telecommunications", "Artificial Intelligence",
            "Call Center", "Telemedicine", "Telemarketing",
        ],
        "waste_industries": [
            # Travel agencies/services — NOT travel tech (Sabre, Booking are buyers)
            "Travel & Tourism", "Airport Services",
            # Non-software industries
            "Home Improvement", "Real Estate", "Crypto", "Retail",
            "Entertainment & Recreation", "Hotel Management", "Restaurants",
            "Golf", "Luxury Goods", "Theaters", "Convention",
            "Hospitality",
        ],
        # Integration/middleware platforms — they connect TO APIs but don't BUY them as end users
        "integration_exclusions": [
            "GDS", "global distribution system", "integration platform",
            "middleware", "iPaaS", "service desk", "IT service management",
            "workflow automation", "Sabre", "ServiceNow", "MuleSoft",
            "Zapier", "Workato", "Boomi",
        ],
    },
    "Voice API": {
        "description_keywords": [
            "voice", "telephony", "calling", "phone", "SIP", "VoIP", "PBX",
            "communication", "contact center", "call center", "IVR",
            "CPaaS", "UCaaS", "CCaaS", "API", "cloud",
            "SaaS", "platform", "software",
        ],
        "buyer_industries": [
            "Information Technology & Services", "Technology", "Software",
            "Telecommunications", "Call Center", "Telemedicine",
        ],
        "waste_industries": [
            "Travel & Leisure", "E-commerce", "Publishing", "Retail",
            "Real Estate", "Crypto", "Restaurants",
        ],
    },
    "SIP Trunking": {
        "description_keywords": [
            "SIP", "trunking", "telephony", "PBX", "phone system", "VoIP",
            "UCaaS", "unified communications", "call center", "communication",
            "enterprise", "network", "voice",
        ],
        "buyer_industries": [
            "Information Technology & Services", "Technology",
            "Telecommunications", "Call Center",
        ],
        "waste_industries": [
            "Travel & Leisure", "E-commerce", "Publishing", "Crypto",
        ],
    },
    "IoT SIM": {
        "description_keywords": [
            "IoT", "Internet of Things", "SIM", "cellular", "connected device",
            "telematics", "fleet", "asset tracking", "M2M", "embedded",
            "sensor", "smart device", "connectivity",
        ],
        "buyer_industries": [
            "Information Technology & Services", "Technology",
            "Telecommunications", "Manufacturing", "Engineering",
        ],
        "waste_industries": [
            "Travel & Leisure", "E-commerce", "Publishing", "Crypto",
        ],
    },
}

# Default fallback for products not in the map
DEFAULT_KEYWORDS = {
    "description_keywords": ["SaaS", "platform", "software", "API", "cloud", "technology"],
    "buyer_industries": ["Information Technology & Services", "Technology", "Software", "Telecommunications"],
    "waste_industries": ["Travel & Leisure", "E-commerce", "Publishing", "Crypto", "Retail"],
}

# Company type signals — industries that suggest they BUILD software (higher API buyer likelihood)
SOFTWARE_BUILDER_INDUSTRIES = {
    "Information Technology & Services", "Technology", "Software",
    "Artificial Intelligence", "Telecommunications",
}

# Variant-specific keywords
VARIANT_KEYWORDS = {
    "Healthcare": ["healthcare", "health", "medical", "clinical", "patient", "telemedicine", "hospital", "pharma"],
    "Fintech": ["fintech", "financial", "banking", "payments", "trading", "lending", "crypto"],
    "Travel": ["travel", "booking", "hospitality", "airline", "hotel"],
    "Sabre": ["sabre", "travel", "booking", "gds", "airline"],
    "ElevenLabs": ["elevenlabs", "voice", "text-to-speech", "tts"],
    "Vapi": ["vapi", "voice", "ai agent"],
    "Twilio": ["twilio", "communication", "voice api", "sms api", "messaging"],
}


class RelevanceScorer:
    """Scores company-campaign relevance based on Clearbit data + campaign context."""

    def score(self, account: dict, campaign: dict, rule: Optional[dict] = None) -> tuple:
        """Score a company's relevance to a campaign.
        
        Args:
            account: dict with keys: industry, clearbitTags, clearbitDesc, employeeCount, domain
            campaign: dict with keys: parsedProduct, parsedVariant, parsedIntent
            rule: optional ABMListRule dict with: verticals, companySizeMin, companySizeMax
            
        Returns:
            (score, reasoning) where score is 0.0-1.0 and reasoning is a dict with component scores
        """
        product = campaign.get("parsedProduct", "")
        variant = campaign.get("parsedVariant", "")
        
        keywords = PRODUCT_KEYWORDS.get(product, DEFAULT_KEYWORDS)
        
        # 1. Industry match (30%)
        industry_score = self._score_industry(account, keywords)
        
        # 2. Description/use-case match (40%)
        desc_score, desc_detail = self._score_description(account, keywords, variant)
        
        # 3. Company type signal (15%)
        type_score = self._score_company_type(account)
        
        # 4. Size + stage fit (15%)
        size_score = self._score_size(account, rule)
        
        # Weighted total
        total = (
            industry_score * 0.30 +
            desc_score * 0.40 +
            type_score * 0.15 +
            size_score * 0.15
        )
        
        # Penalties
        tags = account.get("clearbitTags", [])
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except:
                tags = []
        
        desc = (account.get("clearbitDesc", "") or "").lower()
        company = (account.get("company", "") or "").lower()
        domain = (account.get("domain", "") or "").lower()
        
        # Hard penalty for waste industries — but only if it's the PRIMARY industry
        # Telecom/comm keywords in description can partially override waste penalty
        primary_industry = tags[0] if tags else ""
        telecom_override_terms = ["voice", "voip", "ivr", "sms", "telephony", "sip",
                                   "communication", "cpaas", "call center", "contact center",
                                   "messaging", "phone"]
        has_telecom_signal = any(t in desc for t in telecom_override_terms)
        if primary_industry in keywords.get("waste_industries", []):
            if has_telecom_signal:
                total = min(total, 0.45)  # Telecom signal partially overrides waste
            else:
                total = min(total, 0.25)
        elif any(t in keywords.get("waste_industries", []) for t in tags[1:3]):
            if has_telecom_signal:
                total = min(total, 0.55)  # Partial override
            else:
                total = min(total, 0.4)
        
        # Integration/middleware penalty — they connect TO APIs but don't BUY them
        integration_terms = keywords.get("integration_exclusions", [])
        if integration_terms:
            all_text = f"{desc} {company} {domain}"
            if any(term.lower() in all_text for term in integration_terms):
                total = min(total, 0.35)
        
        # If no description at all, mark as unreliable
        desc = account.get("clearbitDesc", "") or ""
        unreliable = len(desc.strip()) < 20
        
        reasoning = {
            "industry_score": round(industry_score, 3),
            "description_score": round(desc_score, 3),
            "description_detail": desc_detail,
            "company_type_score": round(type_score, 3),
            "size_score": round(size_score, 3),
            "total": round(total, 3),
            "unreliable": unreliable,
            "product": product,
            "variant": variant,
        }
        
        return round(total, 3), reasoning

    def _score_industry(self, account, keywords):
        """Score based on Clearbit industry tags matching buyer industries."""
        tags = account.get("clearbitTags", [])
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except:
                tags = []
        
        industry = account.get("industry", "") or (tags[0] if tags else "")
        
        if not industry:
            return 0.3  # Unknown — neutral
        
        buyer = keywords.get("buyer_industries", [])
        waste = keywords.get("waste_industries", [])
        
        if industry in buyer:
            return 1.0
        if industry in waste:
            return 0.0
        # Partial match — tag contains buyer industry or vice versa
        for b in buyer:
            if b.lower() in industry.lower() or industry.lower() in b.lower():
                return 0.7
        # Check all tags, not just primary
        for t in tags:
            if t in buyer:
                return 0.8
            if t in waste:
                return 0.1
        
        return 0.3  # Neutral — not clearly buyer or waste

    def _score_description(self, account, keywords, variant=""):
        """Score based on Clearbit description containing product/use-case keywords."""
        desc = (account.get("clearbitDesc", "") or "").lower()
        
        if not desc or len(desc) < 10:
            return 0.3, "no_description"  # Can't score — flag for AI research
        
        desc_keywords = keywords.get("description_keywords", [])
        variant_kw = VARIANT_KEYWORDS.get(variant, [])
        all_keywords = desc_keywords + variant_kw
        
        if not all_keywords:
            return 0.3, "no_keywords_defined"
        
        matches = []
        for kw in all_keywords:
            if kw.lower() in desc:
                matches.append(kw)
        
        if not matches:
            return 0.1, "no_keyword_matches"
        
        # Score based on ratio of matches to total keywords checked
        # But cap at 1.0 — even 2-3 strong matches is a good signal
        ratio = len(matches) / len(all_keywords)
        
        # Also consider match quality — some keywords are stronger signals
        strong_signals = ["SaaS", "platform", "software", "API", "AI", "voice", "automation",
                           "IVR", "VoIP", "SMS", "telephony", "CPaaS", "UCaaS", "CCaaS",
                           "communication", "messaging"]
        strong_matches = [m for m in matches if m.lower() in [s.lower() for s in strong_signals]]
        
        if strong_matches:
            score = min(0.5 + 0.15 * len(strong_matches), 1.0)
        else:
            score = min(ratio * 3, 0.7)  # Weaker matches cap at 0.7
        
        return round(score, 3), f"matched: {matches[:5]}"

    def _score_company_type(self, account):
        """Score based on whether the company builds or buys software."""
        tags = account.get("clearbitTags", [])
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except:
                tags = []
        
        industry = account.get("industry", "") or (tags[0] if tags else "")
        desc = (account.get("clearbitDesc", "") or "").lower()
        
        if industry in SOFTWARE_BUILDER_INDUSTRIES:
            return 1.0
        
        # Check description for software builder signals
        builder_signals = ["SaaS", "platform", "software", "API", "cloud", "technology", "developer"]
        if any(s.lower() in desc for s in builder_signals):
            return 0.8
        
        # Non-software company — they might still buy, but lower signal
        return 0.4

    def _score_size(self, account, rule=None):
        """Score based on employee count matching ABMListRule size criteria."""
        employees = account.get("employeeCount")
        
        if not employees:
            return 0.5  # Unknown — neutral
        
        employees = int(employees) if employees else None
        if not employees:
            return 0.5
        
        if rule:
            min_size = rule.get("companySizeMin")
            max_size = rule.get("companySizeMax")
            if min_size and employees < min_size:
                return 0.2
            if max_size and employees > max_size:
                return 0.4
            return 1.0
        
        # No rule — use general thresholds
        if employees < 10:
            return 0.2  # Too small for enterprise products
        if employees < 50:
            return 0.5
        if employees <= 5000:
            return 1.0  # Sweet spot
        if employees <= 50000:
            return 0.8
        return 0.6  # Very large — slower procurement

    def batch_score(self, accounts: list, campaign: dict, rule=None) -> list:
        """Score multiple accounts against a campaign.
        
        Returns list of (account_domain, score, reasoning) sorted by score desc.
        """
        results = []
        for acct in accounts:
            score, reasoning = self.score(acct, campaign, rule)
            results.append((acct.get("domain", ""), score, reasoning))
        results.sort(key=lambda x: x[1], reverse=True)
        return results


# ─── CLI for testing ──────────────────────────────────────

if __name__ == "__main__":
    import argparse
    import psycopg2
    import json
    
    parser = argparse.ArgumentParser(description="Test relevance scoring")
    parser.add_argument("--product", default="AI Agent", help="Campaign product")
    parser.add_argument("--variant", default="", help="Campaign variant")
    parser.add_argument("--limit", type=int, default=20, help="Domains to score")
    parser.add_argument("--min-impressions", type=int, default=1000, help="Min impressions filter")
    args = parser.parse_args()
    
    conn = psycopg2.connect("postgresql://localhost:5432/dghub")
    cur = conn.cursor()
    
    # Get top SA domains with enrichment data
    cur.execute("""
        SELECT a.domain, a.company, a.industry, a."clearbitTags", a."clearbitDesc",
               a."employeeCount", sum(i.impressions)::int as imp, sum(i.cost)::numeric(10,0) as spend
        FROM "AdImpression" i
        JOIN "ABMAccount" a ON i.domain = a.domain
        JOIN "Campaign" c ON i."campaignId" = c."platformId"
        WHERE i.platform = 'stackadapt'
          AND i.domain != '__campaign__'
          AND a."lastEnrichedAt" IS NOT NULL
          AND c.platform = 'stackadapt'
          AND c."parsedProduct" = %s
        GROUP BY a.domain, a.company, a.industry, a."clearbitTags", a."clearbitDesc", a."employeeCount"
        HAVING sum(i.impressions) > %s
        ORDER BY sum(i.impressions) DESC
        LIMIT %s
    """, (args.product, args.min_impressions, args.limit))
    
    accounts = []
    for row in cur.fetchall():
        tags = row[3]
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except:
                tags = []
        accounts.append({
            "domain": row[0],
            "company": row[1],
            "industry": row[2],
            "clearbitTags": tags,
            "clearbitDesc": row[4],
            "employeeCount": row[5],
            "impressions": row[6],
            "spend": row[7],
        })
    
    campaign = {"parsedProduct": args.product, "parsedVariant": args.variant}
    scorer = RelevanceScorer()
    
    print(f"Scoring {len(accounts)} domains against {args.product} / {args.variant or 'any variant'}\n")
    print(f"{'Score':>5} | {'Domain':<25} | {'Industry':<30} | {'Spend':>6} | Reasoning")
    print("-" * 120)
    
    for acct in accounts:
        score, reasoning = scorer.score(acct, campaign)
        marker = "🔴" if score < 0.3 else "🟡" if score < 0.5 else "🟢"
        desc_short = (reasoning.get("description_detail", ""))[:30]
        print(f"{marker} {score:.2f} | {acct['domain']:<25} | {acct.get('industry','?'):<30} | ${acct['spend']:>5} | {desc_short}")
