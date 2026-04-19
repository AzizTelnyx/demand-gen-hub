#!/usr/bin/env python3
"""
Sync ad impression data from ALL platforms into AdImpression table.

Platforms:
  - StackAdapt: B2B domain-level impressions (domain attribution)
  - Google Ads: Campaign-level metrics (no domain attribution)
  - LinkedIn: Campaign-level metrics (no domain attribution)
  - Reddit: Campaign-level metrics (no domain attribution)

For Google/LinkedIn/Reddit, records are stored with domain='__campaign__'
since domain-level attribution is not available. These still contribute
to platform totals and campaign influence tracking.

Flags:
  --full            Use 365-day lookback (default: 90 days)
  --include-paused  Include PAUSED campaigns (default: LIVE only)
  --subprocess      Fork each campaign fetch into a subprocess for memory isolation
  --dry-run         Show what would be done without making API calls or DB writes
  --platform        Sync only a specific platform (stackadapt|google_ads|linkedin|reddit)
"""

import argparse
import gc
import json
import multiprocessing
import os
import sys
import time
import traceback
import psycopg2
import urllib.request
import urllib.parse
import urllib.error
import base64
from datetime import datetime, timezone, timedelta, date

DB_URL = "postgresql://azizalsinafi@localhost:5432/dghub"
SA_CREDS_PATH = os.path.expanduser("~/.config/stackadapt/credentials.json")
GOOGLE_CREDS_PATH = os.path.expanduser("~/.config/google-ads/credentials.json")
LINKEDIN_CREDS_PATH = os.path.expanduser("~/.config/linkedin-ads/credentials.json")
REDDIT_CREDS_PATH = os.path.expanduser("~/.config/reddit-ads/credentials.json")
LOOKBACK_DAYS_DEFAULT = 90
LOOKBACK_DAYS_FULL = 365


# ─── Helpers ──────────────────────────────────────────

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


def upsert_impression(cur, record_id, domain, campaign_id, campaign_name,
                       impressions, clicks, cost, date_from, date_to, platform, now,
                       conversions=0):
    """Upsert a single AdImpression record using primary key conflict resolution."""
    cur.execute("""
        INSERT INTO "AdImpression" (id, domain, "campaignId", "campaignName",
            impressions, clicks, cost, conversions, "dateFrom", "dateTo",
            "lastSyncedAt", "createdAt", "updatedAt", platform)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            "campaignName" = EXCLUDED."campaignName",
            impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, cost = EXCLUDED.cost,
            conversions = EXCLUDED.conversions,
            "dateFrom" = EXCLUDED."dateFrom", "dateTo" = EXCLUDED."dateTo",
            "lastSyncedAt" = EXCLUDED."lastSyncedAt", "updatedAt" = EXCLUDED."updatedAt",
            platform = EXCLUDED.platform
    """, (record_id, domain, campaign_id, campaign_name,
          impressions, clicks, cost, conversions, date_from, date_to, now, now, now, platform))


# ═══════════════════════════════════════════════════════
# StackAdapt
# ═══════════════════════════════════════════════════════

def gql_request(token, query, variables=None):
    body = {"query": query}
    if variables:
        body["variables"] = variables
    data = json.dumps(body).encode()
    req = urllib.request.Request("https://api.stackadapt.com/graphql", data=data, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json"
    })
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def get_all_sa_campaigns(token):
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
                metrics { impressions clicks cost conversions }
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
                    "conversions": int(m.get("conversions", 0) or 0),
                })
            return domains
        else:
            time.sleep(4)

    print(f"    Timed out waiting for results")
    return []


def process_single_sa_campaign(camp, monthly_windows, token, dry_run=False):
    camp_id = camp["id"]
    camp_name = camp["name"]
    camp_records = 0

    if dry_run:
        print(f"    [dry-run] Would fetch {len(monthly_windows)} windows for StackAdapt campaign '{camp_name}'")
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
                upsert_impression(cur, record_id, d["domain"], str(camp_id), camp_name,
                                  d["impressions"], d["clicks"], d["cost"],
                                  win_start, win_end, "stackadapt", now,
                                  conversions=d.get("conversions", 0))
                camp_records += 1

            del domains
        conn.commit()
    except Exception:
        conn.rollback()
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()

    return camp_records


def _subprocess_worker(camp, monthly_windows_serialized, token, count_queue):
    monthly_windows = [(datetime.strptime(s, "%Y-%m-%d").date(),
                        datetime.strptime(e, "%Y-%m-%d").date())
                       for s, e in monthly_windows_serialized]
    try:
        records = process_single_sa_campaign(camp, monthly_windows, token)
        print(f"    → {records} domain-month records (subprocess)")
        count_queue.put(records)
    except Exception:
        traceback.print_exc()
        count_queue.put(0)


def sync_stackadapt(start_date, end_date, monthly_windows, include_paused, use_subprocess, dry_run):
    print(f"\n{'='*60}")
    print(f"  STACKADAPT — B2B Domain Impressions")
    print(f"{'='*60}")

    if not os.path.exists(SA_CREDS_PATH):
        print("  ⚠ No StackAdapt credentials found, skipping")
        return 0

    creds = json.load(open(SA_CREDS_PATH))
    token = creds.get("graphql", {}).get("token")
    if not token:
        print("  ⚠ No GraphQL token found, skipping")
        return 0

    allowed_states = ["LIVE", "PAUSED"] if include_paused else ["LIVE"]
    print(f"  Date range: {start_date} to {end_date} ({len(monthly_windows)} windows)")
    print(f"  States: {', '.join(allowed_states)}")

    if dry_run:
        print(f"  [dry-run] Would fetch campaigns and process domain impressions")
        return 0

    campaigns = get_all_sa_campaigns(token)
    active_campaigns = [c for c in campaigns if c["campaignStatus"]["state"] in allowed_states]
    del campaigns  # Free memory
    print(f"  {len(active_campaigns)} campaigns to process")

    windows_serialized = [(w[0].strftime("%Y-%m-%d"), w[1].strftime("%Y-%m-%d")) for w in monthly_windows]
    total_records = 0
    t0 = time.time()
    count_queue = multiprocessing.Queue() if use_subprocess else None

    for i, camp in enumerate(active_campaigns):
        elapsed = time.time() - t0
        print(f"  [{i+1}/{len(active_campaigns)}] {camp['name'][:60]}  (elapsed: {elapsed:.0f}s)", flush=True)

        if use_subprocess:
            p = multiprocessing.Process(target=_subprocess_worker, args=(camp, windows_serialized, token, count_queue))
            p.start()
            p.join(timeout=300)
            if p.is_alive():
                print(f"    ⚠ Subprocess timed out, killing")
                p.kill()
                p.join()
                count_queue.get() if not count_queue.empty() else None  # drain stale entry
            # Collect the count from the finished subprocess
            while not count_queue.empty():
                total_records += count_queue.get()
        else:
            camp_records = process_single_sa_campaign(camp, monthly_windows, token)
            total_records += camp_records
            if camp_records:
                print(f"    → {camp_records} domain-month records")
            gc.collect()  # Free memory between campaigns

    print(f"  StackAdapt done: {total_records} records in {time.time() - t0:.0f}s")
    return total_records


# ═══════════════════════════════════════════════════════
# Google Ads
# ═══════════════════════════════════════════════════════

def sync_google_ads(start_date, end_date, monthly_windows, include_paused, dry_run):
    print(f"\n{'='*60}")
    print(f"  GOOGLE ADS — Campaign-Level Metrics")
    print(f"{'='*60}")

    if not os.path.exists(GOOGLE_CREDS_PATH):
        print("  ⚠ No Google Ads credentials found, skipping")
        return 0

    creds = json.load(open(GOOGLE_CREDS_PATH))
    customer_id = str(creds.get("accounts", {}).get("marketing_telnyx", {}).get("customer_id", "2356650573"))
    login_customer_id = str(creds.get("login_customer_id", "2893524941"))

    print(f"  Customer ID: {customer_id}, Login ID: {login_customer_id}")
    print(f"  Date range: {start_date} to {end_date} ({len(monthly_windows)} monthly windows)")

    if dry_run:
        print(f"  [dry-run] Would query Google Ads API for campaign metrics per monthly window")
        print(f"  [dry-run] Records stored with domain='__campaign__', platform='google_ads'")
        print(f"  [dry-run] campaignId format: ga_<campaign_id>_<YYYYMM>")
        return 0

    try:
        from google.ads.googleads.client import GoogleAdsClient
    except ImportError:
        print("  ⚠ google-ads-python not installed, skipping")
        return 0

    client = GoogleAdsClient.load_from_dict({
        "developer_token": creds["developer_token"],
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "login_customer_id": login_customer_id,
        "use_proto_plus": True,
    })
    ga = client.get_service("GoogleAdsService")

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    now = datetime.now(timezone.utc)
    total_records = 0

    try:
        for win_start, win_end in monthly_windows:
            date_from = win_start.strftime("%Y-%m-%d")
            date_to = win_end.strftime("%Y-%m-%d")
            month_key = win_start.strftime("%Y%m")

            status_filter = "campaign.status = 'ENABLED'" if not include_paused else "campaign.status != 'REMOVED'"
            query = f"""
                SELECT campaign.name, campaign.id,
                       metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
                FROM campaign
                WHERE segments.date >= '{date_from}' AND segments.date <= '{date_to}'
                  AND {status_filter}
                ORDER BY metrics.cost_micros DESC
            """

            try:
                response = ga.search(customer_id=customer_id, query=query)
                window_records = 0
                for row in response:
                    camp_id = str(row.campaign.id)
                    camp_name = row.campaign.name
                    impressions = row.metrics.impressions
                    clicks = row.metrics.clicks
                    cost = row.metrics.cost_micros / 1_000_000
                    conversions = int(row.metrics.conversions or 0)

                    if impressions == 0 and clicks == 0 and cost == 0:
                        continue

                    # Use month-scoped campaignId to allow per-month records
                    scoped_campaign_id = f"ga_{camp_id}_{month_key}"
                    record_id = f"ga_{camp_id}_{month_key}"

                    upsert_impression(cur, record_id, "__campaign__", scoped_campaign_id,
                                      camp_name, impressions, clicks, cost,
                                      win_start, win_end, "google_ads", now,
                                      conversions=conversions)
                    window_records += 1

                total_records += window_records
                if window_records:
                    print(f"    {date_from} → {date_to}: {window_records} campaigns")
            except Exception as e:
                print(f"    ⚠ Error for {date_from}: {e}")

        conn.commit()
    except Exception:
        conn.rollback()
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()

    print(f"  Google Ads done: {total_records} records")
    return total_records


# ═══════════════════════════════════════════════════════
# LinkedIn
# ═══════════════════════════════════════════════════════

def sync_linkedin(start_date, end_date, monthly_windows, include_paused, dry_run):
    print(f"\n{'='*60}")
    print(f"  LINKEDIN — Campaign-Level Metrics")
    print(f"{'='*60}")

    if not os.path.exists(LINKEDIN_CREDS_PATH):
        print("  ⚠ No LinkedIn credentials found, skipping")
        return 0

    creds = json.load(open(LINKEDIN_CREDS_PATH))
    token = creds.get("access_token")
    account_id = creds.get("ad_account_id")
    if not token or not account_id:
        print("  ⚠ Missing LinkedIn access_token or ad_account_id, skipping")
        return 0

    print(f"  Account ID: {account_id}")
    print(f"  Date range: {start_date} to {end_date} ({len(monthly_windows)} monthly windows)")

    if dry_run:
        print(f"  [dry-run] Would query LinkedIn Marketing API for campaign analytics per monthly window")
        print(f"  [dry-run] Records stored with domain='__campaign__', platform='linkedin'")
        print(f"  [dry-run] campaignId format: li_<campaign_id>_<YYYYMM>")
        return 0

    headers = {"Authorization": f"Bearer {token}"}

    def li_get(url):
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    # Fetch all campaigns
    account_urn = f"urn:li:sponsoredAccount:{account_id}"
    all_camps = []
    start = 0
    while True:
        url = (
            f"https://api.linkedin.com/v2/adCampaignsV2?"
            f"q=search&search.account.values[0]={urllib.parse.quote(account_urn)}"
            f"&count=100&start={start}"
        )
        data = li_get(url)
        elements = data.get("elements", [])
        all_camps.extend(elements)
        total_count = data.get("paging", {}).get("total", 0)
        start += 100
        if start >= total_count:
            break

    if not include_paused:
        all_camps = [c for c in all_camps if c.get("status") == "ACTIVE"]

    camp_map = {str(c["id"]): c for c in all_camps}
    campaign_ids = list(camp_map.keys())
    print(f"  {len(campaign_ids)} campaigns found")

    if not campaign_ids:
        return 0

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    now_ts = datetime.now(timezone.utc)
    total_records = 0

    try:
        for win_start, win_end in monthly_windows:
            d0, m0, y0 = win_start.day, win_start.month, win_start.year
            d1, m1, y1 = win_end.day, win_end.month, win_end.year
            month_key = win_start.strftime("%Y%m")
            window_records = 0

            # Batch campaigns in groups of 20
            for i in range(0, len(campaign_ids), 20):
                batch = campaign_ids[i:i + 20]
                params = [
                    "q=analytics",
                    f"dateRange.start.day={d0}", f"dateRange.start.month={m0}", f"dateRange.start.year={y0}",
                    f"dateRange.end.day={d1}", f"dateRange.end.month={m1}", f"dateRange.end.year={y1}",
                    "timeGranularity=ALL", "pivot=CAMPAIGN",
                    "fields=costInLocalCurrency,impressions,clicks,externalWebsiteConversions",
                ]
                for j, cid in enumerate(batch):
                    params.append(f"campaigns[{j}]=urn:li:sponsoredCampaign:{cid}")

                url = f"https://api.linkedin.com/v2/adAnalyticsV2?{'&'.join(params)}"
                try:
                    data = li_get(url)
                except Exception as e:
                    print(f"    ⚠ LinkedIn API error for batch: {e}")
                    continue

                for el in data.get("elements", []):
                    pivot_val = (el.get("pivotValues") or [""])[0]
                    if not pivot_val:
                        ad_ents = el.get("adEntities", [])
                        if ad_ents:
                            pivot_val = ad_ents[0].get("value", {}).get("campaign", "")
                    camp_id = pivot_val.split(":")[-1] if ":" in pivot_val else pivot_val
                    if not camp_id:
                        continue

                    camp = camp_map.get(camp_id, {})
                    impressions = int(el.get("impressions", 0) or 0)
                    clicks = int(el.get("clicks", 0) or 0)
                    cost = float(el.get("costInLocalCurrency", 0) or 0)
                    conversions = int(el.get("externalWebsiteConversions", 0) or 0)

                    if impressions == 0 and clicks == 0 and cost == 0:
                        continue

                    camp_name = camp.get("name", f"LinkedIn Campaign {camp_id}")
                    scoped_campaign_id = f"li_{camp_id}_{month_key}"
                    record_id = f"li_{camp_id}_{month_key}"

                    upsert_impression(cur, record_id, "__campaign__", scoped_campaign_id,
                                      camp_name, impressions, clicks, cost,
                                      win_start, win_end, "linkedin", now_ts,
                                      conversions=conversions)
                    window_records += 1

            total_records += window_records
            if window_records:
                print(f"    {win_start} → {win_end}: {window_records} campaigns")

        conn.commit()
    except Exception:
        conn.rollback()
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()

    print(f"  LinkedIn done: {total_records} records")
    return total_records


# ═══════════════════════════════════════════════════════
# Reddit
# ═══════════════════════════════════════════════════════

def sync_reddit(start_date, end_date, monthly_windows, include_paused, dry_run):
    print(f"\n{'='*60}")
    print(f"  REDDIT — Campaign-Level Metrics")
    print(f"{'='*60}")

    if not os.path.exists(REDDIT_CREDS_PATH):
        print("  ⚠ No Reddit credentials found, skipping")
        return 0

    creds = json.load(open(REDDIT_CREDS_PATH))
    access_token = creds.get("access_token")
    refresh_token = creds.get("refresh_token")
    client_id = creds.get("client_id", "o-qtINw0ep_DORQPRiiCUQ")
    client_secret = creds.get("client_secret", "")
    account_id = creds.get("account_id", "t2_na6v8ho2")
    user_agent = "TelnyxDGHub:o-qtINw0ep_DORQPRiiCUQ:v1.0 (by /u/TelnyxLLC)"

    print(f"  Account ID: {account_id}")
    print(f"  Date range: {start_date} to {end_date} ({len(monthly_windows)} monthly windows)")

    if dry_run:
        print(f"  [dry-run] Would query Reddit Ads API for campaign metrics per monthly window")
        print(f"  [dry-run] Records stored with domain='__campaign__', platform='reddit'")
        print(f"  [dry-run] campaignId format: rd_<campaign_id>_<YYYYMM>")
        return 0

    def reddit_refresh():
        nonlocal access_token
        data = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }).encode()
        req = urllib.request.Request("https://www.reddit.com/api/v1/access_token", data=data)
        credentials_b64 = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        req.add_header("Authorization", f"Basic {credentials_b64}")
        req.add_header("User-Agent", user_agent)
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        access_token = result.get("access_token", access_token)

    def reddit_api(method, path, body=None):
        nonlocal access_token
        url = f"https://ads-api.reddit.com/api/v3{path}"
        headers_dict = {
            "Authorization": f"Bearer {access_token}",
            "User-Agent": user_agent,
            "Content-Type": "application/json",
        }
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, headers=headers_dict, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 401:
                reddit_refresh()
                headers_dict["Authorization"] = f"Bearer {access_token}"
                req = urllib.request.Request(url, data=data, headers=headers_dict, method=method)
                with urllib.request.urlopen(req, timeout=60) as resp:
                    return json.loads(resp.read())
            raise

    # Fetch campaigns
    camp_data = reddit_api("GET", f"/ad_accounts/{account_id}/campaigns")
    camp_list = camp_data.get("data", [])
    camp_map = {}
    for c in camp_list:
        cid = str(c.get("id", ""))
        status = (c.get("effective_status") or c.get("status", "")).upper()
        if not include_paused and status not in ("ACTIVE",):
            continue
        camp_map[cid] = c.get("name", f"Reddit Campaign {cid}")

    print(f"  {len(camp_map)} campaigns found")
    if not camp_map:
        return 0

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    now_ts = datetime.now(timezone.utc)
    total_records = 0

    try:
        for win_start, win_end in monthly_windows:
            month_key = win_start.strftime("%Y%m")
            end_dt = win_end + timedelta(days=1)

            report_body = {
                "data": {
                    "starts_at": f"{win_start.strftime('%Y-%m-%d')}T00:00:00Z",
                    "ends_at": f"{end_dt.strftime('%Y-%m-%d')}T00:00:00Z",
                    "fields": ["SPEND", "IMPRESSIONS", "CLICKS", "CAMPAIGN_ID"],
                    "breakdowns": ["CAMPAIGN_ID"],
                }
            }

            try:
                report_data = reddit_api("POST", f"/ad_accounts/{account_id}/reports", report_body)
                records = report_data.get("data", {}).get("metrics", [])
            except Exception as e:
                print(f"    ⚠ Reddit API error for {win_start}: {e}")
                continue

            window_records = 0
            for r in records:
                cid = str(r.get("campaign_id", ""))
                if cid not in camp_map:
                    continue

                impressions = int(r.get("impressions", 0) or 0)
                clicks = int(r.get("clicks", 0) or 0)
                cost = float(r.get("spend", 0) or 0) / 1_000_000
                conversions = int(r.get("conversions", 0) or 0)

                if impressions == 0 and clicks == 0 and cost == 0:
                    continue

                camp_name = camp_map[cid]
                scoped_campaign_id = f"rd_{cid}_{month_key}"
                record_id = f"rd_{cid}_{month_key}"

                upsert_impression(cur, record_id, "__campaign__", scoped_campaign_id,
                                  camp_name, impressions, clicks, cost,
                                  win_start, win_end, "reddit", now_ts,
                                  conversions=conversions)
                window_records += 1

            total_records += window_records
            if window_records:
                print(f"    {win_start} → {win_end}: {window_records} campaigns")

        conn.commit()
    except Exception:
        conn.rollback()
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()

    print(f"  Reddit done: {total_records} records")
    return total_records


# ═══════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════

def sync():
    parser = argparse.ArgumentParser(description="Sync ad impressions from all platforms")
    parser.add_argument("--full", action="store_true",
                        help="Use 365-day lookback instead of default 90 days")
    parser.add_argument("--include-paused", action="store_true",
                        help="Include PAUSED campaigns (default: active only)")
    parser.add_argument("--subprocess", action="store_true", default=True,
                        help="Fork each StackAdapt campaign into a subprocess for memory isolation (default: True)")
    parser.add_argument("--no-subprocess", action="store_true",
                        help="Disable subprocess isolation (run in-process)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be done without API calls or DB writes")
    parser.add_argument("--platform", type=str, default=None,
                        choices=["stackadapt", "google_ads", "linkedin", "reddit"],
                        help="Sync only a specific platform")
    args = parser.parse_args()

    lookback_days = LOOKBACK_DAYS_FULL if args.full else LOOKBACK_DAYS_DEFAULT
    end_date = date.today()
    start_date = end_date - timedelta(days=lookback_days)
    monthly_windows = generate_monthly_windows(start_date, end_date)

    print(f"Ad Impression Sync — All Platforms")
    print(f"  Date range: {start_date} to {end_date} ({len(monthly_windows)} monthly windows, {lookback_days}-day lookback)")
    if args.dry_run:
        print(f"  *** DRY RUN — no API calls or DB writes ***")
    if args.platform:
        print(f"  Platform filter: {args.platform}")

    use_subprocess = args.subprocess and not args.no_subprocess
    platforms = [args.platform] if args.platform else ["stackadapt", "google_ads", "linkedin", "reddit"]
    grand_total = 0
    t0 = time.time()

    if "stackadapt" in platforms:
        grand_total += sync_stackadapt(start_date, end_date, monthly_windows,
                                        args.include_paused, use_subprocess, args.dry_run)

    if "google_ads" in platforms:
        grand_total += sync_google_ads(start_date, end_date, monthly_windows,
                                        args.include_paused, args.dry_run)

    if "linkedin" in platforms:
        grand_total += sync_linkedin(start_date, end_date, monthly_windows,
                                      args.include_paused, args.dry_run)

    if "reddit" in platforms:
        grand_total += sync_reddit(start_date, end_date, monthly_windows,
                                    args.include_paused, args.dry_run)

    print(f"\n{'='*60}")
    print(f"  TOTAL: {grand_total} records synced across {len(platforms)} platforms in {time.time() - t0:.0f}s")
    print(f"{'='*60}")


if __name__ == "__main__":
    sync()
