#!/usr/bin/env python3
"""
Export campaign structure (ad groups, keywords, RSAs) from Google Ads.
Usage: python export-campaign-structure.py "Campaign Name"
"""

import sys
import json
from pathlib import Path

def load_credentials():
    cred_path = Path.home() / ".config" / "google-ads" / "credentials.json"
    with open(cred_path) as f:
        return json.load(f)

def get_client(creds):
    from google.ads.googleads.client import GoogleAdsClient
    config = {
        "developer_token": creds["developer_token"],
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "use_proto_plus": True,
    }
    if "login_customer_id" in creds:
        config["login_customer_id"] = str(creds["login_customer_id"])
    return GoogleAdsClient.load_from_dict(config)

def export_campaign(client, customer_id, campaign_name):
    ga_service = client.get_service("GoogleAdsService")
    
    # Get campaign info
    campaign_query = f'''
        SELECT 
            campaign.id,
            campaign.name,
            campaign.status,
            campaign_budget.amount_micros
        FROM campaign
        WHERE campaign.name = "{campaign_name}"
    '''
    
    campaign_response = ga_service.search(customer_id=customer_id, query=campaign_query)
    campaign_data = None
    for row in campaign_response:
        campaign_data = {
            "id": row.campaign.id,
            "name": row.campaign.name,
            "status": row.campaign.status.name,
            "dailyBudget": row.campaign_budget.amount_micros / 1_000_000,
        }
        break
    
    if not campaign_data:
        return {"error": f"Campaign '{campaign_name}' not found"}
    
    # Get geo targets
    geo_query = f'''
        SELECT 
            campaign_criterion.location.geo_target_constant,
            geo_target_constant.name,
            geo_target_constant.country_code
        FROM campaign_criterion
        WHERE campaign.name = "{campaign_name}"
            AND campaign_criterion.type = 'LOCATION'
            AND campaign_criterion.negative = false
    '''
    
    geo_targets = []
    try:
        geo_response = ga_service.search(customer_id=customer_id, query=geo_query)
        for row in geo_response:
            geo_targets.append({
                "name": row.geo_target_constant.name,
                "countryCode": row.geo_target_constant.country_code,
            })
    except:
        pass
    
    # Get ad groups
    ag_query = f'''
        SELECT 
            ad_group.id,
            ad_group.name,
            ad_group.status,
            ad_group.cpc_bid_micros
        FROM ad_group
        WHERE campaign.name = "{campaign_name}"
            AND ad_group.status != 'REMOVED'
    '''
    
    ad_groups = []
    ag_response = ga_service.search(customer_id=customer_id, query=ag_query)
    for row in ag_response:
        ad_groups.append({
            "id": row.ad_group.id,
            "name": row.ad_group.name,
            "status": row.ad_group.status.name,
            "cpcBid": row.ad_group.cpc_bid_micros / 1_000_000 if row.ad_group.cpc_bid_micros else 0,
            "keywords": [],
            "ads": {"headlines": [], "descriptions": []},
        })
    
    # Get keywords per ad group
    for ag in ad_groups:
        kw_query = f'''
            SELECT 
                ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type,
                ad_group_criterion.status
            FROM ad_group_criterion
            WHERE ad_group.id = {ag['id']}
                AND ad_group_criterion.type = 'KEYWORD'
                AND ad_group_criterion.status != 'REMOVED'
        '''
        
        kw_response = ga_service.search(customer_id=customer_id, query=kw_query)
        for row in kw_response:
            ag["keywords"].append({
                "text": row.ad_group_criterion.keyword.text,
                "matchType": row.ad_group_criterion.keyword.match_type.name,
                "status": row.ad_group_criterion.status.name,
            })
    
    # Get RSA assets per ad group
    for ag in ad_groups:
        rsa_query = f'''
            SELECT 
                ad_group_ad.ad.responsive_search_ad.headlines,
                ad_group_ad.ad.responsive_search_ad.descriptions,
                ad_group_ad.ad.final_urls,
                ad_group_ad.status
            FROM ad_group_ad
            WHERE ad_group.id = {ag['id']}
                AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
                AND ad_group_ad.status != 'REMOVED'
        '''
        
        try:
            rsa_response = ga_service.search(customer_id=customer_id, query=rsa_query)
            for row in rsa_response:
                rsa = row.ad_group_ad.ad.responsive_search_ad
                ag["ads"]["headlines"] = [h.text for h in rsa.headlines]
                ag["ads"]["descriptions"] = [d.text for d in rsa.descriptions]
                ag["ads"]["finalUrls"] = list(row.ad_group_ad.ad.final_urls)
                ag["ads"]["status"] = row.ad_group_ad.status.name
                # Get pinning info
                ag["ads"]["pinning"] = []
                for h in rsa.headlines:
                    if h.pinned_field:
                        pin_pos = None
                        if "HEADLINE_1" in str(h.pinned_field):
                            pin_pos = 1
                        elif "HEADLINE_2" in str(h.pinned_field):
                            pin_pos = 2
                        elif "HEADLINE_3" in str(h.pinned_field):
                            pin_pos = 3
                        if pin_pos:
                            ag["ads"]["pinning"].append({"text": h.text, "position": pin_pos})
                break  # Just get first RSA
        except Exception as e:
            ag["ads"]["error"] = str(e)
    
    return {
        "campaign": campaign_data,
        "geoTargets": geo_targets,
        "adGroups": ad_groups,
    }

def main():
    if len(sys.argv) < 2:
        print("Usage: python export-campaign-structure.py 'Campaign Name'")
        sys.exit(1)
    
    campaign_name = sys.argv[1]
    customer_id = "2356650573"
    
    creds = load_credentials()
    client = get_client(creds)
    
    result = export_campaign(client, customer_id, campaign_name)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
