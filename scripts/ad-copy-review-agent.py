#!/usr/bin/env python3
"""
Ad Copy Review Agent (v2)
=========================
Daily audit of active ad creatives against brand pillars, copy rules,
and platform character limits.

v2 fixes:
- Ad type awareness (RSA vs Responsive Display vs LinkedIn vs StackAdapt)
- RSA: headline=30, description=90
- Responsive Display: headline=30, long_headline=90, description=90
- Dynamic keyword insertion {KEYWORD:default} and {LOCATION(Country)} excluded from length
- "leading" and intentional positioning words NOT flagged as filler
- Duplicate headlines within same campaign are INTENTIONAL (RSA strategy)
- Only flag duplicates across DIFFERENT campaigns
- AI analysis includes ad type context

Run: python scripts/ad-copy-review-agent.py [--dry-run] [--rules-only]
Cron: daily at 3 AM PST via OpenClaw gateway
"""

import json, os, sys, re, argparse, urllib.request
from datetime import datetime, timezone
from collections import defaultdict

# ─── Config ───────────────────────────────────────────

DB_URL = "postgresql://localhost:5432/dghub"
BOT_TOKEN = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
CHAT_ID = "-1003786506284"
AGENT_ACTIVITY_THREAD = 164

OPENCLAW_BASE = "http://127.0.0.1:18789/v1/chat/completions"
OPENCLAW_TOKEN = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "")

# Ad type → char limits
# Google Ads RSA: headline 30, description 90
# Google Ads Responsive Display: headline 30, long_headline 90, description 90
# Google Ads ETA (legacy): headline1 30, headline2 30, description 90
# LinkedIn Sponsored Content: headline 150 (rec 70), intro 600
# StackAdapt Native: headline 55, body 120
AD_TYPE_LIMITS = {
    # Google Ads
    "RESPONSIVE_SEARCH_AD":    {"headline": 30, "description": 90},
    "RESPONSIVE_DISPLAY_AD":   {"headline": 30, "long_headline": 90, "description": 90},
    "EXPANDED_TEXT_AD":         {"headline": 30, "description": 90},
    "VIDEO_RESPONSIVE_AD":     {"headline": 30, "description": 90},
    "VIDEO_AD":                {"headline": 30, "description": 90},
    # LinkedIn
    "SPONSORED_CONTENT":       {"headline": 150, "description": 600},
    "TEXT_AD":                 {"headline": 25, "description": 75},
    # StackAdapt
    "Native":                  {"headline": 55, "description": 120},
    # Reddit
    "Promoted Post":           {"headline": 150, "description": 300},
    # Fallback
    "DEFAULT":                 {"headline": 30, "description": 90},
}

# Platform → default ad type (when adType is missing)
PLATFORM_DEFAULT_TYPE = {
    "google_ads": "RESPONSIVE_SEARCH_AD",
    "linkedin": "SPONSORED_CONTENT",
    "linkedin_ads": "SPONSORED_CONTENT",
    "stackadapt": "Native",
    "reddit": "Promoted Post",
}

# DB adType values → canonical type
AD_TYPE_ALIASES = {
    "Responsive Search": "RESPONSIVE_SEARCH_AD",
    "Responsive Display": "RESPONSIVE_DISPLAY_AD",
    "Display": "RESPONSIVE_DISPLAY_AD",
    "Expanded Text": "EXPANDED_TEXT_AD",
    "Video": "VIDEO_RESPONSIVE_AD",
    "Sponsored Content": "SPONSORED_CONTENT",
    "Text Ad": "TEXT_AD",
    "Native": "Native",
    "Carousel": "SPONSORED_CONTENT",
    "Spotlight": "SPONSORED_CONTENT",
    "DOOH": "DOOH",
    "Promoted Post": "Promoted Post",
}

# Filler words — ONLY flag genuinely empty buzzwords
# "leading" is NOT filler — it's intentional competitive positioning
# "innovative" is borderline — only flag if it's the ONLY descriptor
FILLER_WORDS = [
    "best-in-class", "cutting-edge", "revolutionary",
    "world-class", "next-generation", "state-of-the-art", "game-changing",
    "synergy", "paradigm", "leverage",  # corporate buzzwords
]

# Dynamic insertion patterns to EXCLUDE from length counting
DYNAMIC_PATTERNS = [
    r"\{KEYWORD:[^}]*\}",           # Google Ads keyword insertion
    r"\{KeyWord:[^}]*\}",
    r"\{keyword:[^}]*\}",
    r"\{LOCATION\([^)]*\)\}",       # Location insertion
    r"\{CUSTOMIZER\.[^}]*\}",       # Ad customizer
    r"\{IF\([^)]*\):[^}]*\}",       # IF functions
    r"\{COUNTDOWN\([^)]*\)\}",      # Countdown
]

MESSAGING_PILLARS = [
    "Real-Time AI Performance",
    "Telephony Built for AI",
    "Voice That Drives Action",
    "Secure Mobile Voice and Identity for AI",
]

KNOWLEDGE_DIR = os.path.join(os.path.dirname(__file__), "..", "knowledge")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


# ─── Helpers ──────────────────────────────────────────

def get_effective_length(text: str) -> int:
    """Get display length excluding dynamic insertion templates.
    For {KEYWORD:default}, count the default text length instead."""
    effective = text
    for pattern in DYNAMIC_PATTERNS:
        matches = re.findall(pattern, effective)
        for m in matches:
            # For keyword insertion, use the default text length
            default_match = re.search(r":([^}]+)\}", m)
            if default_match:
                effective = effective.replace(m, default_match.group(1))
            else:
                effective = effective.replace(m, "")
    return len(effective.strip())


def get_ad_type(creative: dict) -> str:
    """Determine ad type from creative data, normalized to canonical type."""
    ad_type = creative.get("adType") or creative.get("ad_type") or ""
    if ad_type:
        # Check alias map first
        canonical = AD_TYPE_ALIASES.get(ad_type)
        if canonical:
            return canonical
        # Check if it's already a canonical type
        if ad_type in AD_TYPE_LIMITS:
            return ad_type
        # Fallback to platform default

    platform = creative.get("platform", "")
    return PLATFORM_DEFAULT_TYPE.get(platform, "DEFAULT")


def get_limits_for_type(ad_type: str) -> dict:
    """Get char limits for a specific ad type."""
    return AD_TYPE_LIMITS.get(ad_type, AD_TYPE_LIMITS["DEFAULT"])


# ─── DB ───────────────────────────────────────────────

def get_db():
    import psycopg2
    return psycopg2.connect(DB_URL)


def fetch_active_creatives(conn):
    """Pull active ad creatives in active campaigns with ad type info."""
    cur = conn.cursor()
    cur.execute("""
        SELECT ac.id, ac.platform, ac."campaignName", ac."adGroupName",
               ac.headlines, ac.descriptions, ac.status, ac."adType"
        FROM "AdCreative" ac
        JOIN "Campaign" c ON ac."campaignName" = c.name AND ac.platform = c.platform
        WHERE ac.status IN ('active', 'enabled', 'ENABLED', 'Active')
          AND c.status IN ('active', 'enabled', 'ENABLED', 'Active', 'live', 'Live')
        ORDER BY ac.platform, ac."campaignName"
    """)
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    creatives = [dict(zip(cols, r)) for r in rows]
    cur.close()
    return creatives


# ─── Rule-based checks ───────────────────────────────

def check_char_limits(creative):
    """Check headlines and descriptions against ad-type-specific char limits."""
    issues = []
    ad_type = get_ad_type(creative)
    limits = get_limits_for_type(ad_type)

    headlines = json.loads(creative["headlines"]) if creative["headlines"] else []
    descriptions = json.loads(creative["descriptions"]) if creative["descriptions"] else []

    for i, h in enumerate(headlines):
        effective_len = get_effective_length(h)
        if effective_len > limits["headline"]:
            issues.append({
                "type": "char_limit",
                "field": f"headline[{i}]",
                "text": h,
                "length": effective_len,
                "limit": limits["headline"],
                "over_by": effective_len - limits["headline"],
                "ad_type": ad_type,
                "campaign": creative["campaignName"],
            })

    desc_limit = limits.get("description", 90)
    for i, d in enumerate(descriptions):
        if desc_limit > 0:
            effective_len = get_effective_length(d)
            if effective_len > desc_limit:
                issues.append({
                    "type": "char_limit",
                    "field": f"description[{i}]",
                    "text": d,
                    "length": effective_len,
                    "limit": desc_limit,
                    "over_by": effective_len - desc_limit,
                    "ad_type": ad_type,
                    "campaign": creative["campaignName"],
                })

    return issues


def check_filler_words(creative):
    """Check for genuinely empty buzzwords. Excludes intentional positioning."""
    issues = []
    headlines = json.loads(creative["headlines"]) if creative["headlines"] else []
    descriptions = json.loads(creative["descriptions"]) if creative["descriptions"] else []

    all_text = headlines + descriptions
    for text in all_text:
        lower = text.lower()
        for filler in FILLER_WORDS:
            if filler in lower:
                issues.append({
                    "type": "filler_word",
                    "text": text,
                    "filler": filler,
                    "campaign": creative["campaignName"],
                    "ad_type": get_ad_type(creative),
                })

    return issues


def normalize_campaign_base(name: str) -> str:
    """Strip regional suffix and date prefix to get campaign 'base'.
    '202602 TOFU Vapi AI Agent SA AMER' → 'tofu vapi ai agent sa'
    '202602 TOFU Vapi AI Agent SA EMEA' → 'tofu vapi ai agent sa'
    These are the same campaign split by region."""
    # Remove date prefix (YYYYMM)
    base = re.sub(r"^\d{6}\s+", "", name)
    # Remove regional suffixes
    base = re.sub(r"\s+(AMER|EMEA|APAC|MENA|GLOBAL|LATAM|SEA|ANZ)\s*$", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\s+(AMER|EMEA|APAC|MENA|GLOBAL|LATAM|SEA|ANZ)\s*[-—]\s*\w+$", "", base, flags=re.IGNORECASE)
    return base.strip().lower()


def check_duplicates(creatives):
    """Find duplicate headlines across fundamentally different campaigns.
    Regional variants (AMER/EMEA/APAC) of same campaign sharing headlines = intentional."""
    headline_map = defaultdict(list)
    dupes = []

    for c in creatives:
        headlines = json.loads(c["headlines"]) if c["headlines"] else []
        for h in headlines:
            key = h.strip().lower()
            if len(key) < 5:
                continue
            headline_map[key].append({
                "id": c["id"],
                "campaign": c["campaignName"],
                "campaign_base": normalize_campaign_base(c["campaignName"]),
            })

    for headline, locations in headline_map.items():
        # Only flag if across DIFFERENT campaign bases (not just regional splits)
        campaign_bases = set(l["campaign_base"] for l in locations)
        if len(campaign_bases) > 1:
            campaigns = list(set(l["campaign"] for l in locations))
            dupes.append({
                "type": "duplicate_cross_campaign",
                "headline": headline,
                "campaign_count": len(campaigns),
                "unique_bases": len(campaign_bases),
                "campaigns": campaigns[:5],
            })

    return dupes


# ─── AI analysis ─────────────────────────────────────

def load_knowledge():
    """Load knowledge context for ad copy review."""
    try:
        from lib.knowledge import load_knowledge_for_agent
        ctx = load_knowledge_for_agent("ad_copy_review")
        if ctx:
            print(f"  Knowledge loaded via shared loader ({len(ctx)} chars)")
            return ctx
    except ImportError:
        pass
    # Fallback: direct disk read
    files = [
        "standards/ad-copy-rules.md",
        "brand/narrative-positioning-constitution.md",
        "brand/brand-messaging-q1-2026.md",
    ]
    content = []
    for f in files:
        p = os.path.join(KNOWLEDGE_DIR, f)
        if os.path.exists(p):
            with open(p) as fh:
                text = fh.read()
                content.append(text[:4000])
    result = "\n\n---\n\n".join(content)
    print(f"  Knowledge loaded from disk ({len(result)} chars)")
    return result


def ai_analyze_batch(creatives_batch, knowledge, platform):
    """Use AI to analyze a batch of creatives. Ad-type-aware."""
    if not OPENCLAW_TOKEN:
        print("  Warning: OPENCLAW_GATEWAY_TOKEN not set, skipping AI analysis")
        return []

    batch_data = []
    for c in creatives_batch:
        ad_type = get_ad_type(c)
        limits = get_limits_for_type(ad_type)
        headlines = json.loads(c["headlines"]) if c["headlines"] else []
        descriptions = json.loads(c["descriptions"]) if c["descriptions"] else []
        batch_data.append({
            "id": c["id"],
            "campaign": c["campaignName"],
            "adGroup": c.get("adGroupName", ""),
            "adType": ad_type,
            "charLimits": limits,
            "headlines": headlines,
            "descriptions": descriptions,
        })

    prompt = f"""Analyze these {platform} ad creatives for Telnyx (B2B cloud communications).

{knowledge[:8000]}

## Creatives to review:
{json.dumps(batch_data, indent=2)}

## CRITICAL RULES — read carefully:
1. Ad types have DIFFERENT char limits. RSA headlines=30, Display headlines=30, LinkedIn headlines=150, StackAdapt=55
2. Dynamic insertions like {{KEYWORD:default}} and {{LOCATION(Country)}} are VALID — count the default text, not the template
3. Duplicate headlines within the SAME campaign are INTENTIONAL RSA strategy — do NOT flag
4. "leading" is intentional competitive positioning — NOT a filler word
5. Only flag GENUINELY problematic copy — vague, off-brand, misleading, or technically wrong
6. Telnyx positioning: owns its telecom network (not a reseller), competes with Twilio/Vonage/Bandwidth

## Flag ONLY these real issues:
- Headlines that could be ANY company (zero Telnyx differentiation)
- Claims that are factually wrong or misleading
- Copy using consumer language instead of developer/engineer voice
- Messaging that contradicts Telnyx positioning (e.g., implying Telnyx is a reseller)
- SEO-style copy in PPC context ("Best X", "Top 10 X") — these don't convert

## Do NOT flag:
- Intentional competitor mentions (Twilio Alternative, ElevenLabs Alternative) — these are strategy
- Short headlines — sometimes less is more
- Headlines reused across ad groups in same campaign — RSA strategy
- "Leading" or "enterprise-grade" — intentional positioning
- Dynamic insertion templates

Return JSON array (empty if all look fine):
{{
  "flagged": [
    {{
      "creative_id": "id",
      "field": "headline[0]",
      "current_text": "exact text",
      "issue": "specific problem",
      "replacement": "exact replacement within char limits",
      "pillar": "which messaging pillar",
      "confidence": "HIGH or MEDIUM"
    }}
  ]
}}

Be VERY selective. Most ads should pass. Only flag what a senior PPC manager would actually change."""

    try:
        data = json.dumps({
            "model": "claude-sonnet-4-6",
            "messages": [
                {"role": "system", "content": "You are a senior B2B PPC copywriter. Return ONLY valid JSON. Be extremely selective — only flag genuinely problematic copy."},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 4096,
            "temperature": 0.2,
        }).encode()

        req = urllib.request.Request(
            OPENCLAW_BASE,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENCLAW_TOKEN}",
            },
        )
        resp = urllib.request.urlopen(req, timeout=90)
        result = json.loads(resp.read().decode())
        content = result["choices"][0]["message"]["content"]
        cleaned = re.sub(r"```json\n?", "", content)
        cleaned = re.sub(r"```\n?", "", cleaned).strip()
        parsed = json.loads(cleaned)
        return parsed.get("flagged", [])
    except Exception as e:
        print(f"  AI analysis failed for {platform} batch: {e}")
        return []


def validate_ai_suggestions(suggestions, creatives_map):
    """Validate AI suggestions: correct ad type limits, no filler in replacements."""
    validated = []

    for s in suggestions:
        creative_id = s.get("creative_id", "")
        creative = creatives_map.get(creative_id)
        if not creative:
            continue

        ad_type = get_ad_type(creative)
        limits = get_limits_for_type(ad_type)
        field = s.get("field", "")
        replacement = s.get("replacement", "")

        # Determine correct limit
        if "headline" in field:
            max_len = limits["headline"]
        elif "description" in field:
            max_len = limits.get("description", 90)
        else:
            max_len = 90

        # Clean unicode
        replacement = replacement.replace("\u2014", "-").replace("\u2013", "-")

        # Check replacement length (effective, excluding dynamic inserts)
        effective_len = get_effective_length(replacement)
        if effective_len > max_len:
            replacement = replacement[:max_len]
            effective_len = len(replacement)

        # Reject if replacement has filler
        if any(f in replacement.lower() for f in FILLER_WORDS):
            continue

        # Reject LOW confidence
        if s.get("confidence", "").upper() not in ("HIGH", "MEDIUM"):
            continue

        s["replacement"] = replacement
        s["replacement_length"] = effective_len
        s["char_limit"] = max_len
        s["ad_type"] = ad_type
        validated.append(s)

    return validated


# ─── DB writes ────────────────────────────────────────

def save_results(conn, issues, ai_suggestions, stats):
    """Save AgentRun + Recommendations to DB."""
    cur = conn.cursor()

    cur.execute("SELECT id FROM \"Agent\" WHERE slug = 'ad-copy-review'")
    agent_row = cur.fetchone()
    if not agent_row:
        cur.execute("""INSERT INTO "Agent" (id, slug, name, description, model, enabled, "createdAt")
            VALUES (gen_random_uuid()::text, 'ad-copy-review', 'Ad Copy Review Agent',
            'Daily audit of ad creatives against brand pillars and copy rules (v2)', 'claude-sonnet-4-6', true, NOW())
            RETURNING id""")
        agent_id = cur.fetchone()[0]
    else:
        agent_id = agent_row[0]

    run_output = {
        "version": 2,
        "stats": stats,
        "rule_based_issues": len(issues),
        "ai_suggestions": len(ai_suggestions),
    }

    cur.execute("""INSERT INTO "AgentRun" (id, "agentId", status, output, "findingsCount", "recsCount",
        "startedAt", "completedAt", "createdAt")
        VALUES (gen_random_uuid()::text, %s, 'done', %s, %s, %s, NOW(), NOW(), NOW()) RETURNING id""",
        (agent_id, json.dumps(run_output),
         len(issues) + len(ai_suggestions),
         len(ai_suggestions)))  # Only AI suggestions are actionable recs
    run_id = cur.fetchone()[0]

    # Only save AI suggestions as recommendations (rule-based are informational)
    for s in ai_suggestions:
        action = f'Replace {s["field"]}: "{s["current_text"][:40]}..." → "{s["replacement"][:40]}..."'
        rationale = f'{s["issue"]} | Pillar: {s.get("pillar", "N/A")} | {s["ad_type"]} {s["replacement_length"]}/{s["char_limit"]} chars'
        impact_data = {
            "creative_id": s.get("creative_id"),
            "field": s["field"],
            "current": s["current_text"],
            "replacement": s["replacement"],
            "pillar": s.get("pillar"),
            "confidence": s.get("confidence", "MEDIUM"),
            "ad_type": s.get("ad_type"),
        }

        cur.execute("""INSERT INTO "Recommendation" (id, "agentRunId", type, severity, target, action, rationale, impact, status, "createdAt")
            VALUES (gen_random_uuid()::text, %s, 'ad-copy', %s, %s, %s, %s, %s, 'pending', NOW())""",
            (run_id,
             "high" if s.get("confidence") == "HIGH" else "medium",
             s.get("current_text", "")[:200],
             action, rationale, json.dumps(impact_data)))

    conn.commit()
    cur.close()
    return run_id


# ─── Telegram ─────────────────────────────────────────

def send_telegram_summary(stats, dry_run=False):
    today = datetime.now().strftime("%b %-d")
    lines = [f"📝 Ad Copy Review — {today}"]
    if dry_run:
        lines.append("[DRY RUN]")

    lines.append(f"{stats['total_reviewed']} ads reviewed across {len(stats.get('platforms', {}))} platforms")

    if stats["total_issues"] == 0:
        lines.append("✅ All clear — no issues found")
    else:
        parts = []
        if stats.get("char_limit_issues", 0) > 0:
            parts.append(f"{stats['char_limit_issues']} char limit")
        if stats.get("filler_issues", 0) > 0:
            parts.append(f"{stats['filler_issues']} filler words")
        if stats.get("duplicate_issues", 0) > 0:
            parts.append(f"{stats['duplicate_issues']} cross-campaign dupes")
        if stats.get("ai_issues", 0) > 0:
            parts.append(f"{stats['ai_issues']} quality issues")
        lines.append(f"Found: {', '.join(parts)}" if parts else f"Found {stats['total_issues']} issues")

        if stats.get("ai_issues", 0) > 0:
            lines.append(f"⏳ {stats['ai_issues']} recommendations pending review")

    msg = "\n".join(lines)
    try:
        data = json.dumps({
            "chat_id": CHAT_ID,
            "message_thread_id": AGENT_ACTIVITY_THREAD,
            "text": msg,
            "parse_mode": "HTML",
        }).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            data=data, headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)
        print("  Telegram summary sent")
    except Exception as e:
        print(f"  Telegram send failed: {e}")


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Ad Copy Review Agent v2")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--rules-only", action="store_true", default=True, help="Skip AI analysis (default)")
    parser.add_argument("--with-ai", action="store_true", help="Include AI analysis (memory intensive)")
    args = parser.parse_args()

    print(f"Ad Copy Review Agent v2 — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    if args.with_ai:
        args.rules_only = False
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'} | {'Rules only' if args.rules_only else 'Rules + AI'}")
    print("=" * 50)

    conn = get_db()

    # 1. Fetch
    creatives = fetch_active_creatives(conn)
    print(f"Active creatives: {len(creatives)}")
    if not creatives:
        print("Nothing to review.")
        conn.close()
        return

    # Build lookup
    creatives_map = {c["id"]: c for c in creatives}

    # Group by platform
    by_platform = defaultdict(list)
    for c in creatives:
        by_platform[c["platform"]].append(c)

    # Show ad type breakdown
    type_counts = defaultdict(int)
    for c in creatives:
        type_counts[get_ad_type(c)] += 1
    print(f"Ad types: {dict(type_counts)}")

    # 2. Rule-based checks
    print(f"\n[1/2] Rule-based checks...")
    char_issues = []
    for c in creatives:
        char_issues.extend(check_char_limits(c))
    print(f"  Char limit violations: {len(char_issues)}")

    filler_issues = []
    for c in creatives:
        filler_issues.extend(check_filler_words(c))
    print(f"  Filler words: {len(filler_issues)}")

    dupe_issues = []
    for platform, pcs in by_platform.items():
        dupe_issues.extend(check_duplicates(pcs))
    print(f"  Cross-campaign duplicates: {len(dupe_issues)}")

    all_rule_issues = char_issues + filler_issues + dupe_issues

    # 3. AI analysis
    all_ai_suggestions = []
    if not args.rules_only:
        print(f"\n[2/2] AI analysis...")
        knowledge = load_knowledge()
        for platform, pcs in by_platform.items():
            print(f"  {platform}: {len(pcs)} creatives")
            for i in range(0, min(len(pcs), 30), 10):  # Max 30 per platform, batches of 10
                batch = pcs[i:i+15]
                raw = ai_analyze_batch(batch, knowledge, platform)
                validated = validate_ai_suggestions(raw, creatives_map)
                all_ai_suggestions.extend(validated)
                print(f"    Batch {i//15 + 1}: {len(raw)} flagged → {len(validated)} validated")
    else:
        print(f"\n[2/2] AI analysis skipped (--rules-only)")

    total_issues = len(all_rule_issues) + len(all_ai_suggestions)
    stats = {
        "total_reviewed": len(creatives),
        "total_issues": total_issues,
        "char_limit_issues": len(char_issues),
        "filler_issues": len(filler_issues),
        "duplicate_issues": len(dupe_issues),
        "ai_issues": len(all_ai_suggestions),
        "platforms": {p: len(cs) for p, cs in by_platform.items()},
        "ad_types": dict(type_counts),
    }

    print(f"\n{'=' * 50}")
    print(f"Results: {len(creatives)} reviewed, {total_issues} issues")
    print(f"  Rule-based: {len(all_rule_issues)} (char: {len(char_issues)}, filler: {len(filler_issues)}, dupes: {len(dupe_issues)})")
    print(f"  AI-detected: {len(all_ai_suggestions)}")

    if args.dry_run:
        print("\n[DRY RUN] Skipping DB + Telegram")
        if char_issues:
            print("\nChar limit issues:")
            for i in char_issues[:5]:
                print(f"  [{i['ad_type']}] {i['campaign'][:30]} — {i['field']}: {i['length']}/{i['limit']} ({i['text'][:40]}...)")
        if all_ai_suggestions:
            print("\nAI suggestions:")
            for s in all_ai_suggestions[:5]:
                print(f"  [{s.get('ad_type')}] {s['field']}: \"{s['current_text'][:35]}\" → \"{s['replacement'][:35]}\"")
                print(f"    {s['issue'][:60]}")
    else:
        run_id = save_results(conn, all_rule_issues, all_ai_suggestions, stats)
        print(f"\n  DB: AgentRun {run_id}")
        send_telegram_summary(stats)

    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
