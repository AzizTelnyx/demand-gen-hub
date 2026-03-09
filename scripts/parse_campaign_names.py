#!/usr/bin/env python3
"""
Campaign Name Parser

Parses campaign names following the naming standard:
    YYYYMM INTENT PRODUCT [VARIANT] ADTYPE REGION

Usable as a library (import parse_campaign_name) or CLI (dumps all parsed campaigns as JSON).
"""

import json
import os
import re
import sys
import uuid

# ─── Constants ────────────────────────────────────────

INTENTS = [
    "TOFU", "MOFU", "BOFU", "CONQUEST", "UPSELL",
    "COMMERCIAL", "BRAND", "PARTNER", "PARTNERSHIP", "EVENT", "EVENTS",
    "ABM",  # treat as MOFU variant
]

# Canonical products — order matters (longest first to avoid partial matches)
PRODUCTS = [
    "AI Agent", "Voice API", "Voice AI", "IoT SIM", "IOT SIM",
    "SIP", "SMS", "Numbers", "RCS",
]

# Known competitors → product mapping
COMPETITOR_PRODUCT = {
    "ElevenLabs": "AI Agent", "Elevenlabs": "AI Agent", "11labs": "AI Agent",
    "Vapi": "AI Agent", "Retell": "AI Agent", "LiveKit": "AI Agent", "Bland": "AI Agent",
    "Twilio": "Voice API", "Bandwidth": "Voice API",
    "Sabre": "AI Agent",
}

# Known use-case / vertical variants
KNOWN_VARIANTS = [
    "Contact Center", "Healthcare", "Fintech", "Travel", "Insurance", "Banking",
    "BPO", "TTS", "STT", "TTS API", "STT API",
    "Social Boost", "Meme", "Halloween",
    "Accelerator",
]

# Sub-brand variants (not products — treated as variant when found)
SUB_BRANDS = ["ClawdTalk", "Clawdtalk", "CLAWDTALK"]

# Ad type codes
AD_TYPES = ["RLSA", "SPA", "GIF", "SA", "DA", "VA", "NA", "SI", "RT"]

# Region codes (longest first)
REGIONS = [
    "APAC-AU", "APAC-SEA", "APAC-NZ", "EMEA-UK",
    "GLOBAL", "AMER", "EMEA", "APAC", "MENA",
]

# LinkedIn-specific ad type mapping
LI_AD_TYPE_MAP = {
    "Engagement": "SI", "Website Visits": "SI", "Website visits": "SI",
    "Video Campaign": "VA", "Video": "VA",
    "Display": "DA", "Native": "NA",
}

# ─── Normalizers ──────────────────────────────────────

def _normalize_intent(raw: str) -> str:
    raw = raw.upper().strip()
    if raw == "PARTNERSHIP":
        return "PARTNER"
    if raw == "EVENTS":
        return "EVENT"
    if raw == "ABM":
        return "MOFU"  # ABM is mid-funnel
    return raw

def _normalize_product(raw: str) -> str:
    r = raw.strip()
    if r.upper() in ("IOT SIM", "IOT"):
        return "IoT SIM"
    if r.lower() in ("voice ai",):
        return "AI Agent"  # Voice AI = AI Agent product
    return r

def _normalize_region(raw: str) -> str:
    return raw.upper().strip()


# ─── Main Parser ──────────────────────────────────────

def parse_campaign_name(name: str) -> dict:
    """
    Parse a campaign name and extract structured fields.
    Returns dict with: date, intent, product, variant, adType, region, confidence, raw.
    """
    result = {
        "date": None, "intent": None, "product": None, "variant": None,
        "adType": None, "region": None, "confidence": "low", "raw": name,
    }

    if not name or not name.strip():
        return result

    original = name.strip()
    remaining = original

    # ── Step 1: Extract date (YYYYMM at start) ──
    m = re.match(r'^(\d{6})\s*[-]?\s*', remaining)
    if m:
        result["date"] = m.group(1)
        remaining = remaining[m.end():].strip()

    # ── Step 2: Extract region (from the end) ──
    remaining_upper = remaining.upper().rstrip()
    for reg in REGIONS:
        if remaining_upper.endswith(reg):
            result["region"] = reg
            remaining = remaining[:len(remaining) - len(reg)].rstrip()
            # Remove trailing "Global" case variants
            break
        # Also check with common suffixes stripped
        for suffix in [" WV", " V2"]:
            if remaining_upper.endswith(reg + suffix):
                result["region"] = reg
                remaining = remaining[:len(remaining) - len(reg + suffix)].rstrip()
                break
        if result["region"]:
            break

    # ── Step 3: Extract ad type (from end, after region removed) ──
    remaining_upper = remaining.upper().rstrip()
    for at in AD_TYPES:
        if remaining_upper.endswith(" " + at):
            result["adType"] = at
            remaining = remaining[:len(remaining) - len(at)].rstrip()
            break
        # Check for ad type patterns like "SA" standalone
        if remaining_upper.split()[-1:] == [at] if remaining_upper.split() else False:
            result["adType"] = at
            remaining = remaining[:remaining.upper().rfind(at)].rstrip()
            break

    # ── Step 4: Extract intent ──
    words = remaining.split()
    if words:
        first_upper = words[0].upper()
        if first_upper in [i.upper() for i in INTENTS]:
            result["intent"] = _normalize_intent(words[0])
            remaining = " ".join(words[1:]).strip()
        # Check for "LI tofu" or "LI mofu" patterns (LinkedIn campaigns)
        elif len(words) > 1 and words[0].upper() == "LI" and words[1].upper() in [i.upper() for i in INTENTS]:
            result["intent"] = _normalize_intent(words[1])
            # LI prefix means LinkedIn → SI ad type if not already set
            if not result["adType"]:
                result["adType"] = "SI"
            remaining = " ".join(words[2:]).strip()

    # ── Step 5: Extract product ──
    remaining_lower = remaining.lower()
    found_product = None
    product_pos = len(remaining)

    for prod in PRODUCTS:
        idx = remaining_lower.find(prod.lower())
        if idx != -1 and idx < product_pos:
            found_product = prod
            product_pos = idx

    if found_product:
        result["product"] = _normalize_product(found_product)
        # Remove product from remaining
        before = remaining[:product_pos].strip()
        after = remaining[product_pos + len(found_product):].strip()
        remaining = (before + " " + after).strip()
    else:
        # Try to infer product from competitor names in the text
        for comp, prod in COMPETITOR_PRODUCT.items():
            if comp.lower() in remaining.lower():
                result["product"] = prod
                break

    # ── Step 6: Extract variant (competitor, use case, etc.) ──
    # Check for known competitors
    for comp in COMPETITOR_PRODUCT:
        pattern = re.compile(re.escape(comp), re.IGNORECASE)
        if pattern.search(remaining):
            existing_variant = result["variant"]
            comp_match = pattern.search(remaining)
            comp_name = comp_match.group(0)
            remaining = (remaining[:comp_match.start()] + remaining[comp_match.end():]).strip()
            if existing_variant:
                result["variant"] = existing_variant + "+" + comp_name
            else:
                result["variant"] = comp_name
            # If intent not set and it's a competitor, it might be CONQUEST
            if not result["intent"] and comp in COMPETITOR_PRODUCT:
                result["intent"] = "CONQUEST"

    # Check for known use-case variants
    for var in sorted(KNOWN_VARIANTS, key=len, reverse=True):
        if var.lower() in remaining.lower():
            idx = remaining.lower().find(var.lower())
            matched = remaining[idx:idx + len(var)]
            remaining = (remaining[:idx] + remaining[idx + len(var):]).strip()
            if result["variant"]:
                result["variant"] = result["variant"] + " " + matched
            else:
                result["variant"] = matched
            # Contact Center, Healthcare etc. imply AI Agent
            if not result["product"] and var in ("Contact Center", "Healthcare", "Fintech", "Travel", "Insurance", "Banking", "BPO", "TTS", "STT"):
                result["product"] = "AI Agent"

    # Check for sub-brand variants (e.g., ClawdTalk)
    for sb in SUB_BRANDS:
        if sb.lower() in remaining.lower():
            idx = remaining.lower().find(sb.lower())
            matched = remaining[idx:idx + len(sb)]
            remaining = (remaining[:idx] + remaining[idx + len(sb):]).strip()
            result["variant"] = "ClawdTalk"  # normalize
            break

    # For PARTNER campaigns: "Brand" alone (no product) is a variant, not a product
    if result["intent"] == "PARTNER" and not result["product"]:
        brand_match = re.search(r'\bBrand\b', remaining, re.IGNORECASE)
        if brand_match:
            remaining = (remaining[:brand_match.start()] + remaining[brand_match.end():]).strip()
            if not result["variant"]:
                result["variant"] = "Brand"

    # Check for combined competitor variants like "Vapi+ElevenLabs"
    combo = re.search(r'(\w+)\+(\w+)', remaining)
    if combo and not result["variant"]:
        result["variant"] = combo.group(0)
        remaining = remaining[:combo.start()] + remaining[combo.end():]

    # ── Step 7: Clean up remaining text for additional clues ──
    remaining = re.sub(r'\s+', ' ', remaining).strip()
    # Remove noise words
    remaining = re.sub(r'\b(for|and|with|the|new|from|HS|WV|v2|v3|\*NEW\*|#\d+)\b', '', remaining, flags=re.IGNORECASE).strip()
    remaining = re.sub(r'[-–—]+', ' ', remaining).strip()
    remaining = re.sub(r'\s+', ' ', remaining).strip()

    # If region still not found, check remaining
    if not result["region"]:
        for reg in REGIONS:
            if reg.upper() in remaining.upper().split():
                result["region"] = reg
                remaining = re.sub(re.escape(reg), '', remaining, flags=re.IGNORECASE).strip()
                break

    # If ad type still not found, check remaining for LI-style types
    if not result["adType"]:
        for li_type, code in LI_AD_TYPE_MAP.items():
            if li_type.lower() in remaining.lower():
                result["adType"] = code
                break

    # ── Step 8: Calculate confidence ──
    # BRAND and PARTNER intents don't require a product
    product_optional = result["intent"] in ("BRAND", "PARTNER")
    if product_optional:
        fields_found = sum(1 for k in ["date", "intent", "adType", "region"]
                           if result[k] is not None)
        if fields_found >= 3:
            result["confidence"] = "high"
        elif fields_found >= 2:
            result["confidence"] = "medium"
        else:
            result["confidence"] = "low"
    else:
        fields_found = sum(1 for k in ["date", "intent", "product", "adType", "region"]
                           if result[k] is not None)
        if fields_found >= 4:
            result["confidence"] = "high"
        elif fields_found >= 2:
            result["confidence"] = "medium"
        else:
            result["confidence"] = "low"

    return result


# ─── DB Integration ───────────────────────────────────

def parse_all_campaigns_from_db():
    """Parse all campaign names from the database and return results."""
    VENV_SITE = os.path.expanduser("~/.venv/lib")
    for d in os.listdir(VENV_SITE):
        sp = os.path.join(VENV_SITE, d, "site-packages")
        if os.path.isdir(sp) and sp not in sys.path:
            sys.path.insert(0, sp)

    import psycopg2
    conn = psycopg2.connect("postgresql://azizalsinafi@localhost:5432/dghub")
    cur = conn.cursor()
    cur.execute('SELECT id, name FROM "Campaign"')
    rows = cur.fetchall()
    conn.close()

    results = []
    for row_id, name in rows:
        parsed = parse_campaign_name(name)
        parsed["id"] = row_id
        results.append(parsed)
    return results


def populate_parsed_fields():
    """Parse all campaigns and write parsed fields back to the DB."""
    VENV_SITE = os.path.expanduser("~/.venv/lib")
    for d in os.listdir(VENV_SITE):
        sp = os.path.join(VENV_SITE, d, "site-packages")
        if os.path.isdir(sp) and sp not in sys.path:
            sys.path.insert(0, sp)

    import psycopg2
    conn = psycopg2.connect("postgresql://azizalsinafi@localhost:5432/dghub")
    cur = conn.cursor()
    cur.execute('SELECT id, name FROM "Campaign"')
    rows = cur.fetchall()

    updated = 0
    for row_id, name in rows:
        parsed = parse_campaign_name(name)
        cur.execute('''
            UPDATE "Campaign" SET
                "parsedDate" = %s, "parsedIntent" = %s, "parsedProduct" = %s,
                "parsedVariant" = %s, "parsedAdType" = %s, "parsedRegion" = %s,
                "parseConfidence" = %s
            WHERE id = %s
        ''', (
            parsed["date"], parsed["intent"], parsed["product"],
            parsed["variant"], parsed["adType"], parsed["region"],
            parsed["confidence"], row_id,
        ))
        updated += 1

    conn.commit()
    conn.close()
    return updated


# ─── CLI ──────────────────────────────────────────────

if __name__ == "__main__":
    if "--populate" in sys.argv:
        count = populate_parsed_fields()
        print(f"Updated {count} campaigns with parsed fields")
    else:
        results = parse_all_campaigns_from_db()
        # Summary stats
        confidence_counts = {"high": 0, "medium": 0, "low": 0}
        for r in results:
            confidence_counts[r["confidence"]] = confidence_counts.get(r["confidence"], 0) + 1

        output = {
            "total": len(results),
            "confidence": confidence_counts,
            "campaigns": results,
        }
        print(json.dumps(output, indent=2))
