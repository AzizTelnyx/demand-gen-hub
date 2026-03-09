#!/usr/bin/env python3
"""
Budget Pacing Agent
===================
Daily autonomous agent that monitors spend against the $140K monthly cap,
flags budget-limited campaigns, detects pacing issues and anomalies,
and recommends rebalancing within the budget envelope.

Run: python scripts/budget-pacing-agent.py [--dry-run]
Cron: daily at 7 AM PST via OpenClaw gateway
"""

import json
import os
import sys
import argparse
import urllib.request
from datetime import datetime, timezone, timedelta
from calendar import monthrange

# Add scripts/ to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from platforms import get_connector

# ─── Config ───────────────────────────────────────────

KNOWLEDGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "knowledge")
DB_URL = os.environ.get("POSTGRES_URL_NON_POOLING") or os.environ.get("POSTGRES_PRISMA_URL", "postgresql://localhost:5432/dghub")
if "localhost" in DB_URL or "127.0.0.1" in DB_URL:
    DB_URL = DB_URL.split("?")[0]

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo")
TELEGRAM_CHAT_ID = "-1003786506284"
TELEGRAM_THREAD_ID = 164  # Agent Activity topic

LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/budget-pacing")
os.makedirs(LOG_DIR, exist_ok=True)


def load_config():
    path = os.path.join(KNOWLEDGE_DIR, "budget-config.json")
    with open(path) as f:
        return json.load(f)


def load_platform_allocations() -> dict:
    """Load per-platform budget allocations for the current month from BudgetAllocation table."""
    now = datetime.now()
    try:
        import psycopg2
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute(
            'SELECT platform, planned, actual, notes FROM "BudgetAllocation" WHERE year = %s AND month = %s',
            (now.year, now.month)
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return {row[0]: {"planned": row[1], "actual": row[2] or 0, "notes": row[3] or ""} for row in rows}
    except Exception as e:
        print(f"  Warning: Could not load platform allocations: {e}", file=sys.stderr)
        return {}


def is_excluded(name: str, patterns: list[str]) -> bool:
    name_lower = name.lower()
    return any(p.lower() in name_lower for p in patterns)


# ─── Check 1: Cap Tracker ─────────────────────────────

def check_cap(config: dict) -> dict:
    """Track MTD spend vs monthly cap across all platforms."""
    now = datetime.now()
    month_start = now.strftime("%Y-%m-01")
    today = now.strftime("%Y-%m-%d")
    days_elapsed = now.day
    days_in_month = monthrange(now.year, now.month)[1]
    days_remaining = days_in_month - days_elapsed

    cap = config["monthlyCap"]
    exclude = config["excludePatterns"]
    platforms = config["platforms"]
    reddit_daily = config.get("redditEstimateDailySpend", 183)

    platform_spend = {}
    for slug in platforms:
        try:
            conn = get_connector(slug)
            result = conn.query_metrics(month_start, today, active_only=False)
            # Sum spend excluding ClawdTalk
            spend = sum(
                c.spend for c in result.campaigns
                if not is_excluded(c.name, exclude)
            )
            platform_spend[slug] = round(spend, 2)
        except Exception as e:
            platform_spend[slug] = 0
            print(f"  Warning: {slug} query failed: {e}", file=sys.stderr)

    # Reddit: try live API, fall back to estimate
    try:
        reddit_conn = get_connector("reddit")
        reddit_result = reddit_conn.query_metrics(month_start, today, active_only=False)
        reddit_spend = sum(
            c.spend for c in reddit_result.campaigns
            if not is_excluded(c.name, exclude)
        )
        if reddit_spend > 0:
            platform_spend["reddit"] = round(reddit_spend, 2)
        else:
            platform_spend["reddit"] = round(reddit_daily * days_elapsed, 2)
    except Exception:
        reddit_spend = round(reddit_daily * days_elapsed, 2)
        platform_spend["reddit"] = reddit_spend

    mtd_spend = sum(platform_spend.values())
    daily_rate = mtd_spend / max(days_elapsed, 1)
    projected = daily_rate * days_in_month
    headroom = cap - projected
    days_until_cap = (cap - mtd_spend) / daily_rate if daily_rate > 0 else 999
    utilization = projected / cap

    thresholds = config["alertThresholds"]
    if utilization >= thresholds["capCritical"]:
        level = "critical"
    elif utilization >= thresholds["capWarning"]:
        level = "warning"
    else:
        level = "healthy"

    return {
        "cap": cap,
        "mtdSpend": round(mtd_spend, 2),
        "dailyRate": round(daily_rate, 2),
        "projected": round(projected, 2),
        "headroom": round(headroom, 2),
        "daysElapsed": days_elapsed,
        "daysInMonth": days_in_month,
        "daysRemaining": days_remaining,
        "daysUntilCap": round(days_until_cap, 1),
        "utilization": round(utilization, 4),
        "level": level,
        "platformSpend": platform_spend,
    }


# ─── Check 2: Budget-Limited Campaigns ────────────────

def check_budget_limited(config: dict) -> list[dict]:
    """Find Google Ads Search campaigns losing impression share to budget."""
    now = datetime.now()
    date_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    date_to = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    thresholds = config["alertThresholds"]
    min_lost = thresholds["budgetLostMin"]
    min_spend = thresholds["budgetLostCampaignMinSpend"]

    try:
        g = get_connector("google_ads")
        ga = g._service()

        query = f"""
            SELECT campaign.name, campaign.id,
                   campaign_budget.amount_micros,
                   metrics.search_budget_lost_impression_share,
                   metrics.search_impression_share,
                   metrics.cost_micros, metrics.clicks, metrics.impressions,
                   metrics.all_conversions
            FROM campaign
            WHERE campaign.status = 'ENABLED'
            AND segments.date >= '{date_from}' AND segments.date <= '{date_to}'
            AND campaign.advertising_channel_type = 'SEARCH'
            ORDER BY metrics.search_budget_lost_impression_share DESC
        """

        results = []
        for row in ga.search(customer_id=g._customer_id, query=query):
            lost = row.metrics.search_budget_lost_impression_share or 0
            spend = row.metrics.cost_micros / 1_000_000
            if lost < min_lost or spend < min_spend:
                continue

            impression_share = row.metrics.search_impression_share or 0
            daily_budget = row.campaign_budget.amount_micros / 1_000_000 if row.campaign_budget.amount_micros else 0
            daily_spend = spend / 7

            # Estimate additional daily spend needed
            # If you're capturing (1-lost) of available IS, to capture the lost portion:
            # additional = current_spend * (lost / (1 - lost))
            additional = daily_spend * (lost / max(1 - lost, 0.01))

            severity = "critical" if lost > 0.50 else "high" if lost > 0.25 else "moderate"

            results.append({
                "name": row.campaign.name,
                "campaignId": str(row.campaign.id),
                "dailyBudget": round(daily_budget, 0),
                "dailySpend": round(daily_spend, 0),
                "impressionShare": round(impression_share * 100, 1),
                "lostToBudget": round(lost * 100, 1),
                "spend7d": round(spend, 2),
                "clicks7d": row.metrics.impressions,
                "conversions7d": round(row.metrics.all_conversions, 1),
                "additionalDailyNeeded": round(additional, 0),
                "severity": severity,
            })

        results.sort(key=lambda x: x["lostToBudget"], reverse=True)
        return results
    except Exception as e:
        print(f"  Warning: budget-limited check failed: {e}", file=sys.stderr)
        return []


# ─── Check 3: Pacing & Anomalies ─────────────────────

def check_pacing(config: dict) -> dict:
    """Check Google Ads campaign pacing vs daily budgets + spend anomalies."""
    now = datetime.now()
    # Last 7 days
    period1_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    period1_to = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    # Prior 7 days
    period2_from = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    period2_to = (now - timedelta(days=8)).strftime("%Y-%m-%d")

    thresholds = config["alertThresholds"]
    exclude = config["excludePatterns"]

    try:
        g = get_connector("google_ads")

        # Get budgets
        camps = g.fetch_campaigns(active_only=True)
        budget_map = {c.external_id: c.budget for c in camps if c.budget}

        # Get last 7d metrics
        r1 = g.query_metrics(period1_from, period1_to, active_only=True)
        # Get prior 7d metrics
        r2 = g.query_metrics(period2_from, period2_to, active_only=True)

        spend_map_prior = {c.campaign_id: c.spend for c in r2.campaigns}

        underpacing = []
        overpacing = []
        anomalies = []

        for c in r1.campaigns:
            if is_excluded(c.name, exclude):
                continue

            daily_spend = c.spend / 7
            daily_budget = budget_map.get(c.campaign_id, 0)

            # Pacing check — only flag if campaign actually spent something (skip zombies)
            if daily_budget > 0 and c.spend > 10:
                pacing = daily_spend / daily_budget
                if pacing < thresholds["underpacingMin"]:
                    underpacing.append({
                        "name": c.name,
                        "campaignId": c.campaign_id,
                        "dailySpend": round(daily_spend, 0),
                        "dailyBudget": round(daily_budget, 0),
                        "pacing": round(pacing * 100, 1),
                        "wastedBudget": round((daily_budget - daily_spend), 0),
                    })
                elif pacing > thresholds["overpacingMax"]:
                    overpacing.append({
                        "name": c.name,
                        "campaignId": c.campaign_id,
                        "dailySpend": round(daily_spend, 0),
                        "dailyBudget": round(daily_budget, 0),
                        "pacing": round(pacing * 100, 1),
                    })

            # Anomaly check (vs prior 7d)
            prior_spend = spend_map_prior.get(c.campaign_id, 0)
            if prior_spend > 50:  # Only flag if prior period had meaningful spend
                change = (c.spend - prior_spend) / prior_spend
                if abs(change) > thresholds["anomalyChangePercent"]:
                    anomalies.append({
                        "name": c.name,
                        "campaignId": c.campaign_id,
                        "currentSpend": round(c.spend, 2),
                        "priorSpend": round(prior_spend, 2),
                        "changePercent": round(change * 100, 1),
                        "direction": "up" if change > 0 else "down",
                    })

        underpacing.sort(key=lambda x: x["pacing"])
        anomalies.sort(key=lambda x: abs(x["changePercent"]), reverse=True)

        return {
            "underpacing": underpacing,
            "overpacing": overpacing,
            "anomalies": anomalies,
        }
    except Exception as e:
        print(f"  Warning: pacing check failed: {e}", file=sys.stderr)
        return {"underpacing": [], "overpacing": [], "anomalies": []}


# ─── Recommendations ─────────────────────────────────

def generate_recommendations(cap_data: dict, budget_limited: list, pacing: dict) -> list[dict]:
    """Generate rebalancing recommendations within the budget envelope."""
    recs = []
    headroom_daily = cap_data["headroom"] / max(cap_data["daysRemaining"], 1)

    # Calculate total wasted daily budget from underpacing campaigns
    total_wasted = sum(c["wastedBudget"] for c in pacing["underpacing"])

    # Calculate total additional needed for budget-limited
    total_needed = sum(c["additionalDailyNeeded"] for c in budget_limited if c["severity"] in ("critical", "high"))

    available = total_wasted + max(headroom_daily, 0)

    if total_needed > 0 and available > 0:
        # Recommend rebalancing
        if total_wasted > 0:
            recs.append({
                "type": "rebalance",
                "summary": f"Cut ${total_wasted:.0f}/day from {len(pacing['underpacing'])} underpacing campaigns → fund budget-limited campaigns",
                "sources": [{"name": c["name"], "cut": c["wastedBudget"], "currentBudget": c["dailyBudget"], "pacing": c["pacing"]} for c in pacing["underpacing"]],
                "targets": [{"name": c["name"], "need": c["additionalDailyNeeded"], "lostIS": c["lostToBudget"]} for c in budget_limited if c["severity"] in ("critical", "high")][:5],
                "dailyImpact": min(total_wasted, total_needed),
                "monthlyImpact": min(total_wasted, total_needed) * cap_data["daysRemaining"],
                "withinCap": True,
            })

        if headroom_daily > 10 and total_needed > total_wasted:
            remaining_need = total_needed - total_wasted
            increase = min(remaining_need, headroom_daily)
            recs.append({
                "type": "increase",
                "summary": f"${increase:.0f}/day available from cap headroom for budget-limited campaigns",
                "dailyImpact": round(increase, 0),
                "monthlyImpact": round(increase * cap_data["daysRemaining"], 0),
                "withinCap": True,
            })

    if cap_data["level"] == "critical":
        recs.append({
            "type": "overspend_risk",
            "summary": f"Projected ${cap_data['projected']:,.0f} exceeds ${cap_data['cap']:,.0f} cap by ${-cap_data['headroom']:,.0f}. Reduce daily spend by ${-cap_data['headroom'] / max(cap_data['daysRemaining'], 1):.0f}/day.",
        })

    return recs


# ─── Format Telegram Message ─────────────────────────

def format_telegram(cap_data: dict, budget_limited: list, pacing: dict, recs: list, platform_pacing: dict = None) -> str:
    lines = []
    now = datetime.now()

    # Cap summary
    level_icon = "🟢" if cap_data["level"] == "healthy" else "🟡" if cap_data["level"] == "warning" else "🔴"
    lines.append(f"📊 Budget Pacing — {now.strftime('%b %-d')}")
    lines.append("")

    # Early month warning
    if cap_data["daysElapsed"] < 5:
        lines.append(f"⚠️ Early month — only {cap_data['daysElapsed']} day(s) of data. Projections will stabilize by day 5.")
        lines.append("")

    lines.append(f"Cap: ${cap_data['cap']:,} | MTD: ${cap_data['mtdSpend']:,.0f} (day {cap_data['daysElapsed']})")
    lines.append(f"Run rate: ${cap_data['dailyRate']:,.0f}/day → projected ${cap_data['projected']:,.0f} {level_icon}")

    # Platform breakdown
    ps = cap_data["platformSpend"]
    breakdown = " · ".join(f"{k}: ${v:,.0f}" for k, v in sorted(ps.items(), key=lambda x: -x[1]))
    lines.append(f"Split: {breakdown}")

    # Per-platform allocation pacing
    if platform_pacing:
        flagged = {k: v for k, v in platform_pacing.items() if v["status"] != "on_track"}
        if flagged:
            lines.append("")
            lines.append("📋 Platform Allocation Pacing:")
            for slug, pp in platform_pacing.items():
                icon = "🔴" if pp["status"] == "overpacing" else "🟡" if pp["status"] == "underpacing" else "🟢"
                lines.append(f"  {icon} {slug}: ${pp['mtdSpend']:,.0f} / ${pp['planned']:,.0f} ({pp['pacePct']:.0f}%)")

    if cap_data["headroom"] >= 0:
        lines.append(f"Headroom: ${cap_data['headroom']:,.0f} ({cap_data['daysRemaining']}d left)")
    else:
        lines.append(f"⚠️ Over cap by ${-cap_data['headroom']:,.0f} projected")

    # Budget-limited
    critical = [c for c in budget_limited if c["severity"] == "critical"]
    high = [c for c in budget_limited if c["severity"] == "high"]
    if critical or high:
        lines.append("")
        lines.append(f"🔴 Budget-Limited ({len(critical)} critical, {len(high)} high):")
        for c in (critical + high)[:6]:
            lines.append(f"• {c['name'][:45]} — {c['lostToBudget']:.0f}% IS lost, ${c['dailyBudget']:.0f}/day")

    # Underpacing
    if pacing["underpacing"]:
        lines.append("")
        lines.append(f"⚠️ Underpacing ({len(pacing['underpacing'])}):")
        for c in pacing["underpacing"][:5]:
            lines.append(f"• {c['name'][:45]} — {c['pacing']:.0f}% (${c['dailySpend']:.0f}/${c['dailyBudget']:.0f})")

    # Anomalies
    if pacing["anomalies"]:
        lines.append("")
        lines.append(f"📈 Spend Changes ({len(pacing['anomalies'])}):")
        for c in pacing["anomalies"][:5]:
            arrow = "↑" if c["direction"] == "up" else "↓"
            lines.append(f"• {c['name'][:45]} — {arrow}{abs(c['changePercent']):.0f}% (${c['priorSpend']:,.0f}→${c['currentSpend']:,.0f})")

    # Recommendations
    if recs:
        lines.append("")
        lines.append("💡 Recommendations:")
        for r in recs:
            lines.append(f"• {r['summary']}")

    return "\n".join(lines)


# ─── Telegram Notification ────────────────────────────

def notify_telegram(message: str):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "message_thread_id": TELEGRAM_THREAD_ID,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10)
        print("  Telegram notification sent")
    except Exception as e:
        print(f"  Telegram notification failed: {e}", file=sys.stderr)


# ─── DB Logging ───────────────────────────────────────

def log_to_db(output: dict, dry_run: bool = False):
    if dry_run:
        return
    try:
        import psycopg2
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()

        # Ensure agent exists
        cur.execute("""
            INSERT INTO "Agent" (id, slug, name, description, model, enabled, "createdAt")
            VALUES (gen_random_uuid(), 'budget-pacing', 'Budget Pacing', 'Daily budget cap tracking, pacing analysis, and rebalancing recommendations', 'platform-apis', true, NOW())
            ON CONFLICT (slug) DO NOTHING
        """)
        cur.execute("""SELECT id FROM "Agent" WHERE slug = 'budget-pacing'""")
        agent_id = cur.fetchone()[0]

        # Log the run
        findings_count = (
            len(output.get("budgetLimited", [])) +
            len(output.get("pacing", {}).get("underpacing", [])) +
            len(output.get("pacing", {}).get("anomalies", []))
        )
        recs_count = len(output.get("recommendations", []))

        cur.execute("""
            INSERT INTO "AgentRun" (id, "agentId", status, output, "findingsCount", "recsCount", "startedAt", "completedAt", "createdAt")
            VALUES (gen_random_uuid(), %s, 'done', %s, %s, %s, NOW(), NOW(), NOW())
        """, (agent_id, json.dumps(output), findings_count, recs_count))

        conn.commit()
        cur.close()
        conn.close()
        print("  Run logged to DB")
    except Exception as e:
        print(f"  DB logging failed: {e}", file=sys.stderr)


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Budget Pacing Agent")
    parser.add_argument("--dry-run", action="store_true", help="Print output without sending notifications or logging")
    args = parser.parse_args()

    print(f"Budget Pacing Agent — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    # Load knowledge context for product/brand awareness
    knowledge_context = ""
    try:
        from lib.knowledge import load_knowledge_for_agent
        knowledge_context = load_knowledge_for_agent("budget_pacing")
        if knowledge_context:
            print(f"  Knowledge loaded ({len(knowledge_context)} chars)")
    except ImportError:
        pass
    # Note: knowledge_context available for future AI-powered recommendations

    config = load_config()
    print(f"  Cap: ${config['monthlyCap']:,}")
    print(f"  Platforms: {config['platforms']}")

    # Check 1: Cap
    print("\n[1/3] Cap tracker...")
    cap_data = check_cap(config)
    print(f"  MTD: ${cap_data['mtdSpend']:,.0f} | Rate: ${cap_data['dailyRate']:,.0f}/day | Projected: ${cap_data['projected']:,.0f} | Level: {cap_data['level']}")

    # Check 1b: Per-platform allocation pacing
    print("\n[1b] Per-platform allocation pacing...")
    platform_allocations = load_platform_allocations()
    platform_pacing = {}
    if platform_allocations:
        days_in_month = cap_data["daysInMonth"]
        days_elapsed = cap_data["daysElapsed"]
        for slug, alloc in platform_allocations.items():
            mtd_spend = cap_data["platformSpend"].get(slug, 0)
            planned = alloc["planned"]
            if planned > 0:
                expected_pace = (planned / days_in_month) * days_elapsed
                pace_pct = (mtd_spend / expected_pace * 100) if expected_pace > 0 else 0
                status = "on_track"
                if pace_pct > 115:
                    status = "overpacing"
                elif pace_pct < 85:
                    status = "underpacing"
                platform_pacing[slug] = {
                    "planned": planned,
                    "mtdSpend": round(mtd_spend, 2),
                    "expectedPace": round(expected_pace, 2),
                    "pacePct": round(pace_pct, 1),
                    "status": status,
                }
                icon = "🔴" if status == "overpacing" else "🟡" if status == "underpacing" else "🟢"
                print(f"  {icon} {slug}: ${mtd_spend:,.0f} / ${planned:,.0f} ({pace_pct:.0f}% of expected pace) — {status}")
    else:
        print("  No platform allocations found, skipping per-platform pacing")

    # Check 2: Budget-limited
    print("\n[2/3] Budget-limited campaigns...")
    budget_limited = check_budget_limited(config)
    critical = len([c for c in budget_limited if c["severity"] == "critical"])
    high = len([c for c in budget_limited if c["severity"] == "high"])
    print(f"  Found {len(budget_limited)} budget-limited campaigns ({critical} critical, {high} high)")

    # Check 3: Pacing
    print("\n[3/3] Pacing & anomalies...")
    pacing = check_pacing(config)
    print(f"  Underpacing: {len(pacing['underpacing'])} | Overpacing: {len(pacing['overpacing'])} | Anomalies: {len(pacing['anomalies'])}")

    # Recommendations
    recs = generate_recommendations(cap_data, budget_limited, pacing)
    print(f"\n  Recommendations: {len(recs)}")

    # Build output
    output = {
        "summary": f"MTD ${cap_data['mtdSpend']:,.0f} / ${cap_data['cap']:,} cap ({cap_data['level']}). {len(budget_limited)} budget-limited, {len(pacing['underpacing'])} underpacing, {len(pacing['anomalies'])} anomalies.",
        "cap": cap_data,
        "budgetLimited": budget_limited,
        "pacing": pacing,
        "recommendations": recs,
        "platformPacing": platform_pacing,
    }

    # Format message
    message = format_telegram(cap_data, budget_limited, pacing, recs, platform_pacing)

    print("\n" + "=" * 50)
    print(message)
    print("=" * 50)

    if args.dry_run:
        print("\n[DRY RUN] Skipping notifications and DB logging")
    else:
        notify_telegram(message)
        log_to_db(output)

    # Save log
    log_path = os.path.join(LOG_DIR, f"{datetime.now().strftime('%Y-%m-%d')}.json")
    with open(log_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n  Log saved to {log_path}")


if __name__ == "__main__":
    main()
