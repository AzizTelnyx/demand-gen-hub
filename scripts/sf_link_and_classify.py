#!/usr/bin/env python3
"""Link Salesforce data to ABM accounts and re-classify null productFit accounts.

Does 3 things:
1. Links SFAccount → ABMAccount (sfAccountId, industry, revenue, switchSignal, currentProvider)
2. Marks accounts with active pipeline opps (inPipeline = true)
3. Re-scores null-productFit accounts using Clearbit + SF industry data
"""

import psycopg2
import re
import sys

DB_URL = "postgresql://azizalsinafi@localhost:5432/dghub"

# ─── Product Keywords (strict — same as abm_product_scorer.py) ──────────

PRODUCT_CORE = {
    "AI Agent": [
        "ai agent", "ai voice", "voice ai", "conversational ai", "llm", "chatbot",
        "voicebot", "virtual agent", "autonomous agent",
        "virtual assistant", "intelligent virtual assistant",
        "natural language", "voice recognition",
        "speech ai", "voice automation",
        "conversational platform", "ai-powered customer service",
        "ai calling", "ai dialer", "predictive dialer",
        "agent assist", "generative ai",
        "contact center ai", "call center ai",
    ],
    "Voice API": [
        "voice api", "voip", "sip", "pbx", "call routing", "ivr", "telephony",
        "voice platform", "voice gateway", "sip trunking",
        "cloud voice", "business voice", "voip service",
        "voice communication", "session border controller",
        "voice termination", "origination", "voice over ip",
    ],
    "SMS": [
        "sms api", "messaging api", "text messaging", "a2p", "sms gateway",
        "bulk sms", "sms platform", "programmable sms",
        "sms notification", "otp sms", "two-factor authentication",
        "sms marketing", "mms api", "communication api",
    ],
    "SIP": [
        "sip trunk", "sip trunking", "voip gateway", "pbx", "unified communications",
        "sip provider", "sip gateway", "sip connection",
        "cloud pbx", "hosted pbx", "uc platform",
        "voip provider", "sip termination", "business phone system",
        "telephony provider", "session border controller",
    ],
    "IoT SIM": [
        "iot sim", "iot connectivity", "cellular iot", "m2m", "esim",
        "iot platform", "iot device management", "industrial iot",
        "asset tracking", "fleet tracking", "telematics",
        "remote monitoring", "connected device", "cellular connectivity",
        "logistics", "supply chain", "fleet management",
        "emergency response", "field operations",
        "cold chain", "smart meter", "connected vehicle",
    ],
}

PRODUCT_SECONDARY = {
    "AI Agent": [
        "customer service", "help desk", "support automation",
        "dialogue system", "text-to-speech", "speech-to-text",
    ],
    "Voice API": [
        "call center", "contact center", "unified communications",
        "telecom", "communication platform",
    ],
    "SMS": [
        "notifications", "alerts", "verification",
        "transactional", "communication platform",
    ],
    "SIP": [
        "enterprise voice", "business communications",
        "voip", "telecom", "communication platform",
    ],
    "IoT SIM": [
        "logistics company", "developing nations", "oil and gas",
        "mining operations", "trucking",
        "warehousing", "shipping", "global logistics",
        "supply chain management", "last mile delivery",
    ],
}

# Waste industries — score penalty
WASTE_INDUSTRIES = [
    "e-commerce", "retail", "fashion", "apparel", "food", "beverage",
    "restaurant", "hospitality", "travel", "entertainment", "gaming",
    "gambling", "cosmetics", "jewelry", "luxury", "real estate",
    "construction", "automotive dealer", "insurance",
    "law firm", "legal services", "accounting",
]

# Industries that ARE relevant to specific products
RELEVANT_INDUSTRIES = {
    "AI Agent": ["software", "technology", "information", "telecommunications", "telemarketing", "call center", "computer"],
    "Voice API": ["telecommunications", "telemarketing", "call center", "technology", "information"],
    "SMS": ["technology", "software", "telecommunications", "information"],
    "SIP": ["telecommunications", "technology", "information"],
    "IoT SIM": ["logistics", "transportation", "manufacturing", "utilities", "energy", "mining", "oil", "automotive", "telecommunications"],
}

# Telecom provider signals — these companies need infra, not AI Agent
TELECOM_PROVIDER_SIGNALS = [
    "telecommunications provider", "telecom company",
    "wireless carrier", "network operator", "isp",
    "cell tower", "wireless infrastructure",
    "network infrastructure", "fiber optic",
    "broadband provider", "cable operator",
]


def normalize(text):
    if not text:
        return ""
    return re.sub(r'\s+', ' ', text.lower().strip())


def score_product(product, desc, industry, tags, tech_stack):
    """Score an account against a single product. Returns float 0-1."""
    desc_n = normalize(desc) if desc else ""
    industry_n = normalize(industry) if industry else ""
    tags_n = normalize(" ".join(tags)) if tags else ""
    tech_n = normalize(" ".join(tech_stack)) if tech_stack else ""

    score = 0.0

    # Core keywords (description) — 40%
    core = PRODUCT_CORE.get(product, [])
    core_hits = sum(1 for kw in core if kw in desc_n)
    if core_hits > 0:
        score += min(0.40, 0.20 * core_hits)

    # Secondary keywords (description) — 15%
    secondary = PRODUCT_SECONDARY.get(product, [])
    sec_hits = sum(1 for kw in secondary if kw in desc_n)
    if sec_hits > 0:
        score += min(0.15, 0.075 * sec_hits)

    # Industry — 30%
    rel_industries = RELEVANT_INDUSTRIES.get(product, [])
    if industry_n and any(ri in industry_n for ri in rel_industries):
        score += 0.30

    # Tags — 10%
    if tags_n and any(kw in tags_n for kw in core + secondary):
        score += 0.10

    # Tech stack — 5%
    if tech_n and any(kw in tech_n for kw in core):
        score += 0.05

    # Waste industry penalty
    if industry_n and any(w in industry_n for w in WASTE_INDUSTRIES):
        # Unless description has strong product signals
        if core_hits == 0:
            score *= 0.3

    # Telecom provider override
    if desc_n and any(t in desc_n for t in TELECOM_PROVIDER_SIGNALS):
        if product in ("SIP", "Voice API"):
            score = max(score, 0.5)
        elif product == "AI Agent":
            score *= 0.3

    return min(score, 1.0)


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # ─── 1. Link SF Accounts → ABM Accounts ──────────────────────────
    print("1. Linking Salesforce accounts to ABM accounts...")
    cur.execute("""
        UPDATE "ABMAccount" a
        SET "sfAccountId" = sf."sfId",
            industry = COALESCE(a.industry, sf.industry),
            "annualRevenue" = COALESCE(a."annualRevenue", sf."annualRevenue"::text),
            "employeeCount" = COALESCE(a."employeeCount", sf.employees),
            "currentProvider" = CASE
                WHEN sf.industry ILIKE '%%telecom%%' OR sf.industry ILIKE '%%communication%%'
                THEN 'Telecom/Comm'
                ELSE NULL
            END
        FROM "SFAccount" sf
        WHERE a.domain = sf."cleanDomain"
          AND sf."cleanDomain" IS NOT NULL
        RETURNING a.domain, sf."sfId"
    """)
    linked = cur.fetchall()
    print(f"   Linked {len(linked)} accounts")

    # ─── 2. Mark accounts with active pipeline opps ─────────────────
    print("2. Marking accounts with active pipeline opportunities...")
    cur.execute("""
        UPDATE "ABMAccount" a
        SET "inPipeline" = true
        FROM "SFOpportunity" o
        WHERE a.domain = o."accountDomain"
          AND o."stageName" NOT IN ('Closed Won', 'Lost Business', 'Cancelled/Terminated', 'Self Service')
          AND a."inPipeline" = false OR a."inPipeline" IS NULL
        RETURNING a.domain
    """)
    pipeline_accounts = cur.fetchall()
    print(f"   Marked {len(pipeline_accounts)} accounts as inPipeline")

    # Also mark switchSignal for accounts with relevant opp sources
    cur.execute("""
        UPDATE "ABMAccount" a
        SET "switchSignal" = o."oppSource"
        FROM "SFOpportunity" o
        WHERE a.domain = o."accountDomain"
          AND o."oppSource" IS NOT NULL
          AND a."switchSignal" IS NULL
    """)
    switch_count = cur.rowcount
    print(f"   Set switchSignal for {switch_count} accounts")

    # ─── 3. Re-score null-productFit accounts ───────────────────────
    print("3. Re-scoring null-productFit accounts...")

    cur.execute("""
        SELECT id, domain, "clearbitDesc", industry, "clearbitTags", "clearbitTech"
        FROM "ABMAccount"
        WHERE "productFit" IS NULL
        ORDER BY domain
    """)
    null_accounts = cur.fetchall()
    print(f"   Found {len(null_accounts)} null-productFit accounts")

    products = ["AI Agent", "Voice API", "SMS", "SIP", "IoT SIM"]
    changes = 0
    no_signal = 0

    for row in null_accounts:
        acct_id, domain, desc, industry, tags_raw, tech_raw = row

        # Parse tags and tech from stored format
        tags = []
        if tags_raw:
            if isinstance(tags_raw, list):
                tags = tags_raw
            elif isinstance(tags_raw, str):
                try:
                    import json
                    tags = json.loads(tags_raw)
                except:
                    tags = [t.strip() for t in tags_raw.strip('[]').split(',') if t.strip()]

        tech = []
        if tech_raw:
            if isinstance(tech_raw, list):
                tech = tech_raw
            elif isinstance(tech_raw, str):
                try:
                    import json
                    tech = json.loads(tech_raw)
                except:
                    tech = [t.strip() for t in tech_raw.strip('[]').split(',') if t.strip()]

        # Also check if SF account has industry we can use
        # (we already updated industry above from SF)

        # Score against all products
        best_product = None
        best_score = 0.0
        all_scores = {}

        for product in products:
            s = score_product(product, desc, industry, tags, tech)
            all_scores[product] = s
            if s > best_score:
                best_score = s
                best_product = product

        # Threshold: must be > 0.15 to assign
        if best_score > 0.15 and best_product:
            cur.execute("""
                UPDATE "ABMAccount"
                SET "productFit" = %s,
                    "notes" = COALESCE("notes", '') || %s
                WHERE id = %s
            """, (
                best_product,
                f' | Auto-scored: {best_product} ({best_score:.2f}) via sf-link-classify',
                acct_id,
            ))
            changes += 1
        else:
            no_signal += 1

    conn.commit()

    # Print summary
    print(f"\n   Results:")
    print(f"   - Assigned productFit: {changes}")
    print(f"   - No signal (remain null): {no_signal}")

    # Print new distribution
    cur.execute("""
        SELECT "productFit", count(*)
        FROM "ABMAccount"
        GROUP BY "productFit"
        ORDER BY count(*) DESC
    """)
    print("\n   New productFit distribution:")
    for row in cur.fetchall():
        pf = row[0] or "(null)"
        print(f"     {pf:15s} {row[1]:5d}")

    # Print pipeline stats
    cur.execute("""
        SELECT count(*) FROM "ABMAccount" WHERE "inPipeline" = true
    """)
    pipeline_total = cur.fetchone()[0]
    print(f"\n   Accounts in SF pipeline: {pipeline_total}")

    cur.execute("""
        SELECT count(*) FROM "ABMAccount" WHERE "sfAccountId" IS NOT NULL
    """)
    sf_linked = cur.fetchone()[0]
    print(f"   Accounts linked to SF: {sf_linked}")

    cur.close()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
