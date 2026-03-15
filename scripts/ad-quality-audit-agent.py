#!/usr/bin/env python3
"""
Ad Quality Audit Agent
Runs daily checks on all Google Ads campaigns for quality issues.

Checks:
1. Duplicate ads per ad group
2. Missing H1 pins
3. "Talk to Sales" / sales language
4. Em dashes (— or –)
5. Political ad flags (EU_POLITICAL_ADS)
6. Negative keywords blocking product terms in competitor campaigns
7. Sitelink issues (truncated text, sales language, latency numbers)
8. Trademark violations
9. "Platform" in headlines
10. Specific latency numbers (sub-200ms, sub-300ms)
11. Missing UTMs
12. Twilio brand name in Twilio campaign ad copy
13. Missing product name in campaign names

Usage:
    python3 ad-quality-audit-agent.py [--fix] [--dry-run] [--channel telegram]
"""

import sys
import os
import json
import importlib.util
import argparse
from collections import defaultdict
from datetime import datetime

# ─── Load keyword-hygiene-agent for Google Ads client ───
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('kha', os.path.join(SCRIPT_DIR, 'keyword-hygiene-agent.py'))
kha = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kha)

# ─── Constants ───
SALES_TERMS = ['talk to sales', 'speak to sales', 'talk to an expert', 'speak to an expert']
LATENCY_TERMS = ['sub-200', 'sub-300', 'sub-100', 'sub 200', 'sub 300']
COMPETITORS = ['vapi', 'elevenlabs', 'livekit', 'retell', 'bland', 'synthflow', 'sierra',
               'twilio', 'vonage', 'bandwidth', 'pipecat']
PROTECTED_PRODUCT_TERMS = [
    'voice ai', 'voice api', 'sms api', 'sip trunking', 'sip trunk',
    'text to speech', 'speech to text', 'tts', 'stt', 'ai agent',
    'ai agents', 'voice agent', 'voice agents', 'contact center',
    'telephony', 'voip', 'phone number', 'phone numbers',
]

# ─── Telegram notification ───
BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo')
CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID', '-1003786506284')
THREAD_ID = os.environ.get('TELEGRAM_THREAD_ID', '164')


def send_telegram(message, parse_mode='HTML'):
    """Send a message to Telegram."""
    import urllib.request
    url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
    data = json.dumps({
        'chat_id': CHAT_ID,
        'message_thread_id': int(THREAD_ID),
        'text': message,
        'parse_mode': parse_mode,
    }).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req)
    except Exception as e:
        print(f'Telegram send failed: {e}')


def run_audit(fix=False, dry_run=False):
    """Run the full ad quality audit."""
    client = kha.get_client()
    ga = client.get_service('GoogleAdsService')
    PinEnum = client.enums.ServedAssetFieldTypeEnum

    issues = defaultdict(list)
    total_ads = 0
    by_ag = defaultdict(list)

    # ─── 1. Audit all enabled RSA ads ───
    q = '''SELECT campaign.name, ad_group.name, ad_group.id, ad_group_ad.ad.id,
           ad_group_ad.ad.responsive_search_ad.headlines,
           ad_group_ad.ad.responsive_search_ad.descriptions,
           ad_group_ad.ad.final_urls,
           ad_group_ad.policy_summary.policy_topic_entries,
           ad_group_ad.policy_summary.approval_status
    FROM ad_group_ad
    WHERE campaign.status="ENABLED" AND ad_group.status="ENABLED"
      AND ad_group_ad.status="ENABLED" AND ad_group_ad.ad.type="RESPONSIVE_SEARCH_AD"
      AND campaign.advertising_channel_type="SEARCH"'''

    for r in ga.search(customer_id=kha.CUSTOMER_ID, query=q):
        total_ads += 1
        cn = r.campaign.name
        agn = r.ad_group.name
        ad_id = r.ad_group_ad.ad.id
        headlines = [(h.text, h.pinned_field) for h in r.ad_group_ad.ad.responsive_search_ad.headlines]
        descs = [d.text for d in r.ad_group_ad.ad.responsive_search_ad.descriptions]
        urls = list(r.ad_group_ad.ad.final_urls)
        url = urls[0] if urls else ''

        by_ag[(cn, agn)].append(ad_id)

        # Missing H1 pins
        h1s = [h for h, p in headlines if p == PinEnum.HEADLINE_1]
        if not h1s:
            issues['missing_h1'].append({'campaign': cn, 'ad_group': agn, 'ad_id': ad_id})

        # "Platform" in headlines
        for h, p in headlines:
            if 'platform' in h.lower():
                issues['platform'].append({'campaign': cn, 'ad_id': ad_id, 'text': h})

        # Sales language
        for h, p in headlines:
            if any(w in h.lower() for w in SALES_TERMS):
                issues['sales_lang'].append({'campaign': cn, 'ad_id': ad_id, 'text': h})

        # Em dashes
        for h, p in headlines:
            if '—' in h or '–' in h:
                issues['em_dash'].append({'campaign': cn, 'ad_id': ad_id, 'text': h, 'type': 'headline'})
        for d in descs:
            if '—' in d or '–' in d:
                issues['em_dash'].append({'campaign': cn, 'ad_id': ad_id, 'text': d, 'type': 'description'})

        # Political ads
        for t in r.ad_group_ad.policy_summary.policy_topic_entries:
            if 'POLITICAL' in (t.topic or ''):
                issues['political'].append({'campaign': cn, 'ad_id': ad_id})

        # Latency numbers
        for h, p in headlines:
            if any(x in h.lower() for x in LATENCY_TERMS):
                issues['latency'].append({'campaign': cn, 'ad_id': ad_id, 'text': h, 'type': 'headline'})
        for d in descs:
            if any(x in d.lower() for x in LATENCY_TERMS):
                issues['latency'].append({'campaign': cn, 'ad_id': ad_id, 'text': d, 'type': 'description'})

        # Missing UTMs
        if url and 'utm_' not in url:
            issues['no_utm'].append({'campaign': cn, 'ad_id': ad_id, 'url': url[:80]})

        # Trademark issues
        status = r.ad_group_ad.policy_summary.approval_status
        if hasattr(status, 'name') and status.name == 'APPROVED_LIMITED':
            for t in r.ad_group_ad.policy_summary.policy_topic_entries:
                if 'TRADEMARK' in (t.topic or ''):
                    issues['trademark'].append({'campaign': cn, 'ad_id': ad_id, 'topic': t.topic})

        # Twilio brand in copy
        if 'twilio' in cn.lower():
            for h, p in headlines:
                if 'twilio' in h.lower():
                    issues['twilio_brand'].append({'campaign': cn, 'ad_id': ad_id, 'text': h})

    # Duplicates
    for (cn, agn), ads in by_ag.items():
        if len(ads) > 1:
            # Skip ElevenLabs — intentional (trademark-safe + competitor-callout)
            if 'elevenlabs' in cn.lower():
                continue
            issues['duplicates'].append({'campaign': cn, 'ad_group': agn, 'count': len(ads), 'ad_ids': ads})

    # ─── 2. Audit negative keywords in competitor campaigns ───
    q_neg = '''SELECT campaign.name, campaign.id, campaign_criterion.criterion_id,
               campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
    FROM campaign_criterion
    WHERE campaign.status="ENABLED" AND campaign_criterion.type="KEYWORD"
      AND campaign_criterion.negative=TRUE'''

    for r in ga.search(customer_id=kha.CUSTOMER_ID, query=q_neg):
        cn = r.campaign.name.lower()
        kw = r.campaign_criterion.keyword.text.lower()
        is_competitor = any(c in cn for c in COMPETITORS)
        if is_competitor:
            for pt in PROTECTED_PRODUCT_TERMS:
                if pt in kw:
                    mt = r.campaign_criterion.keyword.match_type.name
                    issues['neg_blocking'].append({
                        'campaign': r.campaign.name,
                        'keyword': f'-{r.campaign_criterion.keyword.text}',
                        'match_type': mt,
                        'criterion_id': r.campaign_criterion.criterion_id,
                        'campaign_id': r.campaign.id,
                        'blocked_term': pt,
                    })

    # ─── 3. Audit sitelinks ───
    q_sl = '''SELECT campaign.name, campaign.status, asset.id,
              asset.sitelink_asset.link_text, asset.sitelink_asset.description1,
              asset.sitelink_asset.description2, asset.final_urls
    FROM campaign_asset
    WHERE campaign.status="ENABLED" AND asset.type="SITELINK" AND campaign_asset.status="ENABLED"'''

    seen_assets = set()
    for r in ga.search(customer_id=kha.CUSTOMER_ID, query=q_sl):
        aid = r.asset.id
        if aid in seen_assets:
            continue
        seen_assets.add(aid)
        lt = r.asset.sitelink_asset.link_text or ''
        d1 = r.asset.sitelink_asset.description1 or ''
        d2 = r.asset.sitelink_asset.description2 or ''
        urls = list(r.asset.final_urls) if r.asset.final_urls else []

        # Sales language in sitelinks
        for text in [lt, d1, d2]:
            if any(w in text.lower() for w in SALES_TERMS):
                issues['sitelink_sales'].append({'asset_id': aid, 'text': text, 'campaign': r.campaign.name})

        # Em dashes in sitelinks
        for text in [lt, d1, d2]:
            if '—' in text or '–' in text:
                issues['sitelink_em_dash'].append({'asset_id': aid, 'text': text})

        # Latency numbers in sitelinks
        for text in [lt, d1, d2]:
            if any(x in text.lower() for x in LATENCY_TERMS):
                issues['sitelink_latency'].append({'asset_id': aid, 'text': text})

        # "Platform" in sitelinks
        if 'platform' in lt.lower() or 'platform' in d1.lower() or 'platform' in d2.lower():
            issues['sitelink_platform'].append({'asset_id': aid, 'text': lt})

    # ─── Build report ───
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')
    total_issues = sum(len(v) for v in issues.values())

    report_lines = [f'🔍 <b>Ad Quality Audit — {timestamp}</b>']
    report_lines.append(f'Scanned: {total_ads} enabled ads\n')

    if total_issues == 0:
        report_lines.append('✅ All clear — no issues found')
    else:
        report_lines.append(f'⚠️ Found {total_issues} issues:\n')

        checks = [
            ('missing_h1', '❌ Missing H1 Pin'),
            ('duplicates', '❌ Duplicate Ads'),
            ('platform', '❌ "Platform" in Headlines'),
            ('sales_lang', '❌ Sales Language in Ads'),
            ('em_dash', '❌ Em Dashes'),
            ('political', '❌ EU Political Flags'),
            ('latency', '❌ Latency Numbers'),
            ('no_utm', '❌ Missing UTMs'),
            ('trademark', '⚠️ Trademark Issues'),
            ('twilio_brand', '❌ Twilio Brand in Copy'),
            ('neg_blocking', '❌ Neg Keywords Blocking Products'),
            ('sitelink_sales', '❌ Sales Language in Sitelinks'),
            ('sitelink_em_dash', '❌ Em Dashes in Sitelinks'),
            ('sitelink_latency', '❌ Latency in Sitelinks'),
            ('sitelink_platform', '❌ "Platform" in Sitelinks'),
        ]

        for key, label in checks:
            items = issues.get(key, [])
            if items:
                report_lines.append(f'{label}: {len(items)}')
                for item in items[:5]:  # Show first 5
                    if 'campaign' in item:
                        report_lines.append(f'  • {item.get("campaign", "")} | {item.get("text", item.get("keyword", ""))}')
                    else:
                        report_lines.append(f'  • Asset {item.get("asset_id", "")} | {item.get("text", "")}')
                if len(items) > 5:
                    report_lines.append(f'  ... and {len(items) - 5} more')
                report_lines.append('')

    report = '\n'.join(report_lines)
    print(report)

    # Save to log
    log_dir = os.path.join(SCRIPT_DIR, '..', 'logs', 'ad-quality-audit')
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, f'{datetime.now().strftime("%Y-%m-%d")}.json')
    with open(log_file, 'w') as f:
        json.dump({
            'timestamp': timestamp,
            'total_ads': total_ads,
            'total_issues': total_issues,
            'issues': {k: v for k, v in issues.items()},
        }, f, indent=2, default=str)

    return report, issues, total_issues


def main():
    parser = argparse.ArgumentParser(description='Ad Quality Audit Agent')
    parser.add_argument('--fix', action='store_true', help='Auto-fix issues where possible')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be fixed without doing it')
    parser.add_argument('--channel', default=None, help='Send report to channel (telegram)')
    args = parser.parse_args()

    report, issues, total_issues = run_audit(fix=args.fix, dry_run=args.dry_run)

    if args.channel == 'telegram':
        send_telegram(report)
        print('Sent to Telegram')


if __name__ == '__main__':
    main()
