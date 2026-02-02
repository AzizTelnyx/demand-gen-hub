#!/usr/bin/env python3
"""
Sync campaigns from Google Ads and StackAdapt to Supabase.
Run this script periodically to keep the database up to date.
"""

import os
import json
import sys
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

# Add parent path for imports
sys.path.insert(0, os.path.expanduser("~/.venv/lib/python3.12/site-packages"))

from supabase import create_client, Client
from google.ads.googleads.client import GoogleAdsClient
import requests

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://wzeaqdqczzuzpbpnghgw.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
GOOGLE_ADS_CUSTOMER_ID = "235-665-0573".replace("-", "")
STACKADAPT_API_URL = "https://api.stackadapt.com/graphql"

def now_iso():
    """Get current time in ISO format."""
    return datetime.now(timezone.utc).isoformat()

def get_supabase() -> Client:
    """Get Supabase client."""
    if not SUPABASE_KEY:
        raise ValueError("SUPABASE_SERVICE_ROLE_KEY not set")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def sync_google_ads(supabase: Client):
    """Sync campaigns from Google Ads."""
    print("Syncing Google Ads campaigns...")
    
    try:
        # Initialize Google Ads client
        client = GoogleAdsClient.load_from_storage(
            os.path.expanduser("~/.config/google-ads/google-ads.yaml")
        )
        
        ga_service = client.get_service("GoogleAdsService")
        
        # Query campaigns with metrics (using correct field names)
        query = """
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                campaign_budget.amount_micros,
                metrics.cost_micros,
                metrics.impressions,
                metrics.clicks,
                metrics.conversions
            FROM campaign
            WHERE campaign.status != 'REMOVED'
            AND segments.date DURING LAST_30_DAYS
        """
        
        response = ga_service.search(customer_id=GOOGLE_ADS_CUSTOMER_ID, query=query)
        
        campaigns_data = {}
        for row in response:
            campaign_id = str(row.campaign.id)
            if campaign_id not in campaigns_data:
                # Map channel type
                channel_type = row.campaign.advertising_channel_type.name.lower()
                channel = "search" if channel_type == "search" else "display"
                
                campaigns_data[campaign_id] = {
                    "name": row.campaign.name,
                    "platform": "google_ads",
                    "platformId": campaign_id,
                    "status": row.campaign.status.name.lower(),
                    "budget": row.campaign_budget.amount_micros / 1_000_000 if row.campaign_budget.amount_micros else None,
                    "spend": 0,
                    "impressions": 0,
                    "clicks": 0,
                    "conversions": 0,
                    "channel": channel,
                    "lastSyncedAt": now_iso(),
                    "updatedAt": now_iso(),
                }
            
            # Aggregate metrics
            campaigns_data[campaign_id]["spend"] += row.metrics.cost_micros / 1_000_000
            campaigns_data[campaign_id]["impressions"] += row.metrics.impressions
            campaigns_data[campaign_id]["clicks"] += row.metrics.clicks
            campaigns_data[campaign_id]["conversions"] += int(row.metrics.conversions or 0)
        
        # Upsert to Supabase
        for campaign_id, data in campaigns_data.items():
            # Check if exists
            existing = supabase.table("Campaign").select("id").eq("platformId", campaign_id).eq("platform", "google_ads").execute()
            
            if existing.data:
                # Update
                supabase.table("Campaign").update(data).eq("id", existing.data[0]["id"]).execute()
            else:
                # Insert with new ID
                data["id"] = f"ga_{campaign_id}"
                data["createdAt"] = now_iso()
                supabase.table("Campaign").insert(data).execute()
        
        # Update sync state
        supabase.table("SyncState").upsert({
            "id": "google_ads",
            "platform": "google_ads",
            "lastSyncedAt": now_iso(),
            "status": "idle",
            "error": None,
            "updatedAt": now_iso(),
        }, on_conflict="id").execute()
        
        print(f"  Synced {len(campaigns_data)} Google Ads campaigns")
        
        # Log activity
        supabase.table("Activity").insert({
            "id": str(uuid.uuid4()),
            "actor": "agent",
            "action": "synced",
            "entityType": "campaigns",
            "entityName": "Google Ads",
            "details": json.dumps({"count": len(campaigns_data)}),
            "timestamp": now_iso(),
        }).execute()
        
    except Exception as e:
        print(f"  Error syncing Google Ads: {e}")
        try:
            supabase.table("SyncState").upsert({
                "id": "google_ads",
                "platform": "google_ads",
                "status": "error",
                "error": str(e)[:500],
                "updatedAt": now_iso(),
            }, on_conflict="id").execute()
        except Exception as e2:
            print(f"  Error updating sync state: {e2}")

def sync_stackadapt(supabase: Client):
    """Sync campaigns from StackAdapt with delivery metrics."""
    print("Syncing StackAdapt campaigns...")
    
    try:
        # Load credentials
        creds_path = os.path.expanduser("~/.config/stackadapt/credentials.json")
        with open(creds_path) as f:
            creds = json.load(f)
        
        # Get GraphQL token
        graphql_config = creds.get("graphql", {})
        api_token = graphql_config.get("token")
        if not api_token:
            raise ValueError("StackAdapt GraphQL token not found")
        
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }
        
        # Step 1: Get campaign list
        campaigns_query = """
        query {
            campaigns(first: 100, filterBy: { advertiserIds: [93053], archived: false }) {
                edges {
                    node {
                        id
                        name
                        channelType
                        isArchived
                        isDraft
                        currentFlight {
                            startTime
                            endTime
                        }
                    }
                }
            }
        }
        """
        
        response = requests.post(
            STACKADAPT_API_URL,
            headers=headers,
            json={"query": campaigns_query},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        
        campaigns = data.get("data", {}).get("campaigns", {}).get("edges", [])
        
        # Step 2: Get delivery metrics for all campaigns
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        year_ago = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%d")
        
        metrics_query = """
        query {
            campaignDelivery(
                filterBy: { advertiserIds: [93053] }
                date: { from: "%s", to: "%s" }
                granularity: TOTAL
                dataType: TABLE
            ) {
                ... on CampaignDeliveryOutcome {
                    records {
                        nodes {
                            campaign {
                                id
                            }
                            metrics {
                                impressionsBigint
                                clicksBigint
                                cost
                                ctr
                            }
                        }
                    }
                }
            }
        }
        """ % (year_ago, today)
        
        metrics_response = requests.post(
            STACKADAPT_API_URL,
            headers=headers,
            json={"query": metrics_query},
            timeout=60
        )
        metrics_response.raise_for_status()
        metrics_data = metrics_response.json()
        
        # Build metrics lookup
        metrics_by_id = {}
        nodes = metrics_data.get("data", {}).get("campaignDelivery", {}).get("records", {}).get("nodes", [])
        for node in nodes:
            campaign_id = str(node["campaign"]["id"])
            metrics_by_id[campaign_id] = {
                "impressions": int(node["metrics"].get("impressionsBigint", 0) or 0),
                "clicks": int(node["metrics"].get("clicksBigint", 0) or 0),
                "spend": float(node["metrics"].get("cost", 0) or 0),
                "ctr": float(node["metrics"].get("ctr", 0) or 0),
            }
        
        synced_count = 0
        for edge in campaigns:
            node = edge["node"]
            campaign_id = str(node["id"])
            
            # Skip drafts
            if node.get("isDraft"):
                continue
            
            # Map channel type
            channel_type = node.get("channelType", "").lower()
            channel = "display" if channel_type == "display" else \
                      "native" if channel_type == "native" else \
                      "video" if channel_type == "video" else \
                      "dooh" if channel_type == "dooh" else channel_type
            
            # Get flight info
            flight = node.get("currentFlight") or {}
            
            # Get metrics
            metrics = metrics_by_id.get(campaign_id, {})
            
            campaign_data = {
                "name": node["name"],
                "platform": "stackadapt",
                "platformId": campaign_id,
                "status": "live" if not node.get("isArchived") else "ended",
                "spend": metrics.get("spend"),
                "impressions": metrics.get("impressions"),
                "clicks": metrics.get("clicks"),
                "startDate": flight.get("startTime"),
                "endDate": flight.get("endTime"),
                "channel": channel,
                "lastSyncedAt": now_iso(),
                "updatedAt": now_iso(),
            }
            
            # Check if exists
            existing = supabase.table("Campaign").select("id").eq("platformId", campaign_id).eq("platform", "stackadapt").execute()
            
            if existing.data:
                supabase.table("Campaign").update(campaign_data).eq("id", existing.data[0]["id"]).execute()
            else:
                campaign_data["id"] = f"sa_{campaign_id}"
                campaign_data["createdAt"] = now_iso()
                supabase.table("Campaign").insert(campaign_data).execute()
            
            synced_count += 1
        
        # Update sync state
        supabase.table("SyncState").upsert({
            "id": "stackadapt",
            "platform": "stackadapt",
            "lastSyncedAt": now_iso(),
            "status": "idle",
            "error": None,
            "updatedAt": now_iso(),
        }, on_conflict="id").execute()
        
        print(f"  Synced {synced_count} StackAdapt campaigns with metrics")
        
        # Log activity
        supabase.table("Activity").insert({
            "id": str(uuid.uuid4()),
            "actor": "agent",
            "action": "synced",
            "entityType": "campaigns",
            "entityName": "StackAdapt",
            "details": json.dumps({"count": synced_count, "with_metrics": len(metrics_by_id)}),
            "timestamp": now_iso(),
        }).execute()
        
    except Exception as e:
        print(f"  Error syncing StackAdapt: {e}")
        import traceback
        traceback.print_exc()
        try:
            supabase.table("SyncState").upsert({
                "id": "stackadapt",
                "platform": "stackadapt",
                "status": "error",
                "error": str(e)[:500],
                "updatedAt": now_iso(),
            }, on_conflict="id").execute()
        except Exception as e2:
            print(f"  Error updating sync state: {e2}")

def main():
    """Main sync function."""
    print(f"Starting campaign sync at {now_iso()}")
    
    supabase = get_supabase()
    
    sync_google_ads(supabase)
    sync_stackadapt(supabase)
    
    print("Sync complete!")

if __name__ == "__main__":
    main()
