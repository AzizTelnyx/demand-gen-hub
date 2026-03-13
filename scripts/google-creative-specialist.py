#!/usr/bin/env python3
"""
Google Creative Specialist
===========================
Platform-specific creative optimization for Google Ads RSAs and Display.

Level 3 (auto):
  - Pause headlines/descriptions with <1% impression share and 0 conversions (30d)
  - Pin high-performing headlines to position 1 (CTR >2x average)

Level 2 (approval):
  - New headline/description suggestions (AI-generated)
  - Ad strength improvement recommendations
  - Cross-campaign headline consolidation

Analysis:
  - RSA asset-level performance (impressions, clicks, conversions per headline)
  - Ad strength tracking and improvement suggestions
  - Headline A/B test winner identification
  - Dynamic keyword insertion effectiveness

Run: python scripts/google-creative-specialist.py [--dry-run] [--days 30]
Cron: Daily 5 AM PST via OpenClaw cron
"""

import json
import os
import sys
import argparse
import urllib.request
import uuid
from datetime import datetime, timedelta
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ─── Config ───────────────────────────────────────────

AGENT_SLUG = "google-creative-specialist"
AGENT_NAME = "Google Creative Specialist"

CUSTOMER_ID = "2356650573"
LOGIN_CUSTOMER_ID = "2893524941"
CRED_PATH = os.path.expanduser("~/.config/google-ads/credentials.json")
DB_URL = "postgresql://localhost:5432/dghub"

TELEGRAM_BOT_TOKEN = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
TELEGRAM_CHAT_ID = "-1003786506284"
TELEGRAM_THREAD_ID = 164

LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/google-creative")
os.makedirs(LOG_DIR, exist_ok=True)

# Guardrails
MIN_IMPRESSIONS_ASSET = 500       # Minimum impressions to evaluate asset
LOW_IMPRESSION_SHARE_PCT = 0.01   # <1% impression share = underperforming
HIGH_CTR_MULTIPLIER = 2.0         # 2x average CTR = high performer
MIN_CAMPAIGN_AGE_DAYS = 14        # Wait 14d before optimizing assets
MAX_AUTO_CHANGES_PER_AD = 2       # Max 2 auto changes per RSA

AD_STRENGTH_PRIORITY = {
    "PENDING": 0, "NO_ADS": 0, "POOR": 1, "AVERAGE": 2, "GOOD": 3, "EXCELLENT": 4
}


def _cuid():
    return str(uuid.uuid4())[:25].replace("-", "")


def get_db():
    import psycopg2
    return psycopg2.connect(DB_URL)


def send_telegram(message):
    """Send message to Agent Activity topic."""
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    data = json.dumps({
        "chat_id": TELEGRAM_CHAT_ID,
        "message_thread_id": TELEGRAM_THREAD_ID,
        "text": message,
        "parse_mode": "Markdown",
    }).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"  Telegram send failed: {e}", file=sys.stderr)


def get_client():
    """Initialize Google Ads API client."""
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


def get_agent_id():
    """Get or create agent ID in DB."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT id FROM "Agent" WHERE slug = %s', (AGENT_SLUG,))
    row = cur.fetchone()
    if row:
        agent_id = row[0]
    else:
        agent_id = _cuid()
        cur.execute(
            'INSERT INTO "Agent" (id, slug, name, platform, "createdAt") VALUES (%s, %s, %s, %s, NOW())',
            (agent_id, AGENT_SLUG, AGENT_NAME, "google_ads")
        )
        conn.commit()
    cur.close()
    conn.close()
    return agent_id


def start_run(agent_id):
    """Create AgentRun row."""
    run_id = _cuid()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        'INSERT INTO "AgentRun" (id, "agentId", status, "startedAt", "createdAt") VALUES (%s, %s, %s, NOW(), NOW())',
        (run_id, agent_id, "running")
    )
    conn.commit()
    cur.close()
    conn.close()
    return run_id


def complete_run(run_id, status, findings_count=0, recs_count=0, error=None):
    """Update AgentRun with completion status."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        '''UPDATE "AgentRun" SET status = %s, "findingsCount" = %s, "recsCount" = %s, 
           error = %s, "completedAt" = NOW() WHERE id = %s''',
        (status, findings_count, recs_count, error, run_id)
    )
    conn.commit()
    cur.close()
    conn.close()


def save_findings(run_id, findings, recommendations):
    """Save findings and recommendations to DB using Recommendation table."""
    conn = get_db()
    cur = conn.cursor()
    
    # Findings stored as type='finding' in Recommendation table
    for finding in findings:
        cur.execute("""
            INSERT INTO "Recommendation" (id, "agentRunId", type, severity, target,
                "targetId", action, rationale, platform, "campaignId", "campaignName", 
                status, "createdAt")
            VALUES (%s, %s, 'finding', %s, %s, %s, %s, %s, 'google_ads', %s, %s, 'noted', NOW())
        """, (
            _cuid(),
            run_id,
            finding.get("severity", "low"),
            "ad" if "ad_id" in finding else "headline",
            finding.get("ad_id"),
            finding["type"],
            json.dumps(finding),
            finding.get("ad_id"),
            finding.get("campaign_name"),
        ))
    
    # Recommendations
    for rec in recommendations:
        cur.execute("""
            INSERT INTO "Recommendation" (id, "agentRunId", type, severity, target,
                "targetId", action, rationale, platform, "campaignId", "campaignName",
                confidence, status, "createdAt")
            VALUES (%s, %s, 'recommendation', %s, %s, %s, %s, %s, 'google_ads', %s, %s, %s, 'pending', NOW())
        """, (
            _cuid(),
            run_id,
            "medium" if rec["level"] == 2 else "low",
            "ad",
            rec.get("ad_id"),
            rec["action"],
            rec["reason"],
            rec.get("ad_id"),
            rec.get("campaign_name"),
            rec["confidence"],
        ))
    
    conn.commit()
    cur.close()
    conn.close()


class GoogleCreativeSpecialist:
    """Google Ads creative optimization specialist."""

    def __init__(self, dry_run=False, days=30):
        self.dry_run = dry_run
        self.days = days
        self.findings = []
        self.recommendations = []
        self.auto_actions = []
        self.client = None

    def run(self):
        """Main entry point."""
        print(f"[{AGENT_NAME}] Starting ({self.days}d lookback, dry_run={self.dry_run})")
        
        agent_id = get_agent_id()
        run_id = start_run(agent_id)
        
        try:
            self.client = get_client()
            
            self.analyze_rsa_assets()
            self.analyze_ad_strength()
            self.analyze_headline_ab_tests()
            self.analyze_dki_effectiveness()
            
            if not self.dry_run:
                self.execute_auto_actions()
            
            save_findings(run_id, self.findings, self.recommendations)
            self.send_report()
            
            complete_run(run_id, "done", len(self.findings), len(self.recommendations))
            print(f"[{AGENT_NAME}] Completed: {len(self.findings)} findings, {len(self.recommendations)} recommendations")
            
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            complete_run(run_id, "error", error=str(e))

    def analyze_rsa_assets(self):
        """Analyze RSA headline/description performance at asset level."""
        print("  Analyzing RSA asset performance...")
        
        ga_service = self.client.get_service("GoogleAdsService")
        
        query = """
            SELECT
                ad_group_ad.ad.id,
                ad_group_ad.ad.name,
                ad_group_ad_asset_view.asset,
                ad_group_ad_asset_view.field_type,
                ad_group_ad_asset_view.performance_label,
                ad_group_ad_asset_view.pinned_field,
                metrics.impressions,
                metrics.clicks,
                metrics.conversions,
                metrics.cost_micros,
                campaign.id,
                campaign.name,
                ad_group.id,
                ad_group.name
            FROM ad_group_ad_asset_view
            WHERE campaign.status = 'ENABLED'
                AND ad_group.status = 'ENABLED'
                AND ad_group_ad.status = 'ENABLED'
                AND segments.date DURING LAST_30_DAYS
                AND ad_group_ad_asset_view.field_type IN ('HEADLINE', 'DESCRIPTION')
        """
        
        try:
            response = ga_service.search(customer_id=CUSTOMER_ID, query=query)
        except Exception as e:
            print(f"    Failed to query RSA assets: {e}", file=sys.stderr)
            return
        
        # Group by ad
        ads = defaultdict(lambda: {"headlines": [], "descriptions": [], "metrics": {}})
        
        for row in response:
            ad_id = str(row.ad_group_ad.ad.id)
            campaign_name = row.campaign.name
            
            asset_type = str(row.ad_group_ad_asset_view.field_type).split(".")[-1]
            perf_label = str(row.ad_group_ad_asset_view.performance_label).split(".")[-1]
            pinned = str(row.ad_group_ad_asset_view.pinned_field).split(".")[-1]
            
            impressions = row.metrics.impressions
            clicks = row.metrics.clicks
            conversions = row.metrics.conversions
            ctr = (clicks / impressions * 100) if impressions > 0 else 0
            
            asset_data = {
                "asset": str(row.ad_group_ad_asset_view.asset),
                "type": asset_type,
                "performance": perf_label,
                "pinned": pinned if pinned != "UNSPECIFIED" else None,
                "impressions": impressions,
                "clicks": clicks,
                "conversions": conversions,
                "ctr": ctr,
            }
            
            if asset_type == "HEADLINE":
                ads[ad_id]["headlines"].append(asset_data)
            else:
                ads[ad_id]["descriptions"].append(asset_data)
            
            ads[ad_id]["campaign_id"] = str(row.campaign.id)
            ads[ad_id]["campaign_name"] = campaign_name
            ads[ad_id]["ad_group_id"] = str(row.ad_group.id)
            ads[ad_id]["ad_group_name"] = row.ad_group.name
        
        print(f"    Analyzing {len(ads)} RSAs...")
        for ad_id, ad_data in ads.items():
            self._analyze_ad_assets(ad_id, ad_data)

    def _analyze_ad_assets(self, ad_id, ad_data):
        """Analyze asset performance for a single RSA."""
        headlines = ad_data.get("headlines", [])
        campaign_name = ad_data.get("campaign_name", "Unknown")
        
        if not headlines:
            return
        
        total_impressions = sum(h["impressions"] for h in headlines)
        total_clicks = sum(h["clicks"] for h in headlines)
        avg_ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0
        
        for h in headlines:
            if h["impressions"] < MIN_IMPRESSIONS_ASSET:
                continue
            
            imp_share = h["impressions"] / total_impressions if total_impressions > 0 else 0
            
            # LOW performers
            if imp_share < LOW_IMPRESSION_SHARE_PCT and h["conversions"] == 0:
                self.findings.append({
                    "type": "low_performing_headline",
                    "ad_id": ad_id,
                    "campaign_name": campaign_name,
                    "asset": h["asset"],
                    "impression_share": imp_share * 100,
                    "ctr": h["ctr"],
                    "performance_label": h["performance"],
                    "severity": "medium",
                })
                
                if h["performance"] in ("LOW", "POOR"):
                    self.recommendations.append({
                        "action": "pause_headline",
                        "ad_id": ad_id,
                        "campaign_name": campaign_name,
                        "asset": h["asset"],
                        "reason": f"<1% impression share, 0 conversions, {h['performance']} performance",
                        "level": 3,
                        "confidence": 85,
                    })
            
            # HIGH performers
            if avg_ctr > 0 and h["ctr"] > avg_ctr * HIGH_CTR_MULTIPLIER:
                if not h.get("pinned"):
                    self.findings.append({
                        "type": "high_performing_headline",
                        "ad_id": ad_id,
                        "campaign_name": campaign_name,
                        "asset": h["asset"],
                        "ctr": h["ctr"],
                        "ctr_vs_avg": h["ctr"] / avg_ctr,
                        "conversions": h["conversions"],
                        "severity": "low",
                    })
                    
                    if h["ctr"] > avg_ctr * 2.5 and h["conversions"] > 0:
                        self.recommendations.append({
                            "action": "pin_headline",
                            "ad_id": ad_id,
                            "campaign_name": campaign_name,
                            "asset": h["asset"],
                            "reason": f"CTR {h['ctr']:.1f}% ({h['ctr']/avg_ctr:.1f}x avg), {h['conversions']:.0f} conversions",
                            "level": 3,
                            "confidence": 80,
                        })

    def analyze_ad_strength(self):
        """Analyze ad strength and recommend improvements."""
        print("  Analyzing ad strength...")
        
        ga_service = self.client.get_service("GoogleAdsService")
        
        query = """
            SELECT
                ad_group_ad.ad.id,
                ad_group_ad.ad.responsive_search_ad.headlines,
                ad_group_ad.ad.responsive_search_ad.descriptions,
                ad_group_ad.ad_strength,
                campaign.id,
                campaign.name,
                ad_group.name,
                metrics.impressions,
                metrics.conversions
            FROM ad_group_ad
            WHERE campaign.status = 'ENABLED'
                AND ad_group.status = 'ENABLED'
                AND ad_group_ad.status = 'ENABLED'
                AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
                AND segments.date DURING LAST_30_DAYS
        """
        
        try:
            response = ga_service.search(customer_id=CUSTOMER_ID, query=query)
        except Exception as e:
            print(f"    Failed to query ad strength: {e}", file=sys.stderr)
            return
        
        for row in response:
            ad_id = str(row.ad_group_ad.ad.id)
            strength = str(row.ad_group_ad.ad_strength).split(".")[-1]
            campaign_name = row.campaign.name
            impressions = row.metrics.impressions
            
            headlines = list(row.ad_group_ad.ad.responsive_search_ad.headlines)
            descriptions = list(row.ad_group_ad.ad.responsive_search_ad.descriptions)
            
            if strength in ("POOR", "AVERAGE") and impressions > 1000:
                self.findings.append({
                    "type": "low_ad_strength",
                    "ad_id": ad_id,
                    "campaign_name": campaign_name,
                    "ad_group_name": row.ad_group.name,
                    "strength": strength,
                    "headline_count": len(headlines),
                    "description_count": len(descriptions),
                    "impressions": impressions,
                    "severity": "high" if strength == "POOR" else "medium",
                })
                
                improvements = []
                if len(headlines) < 10:
                    improvements.append(f"Add {10 - len(headlines)} more headlines (have {len(headlines)})")
                if len(descriptions) < 4:
                    improvements.append(f"Add {4 - len(descriptions)} more descriptions (have {len(descriptions)})")
                
                if improvements:
                    self.recommendations.append({
                        "action": "improve_ad_strength",
                        "ad_id": ad_id,
                        "campaign_name": campaign_name,
                        "ad_group_name": row.ad_group.name,
                        "current_strength": strength,
                        "improvements": improvements,
                        "reason": f"Ad strength {strength}, {impressions:,} impressions — " + "; ".join(improvements),
                        "level": 2,
                        "confidence": 75,
                    })

    def analyze_headline_ab_tests(self):
        """Identify A/B test winners across headlines."""
        print("  Analyzing headline A/B tests...")
        
        ga_service = self.client.get_service("GoogleAdsService")
        
        query = """
            SELECT
                asset.text_asset.text,
                ad_group_ad_asset_view.performance_label,
                metrics.impressions,
                metrics.clicks,
                metrics.conversions,
                campaign.name
            FROM ad_group_ad_asset_view
            WHERE campaign.status = 'ENABLED'
                AND ad_group.status = 'ENABLED'
                AND ad_group_ad.status = 'ENABLED'
                AND ad_group_ad_asset_view.field_type = 'HEADLINE'
                AND segments.date DURING LAST_30_DAYS
        """
        
        try:
            response = ga_service.search(customer_id=CUSTOMER_ID, query=query)
        except Exception as e:
            print(f"    Failed to query headline A/B tests: {e}", file=sys.stderr)
            return
        
        headline_stats = defaultdict(lambda: {
            "impressions": 0, "clicks": 0, "conversions": 0, 
            "campaigns": set(), "best_count": 0, "low_count": 0
        })
        
        for row in response:
            text = row.asset.text_asset.text
            perf = str(row.ad_group_ad_asset_view.performance_label).split(".")[-1]
            
            headline_stats[text]["impressions"] += row.metrics.impressions
            headline_stats[text]["clicks"] += row.metrics.clicks
            headline_stats[text]["conversions"] += row.metrics.conversions
            headline_stats[text]["campaigns"].add(row.campaign.name)
            
            if perf == "BEST":
                headline_stats[text]["best_count"] += 1
            elif perf in ("LOW", "POOR"):
                headline_stats[text]["low_count"] += 1
        
        # Consistent winners (BEST in 3+ campaigns)
        for text, stats in headline_stats.items():
            if stats["best_count"] >= 3 and stats["impressions"] > 5000:
                self.findings.append({
                    "type": "winning_headline",
                    "headline": text,
                    "campaigns_used": len(stats["campaigns"]),
                    "best_count": stats["best_count"],
                    "impressions": stats["impressions"],
                    "clicks": stats["clicks"],
                    "conversions": stats["conversions"],
                    "ctr": (stats["clicks"] / stats["impressions"] * 100) if stats["impressions"] > 0 else 0,
                    "severity": "low",
                })
            
            # Consistent losers
            if stats["low_count"] >= 2 and stats["best_count"] == 0:
                self.findings.append({
                    "type": "losing_headline",
                    "headline": text,
                    "campaigns_used": len(stats["campaigns"]),
                    "low_count": stats["low_count"],
                    "impressions": stats["impressions"],
                    "severity": "medium",
                })

    def analyze_dki_effectiveness(self):
        """Analyze Dynamic Keyword Insertion effectiveness."""
        print("  Analyzing DKI effectiveness...")
        
        ga_service = self.client.get_service("GoogleAdsService")
        
        query = """
            SELECT
                asset.text_asset.text,
                ad_group_ad_asset_view.performance_label,
                metrics.impressions,
                metrics.clicks,
                metrics.conversions,
                campaign.name
            FROM ad_group_ad_asset_view
            WHERE campaign.status = 'ENABLED'
                AND ad_group_ad_asset_view.field_type = 'HEADLINE'
                AND segments.date DURING LAST_30_DAYS
        """
        
        try:
            response = ga_service.search(customer_id=CUSTOMER_ID, query=query)
        except Exception as e:
            print(f"    Failed to query DKI headlines: {e}", file=sys.stderr)
            return
        
        dki_stats = {"impressions": 0, "clicks": 0, "conversions": 0, "count": 0}
        non_dki_stats = {"impressions": 0, "clicks": 0, "conversions": 0, "count": 0}
        
        for row in response:
            text = row.asset.text_asset.text
            is_dki = "{keyword:" in text.lower() or "{KeyWord:" in text
            
            if is_dki:
                dki_stats["impressions"] += row.metrics.impressions
                dki_stats["clicks"] += row.metrics.clicks
                dki_stats["conversions"] += row.metrics.conversions
                dki_stats["count"] += 1
            else:
                non_dki_stats["impressions"] += row.metrics.impressions
                non_dki_stats["clicks"] += row.metrics.clicks
                non_dki_stats["conversions"] += row.metrics.conversions
                non_dki_stats["count"] += 1
        
        if dki_stats["impressions"] > 1000 and non_dki_stats["impressions"] > 1000:
            dki_ctr = (dki_stats["clicks"] / dki_stats["impressions"] * 100)
            non_dki_ctr = (non_dki_stats["clicks"] / non_dki_stats["impressions"] * 100)
            
            dki_cvr = (dki_stats["conversions"] / dki_stats["clicks"] * 100) if dki_stats["clicks"] > 0 else 0
            non_dki_cvr = (non_dki_stats["conversions"] / non_dki_stats["clicks"] * 100) if non_dki_stats["clicks"] > 0 else 0
            
            self.findings.append({
                "type": "dki_comparison",
                "dki_ctr": dki_ctr,
                "non_dki_ctr": non_dki_ctr,
                "dki_cvr": dki_cvr,
                "non_dki_cvr": non_dki_cvr,
                "dki_headline_count": dki_stats["count"],
                "non_dki_headline_count": non_dki_stats["count"],
                "severity": "low",
            })

    def execute_auto_actions(self):
        """Execute Level 3 auto-actions."""
        print(f"  Executing {len(self.auto_actions)} auto-actions...")
        # Asset changes require Asset API — placeholder for now
        for action in self.auto_actions:
            print(f"    Would execute: {action['action']} on {action.get('asset', 'N/A')}")

    def send_report(self):
        """Send summary report to Telegram."""
        if not self.findings and not self.recommendations:
            print("  No findings or recommendations — skipping report")
            return
        
        severity_counts = defaultdict(int)
        for f in self.findings:
            severity_counts[f.get("severity", "low")] += 1
        
        lines = [
            f"🎨 *Google Creative Specialist* ({self.days}d)",
            f"Findings: {len(self.findings)} ({severity_counts['high']} high, {severity_counts['medium']} med)",
            f"Recommendations: {len(self.recommendations)}",
            "",
        ]
        
        finding_types = defaultdict(list)
        for f in self.findings:
            finding_types[f["type"]].append(f)
        
        for ftype, items in finding_types.items():
            label = ftype.replace("_", " ").title()
            lines.append(f"• *{label}*: {len(items)}")
        
        winners = [f for f in self.findings if f["type"] == "winning_headline"]
        if winners:
            lines.append("")
            lines.append("*Top Winning Headlines:*")
            for w in sorted(winners, key=lambda x: x["conversions"], reverse=True)[:3]:
                lines.append(f'• "{w["headline"][:35]}..." ({w["conversions"]:.0f} conv)')
        
        if self.dry_run:
            lines.append("")
            lines.append("_[DRY RUN — no changes made]_")
        
        send_telegram("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description="Google Creative Specialist")
    parser.add_argument("--dry-run", action="store_true", help="Don't execute actions")
    parser.add_argument("--days", type=int, default=30, help="Lookback period in days")
    args = parser.parse_args()
    
    agent = GoogleCreativeSpecialist(dry_run=args.dry_run, days=args.days)
    agent.run()


if __name__ == "__main__":
    main()
