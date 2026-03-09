#!/usr/bin/env python3
"""
Spend & Budget Report Agent
Generates comprehensive spend/budget reports with smart campaign name parsing.

Usage:
  python spend-report-agent.py --from 2026-02-01 --to 2026-02-25 --format terminal
  python spend-report-agent.py --from 2026-02-01 --to 2026-02-25 --format markdown --sections summary,top
  python spend-report-agent.py --from 2026-02-01 --to 2026-02-25 --format json
  python spend-report-agent.py --from 2026-02-01 --to 2026-02-25 --format markdown --telegram
"""

import json, os, sys, argparse, re, urllib.request
from datetime import datetime, date
from collections import defaultdict
from typing import Optional

# Add scripts dir to path so we can import query_metrics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import query_metrics

# ═══════════════════════════════════════════════════════
# CAMPAIGN NAME PARSER
# ═══════════════════════════════════════════════════════

FUNNEL_STAGES = {"TOFU", "MOFU", "BOFU"}
REGIONS = {"AMER", "EMEA", "APAC", "MENA", "GLOBAL"}
CHANNEL_CODES = {"SA", "DA", "VA", "SI", "SPA", "CA", "WV"}

PRODUCT_KEYWORDS = {
    "Voice AI": ["voice ai", "voice-ai", "voiceai"],
    "AI Agent": ["ai agent", "ai-agent", "aiagent"],
    "Vapi": ["vapi"],
    "SIP": ["sip trunking", "sip"],
    "SMS": ["sms", "messaging"],
    "IoT": ["iot", "sim"],
    "Numbers": ["numbers", "phone number", "did"],
    "Contact Center": ["contact center", "ccaas", "call center"],
    "Twilio": ["twilio"],
    "ElevenLabs": ["elevenlabs", "eleven labs", "11labs"],
    "Generic": ["telnyx", "generic", "brand"],
    "Networking": ["networking", "network"],
    "Wireless": ["wireless"],
    "Storage": ["storage", "cloud storage"],
    "Verify": ["verify", "verification"],
    "Fax": ["fax"],
}

COMPETITIVE_PRODUCTS = {"Twilio", "ElevenLabs", "Vapi"}


def parse_campaign_name(name: str, platform: str) -> dict:
    """Parse campaign name into structured dimensions."""
    result = {
        "funnel": "OTHER",
        "product": "Other",
        "region": "OTHER",
        "channels": [],
        "platform": platform,
        "date_code": None,
        "is_competitive": False,
    }

    upper = name.upper()
    tokens = name.split()

    # 1. Date code (YYYYMM at start)
    if tokens and re.match(r"^\d{6}$", tokens[0]):
        result["date_code"] = tokens[0]
        tokens = tokens[1:]

    # 2. Funnel stage
    for t in tokens:
        if t.upper() in FUNNEL_STAGES:
            result["funnel"] = t.upper()
            break
    # Also check if funnel appears anywhere
    if result["funnel"] == "OTHER":
        for stage in FUNNEL_STAGES:
            if stage in upper:
                result["funnel"] = stage
                break

    # 3. Region
    for t in tokens:
        if t.upper() in REGIONS:
            result["region"] = t.upper()
            break
    if result["region"] == "OTHER":
        for reg in REGIONS:
            if reg in upper:
                result["region"] = reg
                break

    # 4. Channel codes
    for t in tokens:
        if t.upper() in CHANNEL_CODES:
            result["channels"].append(t.upper())
    if not result["channels"]:
        result["channels"] = ["OTHER"]

    # 5. Product (check longer names first)
    name_lower = name.lower()
    sorted_products = sorted(PRODUCT_KEYWORDS.items(), key=lambda x: -max(len(k) for k in x[1]))
    for product, keywords in sorted_products:
        for kw in keywords:
            if kw in name_lower:
                result["product"] = product
                result["is_competitive"] = product in COMPETITIVE_PRODUCTS
                break
        if result["product"] != "Other":
            break

    return result


# ═══════════════════════════════════════════════════════
# DATA COLLECTION
# ═══════════════════════════════════════════════════════

def collect_data(date_from: str, date_to: str, platform_filter: str = "all") -> list[dict]:
    """Collect campaign data from all platforms and enrich with parsed dimensions."""
    all_campaigns = []

    platforms_to_query = []
    if platform_filter in ("all", "google_ads"):
        platforms_to_query.append("google_ads")
    if platform_filter in ("all", "linkedin"):
        platforms_to_query.append("linkedin")

    for plat in platforms_to_query:
        try:
            if plat == "google_ads":
                data = query_metrics.query_google_ads(date_from, date_to, active_only=False)
            elif plat == "linkedin":
                data = query_metrics.query_linkedin(date_from, date_to, active_only=False)
            else:
                continue

            if "error" in data:
                print(f"⚠️  {plat} error: {data['error']}", file=sys.stderr)
                continue

            for c in data.get("campaigns", []):
                parsed = parse_campaign_name(c["name"], plat)
                c.update({
                    "funnel": parsed["funnel"],
                    "product": parsed["product"],
                    "region": parsed["region"],
                    "channel_types": parsed["channels"],
                    "is_competitive": parsed["is_competitive"],
                })
                all_campaigns.append(c)
        except Exception as e:
            print(f"⚠️  {plat} exception: {e}", file=sys.stderr)

    # Reddit: use platform connector for live metrics
    if platform_filter in ("all", "reddit"):
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            from platforms import get_connector
            reddit = get_connector("reddit")
            result = reddit.query_metrics(date_from, date_to, active_only=False)
            for c in result.campaigns:
                parsed = parse_campaign_name(c.name, "reddit")
                all_campaigns.append({
                    "name": c.name,
                    "campaignId": c.campaign_id,
                    "platform": "reddit",
                    "status": c.status,
                    "spend": round(c.spend, 2),
                    "impressions": c.impressions,
                    "clicks": c.clicks,
                    "conversions": round(c.conversions, 1),
                    "ctr": round(c.ctr, 2),
                    "avgCpc": round(c.avg_cpc, 2),
                    "funnel": parsed["funnel"],
                    "product": parsed["product"],
                    "region": parsed["region"],
                    "channel_types": parsed["channels"],
                    "is_competitive": parsed["is_competitive"],
                })
        except Exception as e:
            print(f"⚠️  Reddit error: {e}", file=sys.stderr)

    # StackAdapt: pull from DB (lifetime only)
    if platform_filter in ("all", "stackadapt"):
        try:
            import psycopg2
            conn = psycopg2.connect("postgresql://localhost:5432/dghub")
            cur = conn.cursor()
            cur.execute("""
                SELECT name, "platformId", status, spend, impressions, clicks, conversions
                FROM "Campaign"
                WHERE platform = 'stackadapt' AND (spend > 0 OR impressions > 0)
            """)
            for row in cur.fetchall():
                name, pid, status, spend, impressions, clicks, conversions = row
                parsed = parse_campaign_name(name, "stackadapt")
                spend = float(spend or 0)
                impressions = int(impressions or 0)
                clicks = int(clicks or 0)
                all_campaigns.append({
                    "name": name,
                    "campaignId": pid or "",
                    "platform": "stackadapt",
                    "status": status or "unknown",
                    "spend": round(spend, 2),
                    "impressions": impressions,
                    "clicks": clicks,
                    "conversions": 0,  # Don't show conversions for StackAdapt
                    "ctr": round((clicks / impressions * 100), 2) if impressions > 0 else 0,
                    "avgCpc": round(spend / clicks, 2) if clicks > 0 else 0,
                    "funnel": parsed["funnel"],
                    "product": parsed["product"],
                    "region": parsed["region"],
                    "channel_types": parsed["channels"],
                    "is_competitive": parsed["is_competitive"],
                    "_lifetime_only": True,
                })
            cur.close()
            conn.close()
        except Exception as e:
            print(f"⚠️  StackAdapt DB error: {e}", file=sys.stderr)

    return all_campaigns


# ═══════════════════════════════════════════════════════
# AGGREGATION HELPERS
# ═══════════════════════════════════════════════════════

def aggregate(campaigns: list[dict], group_key: str) -> dict:
    """Aggregate campaigns by a given key."""
    groups = defaultdict(lambda: {"spend": 0, "impressions": 0, "clicks": 0, "conversions_google": 0, "count": 0, "platforms": set()})
    for c in campaigns:
        key = c.get(group_key, "OTHER")
        if isinstance(key, list):
            key = "+".join(key) if key else "OTHER"
        g = groups[key]
        g["spend"] += c["spend"]
        g["impressions"] += c["impressions"]
        g["clicks"] += c["clicks"]
        if c["platform"] == "google_ads":
            g["conversions_google"] += c.get("conversions", 0)
        g["count"] += 1
        g["platforms"].add(c["platform"])
    return dict(groups)


def aggregate_matrix(campaigns: list[dict], key1: str, key2: str) -> dict:
    """Aggregate by two dimensions."""
    groups = defaultdict(lambda: {"spend": 0, "impressions": 0, "clicks": 0, "conversions_google": 0, "count": 0})
    for c in campaigns:
        k1 = c.get(key1, "OTHER")
        k2 = c.get(key2, "OTHER")
        if isinstance(k1, list):
            k1 = "+".join(k1) if k1 else "OTHER"
        if isinstance(k2, list):
            k2 = "+".join(k2) if k2 else "OTHER"
        key = f"{k1} × {k2}"
        g = groups[key]
        g["spend"] += c["spend"]
        g["impressions"] += c["impressions"]
        g["clicks"] += c["clicks"]
        if c["platform"] == "google_ads":
            g["conversions_google"] += c.get("conversions", 0)
        g["count"] += 1
    return dict(groups)


# ═══════════════════════════════════════════════════════
# FORMATTING HELPERS
# ═══════════════════════════════════════════════════════

def fmt_money(v: float) -> str:
    if v >= 1000:
        return f"${v:,.0f}"
    return f"${v:,.2f}"


def fmt_num(v: int) -> str:
    return f"{v:,}"


def fmt_pct(v: float) -> str:
    return f"{v:.2f}%"


def fmt_cpc(spend: float, clicks: int) -> str:
    if clicks == 0:
        return "—"
    return fmt_money(spend / clicks)


def fmt_ctr(clicks: int, impressions: int) -> str:
    if impressions == 0:
        return "—"
    return fmt_pct(clicks / impressions * 100)


def fmt_cost_per_conv(spend: float, conv: float) -> str:
    if conv == 0:
        return "—"
    return fmt_money(spend / conv)


def platform_emoji(p: str) -> str:
    return {"google_ads": "🔵", "linkedin": "🟦", "stackadapt": "🟩", "reddit": "🟠"}.get(p, "⬜")


def platform_label(p: str) -> str:
    return {"google_ads": "Google Ads", "linkedin": "LinkedIn", "stackadapt": "StackAdapt", "reddit": "Reddit"}.get(p, p)


# ═══════════════════════════════════════════════════════
# REPORT GENERATION
# ═══════════════════════════════════════════════════════

def generate_report(campaigns: list[dict], date_from: str, date_to: str, sections: list[str], top_n: int) -> dict:
    """Generate all report sections as structured data."""
    report = {"date_from": date_from, "date_to": date_to, "generated_at": datetime.now().isoformat()}

    total_spend = sum(c["spend"] for c in campaigns)
    total_impressions = sum(c["impressions"] for c in campaigns)
    total_clicks = sum(c["clicks"] for c in campaigns)
    total_conv_google = sum(c.get("conversions", 0) for c in campaigns if c["platform"] == "google_ads")
    has_stackadapt = any(c["platform"] == "stackadapt" for c in campaigns)

    # Executive Summary
    if "all" in sections or "summary" in sections:
        by_plat = defaultdict(float)
        by_plat_count = defaultdict(int)
        for c in campaigns:
            by_plat[c["platform"]] += c["spend"]
            by_plat_count[c["platform"]] += 1
        report["summary"] = {
            "total_spend": total_spend,
            "total_impressions": total_impressions,
            "total_clicks": total_clicks,
            "total_conversions_google": total_conv_google,
            "campaign_count": len(campaigns),
            "by_platform_spend": dict(by_plat),
            "by_platform_count": dict(by_plat_count),
            "has_stackadapt_lifetime": has_stackadapt,
        }

    # By Platform
    if "all" in sections or "platform" in sections:
        report["by_platform"] = aggregate(campaigns, "platform")

    # By Funnel
    if "all" in sections or "funnel" in sections:
        report["by_funnel"] = aggregate(campaigns, "funnel")

    # By Product
    if "all" in sections or "product" in sections:
        report["by_product"] = aggregate(campaigns, "product")

    # By Region
    if "all" in sections or "region" in sections:
        report["by_region"] = aggregate(campaigns, "region")

    # Platform × Funnel
    if "all" in sections or "platform_funnel" in sections:
        report["platform_funnel"] = aggregate_matrix(campaigns, "platform", "funnel")

    # Product × Region
    if "all" in sections or "product_region" in sections:
        report["product_region"] = aggregate_matrix(campaigns, "product", "region")

    # Top N campaigns
    if "all" in sections or "top" in sections:
        sorted_camps = sorted(campaigns, key=lambda x: x["spend"], reverse=True)[:top_n]
        report["top_campaigns"] = sorted_camps

    # Efficiency metrics
    if "all" in sections or "efficiency" in sections:
        # Best/worst by product
        by_product = aggregate(campaigns, "product")
        efficiency = {"by_product": [], "by_funnel": []}
        for prod, data in sorted(by_product.items(), key=lambda x: x[1]["spend"], reverse=True):
            if data["impressions"] > 0 and data["spend"] > 50:
                efficiency["by_product"].append({
                    "name": prod,
                    "spend": data["spend"],
                    "ctr": data["clicks"] / data["impressions"] * 100 if data["impressions"] else 0,
                    "cpc": data["spend"] / data["clicks"] if data["clicks"] else 0,
                    "cost_per_conv": data["spend"] / data["conversions_google"] if data["conversions_google"] else None,
                })
        by_funnel = aggregate(campaigns, "funnel")
        for funnel, data in sorted(by_funnel.items(), key=lambda x: x[1]["spend"], reverse=True):
            if data["impressions"] > 0 and data["spend"] > 50:
                efficiency["by_funnel"].append({
                    "name": funnel,
                    "spend": data["spend"],
                    "ctr": data["clicks"] / data["impressions"] * 100 if data["impressions"] else 0,
                    "cpc": data["spend"] / data["clicks"] if data["clicks"] else 0,
                    "cost_per_conv": data["spend"] / data["conversions_google"] if data["conversions_google"] else None,
                })
        report["efficiency"] = efficiency

    return report


# ═══════════════════════════════════════════════════════
# TERMINAL FORMAT
# ═══════════════════════════════════════════════════════

def render_terminal(report: dict) -> str:
    lines = []
    w = 80

    def header(title):
        lines.append("")
        lines.append("═" * w)
        lines.append(f"  {title}")
        lines.append("═" * w)

    def subheader(title):
        lines.append("")
        lines.append(f"  ── {title} ──")

    def row(label, spend, impr, clicks, ctr, cpc, conv=None, cpconv=None):
        parts = [
            f"  {label:<30s}",
            f"{fmt_money(spend):>12s}",
            f"{fmt_num(impr):>10s}",
            f"{fmt_num(clicks):>8s}",
            f"{ctr:>8s}",
            f"{cpc:>10s}",
        ]
        if conv is not None:
            parts.append(f"{conv:>8s}")
            parts.append(f"{cpconv:>10s}" if cpconv else f"{'—':>10s}")
        lines.append("".join(parts))

    def table_header(has_conv=False):
        parts = [f"  {'':30s}", f"{'Spend':>12s}", f"{'Impr':>10s}", f"{'Clicks':>8s}", f"{'CTR':>8s}", f"{'CPC':>10s}"]
        if has_conv:
            parts.extend([f"{'Conv':>8s}", f"{'Cost/Conv':>10s}"])
        lines.append("".join(parts))
        lines.append("  " + "─" * (w - 4))

    def totals_row(label, data, has_conv=False):
        spend = data["spend"]
        impr = data["impressions"]
        clicks = data["clicks"]
        ctr = fmt_ctr(clicks, impr)
        cpc = fmt_cpc(spend, clicks)
        if has_conv:
            conv = data.get("conversions_google", 0)
            row(label, spend, impr, clicks, ctr, cpc, fmt_num(int(conv)), fmt_cost_per_conv(spend, conv))
        else:
            row(label, spend, impr, clicks, ctr, cpc)

    # Summary
    if "summary" in report:
        s = report["summary"]
        header(f"📊 SPEND REPORT: {report['date_from']} → {report['date_to']}")
        lines.append("")
        lines.append(f"  Total Spend:       {fmt_money(s['total_spend'])}")
        lines.append(f"  Total Impressions: {fmt_num(s['total_impressions'])}")
        lines.append(f"  Total Clicks:      {fmt_num(s['total_clicks'])}")
        lines.append(f"  Google Ads Conv:   {fmt_num(int(s['total_conversions_google']))}")
        lines.append(f"  Campaigns:         {s['campaign_count']}")
        lines.append("")
        for plat, spend in sorted(s["by_platform_spend"].items(), key=lambda x: -x[1]):
            cnt = s["by_platform_count"].get(plat, 0)
            lines.append(f"  {platform_emoji(plat)} {platform_label(plat):<16s} {fmt_money(spend):>12s}  ({cnt} campaigns)")
        if s.get("has_stackadapt_lifetime"):
            lines.append("")
            lines.append("  ⚠️  StackAdapt: lifetime data only (no date-range API)")

    # By Platform
    if "by_platform" in report:
        header("📊 BY PLATFORM")
        table_header(True)
        total = {"spend": 0, "impressions": 0, "clicks": 0, "conversions_google": 0}
        for plat, data in sorted(report["by_platform"].items(), key=lambda x: -x[1]["spend"]):
            label = f"{platform_emoji(plat)} {platform_label(plat)}"
            spend, impr, clicks = data["spend"], data["impressions"], data["clicks"]
            conv = data["conversions_google"]
            ctr = fmt_ctr(clicks, impr)
            cpc = fmt_cpc(spend, clicks)
            if plat == "google_ads":
                row(label, spend, impr, clicks, ctr, cpc, fmt_num(int(conv)), fmt_cost_per_conv(spend, conv))
            else:
                row(label, spend, impr, clicks, ctr, cpc, "ABM", "—")
            for k in total:
                total[k] += data.get(k, 0)
        lines.append("  " + "─" * (w - 4))
        totals_row("TOTAL", total, True)
        lines.append("")
        lines.append("  ℹ️  LinkedIn/StackAdapt: ABM platforms — attribution via domain matching")

    # Generic section renderer
    def render_section(key, title, data_dict):
        header(title)
        table_header(True)
        total = {"spend": 0, "impressions": 0, "clicks": 0, "conversions_google": 0}
        for name, data in sorted(data_dict.items(), key=lambda x: -x[1]["spend"]):
            spend, impr, clicks = data["spend"], data["impressions"], data["clicks"]
            conv = data["conversions_google"]
            ctr = fmt_ctr(clicks, impr)
            cpc = fmt_cpc(spend, clicks)
            conv_str = fmt_num(int(conv)) if conv > 0 else "—"
            cpconv = fmt_cost_per_conv(spend, conv) if conv > 0 else "—"
            row(name, spend, impr, clicks, ctr, cpc, conv_str, cpconv)
            for k in total:
                total[k] += data.get(k, 0)
        lines.append("  " + "─" * (w - 4))
        totals_row("TOTAL", total, True)

    if "by_funnel" in report:
        render_section("by_funnel", "📊 BY FUNNEL STAGE", report["by_funnel"])
    if "by_product" in report:
        filtered = {k: v for k, v in report["by_product"].items() if v["spend"] > 0}
        render_section("by_product", "📊 BY PRODUCT", filtered)
    if "by_region" in report:
        render_section("by_region", "📊 BY REGION", report["by_region"])
    if "platform_funnel" in report:
        render_section("platform_funnel", "📊 PLATFORM × FUNNEL", report["platform_funnel"])
    if "product_region" in report:
        # Filter out zero-spend rows
        filtered = {k: v for k, v in report["product_region"].items() if v["spend"] > 0}
        render_section("product_region", "📊 PRODUCT × REGION", filtered)

    # Top campaigns
    if "top_campaigns" in report:
        header(f"🏆 TOP {len(report['top_campaigns'])} CAMPAIGNS BY SPEND")
        lines.append(f"  {'#':<4s}{'Campaign':<40s}{'Platform':<12s}{'Spend':>10s}{'Impr':>10s}{'Clicks':>8s}{'CTR':>8s}{'CPC':>10s}")
        lines.append("  " + "─" * (w - 4))
        for i, c in enumerate(report["top_campaigns"], 1):
            name = c["name"][:38]
            plat = platform_label(c["platform"])[:10]
            ctr = fmt_ctr(c["clicks"], c["impressions"])
            cpc = fmt_cpc(c["spend"], c["clicks"])
            lines.append(f"  {i:<4d}{name:<40s}{plat:<12s}{fmt_money(c['spend']):>10s}{fmt_num(c['impressions']):>10s}{fmt_num(c['clicks']):>8s}{ctr:>8s}{cpc:>10s}")

    # Efficiency
    if "efficiency" in report:
        header("⚡ EFFICIENCY METRICS")
        for section_name, items in [("By Product", report["efficiency"]["by_product"]), ("By Funnel", report["efficiency"]["by_funnel"])]:
            if not items:
                continue
            subheader(section_name)
            lines.append(f"  {'Name':<25s}{'Spend':>12s}{'CTR':>8s}{'CPC':>10s}{'Cost/Conv':>12s}")
            lines.append("  " + "─" * 67)
            for item in sorted(items, key=lambda x: x["cpc"] if x["cpc"] else 999):
                cpconv = fmt_money(item["cost_per_conv"]) if item["cost_per_conv"] else "—"
                lines.append(f"  {item['name']:<25s}{fmt_money(item['spend']):>12s}{fmt_pct(item['ctr']):>8s}{fmt_money(item['cpc']):>10s}{cpconv:>12s}")

    lines.append("")
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════
# MARKDOWN FORMAT
# ═══════════════════════════════════════════════════════

def render_markdown(report: dict, condensed: bool = False) -> str:
    lines = []

    def md_table(headers, rows):
        lines.append("| " + " | ".join(headers) + " |")
        lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
        for r in rows:
            lines.append("| " + " | ".join(str(x) for x in r) + " |")

    # Summary
    if "summary" in report:
        s = report["summary"]
        lines.append(f"## 📊 Spend Report: {report['date_from']} → {report['date_to']}")
        lines.append("")
        lines.append(f"**Total Spend:** {fmt_money(s['total_spend'])} | **Campaigns:** {s['campaign_count']} | **Google Conv:** {fmt_num(int(s['total_conversions_google']))}")
        lines.append("")
        for plat, spend in sorted(s["by_platform_spend"].items(), key=lambda x: -x[1]):
            cnt = s["by_platform_count"].get(plat, 0)
            lines.append(f"- {platform_emoji(plat)} **{platform_label(plat)}**: {fmt_money(spend)} ({cnt} campaigns)")
        if s.get("has_stackadapt_lifetime"):
            lines.append("")
            lines.append("> ⚠️ StackAdapt data is lifetime only — no date-range API available")
        lines.append("")

    if condensed:
        # For Telegram: just summary + top campaigns
        if "top_campaigns" in report:
            lines.append(f"### 🏆 Top {len(report['top_campaigns'])} Campaigns")
            lines.append("")
            rows = []
            for c in report["top_campaigns"][:10]:
                plat = platform_emoji(c["platform"])
                ctr = fmt_ctr(c["clicks"], c["impressions"])
                rows.append([plat, c["name"][:35], fmt_money(c["spend"]), fmt_num(c["clicks"]), ctr])
            md_table(["", "Campaign", "Spend", "Clicks", "CTR"], rows)
            lines.append("")
            lines.append("_LinkedIn/StackAdapt: ABM platforms — attribution via domain matching (see Pipeline page)_")
        return "\n".join(lines)

    # Full report sections
    def render_agg_section(title, data_dict):
        lines.append(f"### {title}")
        lines.append("")
        rows = []
        for name, data in sorted(data_dict.items(), key=lambda x: -x[1]["spend"]):
            spend = data["spend"]
            impr = data["impressions"]
            clicks = data["clicks"]
            conv = data["conversions_google"]
            ctr = fmt_ctr(clicks, impr)
            cpc = fmt_cpc(spend, clicks)
            conv_str = fmt_num(int(conv)) if conv > 0 else "—"
            rows.append([name, fmt_money(spend), fmt_num(impr), fmt_num(clicks), ctr, cpc, conv_str])
        # Totals
        t_spend = sum(d["spend"] for d in data_dict.values())
        t_impr = sum(d["impressions"] for d in data_dict.values())
        t_clicks = sum(d["clicks"] for d in data_dict.values())
        t_conv = sum(d["conversions_google"] for d in data_dict.values())
        rows.append(["**TOTAL**", f"**{fmt_money(t_spend)}**", f"**{fmt_num(t_impr)}**", f"**{fmt_num(t_clicks)}**",
                      f"**{fmt_ctr(t_clicks, t_impr)}**", f"**{fmt_cpc(t_spend, t_clicks)}**",
                      f"**{fmt_num(int(t_conv))}**" if t_conv else "—"])
        md_table(["", "Spend", "Impr", "Clicks", "CTR", "CPC", "Conv*"], rows)
        lines.append("")

    if "by_platform" in report:
        render_agg_section("📊 By Platform", report["by_platform"])
    if "by_funnel" in report:
        render_agg_section("📊 By Funnel Stage", report["by_funnel"])
    if "by_product" in report:
        render_agg_section("📊 By Product", report["by_product"])
    if "by_region" in report:
        render_agg_section("📊 By Region", report["by_region"])
    if "platform_funnel" in report:
        render_agg_section("📊 Platform × Funnel", report["platform_funnel"])
    if "product_region" in report:
        filtered = {k: v for k, v in report["product_region"].items() if v["spend"] > 0}
        render_agg_section("📊 Product × Region", filtered)

    if "top_campaigns" in report:
        lines.append(f"### 🏆 Top {len(report['top_campaigns'])} Campaigns")
        lines.append("")
        rows = []
        for i, c in enumerate(report["top_campaigns"], 1):
            plat = platform_emoji(c["platform"])
            ctr = fmt_ctr(c["clicks"], c["impressions"])
            cpc = fmt_cpc(c["spend"], c["clicks"])
            rows.append([f"{i}", f"{plat} {c['name'][:40]}", fmt_money(c["spend"]), fmt_num(c["clicks"]), ctr, cpc])
        md_table(["#", "Campaign", "Spend", "Clicks", "CTR", "CPC"], rows)
        lines.append("")

    if "efficiency" in report:
        lines.append("### ⚡ Efficiency Metrics")
        lines.append("")
        for section_name, items in [("**By Product**", report["efficiency"]["by_product"]), ("**By Funnel**", report["efficiency"]["by_funnel"])]:
            if not items:
                continue
            lines.append(section_name)
            lines.append("")
            rows = []
            for item in sorted(items, key=lambda x: x["cpc"] if x["cpc"] else 999):
                cpconv = fmt_money(item["cost_per_conv"]) if item["cost_per_conv"] else "—"
                rows.append([item["name"], fmt_money(item["spend"]), fmt_pct(item["ctr"]), fmt_money(item["cpc"]), cpconv])
            md_table(["", "Spend", "CTR", "CPC", "Cost/Conv"], rows)
            lines.append("")

    lines.append("---")
    lines.append("_*Conv = Google Ads only (pixel + offline SF). LinkedIn/StackAdapt: ABM platforms — attribution via domain matching (see Pipeline page)._")
    if any(c.get("_lifetime_only") for c in report.get("top_campaigns", [])):
        lines.append("_StackAdapt: lifetime data only — no date-range API._")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════
# JSON FORMAT
# ═══════════════════════════════════════════════════════

def render_json(report: dict) -> str:
    """Make report JSON-serializable (convert sets to lists)."""
    def clean(obj):
        if isinstance(obj, dict):
            return {k: clean(v) for k, v in obj.items()}
        if isinstance(obj, set):
            return list(obj)
        if isinstance(obj, list):
            return [clean(i) for i in obj]
        return obj
    return json.dumps(clean(report), indent=2)


# ═══════════════════════════════════════════════════════
# TELEGRAM POSTING
# ═══════════════════════════════════════════════════════

def send_to_telegram(text: str):
    """Post report to Telegram Agent Reports topic."""
    bot_token = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
    chat_id = "-1003786506284"
    thread_id = 132

    # Telegram has 4096 char limit per message — split if needed
    chunks = []
    if len(text) <= 4000:
        chunks = [text]
    else:
        # Split by sections (double newline)
        current = ""
        for part in text.split("\n\n"):
            if len(current) + len(part) + 2 > 4000:
                if current:
                    chunks.append(current)
                current = part
            else:
                current = current + "\n\n" + part if current else part
        if current:
            chunks.append(current)

    for chunk in chunks:
        payload = json.dumps({
            "chat_id": chat_id,
            "message_thread_id": thread_id,
            "text": chunk,
            "parse_mode": "Markdown",
        }).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req) as resp:
                result = json.loads(resp.read())
                if not result.get("ok"):
                    print(f"⚠️  Telegram error: {result}", file=sys.stderr)
        except Exception as e:
            print(f"⚠️  Telegram send failed: {e}", file=sys.stderr)


# ═══════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Spend & Budget Report Agent")
    parser.add_argument("--from", dest="date_from", required=True, help="Start date YYYY-MM-DD")
    parser.add_argument("--to", dest="date_to", required=True, help="End date YYYY-MM-DD")
    parser.add_argument("--platform", default="all", choices=["google_ads", "linkedin", "stackadapt", "reddit", "all"])
    parser.add_argument("--format", dest="fmt", default="terminal", choices=["terminal", "markdown", "json"])
    parser.add_argument("--sections", default="all", help="Comma-separated: all,summary,platform,funnel,product,region,platform_funnel,product_region,top,efficiency")
    parser.add_argument("--top", type=int, default=20, help="Number of top campaigns to show")
    parser.add_argument("--telegram", action="store_true", help="Post condensed report to Telegram")
    args = parser.parse_args()

    sections = [s.strip() for s in args.sections.split(",")]

    # Load knowledge context for product/brand awareness
    knowledge_context = ""
    try:
        from lib.knowledge import load_knowledge_for_agent
        knowledge_context = load_knowledge_for_agent("spend_report")
        if knowledge_context:
            print(f"📚 Knowledge loaded ({len(knowledge_context)} chars)", file=sys.stderr)
    except ImportError:
        pass
    # Note: knowledge_context available for future AI-powered report insights

    print(f"📊 Collecting data from {args.date_from} to {args.date_to}...", file=sys.stderr)
    campaigns = collect_data(args.date_from, args.date_to, args.platform)
    print(f"📊 Found {len(campaigns)} campaigns", file=sys.stderr)

    report = generate_report(campaigns, args.date_from, args.date_to, sections, args.top)

    if args.fmt == "terminal":
        output = render_terminal(report)
    elif args.fmt == "markdown":
        output = render_markdown(report)
    elif args.fmt == "json":
        output = render_json(report)
    else:
        output = render_terminal(report)

    print(output)

    if args.telegram:
        print("\n📨 Sending condensed report to Telegram...", file=sys.stderr)
        tg_text = render_markdown(report, condensed=True)
        send_to_telegram(tg_text)
        print("✅ Sent to Telegram", file=sys.stderr)


if __name__ == "__main__":
    main()
