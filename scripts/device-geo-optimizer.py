#!/usr/bin/env python3
"""
Device & Geo Optimizer Agent (Agent 6)
======================================
Optimizes device bid adjustments and flags wasteful geo/community targeting
across all 4 platforms.

Level 3 (auto): Google device bid adjustments ±15% based on 30d CPA,
                flag geos >$300/0 conv, flag Reddit communities >$200/0 conv.
Level 2 (approval): Geo exclusions, community removals, device exclusions,
                     regional budget shifts.

Run: python scripts/device-geo-optimizer.py [--dry-run] [--days 30]
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.agent_base import BaseAgent, KillSwitchTriggered
from platforms import get_connector

# ─── Config ───────────────────────────────────────────

DEVICE_BID_MAX_ADJUST = 0.15     # ±15% max
DEVICE_MIN_CLICKS = 100          # Min clicks per device to act
GEO_SPEND_NO_CONV = 300.0        # $300 spend, 0 conversions → flag
REDDIT_COMMUNITY_SPEND_NO_CONV = 200.0

# Region → expected countries mapping
REGION_COUNTRIES = {
    "AMER": {"US", "CA", "BR", "MX", "AR", "CO", "CL"},
    "EMEA": {"GB", "DE", "FR", "NL", "ES", "IT", "SE", "NO", "DK", "FI", "IE", "BE", "AT", "CH", "PL", "PT"},
    "APAC": {"AU", "NZ", "SG", "JP", "IN", "KR", "TH", "MY", "PH", "ID"},
    "MENA": {"AE", "SA", "EG", "QA", "KW", "BH", "OM"},
}

# Google Ads country criterion IDs → ISO codes (common ones)
GEO_CRITERION_MAP = {
    "2840": "US", "2124": "CA", "2826": "GB", "2276": "DE", "2250": "FR",
    "2528": "NL", "2724": "ES", "2380": "IT", "2752": "SE", "2036": "AU",
    "2554": "NZ", "2702": "SG", "2392": "JP", "2356": "IN", "2784": "AE",
    "2682": "SA", "2076": "BR", "2484": "MX",
}


class DeviceGeoOptimizerAgent(BaseAgent):
    AGENT_SLUG = "device-geo-optimizer"
    AGENT_NAME = "📍 Device & Geo Optimizer"
    KNOWLEDGE_FILES = ["telnyx-strategy.md"]

    def __init__(self, dry_run=False, days=30):
        super().__init__(dry_run=dry_run)
        self.days = days
        self.device_adjustments = []
        self.geo_flags = []
        self.community_flags = []
        self.region_mismatches = []

    # ─── Analysis ─────────────────────────────────────

    def analyze(self):
        """Analyze device + geo performance across all platforms."""
        date_to = datetime.now().strftime("%Y-%m-%d")
        date_from = (datetime.now() - timedelta(days=self.days)).strftime("%Y-%m-%d")

        print(f"\nAnalyzing device & geo performance ({date_from} to {date_to})...\n")

        self._analyze_google_devices(date_from, date_to)
        self._analyze_google_geos(date_from, date_to)
        self._analyze_stackadapt_geos(date_from, date_to)
        self._analyze_linkedin_geos(date_from, date_to)
        self._analyze_reddit(date_from, date_to)

        print(f"\n  Device adjustments: {len(self.device_adjustments)}")
        print(f"  Geo flags: {len(self.geo_flags)}")
        print(f"  Community flags: {len(self.community_flags)}")
        print(f"  Region mismatches: {len(self.region_mismatches)}")

    def _analyze_google_devices(self, date_from, date_to):
        """Google Ads device bid analysis."""
        print("  [Google Ads] Device analysis...")
        try:
            g = get_connector("google_ads")
            device_data = g.get_device_metrics(date_from, date_to, active_only=True)

            # Group by campaign + device
            by_camp_device = defaultdict(lambda: {
                "spend": 0, "clicks": 0, "conversions": 0, "campaign_name": ""
            })
            for d in device_data:
                key = (d["campaign_id"], d["device"])
                by_camp_device[key]["spend"] += d["spend"]
                by_camp_device[key]["clicks"] += d["clicks"]
                by_camp_device[key]["conversions"] += d["conversions"]
                by_camp_device[key]["campaign_name"] = d["campaign_name"]

            # Group by campaign to get overall CPA
            camp_totals = defaultdict(lambda: {"spend": 0, "clicks": 0, "conversions": 0})
            for (cid, dev), data in by_camp_device.items():
                camp_totals[cid]["spend"] += data["spend"]
                camp_totals[cid]["clicks"] += data["clicks"]
                camp_totals[cid]["conversions"] += data["conversions"]

            for (cid, device), data in by_camp_device.items():
                if data["clicks"] < DEVICE_MIN_CLICKS:
                    continue

                camp = camp_totals[cid]
                if camp["conversions"] <= 0:
                    continue

                camp_cpa = camp["spend"] / camp["conversions"]
                dev_cpa = data["spend"] / data["conversions"] if data["conversions"] > 0 else camp_cpa * 3

                # Calculate recommended bid adjustment
                if data["conversions"] > 0:
                    cpa_ratio = dev_cpa / camp_cpa
                    if cpa_ratio > 1.2:
                        # Device CPA is 20%+ worse → reduce bid
                        adjust = max(-DEVICE_BID_MAX_ADJUST, -(cpa_ratio - 1) * 0.5)
                    elif cpa_ratio < 0.8:
                        # Device CPA is 20%+ better → increase bid
                        adjust = min(DEVICE_BID_MAX_ADJUST, (1 - cpa_ratio) * 0.5)
                    else:
                        continue  # Within acceptable range
                else:
                    # Zero conversions on this device, significant spend
                    if data["spend"] > camp_cpa * 2:
                        adjust = -DEVICE_BID_MAX_ADJUST
                    else:
                        continue

                self.device_adjustments.append({
                    "campaign_id": cid,
                    "campaign_name": data["campaign_name"],
                    "device": device,
                    "current_cpa": round(dev_cpa, 2),
                    "campaign_cpa": round(camp_cpa, 2),
                    "adjustment": round(adjust, 3),
                    "spend": data["spend"],
                    "clicks": data["clicks"],
                    "conversions": data["conversions"],
                })

            print(f"    {len(self.device_adjustments)} device bid adjustments identified")
        except Exception as e:
            print(f"    Error: {e}")

    def _analyze_google_geos(self, date_from, date_to):
        """Google Ads geographic analysis."""
        print("  [Google Ads] Geo analysis...")
        try:
            g = get_connector("google_ads")
            geo_data = g.get_geo_metrics(date_from, date_to, active_only=True)

            # Group by campaign + country
            by_camp_geo = defaultdict(lambda: {
                "spend": 0, "clicks": 0, "conversions": 0, "campaign_name": ""
            })
            for d in geo_data:
                country = GEO_CRITERION_MAP.get(d["country_id"], d["country_id"])
                key = (d["campaign_id"], country)
                by_camp_geo[key]["spend"] += d["spend"]
                by_camp_geo[key]["clicks"] += d["clicks"]
                by_camp_geo[key]["conversions"] += d["conversions"]
                by_camp_geo[key]["campaign_name"] = d["campaign_name"]

            for (cid, country), data in by_camp_geo.items():
                if data["spend"] > GEO_SPEND_NO_CONV and data["conversions"] == 0:
                    self.geo_flags.append({
                        "campaign_id": cid,
                        "campaign_name": data["campaign_name"],
                        "country": country,
                        "platform": "google_ads",
                        "spend": data["spend"],
                        "clicks": data["clicks"],
                        "conversions": 0,
                    })

                # Check region mismatch
                parsed = self.parse_campaign(data["campaign_name"])
                if parsed["region"] and parsed["region"] in REGION_COUNTRIES:
                    expected = REGION_COUNTRIES[parsed["region"]]
                    if country not in expected and data["spend"] > 100:
                        self.region_mismatches.append({
                            "campaign_id": cid,
                            "campaign_name": data["campaign_name"],
                            "expected_region": parsed["region"],
                            "actual_country": country,
                            "platform": "google_ads",
                            "spend": data["spend"],
                        })

            print(f"    {len(self.geo_flags)} geo flags (Google), {len(self.region_mismatches)} region mismatches")
        except Exception as e:
            print(f"    Error: {e}")

    def _analyze_stackadapt_geos(self, date_from, date_to):
        """StackAdapt geographic analysis."""
        print("  [StackAdapt] Geo analysis...")
        try:
            sa = get_connector("stackadapt")
            if not sa._token:
                sa.load_credentials()

            camps = sa.fetch_campaigns(active_only=True)
            for camp in camps:
                geo_data = sa.get_geo_report(camp.external_id, date_from, date_to)
                for g in geo_data:
                    if g["spend"] > GEO_SPEND_NO_CONV and g["conversions"] == 0:
                        self.geo_flags.append({
                            "campaign_id": camp.external_id,
                            "campaign_name": camp.name,
                            "country": g["country"],
                            "platform": "stackadapt",
                            "spend": g["spend"],
                            "clicks": g["clicks"],
                            "conversions": 0,
                        })

            print(f"    Done")
        except Exception as e:
            print(f"    Error: {e}")

    def _analyze_linkedin_geos(self, date_from, date_to):
        """LinkedIn geographic analysis (limited — campaign-level only)."""
        print("  [LinkedIn] Geo analysis (campaign-level)...")
        # LinkedIn doesn't expose geo breakdowns easily via REST API
        # Flag campaigns with 0 conversions and high spend as geo candidates
        try:
            li = get_connector("linkedin")
            metrics = li.query_metrics(date_from, date_to, active_only=True)
            for c in metrics.campaigns:
                if c.spend > GEO_SPEND_NO_CONV and c.conversions == 0:
                    # Note: LinkedIn 0 conversions is expected for ABM — don't flag
                    pass
            print(f"    Skipped (ABM platform — 0 conversions expected)")
        except Exception as e:
            print(f"    Error: {e}")

    def _analyze_reddit(self, date_from, date_to):
        """Reddit geo + community analysis."""
        print("  [Reddit] Geo & community analysis...")
        try:
            rd = get_connector("reddit")
            if not rd._access_token:
                rd.load_credentials()

            # Campaign-level metrics for geo flags
            metrics = rd.query_metrics(date_from, date_to, active_only=True)
            for c in metrics.campaigns:
                if c.spend > GEO_SPEND_NO_CONV and c.conversions == 0:
                    self.geo_flags.append({
                        "campaign_id": c.campaign_id,
                        "campaign_name": c.name,
                        "country": "ALL",
                        "platform": "reddit",
                        "spend": c.spend,
                        "clicks": c.clicks,
                        "conversions": 0,
                    })

            # Community analysis via ad groups
            camps = rd.fetch_campaigns(active_only=True)
            for camp in camps:
                targeting = camp.extra.get("targeting", {})
                communities = targeting.get("communities", [])
                if not communities:
                    continue
                # Per-community spend isn't directly available; flag campaign-level
                camp_metrics = next((c for c in metrics.campaigns if c.campaign_id == camp.external_id), None)
                if camp_metrics and camp_metrics.spend > REDDIT_COMMUNITY_SPEND_NO_CONV and camp_metrics.conversions == 0:
                    self.community_flags.append({
                        "campaign_id": camp.external_id,
                        "campaign_name": camp.name,
                        "communities": communities[:10],
                        "spend": camp_metrics.spend,
                        "conversions": 0,
                    })

            print(f"    {len(self.community_flags)} community flags")
        except Exception as e:
            print(f"    Error: {e}")

    # ─── Execution ────────────────────────────────────

    def execute(self):
        """Apply Level 3 device bid adjustments, queue Level 2 geo recommendations."""
        # Level 3: Auto device bid adjustments (Google only)
        print(f"\nApplying {len(self.device_adjustments)} device bid adjustments...")
        g = get_connector("google_ads")

        for adj in self.device_adjustments:
            allowed, reason = self.can_auto_act(
                adj["campaign_name"], adj["campaign_id"], "google_ads"
            )
            if allowed:
                result = g.update_device_bid(
                    adj["campaign_id"], adj["device"], adj["adjustment"]
                )
                if result.success:
                    direction = "↑" if adj["adjustment"] > 0 else "↓"
                    self.record_action(
                        adj["campaign_name"], adj["campaign_id"], "google_ads",
                        "device_bid_adjustment",
                        f'{adj["device"]} bid {direction}{abs(adj["adjustment"]):.0%} '
                        f'(CPA ${adj["current_cpa"]:.0f} vs camp ${adj["campaign_cpa"]:.0f}) '
                        f'— {adj["campaign_name"][:40]}',
                        old_value="0%",
                        new_value=f'{adj["adjustment"]:+.1%}',
                    )
                else:
                    print(f"    ⚠️  Failed: {result.error}")
            else:
                print(f"    Skipped {adj['campaign_name']} {adj['device']}: {reason}")

        # Level 2: Geo exclusion recommendations
        for geo in self.geo_flags:
            self.record_recommendation(
                type="geo_exclusion",
                target=f'{geo["country"]} in {geo["campaign_name"]}',
                action=f'Exclude {geo["country"]} from "{geo["campaign_name"]}"',
                rationale=f'${geo["spend"]:.0f} spent, 0 conversions on {geo["platform"]}',
                severity="high" if geo["spend"] > 500 else "medium",
                platform=geo["platform"],
                campaign_id=geo["campaign_id"],
                campaign_name=geo["campaign_name"],
            )

        # Level 2: Community removal recommendations
        for comm in self.community_flags:
            self.record_recommendation(
                type="community_removal",
                target=f'Communities in {comm["campaign_name"]}',
                action=f'Review communities: {", ".join(comm["communities"][:3])}',
                rationale=f'${comm["spend"]:.0f} spent, 0 conversions. Communities: {", ".join(comm["communities"][:5])}',
                severity="medium",
                platform="reddit",
                campaign_id=comm["campaign_id"],
                campaign_name=comm["campaign_name"],
            )

        # Level 2: Region mismatch alerts
        for rm in self.region_mismatches:
            self.record_alert(
                f'{rm["campaign_name"]}: ${rm["spend"]:.0f} in {rm["actual_country"]} '
                f'(expected {rm["expected_region"]})',
                severity="warning",
            )

    # ─── Report Override ──────────────────────────────

    def send_telegram_summary(self):
        """Custom summary."""
        now = datetime.now()
        lines = [f"<b>{self.AGENT_NAME}</b> — {now.strftime('%b %-d')}"]
        if self.dry_run:
            lines.append("<i>🧪 DRY RUN</i>")

        if self.device_adjustments:
            lines.append(f"\n📱 <b>Device Bid Adjustments ({len(self.device_adjustments)}):</b>")
            for adj in sorted(self.device_adjustments, key=lambda x: abs(x["adjustment"]), reverse=True)[:5]:
                direction = "↑" if adj["adjustment"] > 0 else "↓"
                lines.append(
                    f'  • {adj["device"]} {direction}{abs(adj["adjustment"]):.0%} '
                    f'— {adj["campaign_name"][:35]} (CPA ${adj["current_cpa"]:.0f})'
                )

        if self.geo_flags:
            total_waste = sum(g["spend"] for g in self.geo_flags)
            lines.append(f"\n🌍 <b>Wasteful Geos ({len(self.geo_flags)}):</b> ${total_waste:,.0f} total")
            for geo in sorted(self.geo_flags, key=lambda x: x["spend"], reverse=True)[:5]:
                lines.append(
                    f'  • {geo["country"]} in {geo["campaign_name"][:30]} — ${geo["spend"]:.0f}'
                )

        if self.community_flags:
            lines.append(f"\n💬 <b>Reddit Communities ({len(self.community_flags)}):</b>")
            for comm in self.community_flags[:3]:
                lines.append(f'  • {comm["campaign_name"][:35]} — ${comm["spend"]:.0f}')

        if self.region_mismatches:
            lines.append(f"\n⚠️ <b>Region Mismatches ({len(self.region_mismatches)}):</b>")
            for rm in self.region_mismatches[:3]:
                lines.append(
                    f'  • {rm["campaign_name"][:30]}: ${rm["spend"]:.0f} in {rm["actual_country"]} '
                    f'(expected {rm["expected_region"]})'
                )

        if self.actions_taken:
            lines.append(f"\n✅ <b>{len(self.actions_taken)} auto-actions applied</b>")
        if self.recommendations:
            lines.append(f"\n⏳ <b>{len(self.recommendations)} need approval</b>")

        if not any([self.device_adjustments, self.geo_flags, self.community_flags, self.region_mismatches]):
            lines.append("\n✨ All devices & geos healthy")

        self._send_telegram("\n".join(lines))


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Device & Geo Optimizer Agent")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--days", type=int, default=30)
    args = parser.parse_args()

    agent = DeviceGeoOptimizerAgent(dry_run=args.dry_run, days=args.days)
    print(f"📍 Device & Geo Optimizer — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    if args.dry_run:
        print("   ⚠️  DRY RUN")
    try:
        agent.run()
    except KillSwitchTriggered as e:
        print(f"\n🚨 KILL SWITCH: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
