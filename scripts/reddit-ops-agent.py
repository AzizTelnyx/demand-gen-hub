#!/usr/bin/env python3
"""
Reddit Ops Agent
================
Platform-specific optimization for Reddit Ads.

Level 3 (auto): 
  - Pause underperforming subreddits/interests (>$200 spend, 0 conversions)
  - Budget adjustments ±15% based on pacing vs performance
  - Creative fatigue flagging (CTR decline >40% over 7d)

Level 2 (approval):
  - Add new subreddit/interest targeting
  - Pause campaigns
  - Budget changes >$50/day

Run: python scripts/reddit-ops-agent.py [--dry-run] [--days 30]
Cron: Daily 6 AM PST via OpenClaw cron
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
from platforms.reddit import RedditConnector

# ─── Config ───────────────────────────────────────────

AGENT_SLUG = "reddit-ops"
AGENT_NAME = "Reddit Ops Agent"

DB_URL = "postgresql://localhost:5432/dghub"
TELEGRAM_BOT_TOKEN = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
TELEGRAM_CHAT_ID = "-1003786506284"
TELEGRAM_THREAD_ID = 164

LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/reddit-ops")
os.makedirs(LOG_DIR, exist_ok=True)

# Guardrails
MIN_SPEND_FOR_ACTION = 200       # $200 minimum spend before pausing
CTR_DECLINE_THRESHOLD = 0.40    # 40% CTR decline = fatigue
MIN_IMPRESSIONS_ANALYSIS = 1000  # Need 1K impressions for reliable CTR
BUDGET_CHANGE_LIMIT = 0.15       # Max ±15% auto budget change
BUDGET_APPROVAL_THRESHOLD = 50   # >$50 change needs approval
MIN_CAMPAIGN_AGE_DAYS = 7

# CPA benchmarks by product
CPA_BENCHMARKS = {
    "voice_ai": 180,
    "voice_infrastructure": 150,
    "sip_trunking": 120,
    "contact_center": 200,
    "messaging": 100,
    "connectivity": 90,
    None: 150,
}

# Campaign name parsing
PRODUCT_MAP = {
    "voice ai": "voice_ai", "ai agent": "voice_ai", "vapi": "voice_ai",
    "contact center": "contact_center", "sip trunk": "sip_trunking",
    "sip": "sip_trunking", "voice api": "voice_infrastructure",
    "iot": "connectivity", "m2m": "connectivity",
    "sms": "messaging", "numbers": "connectivity",
}

FUNNEL_KEYWORDS = ["tofu", "mofu", "bofu"]
REGION_KEYWORDS = ["amer", "emea", "apac", "mena", "global"]


def _cuid():
    return str(uuid.uuid4())[:25].replace("-", "")


def get_db():
    import psycopg2
    return psycopg2.connect(DB_URL)


def parse_campaign_name(name):
    """Parse campaign name for context."""
    nl = name.lower()
    funnel = next((f.upper() for f in FUNNEL_KEYWORDS if f in nl), None)
    product = next((v for k, v in PRODUCT_MAP.items() if k in nl), None)
    region = next((r.upper() for r in REGION_KEYWORDS if r in nl), None)
    return {"funnel": funnel, "product": product, "region": region}


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
            (agent_id, AGENT_SLUG, AGENT_NAME, "reddit")
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
            VALUES (%s, %s, 'finding', %s, %s, %s, %s, %s, 'reddit', %s, %s, 'noted', NOW())
        """, (
            _cuid(),
            run_id,
            finding.get("severity", "low"),
            "campaign",
            finding.get("campaign_id"),
            finding["type"],
            json.dumps(finding),
            finding.get("campaign_id"),
            finding.get("campaign_name"),
        ))
    
    # Recommendations
    for rec in recommendations:
        cur.execute("""
            INSERT INTO "Recommendation" (id, "agentRunId", type, severity, target,
                "targetId", action, rationale, platform, "campaignId", "campaignName",
                confidence, status, "createdAt")
            VALUES (%s, %s, 'recommendation', %s, %s, %s, %s, %s, 'reddit', %s, %s, %s, 'pending', NOW())
        """, (
            _cuid(),
            run_id,
            "medium" if rec["level"] == 2 else "low",
            "campaign",
            rec.get("campaign_id"),
            rec["action"],
            rec["reason"],
            rec.get("campaign_id"),
            rec.get("campaign_name"),
            rec["confidence"],
        ))
    
    conn.commit()
    cur.close()
    conn.close()


class RedditOpsAgent:
    """Reddit Ads platform-specific optimization agent."""

    def __init__(self, dry_run=False, days=30):
        self.dry_run = dry_run
        self.days = days
        self.findings = []
        self.recommendations = []
        self.auto_actions = []
        self.reddit = None

    def run(self):
        """Main entry point."""
        print(f"[{AGENT_NAME}] Starting ({self.days}d lookback, dry_run={self.dry_run})")
        
        agent_id = get_agent_id()
        run_id = start_run(agent_id)
        
        try:
            self.reddit = RedditConnector()
            if not self.reddit.load_credentials():
                print("  ERROR: Failed to load Reddit credentials", file=sys.stderr)
                complete_run(run_id, "error", error="No Reddit credentials")
                return
            
            self.analyze_campaign_performance()
            self.analyze_targeting_performance()
            self.analyze_creative_fatigue()
            self.analyze_budget_pacing()
            
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

    def analyze_campaign_performance(self):
        """Analyze overall campaign performance."""
        print("  Analyzing campaign performance...")
        
        date_to = datetime.now().strftime("%Y-%m-%d")
        date_from = (datetime.now() - timedelta(days=self.days)).strftime("%Y-%m-%d")
        
        metrics = self.reddit.query_metrics(date_from, date_to, active_only=True)
        if metrics.error:
            print(f"    Failed to fetch Reddit metrics: {metrics.error}", file=sys.stderr)
            return
        
        for camp in metrics.campaigns:
            context = parse_campaign_name(camp.name)
            
            # Zero-conversion campaigns with significant spend
            if camp.spend >= MIN_SPEND_FOR_ACTION and camp.conversions == 0:
                self.findings.append({
                    "type": "zero_conversions",
                    "campaign_id": camp.campaign_id,
                    "campaign_name": camp.name,
                    "spend": camp.spend,
                    "impressions": camp.impressions,
                    "clicks": camp.clicks,
                    "ctr": camp.ctr,
                    "context": context,
                    "severity": "high",
                })
                
                self.recommendations.append({
                    "action": "pause_campaign",
                    "campaign_id": camp.campaign_id,
                    "campaign_name": camp.name,
                    "reason": f"${camp.spend:.0f} spent, 0 conversions over {self.days}d",
                    "level": 2,
                    "confidence": 85,
                })
            
            # High CPA campaigns (>3x benchmark)
            if camp.conversions > 0:
                cpa = camp.spend / camp.conversions
                benchmark = CPA_BENCHMARKS.get(context.get("product"), CPA_BENCHMARKS[None])
                if cpa > benchmark * 3:
                    self.findings.append({
                        "type": "high_cpa",
                        "campaign_id": camp.campaign_id,
                        "campaign_name": camp.name,
                        "cpa": cpa,
                        "benchmark_cpa": benchmark,
                        "multiplier": cpa / benchmark,
                        "severity": "medium",
                    })

    def analyze_targeting_performance(self):
        """Analyze subreddit/interest targeting performance."""
        print("  Analyzing targeting performance...")
        
        campaigns = self.reddit.fetch_campaigns(active_only=True)
        
        for camp in campaigns:
            targeting = camp.extra.get("targeting", {})
            communities = targeting.get("communities", [])
            interests = targeting.get("interests", [])
            
            # Too many communities (diluted)
            if len(communities) > 15:
                self.findings.append({
                    "type": "diluted_targeting",
                    "campaign_id": camp.external_id,
                    "campaign_name": camp.name,
                    "community_count": len(communities),
                    "recommendation": "Consider splitting into focused ad groups",
                    "severity": "low",
                })
            
            # No targeting (broad match)
            if not communities and not interests and not targeting.get("has_custom_audience"):
                self.findings.append({
                    "type": "no_targeting",
                    "campaign_id": camp.external_id,
                    "campaign_name": camp.name,
                    "severity": "medium",
                })
                self.recommendations.append({
                    "action": "add_targeting",
                    "campaign_id": camp.external_id,
                    "campaign_name": camp.name,
                    "reason": "No community or interest targeting — likely wasting spend",
                    "level": 2,
                    "confidence": 75,
                })

    def analyze_creative_fatigue(self):
        """Analyze creative performance for fatigue signals."""
        print("  Analyzing creative fatigue...")
        
        date_to = datetime.now().strftime("%Y-%m-%d")
        date_from_7d = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        date_from_14d = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")
        
        recent = self.reddit.query_metrics(date_from_7d, date_to, active_only=True)
        previous = self.reddit.query_metrics(date_from_14d, date_from_7d, active_only=True)
        
        if recent.error or previous.error:
            print("    Could not fetch comparison metrics for fatigue analysis", file=sys.stderr)
            return
        
        recent_ctr = {c.campaign_id: c.ctr for c in recent.campaigns if c.impressions >= MIN_IMPRESSIONS_ANALYSIS}
        previous_ctr = {c.campaign_id: c.ctr for c in previous.campaigns if c.impressions >= MIN_IMPRESSIONS_ANALYSIS}
        
        for cid, current_ctr in recent_ctr.items():
            if cid in previous_ctr and previous_ctr[cid] > 0:
                decline = (previous_ctr[cid] - current_ctr) / previous_ctr[cid]
                
                if decline >= CTR_DECLINE_THRESHOLD:
                    camp_name = next(
                        (c.name for c in recent.campaigns if c.campaign_id == cid),
                        f"Campaign {cid}"
                    )
                    
                    self.findings.append({
                        "type": "creative_fatigue",
                        "campaign_id": cid,
                        "campaign_name": camp_name,
                        "ctr_decline": decline * 100,
                        "previous_ctr": previous_ctr[cid],
                        "current_ctr": current_ctr,
                        "severity": "high" if decline >= 0.50 else "medium",
                    })
                    
                    self.recommendations.append({
                        "action": "refresh_creative",
                        "campaign_id": cid,
                        "campaign_name": camp_name,
                        "reason": f"CTR declined {decline*100:.0f}% in 7d (fatigue signal)",
                        "level": 2,
                        "confidence": 80,
                    })

    def analyze_budget_pacing(self):
        """Analyze budget pacing and recommend adjustments."""
        print("  Analyzing budget pacing...")
        
        campaigns = self.reddit.fetch_campaigns(active_only=True)
        
        date_to = datetime.now().strftime("%Y-%m-%d")
        date_from = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        metrics = self.reddit.query_metrics(date_from, date_to, active_only=True)
        if metrics.error:
            return
        
        metrics_by_id = {c.campaign_id: c for c in metrics.campaigns}
        
        for camp in campaigns:
            if camp.budget_type != "daily" or camp.budget <= 0:
                continue
            
            m = metrics_by_id.get(camp.external_id)
            if not m:
                continue
            
            daily_spend = m.spend / 7
            daily_budget = camp.budget
            pacing = daily_spend / daily_budget if daily_budget > 0 else 0
            
            # Underpacing: spending <70% with good performance
            if pacing < 0.70 and m.conversions > 0:
                cpa = m.spend / m.conversions
                context = parse_campaign_name(camp.name)
                benchmark = CPA_BENCHMARKS.get(context.get("product"), CPA_BENCHMARKS[None])
                
                if cpa <= benchmark * 1.2:
                    self.findings.append({
                        "type": "underpacing_good_cpa",
                        "campaign_id": camp.external_id,
                        "campaign_name": camp.name,
                        "pacing": pacing * 100,
                        "daily_budget": daily_budget,
                        "daily_spend": daily_spend,
                        "cpa": cpa,
                        "severity": "low",
                    })
            
            # Overpacing: spending >110% of budget
            if pacing > 1.10:
                self.findings.append({
                    "type": "overpacing",
                    "campaign_id": camp.external_id,
                    "campaign_name": camp.name,
                    "pacing": pacing * 100,
                    "daily_budget": daily_budget,
                    "daily_spend": daily_spend,
                    "severity": "medium",
                })

    def execute_auto_actions(self):
        """Execute Level 3 auto-actions."""
        print(f"  Executing {len(self.auto_actions)} auto-actions...")
        
        for action in self.auto_actions:
            try:
                if action["action"] == "update_budget":
                    result = self.reddit.update_budget(
                        action["campaign_id"],
                        action["new_budget"],
                        action.get("budget_type", "daily"),
                    )
                    if result.success:
                        print(f"    ✅ Updated budget for {action['campaign_name']}")
                    else:
                        print(f"    ❌ Failed budget update: {result.error}", file=sys.stderr)
            except Exception as e:
                print(f"    Action failed: {e}", file=sys.stderr)

    def send_report(self):
        """Send summary report to Telegram."""
        if not self.findings and not self.recommendations:
            print("  No findings or recommendations — skipping report")
            return
        
        severity_counts = defaultdict(int)
        for f in self.findings:
            severity_counts[f.get("severity", "low")] += 1
        
        lines = [
            f"📊 *Reddit Ops Report* ({self.days}d)",
            f"Findings: {len(self.findings)} ({severity_counts['high']} high, {severity_counts['medium']} med)",
            f"Recommendations: {len(self.recommendations)}",
            "",
        ]
        
        finding_types = defaultdict(list)
        for f in self.findings:
            finding_types[f["type"]].append(f)
        
        for ftype, items in finding_types.items():
            label = ftype.replace("_", " ").title()
            lines.append(f"• *{label}*: {len(items)} campaigns")
        
        if self.recommendations:
            lines.append("")
            lines.append("*Pending Approvals:*")
            for rec in self.recommendations[:5]:
                lines.append(f"• {rec['action']}: {rec['campaign_name'][:30]}")
        
        if self.dry_run:
            lines.append("")
            lines.append("_[DRY RUN — no changes made]_")
        
        send_telegram("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description="Reddit Ops Agent")
    parser.add_argument("--dry-run", action="store_true", help="Don't execute actions")
    parser.add_argument("--days", type=int, default=30, help="Lookback period in days")
    args = parser.parse_args()
    
    agent = RedditOpsAgent(dry_run=args.dry_run, days=args.days)
    agent.run()


if __name__ == "__main__":
    main()
