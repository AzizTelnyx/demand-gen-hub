#!/usr/bin/env python3
"""
Fix broken UTM URLs in Google Ads campaigns.
Targets:
  1. 202301 TOFU SIP SA AMER — missing & separator + duplicate utm_term
  2. 202308 BOFU Voice API Twilio RLSA GLOBAL — double ?? in URL
"""

import sys
import os
import re
import importlib.util
import argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('kha', os.path.join(SCRIPT_DIR, 'keyword-hygiene-agent.py'))
kha = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kha)


def fix_url(url):
    """Fix known URL issues and return (fixed_url, list_of_fixes)."""
    fixes = []
    original = url

    # Fix double ??
    if '??' in url:
        url = url.replace('??', '?')
        fixes.append('double ?? → single ?')

    # Fix missing & separator (utm_campaignXXXutm_term pattern)
    m = re.search(r'(utm_campaign=[^&]+?)(utm_term=)', url)
    if m and '&' + m.group(2) not in url:
        url = url.replace(m.group(1) + m.group(2), m.group(1) + '&' + m.group(2))
        fixes.append('missing & between utm_campaign and utm_term')

    # Fix duplicate utm_term
    parts = url.split('&')
    seen_keys = {}
    deduped = []
    for p in parts:
        key = p.split('=')[0]
        if key in seen_keys:
            fixes.append(f'removed duplicate {key}')
        else:
            seen_keys[key] = True
            deduped.append(p)
    url = '&'.join(deduped)

    return url, fixes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='Actually apply fixes (default: dry-run)')
    args = parser.parse_args()

    client = kha.get_client()
    ga = client.get_service('GoogleAdsService')
    ad_svc = client.get_service('AdService')

    # Target campaigns
    targets = [
        '202301 TOFU SIP SA AMER',
        '202308 BOFU Voice API Twilio RLSA GLOBAL',
    ]

    q = '''SELECT campaign.name, ad_group.name, ad_group_ad.ad.id,
           ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines,
           ad_group_ad.ad.responsive_search_ad.descriptions
    FROM ad_group_ad
    WHERE campaign.status="ENABLED" AND ad_group.status="ENABLED"
      AND ad_group_ad.status="ENABLED" AND ad_group_ad.ad.type="RESPONSIVE_SEARCH_AD"
      AND campaign.advertising_channel_type="SEARCH"'''

    ads_to_fix = []
    for r in ga.search(customer_id=kha.CUSTOMER_ID, query=q):
        cn = r.campaign.name
        if cn not in targets:
            continue
        urls = list(r.ad_group_ad.ad.final_urls)
        if not urls:
            continue
        url = urls[0]
        fixed_url, fixes = fix_url(url)
        if fixes:
            ads_to_fix.append({
                'campaign': cn,
                'ad_group': r.ad_group.name,
                'ad_id': r.ad_group_ad.ad.id,
                'original_url': url,
                'fixed_url': fixed_url,
                'fixes': fixes,
                'headlines': [(h.text, h.pinned_field) for h in r.ad_group_ad.ad.responsive_search_ad.headlines],
                'descriptions': [d.text for d in r.ad_group_ad.ad.responsive_search_ad.descriptions],
            })

    if not ads_to_fix:
        print('✅ No broken URLs found in target campaigns. Already fixed or ads changed.')
        return

    print(f'Found {len(ads_to_fix)} ads to fix:\n')
    for ad in ads_to_fix:
        print(f'Campaign: {ad["campaign"]}')
        print(f'Ad Group: {ad["ad_group"]}')
        print(f'Ad ID:    {ad["ad_id"]}')
        print(f'Fixes:    {", ".join(ad["fixes"])}')
        print(f'  BEFORE: {ad["original_url"]}')
        print(f'  AFTER:  {ad["fixed_url"]}')
        print()

    if not args.apply:
        print('--- DRY RUN — pass --apply to execute ---')
        return

    # Apply fixes via mutate
    # Google Ads requires removing the old ad and creating a new one with updated URLs
    # (final_urls are immutable on existing ads)
    from google.api_core import protobuf_helpers

    success = 0
    failed = 0
    for ad in ads_to_fix:
        try:
            # Build ad operation — update final_urls
            op = client.get_type('AdOperation')
            ad_resource = op.update
            ad_resource.resource_name = ad_svc.ad_path(kha.CUSTOMER_ID, ad['ad_id'])
            ad_resource.final_urls.append(ad['fixed_url'])

            # Set update mask
            field_mask = protobuf_helpers.field_mask(None, ad_resource._pb)
            op.update_mask.CopyFrom(field_mask)

            response = ad_svc.mutate_ads(customer_id=kha.CUSTOMER_ID, operations=[op])
            print(f'✅ Fixed ad {ad["ad_id"]} in {ad["campaign"]}')
            success += 1
        except Exception as e:
            print(f'❌ Failed ad {ad["ad_id"]}: {e}')
            failed += 1

    print(f'\nDone: {success} fixed, {failed} failed')


if __name__ == '__main__':
    main()
