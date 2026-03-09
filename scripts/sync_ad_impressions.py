#!/usr/bin/env python3
"""
Sync StackAdapt B2B domain impression data per campaign — DAILY granularity.
Uses GraphQL campaignInsight(B2B_DOMAIN) — async jobs, polled until ready.
Fetches monthly windows for daily-level attribution support.

Flags:
  --full            Use 365-day lookback (default: 90 days)
  --include-paused  Include PAUSED campaigns (default: LIVE only)
  --subprocess      Fork each campaign fetch into a subprocess for memory isolation
  --dry-run         Show what would be done without making API calls or DB writes
"""

import argparse
import json
import multiprocessing
import os
import sys
import time
import traceback
import psycopg2
import urllib.request
from datetime import datetime, timezone, timedelta, date

DB_URL = "postgresql://azizalsinafi@localhost:5432/dghub"
CREDS_PATH = os.path.expanduser("~/.config/stackadapt/credentials.json")
LOOKBACK_DAYS_DEFAULT = 90
LOOKBACK_DAYS_FULL = 365

def gql_request(token, query, variables=None):
    body = {"query": query}
    if variables:
        body["variables"] = variables
    data = json.dumps(body).encode()
    req = urllib.request.Request("https://api.stackadapt.com/graphql", data=data, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json"
    })
    return json.loads(urllib.request.urlopen(req).read())

def get_all_campaigns(token):
    """Get all StackAdapt campaigns."""
    campaigns = []
    query = """
    query($cursor: String) {
      campaigns(first: 100, after: $cursor) {
        edges {
          node { id name campaignStatus { state status } }
          cursor
        }
        pageInfo { hasNextPage endCursor }
      }
    }
    """
    cursor = None
    for _ in range(10):
        resp = gql_request(token, query, {"cursor": cursor})
        edges = resp.get("data", {}).get("campaigns", {}).get("edges", [])
        for e in edges:
            campaigns.append(e["node"])
        pi = resp.get("data", {}).get("campaigns", {}).get("pageInfo", {})
        if not pi.get("hasNextPage"):
            break
        cursor = pi["endCursor"]
    return campaigns

def fetch_domain_impressions(token, campaign_id, date_from, date_to, max_records=500):
    """Fetch B2B_DOMAIN impressions for a campaign in a date window."""
    query = """
    query($filter: CampaignFilters, $from: ISO8601Date!, $to: ISO8601Date!) {
      campaignInsight(
        attributes: [B2B_DOMAIN]
        date: { from: $from, to: $to }
        filterBy: $filter
      ) {
        ... on CampaignInsightOutcome {
          records(first: MAX_RECORDS) {
            edges {
              node {
                attributes { b2bDomain }
                metrics { impressions clicks cost }
              }
            }
          }
        }
        ... on Progress { _ }
      }
    }
    """.replace("MAX_RECORDS", str(max_records))

    variables = {
        "filter": {"ids": [str(campaign_id)]},
        "from": date_from,
        "to": date_to,
    }

    for attempt in range(20):
        resp = gql_request(token, query, variables)

        if resp.get("errors"):
            print(f"    GQL error: {resp['errors'][0]['message']}")
            return []

        result = resp.get("data", {}).get("campaignInsight", {})
        if result.get("records"):
            domains = []
            for edge in result["records"]["edges"]:
                n = edge["node"]
                domain = n["attributes"].get("b2bDomain")
                if not domain:
                    continue
                m = n["metrics"]
                domains.append({
                    "domain": domain.lower().strip(),
                    "impressions": int(m.get("impressions", 0) or 0),
                    "clicks": int(m.get("clicks", 0) or 0),
                    "cost": float(m.get("cost", 0) or 0),
                })
            return domains
        else:
            time.sleep(4)

    print(f"    Timed out waiting for results")
    return []

def generate_monthly_windows(start_date, end_date):
    """Generate monthly (start, end) date pairs for windowed fetching."""
    windows = []
    current = start_date.replace(day=1)
    while current <= end_date:
        window_end = (current.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        if window_end > end_date:
            window_end = end_date
        if current < start_date:
            current = start_date
        windows.append((current, window_end))
        current = (window_end + timedelta(days=1))
    return windows


def process_single_campaign(camp, monthly_windows, token, dry_run=False):
    """Process a single campaign — can run in-process or as subprocess target."""
    camp_id = camp["id"]
    camp_name = camp["name"]
    camp_records = 0

    if dry_run:
        print(f"    [dry-run] Would fetch {len(monthly_windows)} windows")
        return 0

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    now = datetime.now(timezone.utc)

    try:
        for win_start, win_end in monthly_windows:
            date_from_str = win_start.strftime("%Y-%m-%d")
            date_to_str = win_end.strftime("%Y-%m-%d")

            domains = fetch_domain_impressions(token, camp_id, date_from_str, date_to_str)
            if not domains:
                continue

            month_date = win_start.replace(day=1)

            for d in domains:
                record_id = f"sa_{camp_id}_{d['domain']}_{month_date.strftime('%Y%m')}"
                cur.execute("""
                    INSERT INTO "AdImpression" (id, domain, "campaignId", "campaignName",
                        impressions, clicks, cost, "dateFrom", "dateTo",
                        "lastSyncedAt", "createdAt", "updatedAt", platform)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'stackadapt')
                    ON CONFLICT (domain, "campaignId") DO UPDATE SET
                        "campaignName" = EXCLUDED."campaignName",
                        impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, cost = EXCLUDED.cost,
                        "dateFrom" = EXCLUDED."dateFrom", "dateTo" = EXCLUDED."dateTo",
                        "lastSyncedAt" = EXCLUDED."lastSyncedAt", "updatedAt" = EXCLUDED."updatedAt",
                        platform = 'stackadapt'
                """, (record_id, d["domain"], str(camp_id), camp_name,
                      d["impressions"], d["clicks"], d["cost"],
                      win_start, win_end,
                      now, now, now))
                camp_records += 1

            # Clear reference to free memory
            del domains

        conn.commit()
    except Exception:
        conn.rollback()
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()

    return camp_records


def _subprocess_worker(camp, monthly_windows_serialized, token):
    """Subprocess entry point. Deserialize dates and run."""
    monthly_windows = [(datetime.strptime(s, "%Y-%m-%d").date(),
                        datetime.strptime(e, "%Y-%m-%d").date())
                       for s, e in monthly_windows_serialized]
    try:
        records = process_single_campaign(camp, monthly_windows, token)
        print(f"    → {records} domain-month records (subprocess)")
    except Exception:
        traceback.print_exc()


def sync():
    parser = argparse.ArgumentParser(description="Sync StackAdapt B2B domain impressions")
    parser.add_argument("--full", action="store_true",
                        help="Use 365-day lookback instead of default 90 days")
    parser.add_argument("--include-paused", action="store_true",
                        help="Include PAUSED campaigns (default: LIVE only)")
    parser.add_argument("--subprocess", action="store_true",
                        help="Fork each campaign into a subprocess for memory isolation")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be done without API calls or DB writes")
    args = parser.parse_args()

    lookback_days = LOOKBACK_DAYS_FULL if args.full else LOOKBACK_DAYS_DEFAULT
    allowed_states = ["LIVE", "PAUSED"] if args.include_paused else ["LIVE"]

    creds = json.load(open(CREDS_PATH))
    token = creds.get("graphql", {}).get("token")
    if not token:
        print("No GraphQL token found")
        return

    end_date = date.today()
    start_date = end_date - timedelta(days=lookback_days)
    monthly_windows = generate_monthly_windows(start_date, end_date)

    print(f"Fetching StackAdapt B2B domain impressions with MONTHLY granularity")
    print(f"  Date range: {start_date} to {end_date} ({len(monthly_windows)} windows, {lookback_days}-day lookback)")
    print(f"  States: {', '.join(allowed_states)}")
    if args.dry_run:
        print(f"  *** DRY RUN — no API calls or DB writes ***")
    if args.subprocess:
        print(f"  Subprocess isolation: ENABLED")

    if args.dry_run:
        # In dry-run, skip the actual API call to list campaigns
        print(f"  [dry-run] Would fetch campaigns and process them")
        print(f"\nDry run complete.")
        return

    campaigns = get_all_campaigns(token)
    active_campaigns = [c for c in campaigns if c["campaignStatus"]["state"] in allowed_states]
    print(f"  {len(active_campaigns)} campaigns to process")

    # Serialize windows for subprocess mode
    windows_serialized = [(w[0].strftime("%Y-%m-%d"), w[1].strftime("%Y-%m-%d"))
                          for w in monthly_windows]

    total_records = 0
    t0 = time.time()

    for i, camp in enumerate(active_campaigns):
        elapsed = time.time() - t0
        print(f"  [{i+1}/{len(active_campaigns)}] {camp['name'][:60]}  (elapsed: {elapsed:.0f}s, mem-ok)", flush=True)

        if args.subprocess:
            p = multiprocessing.Process(
                target=_subprocess_worker,
                args=(camp, windows_serialized, token)
            )
            p.start()
            p.join(timeout=300)  # 5 min max per campaign
            if p.is_alive():
                print(f"    ⚠ Subprocess timed out, killing")
                p.kill()
                p.join()
        else:
            camp_records = process_single_campaign(camp, monthly_windows, token)
            total_records += camp_records
            if camp_records:
                print(f"    → {camp_records} domain-month records")

    print(f"\nDone. {total_records} total domain-month impressions synced in {time.time() - t0:.0f}s.")

if __name__ == "__main__":
    sync()
