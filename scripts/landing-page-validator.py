#!/usr/bin/env python3
"""
Landing Page & UTM Validator - Focused on broken URLs, not missing UTMs
Scans only production campaigns (excludes test, internal, partner)
Level 2 — never auto-executes

Run: python scripts/landing-page-validator.py [--dry-run]
"""

import os
import sys
import json
import argparse
import re
import urllib.request
from urllib.parse import urlparse, parse_qs
from datetime import datetime
from typing import Dict, List, Any
import ssl

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'platforms'))

from agent_base import BaseAgent
from platforms import get_connector

ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

HTTP_TIMEOUT = 10

# Campagins to skip
SKIP_NAME_PATTERNS = [
    'test', 'internal', 'partner', 'partnership', 'brand da', 
    'clawdtalk', 'clawd', 'employee'
]
SKIP_IF_UTM_ISSUES_ONLY = True  # Only report broken URLs, not missing UTMs


class LandingPageValidator(BaseAgent):
    AGENT_SLUG = "landing-page-validator"
    AGENT_NAME = "🌐 Landing Page Validator"
    KNOWLEDGE_FILES = ["telnyx-strategy.md"]

    def __init__(self, dry_run=False):
        super().__init__(dry_run=dry_run)
        self.url_results = []
        self.seen_campaigns = set()  # Track checked campaigns to avoid duplicates

    def should_skip_campaign(self, name: str) -> bool:
        """Skip test, internal, partner campaigns."""
        name_lower = name.lower()
        for pattern in SKIP_NAME_PATTERNS:
            if pattern in name_lower:
                return True
        return False

    def analyze(self):
        """Check URLs across all platforms."""
        print("\n  [Google Ads] Checking production ad URLs...")
        try:
            self._check_google_ads()
        except Exception as e:
            print(f"    Error: {e}")
        print("  [StackAdapt] Checking creative URLs...")
        self._check_stackadapt()
        print("  [Reddit] Checking campaign URLs...")
        self._check_reddit()
        print(f"\n  Total broken URLs found: {len(self.url_results)}")

    def execute(self):
        """Record findings as recommendations (never auto-execute)."""
        for finding in self.url_results:
            self.record_recommendation(
                type="landing_page",
                target=finding.get('campaign_name', 'Unknown'),
                action=f"Fix broken URL: {finding['issues'][0][:50]}",
                rationale=finding.get('rationale', 'Landing page error detected'),
                severity='high',
                platform=finding.get('platform', ''),
                campaign_id=finding.get('campaign_id', ''),
                campaign_name=finding.get('campaign_name', ''),
            )

    def _check_url(self, url: str) -> Dict:
        """Check a URL for HTTP status — HEAD request first, fallback to GET."""
        result = {'url': url, 'status_code': None, 'issues': [], 'final_url': url}
        if not url or not url.startswith('http'):
            result['issues'].append('Invalid URL')
            return result

        # Try HEAD first
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (compatible; TelnyxBot/1.0)'},
                method='HEAD'
            )
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT, context=ssl_context) as resp:
                result['status_code'] = resp.getcode()
                result['final_url'] = resp.geturl()
                if resp.getcode() >= 400:
                    result['issues'].append(f'HTTP {resp.getcode()}')
                return result
        except urllib.error.HTTPError as e:
            # 405 = Method not allowed, try GET
            if e.code == 405:
                pass
            elif e.code >= 400:
                result['status_code'] = e.code
                result['issues'].append(f'HTTP {e.code}')
                return result
        except Exception:
            pass

        # Fallback to GET for sites that don't support HEAD
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (compatible; TelnyxBot/1.0)'}
            )
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT, context=ssl_context) as resp:
                result['status_code'] = resp.getcode()
                result['final_url'] = resp.geturl()
                if resp.getcode() >= 400:
                    result['issues'].append(f'HTTP {resp.getcode()}')
        except urllib.error.HTTPError as e:
            result['status_code'] = e.code
            result['issues'].append(f'HTTP {e.code}')
        except Exception as e:
            result['issues'].append(f'Error: {str(e)[:50]}')

        return result

    def _check_google_ads(self):
        """Check Google Ads ad URLs — max 1 per campaign to avoid spam."""
        try:
            conn = get_connector("google_ads")
            conn.load_credentials()

            client = conn._get_client()
            ga = client.get_service("GoogleAdsService")

            # Get only 1 active ad per campaign (avoid duplicates)
            query = """
                SELECT
                    campaign.id, campaign.name,
                    ad_group_ad.ad.final_urls
                FROM ad_group_ad
                WHERE campaign.status = 'ENABLED'
                AND ad_group_ad.status = 'ENABLED'
                ORDER BY campaign.id
                LIMIT 100
            """
            rows = ga.search(customer_id=conn._customer_id, query=query)

            campaigns_checked = 0
            for row in rows:
                camp_id = str(row.campaign.id)
                camp_name = row.campaign.name

                # Skip if already checked this campaign
                if camp_id in self.seen_campaigns:
                    continue
                self.seen_campaigns.add(camp_id)

                # Skip test/internal/partner campaigns
                if self.should_skip_campaign(camp_name):
                    continue

                urls = list(row.ad_group_ad.ad.final_urls)
                if not urls:
                    continue

                url = urls[0]
                result = self._check_url(url)

                # Only report actual HTTP errors (4xx, 5xx), not missing UTMs
                has_http_error = any('HTTP 4' in i or 'HTTP 5' in i or 'Error:' in i for i in result['issues'])

                if has_http_error:
                    self.url_results.append({
                        'platform': 'google_ads',
                        'campaign_id': camp_id,
                        'campaign_name': camp_name,
                        'url': url,
                        'issues': result['issues'],
                        'status_code': result['status_code'],
                        'rationale': f'Landing page returned HTTP {result["status_code"]}: {url[:60]}',
                    })

                campaigns_checked += 1
                if campaigns_checked >= 50:  # Max 50 campaigns
                    break

            print(f"    {campaigns_checked} campaigns checked, {len([r for r in self.url_results if r['platform']=='google_ads'])} broken URLs")

        except Exception as e:
            print(f"    Error: {e}")

    def _check_stackadapt(self):
        """Check StackAdapt creative URLs — max 1 per campaign."""
        try:
            conn = get_connector("stackadapt")
            if not conn._token:
                conn.load_credentials()

            # Get active campaigns first
            query = """
            query {
                campaigns(filter: { advertiserId: 93053, status: { eq: "active" } }, first: 50) {
                    nodes { id name }
                }
            }
            """
            data = conn._gql(query)
            campaigns = data.get('campaigns', {}).get('nodes', [])

            checked = 0
            for camp in campaigns:
                camp_id = str(camp.get('id', ''))
                camp_name = camp.get('name', 'Unknown')

                if camp_id in self.seen_campaigns:
                    continue
                self.seen_campaigns.add(f"sa_{camp_id}")

                if self.should_skip_campaign(camp_name):
                    continue

                # Get one creative for this campaign
                cquery = f"""
                query {{
                    nativeAds(filter: {{ advertiserId: 93053, campaignId: {camp_id} }}, first: 1) {{
                        nodes {{ id name landingPageUrl }}
                    }}
                }}
                """
                try:
                    cdata = conn._gql(cquery)
                    creatives = cdata.get('nativeAds', {}).get('nodes', [])
                    if not creatives:
                        continue

                    creative = creatives[0]
                    url = creative.get('landingPageUrl', '')
                    if not url:
                        continue

                    result = self._check_url(url)
                    has_http_error = any('HTTP 4' in i or 'HTTP 5' in i or 'Error:' in i for i in result['issues'])

                    if has_http_error:
                        self.url_results.append({
                            'platform': 'stackadapt',
                            'campaign_id': camp_id,
                            'campaign_name': camp_name,
                            'url': url,
                            'issues': result['issues'],
                            'status_code': result['status_code'],
                            'rationale': f'StackAdapt creative returned HTTP {result["status_code"]}',
                        })

                    checked += 1
                except Exception:
                    pass

            print(f"    {checked} campaigns checked, {len([r for r in self.url_results if r['platform']=='stackadapt'])} broken URLs")

        except Exception as e:
            print(f"    Error: {e}")

    def _check_reddit(self):
        """Check Reddit campaign URLs — max 1 per campaign."""
        try:
            conn = get_connector("reddit")
            campaigns = conn.fetch_campaigns(active_only=True)

            checked = 0
            for camp in campaigns:
                camp_id = str(camp.external_id)
                camp_name = camp.name

                if f"reddit_{camp_id}" in self.seen_campaigns:
                    continue
                self.seen_campaigns.add(f"reddit_{camp_id}")

                if self.should_skip_campaign(camp_name):
                    continue

                url = getattr(camp, 'final_url', '') or getattr(camp, 'click_url', '')
                if not url:
                    continue

                result = self._check_url(url)
                has_http_error = any('HTTP 4' in i or 'HTTP 5' in i or 'Error:' in i for i in result['issues'])

                if has_http_error:
                    self.url_results.append({
                        'platform': 'reddit',
                        'campaign_id': camp_id,
                        'campaign_name': camp_name,
                        'url': url,
                        'issues': result['issues'],
                        'status_code': result['status_code'],
                        'rationale': f'Reddit campaign URL returned HTTP {result["status_code"]}',
                    })

                checked += 1
                if checked >= 25:  # Max 25 Reddit campaigns
                    break

            print(f"    {checked} campaigns checked, {len([r for r in self.url_results if r['platform']=='reddit'])} broken URLs")

        except Exception as e:
            print(f"    Error: {e}")

    def send_telegram_summary(self):
        """Custom Telegram summary with focus on broken URLs."""
        now = datetime.now()
        lines = [f"<b>{self.AGENT_NAME}</b> — {now.strftime('%b %-d')}"]
        if self.dry_run:
            lines.append("<i>🧪 DRY RUN</i>")

        total = len(self.url_results)
        lines.append(f"\n🔗 <b>Broken Landing Pages: {total}</b>")
        lines.append("   (production campaigns only, excludes test/partner)")

        if total:
            for r in self.url_results[:10]:
                status = r.get('status_code', 'ERR')
                lines.append(f"\n  🔴 <b>[{r['platform'].upper()}] HTTP {status}</b>")
                lines.append(f"     {r['campaign_name'][:40]}")
                lines.append(f"     {r['url'][:70]}")
        else:
            lines.append("\n✨ All landing pages OK!")

        if self.recommendations:
            lines.append(f"\n⏳ <b>{len(self.recommendations)} need URL fix</b>")

        self._send_telegram("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description='Landing Page Validator')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    agent = LandingPageValidator(dry_run=args.dry_run)
    print(f"🌐 Landing Page Validator — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    if args.dry_run:
        print("   ⚠️  DRY RUN")
    agent.run()


if __name__ == '__main__':
    main()
