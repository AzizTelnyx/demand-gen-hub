#!/usr/bin/env python3
"""
Autonomous Negative Keyword Agent (AI-Powered)
Analyzes Google Ads search terms using Claude Sonnet to score relevancy,
detect wrong intent, and auto-block wasteful terms (confidence >= 80).

Run: python scripts/negative-keyword-agent.py [--dry-run] [--days 7]
"""

import json, os, sys, re, argparse, urllib.request
from datetime import datetime, timezone, timedelta
from collections import defaultdict

# Add scripts/ to path for shared lib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ─── Config ───────────────────────────────────────────

CUSTOMER_ID = "2356650573"
LOGIN_CUSTOMER_ID = "2893524941"
CRED_PATH = os.path.expanduser("~/.config/google-ads/credentials.json")
LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/negative-keywords")
CONFIDENCE_THRESHOLD = 80  # Auto-apply above this
MIN_SPEND = 20.0           # Skip terms below this
MIN_IMPRESSIONS = 10       # Skip terms below this
CAMPAIGN_MIN_AGE_DAYS = 7  # Skip campaigns younger than this

OPENCLAW_BASE = "http://127.0.0.1:18789/v1/chat/completions"
OPENCLAW_TOKEN = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "")

# Protected brand terms
BRAND_TERMS = {"telnyx", "clawdtalk", "clawd"}


# (Old rule-based patterns removed — AI handles intent classification now)

STOP_WORDS = {
    "a", "an", "the", "in", "on", "at", "to", "for", "of", "and", "or",
    "is", "it", "by", "with", "from", "as", "be", "was", "are", "were",
    "this", "that", "not", "but", "can", "do", "has", "have", "had"
}

# Known competitors
COMPETITORS = [
    "twilio", "vonage", "bandwidth", "plivo", "sinch", "messagebird",
    "nexmo", "ring central", "ringcentral", "8x8", "five9", "genesys",
    "vapi", "retell", "bland", "synthflow", "voiceflow", "elevenlabs"
]


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


# ─── Data Collection ──────────────────────────────────

def fetch_search_terms(client, days=7):
    """Fetch search term report for last N days."""
    ga = client.get_service("GoogleAdsService")
    # Google Ads only supports LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS for DURING
    # For other ranges, use explicit date range
    VALID_DURING = {7: "LAST_7_DAYS", 14: "LAST_14_DAYS", 30: "LAST_30_DAYS"}
    if days in VALID_DURING:
        date_filter = f"segments.date DURING {VALID_DURING[days]}"
    else:
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        date_filter = f"segments.date BETWEEN '{start_date}' AND '{end_date}'"
    query = f"""
        SELECT
            search_term_view.search_term,
            campaign.id, campaign.name,
            metrics.impressions, metrics.clicks,
            metrics.cost_micros, metrics.conversions, metrics.all_conversions
        FROM search_term_view
        WHERE {date_filter}
          AND metrics.impressions > 0
          AND campaign.status = 'ENABLED'
        ORDER BY metrics.cost_micros DESC
        LIMIT 10000
    """
    results = []
    for row in ga.search(customer_id=CUSTOMER_ID, query=query):
        results.append({
            "search_term": row.search_term_view.search_term.lower(),
            "campaign_id": row.campaign.id,
            "campaign_name": row.campaign.name,
            "impressions": row.metrics.impressions,
            "clicks": row.metrics.clicks,
            "cost": row.metrics.cost_micros / 1_000_000,
            "conversions": row.metrics.conversions,
            "all_conversions": row.metrics.all_conversions,
        })
    return results


def fetch_campaign_keywords(client, campaign_ids):
    """Fetch target keywords for campaigns."""
    ga = client.get_service("GoogleAdsService")
    camp_keywords = defaultdict(list)
    
    query = """
        SELECT campaign.id, ad_group_criterion.keyword.text,
               ad_group_criterion.keyword.match_type
        FROM keyword_view
        WHERE campaign.status = 'ENABLED'
          AND ad_group_criterion.status != 'REMOVED'
        LIMIT 10000
    """
    for row in ga.search(customer_id=CUSTOMER_ID, query=query):
        if row.campaign.id in campaign_ids:
            camp_keywords[row.campaign.id].append(
                row.ad_group_criterion.keyword.text.lower()
            )
    return camp_keywords


def fetch_campaign_ads(client, campaign_ids):
    """Fetch ad copy headlines/descriptions per campaign."""
    ga = client.get_service("GoogleAdsService")
    camp_ad_themes = defaultdict(set)
    
    query = """
        SELECT campaign.id,
               ad_group_ad.ad.responsive_search_ad.headlines,
               ad_group_ad.ad.responsive_search_ad.descriptions
        FROM ad_group_ad
        WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
          AND ad_group_ad.status != 'REMOVED'
          AND campaign.status = 'ENABLED'
        LIMIT 5000
    """
    for row in ga.search(customer_id=CUSTOMER_ID, query=query):
        if row.campaign.id not in campaign_ids:
            continue
        rsa = row.ad_group_ad.ad.responsive_search_ad
        for h in (rsa.headlines or []):
            words = [w.lower() for w in h.text.split() if w.lower() not in STOP_WORDS and len(w) > 2]
            for i in range(len(words) - 1):
                camp_ad_themes[row.campaign.id].add(f"{words[i]} {words[i+1]}")
            if len(words) >= 3:
                camp_ad_themes[row.campaign.id].add(" ".join(words[:3]))
        for d in (rsa.descriptions or []):
            words = [w.lower() for w in d.text.split() if w.lower() not in STOP_WORDS and len(w) > 2]
            for i in range(len(words) - 1):
                camp_ad_themes[row.campaign.id].add(f"{words[i]} {words[i+1]}")
    return camp_ad_themes


def fetch_existing_negatives(client, campaign_ids):
    """Fetch existing negative keywords to avoid duplicates."""
    ga = client.get_service("GoogleAdsService")
    existing = defaultdict(set)
    
    query = """
        SELECT campaign.id, campaign_criterion.keyword.text
        FROM campaign_criterion
        WHERE campaign_criterion.negative = true
          AND campaign_criterion.type = 'KEYWORD'
        LIMIT 10000
    """
    for row in ga.search(customer_id=CUSTOMER_ID, query=query):
        if row.campaign.id in campaign_ids:
            existing[row.campaign.id].add(row.campaign_criterion.keyword.text.lower())
    return existing


# ─── Campaign Name Parser ─────────────────────────────

def parse_campaign_name(name):
    """Extract funnel, product, region, competitor from campaign name."""
    name_lower = name.lower()
    
    funnel = None
    for f in ["tofu", "mofu", "bofu"]:
        if f in name_lower:
            funnel = f.upper()
            break
    
    product = None
    product_map = {
        "voice ai": "voice_ai", "ai agent": "ai_agent", "vapi": "voice_ai",
        "contact center": "contact_center", "sip trunk": "sip_trunking",
        "sip": "sip_trunking", "iot": "iot", "m2m": "iot",
        "sms": "sms_api", "numbers": "numbers", "10dlc": "sms_api",
        "fax": "fax", "storage": "storage", "networking": "networking",
    }
    for key, val in product_map.items():
        if key in name_lower:
            product = val
            break
    
    region = None
    for r in ["amer", "emea", "apac", "mena", "global", "latam"]:
        if r in name_lower:
            region = r.upper()
            break
    
    competitor = None
    for c in COMPETITORS:
        if c in name_lower:
            competitor = c
            break
    
    return {
        "funnel_stage": funnel,
        "product": product,
        "region": region,
        "competitor_focus": competitor,
    }


# ─── AI-Powered Analysis ──────────────────────────────

def load_knowledge_context():
    """Load Telnyx strategy context for AI grounding."""
    try:
        from lib.knowledge import load_knowledge_for_agent
        ctx = load_knowledge_for_agent("negative_keyword")
        if ctx:
            print(f"  Loaded knowledge context ({len(ctx)} chars)")
            return ctx
    except ImportError:
        pass
    # Fallback: direct read
    strategy_path = os.path.join(os.path.dirname(__file__), "..", "knowledge", "telnyx-strategy.md")
    if os.path.exists(strategy_path):
        with open(strategy_path) as f:
            return f.read()
    return ""


def ai_analyze_batch(terms_batch, knowledge_context):
    """
    Send a batch of search terms to Claude Sonnet for analysis.
    Returns list of {search_term, action, confidence, reason, intent_type, match_type}.
    """
    if not OPENCLAW_TOKEN:
        print("  Warning: OPENCLAW_GATEWAY_TOKEN not set, falling back to rule-based")
        return None

    terms_text = "\n".join(
        f"{i+1}. \"{t['search_term']}\" | campaign: {t['campaign_name']} | "
        f"spend: ${t['cost']:.2f} | clicks: {t['clicks']} | conversions: {t['all_conversions']}"
        for i, t in enumerate(terms_batch)
    )

    system_prompt = f"""You are a Google Ads negative keyword analyst for Telnyx, a B2B cloud communications company.

TELNYX CONTEXT:
{knowledge_context[:4000]}

TELNYX PRODUCTS (what we actually sell — B2B enterprise only):
- Voice AI / Voice AI Agents (real-time conversational AI for enterprises)
- Voice API (programmable voice, call control, SIP)
- SIP Trunking (enterprise telephony)
- SMS/MMS API (messaging platform)
- IoT/M2M SIM cards (enterprise fleet, industrial, NOT consumer)
- Contact Center solutions (CCaaS)
- Phone Numbers (DIDs, toll-free)
- eSIM (enterprise only, NOT consumer travel/phone eSIM)

COMPETITORS: twilio, vonage, bandwidth, plivo, sinch, messagebird, nexmo, ringcentral, 8x8, five9, genesys

YOUR TASK: Analyze each search term and decide if it should be BLOCKED as a negative keyword, KEPT, or MONITORED.

BLOCK if the search term indicates:
- Wrong industry entirely (consumer, gaming, entertainment, education tools)
- Wrong product category (image/video/music AI generators, not voice AI)
- Financial/investor research on competitors (stock price, earnings, IPO)
- Existing customer support queries (login, dashboard, docs, status page)
- Consumer use cases for B2B products (personal SIM, home GPS tracker, travel eSIM)
- Job seekers (careers, jobs, hiring, salary)
- Completely irrelevant to any Telnyx product

KEEP if the search term indicates:
- Someone looking for products Telnyx sells
- Competitor comparison (even if competitor name present — these are high-intent)
- Enterprise/B2B use cases matching our products
- Technical queries about our product categories

MONITOR if unclear or ambiguous.

HARD RULES (override everything):
- NEVER block terms with conversions > 0
- NEVER block brand terms (telnyx, clawdtalk, clawd)
- Competitor name alone is NOT a reason to block — competitor comparison searches are valuable
- Educational queries ("what is", "how to") are fine for TOFU campaigns

For each term, respond with ONLY valid JSON array. Each item:
{{"index": N, "action": "BLOCK"|"KEEP"|"MONITOR", "confidence": 0-100, "reason": "brief explanation", "intent_type": "RELEVANT|FINANCIAL|SUPPORT|WRONG_CATEGORY|CONSUMER|EDUCATIONAL|JOB_SEEKER|IRRELEVANT", "match_type": "EXACT"|"PHRASE"}}

Use PHRASE match when blocking a general concept (e.g. "image generator"). Use EXACT when blocking a specific query.
Confidence 80+ means you're sure. 60-79 means likely. Below 60 means uncertain."""

    user_msg = f"Analyze these {len(terms_batch)} search terms:\n\n{terms_text}"

    try:
        data = json.dumps({
            "model": "claude-sonnet-4-6",
            "max_tokens": 4000,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            "temperature": 0.1,
        }).encode()

        req = urllib.request.Request(
            OPENCLAW_BASE,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENCLAW_TOKEN}",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())

        content = result["choices"][0]["message"]["content"].strip()
        # Extract JSON array from response
        # Handle markdown code blocks
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```\s*$', '', content)
        # Find the JSON array boundaries
        start = content.find('[')
        if start == -1:
            print(f"  No JSON array found in response")
            return None
        # Find matching closing bracket
        depth = 0
        for i in range(start, len(content)):
            if content[i] == '[':
                depth += 1
            elif content[i] == ']':
                depth -= 1
                if depth == 0:
                    return json.loads(content[start:i+1])
        # Fallback: try parsing from start
        return json.loads(content[start:])

    except Exception as e:
        print(f"  AI analysis error: {e}")
        return None


def apply_safety_overrides(ai_result, term_data, keywords):
    """Apply hard safety rules that override AI decisions."""
    search_term = term_data["search_term"]

    # Never block converting terms
    if term_data["all_conversions"] > 0:
        return {"action": "KEEP", "confidence": 100, "reason": "Has conversions — protected",
                "intent_type": "RELEVANT", "match_type": "EXACT"}

    # Never block exact target keywords
    if search_term in keywords:
        return {"action": "KEEP", "confidence": 100, "reason": "Exact target keyword",
                "intent_type": "RELEVANT", "match_type": "EXACT"}

    # Never block brand terms
    if any(b in search_term for b in BRAND_TERMS):
        return {"action": "KEEP", "confidence": 100, "reason": "Brand term — protected",
                "intent_type": "RELEVANT", "match_type": "EXACT"}

    return ai_result


# ─── Performance Analysis (kept for supplementary data) ─

def analyze_performance(data, avg_cpa=200.0):
    """Analyze spend/conversion performance."""
    spend = data["cost"]
    clicks = data["clicks"]
    conversions = data["all_conversions"]

    if conversions > 0:
        return {"flag": "HAS_CONVERSIONS", "severity": "PROTECT",
                "reason": f"{conversions:.0f} conversions — NEVER block"}

    if spend > 50 and spend > avg_cpa * 1.5:
        return {"flag": "HIGH_WASTE", "severity": "HIGH",
                "reason": f"${spend:.2f} spent (>1.5x avg CPA), 0 conversions"}

    if clicks >= 20 and conversions == 0:
        return {"flag": "STAT_SIG_UNDERPERFORM", "severity": "MEDIUM",
                "reason": f"{clicks} clicks, 0 conversions (statistically significant)"}

    return None


# ─── Apply Negatives ──────────────────────────────────

def apply_negatives(client, blocks):
    """Apply negative keywords via Google Ads API."""
    if not blocks:
        return []
    
    service = client.get_service("CampaignCriterionService")
    MATCH_MAP = {"EXACT": 2, "PHRASE": 3, "BROAD": 4}
    
    applied = []
    # Batch by 100
    for i in range(0, len(blocks), 100):
        batch = blocks[i:i+100]
        operations = []
        for b in batch:
            op = client.get_type("CampaignCriterionOperation")
            criterion = op.create
            criterion.campaign = client.get_service("CampaignService").campaign_path(
                CUSTOMER_ID, str(b["campaign_id"])
            )
            criterion.negative = True
            criterion.keyword.text = b["search_term"]
            criterion.keyword.match_type = MATCH_MAP.get(b["match_type"], 2)
            operations.append(op)
        
        try:
            response = service.mutate_campaign_criteria(
                customer_id=CUSTOMER_ID, operations=operations
            )
            for j, result in enumerate(response.results):
                batch[j]["resource_name"] = result.resource_name
                batch[j]["applied"] = True
                applied.append(batch[j])
        except Exception as e:
            print(f"  API error applying batch {i//100}: {e}")
            for b in batch:
                b["applied"] = False
                b["error"] = str(e)
    
    return applied


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Negative Keyword Agent")
    parser.add_argument("--dry-run", action="store_true", help="Analyze only, don't apply")
    parser.add_argument("--days", type=int, default=7, help="Days of search term data")
    parser.add_argument("--verbose", action="store_true", help="Show all decisions")
    args = parser.parse_args()
    
    start_time = datetime.now(timezone.utc)
    print(f"🔍 Negative Keyword Agent — {start_time.strftime('%Y-%m-%d %H:%M UTC')}")
    if args.dry_run:
        print("   ⚠️  DRY RUN — no changes will be applied")
    print()
    
    client = get_client()
    
    # 1. Fetch search terms
    print("Fetching search term report...")
    search_terms = fetch_search_terms(client, days=args.days)
    print(f"  {len(search_terms)} search terms found")
    
    # 2. Get unique campaign IDs
    campaign_ids = set(st["campaign_id"] for st in search_terms)
    print(f"  {len(campaign_ids)} campaigns")
    
    # 3. Fetch campaign context
    print("Fetching campaign keywords...")
    camp_keywords = fetch_campaign_keywords(client, campaign_ids)
    print(f"  {sum(len(v) for v in camp_keywords.values())} keywords across {len(camp_keywords)} campaigns")
    
    print("Fetching ad copy themes...")
    camp_ad_themes = fetch_campaign_ads(client, campaign_ids)
    print(f"  {sum(len(v) for v in camp_ad_themes.values())} themes across {len(camp_ad_themes)} campaigns")
    
    print("Fetching existing negatives...")
    existing_negatives = fetch_existing_negatives(client, campaign_ids)
    print(f"  {sum(len(v) for v in existing_negatives.values())} existing negatives")
    
    # 4. Load knowledge context for AI
    print("\nLoading knowledge context...")
    knowledge_context = load_knowledge_context()

    # 5. Filter and prepare terms for analysis
    print("Filtering search terms...")
    candidates = []
    skipped = 0

    for st in search_terms:
        term = st["search_term"]
        cid = st["campaign_id"]

        # Skip filters
        if st["cost"] < MIN_SPEND:
            skipped += 1
            continue
        if st["impressions"] < MIN_IMPRESSIONS:
            skipped += 1
            continue

        # Check campaign age
        if st.get("campaign_start"):
            try:
                start_date = datetime.strptime(st["campaign_start"], "%Y-%m-%d")
                if (datetime.now() - start_date).days < CAMPAIGN_MIN_AGE_DAYS:
                    skipped += 1
                    continue
            except:
                pass

        # Skip if already a negative
        if term in existing_negatives.get(cid, set()):
            skipped += 1
            continue

        candidates.append(st)

    print(f"  {len(candidates)} candidates after filtering ({skipped} skipped)")

    # 6. AI-powered batch analysis
    print(f"\nAnalyzing {len(candidates)} terms with AI (batches of 25)...")
    blocks = []
    monitors = []
    keeps = []
    total_waste = 0.0
    AI_BATCH_SIZE = 25

    for batch_start in range(0, len(candidates), AI_BATCH_SIZE):
        batch = candidates[batch_start:batch_start + AI_BATCH_SIZE]
        batch_num = batch_start // AI_BATCH_SIZE + 1
        total_batches = (len(candidates) + AI_BATCH_SIZE - 1) // AI_BATCH_SIZE
        print(f"  Batch {batch_num}/{total_batches} ({len(batch)} terms)...")

        ai_results = ai_analyze_batch(batch, knowledge_context)

        for i, st in enumerate(batch):
            cid = st["campaign_id"]
            keywords = camp_keywords.get(cid, [])

            # Get AI decision or fallback
            if ai_results and i < len(ai_results):
                ai_decision = ai_results[i]
            else:
                # Fallback: monitor everything AI couldn't analyze
                ai_decision = {"action": "MONITOR", "confidence": 50,
                               "reason": "AI analysis unavailable", "intent_type": "UNKNOWN",
                               "match_type": "EXACT"}

            # Apply safety overrides
            decision = apply_safety_overrides(ai_decision, st, keywords)

            # Performance analysis (supplementary)
            camp_spend_total = sum(s["cost"] for s in search_terms if s["campaign_id"] == cid)
            camp_conv_total = sum(s["all_conversions"] for s in search_terms if s["campaign_id"] == cid)
            avg_cpa = camp_spend_total / max(camp_conv_total, 1)
            perf = analyze_performance(st, avg_cpa)

            result = {
                "search_term": st["search_term"],
                "campaign_id": cid,
                "campaign_name": st["campaign_name"],
                "spend": st["cost"],
                "clicks": st["clicks"],
                "conversions": st["all_conversions"],
                "relevancy_score": decision.get("confidence", 50),
                "intent": {"type": decision.get("intent_type", "UNKNOWN"),
                           "reason": decision.get("reason", ""),
                           "confidence": decision.get("confidence", 50)} if decision.get("action") == "BLOCK" else None,
                "performance": perf,
                "decision": decision,
            }

            if decision["action"] == "BLOCK":
                result["match_type"] = decision.get("match_type", "EXACT")
                blocks.append(result)
                total_waste += st["cost"]
            elif decision["action"] == "MONITOR":
                monitors.append(result)
            else:
                keeps.append(result)

            if args.verbose and decision["action"] == "BLOCK":
                print(f"    ❌ BLOCK [{decision.get('confidence', 0)}%]: \"{st['search_term']}\"")
                print(f"       ${st['cost']:.2f} | {decision.get('reason', '')}")
    
    # 7. Apply blocks
    auto_blocks = [b for b in blocks if b["decision"]["confidence"] >= CONFIDENCE_THRESHOLD]
    review_blocks = [b for b in blocks if b["decision"]["confidence"] < CONFIDENCE_THRESHOLD]
    
    print(f"\n{'='*60}")
    print(f"RESULTS:")
    print(f"  Analyzed: {len(blocks) + len(monitors) + len(keeps)} terms")
    print(f"  Skipped:  {skipped} (below thresholds)")
    print(f"  Blocked:  {len(auto_blocks)} auto-apply (≥{CONFIDENCE_THRESHOLD}% confidence)")
    print(f"  Review:   {len(review_blocks)} logged for monitoring (<{CONFIDENCE_THRESHOLD}%)")
    print(f"  Monitor:  {len(monitors)}")
    print(f"  Kept:     {len(keeps)}")
    print(f"  Est. waste: ${total_waste:.2f} ({total_waste*4.3:.0f}/month)")
    print(f"{'='*60}")
    
    applied = []
    if auto_blocks and not args.dry_run:
        print(f"\nApplying {len(auto_blocks)} negative keywords...")
        applied = apply_negatives(client, auto_blocks)
        print(f"  Applied: {len([a for a in applied if a.get('applied')])}")
        print(f"  Failed:  {len([a for a in applied if not a.get('applied')])}")
    elif auto_blocks:
        print(f"\n⚠️  DRY RUN: Would apply {len(auto_blocks)} negative keywords")
    
    # 6. Top blocks
    if blocks:
        print(f"\nTop blocks by spend:")
        for b in sorted(blocks, key=lambda x: x["spend"], reverse=True)[:10]:
            d = b["decision"]
            print(f"  ${b['spend']:>7.2f} | [{d['confidence']}%] \"{b['search_term']}\"")
            print(f"           → {b['campaign_name']}")
            print(f"           → {d['reason']}")
    
    # 7. Intent breakdown
    if blocks:
        intent_summary = defaultdict(lambda: {"count": 0, "spend": 0.0})
        for b in blocks:
            itype = b["intent"]["type"] if b["intent"] else "PERFORMANCE"
            intent_summary[itype]["count"] += 1
            intent_summary[itype]["spend"] += b["spend"]
        
        print(f"\nIntent breakdown:")
        for itype, data in sorted(intent_summary.items(), key=lambda x: x[1]["spend"], reverse=True):
            print(f"  {itype}: {data['count']} terms (${data['spend']:.2f})")
    
    end_time = datetime.now(timezone.utc)
    
    # 8. Write to DB (AgentRun + Recommendations)
    import psycopg2
    db_conn = psycopg2.connect("postgresql://localhost:5432/dghub")
    db_cur = db_conn.cursor()
    
    # Get or create agent
    db_cur.execute("SELECT id FROM \"Agent\" WHERE slug = 'negative-keyword'")
    agent_row = db_cur.fetchone()
    if not agent_row:
        db_cur.execute("""INSERT INTO "Agent" (id, slug, name, description, model, enabled, "createdAt")
            VALUES (gen_random_uuid()::text, 'negative-keyword', 'Negative Keyword Agent', 
            'Automatically identifies and blocks wasteful search terms', 'python-script', true, NOW())
            RETURNING id""")
        agent_id = db_cur.fetchone()[0]
    else:
        agent_id = agent_row[0]
    
    # Create AgentRun
    run_summary = {
        "summary": f"Analyzed {len(blocks) + len(monitors) + len(keeps)} search terms. "
                   f"Auto-blocked {len(auto_blocks)}, {len(review_blocks)} pending review. "
                   f"Est. waste: ${total_waste:.0f}/week (${total_waste*4.3:.0f}/month).",
        "findings": [
            {"severity": "high" if b["spend"] > 50 else "medium",
             "title": f'"{b["search_term"]}" — ${b["spend"]:.2f} wasted',
             "detail": f'{b["campaign_name"]} | {b["decision"]["reason"]}'}
            for b in sorted(blocks, key=lambda x: x["spend"], reverse=True)[:20]
        ],
        "stats": {
            "terms_analyzed": len(blocks) + len(monitors) + len(keeps),
            "skipped": skipped,
            "auto_blocked": len(auto_blocks),
            "pending_review": len(review_blocks),
            "monitored": len(monitors),
            "kept": len(keeps),
            "est_weekly_waste": round(total_waste, 2),
            "est_monthly_waste": round(total_waste * 4.3, 2),
        },
        "intent_breakdown": {},
    }
    
    # Aggregate intent breakdown
    intent_agg = defaultdict(lambda: {"count": 0, "spend": 0.0})
    for b in blocks:
        itype = b["intent"]["type"] if b["intent"] else "PERFORMANCE"
        intent_agg[itype]["count"] += 1
        intent_agg[itype]["spend"] += b["spend"]
    run_summary["intent_breakdown"] = {k: {"count": v["count"], "spend": round(v["spend"], 2)} for k, v in intent_agg.items()}
    
    db_cur.execute("""INSERT INTO "AgentRun" (id, "agentId", status, input, output, "findingsCount", "recsCount",
        "startedAt", "completedAt", "createdAt")
        VALUES (gen_random_uuid()::text, %s, 'done', %s, %s, %s, %s, %s, %s, NOW()) RETURNING id""",
        (agent_id,
         json.dumps({"days": args.days, "dry_run": args.dry_run}),
         json.dumps(run_summary),
         len(blocks),
         len(auto_blocks) + len(review_blocks),
         start_time,
         end_time))
    run_id = db_cur.fetchone()[0]
    
    # Create Recommendations for auto-applied blocks
    for b in auto_blocks:
        metadata = {
            "search_term": b["search_term"],
            "campaign_id": b["campaign_id"],
            "match_type": b.get("match_type", "EXACT"),
            "spend": b["spend"],
            "clicks": b["clicks"],
            "conversions": b["conversions"],
            "relevancy_score": b["relevancy_score"],
            "intent_type": b["intent"]["type"] if b["intent"] else "PERFORMANCE",
            "confidence": b["decision"]["confidence"],
            "resource_name": b.get("resource_name"),
        }
        status = "applied" if b.get("applied") else "approved" if not args.dry_run else "pending"
        db_cur.execute("""INSERT INTO "Recommendation" (id, "agentRunId", type, severity, target, "targetId", 
            action, rationale, impact, status, "appliedAt", "createdAt")
            VALUES (gen_random_uuid()::text, %s, 'add-negative', %s, %s, %s, %s, %s, %s, %s, %s, NOW())""",
            (run_id,
             "high" if b["spend"] > 50 else "medium",
             b["campaign_name"],
             str(b["campaign_id"]),
             f'Block "{b["search_term"]}" ({b.get("match_type", "EXACT")} match)',
             b["decision"]["reason"],
             json.dumps(metadata),
             status,
             end_time if b.get("applied") else None))
    
    # Create Recommendations for review items (pending)
    for b in review_blocks:
        metadata = {
            "search_term": b["search_term"],
            "campaign_id": b["campaign_id"],
            "match_type": b.get("match_type", "EXACT"),
            "spend": b["spend"],
            "clicks": b["clicks"],
            "conversions": b["conversions"],
            "relevancy_score": b["relevancy_score"],
            "intent_type": b["intent"]["type"] if b["intent"] else "PERFORMANCE",
            "confidence": b["decision"]["confidence"],
        }
        db_cur.execute("""INSERT INTO "Recommendation" (id, "agentRunId", type, severity, target, "targetId",
            action, rationale, impact, status, "createdAt")
            VALUES (gen_random_uuid()::text, %s, 'add-negative', %s, %s, %s, %s, %s, %s, 'pending', NOW())""",
            (run_id,
             "high" if b["spend"] > 50 else "medium",
             b["campaign_name"],
             str(b["campaign_id"]),
             f'Block "{b["search_term"]}" ({b.get("match_type", "EXACT")} match)',
             b["decision"]["reason"],
             json.dumps(metadata)))
    
    db_conn.commit()
    db_cur.close()
    db_conn.close()
    print(f"\nDB: AgentRun {run_id} created with {len(auto_blocks) + len(review_blocks)} recommendations")
    
    # 9. Save JSON log
    os.makedirs(LOG_DIR, exist_ok=True)
    log_file = os.path.join(LOG_DIR, f"{start_time.strftime('%Y-%m-%d')}.json")
    
    end_time = datetime.now(timezone.utc)
    log_data = {
        "timestamp": start_time.isoformat(),
        "runtime_seconds": (end_time - start_time).total_seconds(),
        "dry_run": args.dry_run,
        "days_analyzed": args.days,
        "campaigns_processed": len(campaign_ids),
        "search_terms_analyzed": len(blocks) + len(monitors) + len(keeps),
        "skipped": skipped,
        "decisions": {
            "blocked": len(auto_blocks),
            "review": len(review_blocks),
            "monitored": len(monitors),
            "kept": len(keeps),
        },
        "blocks_applied": [
            {
                "search_term": b["search_term"],
                "campaign_id": b["campaign_id"],
                "campaign_name": b["campaign_name"],
                "spend": b["spend"],
                "clicks": b["clicks"],
                "conversions": b["conversions"],
                "relevancy_score": b["relevancy_score"],
                "intent_type": b["intent"]["type"] if b["intent"] else "PERFORMANCE",
                "confidence": b["decision"]["confidence"],
                "match_type": b.get("match_type", "EXACT"),
                "applied": b.get("applied", False),
                "resource_name": b.get("resource_name"),
            }
            for b in auto_blocks
        ],
        "review_items": [
            {
                "search_term": b["search_term"],
                "campaign_id": b["campaign_id"],
                "campaign_name": b["campaign_name"],
                "spend": b["spend"],
                "confidence": b["decision"]["confidence"],
                "reason": b["decision"]["reason"],
            }
            for b in review_blocks
        ],
        "estimated_savings": {
            "weekly": total_waste,
            "monthly": total_waste * 4.3,
        },
    }
    
    with open(log_file, "w") as f:
        json.dump(log_data, f, indent=2)
    print(f"\nLog saved to {log_file}")
    print(f"Runtime: {(end_time - start_time).total_seconds():.0f}s")

    # 10. Send Telegram notification to Agent Reports topic
    send_telegram_report(auto_blocks, review_blocks, blocks, monitors, keeps, skipped, total_waste, start_time, args.dry_run)


def send_telegram_report(auto_blocks, review_blocks, blocks, monitors, keeps, skipped, total_waste, start_time, dry_run):
    """Send brief summary to Agent Activity topic. No inline buttons — review in hub."""
    BOT_TOKEN = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
    CHAT_ID = "-1003786506284"
    AGENT_ACTIVITY_THREAD = 164

    total_analyzed = len(blocks) + len(monitors) + len(keeps)
    
    if not auto_blocks and not review_blocks:
        return

    import urllib.request

    lines = []
    lines.append(f"<b>Negative Keyword Agent</b> — {start_time.strftime('%b %d')}")
    if dry_run:
        lines.append("<i>DRY RUN</i>")
    lines.append(f"{total_analyzed:,} terms scanned")

    if auto_blocks:
        applied_spend = sum(b["spend"] for b in auto_blocks)
        terms = ", ".join(f'"{b["search_term"]}"' for b in sorted(auto_blocks, key=lambda x: x["spend"], reverse=True)[:5])
        lines.append(f"\n✅ <b>{len(auto_blocks)} auto-blocked</b> — ${applied_spend:,.0f} waste stopped")
        lines.append(f"  {terms}")

    if review_blocks:
        review_spend = sum(b["spend"] for b in review_blocks)
        terms = ", ".join(f'"{b["search_term"]}"' for b in sorted(review_blocks, key=lambda x: x["spend"], reverse=True)[:5])
        lines.append(f"\n⏳ <b>{len(review_blocks)} need review</b> — ${review_spend:,.0f} at risk")
        lines.append(f"  {terms}")

    monthly = total_waste * 4.3
    if monthly > 0:
        lines.append(f"\nEst. savings: ${monthly:,.0f}/mo")

    if review_blocks:
        lines.append(f"\nReview → Hub → Agents")

    msg = "\n".join(lines)

    try:
        data = json.dumps({
            "chat_id": CHAT_ID,
            "message_thread_id": AGENT_ACTIVITY_THREAD,
            "text": msg,
            "parse_mode": "HTML",
        }).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)
        print("Telegram: summary sent to Agent Activity")
    except Exception as e:
        print(f"Telegram send failed: {e}")


# ─── Rollback ─────────────────────────────────────────

def rollback(days=7):
    """Remove all agent-applied negatives from last N days."""
    client = get_client()
    service = client.get_service("CampaignCriterionService")
    
    total_removed = 0
    for i in range(days):
        date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        log_file = os.path.join(LOG_DIR, f"{date}.json")
        if not os.path.exists(log_file):
            continue
        
        with open(log_file) as f:
            log = json.load(f)
        
        operations = []
        for block in log.get("blocks_applied", []):
            rn = block.get("resource_name")
            if rn and block.get("applied"):
                op = client.get_type("CampaignCriterionOperation")
                op.remove = rn
                operations.append(op)
        
        if operations:
            try:
                service.mutate_campaign_criteria(
                    customer_id=CUSTOMER_ID, operations=operations
                )
                total_removed += len(operations)
                print(f"  Rolled back {len(operations)} from {date}")
            except Exception as e:
                print(f"  Rollback error for {date}: {e}")
    
    print(f"\nTotal rolled back: {total_removed}")


if __name__ == "__main__":
    if "--rollback" in sys.argv:
        days = 7
        if "--days" in sys.argv:
            days = int(sys.argv[sys.argv.index("--days") + 1])
        rollback(days)
    else:
        main()
