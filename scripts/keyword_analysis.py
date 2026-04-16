#!/usr/bin/env python3
"""Analyze keyword overlaps and misalignment across Google Ads campaigns.

Fetches LIVE keywords from Google Ads API on every run (no stale CSV).
"""

import csv, json, re, os
from collections import defaultdict


def fetch_live_keywords():
    """Fetch all keywords from active Google Ads search campaigns."""
    cred_path = os.path.expanduser("~/.config/google-ads/credentials.json")
    with open(cred_path) as f:
        creds = json.load(f)
    
    from google.ads.googleads.client import GoogleAdsClient
    client = GoogleAdsClient.load_from_dict({
        "developer_token": creds["developer_token"],
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "login_customer_id": str(creds.get("login_customer_id", "2893524941")),
        "use_proto_plus": True,
    })
    
    ga = client.get_service("GoogleAdsService")
    customer_id = "2356650573"
    
    query = """
        SELECT 
            campaign.name, 
            ad_group.name, 
            ad_group_criterion.keyword.text, 
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.status,
            campaign.id,
            ad_group.id
        FROM keyword_view
        WHERE campaign.status = 'ENABLED'
        AND ad_group_criterion.status != 'REMOVED'
        AND campaign.advertising_channel_type = 'SEARCH'
    """
    
    rows = []
    response = ga.search(customer_id=customer_id, query=query)
    
    MATCH_MAP = {0: "UNSPECIFIED", 1: "UNKNOWN", 2: "EXACT", 3: "PHRASE", 4: "BROAD"}
    STATUS_MAP = {0: "UNSPECIFIED", 1: "UNKNOWN", 2: "ENABLED", 3: "PAUSED", 4: "REMOVED"}
    
    for row in response:
        campaign_name = row.campaign.name
        ad_group_name = row.ad_group.name
        keyword_text = row.ad_group_criterion.keyword.text
        match_type_val = row.ad_group_criterion.keyword.match_type
        status_val = row.ad_group_criterion.status
        
        # Handle both proto-plus enum and int
        if isinstance(match_type_val, int):
            match_type = MATCH_MAP.get(match_type_val, str(match_type_val))
        else:
            match_type = match_type_val.name if hasattr(match_type_val, 'name') else str(match_type_val)
        
        if isinstance(status_val, int):
            status = STATUS_MAP.get(status_val, str(status_val))
        else:
            status = status_val.name if hasattr(status_val, 'name') else str(status_val)
        
        rows.append({
            "campaign": campaign_name,
            "ad_group": ad_group_name,
            "keyword": keyword_text,
            "match_type": match_type,
            "status": status,
        })
    
    # Deduplicate (keyword_view can have multiple date rows)
    seen = set()
    unique_rows = []
    for r in rows:
        key = (r["campaign"], r["ad_group"], r["keyword"], r["match_type"])
        if key not in seen:
            seen.add(key)
            unique_rows.append(r)
    
    return unique_rows


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


def main():
    # Fetch LIVE keywords from Google Ads API
    print("Fetching live keywords from Google Ads...")
    rows = fetch_live_keywords()
    print(f"Fetched {len(rows)} unique keywords\n")
    
    # Filter to ENABLED only for overlap analysis (PAUSED keywords don't compete)
    enabled_rows = [r for r in rows if r["status"] == "ENABLED"]
    print(f"Active (ENABLED) keywords: {len(enabled_rows)}\n")
    
    # ============ ANALYSIS ============
    
    # 1. Keyword Overlap by Region (ENABLED only)
    print("=" * 60)
    print("KEYWORD OVERLAP ANALYSIS (ENABLED keywords only)")
    print("=" * 60)
    
    # Group: (keyword_lower, region) -> [(campaign, match_type)]
    keyword_region_map = defaultdict(list)
    for r in enabled_rows:
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
    
    # 2. Keyword Misalignment (all keywords, including PAUSED for cleanup)
    print("\n" + "=" * 60)
    print("KEYWORD MISALIGNMENT ANALYSIS")
    print("=" * 60)
    
    misalignment_rows = []
    for r in rows:  # Check all keywords, not just ENABLED
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
                "status": r["status"],
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
    
    # ============ EXPORT JSON for agent consumption ============
    output = {
        "summary": {
            "total_keywords": len(rows),
            "enabled_keywords": len(enabled_rows),
            "overlap_issues": len(overlap_rows),
            "misalignment_issues": len(misalignment_rows),
        },
        "overlap_rows": overlap_rows,
        "misalignment_rows": misalignment_rows,
    }
    
    out_path = "/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/scripts/keyword_analysis.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    
    print(f"\nAnalysis exported to {out_path}")
    
    # Return for programmatic use
    return output


if __name__ == "__main__":
    main()
