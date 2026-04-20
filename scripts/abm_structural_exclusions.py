#!/usr/bin/env python3
"""
ABM Structural Exclusion — Waste Industry Blocklist
====================================================
Excludes companies that are STRUCTURALLY never going to buy Telnyx products:
hospitals, government entities, agencies, consultancies, marketing/media,
legal, traditional banking/finance.

Approach: We use DESCRIPTION + INDUSTRY signals together to avoid false positives.
Clearbit industry tags are unreliable alone (e.g., Rasa = "E-commerce" but is an AI company).
We only exclude when BOTH industry AND description confirm the waste category.

Companies with active Salesforce pipeline are ALWAYS protected (never excluded).
"""

import os
import sys
import psycopg2

DB_URL = "postgresql://localhost:5432/dghub"

# ── Waste categories with industry + description signals ──────────
# Each category has: industry_patterns (Clearbit industry must match one) 
# AND desc_signals (description must contain at least one)
# If a company's industry matches AND description confirms → exclude
# If industry matches but description contradicts → keep (likely tech company mislabeled)

WASTE_CATEGORIES = {
    "hospital": {
        "reason": "Hospital / medical care provider",
        "industry_patterns": [
            "health care", "healthcare", "medical care", "medical center",
            "hospital", "ambulance", "dental care", "dentists", "optometrists",
            "psychiatric", "addiction treatment", "elderly", "home healthcare",
            "health practitioners", "special needs", "health & wellness",
            "health and wellness", "health",
        ],
        # These are ACTUAL care providers, not healthtech
        "desc_signals": [
            "hospital", "medical center", "clinic", "patient care",
            "health system", "healthcare system", "nursing", "physician",
            "surgical", "emergency department", "beds", "outpatient",
            "inpatient", "rehabilitation center", "care facility",
            "assisted living", "skilled nursing", "hospice",
        ],
        # If description has these, it's healthTECH, not a hospital → KEEP
        "desc_rescue": [
            "api", "platform", "software", "saas", "ai-powered",
            "cloud", "automation", "digital health", "telemedicine",
            "telehealth", "patient engagement", "ehr", "health tech",
            "fintech", "conversational ai", "voice ai", "messaging api",
            "communication platform",
        ],
    },
    "government": {
        "reason": "Government / public entity",
        "industry_patterns": [
            "government", "public admin", "public assistance",
            "social advocacy", "community housing",
        ],
        "desc_signals": [
            "municipal", "city of", "county", "department of",
            "public school", "school district", "federal", "state of",
            "government agency", "public health department",
            "town of", "village of", "borough of",
        ],
        "desc_rescue": [
            "api", "platform", "software", "saas", "cloud",
            "government technology", "govtech", "civic tech",
            "customer experience", "cxm", "solution",
        ],
    },
    "agency": {
        "reason": "Advertising / marketing / PR agency",
        "industry_patterns": [
            "advertising", "marketing", "marketing & advertising",
            "advertising management", "public relations", "digital marketing",
            "agency",
        ],
        "desc_signals": [
            "advertising agency", "marketing agency", "media agency",
            "creative agency", "pr agency", "public relations firm",
            "ad agency", "digital agency", "media buying",
            "brand agency", "full-service agency", "advertising firm",
            "performance marketing", "paid media",
        ],
        "desc_rescue": [
            "conversational ai", "messaging platform", "sms api",
            "voice api", "communication platform", "telecom",
            "saas platform", "cpaas",
        ],
    },
    "consulting": {
        "reason": "Management / strategy consulting",
        "industry_patterns": [
            "consulting", "consulting & professional services",
            "administrative consulting", "professional services",
            "business management and planning",
        ],
        "desc_signals": [
            "consulting firm", "management consulting", "strategy consulting",
            "advisory firm", "consulting services", "business consulting",
            "mbb", "big four", "consulting group",
        ],
        "desc_rescue": [
            "telecom consulting", "telecommunications consulting",
            "it consulting", "technology consulting", "api",
            "software", "saas", "cloud",
        ],
    },
    "media": {
        "reason": "Media / publishing / entertainment",
        "industry_patterns": [
            "publishing", "broadcasting", "sound recording",
            "performing arts", "entertainment & recreation",
            "video games", "printing",
        ],
        "desc_signals": [
            "newspaper", "magazine", "publisher", "broadcasting",
            "television", "radio station", "media company",
            "production company", "film", "studio",
        ],
        "desc_rescue": [
            "streaming platform", "content platform", "api",
            "saas", "cloud", "software",
        ],
    },
    "legal": {
        "reason": "Law firm / legal services",
        "industry_patterns": [
            "legal services",
        ],
        "desc_signals": [
            "law firm", "attorney", "legal services", "law office",
            "barrister", "solicitor", "litigation",
        ],
        "desc_rescue": [
            "legal tech", "legaltech", "legal software", "api",
            "saas", "ai-powered", "automation",
        ],
    },
    "banking": {
        "reason": "Traditional banking / insurance",
        "industry_patterns": [
            "banking", "banking & mortgages", "insurance", "credit",
            "credit intermediation", "lending services", "debt management",
            "sales financing", "financial vehicles",
        ],
        "desc_signals": [
            "bank", "credit union", "savings bank", "lending",
            "mortgage", "insurance company", "financial institution",
            "deposit", "branch network", "fdic",
        ],
        "desc_rescue": [
            "fintech", "neobank", "challenger bank", "digital bank",
            "api", "banking as a service", "baas", "embedded finance",
            "saas", "cloud", "open banking", "payment platform",
            "communication platform", "voice ai", "contact center",
            "comparison platform", "online comparison", "marketplace",
        ],
    },
    "finance_consulting": {
        "reason": "Financial advisory / investment consulting",
        "industry_patterns": [
            "financial transactions", "financial services", "financial investment",
            "financial contracts", "investment banking", "investing",
            "savings & investing", "capital markets", "asset management",
            "finance", "accounting", "tax services", "exchanges",
        ],
        "desc_signals": [
            "investment firm", "asset management", "wealth management",
            "hedge fund", "private equity", "venture capital",
            "portfolio management", "financial advisory", "brokerage",
            "trading firm", "fund manager",
        ],
        "desc_rescue": [
            "fintech", "trading platform", "api", "saas",
            "communication platform", "cloud", "software",
        ],
    },
    "real_estate": {
        "reason": "Real estate / property management",
        "industry_patterns": [
            "real estate", "home ownership", "residential",
            "property management", "home improvement", "construction",
        ],
        "desc_signals": [
            "real estate", "property management", "landlord",
            "apartment", "housing", "realty", "realtor",
            "construction company", "builder", "development company",
        ],
        "desc_rescue": [
            "property management software", "proptech", "real estate tech",
            "api", "saas", "cloud", "platform",
        ],
    },
    "hospitality_travel": {
        "reason": "Hospitality / travel / tourism",
        "industry_patterns": [
            "hotel accommodations", "hotels & resorts", "hotel management",
            "hospitality", "travel & tourism", "travel & leisure",
            "tours and sightseeing", "restaurants",
        ],
        "desc_signals": [
            "hotel", "resort", "restaurant", "travel agency",
            "tour operator", "cruise", "airline", "hospitality group",
        ],
        "desc_rescue": [
            "booking platform", "hospitality tech", "travel tech",
            "api", "saas", "cloud", "software",
        ],
    },
    "ecommerce_retail": {
        "reason": "E-commerce / retail (non-tech)",
        "industry_patterns": [
            "e-commerce", "retail", "luxury goods", "food",
        ],
        "desc_signals": [
            "online store", "e-commerce store", "retailer",
            "fashion brand", "clothing", "apparel",
            "grocery", "consumer goods", "d2c brand",
        ],
        "desc_rescue": [
            "e-commerce platform", "marketplace platform", "api",
            "saas", "communication platform", "sms", "voice ai",
            "messaging", "contact center", "customer engagement",
            "ai-powered", "automation",
        ],
    },
}


def get_pipeline_domains(cur):
    """Get domains with active pipeline — NEVER exclude these."""
    cur.execute("""
        SELECT DISTINCT domain FROM "ABMAccount" WHERE "inPipeline" = true
    """)
    return {row[0] for row in cur.fetchall()}


def classify_account(industry, description, tags):
    """Classify an account into a waste category, or None if it's legit."""
    if not industry:
        return None
    
    industry_lower = industry.lower()
    desc_lower = (description or "").lower()
    tags_lower = " ".join(tags or []).lower()
    combined = f"{desc_lower} {tags_lower}"
    
    for cat_name, cat in WASTE_CATEGORIES.items():
        # Check if industry matches
        industry_match = any(p in industry_lower for p in cat["industry_patterns"])
        if not industry_match:
            continue
        
        # Check if description confirms the waste category
        desc_confirm = any(s in combined for s in cat["desc_signals"])
        if not desc_confirm:
            continue
        
        # Check if description has rescue signals (it's actually a tech company)
        desc_rescue = any(s in combined for s in cat.get("desc_rescue", []))
        if desc_rescue:
            continue
        
        return cat_name, cat["reason"]
    
    return None


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    pipeline_domains = get_pipeline_domains(cur)
    print(f"🔒 Protecting {len(pipeline_domains)} pipeline domains")
    
    # Fetch all accounts with industry data
    cur.execute("""
        SELECT domain, industry, "clearbitDesc", "clearbitTags"
        FROM "ABMAccount"
        WHERE industry IS NOT NULL
    """)
    accounts = cur.fetchall()
    print(f"📊 Checking {len(accounts)} accounts with industry data")
    
    # Classify
    exclusions = []
    by_category = {}
    
    for domain, industry, desc, tags in accounts:
        # Never exclude pipeline accounts
        if domain in pipeline_domains:
            continue
        
        result = classify_account(industry, desc, tags)
        if result:
            cat_name, reason = result
            exclusions.append((domain, cat_name, reason))
            by_category.setdefault(cat_name, []).append(domain)
    
    # Print summary
    print(f"\n🗑️  Would exclude {len(exclusions)} accounts:")
    for cat, domains in sorted(by_category.items(), key=lambda x: -len(x[1])):
        print(f"  {cat}: {len(domains)} domains")
    
    # Check existing exclusions
    cur.execute("""SELECT domain, category FROM "ABMExclusion" WHERE category = '*'""")
    existing = {(row[0], row[1]) for row in cur.fetchall()}
    
    new_exclusions = [(d, c, r) for d, c, r in exclusions if (d, '*') not in existing]
    print(f"\n📝 New exclusions (not already in DB): {len(new_exclusions)}")
    
    if "--apply" in sys.argv:
        for domain, cat_name, reason in new_exclusions:
            cur.execute("""
                INSERT INTO "ABMExclusion" (id, domain, category, reason, notes)
                VALUES (gen_random_uuid(), %s, '*', %s, 'structural-exclusion')
                ON CONFLICT DO NOTHING
            """, (domain, f"{reason} [{cat_name}]"))
        conn.commit()
        print(f"✅ Inserted {len(new_exclusions)} structural exclusions")
    else:
        print("\nRun with --apply to insert into DB")
    
    # Show sample from each category
    print("\n📋 Samples per category:")
    for cat, domains in sorted(by_category.items(), key=lambda x: -len(x[1])):
        cur.execute("""
            SELECT domain, industry, LEFT("clearbitDesc", 80)
            FROM "ABMAccount" WHERE domain = ANY(%s) LIMIT 3
        """, (domains[:3],))
        for dom, ind, desc in cur.fetchall():
            print(f"  [{cat}] {dom} | {ind} | {(desc or '')[:60]}")
    
    conn.close()


if __name__ == "__main__":
    main()
