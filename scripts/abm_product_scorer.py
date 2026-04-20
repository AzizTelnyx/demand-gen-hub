#!/usr/bin/env python3
"""
ABM Product Fit Scorer — Re-scores productFit for all ABMAccounts.

The original productFit was derived from which campaign served impressions to a domain.
That's wrong — a logistics company getting served an AI Agent ad doesn't make it an AI Agent fit.

This script scores each account against ALL products and assigns the best-fit product
based on the company's actual description, industry, and Clearbit data.

Scoring weights:
- Description keywords: 40% (most important — actual company activity)
- Industry tags: 30% (Clearbit industry classification)
- Clearbit tags: 15% (supplementary signals)
- Tech stack: 15% (what tools they use)

Product keyword lists are STRICT — only terms that indicate actual product need,
not generic telecom/communication terms that match everything.

Usage:
  python3 scripts/abm_product_scorer.py --dry-run     # Preview changes
  python3 scripts/abm_product_scorer.py               # Apply changes
  python3 scripts/abm_product_scorer.py --domain priorityworldwide.com  # Score one domain
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

import psycopg2

DB_URL = "postgresql://localhost:5432/dghub"

# STRICT product keywords — only terms that indicate actual product NEED
# NOT generic telecom terms (those go in the telecom override section)
PRODUCT_KEYWORDS = {
    "AI Agent": {
        # Core AI agent signals
        "core": ["ai agent", "voice ai", "conversational ai", "ai voice agent",
                 "autonomous agent", "voicebot", "chatbot", "virtual agent",
                 "ai assistant", "intelligent agent", "voice assistant",
                 "generative ai", "large language model", "llm applications",
                 "ai calling", "ai dialer", "predictive dialer",
                 "agent assist", "ai-powered customer service",
                 "virtual assistant", "intelligent virtual assistant",
                 "natural language", "voice recognition",
                 "speech ai", "voice automation",
                 "conversational platform", "dialogue system"],
        # Strong secondary signals (still specific to AI Agent use cases)
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
                 "sip calling", "webtrc", "webrtc", "voice over ip",
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
        "core": ["sip trunk", "sip trunking", "sip provider",
                 "sip gateway", "sip connection", "sip trunking service",
                 "unified communications", "uc platform", "uc solution",
                 "sip channel", "sip lines", "e-sbc"],
        "secondary": ["pbx replacement", "cloud pbx", "hosted pbx",
                      "voip provider", "sip termination", "sip origination",
                      "telephony provider", "business phone system",
                      "voip phone system", "voip service provider"],
    },
    "IoT SIM": {
        "core": ["iot sim", "iot connectivity", "cellular iot",
                 "m2m sim", "iot device management", "iot platform",
                 "esim iot", "industrial iot", "iot sensor",
                 "iot deployment", "iot fleet management",
                 "asset tracking", "fleet tracking", "telematics",
                 "remote monitoring", "connected device",
                 "cellular connectivity", "lpwan", "nb-iot",
                 "logistics", "fleet management", "gps tracking",
                 "supply chain", "emergency response",
                 "field operations", "remote operations"],
        "secondary": ["smart meter", "smart city", "connected vehicle",
                      "supply chain visibility", "cold chain",
                      "logistics company", "logistics tracking",
                      "wearable device",
                      "environmental monitoring", "precision agriculture",
                      "developing nations", "remote areas",
                      "oil and gas", "mining operations",
                      "maritime", "aviation", "shipping",
                      "truck", "trucking", "delivery fleet"],
    },
}

# Industries that signal product fit
PRODUCT_INDUSTRIES = {
    "AI Agent": ["software", "technology", "information technology", "artificial intelligence",
                 "call center", "contact center", "customer service"],
    "Voice API": ["software", "technology", "telecommunications", "call center",
                  "contact center", "unified communications"],
    "SMS": ["software", "technology", "marketing", "telecommunications",
            "fintech", "financial technology", "healthcare", "retail technology"],
    "SIP": ["telecommunications", "unified communications", "technology",
            "it services", "managed services", "voip"],
    "IoT SIM": ["iot", "logistics", "transportation", "manufacturing",
                "automotive", "energy", "utilities", "agriculture",
                "construction", "mining", "maritime", "aviation",
                "telematics", "supply chain", "fleet management"],
}

# Telecom override: companies that ARE telecom providers/infrastructure
# should score for Voice/SIP, not AI Agent
TELECOM_PROVIDER_SIGNALS = [
    "telecommunications provider", "telecom company", "wireless carrier",
    "mobile operator", "network operator", "isp", "internet service provider",
    "cell tower", "wireless infrastructure", "network infrastructure",
    "fiber optic", "broadband provider", "cable operator",
    "communications infrastructure", "tower company",
]

# WASTE industries — these should score LOW for all products unless
# the description has specific telecom/iot signals
WASTE_INDUSTRIES = [
    "e-commerce", "retail", "fashion", "food & beverage",
    "hospitality", "entertainment", "real estate", "construction",
    "restaurants", "gambling", "cosmetics", "apparel",
    "travel", "tourism", "leisure",
]


def get_db():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    return conn


def score_product_fit(account: dict) -> dict:
    """
    Score an account against all products. Returns {product: score} and best_fit.
    """
    desc = (account.get("clearbitDesc") or "").lower()
    tags_raw = account.get("clearbitTags") or ""
    industry = (account.get("industry") or "").lower()
    tech_raw = account.get("clearbitTech") or ""

    # Parse tags/tech from JSON if needed
    if isinstance(tags_raw, str):
        try:
            tags = [t.lower() for t in json.loads(tags_raw)]
        except (json.JSONDecodeError, TypeError):
            tags = [t.strip().lower() for t in tags_raw.split(",") if t.strip()]
    else:
        tags = [str(t).lower() for t in (tags_raw or [])]

    if isinstance(tech_raw, str):
        try:
            tech = [t.lower() for t in json.loads(tech_raw)]
        except (json.JSONDecodeError, TypeError):
            tech = [t.strip().lower() for t in tech_raw.split(",") if t.strip()]
    else:
        tech = [str(t).lower() for t in (tech_raw or [])]

    scores = {}

    for product, keyword_sets in PRODUCT_KEYWORDS.items():
        score = 0.0

        # 1. Core keywords (40% weight) — these are the strongest signals
        core_kw = keyword_sets["core"]
        secondary_kw = keyword_sets["secondary"]
        all_kw = core_kw + secondary_kw

        if desc:
            core_matches = sum(1 for k in core_kw if k in desc)
            secondary_matches = sum(1 for k in secondary_kw if k in desc)

            # Core matches count more
            if core_matches > 0:
                score += 0.4 * min(core_matches / 2.0, 1.0)
            if secondary_matches > 0:
                score += 0.15 * min(secondary_matches / 3.0, 1.0)

        # 2. Industry match (30% weight)
        product_industries = PRODUCT_INDUSTRIES.get(product, [])
        if industry:
            for ind in product_industries:
                if ind in industry:
                    score += 0.3
                    break

        # 3. Clearbit tags (15% weight)
        if tags:
            tag_text = " ".join(tags)
            tag_matches = sum(1 for k in all_kw if k in tag_text)
            if tag_matches > 0:
                score += 0.1 * min(tag_matches / 2.0, 1.0)

        # 4. Tech stack (15% weight)
        if tech:
            tech_text = " ".join(tech)
            tech_matches = sum(1 for k in all_kw if k in tech_text)
            if tech_matches > 0:
                score += 0.05 * min(tech_matches / 2.0, 1.0)

        # Waste industry penalty
        if industry and not desc:
            for w in WASTE_INDUSTRIES:
                if w in industry:
                    score *= 0.3  # Heavy penalty
                    break

        # Telecom provider override: if company IS a telecom provider,
        # they need infrastructure products (SIP/Voice), not AI Agent
        if desc and any(s in desc for s in TELECOM_PROVIDER_SIGNALS):
            if product in ("SIP", "Voice API"):
                score = max(score, 0.5)
            elif product == "AI Agent":
                score *= 0.3  # Telecom providers don't need AI Agent — they need infrastructure

        scores[product] = round(min(score, 1.0), 3)

    # Determine best fit
    if all(s == 0 for s in scores.values()):
        # No data at all — keep existing or default to null
        best_fit = None
        best_score = 0
    else:
        best_product = max(scores, key=scores.get)  # type: ignore
        best_score = scores[best_product]
        # Only assign if score > 0.15 (meaningful signal)
        best_fit = best_product if best_score > 0.15 else None

    return {
        "scores": scores,
        "best_fit": best_fit,
        "best_score": best_score,
    }


def main():
    parser = argparse.ArgumentParser(description="ABM Product Fit Scorer")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes only")
    parser.add_argument("--domain", type=str, help="Score a single domain")
    parser.add_argument("--min-confidence", type=float, default=0.15,
                       help="Minimum score to assign productFit (default: 0.15)")
    args = parser.parse_args()

    conn = get_db()
    cur = conn.cursor()

    if args.domain:
        # Score single domain
        cur.execute("""
            SELECT domain, company, industry, "clearbitDesc",
                   "clearbitTags"::text, "clearbitTech"::text,
                   "productFit", country
            FROM "ABMAccount" WHERE domain = %s
        """, (args.domain,))
        rows = cur.fetchall()
        if not rows:
            print(f"Domain {args.domain} not found in ABMAccount")
            return

        row = rows[0]
        account = {
            "domain": row[0],
            "company": row[1],
            "industry": row[2],
            "clearbitDesc": row[3],
            "clearbitTags": row[4],
            "clearbitTech": row[5],
            "productFit": row[6],
            "country": row[7],
        }

        result = score_product_fit(account)
        print(f"\n{'='*60}")
        print(f"Domain: {account['domain']}")
        print(f"Company: {account['company']}")
        print(f"Industry: {account['industry']}")
        print(f"Description: {(account['clearbitDesc'] or '')[:150]}")
        print(f"Current productFit: {account['productFit']}")
        print(f"\nScores:")
        for product, score in sorted(result['scores'].items(), key=lambda x: -x[1]):
            bar = '█' * int(score * 40)
            print(f"  {product:12s} {score:.3f} {bar}")
        print(f"\nBest fit: {result['best_fit']} (score: {result['best_score']:.3f})")
        print(f"{'='*60}\n")
        return

    # Score all accounts
    cur.execute("""
        SELECT domain, company, industry, "clearbitDesc",
               "clearbitTags"::text, "clearbitTech"::text,
               "productFit", country
        FROM "ABMAccount"
    """)
    rows = cur.fetchall()
    print(f"Scoring {len(rows)} accounts...")

    changes = defaultdict(int)
    changes_detail = []

    for row in rows:
        account = {
            "domain": row[0],
            "company": row[1],
            "industry": row[2],
            "clearbitDesc": row[3],
            "clearbitTags": row[4],
            "clearbitTech": row[5],
            "productFit": row[6],
            "country": row[7],
        }

        result = score_product_fit(account)
        new_fit = result["best_fit"]
        old_fit = account["productFit"]

        if new_fit != old_fit:
            changes[f"{old_fit} → {new_fit}"] += 1
            changes_detail.append({
                "domain": account["domain"],
                "company": account["company"],
                "old": old_fit,
                "new": new_fit,
                "scores": result["scores"],
                "best_score": result["best_score"],
            })

    print(f"\nTotal accounts: {len(rows)}")
    print(f"Changes needed: {len(changes_detail)}")
    print(f"\nChange breakdown:")
    for change_type, count in sorted(changes.items(), key=lambda x: -x[1]):
        print(f"  {change_type}: {count}")

    # Show top changes
    print(f"\nTop 20 changes by confidence:")
    changes_detail.sort(key=lambda x: -x["best_score"])
    for c in changes_detail[:20]:
        print(f"  {c['domain']:40s} {str(c['old'] or 'null'):10s} → {str(c['new'] or 'null'):10s} (score: {c['best_score']:.3f})")

    if args.dry_run:
        print(f"\n[DRY RUN] No changes applied.")
        return

    # Apply changes
    updated = 0
    for c in changes_detail:
        if c["new"] is None:
            # Clear productFit if no strong signal
            cur.execute("""
                UPDATE "ABMAccount" SET "productFit" = NULL, "updatedAt" = NOW()
                WHERE domain = %s
            """, (c["domain"],))
        else:
            cur.execute("""
                UPDATE "ABMAccount" SET "productFit" = %s, "updatedAt" = NOW()
                WHERE domain = %s
            """, (c["new"], c["domain"]))
        updated += 1

    print(f"\nUpdated {updated} accounts.")


if __name__ == "__main__":
    main()
