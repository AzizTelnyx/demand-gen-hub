#!/usr/bin/env python3
"""
Audience & Targeting Optimizer
==============================
Manages audience hygiene across LinkedIn, StackAdapt, and Reddit.
Auto-excludes competitors/tech giants, scans domain reports for contamination,
and manages audience segment changes via Telegram approvals.

Level 3 (auto): ABM hygiene — auto-exclude blocked companies/domains,
  alert on contamination detected.
Level 2 (approval): Audience segment changes, targeting updates,
  ABM list updates, geo changes.

Run: python scripts/audience-targeting-optimizer.py [--dry-run] [--weekly]
"""

import json, os, sys, argparse, urllib.request, uuid
from datetime import datetime, timezone, timedelta
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from platforms import get_connector

# ─── Config ───────────────────────────────────────────

DB_URL = "postgresql://localhost:5432/dghub"
TELEGRAM_BOT_TOKEN = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
TELEGRAM_CHAT_ID = "-1003786506284"
TELEGRAM_THREAD_ID = 164
LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/audience-targeting")
KNOWLEDGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "knowledge")

AGENT_SLUG = "audience-targeting-optimizer"
AGENT_NAME = "Audience & Targeting Optimizer"

# Guardrails
MAX_AUTO_ACTIONS_PER_CAMPAIGN = 3
MIN_CAMPAIGN_AGE_DAYS = 7
MIN_CAMPAIGN_SPEND = 200
CPA_SPIKE_FREEZE_PCT = 0.50

# Blocklists
BLOCKED_COMPETITORS = [
    "twilio", "vonage", "bandwidth", "plivo", "five9", "genesys",
    "vapi", "elevenlabs", "retell", "synthflow", "openai", "livekit",
    "sinch", "messagebird",
]

BLOCKED_TECH_GIANTS = [
    "google", "aws", "amazon web services", "microsoft", "meta",
    "apple", "cisco",
]

BLOCKED_EMAIL_DOMAINS = [
    "hotmail.com", "gmail.com", "yahoo.com", "outlook.com",
    "aol.com", "icloud.com", "mail.com",
]

# Combined for matching
ALL_BLOCKED_COMPANIES = BLOCKED_COMPETITORS + BLOCKED_TECH_GIANTS


# ─── Helpers ──────────────────────────────────────────

def _uid():
    return str(uuid.uuid4())[:25].replace("-", "")


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
        (aid, AGENT_SLUG, AGENT_NAME, "Audience hygiene and targeting optimization"),
    )
    return cur.fetchone()[0]


def log_campaign_change(cur, name, platform, change_type, desc, old_val, new_val, campaign_id=None):
    cur.execute(
        'INSERT INTO "CampaignChange" (id, "campaignId", "campaignName", platform, "changeType", description, "oldValue", "newValue", source, actor, timestamp, "createdAt") '
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'agent', %s, NOW(), NOW())",
        (_uid(), campaign_id, name, platform, change_type, desc, old_val, new_val, AGENT_SLUG),
    )


def get_auto_action_count_today(cur, campaign_id):
    cur.execute(
        'SELECT COUNT(*) FROM "CampaignChange" WHERE "campaignId" = %s AND source = \'agent\' AND actor = %s AND timestamp >= CURRENT_DATE',
        (campaign_id, AGENT_SLUG),
    )
    return cur.fetchone()[0]


def send_telegram(text, reply_markup=None):
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "message_thread_id": TELEGRAM_THREAD_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"  Telegram error: {e}")


def load_knowledge_context():
    try:
        from lib.knowledge import load_knowledge_for_agent
        return load_knowledge_for_agent("strategy") or ""
    except ImportError:
        path = os.path.join(KNOWLEDGE_DIR, "telnyx-strategy.md")
        return open(path).read() if os.path.exists(path) else ""


def is_blocked_company(name):
    """Check if a company/domain name matches blocklist."""
    nl = name.lower().strip()
    for blocked in ALL_BLOCKED_COMPANIES:
        if blocked in nl or nl in blocked:
            return True, blocked
    return False, None


def is_blocked_domain(domain):
    """Check if an email domain is blocked."""
    dl = domain.lower().strip()
    for blocked in BLOCKED_EMAIL_DOMAINS:
        if dl == blocked or dl.endswith("." + blocked):
            return True, blocked
    # Also check company domains
    for company in ALL_BLOCKED_COMPANIES:
        # e.g., twilio.com, google.com
        if company.replace(" ", "") in dl:
            return True, company
    return False, None


# ─── StackAdapt Domain Scan ──────────────────────────

def scan_stackadapt_domains():
    """Query StackAdapt B2B domain insights for contamination."""
    print("  Scanning StackAdapt domain data...")
    try:
        sa = get_connector("stackadapt")
        if not sa._token:
            sa.load_credentials()

        # Query campaign delivery with B2B domain breakdown
        # StackAdapt GraphQL: use campaignInsights with B2B_DOMAIN dimension
        now = datetime.now()
        date_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        date_to = (now - timedelta(days=1)).strftime("%Y-%m-%d")

        query = """
        {
          campaignDelivery(
            filterBy: { advertiserIds: [%d] }
            date: { from: "%s", to: "%s" }
            granularity: TOTAL
            dataType: TABLE
            dimensions: [B2B_DOMAIN]
          ) {
            ... on CampaignDeliveryOutcome {
              records { nodes {
                campaign { id name }
                dimensions { b2bDomain }
                metrics { impressionsBigint clicksBigint cost }
              } }
            }
          }
        }
        """ % (sa.ADVERTISER_ID, date_from, date_to)

        data = sa._gql(query, timeout=60)
        nodes = data.get("data", {}).get("campaignDelivery", {}).get("records", {}).get("nodes", [])

        contaminated = []
        for n in nodes:
            domain = (n.get("dimensions", {}).get("b2bDomain") or "").lower()
            if not domain:
                continue

            is_blocked, match = is_blocked_domain(domain)
            if not is_blocked:
                is_blocked, match = is_blocked_company(domain.split(".")[0])

            if is_blocked:
                m = n["metrics"]
                impressions = int(m.get("impressionsBigint", 0) or 0)
                clicks = int(m.get("clicksBigint", 0) or 0)
                spend = float(m.get("cost", 0) or 0)
                if impressions > 0 or clicks > 0:
                    contaminated.append({
                        "platform": "stackadapt",
                        "campaign_id": str(n["campaign"]["id"]),
                        "campaign_name": n["campaign"]["name"],
                        "domain": domain,
                        "matched_blocklist": match,
                        "impressions": impressions,
                        "clicks": clicks,
                        "spend": spend,
                    })

        print(f"    {len(nodes)} domain records, {len(contaminated)} contaminated")
        return contaminated

    except Exception as e:
        print(f"    StackAdapt domain scan error: {e}")
        return []


# ─── Reddit Targeting Scan ────────────────────────────

def scan_reddit_targeting():
    """Scan Reddit ad group targeting for potential issues."""
    print("  Scanning Reddit targeting...")
    try:
        reddit = get_connector("reddit")
        if not reddit._access_token:
            reddit.load_credentials()

        camps = reddit.fetch_campaigns(active_only=True)
        findings = []

        for camp in camps:
            targeting = camp.extra.get("targeting", {})
            communities = targeting.get("communities", [])
            interests = targeting.get("interests", [])

            # Check if communities or interests seem off-topic
            # (This is a placeholder — full implementation would use AI)
            if communities:
                findings.append({
                    "platform": "reddit",
                    "campaign_id": camp.external_id,
                    "campaign_name": camp.name,
                    "type": "targeting_info",
                    "communities": communities[:10],
                    "interests": interests[:10],
                })

        print(f"    {len(camps)} campaigns, {len(findings)} with targeting data")
        return findings

    except Exception as e:
        print(f"    Reddit scan error: {e}")
        return []


# ─── LinkedIn Company Scan ────────────────────────────

def scan_linkedin_companies():
    """Check LinkedIn campaigns for company-level contamination (if data available)."""
    print("  Scanning LinkedIn company data...")
    # LinkedIn r_ads_reporting doesn't have company dimension directly.
    # Would need to parse domain reports from LinkedIn Campaign Manager export.
    # For now, flag this as a manual check.
    print("    LinkedIn company-level data requires manual domain report export")
    return []


# ─── Analysis ─────────────────────────────────────────

def analyze_contamination(sa_contaminated, reddit_findings, li_findings):
    """Analyze all contamination findings and generate actions."""
    auto_actions = []
    alerts = []
    approval_requests = []

    # StackAdapt contamination — auto-alert
    for c in sa_contaminated:
        if c["clicks"] > 0:
            # Active clicks from blocked company — high priority alert
            alerts.append({
                "platform": c["platform"],
                "campaign_name": c["campaign_name"],
                "domain": c["domain"],
                "matched": c["matched_blocklist"],
                "impressions": c["impressions"],
                "clicks": c["clicks"],
                "spend": c["spend"],
                "severity": "high" if c["clicks"] > 5 else "medium",
            })
        elif c["impressions"] > 100:
            alerts.append({
                "platform": c["platform"],
                "campaign_name": c["campaign_name"],
                "domain": c["domain"],
                "matched": c["matched_blocklist"],
                "impressions": c["impressions"],
                "clicks": 0,
                "spend": c["spend"],
                "severity": "low",
            })

    # Reddit targeting review recommendations
    for r in reddit_findings:
        if r.get("communities"):
            approval_requests.append({
                "type": "reddit_targeting_review",
                "platform": "reddit",
                "campaign_id": r["campaign_id"],
                "campaign_name": r["campaign_name"],
                "detail": f"Communities: {', '.join(r['communities'][:5])}",
                "reason": "Periodic targeting review",
                "confidence": 60,
            })

    return auto_actions, alerts, approval_requests


# ─── Execution (placeholder for exclusion APIs) ──────

def execute_exclusions(auto_actions, dry_run=False):
    """Execute auto-exclusions. Currently StackAdapt and LinkedIn lack
    programmatic exclusion APIs at company/domain level, so we alert instead."""
    # In practice, StackAdapt domain exclusions would be done via:
    # - updateCampaign mutation with domainExclusions
    # - Or via audience segment exclusions
    # For now, all contamination is handled via alerts
    results = []
    for action in auto_actions:
        action["applied"] = False
        action["note"] = "Exclusion API not yet implemented — alerting instead"
        results.append(action)
    return results


# ─── Reddit Write Methods ─────────────────────────────

def reddit_update_ad_group_targeting(ad_group_id, targeting_changes, dry_run=False):
    """Update Reddit ad group targeting (communities, interests, etc.)."""
    if dry_run:
        return {"success": False, "dry_run": True}

    reddit = get_connector("reddit")
    if not reddit._access_token:
        reddit.load_credentials()

    try:
        result = reddit._api("PATCH", f"/ad_groups/{ad_group_id}", {
            "data": {"targeting": targeting_changes}
        })
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


def reddit_update_campaign_budget(campaign_id, new_budget_cents, dry_run=False):
    """Update Reddit campaign budget."""
    if dry_run:
        return {"success": False, "dry_run": True}

    reddit = get_connector("reddit")
    if not reddit._access_token:
        reddit.load_credentials()

    try:
        result = reddit._api("PATCH", f"/campaigns/{campaign_id}", {
            "data": {"budget_cents": int(new_budget_cents)}
        })
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── Telegram Report ──────────────────────────────────

def send_report(alerts, auto_results, approval_requests, dry_run):
    now = datetime.now()
    lines = [f"🎯 <b>Audience & Targeting Optimizer</b> — {now.strftime('%b %-d')}"]
    if dry_run:
        lines.append("<i>DRY RUN</i>")

    # Contamination alerts
    if alerts:
        high = [a for a in alerts if a["severity"] == "high"]
        medium = [a for a in alerts if a["severity"] == "medium"]
        low = [a for a in alerts if a["severity"] == "low"]

        if high:
            lines.append(f"\n🚨 <b>High Priority — Blocked Company Clicks ({len(high)}):</b>")
            for a in high:
                lines.append(f"  • {a['domain']} (matches: {a['matched']})")
                lines.append(f"    {a['campaign_name'][:40]} — {a['clicks']} clicks, ${a['spend']:.0f}")

        if medium:
            lines.append(f"\n⚠️ <b>Contamination Detected ({len(medium)}):</b>")
            for a in medium[:5]:
                lines.append(f"  • {a['domain']} → {a['campaign_name'][:35]} ({a['clicks']} clicks)")

        if low:
            lines.append(f"\n📋 Impressions from blocked domains: {len(low)}")

        total_waste = sum(a["spend"] for a in alerts)
        if total_waste > 0:
            lines.append(f"\n  Total contaminated spend: ${total_waste:,.0f}")
    else:
        lines.append("\n✅ No contamination detected this scan.")

    # Pending reviews
    if approval_requests:
        lines.append(f"\n⏳ <b>Targeting Reviews ({len(approval_requests)}):</b>")
        for r in approval_requests[:3]:
            lines.append(f"  • {r['campaign_name'][:40]} — {r['reason']}")

    send_telegram("\n".join(lines))

    # Send individual alert cards for high-priority contamination
    if not dry_run:
        for a in [x for x in alerts if x["severity"] == "high"]:
            action_id = _uid()
            text = (
                f"🚨 <b>Blocked Company Detected</b>\n"
                f"Domain: {a['domain']}\n"
                f"Matches: {a['matched']}\n"
                f"Campaign: {a['campaign_name']}\n"
                f"Platform: {a['platform']}\n"
                f"Clicks: {a['clicks']} | Spend: ${a['spend']:.0f}\n\n"
                f"Action needed: Exclude this domain/company from targeting."
            )
            reply_markup = json.dumps({
                "inline_keyboard": [[
                    {"text": "✅ Exclude", "callback_data": f"approve:{AGENT_SLUG}:{action_id}"},
                    {"text": "👀 Reviewed", "callback_data": f"reject:{AGENT_SLUG}:{action_id}"},
                ]]
            })
            send_telegram(text, reply_markup=reply_markup)


# ─── DB Logging ───────────────────────────────────────

def log_run(alerts, auto_results, approval_requests, start_time, dry_run):
    if dry_run:
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        agent_id = ensure_agent(cur)

        output = {
            "contamination_alerts": len(alerts),
            "high_priority": len([a for a in alerts if a["severity"] == "high"]),
            "auto_actions": len(auto_results),
            "pending_reviews": len(approval_requests),
        }

        cur.execute(
            'INSERT INTO "AgentRun" (id, "agentId", status, input, output, "findingsCount", "recsCount", "startedAt", "completedAt", "createdAt") '
            "VALUES (%s, %s, 'done', %s, %s, %s, %s, %s, NOW(), NOW())",
            (_uid(), agent_id, json.dumps({"type": "audience-targeting"}),
             json.dumps(output), len(alerts) + len(approval_requests),
             len(auto_results), start_time),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"  DB error: {e}")


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Audience & Targeting Optimizer")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--weekly", action="store_true", help="Full weekly scan (domain reports)")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    start_time = datetime.now(timezone.utc)
    print(f"🎯 Audience & Targeting Optimizer — {start_time.strftime('%Y-%m-%d %H:%M UTC')}")
    if args.dry_run:
        print("   ⚠️  DRY RUN")
    if args.weekly:
        print("   📋 Weekly full scan mode")
    print()

    # Knowledge
    print("Loading context...")
    knowledge = load_knowledge_context()
    print(f"  Knowledge: {len(knowledge)} chars")

    # Scan platforms
    print("\nScanning platforms for contamination...")

    # StackAdapt domain scan
    sa_contaminated = scan_stackadapt_domains()

    # Reddit targeting scan (weekly or always)
    reddit_findings = []
    if args.weekly:
        reddit_findings = scan_reddit_targeting()

    # LinkedIn (manual for now)
    li_findings = scan_linkedin_companies()

    # Analysis
    print("\nAnalyzing findings...")
    auto_actions, alerts, approval_requests = analyze_contamination(
        sa_contaminated, reddit_findings, li_findings
    )
    print(f"  Alerts: {len(alerts)} ({len([a for a in alerts if a['severity'] == 'high'])} high)")
    print(f"  Auto-actions: {len(auto_actions)}")
    print(f"  Approval requests: {len(approval_requests)}")

    # Execute
    auto_results = execute_exclusions(auto_actions, dry_run=args.dry_run)

    # Report
    print("\nSending Telegram report...")
    send_report(alerts, auto_results, approval_requests, args.dry_run)

    # DB
    log_run(alerts, auto_results, approval_requests, start_time, args.dry_run)

    # Log file
    os.makedirs(LOG_DIR, exist_ok=True)
    log_file = os.path.join(LOG_DIR, f"{start_time.strftime('%Y-%m-%d')}.json")
    with open(log_file, "w") as f:
        json.dump({
            "timestamp": start_time.isoformat(),
            "dry_run": args.dry_run,
            "weekly": args.weekly,
            "contamination_alerts": alerts,
            "auto_actions": auto_results,
            "approval_requests": approval_requests,
            "stackadapt_contaminated": sa_contaminated,
        }, f, indent=2, default=str)
    print(f"\nLog: {log_file}")
    print(f"Runtime: {(datetime.now(timezone.utc) - start_time).total_seconds():.0f}s")


if __name__ == "__main__":
    main()
