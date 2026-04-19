#!/usr/bin/env python3
"""
ABM Auditor Agent
==================
Weekly health scorecard for ABM campaign segments.

Produces four sections:
1. Segment Health Summary — aggregate counts and flags
2. Per-Segment Report — each campaign-segment pair with performance + flags
3. Waste Detection — domains with high impressions + low relevance (StackAdapt only)
4. Undersized Segment Alert — segments that can't absorb budget

Output: Posted to DG Hub Agent Activity topic (Telegram thread 164)

Run: python3 scripts/abm-auditor-agent.py [--dry-run]
Cron: Weekly Monday 6 AM PST
"""

import json
import os
import sys
import argparse
import psycopg2
from datetime import datetime, timezone
from collections import defaultdict

DB_URL = "postgresql://localhost:5432/dghub"

# Add scripts to path for relevance scoring
sys.path.insert(0, os.path.dirname(__file__))
from abm_relevance import RelevanceScorer


def get_db():
    return psycopg2.connect(DB_URL)


def run_audit(cur, dry_run=False):
    """Run the full ABM audit and return the scorecard."""
    scorer = RelevanceScorer()
    scorecard = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sections": {},
    }

    # ─── Section 1: Segment Health Summary ─────────────────
    cur.execute("""
        SELECT platform, count(*) as total,
               count(CASE WHEN "healthFlags" @> '["undersized"]'::jsonb THEN 1 END) as undersized,
               count(CASE WHEN "healthFlags" @> '["zero_impressions"]'::jsonb THEN 1 END) as zero_imp,
               count(CASE WHEN "healthFlags" @> '["low_ctr"]'::jsonb THEN 1 END) as low_ctr,
               count(DISTINCT "campaignId") as campaigns,
               sum("spend30d")::numeric(10,0) as total_spend,
               sum("impressions30d") as total_imp
        FROM "ABMCampaignSegment"
        GROUP BY platform
    """)
    
    platform_summary = []
    total_segments = 0
    total_spend = 0
    total_flags = defaultdict(int)
    
    for row in cur.fetchall():
        platform, total, undersized, zero_imp, low_ctr, campaigns, spend, imp = row
        platform_summary.append({
            "platform": platform,
            "segments": total,
            "campaigns": campaigns,
            "spend": float(spend or 0),
            "impressions": imp or 0,
            "undersized": undersized,
            "zero_impressions": zero_imp,
            "low_ctr": low_ctr,
        })
        total_segments += total
        total_spend += float(spend or 0)
        total_flags["undersized"] += undersized
        total_flags["zero_impressions"] += zero_imp
        total_flags["low_ctr"] += low_ctr
    
    scorecard["sections"]["summary"] = {
        "total_segments": total_segments,
        "total_spend": round(total_spend, 0),
        "flags": dict(total_flags),
        "by_platform": platform_summary,
    }

    # ─── Section 2: Per-Segment Report (top issues) ────────
    # Get segments with health flags
    cur.execute("""
        SELECT "campaignName", "segmentName", platform, "segmentSize",
               "impressions30d", "clicks30d", "spend30d", "conversions30d",
               "ctr30d", "parsedProduct", "parsedVariant", "healthFlags"
        FROM "ABMCampaignSegment"
        WHERE "healthFlags" != '[]'::jsonb
        ORDER BY "spend30d" DESC
        LIMIT 20
    """)
    
    flagged_segments = []
    for row in cur.fetchall():
        (camp_name, seg_name, platform, size, imp, clk, spend, conv,
         ctr, product, variant, flags) = row
        flagged_segments.append({
            "campaign": camp_name,
            "segment": seg_name or "unknown",
            "platform": platform,
            "size": size,
            "impressions": imp,
            "clicks": clk,
            "spend": round(float(spend or 0), 2),
            "conversions": conv,
            "ctr": round(ctr, 2) if ctr else None,
            "product": product,
            "variant": variant,
            "flags": flags if isinstance(flags, list) else json.loads(flags or "[]"),
        })
    
    scorecard["sections"]["flagged_segments"] = flagged_segments

    # ─── Section 3: Waste Detection (StackAdapt domain-level) ──
    cur.execute("""
        SELECT a.domain, a.company, a."clearbitTags"->>0 as industry,
               a."clearbitDesc", c."parsedProduct",
               sum(i.impressions)::int as imp,
               sum(i.cost)::numeric(10,2) as spend,
               sum(i.conversions) as conv
        FROM "AdImpression" i
        JOIN "ABMAccount" a ON i.domain = a.domain
        JOIN "Campaign" c ON i."campaignId" = c."platformId"
        WHERE i.platform = 'stackadapt'
          AND i.domain != '__campaign__'
          AND a."lastEnrichedAt" IS NOT NULL
          AND c.platform = 'stackadapt'
          AND c."parsedProduct" = 'AI Agent'
        GROUP BY a.domain, a.company, a."clearbitTags"->>0, a."clearbitDesc", c."parsedProduct"
        HAVING sum(i.impressions) > 3000
        ORDER BY sum(i.cost) DESC
        LIMIT 30
    """)
    
    waste_domains = []
    total_waste_spend = 0
    for row in cur.fetchall():
        (domain, company, industry, desc, product, imp, spend, conv) = row
        tags = []
        acct = {
            "domain": domain, "company": company, "industry": industry,
            "clearbitTags": tags, "clearbitDesc": desc or "",
            "employeeCount": None,
        }
        score, reasoning = scorer.score(acct, {"parsedProduct": product or "AI Agent", "parsedVariant": ""})
        
        if score < 0.3:
            total_waste_spend += float(spend or 0)
            waste_domains.append({
                "domain": domain,
                "company": company,
                "industry": industry,
                "impressions": imp,
                "spend": round(float(spend or 0), 2),
                "conversions": conv,
                "relevance_score": score,
                "reasoning": reasoning.get("description_detail", ""),
            })
    
    scorecard["sections"]["waste"] = {
        "total_waste_spend": round(total_waste_spend, 0),
        "waste_domains": waste_domains[:15],
    }

    # ─── Section 4: Undersized Segment Alert ──────────────
    cur.execute("""
        SELECT "campaignName", "segmentName", platform, "segmentSize",
               "spend30d", "parsedProduct", "segmentSource"
        FROM "ABMCampaignSegment"
        WHERE "healthFlags" @> '["undersized"]'::jsonb
        ORDER BY "spend30d" DESC
    """)
    
    undersized = []
    for row in cur.fetchall():
        (camp_name, seg_name, platform, size, spend, product, source) = row
        undersized.append({
            "campaign": camp_name,
            "segment": seg_name or "unknown",
            "platform": platform,
            "size": size,
            "spend": round(float(spend or 0), 2),
            "product": product,
            "source": source,
        })
    
    scorecard["sections"]["undersized"] = undersized

    # ─── Section 5: Stale Campaign Cleanup ─────────────────
    # Find ABMCampaignSegment rows linked to ended/paused campaigns
    cur.execute("""
        SELECT cs."campaignId", cs."campaignName", cs.platform, cs."segmentName",
               c.status as campaign_status
        FROM "ABMCampaignSegment" cs
        LEFT JOIN "Campaign" c ON cs."campaignId" = c.id
        WHERE c.status NOT IN ('enabled', 'live', 'ACTIVE', 'active', 'LIVE')
           OR c.id IS NULL
        ORDER BY cs.platform, cs."campaignName"
    """)

    stale_segments = []
    for row in cur.fetchall():
        camp_id, camp_name, platform, seg_name, status = row
        stale_segments.append({
            "campaign_id": camp_id,
            "campaign": camp_name,
            "platform": platform,
            "segment": seg_name or "unknown",
            "status": status or "NOT_FOUND",
        })

    scorecard["sections"]["stale_campaigns"] = {
        "count": len(stale_segments),
        "segments": stale_segments[:20],
        "action": f"DELETE FROM \"ABMCampaignSegment\" WHERE campaign linked to ended/paused campaigns ({len(stale_segments)} rows)",
    }

    # ─── Section 6: Orphan Exclusion Audiences ─────────────
    # Exclusion audiences with no active campaigns for that product
    cur.execute("""
        SELECT e.category, count(DISTINCT e.domain) as domains,
               COUNT(DISTINCT cs."campaignId") FILTER (WHERE c.status IN ('enabled','live','ACTIVE','active','LIVE')) as active_campaigns
        FROM "ABMExclusion" e
        LEFT JOIN "ABMCampaignSegment" cs ON cs."parsedProduct" = e.category
        LEFT JOIN "Campaign" c ON cs."campaignId" = c.id
        WHERE e."addedBy" = 'negative_builder'
        GROUP BY e.category
    """)

    orphan_audiences = []
    for row in cur.fetchall():
        product, domains, active_camps = row
        orphan_audiences.append({
            "product": product,
            "excluded_domains": domains,
            "active_campaigns": active_camps or 0,
            "orphaned": (active_camps or 0) == 0,
        })

    scorecard["sections"]["orphan_exclusions"] = orphan_audiences

    # ─── Section 7: Missing Exclusion Audiences ─────────────
    # Active campaigns that don't have exclusion audiences attached
    cur.execute("""
        SELECT cs."campaignId", cs."campaignName", cs.platform, cs."parsedProduct"
        FROM "ABMCampaignSegment" cs
        JOIN "Campaign" c ON cs."campaignId" = c.id
        WHERE c.status IN ('enabled', 'live', 'ACTIVE', 'active', 'LIVE')
          AND NOT EXISTS (
            SELECT 1 FROM "ABMExclusion" e
            WHERE e.category = cs."parsedProduct"
              AND e."addedBy" = 'negative_builder'
          )
        GROUP BY cs."campaignId", cs."campaignName", cs.platform, cs."parsedProduct"
    """)

    missing_exclusions = []
    for row in cur.fetchall():
        camp_id, camp_name, platform, product = row
        missing_exclusions.append({
            "campaign_id": camp_id,
            "campaign": camp_name,
            "platform": platform,
            "product": product,
        })

    scorecard["sections"]["missing_exclusions"] = missing_exclusions

    return scorecard


def format_scorecard(scorecard):
    """Format the scorecard as a readable message for Telegram."""
    lines = []
    lines.append("🏥 <b>ABM Weekly Health Scorecard</b>")
    lines.append(f"Generated: {scorecard['generated_at'][:10]}")
    lines.append("")
    
    # Section 1: Summary
    s = scorecard["sections"]["summary"]
    lines.append(f"📊 <b>Summary:</b> {s['total_segments']} segments | ${s['total_spend']/1000:.0f}K spend")
    flags = s.get("flags", {})
    flag_strs = []
    if flags.get("undersized"): flag_strs.append(f"🟡 {flags['undersized']} undersized")
    if flags.get("zero_impressions"): flag_strs.append(f"🔴 {flags['zero_impressions']} zero delivery")
    if flags.get("low_ctr"): flag_strs.append(f"🟠 {flags['low_ctr']} low CTR")
    if flag_strs:
        lines.append("   " + " | ".join(flag_strs))
    lines.append("")
    
    # Platform breakdown
    for p in s["by_platform"]:
        name = {"linkedin": "LinkedIn", "stackadapt": "StackAdapt", "google_ads": "Google Ads"}.get(p["platform"], p["platform"])
        lines.append(f"   {name}: {p['segments']} segments, ${p['spend']/1000:.1f}K spend, {p['impressions']/1000:.0f}K impr")
    lines.append("")
    
    # Section 3: Waste
    w = scorecard["sections"]["waste"]
    lines.append(f"💰 <b>Waste Detection:</b> ${w['total_waste_spend']:.0f}/mo on irrelevant domains")
    for d in w["waste_domains"][:8]:
        lines.append(f"   🔴 {d['domain']} ({d['industry']}) — {d['impressions']/1000:.0f}K impr, ${d['spend']:.0f}, score={d['relevance_score']:.2f}")
    lines.append("")
    
    # Section 4: Undersized
    u = scorecard["sections"]["undersized"]
    if u:
        lines.append(f"⚠️ <b>Undersized Segments:</b> {len(u)} can't absorb budget")
        for seg in u[:5]:
            lines.append(f"   🟡 {seg['segment'][:30]} ({seg['platform']}) — size={seg['size']}, ${seg['spend']:.0f} spend")
        lines.append("")
    
    # Section 2: Flagged segments
    f = scorecard["sections"]["flagged_segments"]
    if f:
        lines.append(f"🚩 <b>Flagged Segments:</b> {len(f)} with health issues")
        for seg in f[:5]:
            flags_str = ", ".join(seg["flags"])
            lines.append(f"   {seg['campaign'][:35]} | {seg['segment'][:20]} | {flags_str}")
    lines.append("")
    
    # Section 5: Stale campaigns
    stale = scorecard["sections"].get("stale_campaigns", {})
    if stale.get("count", 0) > 0:
        lines.append(f"🧹 <b>Stale Campaigns:</b> {stale['count']} segments linked to ended/paused campaigns")
        for s in stale.get("segments", [])[:5]:
            lines.append(f"   ❌ {s['campaign'][:35]} ({s['platform']}) — status: {s['status']}")
        lines.append(f"   → Action: Re-sync ABMCampaignSegment to purge stale rows")
        lines.append("")
    
    # Section 6: Orphan exclusions
    orphans = scorecard["sections"].get("orphan_exclusions", [])
    orphan_products = [o for o in orphans if o.get("orphaned")]
    if orphan_products:
        lines.append(f"🔌 <b>Orphan Exclusion Audiences:</b> {len(orphan_products)} products with exclusions but no active campaigns")
        for o in orphan_products:
            lines.append(f"   ⚠️ {o['product']}: {o['excluded_domains']} domains excluded, 0 active campaigns")
        lines.append("")
    
    # Section 7: Missing exclusions
    missing = scorecard["sections"].get("missing_exclusions", [])
    if missing:
        lines.append(f"🚫 <b>Missing Exclusions:</b> {len(missing)} active campaigns without exclusion audiences")
        for m in missing[:5]:
            lines.append(f"   ⚠️ {m['campaign'][:35]} ({m['product']}) — no negative_builder exclusions")
        lines.append("")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="ABM Auditor Agent")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    
    print("🏥 ABM Auditor starting...")
    
    conn = get_db()
    cur = conn.cursor()
    
    try:
        scorecard = run_audit(cur, args.dry_run)
        message = format_scorecard(scorecard)
        
        if args.dry_run:
            print(message)
        else:
            # Post to DG Hub Agent Activity topic
            print(message)
            print(f"\n📊 Scorecard generated with {len(scorecard['sections'])} sections")
            
            # Log to AgentRun table
            cur.execute("""
                INSERT INTO "AgentRun" ("agentName", status, "startedAt", "completedAt", findings, recommendations)
                VALUES (%s, 'done', now(), now(), %s, %s)
            """, (
                "abm-auditor",
                json.dumps(scorecard["sections"]["summary"]),
                json.dumps({
                    "waste_spend": scorecard["sections"]["waste"]["total_waste_spend"],
                    "undersized_count": len(scorecard["sections"]["undersized"]),
                    "flagged_count": len(scorecard["sections"]["flagged_segments"]),
                }),
            ))
            conn.commit()
        
    except Exception as e:
        print(f"❌ Audit failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
