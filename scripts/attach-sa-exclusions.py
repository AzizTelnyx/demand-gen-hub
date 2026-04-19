#!/usr/bin/env python3
"""
Attach ABM Exclusion audiences to active StackAdapt campaigns.
AI Agent exclusion (2502391) → 11 AI Agent campaigns
IoT SIM exclusion (2502392) → 2 IoT SIM campaigns

Usage: python3 scripts/attach-sa-exclusions.py [--dry-run]
"""

import json
import os
import sys
import urllib.request
import urllib.error
import time
import argparse

CREDENTIALS_PATH = os.path.expanduser("~/.config/stackadapt/credentials.json")
SA_GRAPHQL_URL = "https://api.stackadapt.com/graphql"

# Exclusion audience SA IDs
EXCLUSION_AUDIENCES = {
    "AI Agent": 2502391,
    "IoT SIM": 2502392,
}

# Active SA campaigns (platformId) from DB
CAMPAIGNS = {
    "AI Agent": [
        3116860,  # 202501 TOFU AI Agent Fintech NA GLOBAL
        2882131,  # 202510 TOFU AI Agent DA GLOBAL
        2903819,  # 202510 TOFU AI Agent Healthcare DA GLOBAL
        2903846,  # 202510 TOFU AI Agent Healthcare NA GLOBAL
        2925035,  # 202510 UPSELL AI Agent DA GLOBAL
        2978014,  # 202511 MOFU AI Agent DA GLOBAL
        2983357,  # 202511 MOFU AI Agent NA GLOBAL
        2978199,  # 202511 TOFU AI Agent NA GLOBAL
        2991872,  # 202511 UPSELL AI Agent NA GLOBAL
        3105131,  # 202601 TOFU AI Agent Sabre NA GLOBAL
        3105136,  # 202601 TOFU AI Agent Travel NA GLOBAL
    ],
    "IoT SIM": [
        3125909,  # 202501 TOFU IOT SIM DA APAC
        3125891,  # 202601 TOFU IOT SIM APAC NA
    ],
}


def get_token():
    with open(CREDENTIALS_PATH) as f:
        creds = json.load(f)
    return creds["graphql"]["token"]


def sa_request(token, query, variables=None):
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        SA_GRAPHQL_URL,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    resp = urllib.request.urlopen(req, timeout=30)
    return json.loads(resp.read())


def get_campaign_audience(token, campaign_id):
    """Get current customSegmentIds and customSegmentExclusionIds for a campaign."""
    query = """
    query ($id: ID!) {
      campaigns(filterBy: {ids: [$id]}, first: 1) {
        nodes {
          id
          name
          __typename
          ... on DisplayCampaign {
            campaignGroup { id }
            audience {
              customSegments { nodes { id name } }
              customSegmentExclusions { nodes { id name } }
            }
          }
          ... on NativeCampaign {
            campaignGroup { id }
            audience {
              customSegments { nodes { id name } }
              customSegmentExclusions { nodes { id name } }
            }
          }
          ... on VideoCampaign {
            campaignGroup { id }
            audience {
              customSegments { nodes { id name } }
              customSegmentExclusions { nodes { id name } }
            }
          }
          ... on CtvCampaign {
            campaignGroup { id }
            audience {
              customSegments { nodes { id name } }
              customSegmentExclusions { nodes { id name } }
            }
          }
        }
      }
    }
    """
    result = sa_request(token, query, {"id": str(campaign_id)})
    if result.get("errors"):
        return None, f"GraphQL error: {result['errors'][0]['message']}"
    
    nodes = result.get("data", {}).get("campaigns", {}).get("nodes", [])
    if not nodes:
        return None, "Campaign not found"
    
    campaign = nodes[0]
    audience = campaign.get("audience", {})
    
    segment_ids = [int(n["id"]) for n in audience.get("customSegments", {}).get("nodes", [])]
    exclusion_ids = [int(n["id"]) for n in audience.get("customSegmentExclusions", {}).get("nodes", [])]
    campaign_group_id = campaign.get("campaignGroup", {}).get("id")
    typename = campaign.get("__typename")
    
    return {
        "id": campaign["id"],
        "name": campaign["name"],
        "typename": typename,
        "campaignGroupId": campaign_group_id,
        "customSegmentIds": segment_ids,
        "customSegmentExclusionIds": exclusion_ids,
    }, None


def upsert_campaign_audience(token, campaign, new_exclusion_ids):
    """Upsert campaign with updated exclusion audience list."""
    typename = campaign["typename"]
    # Map typename to CampaignInput subtype key
    subtype_key_map = {
        "DisplayCampaign": "display",
        "NativeCampaign": "native",
        "VideoCampaign": "video",
        "CtvCampaign": "ctv",
        "AudioCampaign": "audio",
        "DoohCampaign": "dooh",
    }
    subtype_key = subtype_key_map.get(typename)
    if not subtype_key:
        return False, f"Unsupported campaign type: {typename}"
    
    mutation = """
    mutation ($input: CampaignInput!) {
      upsertCampaign(input: $input) {
        campaign { id name }
        userErrors { message path }
        clientMutationId
      }
    }
    """
    
    all_exclusion_ids = list(set(campaign["customSegmentExclusionIds"] + new_exclusion_ids))
    
    subtype_input = {
        "id": campaign["id"],
        "campaignGroupId": campaign["campaignGroupId"],
        "audience": {
            "customSegmentIds": campaign["customSegmentIds"],
            "customSegmentExclusionIds": all_exclusion_ids,
        },
    }
    
    variables = {
        "input": {
            subtype_key: subtype_input,
        }
    }
    
    result = sa_request(token, mutation, variables)
    
    if result.get("errors"):
        return False, f"Mutation error: {result['errors'][0]['message']}"
    
    user_errors = result.get("data", {}).get("upsertCampaign", {}).get("userErrors", [])
    if user_errors:
        return False, f"User errors: {user_errors}"
    
    return True, None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without executing")
    parser.add_argument("--product", choices=["AI Agent", "IoT SIM", "all"], default="all", help="Which product exclusions to attach")
    args = parser.parse_args()
    
    token = get_token()
    products = list(EXCLUSION_AUDIENCES.keys()) if args.product == "all" else [args.product]
    
    total = 0
    success = 0
    skipped = 0
    failed = 0
    
    for product in products:
        exclusion_id = EXCLUSION_AUDIENCES[product]
        campaign_ids = CAMPAIGNS[product]
        
        print(f"\n{'[DRY-RUN] ' if args.dry_run else ''}📋 {product}: Attaching exclusion audience {exclusion_id} to {len(campaign_ids)} campaigns")
        
        for cid in campaign_ids:
            total += 1
            # Get current audience
            campaign, err = get_campaign_audience(token, cid)
            if err:
                print(f"  ❌ {cid}: Failed to fetch — {err}")
                failed += 1
                continue
            
            # Check if exclusion already attached
            if exclusion_id in campaign["customSegmentExclusionIds"]:
                print(f"  ⏭️  {cid} ({campaign['name'][:40]}): Already has exclusion {exclusion_id}")
                skipped += 1
                continue
            
            new_exclusions = campaign["customSegmentExclusionIds"] + [exclusion_id]
            print(f"  {'[DRY-RUN] ' if args.dry_run else ''}📎 {cid} ({campaign['name'][:40]}): Adding exclusion {exclusion_id} (existing: {campaign['customSegmentExclusionIds']})")
            
            if args.dry_run:
                success += 1
                continue
            
            # Execute upsert
            ok, err = upsert_campaign_audience(token, campaign, [exclusion_id])
            if ok:
                print(f"  ✅ {cid}: Exclusion audience attached")
                success += 1
            else:
                print(f"  ❌ {cid}: Upsert failed — {err}")
                failed += 1
            
            # Rate limit: 150ms between requests
            time.sleep(0.2)
    
    print(f"\n{'[DRY-RUN] ' if args.dry_run else ''}📊 Results: {success} attached, {skipped} skipped (already), {failed} failed, {total} total")


if __name__ == "__main__":
    main()
