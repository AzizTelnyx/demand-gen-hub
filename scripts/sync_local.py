#!/usr/bin/env python3
"""
Sync campaigns from Google Ads and StackAdapt to local Postgres via the hub API.
"""

import os
import json
import sys
import subprocess
from datetime import datetime, timezone, timedelta

# Use the local venv
VENV_SITE = os.path.expanduser("~/.venv/lib")
for d in os.listdir(VENV_SITE):
    sp = os.path.join(VENV_SITE, d, "site-packages")
    if os.path.isdir(sp):
        sys.path.insert(0, sp)

import psycopg2
import requests as http_requests

# Local DB connection
DB_URL = "postgresql://azizalsinafi@localhost:5432/dghub"
GOOGLE_ADS_CUSTOMER_ID = "2356650573"

def get_db():
    return psycopg2.connect(DB_URL)

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def upsert_campaign(conn, data):
    """Upsert a campaign by platformId + platform."""
    cur = conn.cursor()
    cur.execute(
        'SELECT id FROM "Campaign" WHERE "platformId" = %s AND platform = %s',
        (data["platformId"], data["platform"])
    )
    existing = cur.fetchone()
    
    if existing:
        # Skip excluded campaigns — don't overwrite manual exclusions
        cur.execute('SELECT status FROM "Campaign" WHERE id = %s', (existing[0],))
        current_status = cur.fetchone()
        if current_status and current_status[0] == 'excluded':
            conn.commit()
            return
        cur.execute('''
            UPDATE "Campaign" SET 
                name = %s, status = %s, "servingStatus" = %s, budget = %s, spend = %s,
                impressions = %s, clicks = %s, conversions = %s,
                channel = %s, "startDate" = COALESCE(%s::timestamp, "startDate"),
                "endDate" = COALESCE(%s::timestamp, "endDate"),
                metadata = COALESCE(%s, metadata),
                "lastSyncedAt" = NOW(), "updatedAt" = NOW()
            WHERE id = %s
        ''', (
            data["name"], data["status"], data.get("servingStatus"), data.get("budget"), data.get("spend"),
            data.get("impressions"), data.get("clicks"), data.get("conversions"),
            data.get("channel"), data.get("startDate"), data.get("endDate"),
            data.get("metadata"), existing[0]
        ))
    else:
        import uuid
        cid = str(uuid.uuid4())[:25]
        cur.execute('''
            INSERT INTO "Campaign" (id, name, platform, "platformId", status, "servingStatus", budget, spend,
                impressions, clicks, conversions, channel, "startDate", "endDate",
                metadata, "lastSyncedAt", "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::timestamp, %s::timestamp, %s, NOW(), NOW(), NOW())
        ''', (
            cid, data["name"], data["platform"], data["platformId"],
            data["status"], data.get("servingStatus"), data.get("budget"), data.get("spend"),
            data.get("impressions"), data.get("clicks"), data.get("conversions"),
            data.get("channel"), data.get("startDate"), data.get("endDate"),
            data.get("metadata")
        ))
    conn.commit()

def upsert_sync_state(conn, platform, status, error=None):
    cur = conn.cursor()
    cur.execute('SELECT id FROM "SyncState" WHERE platform = %s', (platform,))
    existing = cur.fetchone()
    if existing:
        cur.execute('''
            UPDATE "SyncState" SET "lastSyncedAt" = NOW(), status = %s, error = %s, "updatedAt" = NOW()
            WHERE id = %s
        ''', (status, error, existing[0]))
    else:
        import uuid
        cur.execute('''
            INSERT INTO "SyncState" (id, platform, "lastSyncedAt", status, error, "updatedAt")
            VALUES (%s, %s, NOW(), %s, %s, NOW())
        ''', (str(uuid.uuid4())[:25], platform, status, error))
    conn.commit()

def log_activity(conn, action, entity_type, entity_name, details=None):
    import uuid
    cur = conn.cursor()
    cur.execute('''
        INSERT INTO "Activity" (id, timestamp, actor, action, "entityType", "entityName", details)
        VALUES (%s, NOW(), %s, %s, %s, %s, %s)
    ''', (str(uuid.uuid4())[:25], "agent", action, entity_type, entity_name, json.dumps(details) if details else None))
    conn.commit()

def sync_google_ads(conn):
    """Sync campaigns from Google Ads."""
    print("Syncing Google Ads campaigns...")
    
    try:
        from google.ads.googleads.client import GoogleAdsClient
        
        # Try yaml config first, fall back to json
        yaml_path = os.path.expanduser("~/.config/google-ads/google-ads.yaml")
        json_path = os.path.expanduser("~/.config/google-ads/credentials.json")
        
        if os.path.exists(yaml_path):
            client = GoogleAdsClient.load_from_storage(yaml_path)
        elif os.path.exists(json_path):
            with open(json_path) as f:
                creds = json.load(f)
            client = GoogleAdsClient.load_from_dict({
                "developer_token": creds.get("developer_token"),
                "client_id": creds.get("client_id"),
                "client_secret": creds.get("client_secret"),
                "refresh_token": creds.get("refresh_token"),
                "login_customer_id": creds.get("login_customer_id", GOOGLE_ADS_CUSTOMER_ID),
            })
        else:
            print("  No Google Ads credentials found")
            return
        
        ga_service = client.get_service("GoogleAdsService")
        
        query = """
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.serving_status,
                campaign.advertising_channel_type,
                campaign.start_date_time,
                campaign.end_date_time,
                campaign_budget.amount_micros,
                metrics.cost_micros,
                metrics.impressions,
                metrics.clicks,
                metrics.all_conversions
            FROM campaign
            WHERE campaign.status != 'REMOVED'
            AND segments.date DURING LAST_30_DAYS
        """
        
        response = ga_service.search(customer_id=GOOGLE_ADS_CUSTOMER_ID, query=query)
        
        campaigns_data = {}
        for row in response:
            campaign_id = str(row.campaign.id)
            if campaign_id not in campaigns_data:
                channel_type = row.campaign.advertising_channel_type.name.lower()
                channel = "search" if channel_type == "search" else "display"
                
                # Parse start/end dates (format: YYYY-MM-DD)
                start_date = None
                end_date = None
                try:
                    if row.campaign.start_date_time and "1970" not in row.campaign.start_date_time:
                        start_date = row.campaign.start_date_time[:10]
                    if row.campaign.end_date_time and "2037" not in row.campaign.end_date_time:
                        end_date = row.campaign.end_date_time[:10]
                except:
                    pass
                
                campaigns_data[campaign_id] = {
                    "name": row.campaign.name,
                    "platform": "google_ads",
                    "platformId": campaign_id,
                    "status": row.campaign.status.name.lower(),
                    "servingStatus": row.campaign.serving_status.name.lower() if row.campaign.serving_status else None,
                    "budget": row.campaign_budget.amount_micros / 1_000_000 if row.campaign_budget.amount_micros else None,
                    "spend": 0,
                    "impressions": 0,
                    "clicks": 0,
                    "conversions": 0,
                    "channel": channel,
                    "startDate": start_date,
                    "endDate": end_date,
                }
            
            campaigns_data[campaign_id]["spend"] += row.metrics.cost_micros / 1_000_000
            campaigns_data[campaign_id]["impressions"] += row.metrics.impressions
            campaigns_data[campaign_id]["clicks"] += row.metrics.clicks
            campaigns_data[campaign_id]["conversions"] += int(row.metrics.all_conversions or 0)
        
        for data in campaigns_data.values():
            upsert_campaign(conn, data)
        
        upsert_sync_state(conn, "google_ads", "idle")
        log_activity(conn, "synced", "campaigns", "Google Ads", {"count": len(campaigns_data)})
        print(f"  Synced {len(campaigns_data)} Google Ads campaigns")
        
    except Exception as e:
        print(f"  Error syncing Google Ads: {e}")
        import traceback
        traceback.print_exc()
        upsert_sync_state(conn, "google_ads", "error", str(e)[:500])

def sync_stackadapt(conn):
    """Sync campaigns from StackAdapt."""
    print("Syncing StackAdapt campaigns...")
    
    try:
        creds_path = os.path.expanduser("~/.config/stackadapt/credentials.json")
        with open(creds_path) as f:
            creds = json.load(f)
        
        graphql_config = creds.get("graphql", {})
        api_token = graphql_config.get("token")
        if not api_token:
            print("  No StackAdapt GraphQL token found")
            return
        
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }
        
        campaigns_query = """
        query {
            campaigns(first: 100, filterBy: { advertiserIds: [93053], archived: false }) {
                edges {
                    node {
                        id
                        name
                        channelType
                        isDraft
                        campaignStatus { state status }
                        currentFlight {
                            startTime endTime grossLifetimeBudget grossDailyBudget
                        }
                    }
                }
            }
        }
        """
        
        response = http_requests.post(
            "https://api.stackadapt.com/graphql",
            headers=headers,
            json={"query": campaigns_query},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        
        campaigns = data.get("data", {}).get("campaigns", {}).get("edges", [])
        
        # Get metrics
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
        
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
                            campaign { id }
                            metrics { impressionsBigint clicksBigint cost ctr conversionsBigint }
                        }
                    }
                }
            }
        }
        """ % (thirty_days_ago, today)
        
        metrics_response = http_requests.post(
            "https://api.stackadapt.com/graphql",
            headers=headers,
            json={"query": metrics_query},
            timeout=60
        )
        metrics_response.raise_for_status()
        metrics_data = metrics_response.json()
        
        metrics_by_id = {}
        nodes = metrics_data.get("data", {}).get("campaignDelivery", {}).get("records", {}).get("nodes", [])
        for node in nodes:
            cid = str(node["campaign"]["id"])
            metrics_by_id[cid] = {
                "impressions": int(node["metrics"].get("impressionsBigint", 0) or 0),
                "clicks": int(node["metrics"].get("clicksBigint", 0) or 0),
                "spend": float(node["metrics"].get("cost", 0) or 0),
                "conversions": int(node["metrics"].get("conversionsBigint", 0) or 0),
            }
        
        synced = 0
        for edge in campaigns:
            node = edge["node"]
            if node.get("isDraft"):
                continue
            
            cid = str(node["id"])
            flight = node.get("currentFlight") or {}
            metrics = metrics_by_id.get(cid, {})
            
            state = (node.get("campaignStatus", {}).get("state", "")).upper()
            status = "live" if state == "LIVE" else "ended" if state == "ENDED" else "paused"
            
            budget = flight.get("grossLifetimeBudget")
            if not budget and flight.get("grossDailyBudget"):
                budget = flight["grossDailyBudget"] * 30
            
            # Parse start/end from currentFlight
            sa_start = None
            sa_end = None
            if flight.get("startTime"):
                try:
                    sa_start = flight["startTime"][:10]  # ISO string to YYYY-MM-DD
                except:
                    pass
            if flight.get("endTime"):
                try:
                    sa_end = flight["endTime"][:10]
                except:
                    pass
            
            upsert_campaign(conn, {
                "name": node["name"],
                "platform": "stackadapt",
                "platformId": cid,
                "status": status,
                "budget": budget,
                "spend": metrics.get("spend"),
                "impressions": metrics.get("impressions"),
                "clicks": metrics.get("clicks"),
                "conversions": metrics.get("conversions"),
                "channel": node.get("channelType", "display").lower(),
                "startDate": sa_start,
                "endDate": sa_end,
            })
            synced += 1
        
        upsert_sync_state(conn, "stackadapt", "idle")
        log_activity(conn, "synced", "campaigns", "StackAdapt", {"count": synced})
        print(f"  Synced {synced} StackAdapt campaigns")
        
    except Exception as e:
        print(f"  Error syncing StackAdapt: {e}")
        import traceback
        traceback.print_exc()
        upsert_sync_state(conn, "stackadapt", "error", str(e)[:500])

def sync_reddit(conn):
    """Sync campaigns from Reddit Ads."""
    print("Syncing Reddit campaigns...")

    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from platforms import get_connector

        reddit = get_connector("reddit")
        campaigns = reddit.fetch_campaigns(active_only=False)

        # Get metrics for last 30 days
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
        metrics_result = reddit.query_metrics(thirty_days_ago, today, active_only=False)
        metrics_by_id = {c.campaign_id: c for c in metrics_result.campaigns}

        synced = 0
        for c in campaigns:
            m = metrics_by_id.get(c.external_id)
            # Build metadata with targeting, objective, and conversion breakdown
            import json as _json
            metadata = {
                "objective": c.objective,
                "targeting_type": c.targeting_type,
                "targeting": c.extra.get("targeting", {}),
            }
            if m:
                metadata["leads"] = getattr(m, "leads", 0)
                metadata["signups"] = getattr(m, "signups", 0)
                metadata["page_visits"] = getattr(m, "page_visits", 0)
                metadata["key_conversions"] = getattr(m, "key_conversions", 0)
            upsert_campaign(conn, {
                "name": c.name,
                "platform": "reddit",
                "platformId": c.external_id,
                "status": c.status,
                "budget": c.budget,
                "spend": m.spend if m else None,
                "impressions": m.impressions if m else None,
                "clicks": m.clicks if m else None,
                "conversions": int(m.conversions) if m else None,
                "channel": "social",
                "startDate": c.start_date,
                "endDate": c.end_date,
                "metadata": _json.dumps(metadata),
            })
            synced += 1

        upsert_sync_state(conn, "reddit", "idle")
        log_activity(conn, "synced", "campaigns", "Reddit", {"count": synced})
        print(f"  Synced {synced} Reddit campaigns")

    except Exception as e:
        print(f"  Error syncing Reddit: {e}")
        import traceback
        traceback.print_exc()
        upsert_sync_state(conn, "reddit", "error", str(e)[:500])


def sync_parsed_fields(conn):
    """Re-parse all campaign names and update parsed fields."""
    print("Parsing campaign names...")
    try:
        from parse_campaign_names import parse_campaign_name
        cur = conn.cursor()
        cur.execute('SELECT id, name FROM "Campaign"')
        rows = cur.fetchall()
        for row_id, name in rows:
            parsed = parse_campaign_name(name)
            cur.execute('''
                UPDATE "Campaign" SET
                    "parsedDate" = %s, "parsedIntent" = %s, "parsedProduct" = %s,
                    "parsedVariant" = %s, "parsedAdType" = %s, "parsedRegion" = %s,
                    "parseConfidence" = %s
                WHERE id = %s
            ''', (
                parsed["date"], parsed["intent"], parsed["product"],
                parsed["variant"], parsed["adType"], parsed["region"],
                parsed["confidence"], row_id,
            ))
        conn.commit()
        print(f"  Parsed {len(rows)} campaign names")
    except Exception as e:
        print(f"  Error parsing campaign names: {e}")
        import traceback
        traceback.print_exc()


def sync_audiences(conn):
    """Sync audience/targeting data from all platforms."""
    try:
        from sync_audiences import sync_all_audiences
        sync_all_audiences(conn)
    except Exception as e:
        print(f"  Error syncing audiences: {e}")
        import traceback
        traceback.print_exc()


def main():
    print(f"Starting campaign sync at {now_iso()}")
    conn = get_db()
    sync_google_ads(conn)
    sync_stackadapt(conn)
    sync_reddit(conn)
    # Post-sync: parse names and sync audiences
    sync_parsed_fields(conn)
    sync_audiences(conn)
    conn.close()
    print("Sync complete!")

if __name__ == "__main__":
    main()
