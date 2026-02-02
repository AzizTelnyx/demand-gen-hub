#!/usr/bin/env python3
"""
Sync campaigns from Google Ads and StackAdapt to Supabase.
Run this script periodically to keep the database up to date.
"""

import os
import json
import sys
import uuid
from datetime import datetime, timezone
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
    """Sync campaigns from StackAdapt."""
    print("Syncing StackAdapt campaigns...")
    
    try:
        # Load credentials
        creds_path = os.path.expanduser("~/.config/stackadapt/credentials.json")
        with open(creds_path) as f:
            creds = json.load(f)
        
        # Get GraphQL token or REST API key
        graphql_config = creds.get("graphql", {})
        api_token = graphql_config.get("token") or creds.get("rest_api_key")
        if not api_token:
            raise ValueError("StackAdapt API token not found")
        
        headers = {
            "X-Authorization": api_token,
            "Content-Type": "application/json",
        }
        
        # Query campaigns
        query = """
        query {
            campaigns(advertiserId: 93053, first: 100) {
                edges {
                    node {
                        id
                        name
                        state
                        budget
                        startDate
                        endDate
                        pacing {
                            spent
                        }
                        stats {
                            impressions
                            clicks
                            conversions
                        }
                    }
                }
            }
        }
        """
        
        response = requests.post(
            STACKADAPT_API_URL,
            headers=headers,
            json={"query": query},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        
        campaigns = data.get("data", {}).get("campaigns", {}).get("edges", [])
        
        for edge in campaigns:
            node = edge["node"]
            campaign_id = str(node["id"])
            
            campaign_data = {
                "name": node["name"],
                "platform": "stackadapt",
                "platformId": campaign_id,
                "status": node["state"].lower() if node["state"] else "unknown",
                "budget": float(node["budget"]) if node.get("budget") else None,
                "spend": float(node.get("pacing", {}).get("spent", 0) or 0),
                "impressions": int(node.get("stats", {}).get("impressions", 0) or 0),
                "clicks": int(node.get("stats", {}).get("clicks", 0) or 0),
                "conversions": int(node.get("stats", {}).get("conversions", 0) or 0),
                "startDate": node.get("startDate"),
                "endDate": node.get("endDate"),
                "channel": "display",
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
        
        # Update sync state
        supabase.table("SyncState").upsert({
            "id": "stackadapt",
            "platform": "stackadapt",
            "lastSyncedAt": now_iso(),
            "status": "idle",
            "error": None,
            "updatedAt": now_iso(),
        }, on_conflict="id").execute()
        
        print(f"  Synced {len(campaigns)} StackAdapt campaigns")
        
        # Log activity
        supabase.table("Activity").insert({
            "id": str(uuid.uuid4()),
            "actor": "agent",
            "action": "synced",
            "entityType": "campaigns",
            "entityName": "StackAdapt",
            "details": json.dumps({"count": len(campaigns)}),
            "timestamp": now_iso(),
        }).execute()
        
    except Exception as e:
        print(f"  Error syncing StackAdapt: {e}")
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
