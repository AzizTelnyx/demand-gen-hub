#!/usr/bin/env python3
"""
Create Google Ads campaign via API.

Input: JSON from stdin with campaign plan
Output: JSON with created resource IDs

SAFETY:
- Campaign ALWAYS created as PAUSED
- Geo targeting ALWAYS set to PRESENCE
- Network ALWAYS Search only (no Display expansion)
- Bidding strategy: Manual CPC
- All match types validated (EXACT/PHRASE only, NEVER broad)
"""

import sys
import json
from pathlib import Path

def load_credentials():
    cred_path = Path.home() / ".config" / "google-ads" / "credentials.json"
    if not cred_path.exists():
        raise FileNotFoundError(f"Google Ads credentials not found at {cred_path}")
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

def validate_plan(plan):
    """Pre-flight validation. Abort if anything is wrong."""
    errors = []
    
    campaign = plan.get("campaign", {})
    
    # MUST be paused
    if campaign.get("status", "").upper() != "PAUSED":
        errors.append(f"Campaign status must be PAUSED, got '{campaign.get('status')}'")
    
    # Validate keywords - NEVER broad
    for ag in plan.get("adGroups", []):
        for kw in ag.get("keywords", []):
            mt = kw.get("matchType", "").upper().replace(" ", "_")
            if mt in ("BROAD", "BROAD_MATCH"):
                errors.append(f"Broad match NEVER allowed: keyword '{kw.get('text')}'")
            if mt not in ("EXACT", "PHRASE", "EXACT_MATCH", "PHRASE_MATCH"):
                errors.append(f"Invalid match type '{mt}' for keyword '{kw.get('text')}'")
    
    # Validate headlines char limits
    for ag in plan.get("adGroups", []):
        ads = ag.get("ads", {})
        for h in ads.get("headlines", []):
            if len(h) > 30:
                errors.append(f"Headline too long ({len(h)} chars): '{h}'")
        for d in ads.get("descriptions", []):
            if len(d) > 90:
                errors.append(f"Description too long ({len(d)} chars): '{d[:50]}...'")
    
    if errors:
        return False, errors
    return True, []

def create_campaign(client, customer_id, plan):
    """Create campaign, ad groups, keywords, and RSAs."""
    results = {"campaignId": None, "adGroups": [], "errors": []}
    
    campaign_data = plan["campaign"]
    
    # ── 1. Create Campaign Budget ──────────────────────────────
    campaign_budget_service = client.get_service("CampaignBudgetService")
    budget_op = client.get_type("CampaignBudgetOperation")
    budget = budget_op.create
    budget.name = f"{campaign_data['name']} Budget"
    budget.amount_micros = int(campaign_data.get("dailyBudget", 50) * 1_000_000)
    budget.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
    
    try:
        budget_response = campaign_budget_service.mutate_campaign_budgets(
            customer_id=str(customer_id),
            operations=[budget_op],
        )
        budget_resource = budget_response.results[0].resource_name
    except Exception as e:
        results["errors"].append(f"Budget creation failed: {e}")
        print(json.dumps(results))
        sys.exit(1)
    
    # ── 2. Create Campaign ─────────────────────────────────────
    campaign_service = client.get_service("CampaignService")
    campaign_op = client.get_type("CampaignOperation")
    campaign = campaign_op.create
    campaign.name = campaign_data["name"]
    campaign.campaign_budget = budget_resource
    
    # SAFETY: Always PAUSED
    campaign.status = client.enums.CampaignStatusEnum.PAUSED
    
    # SAFETY: Search only
    campaign.advertising_channel_type = client.enums.AdvertisingChannelTypeEnum.SEARCH
    campaign.network_settings.target_google_search = True
    campaign.network_settings.target_search_network = False
    campaign.network_settings.target_content_network = False  # No display expansion
    
    # SAFETY: Manual CPC
    campaign.manual_cpc.enhanced_cpc_enabled = False
    
    # SAFETY: Geo targeting = PRESENCE only
    campaign.geo_target_type_setting.positive_geo_target_type = (
        client.enums.PositiveGeoTargetTypeEnum.PRESENCE
    )
    campaign.geo_target_type_setting.negative_geo_target_type = (
        client.enums.NegativeGeoTargetTypeEnum.PRESENCE_OR_INTEREST
    )
    
    try:
        campaign_response = campaign_service.mutate_campaigns(
            customer_id=str(customer_id),
            operations=[campaign_op],
        )
        campaign_resource = campaign_response.results[0].resource_name
        results["campaignId"] = campaign_resource
    except Exception as e:
        results["errors"].append(f"Campaign creation failed: {e}")
        print(json.dumps(results))
        sys.exit(1)
    
    # ── 3. Create Ad Groups ────────────────────────────────────
    ad_group_service = client.get_service("AdGroupService")
    
    for ag_data in plan.get("adGroups", []):
        ag_op = client.get_type("AdGroupOperation")
        ad_group = ag_op.create
        ad_group.name = ag_data["name"]
        ad_group.campaign = campaign_resource
        ad_group.status = client.enums.AdGroupStatusEnum.ENABLED
        ad_group.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD
        
        # Default CPC bid
        ad_group.cpc_bid_micros = int(ag_data.get("cpcBid", 5) * 1_000_000)
        
        try:
            ag_response = ad_group_service.mutate_ad_groups(
                customer_id=str(customer_id),
                operations=[ag_op],
            )
            ag_resource = ag_response.results[0].resource_name
            ag_result = {"name": ag_data["name"], "resourceName": ag_resource, "keywords": [], "ads": []}
            
            # ── 4. Add Keywords ────────────────────────────────
            ag_criterion_service = client.get_service("AdGroupCriterionService")
            
            for kw_data in ag_data.get("keywords", []):
                kw_op = client.get_type("AdGroupCriterionOperation")
                criterion = kw_op.create
                criterion.ad_group = ag_resource
                criterion.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
                criterion.keyword.text = kw_data["text"]
                
                # SAFETY: Match type validation
                mt = kw_data.get("matchType", "PHRASE").upper().replace(" ", "_")
                if mt in ("EXACT", "EXACT_MATCH"):
                    criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.EXACT
                elif mt in ("PHRASE", "PHRASE_MATCH"):
                    criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.PHRASE
                else:
                    results["errors"].append(f"BLOCKED: Invalid match type '{mt}' for '{kw_data['text']}'")
                    continue
                
                try:
                    kw_response = ag_criterion_service.mutate_ad_group_criteria(
                        customer_id=str(customer_id),
                        operations=[kw_op],
                    )
                    ag_result["keywords"].append({
                        "text": kw_data["text"],
                        "matchType": mt,
                        "resourceName": kw_response.results[0].resource_name,
                    })
                except Exception as e:
                    results["errors"].append(f"Keyword '{kw_data['text']}' failed: {e}")
            
            # ── 5. Create RSA ──────────────────────────────────
            ad_service = client.get_service("AdGroupAdService")
            ads_data = ag_data.get("ads", {})
            headlines = ads_data.get("headlines", [])
            descriptions = ads_data.get("descriptions", [])
            pinning = ads_data.get("pinning", [])
            
            if headlines and descriptions:
                ad_op = client.get_type("AdGroupAdOperation")
                ad_group_ad = ad_op.create
                ad_group_ad.ad_group = ag_resource
                ad_group_ad.status = client.enums.AdGroupAdStatusEnum.ENABLED
                
                rsa = ad_group_ad.ad.responsive_search_ad
                
                # Add headlines (max 15)
                for i, h_text in enumerate(headlines[:15]):
                    headline = client.get_type("AdTextAsset")
                    headline.text = h_text
                    
                    # Apply pinning
                    pin_match = next((p for p in pinning if p.get("text") == h_text), None)
                    if pin_match:
                        pos = pin_match["position"]
                        if pos == 1:
                            headline.pinned_field = client.enums.ServedAssetFieldTypeEnum.HEADLINE_1
                        elif pos == 2:
                            headline.pinned_field = client.enums.ServedAssetFieldTypeEnum.HEADLINE_2
                        elif pos == 3:
                            headline.pinned_field = client.enums.ServedAssetFieldTypeEnum.HEADLINE_3
                    
                    rsa.headlines.append(headline)
                
                # Add descriptions (max 4)
                for d_text in descriptions[:4]:
                    desc = client.get_type("AdTextAsset")
                    desc.text = d_text
                    rsa.descriptions.append(desc)
                
                # Final URL with UTMs
                utm = plan.get("utmParams", {})
                base_url = plan.get("campaign", {}).get("landingPage", "https://telnyx.com")
                if utm:
                    params = "&".join(f"{k}={v}" for k, v in utm.items())
                    final_url = f"{base_url}?{params}" if "?" not in base_url else f"{base_url}&{params}"
                else:
                    final_url = base_url
                ad_group_ad.ad.final_urls.append(final_url)
                
                try:
                    ad_response = ad_service.mutate_ad_group_ads(
                        customer_id=str(customer_id),
                        operations=[ad_op],
                    )
                    ag_result["ads"].append({
                        "type": "RSA",
                        "headlines": len(headlines[:15]),
                        "descriptions": len(descriptions[:4]),
                        "resourceName": ad_response.results[0].resource_name,
                    })
                except Exception as e:
                    results["errors"].append(f"RSA creation failed for {ag_data['name']}: {e}")
            
            results["adGroups"].append(ag_result)
            
        except Exception as e:
            results["errors"].append(f"Ad group '{ag_data['name']}' failed: {e}")
    
    return results

def main():
    # Read plan from stdin
    plan = json.load(sys.stdin)
    
    # Validate before doing anything
    valid, errors = validate_plan(plan)
    if not valid:
        print(json.dumps({
            "error": "Pre-flight validation failed",
            "validationErrors": errors,
            "campaignId": None,
            "adGroups": [],
        }))
        sys.exit(1)
    
    customer_id = plan.get("customerId", "2356650573")
    
    creds = load_credentials()
    client = get_client(creds)
    
    results = create_campaign(client, customer_id, plan)
    
    # Summary
    results["summary"] = {
        "campaignCreated": results["campaignId"] is not None,
        "adGroupsCreated": len(results["adGroups"]),
        "totalKeywords": sum(len(ag.get("keywords", [])) for ag in results["adGroups"]),
        "totalAds": sum(len(ag.get("ads", [])) for ag in results["adGroups"]),
        "errorsCount": len(results["errors"]),
    }
    
    print(json.dumps(results))

if __name__ == "__main__":
    main()
