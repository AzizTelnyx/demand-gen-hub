#!/usr/bin/env python3
"""Detect campaign changes across Google Ads, LinkedIn, and StackAdapt by comparing snapshots."""
import os
import json
import psycopg2
import requests
from datetime import datetime, timezone
from google.ads.googleads.client import GoogleAdsClient

DB_URL = "postgresql://azizalsinafi@localhost:5432/dghub"
GOOGLE_CUSTOMER_ID = "2356650573"
STATE_FILE = os.path.expanduser("~/.config/demand-gen-hub/campaign-state.json")

# ── Google Ads ──────────────────────────────────────────────────────

def get_google_campaigns():
    client = GoogleAdsClient.load_from_storage(
        os.path.expanduser("~/.config/google-ads/credentials.json")
    )
    ga_service = client.get_service("GoogleAdsService")
    query = """
        SELECT
            campaign.id, campaign.name, campaign.status,
            campaign.bidding_strategy_type, campaign_budget.amount_micros
        FROM campaign
        WHERE campaign.status != 'REMOVED'
    """
    campaigns = {}
    for row in ga_service.search(customer_id=GOOGLE_CUSTOMER_ID, query=query):
        cid = str(row.campaign.id)
        campaigns[cid] = {
            "name": row.campaign.name,
            "status": str(row.campaign.status).split(".")[-1],
            "bidStrategy": str(row.campaign.bidding_strategy_type).split(".")[-1],
            "budgetMicros": row.campaign_budget.amount_micros,
        }
    return campaigns

# ── LinkedIn ────────────────────────────────────────────────────────

def get_linkedin_campaigns():
    creds = json.load(open(os.path.expanduser("~/.config/linkedin-ads/credentials.json")))
    headers = {"Authorization": f"Bearer {creds['access_token']}"}
    acct = creds["ad_account_id"]
    
    campaigns = {}
    start = 0
    while True:
        r = requests.get(
            f"https://api.linkedin.com/v2/adCampaignsV2?q=search"
            f"&search.account.values[0]=urn:li:sponsoredAccount:{acct}"
            f"&count=100&start={start}",
            headers=headers
        )
        if r.status_code != 200:
            print(f"  LinkedIn API error: {r.status_code}")
            break
        data = r.json()
        for camp in data.get("elements", []):
            cid = str(camp["id"])
            budget = camp.get("dailyBudget", {}).get("amount", "0")
            campaigns[cid] = {
                "name": camp["name"],
                "status": camp.get("status", "UNKNOWN"),
                "budget": budget,
                "format": camp.get("format", ""),
                "objectiveType": camp.get("objectiveType", ""),
            }
        total = data.get("paging", {}).get("total", 0)
        start += 100
        if start >= total:
            break
    return campaigns

# ── StackAdapt ──────────────────────────────────────────────────────

def get_stackadapt_campaigns():
    creds = json.load(open(os.path.expanduser("~/.config/stackadapt/credentials.json")))
    gql_token = creds.get("graphql", {}).get("token", "")
    
    campaigns = {}
    cursor = None
    while True:
        after = f', after: "{cursor}"' if cursor else ""
        query = f"""{{
            campaigns(first: 100, filterBy: {{ advertiserIds: [93053] }}{after}) {{
                edges {{
                    node {{ id name channelType
                        campaignStatus {{ state status }}
                        currentFlight {{ startTime endTime grossLifetimeBudget grossDailyBudget budgetType bidAmount bidType }}
                    }}
                    cursor
                }}
                pageInfo {{ hasNextPage }}
            }}
        }}"""
        r = requests.post(
            "https://api.stackadapt.com/graphql",
            headers={"Authorization": f"Bearer {gql_token}", "Content-Type": "application/json"},
            json={"query": query}
        )
        data = r.json()
        if data.get("errors"):
            print(f"  StackAdapt error: {data['errors'][0]['message']}")
            break
        edges = data.get("data", {}).get("campaigns", {}).get("edges", [])
        for edge in edges:
            n = edge["node"]
            cid = str(n["id"])
            cs = n.get("campaignStatus", {})
            flight = n.get("currentFlight") or {}
            budget = flight.get("grossLifetimeBudget") or flight.get("grossDailyBudget") or ""
            campaigns[cid] = {
                "name": n["name"],
                "status": f"{cs.get('state','')}/{cs.get('status','')}",
                "budget": str(budget),
                "channelType": n.get("channelType", ""),
                "bidAmount": str(flight.get("bidAmount", "")),
            }
            cursor = edge.get("cursor")
        if not data.get("data", {}).get("campaigns", {}).get("pageInfo", {}).get("hasNextPage"):
            break
    return campaigns

# ── Reddit ───────────────────────────────────────────────────────────

def get_reddit_campaigns():
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from platforms import get_connector
    
    reddit = get_connector("reddit")
    camps = reddit.fetch_campaigns(active_only=False)
    campaigns = {}
    for c in camps:
        campaigns[c.external_id] = {
            "name": c.name,
            "status": c.status.upper(),
            "budget": str(c.budget or ""),
        }
    return campaigns

# ── Change Detection ────────────────────────────────────────────────

def detect_changes(platform, previous, current, tracked_fields):
    """Generic change detection for any platform."""
    changes = []
    now = datetime.now(timezone.utc).isoformat()
    
    for cid, curr in current.items():
        prev = previous.get(cid)
        if not prev:
            changes.append({
                "campaignName": curr["name"], "platform": platform,
                "changeType": "launch",
                "description": f"New campaign: {curr['name']}",
                "oldValue": None, "newValue": curr.get("status", ""),
                "source": f"{platform}-api", "actor": platform, "timestamp": now,
            })
            continue
        
        for field, label in tracked_fields.items():
            old_val = str(prev.get(field, ""))
            new_val = str(curr.get(field, ""))
            if old_val != new_val:
                # Determine change type
                change_type = field
                if field == "status":
                    if "PAUSED" in new_val or "paused" in new_val:
                        change_type = "pause"
                    elif "PAUSED" in old_val or "paused" in old_val:
                        change_type = "resume"
                elif field in ("budget", "budgetMicros"):
                    change_type = "budget"
                
                # Format budget values nicely
                desc_old, desc_new = old_val, new_val
                if field == "budgetMicros":
                    try:
                        desc_old = f"${int(old_val) / 1_000_000:.2f}"
                        desc_new = f"${int(new_val) / 1_000_000:.2f}"
                    except: pass
                elif field == "budget":
                    try:
                        desc_old = f"${float(old_val):,.2f}"
                        desc_new = f"${float(new_val):,.2f}"
                    except: pass
                
                changes.append({
                    "campaignName": curr["name"], "platform": platform,
                    "changeType": change_type,
                    "description": f"{label}: {desc_old} → {desc_new}",
                    "oldValue": old_val, "newValue": new_val,
                    "source": f"{platform}-api", "actor": platform, "timestamp": now,
                })
    
    # Removed campaigns
    for cid, prev in previous.items():
        if cid not in current:
            changes.append({
                "campaignName": prev["name"], "platform": platform,
                "changeType": "end",
                "description": "Campaign removed",
                "oldValue": prev.get("status", ""), "newValue": "REMOVED",
                "source": f"{platform}-api", "actor": platform, "timestamp": now,
            })
    
    return changes

# ── DB ──────────────────────────────────────────────────────────────

def save_changes_to_db(changes):
    if not changes:
        return 0
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    inserted = 0
    for c in changes:
        # Look up campaignId by name + platform
        cur.execute('SELECT id FROM "Campaign" WHERE name = %s AND platform = %s LIMIT 1',
                    (c["campaignName"], c["platform"]))
        row = cur.fetchone()
        if not row:
            print(f"  ⚠ Campaign not found in DB: {c['campaignName']} ({c['platform']})")
            continue
        campaign_id = row[0]
        # Map to actual CampaignChange schema: campaignId, field, oldValue, newValue, reason, status
        field = c["changeType"]  # e.g. 'status', 'budget', 'launch', 'pause', 'resume', 'end'
        reason = c.get("description", "")
        cur.execute('''
            INSERT INTO "CampaignChange" (id, "campaignId", field, "oldValue", "newValue", reason, status, "createdAt")
            VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, 'pending', NOW())
        ''', (campaign_id, field, c.get("oldValue"), c.get("newValue"), reason))
        inserted += 1
    conn.commit()
    cur.close()
    conn.close()
    return inserted

# ── State Management ────────────────────────────────────────────────

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}

def save_state(state):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)

# ── Main ────────────────────────────────────────────────────────────

def main():
    state = load_state()
    all_changes = []
    
    # Google Ads
    print("Fetching Google Ads...")
    try:
        google_current = get_google_campaigns()
        google_prev = state.get("google_ads", {})
        print(f"  {len(google_current)} campaigns (prev: {len(google_prev)})")
        if google_prev:
            changes = detect_changes("google_ads", google_prev, google_current, {
                "status": "Status", "budgetMicros": "Budget", "bidStrategy": "Bid Strategy",
            })
            all_changes.extend(changes)
            print(f"  {len(changes)} changes")
        else:
            print("  First run — saving baseline")
        state["google_ads"] = google_current
    except Exception as e:
        print(f"  Error: {e}")
    
    # LinkedIn
    print("Fetching LinkedIn...")
    try:
        linkedin_current = get_linkedin_campaigns()
        linkedin_prev = state.get("linkedin", {})
        print(f"  {len(linkedin_current)} campaigns (prev: {len(linkedin_prev)})")
        if linkedin_prev:
            changes = detect_changes("linkedin", linkedin_prev, linkedin_current, {
                "status": "Status", "budget": "Budget", "objectiveType": "Objective",
            })
            all_changes.extend(changes)
            print(f"  {len(changes)} changes")
        else:
            print("  First run — saving baseline")
        state["linkedin"] = linkedin_current
    except Exception as e:
        print(f"  Error: {e}")
    
    # StackAdapt
    print("Fetching StackAdapt...")
    try:
        sa_current = get_stackadapt_campaigns()
        sa_prev = state.get("stackadapt", {})
        print(f"  {len(sa_current)} campaigns (prev: {len(sa_prev)})")
        if sa_prev:
            changes = detect_changes("stackadapt", sa_prev, sa_current, {
                "status": "Status", "budget": "Budget", "bidAmount": "Bid",
            })
            all_changes.extend(changes)
            print(f"  {len(changes)} changes")
        else:
            print("  First run — saving baseline")
        state["stackadapt"] = sa_current
    except Exception as e:
        print(f"  Error: {e}")

    # Reddit
    print("Fetching Reddit...")
    try:
        reddit_current = get_reddit_campaigns()
        reddit_prev = state.get("reddit", {})
        print(f"  {len(reddit_current)} campaigns (prev: {len(reddit_prev)})")
        if reddit_prev:
            changes = detect_changes("reddit", reddit_prev, reddit_current, {
                "status": "Status", "budget": "Budget",
            })
            all_changes.extend(changes)
            print(f"  {len(changes)} changes")
        else:
            print("  First run — saving baseline")
        state["reddit"] = reddit_current
    except Exception as e:
        print(f"  Error: {e}")

    # Save
    save_state(state)
    
    if all_changes:
        inserted = save_changes_to_db(all_changes)
        print(f"\nTotal: {inserted} changes saved to DB")
        for c in all_changes[:15]:
            print(f"  [{c['platform']:12s}] [{c['changeType']:10s}] {c['campaignName'][:40]}: {c['description']}")
        if len(all_changes) > 15:
            print(f"  ... and {len(all_changes) - 15} more")
    else:
        print("\nNo changes detected (or first run baseline saved)")


if __name__ == "__main__":
    main()
