#!/usr/bin/env python3
"""
StackAdapt Budget Monitor
=========================
Standalone script that checks ALL StackAdapt campaigns for budget pacing issues:
- Campaigns that have exhausted budget before flight end (ended due to BUDGET_REACHED)
- Campaigns pacing to exhaust before flight end (>80% spent with >20% flight remaining)
- Campaigns that ended unexpectedly (not by flight expiry)

Run: python scripts/stackadapt-budget-monitor.py [--dry-run] [--threshold 80]
Cron: every 6 hours via OpenClaw gateway

Unlike the Flight Auto-Extend agent (which handles date-based extensions),
this monitor focuses on budget health — catching campaigns that burn through
budget faster than expected.
"""

import json
import os
import sys
import argparse
import urllib.request
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from platforms import get_connector

# ─── Config ───────────────────────────────────────────

LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/stackadapt-budget-monitor")
os.makedirs(LOG_DIR, exist_ok=True)

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo")
TELEGRAM_CHAT_ID = "-1003786506284"
TELEGRAM_THREAD_ID = 164  # Agent Activity topic


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{ts}] {msg}")


def send_telegram(msg):
    """Send alert to DG Hub Agent Activity topic."""
    if not TELEGRAM_BOT_TOKEN:
        return
    payload = json.dumps({
        "chat_id": TELEGRAM_CHAT_ID,
        "message_thread_id": TELEGRAM_THREAD_ID,
        "text": msg,
        "parse_mode": "Markdown"
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        log(f"Telegram send failed: {e}")


def get_campaign_details(sa, campaign_id):
    """Fetch campaign details including flights and spend."""
    query = '''
    query {
      campaign(id: "%s") {
        id
        name
        campaignStatus { state }
        campaignGroup { id }
        ... on DisplayCampaign { campType: __typename goalType }
        ... on NativeCampaign { campType: __typename goalType }
        ... on VideoCampaign { campType: __typename goalType }
        ... on CtvCampaign { campType: __typename goalType }
        ... on DoohCampaign { campType: __typename goalType }
        ... on AudioCampaign { campType: __typename goalType }
        flights {
          edges {
            node {
              id
              name
              startTime
              endTime
              grossLifetimeBudget
              budgetType
              bidType
              bidAmount
              cpaTarget
            }
          }
        }
      }
    }
    ''' % campaign_id

    data = sa._gql(query)
    camp = data.get("data", {}).get("campaign")
    if not camp:
        return None

    flights = []
    for edge in camp.get("flights", {}).get("edges", []):
        flights.append(edge["node"])

    return {
        "id": camp["id"],
        "name": camp["name"],
        "state": camp["campaignStatus"]["state"],
        "type": camp.get("campType", "").replace("Campaign", "").lower(),
        "goal": camp.get("goalType", ""),
        "groupId": camp.get("campaignGroup", {}).get("id", ""),
        "flights": flights
    }


def get_campaign_spend(sa, campaign_id):
    """Get total spend for a campaign from the delivery API."""
    now = datetime.now(timezone.utc)
    date_from = (now - timedelta(days=90)).strftime("%Y-%m-%d")
    date_to = now.strftime("%Y-%m-%d")

    spend_query = '''
    {
      campaignDelivery(
        filterBy: { campaignIds: [%s], advertiserIds: [%d] }
        date: { from: "%s", to: "%s" }
        granularity: TOTAL
        dataType: TABLE
      ) {
        ... on CampaignDeliveryOutcome {
          records { nodes {
            metrics { cost impressionsBigint clicksBigint }
          } }
        }
      }
    }
    ''' % (campaign_id, sa.ADVERTISER_ID, date_from, date_to)

    data = sa._gql(spend_query, timeout=30)
    nodes = data.get("data", {}).get("campaignDelivery", {}).get("records", {}).get("nodes", [])

    total_spend = sum(float(n.get("metrics", {}).get("cost", 0) or 0) for n in nodes)
    total_impressions = sum(int(n.get("metrics", {}).get("impressionsBigint", 0) or 0) for n in nodes)
    total_clicks = sum(int(n.get("metrics", {}).get("clicksBigint", 0) or 0) for n in nodes)

    return {
        "spend": total_spend,
        "impressions": total_impressions,
        "clicks": total_clicks
    }


def run(threshold=80, dry_run=False):
    sa = get_connector("stackadapt")
    sa.load_credentials()

    log(f"StackAdapt Budget Monitor starting | threshold={threshold}% | dry_run={dry_run}")

    now = datetime.now(timezone.utc)

    # ─── Check 1: Active campaigns pacing to exhaust budget early ───
    active_campaigns = sa.fetch_campaigns(active_only=True)
    log(f"Found {len(active_campaigns)} active campaigns")

    pacing_alerts = []
    critical_alerts = []

    for camp in active_campaigns:
        try:
            details = get_campaign_details(sa, camp.external_id)
            if not details or not details["flights"]:
                continue

            latest_flight = max(details["flights"], key=lambda f: f.get("endTime", ""))
            flight_budget = latest_flight.get("grossLifetimeBudget", 0)
            start_str = latest_flight.get("startTime", "")
            end_str = latest_flight.get("endTime", "")

            try:
                start_dt = datetime.fromisoformat(start_str)
                end_dt = datetime.fromisoformat(end_str)
            except (ValueError, TypeError):
                continue

            # Skip if flight hasn't started or already ended
            if start_dt > now or end_dt <= now:
                continue

            if flight_budget <= 0:
                continue

            # Get spend
            spend_data = get_campaign_spend(sa, camp.external_id)
            total_spend = spend_data["spend"]

            spend_pct = (total_spend / flight_budget) * 100

            # Calculate flight progress
            total_flight_days = (end_dt - start_dt).days
            elapsed_days = (now - start_dt).days
            flight_progress = (elapsed_days / total_flight_days * 100) if total_flight_days > 0 else 100

            # Pacing ratio: spend% vs flight_progress%
            # >1.0 = overspending relative to time elapsed
            pacing_ratio = spend_pct / flight_progress if flight_progress > 0 else 0

            if spend_pct >= 95:
                # Critical: budget essentially exhausted
                critical_alerts.append({
                    "name": camp.name,
                    "id": camp.external_id,
                    "spend": total_spend,
                    "budget": flight_budget,
                    "spend_pct": spend_pct,
                    "flight_progress": flight_progress,
                    "days_remaining": (end_dt - now).days,
                    "pacing_ratio": round(pacing_ratio, 2)
                })
            elif spend_pct >= threshold and pacing_ratio > 1.3:
                # Warning: pacing significantly ahead of flight progress
                daily_burn = total_spend / max(1, elapsed_days)
                days_to_exhaust = (flight_budget - total_spend) / daily_burn if daily_burn > 0 else 999
                pacing_alerts.append({
                    "name": camp.name,
                    "id": camp.external_id,
                    "spend": total_spend,
                    "budget": flight_budget,
                    "spend_pct": round(spend_pct, 1),
                    "flight_progress": round(flight_progress, 1),
                    "days_remaining": (end_dt - now).days,
                    "days_to_exhaust": round(days_to_exhaust, 1),
                    "pacing_ratio": round(pacing_ratio, 2)
                })
        except Exception as e:
            log(f"Error checking {camp.name}: {e}")

    # ─── Check 2: Recently ended campaigns (budget_reached vs flight_expired) ───
    all_campaigns = sa.fetch_campaigns(active_only=False)
    budget_ended = []
    flight_ended = []

    for camp in all_campaigns:
        if camp.status != "ended":
            continue
        try:
            details = get_campaign_details(sa, camp.external_id)
            if not details or not details["flights"]:
                continue

            latest_flight = max(details["flights"], key=lambda f: f.get("endTime", ""))
            flight_budget = latest_flight.get("grossLifetimeBudget", 0)
            end_str = latest_flight.get("endTime", "")

            try:
                end_dt = datetime.fromisoformat(end_str)
            except (ValueError, TypeError):
                continue

            # Only look at campaigns that ended in last 7 days
            if end_dt < now - timedelta(days=7):
                continue

            spend_data = get_campaign_spend(sa, camp.external_id)
            total_spend = spend_data["spend"]
            spend_pct = (total_spend / flight_budget * 100) if flight_budget > 0 else 0

            if spend_pct >= 95:
                # Likely ended due to budget exhaustion
                budget_ended.append({
                    "name": camp.name,
                    "id": camp.external_id,
                    "spend": total_spend,
                    "budget": flight_budget,
                    "spend_pct": round(spend_pct, 1),
                    "end_date": end_str[:10],
                    "action_needed": "Budget top-up needed to reactivate"
                })
            else:
                flight_ended.append({
                    "name": camp.name,
                    "id": camp.external_id,
                    "spend": total_spend,
                    "budget": flight_budget,
                    "spend_pct": round(spend_pct, 1),
                    "end_date": end_str[:10]
                })
        except Exception as e:
            log(f"Error checking ended {camp.name}: {e}")

    # ─── Build Report ───
    summary_lines = [
        f"📊 *StackAdapt Budget Monitor*",
        f"Active campaigns: {len(active_campaigns)}",
        f"Critical (budget exhausted): {len(critical_alerts)}",
        f"Pacing fast: {len(pacing_alerts)}",
        f"Ended (budget reached): {len(budget_ended)}",
        f"Ended (flight expired): {len(flight_ended)}",
    ]

    if critical_alerts:
        summary_lines.append("\n🚨 *CRITICAL — Budget Exhausted:*")
        for c in critical_alerts:
            summary_lines.append(
                f"  • {c['name']}\n"
                f"    ${c['spend']:.0f}/${c['budget']:.0f} ({c['spend_pct']:.0f}%) | {c['days_remaining']}d left in flight | pacing {c['pacing_ratio']}x"
            )

    if pacing_alerts:
        summary_lines.append("\n⚠️ *Pacing Fast (projected early exhaust):*")
        for p in pacing_alerts:
            summary_lines.append(
                f"  • {p['name']}\n"
                f"    {p['spend_pct']}% spent vs {p['flight_progress']}% flight | ~{p['days_to_exhaust']}d to exhaust, {p['days_remaining']}d left | {p['pacing_ratio']}x pacing"
            )

    if budget_ended:
        summary_lines.append("\n💀 *Recently Ended (Budget Exhausted):*")
        for b in budget_ended:
            summary_lines.append(
                f"  • {b['name']}\n"
                f"    ${b['spend']:.0f}/${b['budget']:.0f} ({b['spend_pct']}%) | ended {b['end_date']} | ⚡ {b['action_needed']}"
            )

    if flight_ended:
        summary_lines.append("\n✅ *Recently Ended (Flight Expired — normal):*")
        for f in flight_ended:
            summary_lines.append(f"  • {f['name']} — {f['spend_pct']}% spent | ended {f['end_date']}")

    summary = "\n".join(summary_lines)
    log(summary)

    # Send to Telegram (only if there are actionable items)
    if not dry_run and (critical_alerts or budget_ended or pacing_alerts):
        send_telegram(summary)
    elif not dry_run:
        log("No budget issues found — skipping Telegram alert")

    # Save run log
    run_data = {
        "timestamp": now.isoformat(),
        "active_campaigns": len(active_campaigns),
        "critical_alerts": len(critical_alerts),
        "pacing_alerts": len(pacing_alerts),
        "budget_ended": len(budget_ended),
        "flight_ended": len(flight_ended),
        "details": {
            "critical": critical_alerts,
            "pacing": pacing_alerts,
            "budget_ended": budget_ended,
            "flight_ended": flight_ended
        }
    }
    log_file = os.path.join(LOG_DIR, f"{now.strftime('%Y-%m-%d')}.json")
    with open(log_file, "w") as f:
        json.dump(run_data, f, indent=2)

    return run_data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="StackAdapt Budget Monitor")
    parser.add_argument("--dry-run", action="store_true", help="Don't send alerts")
    parser.add_argument("--threshold", type=int, default=80, help="Alert when spend exceeds N pct of budget")
    args = parser.parse_args()

    result = run(threshold=args.threshold, dry_run=args.dry_run)
    print(f"\nDone: {result['critical_alerts']} critical, {result['pacing_alerts']} pacing, {result['budget_ended']} budget-ended")
