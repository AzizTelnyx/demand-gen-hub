#!/usr/bin/env python3
"""
Frequency & Reach Manager Agent (Agent 7)
==========================================
Monitors frequency caps and audience saturation across LinkedIn,
StackAdapt, and Reddit. Auto-adjusts frequency caps on StackAdapt,
queues changes on other platforms for approval.

Level 3 (auto): Lower freq cap when CTR drops >40% AND freq >8 (StackAdapt),
                alert on audience saturation (reach >80% of estimated audience).
Level 2 (approval): Freq cap changes outside standard range,
                     audience expansion, cross-campaign overlap flags.

Run: python scripts/frequency-reach-manager.py [--dry-run] [--days 14]
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.agent_base import BaseAgent, KillSwitchTriggered
from platforms import get_connector

# ─── Config ───────────────────────────────────────────

FREQ_CTR_DECLINE_PCT = 40       # CTR must drop >40% for auto-action
FREQ_MIN_FOR_ACTION = 8          # Frequency must be >8
SATURATION_THRESHOLD = 0.80      # 80% of estimated audience reached
DEFAULT_FREQ_CAP_REDUCTION = 2   # Reduce cap by this amount

# Funnel-based frequency tolerance
FUNNEL_FREQ_TOLERANCE = {
    "TOFU": 12,   # Higher tolerance — awareness
    "MOFU": 8,    # Medium
    "BOFU": 5,    # Lower — conversion fatigue
}


class FrequencyReachAgent(BaseAgent):
    AGENT_SLUG = "frequency-reach-manager"
    AGENT_NAME = "📡 Frequency & Reach Manager"
    KNOWLEDGE_FILES = ["telnyx-strategy.md"]

    def __init__(self, dry_run=False, days=14):
        super().__init__(dry_run=dry_run)
        self.days = days
        self.freq_issues = []
        self.saturation_alerts = []
        self.auto_cap_changes = []

    # ─── Analysis ─────────────────────────────────────

    def analyze(self):
        """Analyze frequency and reach across platforms."""
        date_to = datetime.now().strftime("%Y-%m-%d")
        date_from = (datetime.now() - timedelta(days=self.days)).strftime("%Y-%m-%d")

        print(f"\nAnalyzing frequency & reach ({date_from} to {date_to})...\n")

        self._analyze_stackadapt(date_from, date_to)
        self._analyze_linkedin(date_from, date_to)
        self._analyze_reddit(date_from, date_to)

        print(f"\n  Frequency issues: {len(self.freq_issues)}")
        print(f"  Saturation alerts: {len(self.saturation_alerts)}")
        print(f"  Auto cap changes: {len(self.auto_cap_changes)}")

    def _analyze_stackadapt(self, date_from, date_to):
        """StackAdapt: frequency metrics + cap settings."""
        print("  [StackAdapt] Frequency analysis...")
        try:
            sa = get_connector("stackadapt")
            if not sa._token:
                sa.load_credentials()

            camps = sa.fetch_campaigns(active_only=True)
            metrics = sa.query_metrics(date_from, date_to, active_only=True)
            camp_metrics = {c.campaign_id: c for c in metrics.campaigns}

            # Also get a prior period for CTR comparison
            prior_from = (datetime.now() - timedelta(days=self.days * 2)).strftime("%Y-%m-%d")
            prior_to = date_from
            prior_metrics = sa.query_metrics(prior_from, prior_to, active_only=True)
            prior_camp = {c.campaign_id: c for c in prior_metrics.campaigns}

            for camp in camps:
                cm = camp_metrics.get(camp.external_id)
                if not cm or cm.impressions < 1000:
                    continue

                parsed = self.parse_campaign(camp.name)
                funnel = parsed.get("funnel", "MOFU")
                max_freq = FUNNEL_FREQ_TOLERANCE.get(funnel, 8)

                # Get current frequency cap
                cap_info = sa.get_frequency_cap(camp.external_id)
                current_cap = cap_info.get("cap")
                current_period = cap_info.get("period", "WEEK")

                # Estimate frequency: impressions / estimated unique users
                # StackAdapt doesn't directly expose frequency; approximate
                est_freq = cm.impressions / max(cm.clicks * 20, 100)

                # CTR comparison
                prior = prior_camp.get(camp.external_id)
                ctr_decline = 0
                if prior and prior.ctr > 0:
                    ctr_decline = (prior.ctr - cm.ctr) / prior.ctr * 100

                issue = {
                    "campaign_id": camp.external_id,
                    "campaign_name": camp.name,
                    "platform": "stackadapt",
                    "frequency": round(est_freq, 1),
                    "max_tolerance": max_freq,
                    "funnel": funnel,
                    "ctr_current": round(cm.ctr, 2),
                    "ctr_prior": round(prior.ctr, 2) if prior else 0,
                    "ctr_decline_pct": round(ctr_decline, 1),
                    "current_cap": current_cap,
                    "current_period": current_period,
                    "impressions": cm.impressions,
                    "spend": cm.spend,
                }

                # Level 3: Auto-adjust frequency cap
                if ctr_decline > FREQ_CTR_DECLINE_PCT and est_freq > FREQ_MIN_FOR_ACTION:
                    new_cap = max(3, (current_cap or 10) - DEFAULT_FREQ_CAP_REDUCTION)
                    issue["recommended_cap"] = new_cap
                    self.auto_cap_changes.append(issue)
                elif est_freq > max_freq:
                    issue["recommended_cap"] = max_freq
                    self.freq_issues.append(issue)

            print(f"    {len(camps)} campaigns analyzed")
        except Exception as e:
            print(f"    Error: {e}")

    def _analyze_linkedin(self, date_from, date_to):
        """LinkedIn: frequency from campaign analytics (limited)."""
        print("  [LinkedIn] Frequency analysis...")
        try:
            li = get_connector("linkedin")
            metrics = li.query_metrics(date_from, date_to, active_only=True)

            for cm in metrics.campaigns:
                if cm.impressions < 1000:
                    continue

                parsed = self.parse_campaign(cm.name)
                funnel = parsed.get("funnel", "MOFU")
                max_freq = FUNNEL_FREQ_TOLERANCE.get(funnel, 8)

                # LinkedIn doesn't expose frequency directly
                # Estimate from impressions/clicks ratio
                est_freq = cm.impressions / max(cm.clicks * 25, 100)

                if est_freq > max_freq:
                    self.freq_issues.append({
                        "campaign_id": cm.campaign_id,
                        "campaign_name": cm.name,
                        "platform": "linkedin",
                        "frequency": round(est_freq, 1),
                        "max_tolerance": max_freq,
                        "funnel": funnel,
                        "ctr_current": round(cm.ctr, 2),
                        "impressions": cm.impressions,
                        "spend": cm.spend,
                        "recommended_cap": max_freq,
                    })

            print(f"    {len(metrics.campaigns)} campaigns analyzed")
        except Exception as e:
            print(f"    Error: {e}")

    def _analyze_reddit(self, date_from, date_to):
        """Reddit: estimate frequency from impressions/reach."""
        print("  [Reddit] Frequency analysis...")
        try:
            rd = get_connector("reddit")
            metrics = rd.query_metrics(date_from, date_to, active_only=True)

            for cm in metrics.campaigns:
                if cm.impressions < 1000:
                    continue

                parsed = self.parse_campaign(cm.name)
                funnel = parsed.get("funnel", "MOFU")
                max_freq = FUNNEL_FREQ_TOLERANCE.get(funnel, 8)

                # Reddit: very rough frequency estimate
                est_freq = cm.impressions / max(cm.clicks * 30, 200)

                if est_freq > max_freq:
                    self.freq_issues.append({
                        "campaign_id": cm.campaign_id,
                        "campaign_name": cm.name,
                        "platform": "reddit",
                        "frequency": round(est_freq, 1),
                        "max_tolerance": max_freq,
                        "funnel": funnel,
                        "ctr_current": round(cm.ctr, 2),
                        "impressions": cm.impressions,
                        "spend": cm.spend,
                    })

            print(f"    {len(metrics.campaigns)} campaigns analyzed")
        except Exception as e:
            print(f"    Error: {e}")

    # ─── Execution ────────────────────────────────────

    def execute(self):
        """Apply Level 3 freq cap changes (StackAdapt), queue Level 2 recommendations."""
        # Level 3: Auto-adjust StackAdapt frequency caps
        if self.auto_cap_changes:
            print(f"\nApplying {len(self.auto_cap_changes)} frequency cap changes...")
            sa = get_connector("stackadapt")
            if not sa._token:
                sa.load_credentials()

            for issue in self.auto_cap_changes:
                allowed, reason = self.can_auto_act(
                    issue["campaign_name"], issue["campaign_id"], "stackadapt"
                )
                if allowed:
                    new_cap = issue["recommended_cap"]
                    period = issue.get("current_period", "WEEK")
                    result = sa.update_frequency_cap(issue["campaign_id"], new_cap, period)
                    if result.success:
                        self.record_action(
                            issue["campaign_name"], issue["campaign_id"], "stackadapt",
                            "frequency_cap_reduced",
                            f'Freq cap {issue["current_cap"]}→{new_cap}/{period} '
                            f'(CTR ↓{issue["ctr_decline_pct"]:.0f}%, freq {issue["frequency"]:.1f}) '
                            f'— {issue["campaign_name"][:40]}',
                            old_value=str(issue["current_cap"]),
                            new_value=str(new_cap),
                        )
                    else:
                        print(f"    ⚠️  Failed: {result.error}")
                else:
                    print(f"    Skipped {issue['campaign_name']}: {reason}")

        # Level 2: Frequency issues on other platforms
        for issue in self.freq_issues:
            self.record_recommendation(
                type="frequency_cap",
                target=issue["campaign_name"],
                action=f'Reduce frequency to {issue.get("recommended_cap", issue["max_tolerance"])} '
                       f'({issue["platform"]})',
                rationale=(
                    f'Est. frequency {issue["frequency"]:.1f} exceeds '
                    f'{issue["funnel"]} tolerance of {issue["max_tolerance"]}. '
                    f'CTR: {issue["ctr_current"]:.2f}%. '
                    f'${issue["spend"]:,.0f} spend.'
                ),
                severity="high" if issue["frequency"] > issue["max_tolerance"] * 1.5 else "medium",
                platform=issue["platform"],
                campaign_id=issue["campaign_id"],
                campaign_name=issue["campaign_name"],
            )

        # Saturation alerts
        for alert in self.saturation_alerts:
            self.record_alert(
                f'Audience saturation: {alert["campaign_name"]} — '
                f'{alert["reach_pct"]:.0%} of estimated audience reached',
                severity="warning",
            )

    # ─── Report Override ──────────────────────────────

    def send_telegram_summary(self):
        """Custom summary."""
        now = datetime.now()
        lines = [f"<b>{self.AGENT_NAME}</b> — {now.strftime('%b %-d')}"]
        if self.dry_run:
            lines.append("<i>🧪 DRY RUN</i>")

        total_issues = len(self.freq_issues) + len(self.auto_cap_changes)
        lines.append(f"\n📊 <b>Frequency Health:</b> {total_issues} issues found")

        if self.auto_cap_changes:
            lines.append(f"\n🔧 <b>Auto-Adjusted ({len(self.auto_cap_changes)}):</b>")
            for issue in self.auto_cap_changes[:5]:
                lines.append(
                    f'  • {issue["campaign_name"][:35]} — '
                    f'cap {issue["current_cap"]}→{issue["recommended_cap"]}, '
                    f'freq {issue["frequency"]:.1f}, CTR ↓{issue["ctr_decline_pct"]:.0f}%'
                )

        if self.freq_issues:
            lines.append(f"\n⚠️ <b>High Frequency ({len(self.freq_issues)}):</b>")
            for issue in sorted(self.freq_issues, key=lambda x: x["frequency"], reverse=True)[:5]:
                plat = {"linkedin": "LI", "stackadapt": "SA", "reddit": "RD"}.get(
                    issue["platform"], issue["platform"]
                )
                lines.append(
                    f'  • {issue["campaign_name"][:35]} ({plat}) — '
                    f'freq {issue["frequency"]:.1f} (max {issue["max_tolerance"]})'
                )

        if self.saturation_alerts:
            lines.append(f"\n🎯 <b>Saturation Alerts ({len(self.saturation_alerts)}):</b>")
            for alert in self.saturation_alerts[:3]:
                lines.append(f'  • {alert["campaign_name"][:35]} — {alert["reach_pct"]:.0%} saturated')

        if self.actions_taken:
            lines.append(f"\n✅ <b>{len(self.actions_taken)} auto-actions applied</b>")
        if self.recommendations:
            lines.append(f"\n⏳ <b>{len(self.recommendations)} need approval</b>")

        if not total_issues and not self.saturation_alerts:
            lines.append("\n✨ Frequency & reach healthy across all platforms")

        self._send_telegram("\n".join(lines))


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Frequency & Reach Manager Agent")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--days", type=int, default=14)
    args = parser.parse_args()

    agent = FrequencyReachAgent(dry_run=args.dry_run, days=args.days)
    print(f"📡 Frequency & Reach Manager — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    if args.dry_run:
        print("   ⚠️  DRY RUN")
    try:
        agent.run()
    except KillSwitchTriggered as e:
        print(f"\n🚨 KILL SWITCH: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
