#!/usr/bin/env python3
"""
Add geo targeting to a campaign and optionally update budget.
Usage: python add-geo-target.py --campaign-id 12345 --geo-id 2784 [--budget 25]
"""

import argparse
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

def add_geo_target(client, customer_id, campaign_id, geo_target_constant_id):
    """Add location targeting to campaign."""
    campaign_criterion_service = client.get_service("CampaignCriterionService")
    
    operation = client.get_type("CampaignCriterionOperation")
    criterion = operation.create
    criterion.campaign = f"customers/{customer_id}/campaigns/{campaign_id}"
    criterion.location.geo_target_constant = f"geoTargetConstants/{geo_target_constant_id}"
    
    response = campaign_criterion_service.mutate_campaign_criteria(
        customer_id=str(customer_id),
        operations=[operation],
    )
    return response.results[0].resource_name

def update_budget(client, customer_id, campaign_id, new_budget):
    """Update campaign budget."""
    from google.protobuf import field_mask_pb2
    
    ga_service = client.get_service("GoogleAdsService")
    
    # First get the budget resource name
    query = f'''
        SELECT campaign.campaign_budget
        FROM campaign
        WHERE campaign.id = {campaign_id}
    '''
    response = ga_service.search(customer_id=str(customer_id), query=query)
    budget_resource = None
    for row in response:
        budget_resource = row.campaign.campaign_budget
        break
    
    if not budget_resource:
        raise ValueError(f"Could not find budget for campaign {campaign_id}")
    
    # Update the budget
    budget_service = client.get_service("CampaignBudgetService")
    budget_op = client.get_type("CampaignBudgetOperation")
    budget = budget_op.update
    budget.resource_name = budget_resource
    budget.amount_micros = int(new_budget * 1_000_000)
    
    # Set the update mask
    budget_op.update_mask.CopyFrom(
        field_mask_pb2.FieldMask(paths=["amount_micros"])
    )
    
    response = budget_service.mutate_campaign_budgets(
        customer_id=str(customer_id),
        operations=[budget_op],
    )
    return response.results[0].resource_name

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", required=True, type=int)
    parser.add_argument("--geo-id", type=int, help="Geo target constant ID")
    parser.add_argument("--budget", type=float, help="New daily budget")
    parser.add_argument("--customer-id", default="2356650573")
    args = parser.parse_args()
    
    creds = load_credentials()
    client = get_client(creds)
    
    results = {"campaignId": args.campaign_id}
    
    if args.geo_id:
        geo_resource = add_geo_target(client, args.customer_id, args.campaign_id, args.geo_id)
        results["geoTarget"] = {"geoId": args.geo_id, "resourceName": geo_resource}
        print(f"Added geo target {args.geo_id} to campaign {args.campaign_id}")
    
    if args.budget:
        budget_resource = update_budget(client, args.customer_id, args.campaign_id, args.budget)
        results["budget"] = {"amount": args.budget, "resourceName": budget_resource}
        print(f"Updated budget to ${args.budget}/day for campaign {args.campaign_id}")
    
    print(json.dumps(results))

if __name__ == "__main__":
    main()
