#!/usr/bin/env python3
"""
Google Ads Optimizer Agent
Analyzes active Google Ads campaigns and generates platform-specific optimization
recommendations with confidence scoring and guardrail enforcement.

Optimizations:
1. Bid strategy recommendations (target CPA/ROAS adjustments)
2. Budget reallocation within product groups
3. Keyword match type optimization (broad → phrase → exact based on performance)
4. Underperforming campaign flagging
5. Search impression share analysis
6. Quality Score improvements

Run: python scripts/google-ads-optimizer.py [--dry-run] [--days 30]
Schedule: Daily 4 AM PST via OpenClaw cron
"""

import json, os, sys, re, argparse, urllib.request
from datetime import datetime, timezone, timedelta
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ─── Config ───────────────────────────────────────────

CUSTOMER_ID = "2356650573"
LOGIN_CUSTOMER_ID = "2893524941"
CRED_PATH = os.path.expanduser("~/.config/google-ads/credentials.json")
LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/google-ads-optimizer")
DB_URL = "postgresql://localhost:5432/dghub"

OPENCLAW_BASE = "http://127.0.0.1:18789/v1/chat/completions"
OPENCLAW_TOKEN = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "")

TELEGRAM_BOT_TOKEN = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
TELEGRAM_CHAT_ID = "-1003786506284"
TELEGRAM_THREAD_ID = 164

COMPETITORS = [
    "twilio", "vonage", "bandwidth", "plivo", "sinch", "messagebird",
    "nexmo", "ringcentral", "8x8", "five9", "genesys",
    "vapi", "retell", "bland", "synthflow", "voiceflow", "elevenlabs", "livekit"
]

PRODUCT_MAP = {
    "voice ai": "voice_ai", "ai agent": "voice_ai", "vapi": "voice_ai",
    "contact center": "contact_center", "sip trunk": "sip_trunking",
    "sip": "sip_trunking", "voice api": "voice_infrastructure",
    "iot": "connectivity", "m2m": "connectivity", "esim": "connectivity",
    "sms": "messaging", "rcs": "messaging", "numbers": "connectivity",
    "10dlc": "messaging", "fax": "other", "storage": "other",
    "networking": "other",
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


# ─── Campaign Name Parser ─────────────────────────────

def parse_campaign_name(name):
    """Extract funnel, product group, region, competitor from campaign name."""
    name_lower = name.lower()

    funnel = None
    for f in ["tofu", "mofu", "bofu"]:
        if f in name_lower:
            funnel = f.upper()
            break

    product = None
    for key, val in PRODUCT_MAP.items():
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

    is_conquest = competitor is not None or "conquest" in name_lower

    return {
        "funnel_stage": funnel,
        "product_group": product,
        "region": region,
        "competitor_focus": competitor,
        "is_conquest": is_conquest,
    }


# ─── Context Loading ──────────────────────────────────

def load_knowledge_context():
    """Load knowledge base for AI grounding."""
    try:
        from lib.knowledge import load_knowledge_for_agent
        ctx = load_knowledge_for_agent("google_ads_optimizer")
        if ctx:
            print(f"  Loaded knowledge context ({len(ctx)} chars)")
            return ctx
    except ImportError:
        pass
    strategy_path = os.path.join(os.path.dirname(__file__), "..", "knowledge", "telnyx-strategy.md")
    if os.path.exists(strategy_path):
        with open(strategy_path) as f:
            return f.read()
    return ""


def load_guardrails():
    """Load guardrails from DB."""
    guardrails = {
        "budget_floor_min": 10.0,
        "budget_change_max_no_approval": 0.30,
        "confidence_threshold": 70,
        "protect_non_conquest": True,
        "learning_period_days": 14,
    }
    try:
        import psycopg2
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute('SELECT key, value FROM "AgentGuardrail"')
        for key, value in cur.fetchall():
            if key in guardrails:
                if isinstance(guardrails[key], float):
                    guardrails[key] = float(value)
                elif isinstance(guardrails[key], int):
                    guardrails[key] = int(value)
                elif isinstance(guardrails[key], bool):
                    guardrails[key] = value.lower() in ("true", "1", "yes")
                else:
                    guardrails[key] = value
        cur.close()
        conn.close()
        print(f"  Guardrails loaded from DB")
    except Exception as e:
        print(f"  Using default guardrails (DB error: {e})")
    return guardrails


def load_regional_priorities():
    """Load regional priorities from DB."""
    priorities = {}
    try:
        import psycopg2
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""SELECT region, priority, protected, notes FROM "RegionalPriority" WHERE quarter = '2026-Q1'""")
        for row in cur.fetchall():
            priorities[row[0]] = {
                "priority": row[1],
                "protected": row[2],
                "notes": row[3],
            }
        cur.close()
        conn.close()
        if priorities:
            print(f"  Regional priorities loaded: {list(priorities.keys())}")
    except Exception as e:
        print(f"  No regional priorities (DB: {e})")
    return priorities


def load_db_campaigns():
    """Load campaigns from DB with parsed fields."""
    campaigns = {}
    try:
        import psycopg2
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            SELECT "platformId", name, status, "parsedProduct", "parsedVariant",
                   "parsedRegion", "parsedFunnel", "startDate", budget
            FROM "Campaign"
            WHERE platform = 'google_ads' AND status = 'active'
        """)
        for row in cur.fetchall():
            campaigns[row[0]] = {
                "external_id": row[0],
                "name": row[1],
                "status": row[2],
                "parsed_product": row[3],
                "parsed_variant": row[4],
                "parsed_region": row[5],
                "parsed_funnel": row[6],
                "start_date": row[7].isoformat() if row[7] else None,
                "budget": float(row[8]) if row[8] else None,
            }
        cur.close()
        conn.close()
        print(f"  {len(campaigns)} campaigns loaded from DB")
    except Exception as e:
        print(f"  DB campaign load failed: {e}")
    return campaigns


# ─── Data Collection ──────────────────────────────────

def fetch_campaign_metrics(client, days=30):
    """Fetch campaign-level metrics with impression share."""
    ga = client.get_service("GoogleAdsService")

    VALID_DURING = {7: "LAST_7_DAYS", 14: "LAST_14_DAYS", 30: "LAST_30_DAYS"}
    if days in VALID_DURING:
        date_filter = f"segments.date DURING {VALID_DURING[days]}"
    else:
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        date_filter = f"segments.date BETWEEN '{start_date}' AND '{end_date}'"

    query = f"""
        SELECT campaign.id, campaign.name, campaign.status,
               metrics.cost_micros, metrics.impressions, metrics.clicks,
               metrics.conversions, metrics.all_conversions,
               metrics.search_impression_share,
               metrics.search_budget_lost_impression_share,
               metrics.search_rank_lost_impression_share,
               metrics.average_cpc, metrics.cost_per_conversion,
               campaign.bidding_strategy_type,
               campaign_budget.amount_micros
        FROM campaign
        WHERE campaign.status = 'ENABLED'
          AND {date_filter}
        ORDER BY metrics.cost_micros DESC
    """

    results = {}
    for row in ga.search(customer_id=CUSTOMER_ID, query=query):
        cid = str(row.campaign.id)
        cost = row.metrics.cost_micros / 1_000_000
        clicks = row.metrics.clicks
        conversions = row.metrics.all_conversions
        impressions = row.metrics.impressions

        results[cid] = {
            "campaign_id": cid,
            "campaign_name": row.campaign.name,
            "cost": cost,
            "impressions": impressions,
            "clicks": clicks,
            "conversions": conversions,
            "primary_conversions": row.metrics.conversions,
            "ctr": (clicks / impressions * 100) if impressions > 0 else 0,
            "avg_cpc": row.metrics.average_cpc / 1_000_000 if row.metrics.average_cpc else 0,
            "cpa": (cost / conversions) if conversions > 0 else None,
            "search_impression_share": row.metrics.search_impression_share or 0,
            "search_budget_lost_is": row.metrics.search_budget_lost_impression_share or 0,
            "search_rank_lost_is": row.metrics.search_rank_lost_impression_share or 0,
            "bidding_strategy": str(row.campaign.bidding_strategy_type).replace("BiddingStrategyType.", ""),
            "daily_budget": row.campaign_budget.amount_micros / 1_000_000 if row.campaign_budget.amount_micros else 0,
            "parsed": parse_campaign_name(row.campaign.name),
        }
    return results


def fetch_keyword_metrics(client, days=30):
    """Fetch keyword-level metrics."""
    ga = client.get_service("GoogleAdsService")

    VALID_DURING = {7: "LAST_7_DAYS", 14: "LAST_14_DAYS", 30: "LAST_30_DAYS"}
    if days in VALID_DURING:
        date_filter = f"segments.date DURING {VALID_DURING[days]}"
    else:
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        date_filter = f"segments.date BETWEEN '{start_date}' AND '{end_date}'"

    query = f"""
        SELECT ad_group_criterion.keyword.text,
               ad_group_criterion.keyword.match_type,
               ad_group_criterion.quality_info.quality_score,
               metrics.cost_micros, metrics.impressions, metrics.clicks,
               metrics.conversions, metrics.all_conversions,
               campaign.name, campaign.id
        FROM keyword_view
        WHERE campaign.status = 'ENABLED'
          AND {date_filter}
        ORDER BY metrics.cost_micros DESC
        LIMIT 10000
    """

    results = []
    try:
        for row in ga.search(customer_id=CUSTOMER_ID, query=query):
            cost = row.metrics.cost_micros / 1_000_000
            results.append({
                "keyword": row.ad_group_criterion.keyword.text,
                "match_type": str(row.ad_group_criterion.keyword.match_type).replace("KeywordMatchType.", ""),
                "quality_score": row.ad_group_criterion.quality_info.quality_score or 0,
                "cost": cost,
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "conversions": row.metrics.all_conversions,
                "campaign_name": row.campaign.name,
                "campaign_id": str(row.campaign.id),
            })
    except Exception as e:
        print(f"  Keyword fetch error: {e}")
    return results


# ─── Analysis Modules ─────────────────────────────────

class Recommendation:
    def __init__(self, rec_type, campaign_id, campaign_name, title, detail,
                 confidence, severity="medium", action=None, metadata=None):
        self.type = rec_type
        self.campaign_id = campaign_id
        self.campaign_name = campaign_name
        self.title = title
        self.detail = detail
        self.confidence = confidence
        self.severity = severity
        self.action = action or title
        self.metadata = metadata or {}

    def to_dict(self):
        return {
            "type": self.type,
            "campaign_id": self.campaign_id,
            "campaign_name": self.campaign_name,
            "title": self.title,
            "detail": self.detail,
            "confidence": self.confidence,
            "severity": self.severity,
            "action": self.action,
            "metadata": self.metadata,
        }


def adjust_confidence(base, clicks, is_protected, is_new, is_negative_action):
    """Adjust confidence based on data quality and protection status."""
    conf = base
    # Data volume adjustments
    if clicks >= 500:
        conf += 10
    elif clicks >= 200:
        conf += 5
    elif clicks < 100:
        conf -= 15
    elif clicks < 50:
        conf -= 25

    # Protected campaign cap for negative actions
    if is_protected and is_negative_action:
        conf = min(conf, 50)

    # New campaign penalty
    if is_new:
        conf -= 20

    return max(0, min(100, conf))


def analyze_budget_efficiency(metrics_30d, metrics_7d, guardrails, regional_priorities, db_campaigns):
    """Compare 7d vs 30d CPA/CPC trends. Flag degrading campaigns."""
    recs = []

    for cid, m30 in metrics_30d.items():
        m7 = metrics_7d.get(cid)
        if not m7 or m7["cost"] < 20:
            continue

        parsed = m30["parsed"]
        is_protected = False
        if parsed.get("region") and parsed["region"] in regional_priorities:
            rp = regional_priorities[parsed["region"]]
            if rp.get("protected"):
                is_protected = True

        is_new = False
        db_camp = db_campaigns.get(cid, {})
        if db_camp.get("start_date"):
            try:
                start = datetime.fromisoformat(db_camp["start_date"])
                if (datetime.now() - start).days < guardrails["learning_period_days"]:
                    is_new = True
            except (ValueError, TypeError):
                pass

        # CPA trend: compare 7d CPA to 30d CPA
        cpa_30 = m30["cpa"]
        cpa_7 = (m7["cost"] / m7["conversions"]) if m7["conversions"] > 0 else None

        if cpa_30 and cpa_7:
            cpa_change = (cpa_7 - cpa_30) / cpa_30
            if cpa_change > 0.20:
                is_negative = True
                if is_new:
                    continue  # skip negative recs for new campaigns
                base_conf = 75
                conf = adjust_confidence(base_conf, m7["clicks"], is_protected, is_new, is_negative)
                recs.append(Recommendation(
                    rec_type="budget_efficiency",
                    campaign_id=cid,
                    campaign_name=m30["campaign_name"],
                    title=f"CPA increased {cpa_change:.0%} (7d vs 30d)",
                    detail=f"30d CPA: ${cpa_30:.2f} → 7d CPA: ${cpa_7:.2f}. "
                           f"Consider reducing budget or reviewing targeting.",
                    confidence=conf,
                    severity="high" if cpa_change > 0.40 else "medium",
                    action=f"Reduce budget for {m30['campaign_name']}",
                    metadata={"cpa_30d": round(cpa_30, 2), "cpa_7d": round(cpa_7, 2),
                              "cpa_change_pct": round(cpa_change * 100, 1),
                              "product_group": parsed.get("product_group")},
                ))
            elif cpa_change < -0.15 and m7["conversions"] >= 2:
                # Improving campaign — recommend budget increase
                base_conf = 70
                conf = adjust_confidence(base_conf, m7["clicks"], False, is_new, False)
                recs.append(Recommendation(
                    rec_type="budget_efficiency",
                    campaign_id=cid,
                    campaign_name=m30["campaign_name"],
                    title=f"CPA improved {abs(cpa_change):.0%} — consider budget increase",
                    detail=f"30d CPA: ${cpa_30:.2f} → 7d CPA: ${cpa_7:.2f}. "
                           f"Campaign trending well, may benefit from more budget.",
                    confidence=conf,
                    severity="low",
                    action=f"Increase budget for {m30['campaign_name']}",
                    metadata={"cpa_30d": round(cpa_30, 2), "cpa_7d": round(cpa_7, 2),
                              "cpa_change_pct": round(cpa_change * 100, 1),
                              "product_group": parsed.get("product_group")},
                ))

        # CPC trend
        avg_cpc_30 = m30["avg_cpc"]
        avg_cpc_7 = m7["avg_cpc"]
        if avg_cpc_30 > 0 and avg_cpc_7 > 0:
            cpc_change = (avg_cpc_7 - avg_cpc_30) / avg_cpc_30
            if cpc_change > 0.30 and m7["clicks"] >= 50:
                conf = adjust_confidence(65, m7["clicks"], is_protected, is_new, False)
                recs.append(Recommendation(
                    rec_type="budget_efficiency",
                    campaign_id=cid,
                    campaign_name=m30["campaign_name"],
                    title=f"CPC spiked {cpc_change:.0%} (7d vs 30d)",
                    detail=f"30d CPC: ${avg_cpc_30:.2f} → 7d CPC: ${avg_cpc_7:.2f}. "
                           f"Check competition or bid strategy.",
                    confidence=conf,
                    severity="medium",
                    metadata={"cpc_30d": round(avg_cpc_30, 2), "cpc_7d": round(avg_cpc_7, 2)},
                ))

    return recs


def analyze_impression_share(metrics_30d, guardrails, regional_priorities):
    """Flag campaigns losing significant impression share."""
    recs = []

    for cid, m in metrics_30d.items():
        if m["cost"] < 50:
            continue

        parsed = m["parsed"]
        is_protected = False
        if parsed.get("region") and parsed["region"] in regional_priorities:
            rp = regional_priorities[parsed["region"]]
            if rp.get("protected"):
                is_protected = True

        budget_lost = m["search_budget_lost_is"]
        rank_lost = m["search_rank_lost_is"]

        if budget_lost > 0.30:
            conf = adjust_confidence(80, m["clicks"], False, False, False)
            recs.append(Recommendation(
                rec_type="impression_share",
                campaign_id=cid,
                campaign_name=m["campaign_name"],
                title=f"Losing {budget_lost:.0%} IS to budget",
                detail=f"Campaign is budget-limited, missing {budget_lost:.0%} of available impressions. "
                       f"Current IS: {m['search_impression_share']:.0%}. Daily budget: ${m['daily_budget']:.0f}.",
                confidence=conf,
                severity="high" if budget_lost > 0.50 else "medium",
                action=f"Increase budget for {m['campaign_name']}",
                metadata={"budget_lost_is": round(budget_lost * 100, 1),
                          "current_is": round(m["search_impression_share"] * 100, 1),
                          "daily_budget": m["daily_budget"]},
            ))

        if rank_lost > 0.30:
            conf = adjust_confidence(70, m["clicks"], False, False, False)
            recs.append(Recommendation(
                rec_type="impression_share",
                campaign_id=cid,
                campaign_name=m["campaign_name"],
                title=f"Losing {rank_lost:.0%} IS to ad rank",
                detail=f"Campaign losing {rank_lost:.0%} of impressions due to low ad rank. "
                       f"Consider increasing bids or improving Quality Score.",
                confidence=conf,
                severity="high" if rank_lost > 0.50 else "medium",
                action=f"Improve ad rank for {m['campaign_name']}",
                metadata={"rank_lost_is": round(rank_lost * 100, 1),
                          "current_is": round(m["search_impression_share"] * 100, 1),
                          "bidding_strategy": m["bidding_strategy"]},
            ))

    return recs


def analyze_keyword_performance(keywords, guardrails, regional_priorities, metrics_30d):
    """Flag wasteful or low-quality keywords."""
    recs = []

    for kw in keywords:
        cid = kw["campaign_id"]
        camp_parsed = metrics_30d.get(cid, {}).get("parsed", {})

        is_protected = False
        if camp_parsed.get("region") and camp_parsed["region"] in regional_priorities:
            rp = regional_priorities[camp_parsed["region"]]
            if rp.get("protected"):
                is_protected = True

        # High spend, zero conversions
        if kw["cost"] > 50 and kw["conversions"] == 0:
            base_conf = 85
            if kw["cost"] > 100:
                base_conf = 90
            conf = adjust_confidence(base_conf, kw["clicks"], is_protected, False, True)
            recs.append(Recommendation(
                rec_type="keyword_performance",
                campaign_id=cid,
                campaign_name=kw["campaign_name"],
                title=f'Keyword "{kw["keyword"]}" — ${kw["cost"]:.0f} spent, 0 conversions',
                detail=f'Match type: {kw["match_type"]}, {kw["clicks"]} clicks. '
                       f"Consider pausing or tightening match type.",
                confidence=conf,
                severity="high" if kw["cost"] > 100 else "medium",
                action=f'Pause keyword "{kw["keyword"]}"',
                metadata={"keyword": kw["keyword"], "match_type": kw["match_type"],
                          "spend": round(kw["cost"], 2), "clicks": kw["clicks"]},
            ))

        # Low quality score
        if 0 < kw["quality_score"] < 5 and kw["impressions"] > 100:
            conf = adjust_confidence(65, kw["clicks"], False, False, False)
            recs.append(Recommendation(
                rec_type="keyword_quality",
                campaign_id=cid,
                campaign_name=kw["campaign_name"],
                title=f'Keyword "{kw["keyword"]}" QS={kw["quality_score"]}/10',
                detail=f"Low Quality Score hurts ad rank and increases CPC. "
                       f"Review ad copy alignment and landing page relevance.",
                confidence=conf,
                severity="medium",
                action=f'Improve QS for "{kw["keyword"]}"',
                metadata={"keyword": kw["keyword"], "quality_score": kw["quality_score"],
                          "impressions": kw["impressions"]},
            ))

    return recs


def analyze_campaign_health(metrics_30d, metrics_7d, guardrails, regional_priorities, db_campaigns):
    """Flag unhealthy campaigns (low CTR, dropping conversion rate)."""
    recs = []

    for cid, m30 in metrics_30d.items():
        if m30["cost"] < 30:
            continue

        m7 = metrics_7d.get(cid)
        parsed = m30["parsed"]

        is_protected = False
        if parsed.get("region") and parsed["region"] in regional_priorities:
            rp = regional_priorities[parsed["region"]]
            if rp.get("protected"):
                is_protected = True

        is_new = False
        db_camp = db_campaigns.get(cid, {})
        if db_camp.get("start_date"):
            try:
                start = datetime.fromisoformat(db_camp["start_date"])
                if (datetime.now() - start).days < guardrails["learning_period_days"]:
                    is_new = True
            except (ValueError, TypeError):
                pass

        # Low CTR on search
        if m30["ctr"] < 1.0 and m30["impressions"] > 500:
            conf = adjust_confidence(65, m30["clicks"], is_protected, is_new, False)
            recs.append(Recommendation(
                rec_type="campaign_health",
                campaign_id=cid,
                campaign_name=m30["campaign_name"],
                title=f"Low CTR: {m30['ctr']:.2f}%",
                detail=f"CTR below 1% suggests ad copy needs refresh or keyword alignment. "
                       f"{m30['impressions']:,} impressions, {m30['clicks']} clicks.",
                confidence=conf,
                severity="medium",
                action=f"Refresh ad copy for {m30['campaign_name']}",
                metadata={"ctr": round(m30["ctr"], 2), "impressions": m30["impressions"]},
            ))

        # Conversion rate dropping
        if m7 and m30["clicks"] > 100 and m7["clicks"] > 30:
            cvr_30 = (m30["conversions"] / m30["clicks"]) if m30["clicks"] > 0 else 0
            cvr_7 = (m7["conversions"] / m7["clicks"]) if m7["clicks"] > 0 else 0
            if cvr_30 > 0 and cvr_7 > 0:
                cvr_change = (cvr_7 - cvr_30) / cvr_30
                if cvr_change < -0.30:
                    if is_new:
                        continue
                    conf = adjust_confidence(70, m7["clicks"], is_protected, is_new, True)
                    recs.append(Recommendation(
                        rec_type="campaign_health",
                        campaign_id=cid,
                        campaign_name=m30["campaign_name"],
                        title=f"Conv. rate dropped {abs(cvr_change):.0%}",
                        detail=f"30d CVR: {cvr_30:.2%} → 7d CVR: {cvr_7:.2%}. "
                               f"Check landing page, audience, or ad relevance.",
                        confidence=conf,
                        severity="high" if cvr_change < -0.50 else "medium",
                        metadata={"cvr_30d": round(cvr_30 * 100, 2), "cvr_7d": round(cvr_7 * 100, 2),
                                  "cvr_change_pct": round(cvr_change * 100, 1)},
                    ))

    return recs


# ─── LLM Assessment ───────────────────────────────────

def llm_assess_borderline(recs, knowledge_context):
    """For borderline recommendations (confidence 50-75), ask Claude for validation."""
    if not OPENCLAW_TOKEN:
        return recs

    borderline = [r for r in recs if 50 <= r.confidence <= 75]
    if not borderline:
        return recs

    # Batch up to 10 borderline recs
    batch = borderline[:10]
    recs_text = "\n".join(
        f"{i+1}. [{r.type}] {r.campaign_name}: {r.title} (confidence: {r.confidence})\n   Detail: {r.detail}"
        for i, r in enumerate(batch)
    )

    try:
        data = json.dumps({
            "model": "claude-sonnet-4-6",
            "max_tokens": 2000,
            "messages": [
                {"role": "system", "content": f"""You are a Google Ads optimization expert for Telnyx, a B2B cloud communications company.

CONTEXT:
{knowledge_context[:3000]}

Review these borderline optimization recommendations. For each, respond with a JSON array:
[{{"index": N, "adjust": -10 to +10, "note": "brief reasoning"}}]

Adjust confidence UP if the recommendation aligns with Telnyx strategy and product goals.
Adjust DOWN if it could hurt important campaigns or doesn't account for market context."""},
                {"role": "user", "content": f"Review these {len(batch)} recommendations:\n\n{recs_text}"},
            ],
            "temperature": 0.1,
        }).encode()

        req = urllib.request.Request(
            OPENCLAW_BASE, data=data,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {OPENCLAW_TOKEN}"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())

        content = result["choices"][0]["message"]["content"].strip()
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```\s*$', '', content)
        start = content.find('[')
        if start >= 0:
            depth = 0
            for i in range(start, len(content)):
                if content[i] == '[': depth += 1
                elif content[i] == ']':
                    depth -= 1
                    if depth == 0:
                        adjustments = json.loads(content[start:i+1])
                        for adj in adjustments:
                            idx = adj.get("index", 0) - 1
                            if 0 <= idx < len(batch):
                                batch[idx].confidence = max(0, min(100, batch[idx].confidence + adj.get("adjust", 0)))
                                if adj.get("note"):
                                    batch[idx].metadata["llm_note"] = adj["note"]
                        print(f"  LLM assessed {len(adjustments)} borderline recs")
                        break
    except Exception as e:
        print(f"  LLM assessment error: {e}")

    return recs


# ─── Output ───────────────────────────────────────────

def log_to_db(recs, start_time, end_time, metrics_30d, dry_run):
    """Log run and recommendations to DB."""
    if dry_run:
        print("  [DRY RUN] Skipping DB writes")
        return None

    import psycopg2
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Ensure agent exists
    cur.execute("""SELECT id FROM "Agent" WHERE slug = 'google-ads-optimizer'""")
    agent_row = cur.fetchone()
    if not agent_row:
        cur.execute("""INSERT INTO "Agent" (id, slug, name, description, model, enabled, "createdAt")
            VALUES (gen_random_uuid()::text, 'google-ads-optimizer', 'Google Ads Optimizer',
            'Analyzes campaigns and generates optimization recommendations', 'python-script', true, NOW())
            RETURNING id""")
        agent_id = cur.fetchone()[0]
    else:
        agent_id = agent_row[0]

    actionable = [r for r in recs if r.confidence >= 70]
    recommend_only = [r for r in recs if r.confidence < 70]

    summary = {
        "summary": f"Analyzed {len(metrics_30d)} campaigns. {len(recs)} findings: "
                   f"{len(actionable)} actionable, {len(recommend_only)} recommend-only.",
        "findings": [r.to_dict() for r in sorted(recs, key=lambda x: x.confidence, reverse=True)[:20]],
        "stats": {
            "campaigns_analyzed": len(metrics_30d),
            "total_findings": len(recs),
            "actionable": len(actionable),
            "recommend_only": len(recommend_only),
            "by_type": {},
        },
    }
    type_counts = defaultdict(int)
    for r in recs:
        type_counts[r.type] += 1
    summary["stats"]["by_type"] = dict(type_counts)

    cur.execute("""INSERT INTO "AgentRun" (id, "agentId", status, input, output, "findingsCount", "recsCount",
        "startedAt", "completedAt", "createdAt")
        VALUES (gen_random_uuid()::text, %s, 'done', %s, %s, %s, %s, %s, %s, NOW()) RETURNING id""",
        (agent_id,
         json.dumps({"days": 30, "type": "google-ads-optimization"}),
         json.dumps(summary),
         len(recs),
         len(actionable),
         start_time,
         end_time))
    run_id = cur.fetchone()[0]

    # Store each recommendation
    for r in recs:
        status = "actionable" if r.confidence >= 70 else "recommend_only"
        cur.execute("""INSERT INTO "Recommendation" (id, "agentRunId", type, severity, target, "targetId",
            action, rationale, impact, status, "createdAt")
            VALUES (gen_random_uuid()::text, %s, 'google-ads-optimization', %s, %s, %s, %s, %s, %s, %s, NOW())""",
            (run_id, r.severity, r.campaign_name, r.campaign_id,
             r.action, r.detail, json.dumps(r.metadata), status))

    conn.commit()
    cur.close()
    conn.close()
    print(f"  AgentRun {run_id} with {len(recs)} recommendations")
    return run_id


def send_telegram_report(recs, metrics_30d, start_time, dry_run):
    """Post summary to Agent Activity thread."""
    if dry_run:
        print("  [DRY RUN] Skipping Telegram notification")
        return

    actionable = [r for r in recs if r.confidence >= 70]
    recommend_only = [r for r in recs if r.confidence < 70]

    lines = [f"<b>Google Ads Optimizer</b> — {start_time.strftime('%b %d')}"]
    lines.append(f"{len(metrics_30d)} campaigns analyzed")
    lines.append(f"📊 {len(recs)} findings: {len(actionable)} actionable, {len(recommend_only)} review-only")

    if recs:
        lines.append("")
        lines.append("<b>Top Recommendations:</b>")
        top = sorted(recs, key=lambda x: x.confidence, reverse=True)[:5]
        for r in top:
            icon = "🔴" if r.severity == "high" else "🟡" if r.severity == "medium" else "🟢"
            lines.append(f"{icon} [{r.confidence}%] {r.title}")
            lines.append(f"  → {r.campaign_name[:50]}")

    # Type breakdown
    type_counts = defaultdict(int)
    for r in recs:
        type_counts[r.type] += 1
    if type_counts:
        lines.append("")
        type_labels = {
            "budget_efficiency": "💰 Budget",
            "impression_share": "📈 Impression Share",
            "keyword_performance": "🔑 Keywords",
            "keyword_quality": "⭐ Quality Score",
            "campaign_health": "🏥 Health",
        }
        breakdown = ", ".join(f"{type_labels.get(t, t)}: {c}" for t, c in sorted(type_counts.items(), key=lambda x: -x[1]))
        lines.append(breakdown)

    msg = "\n".join(lines)

    try:
        data = json.dumps({
            "chat_id": TELEGRAM_CHAT_ID,
            "message_thread_id": TELEGRAM_THREAD_ID,
            "text": msg,
            "parse_mode": "HTML",
        }).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data=data, headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)
        print("  Telegram: summary sent to Agent Activity")
    except Exception as e:
        print(f"  Telegram send failed: {e}")


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Google Ads Optimizer Agent")
    parser.add_argument("--dry-run", action="store_true", help="Analyze only, no DB writes or notifications")
    parser.add_argument("--days", type=int, default=30, help="Days of data for analysis")
    parser.add_argument("--verbose", action="store_true", help="Show detailed output")
    args = parser.parse_args()

    start_time = datetime.now(timezone.utc)
    print(f"⚡ Google Ads Optimizer — {start_time.strftime('%Y-%m-%d %H:%M UTC')}")
    if args.dry_run:
        print("   ⚠️  DRY RUN — no changes will be applied")
    print()

    # 1. Load context
    print("Loading context...")
    knowledge_context = load_knowledge_context()
    guardrails = load_guardrails()
    regional_priorities = load_regional_priorities()
    db_campaigns = load_db_campaigns()

    print(f"  Guardrails: confidence_threshold={guardrails['confidence_threshold']}, "
          f"learning_period={guardrails['learning_period_days']}d, "
          f"budget_change_max={guardrails['budget_change_max_no_approval']:.0%}")

    # 2. Fetch live metrics
    print("\nFetching Google Ads metrics...")
    client = get_client()

    print(f"  Fetching {args.days}-day campaign metrics...")
    metrics_30d = fetch_campaign_metrics(client, days=args.days)
    print(f"  {len(metrics_30d)} active campaigns")

    print(f"  Fetching 7-day campaign metrics...")
    metrics_7d = fetch_campaign_metrics(client, days=7)
    print(f"  {len(metrics_7d)} campaigns with 7d data")

    print(f"  Fetching keyword metrics ({args.days}d)...")
    keywords = fetch_keyword_metrics(client, days=args.days)
    print(f"  {len(keywords)} keywords")

    # 3. Run analysis modules
    print("\nRunning analysis...")
    all_recs = []

    print("  [1/4] Budget efficiency...")
    recs = analyze_budget_efficiency(metrics_30d, metrics_7d, guardrails, regional_priorities, db_campaigns)
    all_recs.extend(recs)
    print(f"    {len(recs)} findings")

    print("  [2/4] Impression share...")
    recs = analyze_impression_share(metrics_30d, guardrails, regional_priorities)
    all_recs.extend(recs)
    print(f"    {len(recs)} findings")

    print("  [3/4] Keyword performance...")
    recs = analyze_keyword_performance(keywords, guardrails, regional_priorities, metrics_30d)
    all_recs.extend(recs)
    print(f"    {len(recs)} findings")

    print("  [4/4] Campaign health...")
    recs = analyze_campaign_health(metrics_30d, metrics_7d, guardrails, regional_priorities, db_campaigns)
    all_recs.extend(recs)
    print(f"    {len(recs)} findings")

    # 4. LLM assessment for borderline cases
    print("\nLLM assessment of borderline recommendations...")
    all_recs = llm_assess_borderline(all_recs, knowledge_context)

    # 5. Classify by confidence threshold
    threshold = guardrails["confidence_threshold"]
    actionable = [r for r in all_recs if r.confidence >= threshold]
    recommend_only = [r for r in all_recs if r.confidence < threshold]

    end_time = datetime.now(timezone.utc)

    # 6. Report
    print(f"\n{'='*60}")
    print(f"RESULTS:")
    print(f"  Campaigns analyzed: {len(metrics_30d)}")
    print(f"  Keywords analyzed:  {len(keywords)}")
    print(f"  Total findings:     {len(all_recs)}")
    print(f"  Actionable (≥{threshold}%): {len(actionable)}")
    print(f"  Recommend only:     {len(recommend_only)}")
    print(f"  Runtime:            {(end_time - start_time).total_seconds():.0f}s")
    print(f"{'='*60}")

    if all_recs and args.verbose:
        print(f"\nAll recommendations (sorted by confidence):")
        for r in sorted(all_recs, key=lambda x: x.confidence, reverse=True):
            icon = "✅" if r.confidence >= threshold else "📋"
            sev = "🔴" if r.severity == "high" else "🟡" if r.severity == "medium" else "🟢"
            print(f"  {icon} {sev} [{r.confidence}%] {r.title}")
            print(f"       → {r.campaign_name}")
            print(f"       → {r.detail[:100]}")
    elif all_recs:
        print(f"\nTop 10 recommendations:")
        for r in sorted(all_recs, key=lambda x: x.confidence, reverse=True)[:10]:
            icon = "✅" if r.confidence >= threshold else "📋"
            sev = "🔴" if r.severity == "high" else "🟡" if r.severity == "medium" else "🟢"
            print(f"  {icon} {sev} [{r.confidence}%] {r.title}")
            print(f"       → {r.campaign_name}")

    # 7. Log to DB
    print("\nLogging to DB...")
    run_id = log_to_db(all_recs, start_time, end_time, metrics_30d, args.dry_run)

    # 8. Telegram notification
    print("\nSending notification...")
    send_telegram_report(all_recs, metrics_30d, start_time, args.dry_run)

    # 9. Save JSON log
    os.makedirs(LOG_DIR, exist_ok=True)
    log_file = os.path.join(LOG_DIR, f"{start_time.strftime('%Y-%m-%d')}.json")
    log_data = {
        "timestamp": start_time.isoformat(),
        "runtime_seconds": (end_time - start_time).total_seconds(),
        "dry_run": args.dry_run,
        "campaigns_analyzed": len(metrics_30d),
        "keywords_analyzed": len(keywords),
        "total_findings": len(all_recs),
        "actionable": len(actionable),
        "recommend_only": len(recommend_only),
        "recommendations": [r.to_dict() for r in sorted(all_recs, key=lambda x: x.confidence, reverse=True)],
        "guardrails": guardrails,
    }
    with open(log_file, "w") as f:
        json.dump(log_data, f, indent=2)
    print(f"\nLog saved to {log_file}")


if __name__ == "__main__":
    main()
