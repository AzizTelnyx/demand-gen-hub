#!/usr/bin/env python3
"""Pause specific campaigns on Google Ads."""

import json, os
from google.ads.googleads.client import GoogleAdsClient

CUSTOMER_ID = "2356650573"
CAMPAIGNS_TO_PAUSE = [
    {"id": "8621418708", "name": "2019_G2 Display"},
    {"id": "10838788251", "name": "SMS Landing Page Test #1"},
]

def get_client():
    yaml_path = os.path.expanduser("~/.config/google-ads/google-ads.yaml")
    if os.path.exists(yaml_path):
        return GoogleAdsClient.load_from_storage(yaml_path)
    creds_path = os.path.expanduser("~/.config/google-ads/credentials.json")
    with open(creds_path) as f:
        creds = json.load(f)
    return GoogleAdsClient.load_from_dict({
        "developer_token": creds.get("developer_token"),
        "client_id": creds.get("client_id"),
        "client_secret": creds.get("client_secret"),
        "refresh_token": creds.get("refresh_token"),
        "login_customer_id": creds.get("login_customer_id", CUSTOMER_ID),
        "use_proto_plus": True,
    })

def main():
    client = get_client()
    campaign_service = client.get_service("CampaignService")

    from google.protobuf import field_mask_pb2

    operations = []
    for c in CAMPAIGNS_TO_PAUSE:
        operation = client.get_type("CampaignOperation")
        campaign = operation.update
        campaign.resource_name = campaign_service.campaign_path(CUSTOMER_ID, c["id"])
        campaign.status = client.enums.CampaignStatusEnum.PAUSED
        operation.update_mask = field_mask_pb2.FieldMask(paths=["status"])
        operations.append(operation)
        print(f"  Pausing: {c['name']} ({c['id']})")

    response = campaign_service.mutate_campaigns(customer_id=CUSTOMER_ID, operations=operations)
    for result in response.results:
        print(f"  ✅ Paused: {result.resource_name}")

if __name__ == "__main__":
    main()
