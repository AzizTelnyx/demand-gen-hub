#!/usr/bin/env python3
"""
ABM Sync Agent
=============
Syncs ABM audience data between the DG Hub DB and ad platforms.

Daily run (6 AM PST):
1. Read all LinkedIn DMP segments → upsert to ABMList + ABMListHealth
2. Read all StackAdapt custom segments → upsert to ABMList + ABMListHealth
3. Read campaign-segment associations → upsert to CampaignAudience
4. Update ABMListHealth with latest audience sizes
5. Flag stale/undersized lists

First run: Backfills all 262 LinkedIn segments.

Run: python scripts/abm-sync-agent.py [--dry-run] [--platform linkedin|stackadapt|all]
Cron: Daily 6 AM PST via OpenClaw cron
"""

import json
import os
import sys
import time
import argparse
import urllib.request
import urllib.parse
import urllib.error
import traceback
from datetime import datetime, timezone, timedelta

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ─── Config ───────────────────────────────────────────

AGENT_SLUG = "abm-sync"
AGENT_NAME = "ABM Sync Agent"

DB_URL = "postgresql://localhost:5432/dghub"

LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/abm-sync")
os.makedirs(LOG_DIR, exist_ok=True)

# ─── LinkedIn API ─────────────────────────────────────

def load_linkedin_creds():
    path = os.path.expanduser("~/.config/linkedin-ads/credentials.json")
    with open(path) as f:
        return json.load(f)


def li_get(path, token, params=None):
    """Make a LinkedIn API GET request."""
    url = f"https://api.linkedin.com/v2/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def li_get_all_dmp_segments(token, account_id):
    """Fetch all DMP segments with pagination."""
    segments = []
    start = 0
    count = 100
    while True:
        params = {
            "q": "account",
            "account": f"urn:li:sponsoredAccount:{account_id}",
            "count": count,
            "start": start,
        }
        data = li_get("dmpSegments", token, params)
        elements = data.get("elements", [])
        segments.extend(elements)
        paging = data.get("paging", {})
        total = paging.get("total", 0)
        start += count
        if start >= total or not elements:
            break
    return segments


def li_get_campaign_targeting(token, account_id, status="ACTIVE"):
    """Get all campaigns with their audience targeting."""
    account_urn = f"urn:li:sponsoredAccount:{account_id}"
    campaigns = []
    start = 0
    while True:
        url = (
            f"https://api.linkedin.com/v2/adCampaignsV2"
            f"?q=search"
            f"&search.account.values[0]={urllib.parse.quote(account_urn)}"
            f"&count=100&start={start}"
        )
        if status:
            url += f"&search.status.values[0]={status}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            print(f"  ⚠ LinkedIn campaign fetch error: {e.code}")
            break
        elements = data.get("elements", [])
        campaigns.extend(elements)
        paging = data.get("paging", {})
        total = paging.get("total", 0)
        start += 100
        if start >= total or not elements:
            break
    return campaigns


# ─── StackAdapt API ────────────────────────────────────

def load_stackadapt_creds():
    path = os.path.expanduser("~/.config/stackadapt/credentials.json")
    with open(path) as f:
        return json.load(f)


def sa_graphql(query, token, variables=None):
    """Make a StackAdapt GraphQL request."""
    body = {"query": query}
    if variables:
        body["variables"] = variables
    req = urllib.request.Request(
        "https://api.stackadapt.com/graphql",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def sa_get_all_segments(token):
    """Fetch all StackAdapt custom segments with pagination."""
    all_segments = []
    cursor = None
    while True:
        after = f', after: "{cursor}"' if cursor else ''
        query = f"""
        {{
          customSegments(first: 100{after}) {{
            edges {{
              node {{ id name active size duidSize createdAt description }}
            }}
            pageInfo {{ hasNextPage endCursor }}
          }}
        }}
        """
        data = sa_graphql(query, token)
        if data.get("errors"):
            print(f"  ⚠ StackAdapt GraphQL error: {data['errors'][0]['message']}")
            break
        seg_data = data.get("data", {}).get("customSegments", {})
        edges = seg_data.get("edges", [])
        for e in edges:
            all_segments.append(e["node"])
        page_info = seg_data.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")
    return all_segments


def sa_get_advertiser_id(token):
    """Get the StackAdapt advertiser ID."""
    query = '{ currentUser { advertisers { edges { node { id name } } } } }'
    data = sa_graphql(query, token)
    advs = data.get("data", {}).get("currentUser", {}).get("advertisers", {}).get("edges", [])
    if advs:
        return advs[0]["node"]["id"]
    return None


# ─── DB Helpers ────────────────────────────────────────

def get_db():
    return psycopg2.connect(DB_URL)


def upsert_abm_list(cur, list_id, name, source, list_type, description=None, count=0, status="active"):
    """Upsert an ABMList record."""
    cur.execute(
        '''INSERT INTO "ABMList" (id, name, count, source, status, "listType", description, "createdAt", "updatedAt")
           VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               count = EXCLUDED.count,
               source = EXCLUDED.source,
               status = EXCLUDED.status,
               "listType" = EXCLUDED."listType",
               description = EXCLUDED.description,
               "updatedAt" = NOW()
        ''',
        (list_id, name, count, source, status, list_type, description),
    )


def upsert_abm_list_health(cur, list_id, platform, audience_size, platform_segment_id=None,
                            platform_segment_name=None, flags=None):
    """Upsert an ABMListHealth record."""
    # Get previous size for growth rate
    cur.execute(
        'SELECT "audienceSize" FROM "ABMListHealth" WHERE "listId" = %s AND platform = %s',
        (list_id, platform),
    )
    row = cur.fetchone()
    previous_size = row[0] if row else None
    growth_rate = None
    if previous_size and previous_size > 0:
        growth_rate = round((audience_size - previous_size) / previous_size * 100, 2)

    # Build staleness score (0 = fresh, 100 = very stale)
    staleness = 0
    cur.execute(
        'SELECT "updatedAt" FROM "ABMListHealth" WHERE "listId" = %s AND platform = %s',
        (list_id, platform),
    )
    row2 = cur.fetchone()
    if row2 and row2[0]:
        days_since = (datetime.now(timezone.utc) - row2[0].replace(tzinfo=timezone.utc)).days
        staleness = min(100, days_since)

    cur.execute(
        '''INSERT INTO "ABMListHealth" ("listId", platform, "audienceSize", "previousSize",
               "growthRate", "stalenessScore", flags, "platformSegmentId", "platformSegmentName",
               "lastSyncedAt", "createdAt", "updatedAt")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), NOW())
           ON CONFLICT ("listId", platform) DO UPDATE SET
               "audienceSize" = EXCLUDED."audienceSize",
               "previousSize" = EXCLUDED."previousSize",
               "growthRate" = EXCLUDED."growthRate",
               "stalenessScore" = EXCLUDED."stalenessScore",
               flags = EXCLUDED.flags,
               "platformSegmentId" = EXCLUDED."platformSegmentId",
               "platformSegmentName" = EXCLUDED."platformSegmentName",
               "lastSyncedAt" = NOW(),
               "updatedAt" = NOW()
        ''',
        (list_id, platform, audience_size, previous_size, growth_rate, staleness,
         json.dumps(flags or []), platform_segment_id, platform_segment_name),
    )


def upsert_campaign_audience(cur, campaign_id, platform, audience_type, name, value, match_type="TARGET", metadata=None):
    """Upsert a CampaignAudience record."""
    audience_id = f"{campaign_id}-{platform}-{value}"
    cur.execute(
        '''INSERT INTO "CampaignAudience" (id, "campaignId", platform, "audienceType", name, value,
               "matchType", metadata, "lastSyncedAt", "createdAt", "updatedAt")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               "audienceType" = EXCLUDED."audienceType",
               "matchType" = EXCLUDED."matchType",
               metadata = EXCLUDED.metadata,
               "lastSyncedAt" = NOW(),
               "updatedAt" = NOW()
        ''',
        (audience_id, campaign_id, platform, audience_type, name, value, match_type,
         json.dumps(metadata) if metadata else None),
    )


# ─── Sync: LinkedIn ────────────────────────────────────

def sync_linkedin(dry_run=False):
    """Sync all LinkedIn DMP segments and campaign targeting to DB."""
    creds = load_linkedin_creds()
    token = creds["access_token"]
    account_id = creds["ad_account_id"]

    print(f"\n{'[DRY RUN] ' if dry_run else ''}LinkedIn ABM Sync")
    print(f"  Account: {account_id}")

    # 1. Fetch all DMP segments
    print("  Fetching DMP segments...")
    segments = li_get_all_dmp_segments(token, account_id)
    print(f"  Found {len(segments)} DMP segments")

    if dry_run:
        for s in segments[:5]:
            print(f"    - {s.get('name','?')[:60]} | type={s.get('type','?')} | status={s.get('status','?')}")
        print(f"    ... and {len(segments)-5} more")
        return

    conn = get_db()
    cur = conn.cursor()

    segment_map = {}  # segment_id → list_id for campaign association
    synced = 0
    errors = 0

    for s in segments:
        try:
            seg_id = str(s.get("id", ""))
            seg_name = s.get("name", "Unknown")
            seg_type = s.get("type", "USER")
            seg_status = s.get("status", "ACTIVE")
            source_platform = s.get("sourcePlatform", "UNKNOWN")

            # Determine list source
            if source_platform == "ABM_HUB_COMPANY_TIERING":
                list_source = "linkedin_abm_hub"
            elif source_platform.startswith("HS_") or "hockeystack" in seg_name.lower():
                list_source = "hockeystack"
            elif "vector" in seg_name.lower() or "intent" in seg_name.lower():
                list_source = "linkedin_vector"
            else:
                list_source = "linkedin_native"

            # Determine list type
            if seg_type == "COMPANY":
                list_type = "abm_company"
            else:
                list_type = "intent_behavioral"

            # Get audience size from destinations
            audience_size = 0
            platform_segment_urn = None
            for d in s.get("destinations", []):
                if d.get("destination") == "LINKEDIN":
                    audience_size = d.get("audienceSize", 0) or 0
                    platform_segment_urn = d.get("destinationSegmentId", "")
                    seg_status = d.get("status", seg_status)

            # Create ABM list ID
            list_id = f"li-seg-{seg_id}"

            # Map status
            db_status = "active" if seg_status == "LIVE" else "archived" if seg_status == "ARCHIVED" else "active"

            # Upsert ABM list
            upsert_abm_list(cur, list_id, seg_name, list_source, list_type,
                          description=f"LinkedIn DMP segment (type={seg_type}, source={source_platform})",
                          count=audience_size, status=db_status)

            # Upsert health record
            flags = []
            if audience_size < 300:
                flags.append("undersized")
            if seg_status == "ARCHIVED":
                flags.append("archived")

            upsert_abm_list_health(cur, list_id, "linkedin", audience_size,
                                  platform_segment_id=platform_segment_urn,
                                  platform_segment_name=seg_name,
                                  flags=flags)

            segment_map[platform_segment_urn] = list_id
            synced += 1

        except Exception as e:
            errors += 1
            print(f"  ⚠ Error syncing segment {s.get('id','?')}: {e}")

    print(f"  Synced {synced} segments ({errors} errors)")

    # 2. Fetch campaign targeting (which segments are on which campaigns)
    print("  Fetching campaign targeting...")
    campaigns = li_get_campaign_targeting(token, account_id)
    print(f"  Found {len(campaigns)} active campaigns")

    associations = 0
    for c in campaigns:
        try:
            li_campaign_id = str(c.get("id", ""))
            # Look up the Campaign primary key from platform ID
            cur.execute(
                'SELECT id FROM "Campaign" WHERE "platformId" = %s AND platform = %s',
                (li_campaign_id, "linkedin"),
            )
            campaign_row = cur.fetchone()
            if not campaign_row:
                continue  # Campaign not synced to DB yet, skip
            campaign_pk = campaign_row[0]

            targeting = c.get("targetingCriteria", {})
            include = targeting.get("include", {})
            ands = include.get("and", [])

            for item in ands:
                for key, val in item.get("or", {}).items():
                    if "audienceMatching" in key.lower() or "segment" in key.lower():
                        for seg_urn in val:
                            list_id = segment_map.get(seg_urn, f"li-seg-{seg_urn.split(':')[-1]}")
                            upsert_campaign_audience(
                                cur, campaign_pk, "linkedin", "abm_segment",
                                name=seg_urn,
                                value=seg_urn,
                                match_type="TARGET",
                                metadata={"listId": list_id, "liCampaignId": li_campaign_id}
                            )
                            associations += 1

        except Exception as e:
            print(f"  ⚠ Error syncing campaign {c.get('id','?')}: {e}")

    print(f"  Synced {associations} campaign-segment associations")

    conn.commit()
    cur.close()
    conn.close()
    print("  LinkedIn sync complete ✅")


# ─── Sync: StackAdapt ──────────────────────────────────

def sync_stackadapt(dry_run=False):
    """Sync all StackAdapt custom segments to DB."""
    creds = load_stackadapt_creds()
    token = creds["graphql"]["token"]

    print(f"\n{'[DRY RUN] ' if dry_run else ''}StackAdapt ABM Sync")

    # 1. Fetch all custom segments
    print("  Fetching custom segments...")
    segments = sa_get_all_segments(token)
    print(f"  Found {len(segments)} custom segments")

    if dry_run:
        for s in segments[:5]:
            print(f"    - {s.get('name','?')[:60]} | type={s.get('type','?')} | size={s.get('size','?')}")
        print(f"    ... and {len(segments)-5} more")
        return

    conn = get_db()
    cur = conn.cursor()

    synced = 0
    errors = 0

    for s in segments:
        try:
            seg_id = str(s.get("id", ""))
            seg_name = s.get("name", "Unknown")
            seg_active = s.get("active", True)
            size = s.get("size", 0)
            duid_size = s.get("duidSize", 0)

            # Parse size (can be string from GraphQL BigInt)
            try:
                audience_size = int(duid_size or size or 0)
            except (ValueError, TypeError):
                audience_size = 0

            # Determine list type from name
            name_lower = seg_name.lower()
            if "abm" in name_lower or "account" in name_lower:
                list_type = "abm_company"
            elif "crm" in name_lower or "customer" in name_lower:
                list_type = "crm"
            elif "intent" in name_lower or "vector" in name_lower:
                list_type = "intent_behavioral"
            else:
                list_type = "custom"

            list_id = f"sa-seg-{seg_id}"
            db_status = "active" if seg_active else "paused"

            # Upsert ABM list
            upsert_abm_list(cur, list_id, seg_name, "stackadapt", list_type,
                          description=s.get("description") or f"StackAdapt segment",
                          count=audience_size, status=db_status)

            # Upsert health record
            flags = []
            if audience_size < 500:
                flags.append("undersized")

            upsert_abm_list_health(cur, list_id, "stackadapt", audience_size,
                                  platform_segment_id=seg_id,
                                  platform_segment_name=seg_name,
                                  flags=flags)

            synced += 1

        except Exception as e:
            errors += 1
            print(f"  ⚠ Error syncing segment {s.get('id','?')}: {e}")

    print(f"  Synced {synced} segments ({errors} errors)")

    conn.commit()
    cur.close()
    conn.close()
    print("  StackAdapt sync complete ✅")


# ─── Main ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ABM Sync Agent")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing to DB")
    parser.add_argument("--platform", choices=["linkedin", "stackadapt", "all"], default="all",
                       help="Which platform to sync")
    args = parser.parse_args()

    print(f"ABM Sync Agent — {datetime.now(timezone.utc).isoformat()}")
    print(f"Platform: {args.platform} | Dry run: {args.dry_run}")

    start = time.time()

    if args.platform in ("linkedin", "all"):
        try:
            sync_linkedin(dry_run=args.dry_run)
        except Exception as e:
            print(f"❌ LinkedIn sync failed: {e}")
            traceback.print_exc()

    if args.platform in ("stackadapt", "all"):
        try:
            sync_stackadapt(dry_run=args.dry_run)
        except Exception as e:
            print(f"❌ StackAdapt sync failed: {e}")
            traceback.print_exc()

    elapsed = time.time() - start
    print(f"\nABM Sync complete in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
