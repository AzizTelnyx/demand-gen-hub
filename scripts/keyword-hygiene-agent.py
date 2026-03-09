#!/usr/bin/env python3
"""
Weekly Keyword Hygiene Agent
Checks keyword-campaign alignment, cross-campaign overlap, and new keyword validation.

Run: python scripts/keyword-hygiene-agent.py [--dry-run]
Schedule: Sundays 3 AM PST
"""

import json, os, sys, re, argparse, urllib.request
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from glob import glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ─── Config ───────────────────────────────────────────

CUSTOMER_ID = "2356650573"
LOGIN_CUSTOMER_ID = "2893524941"
CRED_PATH = os.path.expanduser("~/.config/google-ads/credentials.json")
LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/keyword-hygiene")
DB_URL = "postgresql://localhost:5432/dghub"

OPENCLAW_BASE = "http://127.0.0.1:18789/v1/chat/completions"
OPENCLAW_MODEL = "anthropic/claude-sonnet-4-20250514"
OPENCLAW_TOKEN = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "")

BOT_TOKEN = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
CHAT_ID = "-1003786506284"
THREAD_ID = 164

CONFIDENCE_THRESHOLD = 80

# ─── Competitor & Category Lists ──────────────────────

COMPETITORS = [
    "twilio", "vonage", "bandwidth", "plivo", "sinch", "messagebird",
    "nexmo", "ringcentral", "ring central", "8x8", "five9", "genesys",
    "vapi", "retell", "bland", "synthflow", "voiceflow", "elevenlabs",
    "eleven labs", "livekit", "live kit",
]

BRAND_TERMS = {"telnyx", "clawdtalk", "clawd", "clawd talk"}

GENERIC_VOICE_AI_TERMS = [
    "voice ai", "ai agent", "conversational ai", "tts", "stt",
    "text to speech", "speech to text", "ai voice", "voice bot",
    "ai assistant", "voice assistant", "ai calling", "ai phone",
    "voice automation", "conversational agent", "ai voice agent",
    "voice ai agent", "ai agent builder", "voice ai platform",
]

CONTACT_CENTER_TERMS = [
    "contact center", "call center", "ccaas", "ivr", "acd",
    "call routing", "call queue", "agent desktop", "call center software",
    "contact center ai", "call center ai", "contact center solution",
]

PRODUCT_KEYWORDS = {
    "sip": ["sip trunk", "sip trunking", "sip provider", "sip service", "sip termination", "sip origination"],
    "sms": ["sms api", "sms gateway", "bulk sms", "10dlc", "a2p sms", "messaging api", "mms api"],
    "numbers": ["phone numbers", "did", "toll free", "virtual number", "phone number api", "did provider"],
    "iot": ["iot sim", "m2m sim", "iot connectivity", "sim card api", "esim", "iot platform"],
    "voice_api": ["voice api", "programmable voice", "call control", "webrtc", "voice sdk"],
}


# ─── Google Ads Client ────────────────────────────────

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


# ─── Data Fetch ───────────────────────────────────────

def fetch_all_keywords(client):
    """Fetch all active keywords from search campaigns."""
    ga = client.get_service("GoogleAdsService")
    query = """
        SELECT campaign.name, campaign.id,
               ad_group.name, ad_group.id,
               ad_group_criterion.criterion_id,
               ad_group_criterion.keyword.text,
               ad_group_criterion.keyword.match_type,
               ad_group_criterion.status
        FROM keyword_view
        WHERE campaign.status = 'ENABLED'
          AND ad_group_criterion.status != 'REMOVED'
          AND campaign.advertising_channel_type = 'SEARCH'
    """
    keywords = []
    for row in ga.search(customer_id=CUSTOMER_ID, query=query):
        match_type_val = row.ad_group_criterion.keyword.match_type
        # Convert enum to string
        match_map = {0: "UNSPECIFIED", 1: "UNKNOWN", 2: "EXACT", 3: "PHRASE", 4: "BROAD"}
        mt = match_map.get(match_type_val, str(match_type_val))
        if hasattr(match_type_val, 'name'):
            mt = match_type_val.name

        status_val = row.ad_group_criterion.status
        st = status_val.name if hasattr(status_val, 'name') else str(status_val)

        keywords.append({
            "campaign": row.campaign.name,
            "campaign_id": row.campaign.id,
            "adGroup": row.ad_group.name,
            "adGroup_id": row.ad_group.id,
            "criterion_id": row.ad_group_criterion.criterion_id,
            "keyword": row.ad_group_criterion.keyword.text.lower(),
            "matchType": mt,
            "status": st,
        })
    return keywords


# ─── Campaign Classification ─────────────────────────

def classify_campaign(campaign_name):
    """Determine campaign type from name."""
    name_lower = campaign_name.lower()

    # Brand
    for b in BRAND_TERMS:
        if b in name_lower:
            return "brand"

    # Competitor
    for c in COMPETITORS:
        if c in name_lower:
            return "competitor"

    # Contact Center
    if "contact center" in name_lower or "call center" in name_lower:
        return "contact_center"

    # Product-specific
    for prod, _ in PRODUCT_KEYWORDS.items():
        if prod == "sip" and "sip" in name_lower and "ai" not in name_lower:
            return "product_sip"
        if prod == "sms" and ("sms" in name_lower or "10dlc" in name_lower):
            return "product_sms"
        if prod == "numbers" and "number" in name_lower:
            return "product_numbers"
        if prod == "iot" and ("iot" in name_lower or "m2m" in name_lower or "sim" in name_lower):
            return "product_iot"
        if prod == "voice_api" and "voice api" in name_lower:
            return "product_voice_api"

    # AI Agent (MOFU/TOFU AI Agent)
    if "ai agent" in name_lower or "voice ai" in name_lower:
        return "ai_agent"

    return "unknown"


def extract_region(campaign_name):
    """Extract region from campaign name."""
    name_lower = campaign_name.lower()
    for r in ["amer", "emea", "apac", "mena", "global"]:
        if r in name_lower:
            return r.upper()
    return "UNKNOWN"


def extract_competitor_from_campaign(campaign_name):
    """Extract the specific competitor targeted by a competitor campaign."""
    name_lower = campaign_name.lower()
    for c in COMPETITORS:
        if c in name_lower:
            return c
    return None


# ─── Check 1: Keyword-Campaign Alignment ─────────────

def check_alignment_rules(keyword_text, campaign_type, campaign_name):
    """
    Rule-based alignment check. Returns (is_misaligned, reason, confidence).
    confidence 0-100. High confidence = clear misalignment.
    """
    kw = keyword_text.lower()

    if campaign_type == "competitor":
        competitor = extract_competitor_from_campaign(campaign_name)
        # In competitor campaigns, keywords should mention the competitor
        has_competitor = any(c in kw for c in COMPETITORS)
        is_generic = any(g in kw for g in GENERIC_VOICE_AI_TERMS)
        is_contact_center = any(cc in kw for cc in CONTACT_CENTER_TERMS)

        if not has_competitor and (is_generic or is_contact_center):
            return True, f"Generic term '{kw}' in competitor campaign ({campaign_name})", 90
        if not has_competitor and not is_generic:
            # Could be a relevant modifier — lower confidence
            return True, f"Non-competitor keyword '{kw}' in competitor campaign", 60

    elif campaign_type == "ai_agent":
        # Flag competitor terms that should be in competitor campaigns
        for c in COMPETITORS:
            if c in kw:
                return True, f"Competitor term '{c}' found in AI Agent campaign — should be in competitor campaign", 85

    elif campaign_type == "contact_center":
        for c in COMPETITORS:
            if c in kw:
                return True, f"Competitor term '{c}' in Contact Center campaign", 85
        # Generic voice AI terms don't belong here unless also contact-center
        is_cc = any(cc in kw for cc in CONTACT_CENTER_TERMS)
        is_generic_ai = any(g in kw for g in GENERIC_VOICE_AI_TERMS)
        if is_generic_ai and not is_cc:
            return True, f"Voice AI term '{kw}' in Contact Center campaign — belongs in AI Agent campaign", 75

    elif campaign_type.startswith("product_"):
        prod = campaign_type.replace("product_", "")
        for c in COMPETITORS:
            if c in kw:
                return True, f"Competitor term '{c}' in product campaign", 85
        is_generic_ai = any(g in kw for g in GENERIC_VOICE_AI_TERMS)
        if is_generic_ai:
            return True, f"Generic AI term '{kw}' in product ({prod}) campaign", 80

    elif campaign_type == "brand":
        has_brand = any(b in kw for b in BRAND_TERMS)
        if not has_brand:
            return True, f"Non-brand keyword '{kw}' in brand campaign", 70

    return False, "", 0


def ai_classify_borderline(keywords_batch, knowledge_context):
    """Use AI to classify borderline keywords (confidence 50-79 from rules)."""
    if not OPENCLAW_TOKEN or not keywords_batch:
        return {}

    terms_text = "\n".join(
        f'{i+1}. keyword: "{kw["keyword"]}" | campaign: "{kw["campaign"]}" | '
        f'campaign type: {kw["campaign_type"]} | rule reason: {kw.get("rule_reason", "none")}'
        for i, kw in enumerate(keywords_batch)
    )

    system_prompt = f"""You are a Google Ads keyword hygiene analyst for Telnyx (B2B cloud communications).

CONTEXT:
{knowledge_context[:3000]}

CAMPAIGN TYPE RULES:
- competitor: ONLY keywords mentioning specific competitors (twilio, vapi, elevenlabs, livekit, etc). No generic terms.
- ai_agent: Generic voice AI, AI agent, builder terms. No competitor-specific terms.
- contact_center: Only contact center / call center terms. No voice AI or competitor terms.
- product_*: Only product-specific terms (SIP, SMS, Numbers, IoT, Voice API). No generic or competitor terms.
- brand: Only brand terms (telnyx, clawdtalk).

For each keyword, decide: does it BELONG in its campaign or is it MISALIGNED?

Respond with JSON array:
[{{"index": N, "misaligned": true/false, "confidence": 0-100, "reason": "brief", "suggested_campaign_type": "where it should go"}}]"""

    try:
        data = json.dumps({
            "model": OPENCLAW_MODEL,
            "max_tokens": 4000,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Classify these {len(keywords_batch)} keywords:\n\n{terms_text}"},
            ],
            "temperature": 0.1,
        }).encode()

        req = urllib.request.Request(
            OPENCLAW_BASE, data=data,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {OPENCLAW_TOKEN}"},
        )
        with urllib.request.urlopen(req, timeout=90) as resp:
            result = json.loads(resp.read())

        content = result["choices"][0]["message"]["content"].strip()
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```\s*$', '', content)
        start = content.find('[')
        if start == -1:
            return {}
        depth = 0
        for i in range(start, len(content)):
            if content[i] == '[': depth += 1
            elif content[i] == ']':
                depth -= 1
                if depth == 0:
                    items = json.loads(content[start:i+1])
                    return {item["index"]: item for item in items}
        return {}
    except Exception as e:
        print(f"  AI classification error: {e}")
        return {}


def check_keyword_alignment(keywords, knowledge_context):
    """Check all keywords for campaign alignment issues."""
    issues = []
    borderline = []

    # Group by campaign for efficiency
    by_campaign = defaultdict(list)
    for kw in keywords:
        by_campaign[kw["campaign"]].append(kw)

    for campaign_name, kws in by_campaign.items():
        campaign_type = classify_campaign(campaign_name)
        if campaign_type == "unknown":
            continue

        for kw in kws:
            misaligned, reason, confidence = check_alignment_rules(
                kw["keyword"], campaign_type, campaign_name
            )
            if misaligned:
                issue = {
                    "type": "misalignment",
                    "keyword": kw["keyword"],
                    "campaign": campaign_name,
                    "campaign_id": kw["campaign_id"],
                    "adGroup": kw["adGroup"],
                    "adGroup_id": kw["adGroup_id"],
                    "criterion_id": kw["criterion_id"],
                    "matchType": kw["matchType"],
                    "campaign_type": campaign_type,
                    "reason": reason,
                    "confidence": confidence,
                }
                if confidence >= CONFIDENCE_THRESHOLD:
                    issues.append(issue)
                else:
                    kw["campaign_type"] = campaign_type
                    kw["rule_reason"] = reason
                    kw["_issue"] = issue
                    borderline.append(kw)

    # AI classification for borderline cases (batch of 30)
    if borderline:
        print(f"  Sending {len(borderline)} borderline keywords to AI...")
        for batch_start in range(0, len(borderline), 30):
            batch = borderline[batch_start:batch_start+30]
            ai_results = ai_classify_borderline(batch, knowledge_context)
            for i, kw in enumerate(batch):
                idx = i + 1
                ai = ai_results.get(idx, {})
                issue = kw["_issue"]
                if ai.get("misaligned", False):
                    issue["confidence"] = ai.get("confidence", issue["confidence"])
                    issue["reason"] = ai.get("reason", issue["reason"])
                    issue["suggested_campaign_type"] = ai.get("suggested_campaign_type", "")
                    issue["ai_classified"] = True
                    issues.append(issue)
                # If AI says it's fine, drop it

    return issues


# ─── Check 2: Cross-Campaign Overlap ─────────────────

def check_overlap(keywords):
    """Find keywords appearing in multiple campaigns within the same region."""
    issues = []

    # Group by region
    by_region = defaultdict(list)
    for kw in keywords:
        region = extract_region(kw["campaign"])
        by_region[region].append(kw)

    for region, kws in by_region.items():
        # Group by keyword text
        by_keyword = defaultdict(list)
        for kw in kws:
            by_keyword[kw["keyword"]].append(kw)

        for kw_text, instances in by_keyword.items():
            # Only flag if in multiple campaigns
            campaign_names = set(inst["campaign"] for inst in instances)
            if len(campaign_names) < 2:
                continue

            # Self-competition: same match type, different campaigns
            match_types = defaultdict(list)
            for inst in instances:
                match_types[inst["matchType"]].append(inst)

            for mt, mt_instances in match_types.items():
                mt_campaigns = set(inst["campaign"] for inst in mt_instances)
                if len(mt_campaigns) >= 2:
                    issues.append({
                        "type": "self_competition",
                        "keyword": kw_text,
                        "matchType": mt,
                        "region": region,
                        "campaigns": list(mt_campaigns),
                        "count": len(mt_campaigns),
                        "confidence": 90,
                        "reason": f'"{kw_text}" ({mt}) in {len(mt_campaigns)} campaigns in {region}: {", ".join(list(mt_campaigns)[:3])}',
                    })

            # Broad match risk: broad in one campaign, exact/phrase in another
            broad_campaigns = set(inst["campaign"] for inst in instances if inst["matchType"] == "BROAD")
            exact_phrase_campaigns = set(
                inst["campaign"] for inst in instances if inst["matchType"] in ("EXACT", "PHRASE")
            )
            overlap = broad_campaigns & exact_phrase_campaigns
            cannibalize = broad_campaigns - exact_phrase_campaigns
            if cannibalize and exact_phrase_campaigns:
                for bc in cannibalize:
                    issues.append({
                        "type": "broad_match_risk",
                        "keyword": kw_text,
                        "region": region,
                        "broad_campaign": bc,
                        "exact_phrase_campaigns": list(exact_phrase_campaigns),
                        "confidence": 75,
                        "reason": f'Broad match "{kw_text}" in "{bc}" may cannibalize exact/phrase in: {", ".join(list(exact_phrase_campaigns)[:2])}',
                    })

    return issues


# ─── Check 3: New Keyword Validation ─────────────────

def check_new_keywords(current_keywords, knowledge_context):
    """Compare against last week's snapshot, validate new additions."""
    # Find most recent previous snapshot
    snapshots = sorted(glob(os.path.join(LOG_DIR, "*.json")))
    if not snapshots:
        print("  No previous snapshot found — skipping new keyword check")
        return [], True  # first_run=True

    with open(snapshots[-1]) as f:
        prev = json.load(f)

    prev_set = set()
    for kw in prev.get("keywords", []):
        prev_set.add((kw["campaign"], kw["keyword"], kw["matchType"]))

    new_keywords = []
    for kw in current_keywords:
        key = (kw["campaign"], kw["keyword"], kw["matchType"])
        if key not in prev_set:
            new_keywords.append(kw)

    if not new_keywords:
        print("  No new keywords since last snapshot")
        return [], False

    print(f"  {len(new_keywords)} new keywords found since last snapshot")

    # Validate new keywords with same alignment rules
    issues = []
    for kw in new_keywords:
        campaign_type = classify_campaign(kw["campaign"])
        if campaign_type == "unknown":
            continue
        misaligned, reason, confidence = check_alignment_rules(
            kw["keyword"], campaign_type, kw["campaign"]
        )
        if misaligned and confidence >= 60:
            issues.append({
                "type": "new_keyword_misaligned",
                "keyword": kw["keyword"],
                "campaign": kw["campaign"],
                "campaign_id": kw["campaign_id"],
                "adGroup": kw["adGroup"],
                "adGroup_id": kw["adGroup_id"],
                "criterion_id": kw["criterion_id"],
                "matchType": kw["matchType"],
                "campaign_type": campaign_type,
                "reason": f"NEW: {reason}",
                "confidence": confidence,
            })

    return issues, False


# ─── Auto-Fix Logic ──────────────────────────────────

def is_junk_keyword(keyword_text):
    """Detect clearly junk keywords (non-English, irrelevant)."""
    kw = keyword_text.strip()
    # Very short or very long
    if len(kw) < 2 or len(kw) > 100:
        return True
    # Non-ASCII heavy (likely non-English)
    ascii_ratio = sum(1 for c in kw if ord(c) < 128) / max(len(kw), 1)
    if ascii_ratio < 0.5:
        return True
    return False


def auto_fix_pause_junk(client, keywords, dry_run=True):
    """Pause keywords that are clearly junk."""
    junk = [kw for kw in keywords if is_junk_keyword(kw["keyword"])]
    if not junk:
        return []

    print(f"  Found {len(junk)} junk keywords to pause")
    if dry_run:
        for j in junk:
            print(f"    [DRY] Would pause: \"{j['keyword']}\" in {j['campaign']}")
        return junk

    ga_service = client.get_service("AdGroupCriterionService")
    operations = []
    for j in junk:
        op = client.get_type("AdGroupCriterionOperation")
        criterion = op.update
        criterion.resource_name = (
            f"customers/{CUSTOMER_ID}/adGroupCriteria/{j['adGroup_id']}~{j['criterion_id']}"
        )
        criterion.status = client.enums.AdGroupCriterionStatusEnum.PAUSED
        from google.protobuf import field_mask_pb2
        field_mask = field_mask_pb2.FieldMask(paths=["status"])
        op.update_mask.CopyFrom(field_mask)
        operations.append(op)

    if operations:
        try:
            ga_service.mutate_ad_group_criteria(
                customer_id=CUSTOMER_ID, operations=operations
            )
            print(f"  Paused {len(operations)} junk keywords")
        except Exception as e:
            print(f"  Error pausing junk keywords: {e}")
            return []

    return junk


# ─── Telegram Notifications ──────────────────────────

def telegram_send(text, reply_markup=None):
    """Send message to Agent Activity topic."""
    payload = {
        "chat_id": CHAT_ID,
        "message_thread_id": THREAD_ID,
        "text": text,
        "parse_mode": "HTML",
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  Telegram error: {e}")
        return None


def send_summary(issues, junk_fixed, overlap_issues, new_kw_issues, total_keywords, dry_run, first_run):
    """Send summary to Telegram."""
    alignment_issues = [i for i in issues if i["type"] == "misalignment"]
    auto_fixable = [i for i in alignment_issues if i["confidence"] >= CONFIDENCE_THRESHOLD]
    needs_review = [i for i in alignment_issues if i["confidence"] < CONFIDENCE_THRESHOLD]

    lines = [f"<b>🔑 Keyword Hygiene Agent</b> — {datetime.now().strftime('%b %d')}"]
    if dry_run:
        lines.append("<i>DRY RUN — no changes applied</i>")
    if first_run:
        lines.append("<i>First run — no previous snapshot for comparison</i>")

    lines.append(f"\n📊 <b>{total_keywords:,}</b> keywords scanned")

    if alignment_issues:
        lines.append(f"\n⚠️ <b>{len(alignment_issues)} misaligned keywords</b>")
        lines.append(f"  • {len(auto_fixable)} high confidence (≥{CONFIDENCE_THRESHOLD}%)")
        lines.append(f"  • {len(needs_review)} need review")

    if overlap_issues:
        self_comp = [i for i in overlap_issues if i["type"] == "self_competition"]
        broad_risk = [i for i in overlap_issues if i["type"] == "broad_match_risk"]
        lines.append(f"\n🔄 <b>{len(overlap_issues)} overlap issues</b>")
        if self_comp:
            lines.append(f"  • {len(self_comp)} self-competition")
        if broad_risk:
            lines.append(f"  • {len(broad_risk)} broad match risks")

    if new_kw_issues:
        lines.append(f"\n🆕 <b>{len(new_kw_issues)} new misaligned keywords</b>")

    if junk_fixed:
        lines.append(f"\n🗑️ <b>{len(junk_fixed)} junk keywords {'would be paused' if dry_run else 'paused'}</b>")

    if not alignment_issues and not overlap_issues and not new_kw_issues and not junk_fixed:
        lines.append("\n✅ All keywords properly aligned!")

    telegram_send("\n".join(lines))


def send_issue_cards(issues, dry_run):
    """Send individual issue cards with inline buttons for review items."""
    review_items = [i for i in issues if i["confidence"] < CONFIDENCE_THRESHOLD]

    for issue in review_items[:20]:  # Cap at 20 cards
        text = (
            f"<b>🔍 Keyword Review</b>\n"
            f"Keyword: <code>{issue['keyword']}</code>\n"
            f"Campaign: {issue['campaign']}\n"
            f"Type: {issue.get('campaign_type', 'unknown')}\n"
            f"Match: {issue.get('matchType', '?')}\n"
            f"Confidence: {issue['confidence']}%\n"
            f"Reason: {issue['reason']}"
        )

        # Callback data format: kh:{action}:{criterion_id}:{campaign_id}
        criterion_id = issue.get("criterion_id", "0")
        campaign_id = issue.get("campaign_id", "0")

        reply_markup = {
            "inline_keyboard": [[
                {"text": "✅ Fix (Pause)", "callback_data": f"kh:fix:{criterion_id}:{campaign_id}"},
                {"text": "❌ Ignore", "callback_data": f"kh:ignore:{criterion_id}:{campaign_id}"},
            ]]
        }

        if not dry_run:
            telegram_send(text, reply_markup)
        else:
            print(f"  [DRY] Would send card: {issue['keyword']} in {issue['campaign']}")


# ─── DB Logging ───────────────────────────────────────

def log_to_db(issues, overlap_issues, new_kw_issues, junk_fixed, total_keywords, start_time, end_time, dry_run):
    """Log run to Agent/AgentRun/Recommendation tables."""
    import psycopg2

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Get or create agent
    cur.execute("SELECT id FROM \"Agent\" WHERE slug = 'keyword-hygiene'")
    row = cur.fetchone()
    if not row:
        cur.execute("""INSERT INTO "Agent" (id, slug, name, description, model, schedule, enabled, "createdAt")
            VALUES (gen_random_uuid()::text, 'keyword-hygiene', 'Keyword Hygiene Agent',
            'Weekly check: keyword-campaign alignment, overlap detection, new keyword validation',
            'python-script', '0 3 * * 0', true, NOW()) RETURNING id""")
        agent_id = cur.fetchone()[0]
    else:
        agent_id = row[0]

    all_issues = issues + overlap_issues + new_kw_issues
    summary = {
        "summary": (
            f"Scanned {total_keywords} keywords. "
            f"Found {len(issues)} misalignment, {len(overlap_issues)} overlap, "
            f"{len(new_kw_issues)} new keyword issues. "
            f"{len(junk_fixed)} junk keywords {'paused' if not dry_run else 'flagged'}."
        ),
        "stats": {
            "total_keywords": total_keywords,
            "misalignment_issues": len(issues),
            "overlap_issues": len(overlap_issues),
            "new_keyword_issues": len(new_kw_issues),
            "junk_fixed": len(junk_fixed),
        },
    }

    cur.execute("""INSERT INTO "AgentRun" (id, "agentId", status, input, output, "findingsCount", "recsCount",
        "startedAt", "completedAt", "createdAt")
        VALUES (gen_random_uuid()::text, %s, 'done', %s, %s, %s, %s, %s, %s, NOW()) RETURNING id""",
        (agent_id,
         json.dumps({"dry_run": dry_run}),
         json.dumps(summary),
         len(all_issues),
         len([i for i in all_issues if i.get("confidence", 0) < CONFIDENCE_THRESHOLD]),
         start_time,
         end_time))
    run_id = cur.fetchone()[0]

    # Create Recommendations for flagged items
    for issue in all_issues:
        if issue.get("confidence", 0) < CONFIDENCE_THRESHOLD:
            status = "pending"
        else:
            status = "applied" if not dry_run else "pending"

        metadata = {
            "keyword": issue.get("keyword", ""),
            "campaign_id": issue.get("campaign_id"),
            "criterion_id": issue.get("criterion_id"),
            "matchType": issue.get("matchType"),
            "confidence": issue.get("confidence", 0),
            "issue_type": issue.get("type", ""),
        }

        action_text = {
            "misalignment": f'Move/pause "{issue.get("keyword", "")}" — wrong campaign',
            "self_competition": f'Resolve overlap: "{issue.get("keyword", "")}" in {issue.get("count", 0)} campaigns',
            "broad_match_risk": f'Review broad match: "{issue.get("keyword", "")}"',
            "new_keyword_misaligned": f'New keyword misaligned: "{issue.get("keyword", "")}"',
        }.get(issue.get("type", ""), f'Review: "{issue.get("keyword", "")}"')

        cur.execute("""INSERT INTO "Recommendation" (id, "agentRunId", type, severity, target, "targetId",
            action, rationale, impact, status, "createdAt")
            VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())""",
            (run_id,
             f'keyword-hygiene-{issue.get("type", "unknown")}',
             "high" if issue.get("confidence", 0) >= CONFIDENCE_THRESHOLD else "medium",
             issue.get("campaign", ""),
             str(issue.get("campaign_id", "")),
             action_text,
             issue.get("reason", ""),
             json.dumps(metadata),
             status))

    conn.commit()
    cur.close()
    conn.close()
    print(f"  DB: AgentRun {run_id} with {len(all_issues)} findings")
    return run_id


# ─── Knowledge Context ───────────────────────────────

def load_knowledge_context():
    """Load knowledge base context for AI grounding."""
    try:
        from lib.knowledge import load_knowledge_for_agent
        return load_knowledge_for_agent("keyword_hygiene")
    except Exception:
        # Fallback: read strategy file directly from disk
        strategy_path = os.path.join(os.path.dirname(__file__), "..", "knowledge", "telnyx-strategy.md")
        if os.path.exists(strategy_path):
            with open(strategy_path) as f:
                return f.read()
        return ""


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Weekly Keyword Hygiene Agent")
    parser.add_argument("--dry-run", action="store_true", help="Analyze only, no changes")
    parser.add_argument("--verbose", action="store_true", help="Show all issues")
    args = parser.parse_args()

    start_time = datetime.now(timezone.utc)
    print(f"🔑 Keyword Hygiene Agent — {start_time.strftime('%Y-%m-%d %H:%M UTC')}")
    if args.dry_run:
        print("   ⚠️  DRY RUN — no changes will be applied\n")

    # 1. Connect and fetch
    print("Connecting to Google Ads...")
    client = get_client()

    print("Fetching all active search keywords...")
    keywords = fetch_all_keywords(client)
    print(f"  {len(keywords)} keywords across {len(set(kw['campaign'] for kw in keywords))} campaigns")

    # 2. Load knowledge context
    print("\nLoading knowledge context...")
    knowledge_context = load_knowledge_context()

    # 3. Check alignment
    print("\n[1/3] Checking keyword-campaign alignment...")
    alignment_issues = check_keyword_alignment(keywords, knowledge_context)
    print(f"  {len(alignment_issues)} misalignment issues found")

    # 4. Check overlap
    print("\n[2/3] Checking cross-campaign overlap...")
    overlap_issues = check_overlap(keywords)
    print(f"  {len(overlap_issues)} overlap issues found")

    # 5. Check new keywords
    print("\n[3/3] Checking new keywords...")
    new_kw_issues, first_run = check_new_keywords(keywords, knowledge_context)
    print(f"  {len(new_kw_issues)} new keyword issues found")

    # 6. Auto-fix junk
    print("\nChecking for junk keywords...")
    junk_fixed = auto_fix_pause_junk(client, keywords, dry_run=args.dry_run)

    # 7. Summary
    total_issues = len(alignment_issues) + len(overlap_issues) + len(new_kw_issues)
    print(f"\n{'='*60}")
    print(f"RESULTS:")
    print(f"  Keywords scanned:     {len(keywords)}")
    print(f"  Misalignment issues:  {len(alignment_issues)}")
    print(f"  Overlap issues:       {len(overlap_issues)}")
    print(f"  New keyword issues:   {len(new_kw_issues)}")
    print(f"  Junk keywords:        {len(junk_fixed)}")
    print(f"  Total issues:         {total_issues}")
    print(f"{'='*60}")

    if args.verbose:
        if alignment_issues:
            print("\nMisalignment details:")
            for i in sorted(alignment_issues, key=lambda x: x["confidence"], reverse=True)[:20]:
                print(f"  [{i['confidence']}%] \"{i['keyword']}\" → {i['campaign']}")
                print(f"         {i['reason']}")
        if overlap_issues:
            print("\nOverlap details:")
            for i in overlap_issues[:15]:
                print(f"  [{i['type']}] \"{i['keyword']}\" — {i['reason']}")

    # 8. Save snapshot
    end_time = datetime.now(timezone.utc)
    snapshot = {
        "timestamp": start_time.isoformat(),
        "runtime_seconds": (end_time - start_time).total_seconds(),
        "dry_run": args.dry_run,
        "keywords": [
            {"campaign": kw["campaign"], "adGroup": kw["adGroup"],
             "keyword": kw["keyword"], "matchType": kw["matchType"], "status": kw["status"]}
            for kw in keywords
        ],
        "issues": alignment_issues + overlap_issues + new_kw_issues,
        "junk_fixed": [{"keyword": j["keyword"], "campaign": j["campaign"]} for j in junk_fixed],
        "summary": {
            "total_keywords": len(keywords),
            "misalignment": len(alignment_issues),
            "overlap": len(overlap_issues),
            "new_keyword_issues": len(new_kw_issues),
            "junk_fixed": len(junk_fixed),
        },
    }

    os.makedirs(LOG_DIR, exist_ok=True)
    snapshot_file = os.path.join(LOG_DIR, f"{start_time.strftime('%Y-%m-%d')}.json")
    with open(snapshot_file, "w") as f:
        json.dump(snapshot, f, indent=2)
    print(f"\nSnapshot saved: {snapshot_file}")

    # 9. Log to DB
    print("\nLogging to database...")
    try:
        log_to_db(alignment_issues, overlap_issues, new_kw_issues, junk_fixed,
                  len(keywords), start_time, end_time, args.dry_run)
    except Exception as e:
        print(f"  DB error: {e}")

    # 10. Telegram notifications
    print("\nSending Telegram notifications...")
    try:
        send_summary(alignment_issues, junk_fixed, overlap_issues, new_kw_issues,
                     len(keywords), args.dry_run, first_run)
        send_issue_cards(alignment_issues + new_kw_issues, args.dry_run)
    except Exception as e:
        print(f"  Telegram error: {e}")

    print(f"\nDone in {(end_time - start_time).total_seconds():.0f}s")


if __name__ == "__main__":
    main()
