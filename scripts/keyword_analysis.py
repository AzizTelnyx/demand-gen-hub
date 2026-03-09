#!/usr/bin/env python3
"""Analyze keyword overlaps and misalignment across Google Ads campaigns."""

import csv, json, re
from collections import defaultdict

# Load keywords
rows = []
with open("/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/scripts/keyword_audit_output.csv") as f:
    for r in csv.DictReader(f):
        rows.append(r)

# --- Region extraction ---
def get_region(campaign):
    c = campaign.upper()
    for r in ["AMER", "EMEA", "APAC", "MENA"]:
        if r in c:
            return r
    if "GLOBAL" in c:
        return "GLOBAL"
    # Legacy campaigns
    if "EMEA" in campaign:
        return "EMEA"
    return "GLOBAL"  # default

# --- Campaign purpose extraction ---
def get_purpose(campaign):
    c = campaign.lower()
    # Competitor campaigns
    competitors = {
        "twilio": "competitor_twilio",
        "elevenlabs": "competitor_elevenlabs",
        "elevenlab": "competitor_elevenlabs",
        "vapi": "competitor_vapi",
        "livekit": "competitor_livekit",
    }
    for comp, purpose in competitors.items():
        if comp in c:
            return purpose
    
    # Product campaigns
    if "contact center" in c or "contact centre" in c:
        return "product_contact_center"
    if "sip" in c and "iot" not in c:
        return "product_sip"
    if "sms" in c:
        return "product_sms"
    if "voice api" in c:
        return "product_voice_api"
    if "ai agent" in c and "vapi" not in c and "elevenlabs" not in c and "livekit" not in c:
        return "product_ai_agent"
    if "tts" in c or "stt" in c:
        return "product_ai_agent"
    if "iot" in c or "sim" in c:
        return "product_iot"
    if "numbers" in c or "virtual" in c:
        return "product_numbers"
    if "voip" in c:
        return "product_voip"
    if "brand" in c or "clawdtalk" in c:
        return "brand"
    if "sms landing" in c:
        return "product_sms"
    return "unknown"

# Competitor keyword patterns
COMPETITOR_KEYWORDS = {
    "twilio": ["twilio", "twillio", "twilo"],
    "elevenlabs": ["elevenlabs", "eleven labs", "11labs", "11 labs"],
    "vapi": ["vapi", "vapi.ai"],
    "livekit": ["livekit", "live kit"],
}

GENERIC_VOICE_AI = [
    "voice ai", "ai voice", "voice agent", "ai agent", "voice bot",
    "conversational ai", "voice assistant", "ai phone", "ai calling",
    "voice automation", "ai receptionist", "virtual agent",
    "speech to text", "text to speech", "tts api", "stt api",
]

CONTACT_CENTER_KEYWORDS = [
    "contact center", "call center", "contact centre", "call centre",
    "ccaas", "ucaas", "ivr", "acd", "auto attendant",
]

SIP_KEYWORDS = ["sip trunk", "sip provider", "sip api", "sip call", "voip sip"]
SMS_KEYWORDS = ["sms api", "sms gateway", "text message api", "messaging api", "bulk sms"]

def is_competitor_keyword(keyword, competitor):
    kw = keyword.lower()
    for pattern in COMPETITOR_KEYWORDS.get(competitor, []):
        if pattern in kw:
            return True
    return False

def is_any_competitor_keyword(keyword):
    kw = keyword.lower()
    for comp, patterns in COMPETITOR_KEYWORDS.items():
        for p in patterns:
            if p in kw:
                return comp
    return None

def is_generic_voice_ai(keyword):
    kw = keyword.lower()
    for pattern in GENERIC_VOICE_AI:
        if pattern in kw:
            return True
    return False

def is_contact_center(keyword):
    kw = keyword.lower()
    return any(p in kw for p in CONTACT_CENTER_KEYWORDS)

def is_sip_keyword(keyword):
    kw = keyword.lower()
    return any(p in kw for p in SIP_KEYWORDS) or kw.startswith("sip ")

def is_sms_keyword(keyword):
    kw = keyword.lower()
    return any(p in kw for p in SMS_KEYWORDS)

# ============ ANALYSIS ============

# 1. Keyword Overlap by Region
print("=" * 60)
print("KEYWORD OVERLAP ANALYSIS")
print("=" * 60)

# Group: (keyword_lower, region) -> [(campaign, match_type)]
keyword_region_map = defaultdict(list)
for r in rows:
    region = get_region(r["campaign"])
    key = (r["keyword"].lower(), region)
    keyword_region_map[key].append({"campaign": r["campaign"], "match_type": r["match_type"], "ad_group": r["ad_group"]})

overlap_rows = []
for (kw, region), entries in keyword_region_map.items():
    campaigns = list(set(e["campaign"] for e in entries))
    if len(campaigns) > 1:
        match_types = list(set(e["match_type"] for e in entries))
        # Risk level
        if len(set(e["match_type"] for e in entries)) == 1 or "EXACT" in match_types:
            risk = "High"
        elif "BROAD" in match_types:
            risk = "Medium"
        else:
            risk = "Low"
        
        overlap_rows.append({
            "region": region,
            "keyword": kw,
            "match_types": ", ".join(sorted(set(e["match_type"] for e in entries))),
            "campaigns": campaigns,
            "risk": risk,
            "count": len(campaigns),
        })

overlap_rows.sort(key=lambda x: ({"High": 0, "Medium": 1, "Low": 2}[x["risk"]], -x["count"]))

print(f"\nTotal overlapping keywords: {len(overlap_rows)}")
for risk in ["High", "Medium", "Low"]:
    count = sum(1 for o in overlap_rows if o["risk"] == risk)
    print(f"  {risk}: {count}")

by_region = defaultdict(int)
for o in overlap_rows:
    by_region[o["region"]] += 1
print("\nOverlaps by region:")
for r, c in sorted(by_region.items()):
    print(f"  {r}: {c}")

# 2. Keyword Misalignment
print("\n" + "=" * 60)
print("KEYWORD MISALIGNMENT ANALYSIS")
print("=" * 60)

misalignment_rows = []
for r in rows:
    campaign = r["campaign"]
    keyword = r["keyword"]
    purpose = get_purpose(campaign)
    issues = []
    suggested = []
    
    # Competitor campaigns should only have competitor keywords
    if purpose.startswith("competitor_"):
        comp_name = purpose.split("_")[1]
        if not is_competitor_keyword(keyword, comp_name):
            # Check if it's generic voice AI
            if is_generic_voice_ai(keyword):
                issues.append(f"Generic Voice AI keyword in {comp_name.title()} competitor campaign")
                suggested.append(f"Move to AI Agent campaign or add as negative in {campaign}")
            elif is_any_competitor_keyword(keyword):
                wrong_comp = is_any_competitor_keyword(keyword)
                issues.append(f"Wrong competitor keyword ({wrong_comp}) in {comp_name.title()} campaign")
                suggested.append(f"Move to {wrong_comp.title()} competitor campaign")
            elif is_contact_center(keyword):
                issues.append(f"Contact center keyword in {comp_name.title()} competitor campaign")
                suggested.append("Move to Contact Center campaign")
            elif is_sip_keyword(keyword):
                issues.append(f"SIP keyword in {comp_name.title()} competitor campaign")
                suggested.append("Move to SIP campaign")
            else:
                # Could still be relevant if it's like "vapi alternative"
                kw_lower = keyword.lower()
                if "alternative" in kw_lower or "competitor" in kw_lower or "vs" in kw_lower or "compared" in kw_lower:
                    pass  # These are fine in competitor campaigns
                else:
                    issues.append(f"Non-competitor keyword in {comp_name.title()} competitor campaign")
                    suggested.append("Review: may need to move to product campaign or pause")
    
    # Product campaigns should have relevant product keywords
    elif purpose == "product_contact_center":
        comp = is_any_competitor_keyword(keyword)
        if comp:
            issues.append(f"Competitor keyword ({comp}) in Contact Center campaign")
            suggested.append(f"Move to {comp.title()} competitor campaign")
    
    elif purpose == "product_sip":
        comp = is_any_competitor_keyword(keyword)
        if comp:
            issues.append(f"Competitor keyword ({comp}) in SIP campaign")
            suggested.append(f"Move to {comp.title()} competitor campaign")
    
    elif purpose == "product_ai_agent":
        comp = is_any_competitor_keyword(keyword)
        if comp:
            issues.append(f"Competitor keyword ({comp}) in AI Agent campaign")
            suggested.append(f"Move to {comp.title()} competitor campaign")
    
    if issues:
        misalignment_rows.append({
            "campaign": campaign,
            "ad_group": r["ad_group"],
            "keyword": keyword,
            "match_type": r["match_type"],
            "issue": "; ".join(issues),
            "suggested_action": "; ".join(suggested),
        })

print(f"\nTotal misaligned keywords: {len(misalignment_rows)}")

# Count by campaign
misalign_by_campaign = defaultdict(int)
for m in misalignment_rows:
    misalign_by_campaign[m["campaign"]] += 1
print("\nTop offenders:")
for c, count in sorted(misalign_by_campaign.items(), key=lambda x: -x[1])[:10]:
    print(f"  {c}: {count} misaligned keywords")

# 3. Campaign Summary
print("\n" + "=" * 60)
print("CAMPAIGN KEYWORD SUMMARY")
print("=" * 60)

campaign_summary = []
for r in rows:
    c = r["campaign"]
    # Find or create
    found = None
    for s in campaign_summary:
        if s["campaign"] == c:
            found = s
            break
    if not found:
        found = {"campaign": c, "region": get_region(c), "total": 0, "BROAD": 0, "PHRASE": 0, "EXACT": 0, "issues": 0}
        campaign_summary.append(found)
    found["total"] += 1
    found[r["match_type"]] = found.get(r["match_type"], 0) + 1

for s in campaign_summary:
    s["issues"] = misalign_by_campaign.get(s["campaign"], 0)

# 4. Vapi Deep Dive
print("\n" + "=" * 60)
print("VAPI CAMPAIGN DEEP DIVE")
print("=" * 60)

vapi_rows = []
for r in rows:
    if "vapi" in r["campaign"].lower():
        kw = r["keyword"].lower()
        if is_competitor_keyword(kw, "vapi"):
            category = "Vapi-specific ✓"
            rec = "Keep"
        elif "alternative" in kw or "vs" in kw or "compared" in kw or "competitor" in kw or "replacement" in kw or "switch" in kw or "migrate" in kw:
            category = "Competitor intent ✓"
            rec = "Keep"
        elif is_generic_voice_ai(kw):
            category = "⚠️ Generic Voice AI"
            rec = "Move to AI Agent campaign; add as negative in Vapi campaigns"
        elif is_contact_center(kw):
            category = "❌ Contact Center"
            rec = "Move to Contact Center campaign"
        elif is_sip_keyword(kw):
            category = "❌ SIP"
            rec = "Move to SIP campaign"
        else:
            # Check if it mentions vapi at all
            if "vapi" in kw:
                category = "Vapi-specific ✓"
                rec = "Keep"
            else:
                category = "⚠️ Needs Review"
                rec = "Review relevance to Vapi competitor positioning"
        
        vapi_rows.append({
            "campaign": r["campaign"],
            "ad_group": r["ad_group"],
            "keyword": r["keyword"],
            "match_type": r["match_type"],
            "category": category,
            "recommendation": rec,
        })

# Stats
vapi_cats = defaultdict(int)
for v in vapi_rows:
    vapi_cats[v["category"]] += 1
print(f"\nTotal Vapi keywords: {len(vapi_rows)}")
for cat, count in sorted(vapi_cats.items()):
    print(f"  {cat}: {count}")

# Print the problematic ones
print("\nProblematic Vapi keywords:")
for v in vapi_rows:
    if "✓" not in v["category"]:
        print(f"  [{v['match_type']}] {v['keyword']} → {v['category']} | {v['recommendation']}")

# ============ EXPORT JSON for sheet creation ============
output = {
    "overlap_rows": overlap_rows,
    "misalignment_rows": misalignment_rows,
    "campaign_summary": campaign_summary,
    "vapi_rows": vapi_rows,
}

with open("/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/scripts/keyword_analysis.json", "w") as f:
    json.dump(output, f, indent=2, default=str)

print("\nAnalysis exported to keyword_analysis.json")
