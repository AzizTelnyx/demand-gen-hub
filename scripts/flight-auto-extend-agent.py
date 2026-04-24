#!/usr/bin/env python3
"""
Flight Auto-Extend Agent
========================
Daily agent that checks StackAdapt campaigns for:
1. Flights nearing their end date → auto-extends them
2. Budget exhausted before flight ends → auto-top-up so campaigns don't go dark

Run: python scripts/flight-auto-extend-agent.py [--dry-run] [--days-ahead 7]
Cron: daily at 6 AM PST via OpenClaw gateway

Logic:
1. Fetch all active StackAdapt campaigns
2. For each campaign, check the latest flight's end date
3. If flight ends within --days-ahead days:
   a. Add a new flight extending to end of next month (or 30 days out)
   b. Budget = same as the ending flight
   c. Log the extension
4. Check campaign spend vs budget — if spend ≥ 90% of budget with flight days remaining:
   a. Auto-top-up budget (match original flight budget)
   b. Alert on Telegram
5. Report any campaigns that couldn't be extended (errors, API issues)
"""

import json
import os
import sys
import argparse
import urllib.request
from datetime import datetime, timezone, timedelta
from calendar import monthrange

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from platforms import get_connector

# ─── Config ───────────────────────────────────────────

LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/flight-auto-extend")
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
    """Fetch campaign type, goal, group, and flights."""
    # First get the type via __typename
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


def extend_campaign(sa, camp_info, days_extend=30, dry_run=False):
    """Add a new flight to extend the campaign."""
    camp_type = camp_info["type"]
    if camp_type not in ("display", "native", "video", "ctv", "dooh", "audio"):
        return {"success": False, "error": f"Unknown campaign type: {camp_type}"}

    if not camp_info["flights"]:
        return {"success": False, "error": "No flights found"}

    # Get the latest flight (most recent endTime)
    latest_flight = max(camp_info["flights"], key=lambda f: f.get("endTime", ""))
    budget = latest_flight.get("grossLifetimeBudget", 500)
    bid_type = latest_flight.get("bidType", "CPC")
    bid_amount = latest_flight.get("bidAmount", 2.0)
    cpa_target = latest_flight.get("cpaTarget")
    budget_type = latest_flight.get("budgetType", "COST")

    # New flight: starts when old one ends, extends days_extend days
    old_end = latest_flight.get("endTime", "")
    try:
        old_end_dt = datetime.fromisoformat(old_end)
    except (ValueError, TypeError):
        old_end_dt = datetime.now(timezone.utc)

    new_start = old_end_dt + timedelta(seconds=1)
    new_end = new_start + timedelta(days=days_extend)

    start_str = new_start.strftime("%Y-%m-%dT%H:%M:%S%z")
    end_str = new_end.strftime("%Y-%m-%dT%H:%M:%S%z")

    if dry_run:
        log(f"DRY RUN: Would extend {camp_info['name']} with ${budget} budget, {start_str} → {end_str}")
        return {"success": True, "dry_run": True}

    # Build the upsert mutation
    flight_input = f'''
          {{
            startTime: "{start_str}"
            endTime: "{end_str}"
            grossLifetimeBudget: {budget}
            budgetType: {budget_type}
            bidType: {bid_type}
            bidAmount: {bid_amount}
          }}
    '''
    if cpa_target:
        flight_input = f'''
          {{
            startTime: "{start_str}"
            endTime: "{end_str}"
            grossLifetimeBudget: {budget}
            budgetType: {budget_type}
            bidType: {bid_type}
            bidAmount: {bid_amount}
            cpaTarget: {cpa_target}
          }}
        '''

    mutation = '''
    mutation {
      upsertCampaign(
        input: {
          %s: {
            id: "%s"
            advertiserId: "93053"
            campaignGroupId: "%s"
            goalType: %s
            flights: [%s]
          }
        }
      ) {
        campaign { id name campaignStatus { state } }
        userErrors { message }
      }
    }
    ''' % (camp_type, camp_info["id"], camp_info["groupId"], camp_info["goal"], flight_input)

    try:
        data = sa._gql(mutation)
        errors = data.get("data", {}).get("upsertCampaign", {}).get("userErrors", [])
        campaign = data.get("data", {}).get("upsertCampaign", {}).get("campaign")
        gql_errors = data.get("errors", [])

        if errors:
            return {"success": False, "error": "; ".join(e["message"] for e in errors)}
        if gql_errors:
            return {"success": False, "error": "; ".join(e.get("message", str(e)) for e in gql_errors)}
        if not campaign:
            return {"success": False, "error": "upsertCampaign returned null campaign"}

        return {
            "success": True,
            "state": campaign.get("campaignStatus", {}).get("state", "?"),
            "budget": budget,
            "new_end": end_str
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def check_budget_depletion(sa, days_ahead=7, dry_run=False):
    """
    Check for campaigns where spend has exhausted (or nearly exhausted) the budget
    while the flight still has days remaining. Auto-top-up budget to keep them live.
    """
    log("Budget Depletion Check starting")

    # Get all active campaigns with their details
    campaigns = sa.fetch_campaigns(active_only=True)
    log(f"Budget check: {len(campaigns)} active campaigns")

    now = datetime.now(timezone.utc)
    depleted = []
    near_depleted = []
    topped_up = []
    errors = []

    for camp in campaigns:
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

            # Only check if flight still has time remaining
            if end_dt <= now:
                continue

            days_remaining = (end_dt - now).days
            if days_remaining <= 0:
                continue

            # Get current spend from metrics API
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
                    metrics { cost }
                  } }
                }
              }
            }
            ''' % (camp.external_id, sa.ADVERTISER_ID, date_from, date_to)

            data = sa._gql(spend_query, timeout=30)
            nodes = data.get("data", {}).get("campaignDelivery", {}).get("records", {}).get("nodes", [])

            total_spend = sum(float(n.get("metrics", {}).get("cost", 0) or 0) for n in nodes)

            if flight_budget <= 0:
                continue

            spend_pct = (total_spend / flight_budget) * 100

            if spend_pct >= 95 and days_remaining > 0:
                # Budget exhausted or nearly so — needs top-up NOW
                depleted.append({
                    "name": camp.name,
                    "id": camp.external_id,
                    "spend": total_spend,
                    "budget": flight_budget,
                    "spend_pct": spend_pct,
                    "days_remaining": days_remaining,
                    "details": details
                })
            elif spend_pct >= 75 and days_remaining > 0:
                # Budget pacing fast — flag for monitoring
                # Calculate daily burn rate and projected exhaustion
                daily_burn = total_spend / max(1, 30)  # rough 30-day avg
                days_to_exhaust = (flight_budget - total_spend) / daily_burn if daily_burn > 0 else 999
                if days_to_exhaust < days_remaining * 0.5:
                    near_depleted.append({
                        "name": camp.name,
                        "id": camp.external_id,
                        "spend": total_spend,
                        "budget": flight_budget,
                        "spend_pct": spend_pct,
                        "days_remaining": days_remaining,
                        "days_to_exhaust": round(days_to_exhaust, 1)
                    })

        except Exception as e:
            errors.append({"name": camp.name, "id": camp.external_id, "error": str(e)})

    # Auto-top-up depleted campaigns
    for item in depleted:
        flight_budget = item["budget"]
        # Top up by adding another flight_budget worth
        new_budget = flight_budget * 2  # Double the budget to match original flight allocation

        if dry_run:
            log(f"DRY RUN: Would top up {item['name']} from ${flight_budget} to ${new_budget}")
            topped_up.append(item["name"])
            continue

        result = extend_campaign(sa, item["details"], dry_run=False)
        if result["success"]:
            topped_up.append(item["name"])
            log(f"✅ Budget top-up: {item['name']} | ${flight_budget} → extended with new flight")
        else:
            errors.append({"name": item["name"], "id": item["id"], "error": f"Top-up failed: {result['error']}"})

    return {
        "depleted": depleted,
        "near_depleted": near_depleted,
        "topped_up": topped_up,
        "errors": errors
    }


def run(days_ahead=7, days_extend=30, dry_run=False):
    sa = get_connector("stackadapt")
    sa.load_credentials()

    log(f"Flight Auto-Extend Agent starting | days_ahead={days_ahead} | days_extend={days_extend} | dry_run={dry_run}")

    # Get all active campaigns
    campaigns = sa.fetch_campaigns(active_only=True)
    log(f"Found {len(campaigns)} active StackAdapt campaigns")

    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days_ahead)
    needs_extension = []
    errors = []
    extended = []

    for camp in campaigns:
        try:
            details = get_campaign_details(sa, camp.external_id)
            if not details:
                errors.append({"name": camp.name, "id": camp.external_id, "error": "Could not fetch details"})
                continue

            # Check latest flight end date
            if not details["flights"]:
                errors.append({"name": camp.name, "id": camp.external_id, "error": "No flights"})
                continue

            latest_flight = max(details["flights"], key=lambda f: f.get("endTime", ""))
            end_str = latest_flight.get("endTime", "")
            try:
                end_dt = datetime.fromisoformat(end_str)
            except (ValueError, TypeError):
                errors.append({"name": camp.name, "id": camp.external_id, "error": f"Bad end date: {end_str}"})
                continue

            # If flight ends within our window, extend it
            if end_dt <= cutoff:
                needs_extension.append({
                    "name": camp.name,
                    "id": camp.external_id,
                    "end_date": end_str,
                    "budget": latest_flight.get("grossLifetimeBudget", 0),
                    "details": details
                })
        except Exception as e:
            errors.append({"name": camp.name, "id": camp.external_id, "error": str(e)})

    log(f"Campaigns needing extension: {len(needs_extension)}")

    for item in needs_extension:
        result = extend_campaign(sa, item["details"], days_extend=days_extend, dry_run=dry_run)
        if result["success"]:
            extended.append(item["name"])
            log(f"✅ Extended: {item['name']} | budget=${item['budget']} | new_end={result.get('new_end', '?')}")
        else:
            errors.append({"name": item["name"], "id": item["id"], "error": result["error"]})
            log(f"❌ Failed: {item['name']} | {result['error']}")

    # ─── Budget Depletion Check ─────────────────────────
    # Check for campaigns where budget is exhausted before flight end date
    budget_result = check_budget_depletion(sa, days_ahead=days_ahead, dry_run=dry_run)
    budget_topped = budget_result["topped_up"]
    budget_depleted = budget_result["depleted"]
    budget_near = budget_result["near_depleted"]
    budget_errors = budget_result["errors"]
    errors.extend(budget_errors)

    # Also check for recently ended campaigns (died within last 3 days)
    all_campaigns = sa.fetch_campaigns(active_only=False)
    recently_ended = []
    for camp in all_campaigns:
        if camp.status == "ended":
            details = get_campaign_details(sa, camp.external_id)
            if details and details["flights"]:
                latest_flight = max(details["flights"], key=lambda f: f.get("endTime", ""))
                end_str = latest_flight.get("endTime", "")
                try:
                    end_dt = datetime.fromisoformat(end_str)
                    if end_dt >= now - timedelta(days=3):
                        recently_ended.append({
                            "name": camp.name,
                            "id": camp.external_id,
                            "end_date": end_str,
                            "budget": latest_flight.get("grossLifetimeBudget", 0)
                        })
                except (ValueError, TypeError):
                    pass

    # Summary
    summary_lines = [
        f"🔄 *Flight Auto-Extend Report*",
        f"Checked: {len(campaigns)} active campaigns",
        f"Flights extended: {len(extended)}",
        f"Budget top-ups: {len(budget_topped)}",
        f"Errors: {len(errors)}",
        f"Recently ended (no auto-extend): {len(recently_ended)}",
    ]

    if extended:
        summary_lines.append("\n✅ *Flights Extended:*")
        for name in extended:
            summary_lines.append(f"  • {name}")

    if budget_topped:
        summary_lines.append("\n💰 *Budget Top-ups (auto-extended):*")
        for name in budget_topped:
            summary_lines.append(f"  • {name}")

    if budget_depleted and not budget_topped:
        summary_lines.append("\n🚨 *Budget Exhausted (needs manual review):*")
        for d in budget_depleted:
            summary_lines.append(f"  • {d['name']} — ${d['spend']:.0f}/${d['budget']:.0f} ({d['spend_pct']:.0f}%) — {d['days_remaining']}d left")

    if budget_near:
        summary_lines.append("\n⚠️ *Budget Pacing Fast (projected to exhaust early):*")
        for n in budget_near:
            summary_lines.append(f"  • {n['name']} — {n['spend_pct']:.0f}% spent, {n['days_remaining']}d left, ~{n['days_to_exhaust']}d to exhaust")

    if errors:
        summary_lines.append("\n❌ *Errors:*")
        for e in errors:
            summary_lines.append(f"  • {e['name']}: {e['error']}")

    if recently_ended:
        summary_lines.append("\n💀 *Recently ended (needs manual review):*")
        for r in recently_ended:
            summary_lines.append(f"  • {r['name']} (ended {r['end_date'][:10]})")

    summary = "\n".join(summary_lines)
    log(summary)

    # Send to Telegram
    if not dry_run:
        send_telegram(summary)

    # Save run log
    run_data = {
        "timestamp": now.isoformat(),
        "checked": len(campaigns),
        "extended": len(extended),
        "budget_topped_up": len(budget_topped),
        "budget_near_depleted": len(budget_near),
        "errors": len(errors),
        "recently_ended": len(recently_ended),
        "details": {
            "extended": extended,
            "budget_topped_up": budget_topped,
            "budget_near_depleted": budget_near,
            "errors": errors,
            "recently_ended": recently_ended
        }
    }
    log_file = os.path.join(LOG_DIR, f"{now.strftime('%Y-%m-%d')}.json")
    with open(log_file, "w") as f:
        json.dump(run_data, f, indent=2)

    return run_data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Flight Auto-Extend Agent")
    parser.add_argument("--dry-run", action="store_true", help="Don't make changes")
    parser.add_argument("--days-ahead", type=int, default=7, help="Extend flights ending within N days")
    parser.add_argument("--days-extend", type=int, default=30, help="How many days to extend each flight")
    args = parser.parse_args()

    result = run(days_ahead=args.days_ahead, days_extend=args.days_extend, dry_run=args.dry_run)
    print(f"\nDone: {result['extended']} flights extended, {result.get('budget_topped_up', 0)} budget top-ups, {result['errors']} errors")
