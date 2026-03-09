#!/usr/bin/env python3
"""
Google Search Manager
=====================
Manages Google Ads keywords and device bids. Extends (not replaces)
negative-keyword-agent.py and google-ads-optimizer.py.

Level 3 (auto): Pause keywords >$300 spend / 0 conversions,
  pause keywords CPA >3x campaign avg / >$200 spend,
  device bid modifiers ±15% based on 30d CPA (min 100 clicks).
Level 2 (approval): New keyword additions, match type changes,
  bid strategy changes, pausing ad groups/campaigns.

Run: python scripts/google-search-manager.py [--dry-run] [--days 30]
"""

import json, os, sys, argparse, urllib.request, uuid, re
from datetime import datetime, timezone, timedelta
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ─── Config ───────────────────────────────────────────

CUSTOMER_ID = "2356650573"
LOGIN_CUSTOMER_ID = "2893524941"
CRED_PATH = os.path.expanduser("~/.config/google-ads/credentials.json")
DB_URL = "postgresql://localhost:5432/dghub"
LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/google-search-manager")

TELEGRAM_BOT_TOKEN = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
TELEGRAM_CHAT_ID = "-1003786506284"
TELEGRAM_THREAD_ID = 164

OPENCLAW_BASE = "http://127.0.0.1:18789/v1/chat/completions"
OPENCLAW_TOKEN = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "")

# Guardrails
MAX_AUTO_ACTIONS_PER_CAMPAIGN = 3
MIN_CAMPAIGN_AGE_DAYS = 7
MIN_CAMPAIGN_SPEND = 200
KW_PAUSE_SPEND_ZERO_CONV = 300
KW_PAUSE_CPA_MULTIPLIER = 3
KW_PAUSE_CPA_MIN_SPEND = 200
DEVICE_BID_MAX_CHANGE = 0.15
DEVICE_MIN_CLICKS = 100
CPA_SPIKE_FREEZE_PCT = 0.50

AGENT_SLUG = "google-search-manager"
AGENT_NAME = "Google Search Manager"

COMPETITORS = [
    "twilio", "vonage", "bandwidth", "plivo", "sinch", "messagebird",
    "vapi", "retell", "bland", "synthflow", "voiceflow", "elevenlabs", "livekit",
    "five9", "genesys",
]

PRODUCT_MAP = {
    "voice ai": "voice_ai", "ai agent": "voice_ai", "vapi": "voice_ai",
    "contact center": "contact_center", "sip trunk": "sip_trunking",
    "sip": "sip_trunking", "voice api": "voice_infrastructure",
    "iot": "connectivity", "m2m": "connectivity",
    "sms": "messaging", "numbers": "connectivity",
}


# ─── Helpers ──────────────────────────────────────────

def _uid():
    return str(uuid.uuid4())[:25].replace("-", "")


def get_db():
    import psycopg2
    return psycopg2.connect(DB_URL)


def get_client():
    from google.ads.googleads.client import GoogleAdsClient
    with open(CRED_PATH) as f:
        creds = json.load(f)
    return GoogleAdsClient.load_from_dict({
        "developer_token": creds["developer_token"],
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "login_customer_id": LOGIN_CUSTOMER_ID,
        "use_proto_plus": True,
    })


def parse_campaign_name(name):
    nl = name.lower()
    funnel = next((f.upper() for f in ["tofu", "mofu", "bofu"] if f in nl), None)
    product = next((v for k, v in PRODUCT_MAP.items() if k in nl), None)
    region = next((r.upper() for r in ["amer", "emea", "apac", "mena"] if r in nl), None)
    competitor = next((c for c in COMPETITORS if c in nl), None)
    is_conquest = competitor is not None or "conquest" in nl
    return {"funnel": funnel, "product": product, "region": region, "competitor": competitor, "is_conquest": is_conquest}


def ensure_agent(cur):
    cur.execute('SELECT id FROM "Agent" WHERE slug = %s', (AGENT_SLUG,))
    row = cur.fetchone()
    if row:
        return row[0]
    aid = _uid()
    cur.execute(
        'INSERT INTO "Agent" (id, slug, name, description, model, enabled, "createdAt") '
        "VALUES (%s, %s, %s, %s, 'python-script', true, NOW()) RETURNING id",
        (aid, AGENT_SLUG, AGENT_NAME, "Google Ads keyword and device bid management"),
    )
    return cur.fetchone()[0]


def log_campaign_change(cur, name, change_type, desc, old_val, new_val, campaign_id=None):
    cur.execute(
        'INSERT INTO "CampaignChange" (id, "campaignId", "campaignName", platform, "changeType", description, "oldValue", "newValue", source, actor, timestamp, "createdAt") '
        "VALUES (%s, %s, %s, 'google_ads', %s, %s, %s, %s, 'agent', %s, NOW(), NOW())",
        (_uid(), campaign_id, name, change_type, desc, old_val, new_val, AGENT_SLUG),
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
        return load_knowledge_for_agent("google_ads_optimizer") or ""
    except ImportError:
        path = os.path.join(os.path.dirname(__file__), "..", "knowledge", "telnyx-strategy.md")
        return open(path).read() if os.path.exists(path) else ""


# ─── Data Collection ──────────────────────────────────

def fetch_keyword_data(client, days=30):
    """Fetch keyword-level performance data."""
    ga = client.get_service("GoogleAdsService")
    VALID = {7: "LAST_7_DAYS", 14: "LAST_14_DAYS", 30: "LAST_30_DAYS"}
    if days in VALID:
        date_filter = f"segments.date DURING {VALID[days]}"
    else:
        end = datetime.now().strftime("%Y-%m-%d")
        start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        date_filter = f"segments.date BETWEEN '{start}' AND '{end}'"

    query = f"""
        SELECT ad_group_criterion.criterion_id,
               ad_group_criterion.keyword.text,
               ad_group_criterion.keyword.match_type,
               ad_group_criterion.status,
               ad_group.id, ad_group.name,
               campaign.id, campaign.name, campaign.status,
               metrics.cost_micros, metrics.impressions, metrics.clicks,
               metrics.conversions, metrics.all_conversions
        FROM keyword_view
        WHERE campaign.status = 'ENABLED'
          AND ad_group_criterion.status != 'REMOVED'
          AND {date_filter}
        ORDER BY metrics.cost_micros DESC
        LIMIT 10000
    """

    results = []
    for row in ga.search(customer_id=CUSTOMER_ID, query=query):
        cost = row.metrics.cost_micros / 1_000_000
        results.append({
            "criterion_id": row.ad_group_criterion.criterion_id,
            "keyword": row.ad_group_criterion.keyword.text,
            "match_type": str(row.ad_group_criterion.keyword.match_type).replace("KeywordMatchType.", ""),
            "status": str(row.ad_group_criterion.status),
            "ad_group_id": str(row.ad_group.id),
            "ad_group_name": row.ad_group.name,
            "campaign_id": str(row.campaign.id),
            "campaign_name": row.campaign.name,
            "cost": cost,
            "impressions": row.metrics.impressions,
            "clicks": row.metrics.clicks,
            "conversions": row.metrics.all_conversions,
        })
    return results


def fetch_device_data(client, days=30):
    """Fetch device-level performance data."""
    ga = client.get_service("GoogleAdsService")
    VALID = {7: "LAST_7_DAYS", 14: "LAST_14_DAYS", 30: "LAST_30_DAYS"}
    if days in VALID:
        date_filter = f"segments.date DURING {VALID[days]}"
    else:
        end = datetime.now().strftime("%Y-%m-%d")
        start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        date_filter = f"segments.date BETWEEN '{start}' AND '{end}'"

    query = f"""
        SELECT campaign.id, campaign.name,
               segments.device,
               metrics.cost_micros, metrics.impressions, metrics.clicks,
               metrics.conversions, metrics.all_conversions
        FROM campaign
        WHERE campaign.status = 'ENABLED'
          AND {date_filter}
        ORDER BY campaign.id
    """

    results = []
    for row in ga.search(customer_id=CUSTOMER_ID, query=query):
        cost = row.metrics.cost_micros / 1_000_000
        device = str(row.segments.device).replace("Device.", "")
        results.append({
            "campaign_id": str(row.campaign.id),
            "campaign_name": row.campaign.name,
            "device": device,
            "cost": cost,
            "impressions": row.metrics.impressions,
            "clicks": row.metrics.clicks,
            "conversions": row.metrics.all_conversions,
        })
    return results


def fetch_campaign_start_dates(client):
    """Fetch campaign start dates."""
    ga = client.get_service("GoogleAdsService")
    query = """
        SELECT campaign.id, campaign.start_date
        FROM campaign
        WHERE campaign.status = 'ENABLED'
    """
    dates = {}
    try:
        for row in ga.search(customer_id=CUSTOMER_ID, query=query):
            if row.campaign.start_date:
                dates[str(row.campaign.id)] = row.campaign.start_date
    except Exception:
        pass
    return dates


# ─── Analysis ─────────────────────────────────────────

def analyze_keywords(keyword_data, campaign_start_dates):
    """Analyze keywords for pause candidates."""
    # Compute campaign-level avg CPA
    camp_stats = defaultdict(lambda: {"cost": 0, "conversions": 0})
    for kw in keyword_data:
        camp_stats[kw["campaign_id"]]["cost"] += kw["cost"]
        camp_stats[kw["campaign_id"]]["conversions"] += kw["conversions"]

    campaign_cpa = {}
    for cid, s in camp_stats.items():
        if s["conversions"] > 0:
            campaign_cpa[cid] = s["cost"] / s["conversions"]

    auto_pause = []
    approval_needed = []

    for kw in keyword_data:
        cid = kw["campaign_id"]
        parsed = parse_campaign_name(kw["campaign_name"])

        # Skip young campaigns
        start_date = campaign_start_dates.get(cid)
        if start_date:
            try:
                age = (datetime.now() - datetime.strptime(start_date, "%Y-%m-%d")).days
                if age < MIN_CAMPAIGN_AGE_DAYS:
                    continue
            except (ValueError, TypeError):
                pass

        # Skip low-spend campaigns
        if camp_stats[cid]["cost"] < MIN_CAMPAIGN_SPEND:
            continue

        # Rule 1: >$300 spend, 0 conversions
        if kw["cost"] >= KW_PAUSE_SPEND_ZERO_CONV and kw["conversions"] == 0:
            # Don't auto-pause high-CPA keywords on conquest campaigns
            if parsed["is_conquest"]:
                approval_needed.append({
                    **kw,
                    "reason": f"${kw['cost']:.0f} spent, 0 conversions (conquest campaign — needs review)",
                    "confidence": 70,
                })
            else:
                auto_pause.append({
                    **kw,
                    "reason": f"${kw['cost']:.0f} spent, 0 conversions",
                    "confidence": 90,
                })

        # Rule 2: CPA >3x campaign avg, >$200 spend
        elif kw["cost"] >= KW_PAUSE_CPA_MIN_SPEND and kw["conversions"] > 0:
            kw_cpa = kw["cost"] / kw["conversions"]
            camp_avg = campaign_cpa.get(cid)
            if camp_avg and kw_cpa > camp_avg * KW_PAUSE_CPA_MULTIPLIER:
                if parsed["is_conquest"]:
                    approval_needed.append({
                        **kw,
                        "reason": f"CPA ${kw_cpa:.0f} vs campaign avg ${camp_avg:.0f} ({kw_cpa/camp_avg:.1f}x) — conquest",
                        "kw_cpa": kw_cpa,
                        "camp_cpa": camp_avg,
                        "confidence": 65,
                    })
                else:
                    auto_pause.append({
                        **kw,
                        "reason": f"CPA ${kw_cpa:.0f} vs campaign avg ${camp_avg:.0f} ({kw_cpa/camp_avg:.1f}x)",
                        "kw_cpa": kw_cpa,
                        "camp_cpa": camp_avg,
                        "confidence": 85,
                    })

    return auto_pause, approval_needed


def analyze_device_bids(device_data, campaign_start_dates):
    """Analyze device performance for bid modifier recommendations."""
    # Group by campaign
    camp_devices = defaultdict(list)
    for d in device_data:
        camp_devices[d["campaign_id"]].append(d)

    recommendations = []
    for cid, devices in camp_devices.items():
        # Skip young campaigns
        start_date = campaign_start_dates.get(cid)
        if start_date:
            try:
                age = (datetime.now() - datetime.strptime(start_date, "%Y-%m-%d")).days
                if age < MIN_CAMPAIGN_AGE_DAYS:
                    continue
            except (ValueError, TypeError):
                pass

        total_cost = sum(d["cost"] for d in devices)
        total_conv = sum(d["conversions"] for d in devices)
        if total_cost < MIN_CAMPAIGN_SPEND or total_conv == 0:
            continue

        overall_cpa = total_cost / total_conv
        campaign_name = devices[0]["campaign_name"]

        for d in devices:
            if d["clicks"] < DEVICE_MIN_CLICKS:
                continue
            if d["conversions"] == 0:
                # No conversions on device with 100+ clicks — recommend decrease
                modifier = -DEVICE_BID_MAX_CHANGE
                recommendations.append({
                    "campaign_id": cid,
                    "campaign_name": campaign_name,
                    "device": d["device"],
                    "modifier": modifier,
                    "reason": f"{d['clicks']} clicks, 0 conversions, ${d['cost']:.0f} spent",
                    "confidence": 80,
                })
                continue

            device_cpa = d["cost"] / d["conversions"]
            cpa_ratio = device_cpa / overall_cpa

            if cpa_ratio > 1.2:
                # Device CPA worse — decrease bid
                modifier = -min(DEVICE_BID_MAX_CHANGE, (cpa_ratio - 1) * 0.5)
                recommendations.append({
                    "campaign_id": cid,
                    "campaign_name": campaign_name,
                    "device": d["device"],
                    "modifier": round(modifier, 2),
                    "reason": f"Device CPA ${device_cpa:.0f} vs avg ${overall_cpa:.0f} ({cpa_ratio:.2f}x)",
                    "device_cpa": device_cpa,
                    "overall_cpa": overall_cpa,
                    "confidence": 78,
                })
            elif cpa_ratio < 0.8 and d["conversions"] >= 2:
                # Device CPA better — increase bid
                modifier = min(DEVICE_BID_MAX_CHANGE, (1 - cpa_ratio) * 0.5)
                recommendations.append({
                    "campaign_id": cid,
                    "campaign_name": campaign_name,
                    "device": d["device"],
                    "modifier": round(modifier, 2),
                    "reason": f"Device CPA ${device_cpa:.0f} vs avg ${overall_cpa:.0f} ({cpa_ratio:.2f}x) — better",
                    "device_cpa": device_cpa,
                    "overall_cpa": overall_cpa,
                    "confidence": 75,
                })

    return recommendations


# ─── Execution ────────────────────────────────────────

def pause_keyword(client, campaign_id, ad_group_id, criterion_id):
    """Pause a keyword via Google Ads API."""
    from google.protobuf import field_mask_pb2
    service = client.get_service("AdGroupCriterionService")
    resource_name = service.ad_group_criterion_path(CUSTOMER_ID, ad_group_id, criterion_id)

    op = client.get_type("AdGroupCriterionOperation")
    criterion = op.update
    criterion.resource_name = resource_name
    criterion.status = client.enums.AdGroupCriterionStatusEnum.PAUSED
    client.copy_from(op.update_mask, field_mask_pb2.FieldMask(paths=["status"]))

    try:
        response = service.mutate_ad_group_criteria(customer_id=CUSTOMER_ID, operations=[op])
        return True, response.results[0].resource_name
    except Exception as e:
        return False, str(e)


def update_device_bid(client, campaign_id, device_type, modifier):
    """Update device bid modifier for a campaign."""
    from google.protobuf import field_mask_pb2

    # Map device string to enum
    DEVICE_MAP = {
        "MOBILE": 30001,
        "DESKTOP": 30000,
        "TABLET": 30002,
        "CONNECTED_TV": 30004,
    }
    device_id = DEVICE_MAP.get(device_type.upper())
    if not device_id:
        return False, f"Unknown device: {device_type}"

    service = client.get_service("CampaignCriterionService")
    ga = client.get_service("GoogleAdsService")

    # Check if criterion already exists
    query = f"""
        SELECT campaign_criterion.criterion_id, campaign_criterion.resource_name,
               campaign_criterion.bid_modifier
        FROM campaign_criterion
        WHERE campaign.id = {campaign_id}
          AND campaign_criterion.type = 'DEVICE'
          AND campaign_criterion.device.type = '{device_type.upper()}'
    """

    existing_rn = None
    try:
        for row in ga.search(customer_id=CUSTOMER_ID, query=query):
            existing_rn = row.campaign_criterion.resource_name
            break
    except Exception:
        pass

    bid_modifier_value = 1.0 + modifier  # e.g., -0.15 → 0.85

    try:
        if existing_rn:
            op = client.get_type("CampaignCriterionOperation")
            criterion = op.update
            criterion.resource_name = existing_rn
            criterion.bid_modifier = bid_modifier_value
            client.copy_from(op.update_mask, field_mask_pb2.FieldMask(paths=["bid_modifier"]))
        else:
            op = client.get_type("CampaignCriterionOperation")
            criterion = op.create
            criterion.campaign = client.get_service("CampaignService").campaign_path(CUSTOMER_ID, campaign_id)
            criterion.device.type_ = client.enums.DeviceEnum[device_type.upper()].value
            criterion.bid_modifier = bid_modifier_value

        response = service.mutate_campaign_criteria(customer_id=CUSTOMER_ID, operations=[op])
        return True, response.results[0].resource_name
    except Exception as e:
        return False, str(e)


def execute_keyword_pauses(client, auto_pause, dry_run=False):
    """Execute keyword pauses with guardrails."""
    db = get_db()
    cur = db.cursor()
    results = []

    for kw in auto_pause:
        cid = kw["campaign_id"]
        count = get_auto_action_count_today(cur, cid)
        if count >= MAX_AUTO_ACTIONS_PER_CAMPAIGN:
            kw["skipped"] = True
            kw["skip_reason"] = "Daily action limit"
            results.append(kw)
            continue

        if dry_run:
            kw["applied"] = False
            kw["dry_run"] = True
            results.append(kw)
            continue

        success, result = pause_keyword(client, cid, kw["ad_group_id"], kw["criterion_id"])
        kw["applied"] = success
        kw["error"] = result if not success else None

        if success:
            log_campaign_change(
                cur, kw["campaign_name"], "keyword_pause",
                f'Paused keyword "{kw["keyword"]}" — {kw["reason"]}',
                f'"{kw["keyword"]}" (active)', f'"{kw["keyword"]}" (paused)',
                campaign_id=cid,
            )

        results.append(kw)

    db.commit()
    cur.close()
    db.close()
    return results


def execute_device_bids(client, device_recs, dry_run=False):
    """Execute device bid modifier changes."""
    db = get_db()
    cur = db.cursor()
    results = []

    for rec in device_recs:
        cid = rec["campaign_id"]
        count = get_auto_action_count_today(cur, cid)
        if count >= MAX_AUTO_ACTIONS_PER_CAMPAIGN:
            rec["skipped"] = True
            results.append(rec)
            continue

        if dry_run:
            rec["applied"] = False
            rec["dry_run"] = True
            results.append(rec)
            continue

        success, result = update_device_bid(client, cid, rec["device"], rec["modifier"])
        rec["applied"] = success
        rec["error"] = result if not success else None

        if success:
            log_campaign_change(
                cur, rec["campaign_name"], "device_bid",
                f'Device {rec["device"]} bid {rec["modifier"]:+.0%} — {rec["reason"]}',
                "1.0", f"{1+rec['modifier']:.2f}",
                campaign_id=cid,
            )

        results.append(rec)

    db.commit()
    cur.close()
    db.close()
    return results


# ─── Telegram Report ──────────────────────────────────

def send_report(kw_results, kw_approvals, device_results, start_time, dry_run):
    now = datetime.now()
    lines = [f"🔍 <b>Google Search Manager</b> — {now.strftime('%b %-d')}"]
    if dry_run:
        lines.append("<i>DRY RUN</i>")

    kw_applied = [k for k in kw_results if k.get("applied") or k.get("dry_run")]
    dev_applied = [d for d in device_results if d.get("applied") or d.get("dry_run")]
    total_waste = sum(k["cost"] for k in kw_applied)

    if kw_applied:
        lines.append(f"\n⏸️ <b>Keywords Paused ({len(kw_applied)}):</b>")
        for k in sorted(kw_applied, key=lambda x: x["cost"], reverse=True)[:8]:
            lines.append(f'  • "{k["keyword"]}" — ${k["cost"]:.0f}, {k["reason"]}')
            lines.append(f'    → {k["campaign_name"][:45]}')
        if total_waste > 0:
            lines.append(f"  Total waste stopped: ${total_waste:,.0f}")

    if dev_applied:
        lines.append(f"\n📱 <b>Device Bid Changes ({len(dev_applied)}):</b>")
        for d in dev_applied[:5]:
            arrow = "↑" if d["modifier"] > 0 else "↓"
            lines.append(f"  • {d['campaign_name'][:40]} — {d['device']} {arrow}{abs(d['modifier'])*100:.0f}%")

    if kw_approvals:
        lines.append(f"\n⏳ <b>Need review ({len(kw_approvals)}):</b>")
        for k in kw_approvals[:5]:
            lines.append(f'  • "{k["keyword"]}" ${k["cost"]:.0f} — {k["reason"][:60]}')

    if not kw_applied and not dev_applied and not kw_approvals:
        lines.append("\n✅ No actions needed today.")

    send_telegram("\n".join(lines))

    # Send approval cards for keyword pauses
    if not dry_run:
        for k in kw_approvals:
            action_id = _uid()
            text = (
                f'⚠️ <b>Keyword Pause Review</b>\n'
                f'Keyword: "{k["keyword"]}" ({k["match_type"]})\n'
                f'Campaign: {k["campaign_name"]}\n'
                f'Spend: ${k["cost"]:.0f} | Clicks: {k["clicks"]} | Conv: {k["conversions"]:.1f}\n'
                f'Reason: {k["reason"]}\n'
                f'Confidence: {k.get("confidence", 70)}%'
            )
            reply_markup = json.dumps({
                "inline_keyboard": [[
                    {"text": "✅ Pause", "callback_data": f"approve:{AGENT_SLUG}:{action_id}"},
                    {"text": "❌ Keep", "callback_data": f"reject:{AGENT_SLUG}:{action_id}"},
                ]]
            })
            send_telegram(text, reply_markup=reply_markup)


# ─── DB Logging ───────────────────────────────────────

def log_run(kw_results, device_results, kw_approvals, start_time, dry_run):
    if dry_run:
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        agent_id = ensure_agent(cur)

        applied_kw = len([k for k in kw_results if k.get("applied")])
        applied_dev = len([d for d in device_results if d.get("applied")])
        output = {
            "keywords_paused": applied_kw,
            "device_bids_changed": applied_dev,
            "pending_review": len(kw_approvals),
        }

        cur.execute(
            'INSERT INTO "AgentRun" (id, "agentId", status, input, output, "findingsCount", "recsCount", "startedAt", "completedAt", "createdAt") '
            "VALUES (%s, %s, 'done', %s, %s, %s, %s, %s, NOW(), NOW())",
            (_uid(), agent_id, json.dumps({"type": "google-search-manager"}),
             json.dumps(output), applied_kw + applied_dev + len(kw_approvals),
             applied_kw + applied_dev, start_time),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"  DB error: {e}")


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Google Search Manager")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    start_time = datetime.now(timezone.utc)
    print(f"🔍 Google Search Manager — {start_time.strftime('%Y-%m-%d %H:%M UTC')}")
    if args.dry_run:
        print("   ⚠️  DRY RUN")
    print()

    # Knowledge
    print("Loading context...")
    knowledge = load_knowledge_context()
    print(f"  Knowledge: {len(knowledge)} chars")

    # Google Ads client
    client = get_client()

    # Data collection
    print("\nFetching keyword data...")
    keyword_data = fetch_keyword_data(client, days=args.days)
    print(f"  {len(keyword_data)} keywords")

    print("Fetching device data...")
    device_data = fetch_device_data(client, days=args.days)
    print(f"  {len(device_data)} device records")

    print("Fetching campaign start dates...")
    start_dates = fetch_campaign_start_dates(client)
    print(f"  {len(start_dates)} campaigns with dates")

    # CPA spike check
    print("\nChecking CPA spike...")
    # Quick check: compare yesterday vs day before for Google
    from platforms import get_connector
    try:
        g = get_connector("google_ads")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        day_before = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
        m1 = g.query_metrics(day_before, day_before)
        m2 = g.query_metrics(yesterday, yesterday)
        if m1.total_conversions > 0 and m2.total_conversions > 0:
            cpa1 = m1.total_spend / m1.total_conversions
            cpa2 = m2.total_spend / m2.total_conversions
            if cpa1 > 0 and (cpa2 - cpa1) / cpa1 > CPA_SPIKE_FREEZE_PCT:
                print(f"  🚨 CPA spike: ${cpa1:.0f}→${cpa2:.0f}. FREEZING all actions.")
                send_telegram(
                    f"🚨 <b>Google CPA spike detected — Search Manager frozen</b>\n"
                    f"CPA: ${cpa1:.0f} → ${cpa2:.0f} ({(cpa2-cpa1)/cpa1*100:+.0f}%)"
                )
                return
        print("  No spike detected")
    except Exception as e:
        print(f"  CPA check failed: {e}")

    # Analysis
    print("\nAnalyzing keywords...")
    auto_pause, kw_approvals = analyze_keywords(keyword_data, start_dates)
    print(f"  Auto-pause: {len(auto_pause)}")
    print(f"  Need approval: {len(kw_approvals)}")

    print("\nAnalyzing device bids...")
    device_recs = analyze_device_bids(device_data, start_dates)
    print(f"  Device bid recommendations: {len(device_recs)}")

    # Execute
    print("\nExecuting keyword pauses...")
    kw_results = execute_keyword_pauses(client, auto_pause, dry_run=args.dry_run)
    applied_kw = len([k for k in kw_results if k.get("applied")])
    print(f"  Applied: {applied_kw}")

    print("Executing device bid changes...")
    dev_results = execute_device_bids(client, device_recs, dry_run=args.dry_run)
    applied_dev = len([d for d in dev_results if d.get("applied")])
    print(f"  Applied: {applied_dev}")

    if args.verbose:
        for k in kw_results:
            s = "✅" if k.get("applied") else "⏭️" if k.get("skipped") else "🔸"
            print(f'    {s} "{k["keyword"]}" — ${k["cost"]:.0f} — {k["reason"]}')

    # Report
    print("\nSending Telegram report...")
    send_report(kw_results, kw_approvals, dev_results, start_time, args.dry_run)

    # DB
    log_run(kw_results, dev_results, kw_approvals, start_time, args.dry_run)

    # Log file
    os.makedirs(LOG_DIR, exist_ok=True)
    log_file = os.path.join(LOG_DIR, f"{start_time.strftime('%Y-%m-%d')}.json")
    with open(log_file, "w") as f:
        json.dump({
            "timestamp": start_time.isoformat(),
            "dry_run": args.dry_run,
            "keywords_analyzed": len(keyword_data),
            "devices_analyzed": len(device_data),
            "keywords_paused": [k for k in kw_results if k.get("applied") or k.get("dry_run")],
            "device_bids_changed": [d for d in dev_results if d.get("applied") or d.get("dry_run")],
            "pending_review": kw_approvals,
        }, f, indent=2, default=str)
    print(f"\nLog: {log_file}")
    print(f"Runtime: {(datetime.now(timezone.utc) - start_time).total_seconds():.0f}s")


if __name__ == "__main__":
    main()
