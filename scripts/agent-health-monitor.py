#!/usr/bin/env python3
"""Agent Health Monitor — audits health of all automated agents and data systems."""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

PSQL = "/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"
DB = "dghub"
HUB_DIR = Path(__file__).resolve().parent.parent
KNOWLEDGE_DIR = HUB_DIR / "knowledge"
REPORTS_DIR = HUB_DIR / "reports" / "health"
BOT_TOKEN = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
CHAT_ID = "-1003786506284"
THREAD_ID = 164

# Agent definitions: id -> (name, expected_frequency_hours)
AGENTS = {
    "4be1903f-f321-4b20-b544-245843527958": ("Negative Keyword Agent", 24),
    "c5b69d6a-5449-4a20-841a-9e605364f5a9": ("Ad Copy Review Agent", 24),
    "acce3816-afd4-41ef-aec3-a07c2558fd8e": ("Budget Pacing", 24),
    "16b9a4fc-7078-4d9f-b9e7-1aacec090810": ("Keyword Hygiene Agent", 168),  # weekly
}

# Platform active statuses
ACTIVE_STATUSES = "'enabled', 'live'"


def query(sql: str) -> list[dict]:
    """Run SQL and return list of dicts."""
    result = subprocess.run(
        [PSQL, "-d", DB, "-t", "-A", "-F", "\t", "-c", sql],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"SQL error: {result.stderr.strip()}")
    rows = []
    for line in result.stdout.strip().split("\n"):
        if line:
            rows.append(line.split("\t"))
    return rows


def check_agent_runs() -> dict:
    """Check health of each known agent's runs."""
    now = datetime.now()
    issues = []
    agents = {}

    for agent_id, (name, freq_hours) in AGENTS.items():
        sql = f"""
            SELECT status, "findingsCount", "recsCount", error,
                   "completedAt", "startedAt"
            FROM "AgentRun"
            WHERE "agentId" = '{agent_id}'
            ORDER BY "createdAt" DESC LIMIT 1
        """
        rows = query(sql)
        if not rows:
            issues.append({"level": "critical", "msg": f"{name}: no runs found"})
            agents[name] = {"status": "no_runs", "level": "critical"}
            continue

        row = rows[0]
        status, findings, recs, error, completed, started = row
        findings = int(findings) if findings else 0
        recs = int(recs) if recs else 0

        agent_info = {
            "status": status,
            "findings": findings,
            "recs": recs,
            "lastRun": completed or started,
            "error": error if error else None,
        }

        # Check staleness
        last_time = completed or started
        if last_time:
            try:
                last_dt = datetime.fromisoformat(last_time.replace("Z", "+00:00").replace("+00:00", ""))
            except Exception:
                last_dt = datetime.strptime(last_time[:19], "%Y-%m-%d %H:%M:%S")
            hours_ago = (now - last_dt).total_seconds() / 3600
            agent_info["hoursAgo"] = round(hours_ago, 1)

            if hours_ago > freq_hours * 1.5:
                issues.append({"level": "critical", "msg": f"{name}: last run {hours_ago:.0f}h ago (expected every {freq_hours}h)"})
                agent_info["level"] = "critical"
            elif hours_ago > freq_hours:
                issues.append({"level": "warning", "msg": f"{name}: last run {hours_ago:.0f}h ago (expected every {freq_hours}h)"})
                agent_info["level"] = "warning"

        # Check errors
        if status == "failed" or (error and error.strip()):
            issues.append({"level": "critical", "msg": f"{name}: last run had error: {(error or 'unknown')[:100]}"})
            agent_info["level"] = "critical"

        # Check zero findings (only warn, not critical)
        if status == "completed" and findings == 0:
            issues.append({"level": "info", "msg": f"{name}: last run had 0 findings"})

        if "level" not in agent_info:
            agent_info["level"] = "healthy"

        agents[name] = agent_info

    return {"agents": agents, "issues": issues}


def check_data_freshness() -> dict:
    """Check freshness of synced data."""
    issues = []
    checks = {}
    now_sql = "NOW()"

    # Campaign sync freshness
    rows = query(f"""
        SELECT platform, COUNT(*),
               MIN(EXTRACT(EPOCH FROM (NOW() - "lastSyncedAt"))/3600)::int as min_hours,
               MAX(EXTRACT(EPOCH FROM (NOW() - "lastSyncedAt"))/3600)::int as max_hours
        FROM "Campaign"
        WHERE status IN ({ACTIVE_STATUSES})
        GROUP BY platform ORDER BY platform
    """)
    campaign_sync = {}
    for r in rows:
        platform, count, min_h, max_h = r[0], int(r[1]), int(r[2]) if r[2] else None, int(r[3]) if r[3] else None
        campaign_sync[platform] = {"active": count, "newestSyncH": min_h, "oldestSyncH": max_h}
        if max_h and max_h > 12:
            issues.append({"level": "warning", "msg": f"{platform}: oldest active campaign sync {max_h}h ago"})
    checks["campaignSync"] = campaign_sync

    # Audience freshness
    rows = query(f"""
        SELECT c.platform, COUNT(DISTINCT ca."campaignId"),
               MAX(EXTRACT(EPOCH FROM (NOW() - ca."lastSyncedAt"))/3600)::int
        FROM "CampaignAudience" ca
        JOIN "Campaign" c ON c.id = ca."campaignId"
        WHERE c.status IN ({ACTIVE_STATUSES})
        GROUP BY c.platform ORDER BY c.platform
    """)
    audience_sync = {}
    for r in rows:
        platform, count, max_h = r[0], int(r[1]), int(r[2]) if r[2] else None
        audience_sync[platform] = {"campaignsWithAudience": count, "oldestSyncH": max_h}
        if max_h and max_h > 12:
            issues.append({"level": "warning", "msg": f"{platform} audiences: oldest sync {max_h}h ago"})
    checks["audienceSync"] = audience_sync

    # Active campaigns missing audience data
    rows = query(f"""
        SELECT c.platform, COUNT(*)
        FROM "Campaign" c
        LEFT JOIN "CampaignAudience" ca ON ca."campaignId" = c.id
        WHERE c.status IN ({ACTIVE_STATUSES}) AND ca.id IS NULL
        GROUP BY c.platform ORDER BY c.platform
    """)
    missing_audience = {}
    for r in rows:
        missing_audience[r[0]] = int(r[1])
        if int(r[1]) > 0:
            issues.append({"level": "warning", "msg": f"{r[0]}: {r[1]} active campaigns missing audience data"})
    checks["missingAudience"] = missing_audience

    # Creative sync
    rows = query(f"""
        SELECT c.platform,
               MAX(EXTRACT(EPOCH FROM (NOW() - ac."lastSyncedAt"))/3600)::int
        FROM "AdCreative" ac
        JOIN "Campaign" c ON c.id = ac."campaignId"
        WHERE c.status IN ({ACTIVE_STATUSES})
        GROUP BY c.platform ORDER BY c.platform
    """)
    checks["creativeSync"] = {r[0]: {"oldestSyncH": int(r[1]) if r[1] else None} for r in rows}

    # Impression freshness
    rows = query("""
        SELECT MAX(EXTRACT(EPOCH FROM (NOW() - "lastSyncedAt"))/3600)::int,
               MAX("dateTo")::text
        FROM "AdImpression"
    """)
    if rows and rows[0][0]:
        checks["impressionSync"] = {"oldestSyncH": int(rows[0][0]), "latestDataTo": rows[0][1]}
    else:
        checks["impressionSync"] = {"status": "no_data"}

    # Parsed fields — NULL parsedIntent/parsedProduct on active campaigns
    # BRAND and PARTNER campaigns don't require a product per naming standard
    rows = query(f"""
        SELECT platform, COUNT(*)
        FROM "Campaign"
        WHERE status IN ({ACTIVE_STATUSES})
          AND ("parsedIntent" IS NULL
               OR ("parsedProduct" IS NULL AND "parsedIntent" NOT IN ('BRAND', 'PARTNER')))
        GROUP BY platform ORDER BY platform
    """)
    unparsed = {}
    for r in rows:
        unparsed[r[0]] = int(r[1])
        if int(r[1]) > 0:
            issues.append({"level": "warning", "msg": f"{r[0]}: {r[1]} active campaigns with NULL parsed fields"})
    checks["unparsedCampaigns"] = unparsed

    return {"data": checks, "issues": issues}


def check_knowledge_freshness() -> dict:
    """Check modification dates of knowledge base files."""
    issues = []
    stale_files = []
    now = datetime.now().timestamp()
    threshold = 30 * 86400  # 30 days

    if not KNOWLEDGE_DIR.exists():
        return {"issues": [{"level": "warning", "msg": "Knowledge dir not found"}], "files": []}

    for f in sorted(KNOWLEDGE_DIR.rglob("*.md")):
        mtime = f.stat().st_mtime
        days_old = (now - mtime) / 86400
        rel = str(f.relative_to(KNOWLEDGE_DIR))
        entry = {"file": rel, "daysOld": round(days_old, 1)}
        if days_old > threshold / 86400 * 86400 / 86400:  # > 30 days
            if days_old > 30:
                entry["stale"] = True
                issues.append({"level": "info", "msg": f"Knowledge file {rel}: {days_old:.0f} days old"})
        stale_files.append(entry)

    stale_files.sort(key=lambda x: -x["daysOld"])
    return {"files": stale_files[:20], "staleCount": sum(1 for f in stale_files if f.get("stale")), "issues": issues}


def check_campaign_integrity() -> dict:
    """Check campaign context integrity."""
    issues = []
    checks = {}

    # Serving ended but status enabled
    rows = query(f"""
        SELECT platform, COUNT(*)
        FROM "Campaign"
        WHERE status IN ({ACTIVE_STATUSES})
          AND "servingStatus" IN ('ENDED', 'ended', 'CAMPAIGN_PAUSED', 'NOT_DELIVERING')
        GROUP BY platform ORDER BY platform
    """)
    zombie = {}
    for r in rows:
        zombie[r[0]] = int(r[1])
        if int(r[1]) > 0:
            issues.append({"level": "warning", "msg": f"{r[0]}: {r[1]} campaigns status=active but servingStatus=ended/paused"})
    checks["zombieCampaigns"] = zombie

    # Active campaign counts by platform
    rows = query(f"""
        SELECT platform, COUNT(*)
        FROM "Campaign"
        WHERE status IN ({ACTIVE_STATUSES})
        GROUP BY platform ORDER BY platform
    """)
    checks["activeCounts"] = {r[0]: int(r[1]) for r in rows}

    # Unmatched variants — campaigns with variants not in product-audience-profiles
    profiles_path = KNOWLEDGE_DIR / "product-audience-profiles.md"
    known_profiles = set()
    if profiles_path.exists():
        content = profiles_path.read_text()
        for line in content.split("\n"):
            # Extract profile headers like "### AI Agent + Healthcare" or "### AI Agent (generic)"
            if line.startswith("### ") or line.startswith("## "):
                known_profiles.add(line.strip("#").strip().lower())

    variant_rows = query(f"""
        SELECT name, "parsedProduct", "parsedVariant", platform
        FROM "Campaign"
        WHERE status IN ({ACTIVE_STATUSES})
          AND "parsedVariant" IS NOT NULL
          AND "parsedVariant" != ''
    """)
    unmatched_variants = []
    for r in variant_rows:
        name, product, variant, platform = r[0], r[1], r[2], r[3]
        if not product or not variant:
            continue
        # Check if product + variant combo has a profile
        combo = f"{product} + {variant}".lower()
        generic = f"{product} (generic)".lower()
        if combo not in known_profiles and variant.lower() not in [p.split("+")[-1].strip() for p in known_profiles]:
            unmatched_variants.append({"name": name, "product": product, "variant": variant, "platform": platform})

    if unmatched_variants:
        checks["unmatchedVariants"] = unmatched_variants
        issues.append({"level": "warning", "msg": f"{len(unmatched_variants)} active campaigns have variants without audience profiles"})

    return {"integrity": checks, "issues": issues}


def check_sync_state() -> dict:
    """Check SyncState table for each platform."""
    issues = []
    rows = query("""
        SELECT platform, status, "lastSyncedAt"::text, error
        FROM "SyncState"
        ORDER BY platform
    """)
    syncs = {}
    now = datetime.now()
    for r in rows:
        platform, status, synced_at, error = r[0], r[1], r[2], r[3] if len(r) > 3 else None
        entry = {"status": status, "lastSyncedAt": synced_at}
        if error and error.strip():
            entry["error"] = error[:200]
            issues.append({"level": "warning", "msg": f"SyncState {platform}: error — {error[:100]}"})
        if synced_at and synced_at.strip():
            try:
                sync_dt = datetime.fromisoformat(synced_at.replace("Z", "").split(".")[0])
                hours_ago = (now - sync_dt).total_seconds() / 3600
                entry["hoursAgo"] = round(hours_ago, 1)
                if hours_ago > 12:
                    issues.append({"level": "warning", "msg": f"SyncState {platform}: last sync {hours_ago:.0f}h ago"})
            except Exception:
                pass
        syncs[platform] = entry

    return {"syncs": syncs, "issues": issues}


def health_check(fix: bool = False) -> dict:
    """Run all health checks. Returns full report dict."""
    report = {
        "timestamp": datetime.now().isoformat(),
        "sections": {},
        "allIssues": [],
        "overallLevel": "healthy",
    }

    checks = [
        ("agentRuns", check_agent_runs),
        ("dataFreshness", check_data_freshness),
        ("knowledgeFreshness", check_knowledge_freshness),
        ("campaignIntegrity", check_campaign_integrity),
        ("syncState", check_sync_state),
    ]

    for name, fn in checks:
        try:
            result = fn()
            report["sections"][name] = result
            report["allIssues"].extend(result.get("issues", []))
        except Exception as e:
            report["sections"][name] = {"error": str(e)}
            report["allIssues"].append({"level": "critical", "msg": f"{name} check failed: {e}"})

    # Determine overall level
    levels = [i["level"] for i in report["allIssues"]]
    if "critical" in levels:
        report["overallLevel"] = "critical"
    elif "warning" in levels:
        report["overallLevel"] = "warning"

    # Fix mode
    if fix:
        report["fixes"] = run_fixes(report)

    return report


def run_fixes(report: dict) -> list[str]:
    """Auto-fix simple issues."""
    fixes = []

    # Re-parse campaigns with NULL parsed fields
    unparsed = report.get("sections", {}).get("dataFreshness", {}).get("data", {}).get("unparsedCampaigns", {})
    if any(v > 0 for v in unparsed.values()):
        sync_script = HUB_DIR / "scripts" / "sync_local.py"
        if sync_script.exists():
            try:
                subprocess.run([sys.executable, str(sync_script), "--parse-only"], timeout=120, capture_output=True)
                fixes.append("Triggered campaign name re-parse")
            except Exception as e:
                fixes.append(f"Re-parse failed: {e}")

    # Auto-add audience profiles for known product + new vertical
    unmatched = report.get("sections", {}).get("campaignIntegrity", {}).get("integrity", {}).get("unmatchedVariants", [])
    KNOWN_PRODUCTS = {"AI Agent", "Voice API", "SIP", "SMS", "Numbers", "IoT SIM"}
    # Competitors and sub-brands — don't auto-create profiles for these
    SKIP_VARIANTS = {"Yeastar", "ClawdTalk", "Brand", "MS Teams", "Kaptea"}
    
    profiles_path = KNOWLEDGE_DIR / "product-audience-profiles.md"
    new_profiles = []
    for item in unmatched:
        product = item.get("product", "")
        variant = item.get("variant", "")
        if product in KNOWN_PRODUCTS and variant not in SKIP_VARIANTS:
            combo = f"{product} + {variant}"
            if combo not in [p["combo"] for p in new_profiles]:
                new_profiles.append({"combo": combo, "product": product, "variant": variant})

    if new_profiles and profiles_path.exists():
        with open(profiles_path, "a") as f:
            for p in new_profiles:
                f.write(f"\n\n### {p['combo']}\n")
                f.write(f"- **Job Titles**: [auto-generated — needs review] Directors, VPs, Managers in {p['variant']}\n")
                f.write(f"- **Industries**: {p['variant']}, technology\n")
                f.write(f"- **Note**: Auto-added by health monitor. Review and refine.\n")
        fixes.append(f"Auto-added {len(new_profiles)} audience profiles: {', '.join(p['combo'] for p in new_profiles)}")

    return fixes


def format_summary(report: dict) -> str:
    """Format human-readable summary."""
    lines = []
    level_emoji = {"healthy": "✅", "warning": "⚠️", "critical": "🔴", "info": "ℹ️"}
    overall = report["overallLevel"]
    lines.append(f"{level_emoji.get(overall, '❓')} **Agent Health Monitor** — {overall.upper()}")
    lines.append(f"📅 {report['timestamp'][:16]}")
    lines.append("")

    # Agent runs summary
    agents = report.get("sections", {}).get("agentRuns", {}).get("agents", {})
    if agents:
        lines.append("**🤖 Agent Runs:**")
        for name, info in agents.items():
            emoji = level_emoji.get(info.get("level", "healthy"), "❓")
            hours = info.get("hoursAgo", "?")
            lines.append(f"  {emoji} {name}: {info.get('status', '?')} ({hours}h ago, {info.get('findings', 0)} findings)")
        lines.append("")

    # Sync state
    syncs = report.get("sections", {}).get("syncState", {}).get("syncs", {})
    if syncs:
        lines.append("**🔄 Sync State:**")
        for platform, info in syncs.items():
            emoji = "✅" if info.get("hoursAgo", 999) < 12 else "⚠️"
            lines.append(f"  {emoji} {platform}: {info.get('hoursAgo', '?')}h ago ({info.get('status', '?')})")
        lines.append("")

    # Active campaigns
    counts = report.get("sections", {}).get("campaignIntegrity", {}).get("integrity", {}).get("activeCounts", {})
    if counts:
        total = sum(counts.values())
        lines.append(f"**📊 Active Campaigns:** {total} ({', '.join(f'{p}: {c}' for p, c in counts.items())})")
        lines.append("")

    # Issues
    critical = [i for i in report["allIssues"] if i["level"] == "critical"]
    warnings = [i for i in report["allIssues"] if i["level"] == "warning"]
    if critical:
        lines.append(f"**🔴 Critical ({len(critical)}):**")
        for i in critical:
            lines.append(f"  • {i['msg']}")
        lines.append("")
    if warnings:
        lines.append(f"**⚠️ Warnings ({len(warnings)}):**")
        for i in warnings[:10]:
            lines.append(f"  • {i['msg']}")
        if len(warnings) > 10:
            lines.append(f"  ... and {len(warnings) - 10} more")
        lines.append("")

    # Knowledge staleness
    stale = report.get("sections", {}).get("knowledgeFreshness", {}).get("staleCount", 0)
    if stale:
        lines.append(f"**📚 Knowledge Base:** {stale} files not updated in 30+ days")

    return "\n".join(lines)


def send_telegram(text: str):
    """Send summary to Telegram Agent Activity thread."""
    import urllib.request
    import urllib.parse
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({
        "chat_id": CHAT_ID,
        "message_thread_id": THREAD_ID,
        "text": text,
        "parse_mode": "Markdown",
    }).encode()
    try:
        req = urllib.request.Request(url, data=data)
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"Telegram send failed: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Agent Health Monitor")
    parser.add_argument("--fix", action="store_true", help="Auto-fix simple issues")
    parser.add_argument("--telegram", action="store_true", help="Send summary to Telegram")
    parser.add_argument("--json-only", action="store_true", help="Output only JSON")
    args = parser.parse_args()

    report = health_check(fix=args.fix)

    # Save report
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"{datetime.now().strftime('%Y-%m-%d')}.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    if args.json_only:
        print(json.dumps(report, indent=2, default=str))
    else:
        summary = format_summary(report)
        print(summary)
        print(f"\n📄 Report saved: {report_path}")

    if args.telegram:
        summary = format_summary(report)
        send_telegram(summary)
        print("📨 Sent to Telegram")

    # Exit code
    if report["overallLevel"] == "critical":
        sys.exit(2)
    elif report["overallLevel"] == "warning":
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
