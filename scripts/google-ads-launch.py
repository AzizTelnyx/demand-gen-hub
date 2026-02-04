#!/usr/bin/env python3
"""
Google Ads Campaign Launcher
Creates campaigns, ad groups, and ads from Hub-generated plans
"""

import json
import sys
import os
from datetime import datetime, timedelta

# Add Google Ads library path
sys.path.insert(0, '/home/telnyx-user/.venv/lib/python3.12/site-packages')

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

# Configuration
GOOGLE_ADS_YAML = os.path.expanduser('~/.config/google-ads/google-ads.yaml')
CUSTOMER_ID = '2356650573'  # Marketing Telnyx account

def get_client():
    """Initialize Google Ads client"""
    return GoogleAdsClient.load_from_storage(GOOGLE_ADS_YAML)

def create_campaign_budget(client, customer_id, budget_amount_micros, budget_name):
    """Create a campaign budget"""
    campaign_budget_service = client.get_service("CampaignBudgetService")
    campaign_budget_operation = client.get_type("CampaignBudgetOperation")
    
    campaign_budget = campaign_budget_operation.create
    campaign_budget.name = budget_name
    campaign_budget.amount_micros = budget_amount_micros
    campaign_budget.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
    
    response = campaign_budget_service.mutate_campaign_budgets(
        customer_id=customer_id, 
        operations=[campaign_budget_operation]
    )
    
    return response.results[0].resource_name

def create_campaign(client, customer_id, campaign_name, budget_resource_name, campaign_type='SEARCH'):
    """Create a campaign"""
    campaign_service = client.get_service("CampaignService")
    campaign_operation = client.get_type("CampaignOperation")
    
    campaign = campaign_operation.create
    campaign.name = campaign_name
    campaign.campaign_budget = budget_resource_name
    campaign.advertising_channel_type = client.enums.AdvertisingChannelTypeEnum[campaign_type]
    campaign.status = client.enums.CampaignStatusEnum.PAUSED  # Start paused for safety
    
    # Set bidding strategy
    campaign.manual_cpc.enhanced_cpc_enabled = True
    
    # Network settings for Search campaigns
    if campaign_type == 'SEARCH':
        campaign.network_settings.target_google_search = True
        campaign.network_settings.target_search_network = True
        campaign.network_settings.target_content_network = False
    
    # Set start date to today
    campaign.start_date = datetime.now().strftime('%Y%m%d')
    
    response = campaign_service.mutate_campaigns(
        customer_id=customer_id, 
        operations=[campaign_operation]
    )
    
    return response.results[0].resource_name

def create_ad_group(client, customer_id, campaign_resource_name, ad_group_name, cpc_bid_micros):
    """Create an ad group"""
    ad_group_service = client.get_service("AdGroupService")
    ad_group_operation = client.get_type("AdGroupOperation")
    
    ad_group = ad_group_operation.create
    ad_group.name = ad_group_name
    ad_group.campaign = campaign_resource_name
    ad_group.status = client.enums.AdGroupStatusEnum.ENABLED
    ad_group.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD
    ad_group.cpc_bid_micros = cpc_bid_micros
    
    response = ad_group_service.mutate_ad_groups(
        customer_id=customer_id, 
        operations=[ad_group_operation]
    )
    
    return response.results[0].resource_name

def create_responsive_search_ad(client, customer_id, ad_group_resource_name, headlines, descriptions, final_url):
    """Create a responsive search ad"""
    ad_group_ad_service = client.get_service("AdGroupAdService")
    ad_group_ad_operation = client.get_type("AdGroupAdOperation")
    
    ad_group_ad = ad_group_ad_operation.create
    ad_group_ad.ad_group = ad_group_resource_name
    ad_group_ad.status = client.enums.AdGroupAdStatusEnum.ENABLED
    
    # Set up responsive search ad
    ad = ad_group_ad.ad
    ad.final_urls.append(final_url)
    
    rsa = ad.responsive_search_ad
    
    # Add headlines (max 15, min 3)
    for i, headline in enumerate(headlines[:15]):
        headline_asset = client.get_type("AdTextAsset")
        headline_asset.text = headline['text'][:30]  # Enforce limit
        if headline.get('pinned'):
            pin_map = {'H1': 1, 'H2': 2, 'H3': 3}
            if headline['pinned'] in pin_map:
                headline_asset.pinned_field = client.enums.ServedAssetFieldTypeEnum.HEADLINE_1 + pin_map[headline['pinned']] - 1
        rsa.headlines.append(headline_asset)
    
    # Add descriptions (max 4, min 2)
    for desc in descriptions[:4]:
        desc_asset = client.get_type("AdTextAsset")
        desc_asset.text = desc['text'][:90]  # Enforce limit
        rsa.descriptions.append(desc_asset)
    
    response = ad_group_ad_service.mutate_ad_group_ads(
        customer_id=customer_id, 
        operations=[ad_group_ad_operation]
    )
    
    return response.results[0].resource_name

def add_keywords(client, customer_id, ad_group_resource_name, keywords):
    """Add keywords to an ad group"""
    ad_group_criterion_service = client.get_service("AdGroupCriterionService")
    operations = []
    
    for kw in keywords:
        operation = client.get_type("AdGroupCriterionOperation")
        criterion = operation.create
        criterion.ad_group = ad_group_resource_name
        criterion.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
        criterion.keyword.text = kw['keyword']
        
        # Set match type
        match_type = kw.get('matchType', 'PHRASE').upper()
        if match_type == 'EXACT':
            criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.EXACT
        elif match_type == 'BROAD':
            criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD
        else:
            criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.PHRASE
        
        # Set bid if provided
        if kw.get('cpc'):
            criterion.cpc_bid_micros = int(kw['cpc'] * 1_000_000)
        
        operations.append(operation)
    
    if operations:
        response = ad_group_criterion_service.mutate_ad_group_criteria(
            customer_id=customer_id, 
            operations=operations
        )
        return [r.resource_name for r in response.results]
    
    return []

def launch_campaign(plan_data):
    """Main function to launch a campaign from plan data"""
    try:
        client = get_client()
        customer_id = plan_data.get('customerId', CUSTOMER_ID).replace('-', '')
        
        results = {
            'success': True,
            'campaign': None,
            'adGroups': [],
            'ads': [],
            'keywords': [],
            'errors': []
        }
        
        # Extract plan details
        plan = plan_data.get('plan', {})
        ad_copy = plan_data.get('adCopy', {})
        campaign_name = plan.get('summary', {}).get('campaignName', f"Hub Campaign {datetime.now().strftime('%Y%m%d')}")
        monthly_budget = plan.get('summary', {}).get('totalMonthlyBudget', 3000)
        daily_budget_micros = int((monthly_budget / 30) * 1_000_000)
        
        # Create budget
        budget_name = f"{campaign_name} Budget"
        budget_resource = create_campaign_budget(client, customer_id, daily_budget_micros, budget_name)
        results['budget'] = budget_resource
        
        # Create campaign
        campaign_resource = create_campaign(client, customer_id, campaign_name, budget_resource, 'SEARCH')
        results['campaign'] = {
            'resourceName': campaign_resource,
            'name': campaign_name,
            'status': 'PAUSED',
            'dailyBudget': daily_budget_micros / 1_000_000
        }
        
        # Create ad groups from ad copy
        ad_groups = ad_copy.get('adGroups', [])
        default_cpc = 15_000_000  # $15 default CPC
        
        for group in ad_groups:
            if group.get('channel') != 'Google Search':
                continue
                
            ad_group_name = f"{campaign_name} - {group.get('theme', 'General')}"
            ad_group_resource = create_ad_group(client, customer_id, campaign_resource, ad_group_name, default_cpc)
            
            results['adGroups'].append({
                'resourceName': ad_group_resource,
                'name': ad_group_name,
                'theme': group.get('theme')
            })
            
            # Create RSA
            headlines = group.get('headlines', [])
            descriptions = group.get('descriptions', [])
            final_url = plan_data.get('landingPage', 'https://telnyx.com')
            
            if len(headlines) >= 3 and len(descriptions) >= 2:
                ad_resource = create_responsive_search_ad(
                    client, customer_id, ad_group_resource, 
                    headlines, descriptions, final_url
                )
                results['ads'].append({
                    'resourceName': ad_resource,
                    'adGroup': ad_group_name,
                    'headlineCount': len(headlines),
                    'descriptionCount': len(descriptions)
                })
            
            # Add keywords from channel research
            keywords = group.get('keywords', [])
            if not keywords and plan_data.get('channelResearch'):
                for ch in plan_data['channelResearch']:
                    if ch.get('channel') == 'google_search':
                        keywords = ch.get('keywords', [])
                        break
            
            if keywords:
                kw_resources = add_keywords(client, customer_id, ad_group_resource, keywords)
                results['keywords'].extend([{
                    'resourceName': r,
                    'adGroup': ad_group_name
                } for r in kw_resources])
        
        return results
        
    except GoogleAdsException as ex:
        error_messages = []
        for error in ex.failure.errors:
            error_messages.append({
                'message': error.message,
                'code': str(error.error_code)
            })
        return {
            'success': False,
            'errors': error_messages
        }
    except Exception as e:
        return {
            'success': False,
            'errors': [{'message': str(e)}]
        }

def preview_campaign(plan_data):
    """Preview what would be created without actually creating it"""
    plan = plan_data.get('plan', {})
    ad_copy = plan_data.get('adCopy', {})
    
    campaign_name = plan.get('summary', {}).get('campaignName', f"Hub Campaign {datetime.now().strftime('%Y%m%d')}")
    monthly_budget = plan.get('summary', {}).get('totalMonthlyBudget', 3000)
    
    preview = {
        'campaign': {
            'name': campaign_name,
            'type': 'SEARCH',
            'status': 'PAUSED (will start paused for review)',
            'dailyBudget': round(monthly_budget / 30, 2),
            'monthlyBudget': monthly_budget
        },
        'adGroups': [],
        'warnings': []
    }
    
    ad_groups = ad_copy.get('adGroups', [])
    for group in ad_groups:
        if group.get('channel') != 'Google Search':
            preview['warnings'].append(f"Skipping {group.get('channel')} - only Google Search supported")
            continue
            
        headlines = group.get('headlines', [])
        descriptions = group.get('descriptions', [])
        
        ag_preview = {
            'name': f"{campaign_name} - {group.get('theme', 'General')}",
            'theme': group.get('theme'),
            'headlines': len(headlines),
            'descriptions': len(descriptions),
            'rsa': len(headlines) >= 3 and len(descriptions) >= 2
        }
        
        if len(headlines) < 3:
            preview['warnings'].append(f"{group.get('theme')}: Need at least 3 headlines (have {len(headlines)})")
        if len(descriptions) < 2:
            preview['warnings'].append(f"{group.get('theme')}: Need at least 2 descriptions (have {len(descriptions)})")
        
        # Check character limits
        for h in headlines:
            if len(h.get('text', '')) > 30:
                preview['warnings'].append(f"Headline too long: '{h.get('text', '')[:30]}...' ({len(h.get('text', ''))} chars)")
        for d in descriptions:
            if len(d.get('text', '')) > 90:
                preview['warnings'].append(f"Description too long: '{d.get('text', '')[:30]}...' ({len(d.get('text', ''))} chars)")
        
        preview['adGroups'].append(ag_preview)
    
    return preview


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: google-ads-launch.py <action> [json_file]'}))
        sys.exit(1)
    
    action = sys.argv[1]
    
    if action == 'preview':
        if len(sys.argv) < 3:
            data = json.load(sys.stdin)
        else:
            with open(sys.argv[2]) as f:
                data = json.load(f)
        result = preview_campaign(data)
        print(json.dumps(result, indent=2))
    
    elif action == 'launch':
        if len(sys.argv) < 3:
            data = json.load(sys.stdin)
        else:
            with open(sys.argv[2]) as f:
                data = json.load(f)
        result = launch_campaign(data)
        print(json.dumps(result, indent=2))
    
    elif action == 'test':
        # Test connection
        try:
            client = get_client()
            print(json.dumps({'success': True, 'message': 'Google Ads client initialized successfully'}))
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))
    
    else:
        print(json.dumps({'error': f'Unknown action: {action}'}))
        sys.exit(1)
