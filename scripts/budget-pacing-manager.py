#!/usr/bin/env python3
"""
Budget & Pacing Manager (replaces budget-pacing-agent.py)
=========================================================
Multi-platform budget pacing with auto-adjustments and Telegram approvals.

Level 3 (auto): Adjust daily budget ±15% (max $50/day Google, $25 others),
  pause underspending campaigns <$1K/mo after 14 days at <30% pace.
Level 2 (approval): Budget increases >15% or >$50/day, cross-campaign
  reallocation, flight date changes, pause campaigns >$1K/mo.

Run: python scripts/budget-pacing-manager.py [--dry-run]
"""

import json, os, sys, argparse, urllib.request, uuid
from datetime import datetime, timezone, timedelta
from calendar import monthrange
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from platforms import get_connector

# ─── Config ───────────────────────────────────────────

DB_URL = "postgresql://localhost:5432/dghub"
TELEGRAM_BOT_TOKEN = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
TELEGRAM_CHAT_ID = "-1003786506284"
TELEGRAM_THREAD_ID = 164
LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/budget-pacing-manager")
KNOWLEDGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "knowledge")

MONTHLY_CAP = 140_000
PLATFORMS = ["google_ads", "linkedin", "stackadapt", "reddit"]
EXCLUDE_PATTERNS = ["clawdtalk", "clawd talk"]

# Guardrail constants
MAX_AUTO_ACTIONS_PER_CAMPAIGN = 3
MIN_CAMPAIGN_AGE_DAYS = 7
MIN_CAMPAIGN_SPEND = 200
MAX_BUDGET_CHANGE_PCT_AUTO = 0.15
MAX_DAILY_CHANGE_GOOGLE = 50
MAX_DAILY_CHANGE_OTHER = 25
UNDERPACE_THRESHOLD = 0.30  # <30% paced
UNDERPACE_DAYS = 14
UNDERPACE_AUTO_MAX_MONTHLY = 1000  # Auto-pause only if <$1K/mo
CPA_SPIKE_FREEZE_PCT = 0.50

AGENT_SLUG = "budget-pacing-manager"
AGENT_NAME = "Budget & Pacing Manager"


# ─── Helpers ──────────────────────────────────────────

def _uid():
    return str(uuid.uuid4())[:25].replace("-", "")


def is_excluded(name):
    nl = name.lower()
    return any(p.lower() in nl for p in EXCLUDE_PATTERNS)


def get_db():
    import psycopg2
    return psycopg2.connect(DB_URL)


def ensure_agent(cur):
    cur.execute('SELECT id FROM "Agent" WHERE slug = %s', (AGENT_SLUG,))
    row = cur.fetchone()
    if row:
        return row[0]
    aid = _uid()
    cur.execute(
        'INSERT INTO "Agent" (id, slug, name, description, model, enabled, "createdAt") '
        "VALUES (%s, %s, %s, %s, 'python-script', true, NOW()) RETURNING id",
        (aid, AGENT_SLUG, AGENT_NAME, "Multi-platform budget pacing with auto-adjustments"),
    )
    return cur.fetchone()[0]


def log_campaign_change(cur, campaign_name, platform, change_type, description, old_val, new_val, campaign_id=None):
    cur.execute(
        'INSERT INTO "CampaignChange" (id, "campaignId", "campaignName", platform, "changeType", description, "oldValue", "newValue", source, actor, timestamp, "createdAt") '
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'agent', %s, NOW(), NOW())",
        (_uid(), campaign_id, campaign_name, platform, change_type, description, old_val, new_val, AGENT_SLUG),
    )


def get_auto_action_count_today(cur, campaign_id):
    cur.execute(
        'SELECT COUNT(*) FROM "CampaignChange" WHERE "campaignId" = %s AND source = \'agent\' AND timestamp >= CURRENT_DATE',
        (campaign_id,),
    )
    return cur.fetchone()[0]


def load_budget_allocations():
    now = datetime.now()
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            'SELECT platform, planned FROM "BudgetAllocation" WHERE year = %s AND month = %s',
            (now.year, now.month),
        )
        allocs = {row[0]: row[1] for row in cur.fetchall()}
        cur.close()
        conn.close()
        return allocs
    except Exception as e:
        print(f"  Warning: Could not load allocations: {e}")
        return {}


def load_knowledge_context():
    try:
        from lib.knowledge import load_knowledge_for_agent
        return load_knowledge_for_agent("budget_pacing") or ""
    except ImportError:
        path = os.path.join(KNOWLEDGE_DIR, "telnyx-strategy.md")
        if os.path.exists(path):
            with open(path) as f:
                return f.read()
        return ""


def send_telegram(text, parse_mode="HTML", reply_markup=None):
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "message_thread_id": TELEGRAM_THREAD_ID,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        data=data, headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  Telegram error: {e}")
        return None


def send_approval_card(campaign_name, platform, current_val, proposed_val, change_pct, reason, confidence, action_type, action_id):
    """Send an approval card with inline buttons."""
    icon = "⚠️" if change_pct > 0 else "⏸️"
    title = {
        "budget_increase": "Budget Increase Needed",
        "pause_campaign": "Pause Campaign",
        "reallocation": "Budget Reallocation",
    }.get(action_type, "Action Needed")

    text = (
        f"{icon} <b>{title}</b>\n"
        f"Campaign: {campaign_name}\n"
        f"Platform: {platform}\n"
        f"Current: ${current_val:.0f}/day → Proposed: ${proposed_val:.0f}/day ({change_pct:+.0f}%)\n"
        f"Reason: {reason}\n"
        f"Confidence: {confidence}%"
    )

    reply_markup = json.dumps({
        "inline_keyboard": [[
            {"text": "✅ Approve", "callback_data": f"approve:{AGENT_SLUG}:{action_id}"},
            {"text": "❌ Reject", "callback_data": f"reject:{AGENT_SLUG}:{action_id}"},
        ]]
    })
    return send_telegram(text, reply_markup=reply_markup)


# ─── Data Collection ──────────────────────────────────

def collect_platform_spend():
    """Collect MTD spend from all platforms."""
    now = datetime.now()
    month_start = now.strftime("%Y-%m-01")
    today = now.strftime("%Y-%m-%d")
    results = {}

    for slug in PLATFORMS:
        try:
            conn = get_connector(slug)
            metrics = conn.query_metrics(month_start, today, active_only=False)
            campaigns = []
            total = 0
            for c in metrics.campaigns:
                if not is_excluded(c.name):
                    campaigns.append(c)
                    total += c.spend
            results[slug] = {"spend": total, "campaigns": campaigns, "error": None}
        except Exception as e:
            results[slug] = {"spend": 0, "campaigns": [], "error": str(e)}
            print(f"  {slug}: error — {e}")

    return results


def collect_campaign_budgets():
    """Fetch current daily budgets from platforms that support it."""
    budgets = {}
    for slug in ["google_ads", "linkedin", "reddit"]:
        try:
            conn = get_connector(slug)
            camps = conn.fetch_campaigns(active_only=True)
            for c in camps:
                if c.budget and not is_excluded(c.name):
                    budgets[f"{slug}:{c.external_id}"] = {
                        "platform": slug,
                        "campaign_id": c.external_id,
                        "name": c.name,
                        "daily_budget": c.budget,
                        "budget_type": c.budget_type,
                        "start_date": c.start_date,
                    }
        except Exception as e:
            print(f"  {slug} budget fetch error: {e}")
    return budgets


def get_campaign_age_days(campaign_info):
    """Get campaign age in days from start_date."""
    sd = campaign_info.get("start_date")
    if not sd:
        return 999  # assume old if no date
    try:
        start = datetime.strptime(sd[:10], "%Y-%m-%d")
        return (datetime.now() - start).days
    except (ValueError, TypeError):
        return 999


# ─── Analysis ─────────────────────────────────────────

def analyze_pacing(platform_data, allocations):
    """Analyze per-platform and per-campaign pacing."""
    now = datetime.now()
    days_elapsed = now.day
    days_in_month = monthrange(now.year, now.month)[1]
    days_remaining = days_in_month - days_elapsed

    platform_pacing = {}
    for slug, data in platform_data.items():
        planned = allocations.get(slug, 0)
        mtd = data["spend"]
        if planned > 0:
            expected = (planned / days_in_month) * days_elapsed
            pace_pct = (mtd / expected * 100) if expected > 0 else 0
            daily_rate = mtd / max(days_elapsed, 1)
            projected = daily_rate * days_in_month

            if pace_pct > 115:
                status = "overpacing"
            elif pace_pct < 85:
                status = "underpacing"
            else:
                status = "on_track"

            platform_pacing[slug] = {
                "planned": planned,
                "mtd": round(mtd, 2),
                "daily_rate": round(daily_rate, 2),
                "projected": round(projected, 2),
                "pace_pct": round(pace_pct, 1),
                "status": status,
                "days_remaining": days_remaining,
            }

    return platform_pacing, days_elapsed, days_in_month, days_remaining


def generate_actions(platform_data, budgets, platform_pacing, days_elapsed, days_in_month, days_remaining):
    """Generate auto-actions and approval requests."""
    auto_actions = []
    approval_requests = []

    for key, binfo in budgets.items():
        slug = binfo["platform"]
        cid = binfo["campaign_id"]
        name = binfo["name"]
        daily_budget = binfo["daily_budget"]
        age_days = get_campaign_age_days(binfo)
        monthly_budget = daily_budget * days_in_month

        # Find this campaign's MTD spend
        camp_spend = 0
        for c in platform_data.get(slug, {}).get("campaigns", []):
            if c.campaign_id == cid:
                camp_spend = c.spend
                break

        if camp_spend == 0 and daily_budget == 0:
            continue

        # Campaign pacing
        expected_spend = daily_budget * days_elapsed
        camp_pace = (camp_spend / expected_spend) if expected_spend > 0 else 0

        # Skip young/low-spend campaigns
        if age_days < MIN_CAMPAIGN_AGE_DAYS:
            continue
        if camp_spend < MIN_CAMPAIGN_SPEND and monthly_budget < MIN_CAMPAIGN_SPEND:
            continue

        # Platform-level pacing context
        pp = platform_pacing.get(slug, {})
        platform_status = pp.get("status", "on_track")
        max_daily_change = MAX_DAILY_CHANGE_GOOGLE if slug == "google_ads" else MAX_DAILY_CHANGE_OTHER

        # --- Underspending campaign pause ---
        if camp_pace < UNDERPACE_THRESHOLD and days_elapsed >= UNDERPACE_DAYS:
            reason = f"<{UNDERPACE_THRESHOLD*100:.0f}% paced after {days_elapsed} days ({camp_pace*100:.0f}%)"
            if monthly_budget < UNDERPACE_AUTO_MAX_MONTHLY:
                auto_actions.append({
                    "type": "pause_campaign",
                    "platform": slug,
                    "campaign_id": cid,
                    "campaign_name": name,
                    "old_value": f"${daily_budget:.0f}/day",
                    "new_value": "paused",
                    "reason": reason,
                    "confidence": 85,
                })
            else:
                approval_requests.append({
                    "type": "pause_campaign",
                    "platform": slug,
                    "campaign_id": cid,
                    "campaign_name": name,
                    "old_value": daily_budget,
                    "new_value": 0,
                    "change_pct": -100,
                    "reason": reason,
                    "confidence": 80,
                })
            continue

        # --- Budget adjustments for pacing ---
        if camp_pace < 0.85 and platform_status != "overpacing":
            # Underpacing — consider reducing budget to match reality or just skip
            # Actually: reduce budget so it doesn't waste allocation headroom
            target_daily = camp_spend / max(days_elapsed, 1)
            if target_daily < daily_budget * 0.80:
                new_budget = max(daily_budget * (1 - MAX_BUDGET_CHANGE_PCT_AUTO), target_daily * 1.1)
                new_budget = round(new_budget, 2)
                change = new_budget - daily_budget
                change_pct = (change / daily_budget * 100) if daily_budget > 0 else 0

                if abs(change) <= max_daily_change and abs(change_pct) <= MAX_BUDGET_CHANGE_PCT_AUTO * 100:
                    auto_actions.append({
                        "type": "budget_decrease",
                        "platform": slug,
                        "campaign_id": cid,
                        "campaign_name": name,
                        "old_value": f"${daily_budget:.0f}/day",
                        "new_value": f"${new_budget:.0f}/day",
                        "old_budget": daily_budget,
                        "new_budget": new_budget,
                        "reason": f"Underpacing at {camp_pace*100:.0f}%",
                        "confidence": 80,
                    })

        elif camp_pace > 1.15 and platform_status != "underpacing":
            # Overpacing — this campaign needs more budget or will exhaust early
            ideal_daily = camp_spend / max(days_elapsed, 1) * 1.05  # 5% buffer
            new_budget = min(ideal_daily, daily_budget * (1 + MAX_BUDGET_CHANGE_PCT_AUTO))
            new_budget = round(new_budget, 2)
            change = new_budget - daily_budget
            change_pct = (change / daily_budget * 100) if daily_budget > 0 else 0

            if change > 0:
                if abs(change) <= max_daily_change and change_pct <= MAX_BUDGET_CHANGE_PCT_AUTO * 100:
                    auto_actions.append({
                        "type": "budget_increase",
                        "platform": slug,
                        "campaign_id": cid,
                        "campaign_name": name,
                        "old_value": f"${daily_budget:.0f}/day",
                        "new_value": f"${new_budget:.0f}/day",
                        "old_budget": daily_budget,
                        "new_budget": new_budget,
                        "reason": f"Overpacing at {camp_pace*100:.0f}%, will exhaust {int((1-camp_pace)*days_remaining):.0f} days early" if camp_pace > 1 else f"Pacing {camp_pace*100:.0f}%",
                        "confidence": 82,
                    })
                else:
                    approval_requests.append({
                        "type": "budget_increase",
                        "platform": slug,
                        "campaign_id": cid,
                        "campaign_name": name,
                        "old_value": daily_budget,
                        "new_value": new_budget,
                        "change_pct": change_pct,
                        "reason": f"Overpacing at {camp_pace*100:.0f}%, needs ${change:.0f}/day more",
                        "confidence": 78,
                    })

    return auto_actions, approval_requests


# ─── Execution ────────────────────────────────────────

def execute_actions(auto_actions, dry_run=False):
    """Execute auto-actions via platform connectors."""
    results = []
    conn_cache = {}

    db = get_db()
    cur = db.cursor()

    for action in auto_actions:
        slug = action["platform"]
        cid = action["campaign_id"]

        # Check daily action limit
        count = get_auto_action_count_today(cur, cid)
        if count >= MAX_AUTO_ACTIONS_PER_CAMPAIGN:
            action["skipped"] = True
            action["skip_reason"] = f"Max {MAX_AUTO_ACTIONS_PER_CAMPAIGN} actions/day reached"
            results.append(action)
            continue

        if dry_run:
            action["applied"] = False
            action["dry_run"] = True
            results.append(action)
            continue

        if slug not in conn_cache:
            conn_cache[slug] = get_connector(slug)
        platform_conn = conn_cache[slug]

        success = False
        error = None

        if action["type"] == "pause_campaign":
            wr = platform_conn.pause_campaign(cid)
            success = wr.success
            error = wr.error
        elif action["type"] in ("budget_increase", "budget_decrease"):
            wr = platform_conn.update_budget(cid, action["new_budget"])
            success = wr.success
            error = wr.error

        action["applied"] = success
        action["error"] = error

        if success:
            change_type = "budget_change" if "budget" in action["type"] else "status_change"
            log_campaign_change(
                cur, action["campaign_name"], slug, change_type,
                f"{action['type']}: {action['reason']}",
                action["old_value"], action.get("new_value", ""),
                campaign_id=cid,
            )

        results.append(action)

    db.commit()
    cur.close()
    db.close()
    return results


# ─── Telegram Report ──────────────────────────────────

def send_summary_report(platform_pacing, auto_results, approval_requests, total_mtd, dry_run):
    now = datetime.now()
    lines = [f"🔧 <b>Budget & Pacing Manager</b> — {now.strftime('%b %-d')}"]
    if dry_run:
        lines.append("<i>DRY RUN</i>")

    # Platform pacing
    lines.append("")
    lines.append("📊 <b>Platform Pacing:</b>")
    for slug, pp in sorted(platform_pacing.items()):
        icon = "✅" if pp["status"] == "on_track" else "⚠️"
        display = {"google_ads": "Google", "linkedin": "LinkedIn", "stackadapt": "StackAdapt", "reddit": "Reddit"}.get(slug, slug)
        lines.append(f"  {display}: ${pp['mtd']:,.0f}/${pp['planned']:,.0f}K ({pp['pace_pct']:.0f}%) — {pp['status'].replace('_', ' ')} {icon}")

    lines.append(f"\n  Total MTD: ${total_mtd:,.0f} / ${MONTHLY_CAP:,}")

    # Auto-actions
    applied = [a for a in auto_results if a.get("applied") or a.get("dry_run")]
    skipped = [a for a in auto_results if a.get("skipped")]
    if applied:
        lines.append(f"\n✅ <b>Auto-actions ({len(applied)}):</b>")
        for a in applied:
            prefix = "[DRY RUN] " if a.get("dry_run") else ""
            lines.append(f"  • {prefix}{a['campaign_name'][:45]}: {a['old_value']}→{a.get('new_value', 'paused')} — {a['reason']}")
    if skipped:
        lines.append(f"\n⚠️ Skipped {len(skipped)} (daily limit)")

    # Approvals
    if approval_requests:
        lines.append(f"\n⏳ <b>Need approval ({len(approval_requests)}):</b>")
        lines.append("  [Posted as separate cards below]")

    msg = "\n".join(lines)
    send_telegram(msg)


def send_approval_cards(approval_requests, dry_run):
    if dry_run:
        for a in approval_requests:
            print(f"  [DRY RUN] Would send approval card: {a['campaign_name']} ({a['type']})")
        return

    for a in approval_requests:
        action_id = _uid()
        display = {"google_ads": "Google Ads", "linkedin": "LinkedIn", "stackadapt": "StackAdapt", "reddit": "Reddit"}.get(a["platform"], a["platform"])
        send_approval_card(
            a["campaign_name"], display,
            a["old_value"], a["new_value"], a["change_pct"],
            a["reason"], a["confidence"],
            a["type"], action_id,
        )


# ─── DB Logging ───────────────────────────────────────

def log_run(platform_pacing, auto_results, approval_requests, start_time, dry_run):
    if dry_run:
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        agent_id = ensure_agent(cur)

        output = {
            "platform_pacing": platform_pacing,
            "auto_actions": len(auto_results),
            "approvals_pending": len(approval_requests),
            "applied": len([a for a in auto_results if a.get("applied")]),
        }
        findings = len(auto_results) + len(approval_requests)

        cur.execute(
            'INSERT INTO "AgentRun" (id, "agentId", status, input, output, "findingsCount", "recsCount", "startedAt", "completedAt", "createdAt") '
            "VALUES (%s, %s, 'done', %s, %s, %s, %s, %s, NOW(), NOW())",
            (_uid(), agent_id, json.dumps({"type": "budget-pacing-manager"}),
             json.dumps(output), findings, len(auto_results), start_time),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"  DB logging error: {e}")


# ─── CPA Spike Check ─────────────────────────────────

def check_cpa_spike():
    """Check for >50% CPA spike day-over-day across any platform. Returns True if spike detected."""
    now = datetime.now()
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    day_before = (now - timedelta(days=2)).strftime("%Y-%m-%d")

    for slug in PLATFORMS:
        try:
            conn = get_connector(slug)
            m1 = conn.query_metrics(day_before, day_before, active_only=True)
            m2 = conn.query_metrics(yesterday, yesterday, active_only=True)

            spend1 = sum(c.spend for c in m1.campaigns if not is_excluded(c.name))
            conv1 = sum(c.conversions for c in m1.campaigns if not is_excluded(c.name))
            spend2 = sum(c.spend for c in m2.campaigns if not is_excluded(c.name))
            conv2 = sum(c.conversions for c in m2.campaigns if not is_excluded(c.name))

            if conv1 > 0 and conv2 > 0:
                cpa1 = spend1 / conv1
                cpa2 = spend2 / conv2
                if cpa1 > 0 and (cpa2 - cpa1) / cpa1 > CPA_SPIKE_FREEZE_PCT:
                    return True, slug, cpa1, cpa2
        except Exception:
            continue
    return False, None, None, None


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Budget & Pacing Manager")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    start_time = datetime.now(timezone.utc)
    print(f"🔧 Budget & Pacing Manager — {start_time.strftime('%Y-%m-%d %H:%M UTC')}")
    if args.dry_run:
        print("   ⚠️  DRY RUN — no changes will be applied")
    print()

    # Load knowledge
    print("Loading context...")
    knowledge = load_knowledge_context()
    if knowledge:
        print(f"  Knowledge loaded ({len(knowledge)} chars)")

    # CPA spike check — freeze all actions if spike detected
    print("\nChecking CPA spike...")
    spiked, spike_platform, cpa_old, cpa_new = check_cpa_spike()
    if spiked:
        msg = (
            f"🚨 <b>CPA SPIKE DETECTED — ALL AUTO-ACTIONS FROZEN</b>\n"
            f"Platform: {spike_platform}\n"
            f"CPA: ${cpa_old:.2f} → ${cpa_new:.2f} ({(cpa_new-cpa_old)/cpa_old*100:+.0f}%)\n"
            f"All budget auto-adjustments paused until reviewed."
        )
        if not args.dry_run:
            send_telegram(msg)
        print(f"  🚨 CPA spike on {spike_platform}: ${cpa_old:.2f}→${cpa_new:.2f}. FROZEN.")
        return

    print("  No CPA spike detected")

    # Collect data
    print("\nCollecting platform spend...")
    platform_data = collect_platform_spend()
    total_mtd = sum(d["spend"] for d in platform_data.values())
    for slug, d in platform_data.items():
        status = f"${d['spend']:,.0f}" if not d["error"] else f"error: {d['error']}"
        print(f"  {slug}: {status} ({len(d['campaigns'])} campaigns)")
    print(f"  Total MTD: ${total_mtd:,.0f}")

    print("\nCollecting campaign budgets...")
    budgets = collect_campaign_budgets()
    print(f"  {len(budgets)} campaigns with budgets")

    # Load allocations
    allocations = load_budget_allocations()
    print(f"  Allocations: {allocations}")

    # Analyze pacing
    print("\nAnalyzing pacing...")
    platform_pacing, days_elapsed, days_in_month, days_remaining = analyze_pacing(platform_data, allocations)
    for slug, pp in platform_pacing.items():
        icon = "✅" if pp["status"] == "on_track" else "⚠️"
        print(f"  {slug}: {pp['pace_pct']:.0f}% — {pp['status']} {icon}")

    # Generate actions
    print("\nGenerating actions...")
    auto_actions, approval_requests = generate_actions(
        platform_data, budgets, platform_pacing, days_elapsed, days_in_month, days_remaining
    )
    print(f"  Auto-actions: {len(auto_actions)}")
    print(f"  Approval requests: {len(approval_requests)}")

    # Check total cap before executing
    projected_monthly = total_mtd / max(days_elapsed, 1) * days_in_month
    if projected_monthly > MONTHLY_CAP * 1.05:
        print(f"  ⚠️ Projected ${projected_monthly:,.0f} exceeds cap. Filtering out budget increases.")
        auto_actions = [a for a in auto_actions if a["type"] != "budget_increase"]

    # Execute
    print("\nExecuting auto-actions...")
    auto_results = execute_actions(auto_actions, dry_run=args.dry_run)
    applied = len([a for a in auto_results if a.get("applied")])
    skipped = len([a for a in auto_results if a.get("skipped")])
    print(f"  Applied: {applied}, Skipped: {skipped}")

    if args.verbose:
        for a in auto_results:
            status = "✅" if a.get("applied") else "⏭️ skipped" if a.get("skipped") else "🔸 dry-run"
            print(f"    {status} {a['campaign_name']}: {a['type']} — {a['reason']}")

    # Report
    print("\nSending Telegram report...")
    send_summary_report(platform_pacing, auto_results, approval_requests, total_mtd, args.dry_run)

    print("Sending approval cards...")
    send_approval_cards(approval_requests, args.dry_run)

    # Log
    log_run(platform_pacing, auto_results, approval_requests, start_time, args.dry_run)

    # Save JSON log
    os.makedirs(LOG_DIR, exist_ok=True)
    log_file = os.path.join(LOG_DIR, f"{start_time.strftime('%Y-%m-%d')}.json")
    with open(log_file, "w") as f:
        json.dump({
            "timestamp": start_time.isoformat(),
            "dry_run": args.dry_run,
            "total_mtd": total_mtd,
            "platform_pacing": platform_pacing,
            "auto_actions": [a for a in auto_results],
            "approval_requests": approval_requests,
        }, f, indent=2, default=str)
    print(f"\nLog: {log_file}")
    print(f"Runtime: {(datetime.now(timezone.utc) - start_time).total_seconds():.0f}s")


if __name__ == "__main__":
    main()
