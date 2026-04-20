#!/usr/bin/env python3
"""
ABM Structural Exclusion v2 — Tag-Based Classification
========================================================
Uses Clearbit TAGS as primary signal (multi-label, curated categories).
Tags are far more reliable than the single `industry` field because:

1. Multi-label: a hospital gets "Medical Care" + "Surgical Hospitals" (clear waste)
   while a healthtech gets "Health Care" + "Technology" + "SAAS" (not waste)
2. Curated: Clearbit tags are structured categories, not free text
3. Complete: 100% of accounts have tags (industry is only 94%)

Algorithm:
  1. MUST have a waste tag (e.g., "Health Care", "Banking", "Legal Services")
  2. Must NOT have a rescue tag (e.g., "Technology", "SAAS", "Cloud Solutions")
  3. Pipeline accounts are always protected
  4. Description provides secondary confirmation for edge cases
"""

import os
import sys
import json
import psycopg2

DB_URL = "postgresql://localhost:5432/dghub"

# ── Waste tags (Clearbit category tags that indicate non-buyer) ───
# These are Clearbit's own curated category tags
WASTE_TAGS = {
    # Healthcare providers (NOT healthtech)
    "Medical Care", "Health Care", "Medical Centers", "Surgical Hospitals",
    "Community Health", "Hospital", "Hospice", "Nursing Homes",
    "Dental Care", "Mental Health", "Addiction Treatment", "Rehabilitation",
    "Healthcare", "Home Healthcare", "Elderly Care", "Assisted Living",
    "Medical Devices",  # actual device makers, not IoT
    "Pharmaceuticals", "Biotechnology",  # pharma ≠ telecom buyer
    
    # Government
    "Government", "Public Administration", "Civic/Government",
    
    # Agencies
    "Advertising", "Marketing & Advertising", "Advertising Management",
    "Digital Marketing", "Public Relations", "Creative Agency",
    
    # Consulting
    "Management Consulting", "Business Consulting",
    
    # Media / Entertainment
    "Publishing", "Broadcasting", "Sound Recording", "Performing Arts",
    "Entertainment & Recreation", "Video Games", "Printing",
    "Motion Pictures", "Music", "Television",
    
    # Legal
    "Legal Services", "Legal Assistance", "Law Firm",
    
    # Traditional banking / insurance
    "Banking", "Banking & Mortgages", "Credit Union",
    "Credit Intermediation", "Lending", "Debt Management",
    "Sales Financing", "Financial Vehicles",
    
    # Real estate / construction
    "Real Estate", "Home Ownership", "Residential", "Property Management",
    "Home Improvement", "Construction",
    
    # Hospitality / travel / airlines
    "Hotel Accommodations", "Hotels & Resorts", "Hotel Management",
    "Hospitality", "Travel & Tourism", "Travel & Leisure",
    "Restaurants", "Food & Beverage",
    "Airlines", "Airport Services", "Aviation",
    "Tours and Sightseeing",
    
    # Retail / e-commerce (actual retailers, not platforms)
    "Retail", "Retail Store", "Luxury Goods", "Apparel & Footwear",
    "Consumer Electronics", "Home & Furniture", "Jewelry, Watches & Luxury Goods",
    "Cosmetics", "Fashion", "Clothing", "General Merchandise",
    "Grocery", "Consumer Goods", "Consumer Staples",
    
    # Other non-buyer
    "Gambling", "Religion", "Athletics", "Fitness",
}

# ── Rescue tags (if ANY of these are present, it's a tech company, not waste) ──
# A company tagged "Health Care" + "Technology" + "SAAS" is healthtech, not a hospital
RESCUE_TAGS = {
    "Technology", "SAAS", "Cloud Solutions", "Software",
    "Information Technology & Services", "IT Management",
    "Computer Programming", "Cybersecurity", "Data & Analytics",
    "Telecommunications", "VOIP", "ISP",
    "Networking", "Mobile", "Cloud Computing",
    "Artificial Intelligence", "Machine Learning",
    "Integration Services", "Hosting Services",
    "Technology Consulting",  # tech consulting ≠ management consulting
    "Fintech",  # explicitly fintech
    "Marketplace",  # platform, not retailer
    "Crisis Management",  # often emergency comms tech
}

# ── Description rescue phrases (for borderline cases) ──────────
DESC_RESCUE = [
    "api", "platform", "software-as-a-service", "saas", "cloud-based",
    "ai-powered", "automation", "conversational ai", "voice ai",
    "messaging platform", "contact center", "communication platform",
    "telecom", "telecommunications", "cpaas", "voip", "sip",
    "comparison platform", "online comparison", "marketplace platform",
    "banking as a service", "baas", "embedded finance", "open banking",
    "payment platform", "neobank", "digital bank", "challenger bank",
    "proptech", "legaltech", "govtech", "healthtech", "edtech",
    "patient engagement", "patient communication", "ehr",
    "developer platform", "sdk", "webhook",
]


def get_pipeline_domains(cur):
    """Get domains with active pipeline — NEVER exclude these."""
    cur.execute("""
        SELECT DISTINCT domain FROM "ABMAccount" WHERE "inPipeline" = true
    """)
    return {row[0] for row in cur.fetchall()}


def classify_account(tags, desc):
    """
    Classify an account using tag-based logic.
    Returns (category, reason) or None.
    """
    if not tags:
        return None
    
    # Check for waste tags
    waste_matches = tags & WASTE_TAGS
    if not waste_matches:
        return None
    
    # Check for rescue tags
    rescue_matches = tags & RESCUE_TAGS
    if rescue_matches:
        return None  # It's a tech company in a waste-tagged vertical
    
    # Check description for rescue signals
    if desc:
        desc_lower = desc.lower()
        if any(s in desc_lower for s in DESC_RESCUE):
            return None  # Description confirms it's tech
    
    # Determine category from waste tags
    waste_list = sorted(waste_matches)
    
    # Map to human-readable category
    if waste_matches & {"Medical Care", "Health Care", "Medical Centers", "Surgical Hospitals",
                         "Community Health", "Hospital", "Healthcare", "Home Healthcare",
                         "Dental Care", "Mental Health", "Addiction Treatment", "Rehabilitation",
                         "Nursing Homes", "Hospice", "Elderly Care", "Assisted Living"}:
        category = "hospital"
        reason = "Healthcare provider (not healthtech)"
    elif waste_matches & {"Government", "Public Administration", "Civic/Government"}:
        category = "government"
        reason = "Government / public entity"
    elif waste_matches & {"Advertising", "Marketing & Advertising", "Advertising Management",
                          "Digital Marketing", "Public Relations", "Creative Agency"}:
        category = "agency"
        reason = "Advertising / marketing agency"
    elif waste_matches & {"Management Consulting", "Business Consulting"}:
        category = "consulting"
        reason = "Management / business consulting"
    elif waste_matches & {"Publishing", "Broadcasting", "Sound Recording", "Performing Arts",
                          "Entertainment & Recreation", "Video Games", "Printing",
                          "Motion Pictures", "Music", "Television"}:
        category = "media"
        reason = "Media / entertainment"
    elif waste_matches & {"Legal Services", "Legal Assistance", "Law Firm"}:
        category = "legal"
        reason = "Law firm / legal services"
    elif waste_matches & {"Banking", "Banking & Mortgages", "Insurance", "Credit Union",
                          "Credit Intermediation", "Lending", "Debt Management",
                          "Sales Financing", "Financial Vehicles"}:
        category = "banking"
        reason = "Traditional banking / insurance"
    elif waste_matches & {"Real Estate", "Home Ownership", "Residential", "Property Management",
                          "Home Improvement", "Construction"}:
        category = "real_estate"
        reason = "Real estate / property"
    elif waste_matches & {"Hotel Accommodations", "Hotels & Resorts", "Hotel Management",
                          "Hospitality", "Travel & Tourism", "Travel & Leisure",
                          "Restaurants", "Food & Beverage",
                          "Airlines", "Airport Services", "Aviation",
                          "Tours and Sightseeing"}:
        category = "hospitality_travel"
        reason = "Hospitality / travel"
    elif waste_matches & {"Retail", "Retail Store", "Luxury Goods", "Apparel & Footwear",
                          "Consumer Electronics", "Home & Furniture", "Cosmetics", "Fashion",
                          "Clothing", "General Merchandise", "Grocery", "Consumer Goods",
                          "Consumer Staples", "Jewelry, Watches & Luxury Goods"}:
        category = "ecommerce_retail"
        reason = "Retailer / e-commerce store"
    elif waste_matches & {"Pharmaceuticals", "Biotechnology", "Medical Devices"}:
        category = "pharma"
        reason = "Pharma / biotech / medical devices"
    elif waste_matches & {"Gambling", "Religion", "Athletics", "Fitness"}:
        category = "other_waste"
        reason = "Non-buyer vertical"
    else:
        category = "other_waste"
        reason = f"Non-buyer: {', '.join(waste_list[:3])}"
    
    return category, reason


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    pipeline_domains = get_pipeline_domains(cur)
    print(f"🔒 Protecting {len(pipeline_domains)} pipeline domains")
    
    # Fetch all accounts with tags
    cur.execute("""
        SELECT domain, industry, "clearbitTags", "clearbitDesc"
        FROM "ABMAccount"
    """)
    accounts = cur.fetchall()
    print(f"📊 Checking {len(accounts)} accounts")
    
    # Classify
    exclusions = []
    by_category = {}
    
    for domain, industry, tags_raw, desc in accounts:
        # Never exclude pipeline
        if domain in pipeline_domains:
            continue
        
        # Parse tags
        if isinstance(tags_raw, list):
            tags = set(tags_raw)
        elif isinstance(tags_raw, str):
            try:
                tags = set(json.loads(tags_raw))
            except json.JSONDecodeError:
                tags = set()
        else:
            tags = set()
        
        result = classify_account(tags, desc)
        if result:
            cat_name, reason = result
            exclusions.append((domain, cat_name, reason))
            by_category.setdefault(cat_name, []).append(domain)
    
    # Print summary
    print(f"\n🗑️  Would exclude {len(exclusions)} accounts:")
    for cat, domains in sorted(by_category.items(), key=lambda x: -len(x[1])):
        print(f"  {cat}: {len(domains)} domains")
    
    # Compare with v1 (industry-based) results
    cur.execute("""
        SELECT domain FROM "ABMExclusion" 
        WHERE category = '*' AND notes = 'structural-exclusion'
    """)
    v1_excluded = {row[0] for row in cur.fetchall()}
    v2_excluded = {d for d, c, r in exclusions}
    
    new_in_v2 = v2_excluded - v1_excluded
    removed_from_v2 = v1_excluded - v2_excluded
    
    print(f"\n📋 v1 (industry-based) excluded: {len(v1_excluded)}")
    print(f"📋 v2 (tag-based) excludes: {len(v2_excluded)}")
    print(f"🆕 New in v2 (missed by v1): {len(new_in_v2)}")
    print(f"✅ Rescued by v2 (false positives in v1): {len(removed_from_v2)}")
    
    if removed_from_v2:
        print(f"\n🔍 Rescued domains (v1 excluded, v2 keeps):")
        for d in sorted(removed_from_v2)[:20]:
            cur.execute("""
                SELECT industry, "clearbitTags"::text FROM "ABMAccount" WHERE domain = %s
            """, (d,))
            row = cur.fetchone()
            if row:
                print(f"  {d} | {row[0]} | {row[1][:100]}")
    
    if new_in_v2:
        print(f"\n🆕 New exclusions (v1 missed):")
        for d in sorted(new_in_v2)[:20]:
            cur.execute("""
                SELECT industry, "clearbitTags"::text FROM "ABMAccount" WHERE domain = %s
            """, (d,))
            row = cur.fetchone()
            if row:
                print(f"  {d} | {row[0]} | {row[1][:100]}")
    
    if "--apply" in sys.argv:
        # Remove v1 exclusions first
        cur.execute("""
            DELETE FROM "ABMExclusion" WHERE category = '*' AND notes = 'structural-exclusion'
        """)
        print(f"\n🗑️  Removed {cur.rowcount} v1 structural exclusions")
        
        # Insert v2 exclusions
        for domain, cat_name, reason in exclusions:
            cur.execute("""
                INSERT INTO "ABMExclusion" (id, domain, category, reason, notes)
                VALUES (gen_random_uuid(), %s, '*', %s, 'structural-exclusion-v2')
                ON CONFLICT DO NOTHING
            """, (domain, f"{reason} [{cat_name}]"))
        conn.commit()
        print(f"✅ Inserted {len(exclusions)} v2 structural exclusions")
    else:
        print("\nRun with --apply to replace v1 with v2")
    
    # Show samples
    print("\n📋 Samples per category:")
    for cat, domains in sorted(by_category.items(), key=lambda x: -len(x[1])):
        cur.execute("""
            SELECT domain, industry, LEFT("clearbitDesc", 80)
            FROM "ABMAccount" WHERE domain = ANY(%s) LIMIT 3
        """, (domains[:3],))
        for dom, ind, d in cur.fetchall():
            print(f"  [{cat}] {dom} | {ind} | {(d or '')[:60]}")
    
    conn.close()


if __name__ == "__main__":
    main()
