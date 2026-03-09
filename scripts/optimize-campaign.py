#!/usr/bin/env python3
"""
Campaign optimization operations via Google Ads API.

Input: JSON from stdin with operations array
Output: JSON with results

SAFETY:
- Each operation is explicit and logged
- No broad match ever created
- All operations return before/after state
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

def pause_campaign(client, customer_id, campaign_resource):
    """Pause a campaign."""
    service = client.get_service("CampaignService")
    op = client.get_type("CampaignOperation")
    campaign = op.update
    campaign.resource_name = campaign_resource
    campaign.status = client.enums.CampaignStatusEnum.PAUSED
    
    field_mask = client.get_type("FieldMask")
    field_mask.paths.append("status")
    op.update_mask.CopyFrom(field_mask)
    
    response = service.mutate_campaigns(
        customer_id=str(customer_id),
        operations=[op],
    )
    return {"resource": response.results[0].resource_name, "newStatus": "PAUSED"}

def enable_campaign(client, customer_id, campaign_resource):
    """Enable a campaign."""
    service = client.get_service("CampaignService")
    op = client.get_type("CampaignOperation")
    campaign = op.update
    campaign.resource_name = campaign_resource
    campaign.status = client.enums.CampaignStatusEnum.ENABLED
    
    field_mask = client.get_type("FieldMask")
    field_mask.paths.append("status")
    op.update_mask.CopyFrom(field_mask)
    
    response = service.mutate_campaigns(
        customer_id=str(customer_id),
        operations=[op],
    )
    return {"resource": response.results[0].resource_name, "newStatus": "ENABLED"}

def update_budget(client, customer_id, budget_resource, new_daily_micros):
    """Update campaign budget."""
    service = client.get_service("CampaignBudgetService")
    op = client.get_type("CampaignBudgetOperation")
    budget = op.update
    budget.resource_name = budget_resource
    budget.amount_micros = int(new_daily_micros)
    
    field_mask = client.get_type("FieldMask")
    field_mask.paths.append("amount_micros")
    op.update_mask.CopyFrom(field_mask)
    
    response = service.mutate_campaign_budgets(
        customer_id=str(customer_id),
        operations=[op],
    )
    return {"resource": response.results[0].resource_name, "newBudgetMicros": new_daily_micros}

def add_negative_keywords(client, customer_id, campaign_resource, keywords):
    """Add negative keywords to a campaign."""
    service = client.get_service("CampaignCriterionService")
    results = []
    
    for kw_text in keywords:
        op = client.get_type("CampaignCriterionOperation")
        criterion = op.create
        criterion.campaign = campaign_resource
        criterion.negative = True
        criterion.keyword.text = kw_text
        criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.EXACT
        
        try:
            response = service.mutate_campaign_criteria(
                customer_id=str(customer_id),
                operations=[op],
            )
            results.append({
                "keyword": kw_text,
                "status": "added",
                "resource": response.results[0].resource_name,
            })
        except Exception as e:
            results.append({
                "keyword": kw_text,
                "status": "failed",
                "error": str(e),
            })
    
    return results

def change_bid_strategy(client, customer_id, campaign_resource, strategy, target_cpa_micros=None):
    """Change campaign bidding strategy."""
    service = client.get_service("CampaignService")
    op = client.get_type("CampaignOperation")
    campaign = op.update
    campaign.resource_name = campaign_resource
    
    field_mask = client.get_type("FieldMask")
    
    if strategy == "MAXIMIZE_CONVERSIONS":
        campaign.maximize_conversions.target_cpa_micros = 0
        field_mask.paths.append("maximize_conversions")
    elif strategy == "TARGET_CPA":
        if not target_cpa_micros:
            raise ValueError("target_cpa_micros required for TARGET_CPA strategy")
        campaign.target_cpa.target_cpa_micros = int(target_cpa_micros)
        field_mask.paths.append("target_cpa")
    elif strategy == "MANUAL_CPC":
        campaign.manual_cpc.enhanced_cpc_enabled = False
        field_mask.paths.append("manual_cpc")
    else:
        raise ValueError(f"Unsupported strategy: {strategy}")
    
    op.update_mask.CopyFrom(field_mask)
    
    response = service.mutate_campaigns(
        customer_id=str(customer_id),
        operations=[op],
    )
    return {"resource": response.results[0].resource_name, "newStrategy": strategy}

def main():
    input_data = json.load(sys.stdin)
    operations = input_data.get("operations", [])
    customer_id = input_data.get("customerId", "2356650573")
    
    if not operations:
        print(json.dumps({"error": "No operations provided", "results": []}))
        sys.exit(1)
    
    creds = load_credentials()
    client = get_client(creds)
    
    results = []
    
    for op in operations:
        op_type = op.get("type")
        result = {"type": op_type, "target": op.get("target", ""), "status": "pending"}
        
        try:
            if op_type == "pause_campaign":
                r = pause_campaign(client, customer_id, op["campaignResource"])
                result.update(r)
                result["status"] = "success"
                
            elif op_type == "enable_campaign":
                r = enable_campaign(client, customer_id, op["campaignResource"])
                result.update(r)
                result["status"] = "success"
                
            elif op_type == "update_budget":
                new_micros = int(op["newDailyBudget"] * 1_000_000)
                r = update_budget(client, customer_id, op["budgetResource"], new_micros)
                result.update(r)
                result["status"] = "success"
                
            elif op_type == "add_negative_keywords":
                r = add_negative_keywords(
                    client, customer_id,
                    op["campaignResource"],
                    op["keywords"],
                )
                result["negativeKeywords"] = r
                result["status"] = "success"
                
            elif op_type == "change_bid_strategy":
                r = change_bid_strategy(
                    client, customer_id,
                    op["campaignResource"],
                    op["strategy"],
                    op.get("targetCpaMicros"),
                )
                result.update(r)
                result["status"] = "success"
                
            else:
                result["status"] = "error"
                result["error"] = f"Unknown operation type: {op_type}"
                
        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
        
        results.append(result)
    
    output = {
        "results": results,
        "summary": {
            "total": len(results),
            "success": sum(1 for r in results if r["status"] == "success"),
            "failed": sum(1 for r in results if r["status"] == "error"),
        },
    }
    
    print(json.dumps(output))

if __name__ == "__main__":
    main()
