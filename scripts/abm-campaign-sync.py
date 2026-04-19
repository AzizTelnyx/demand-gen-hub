#!/usr/bin/env python3
"""
ABM Campaign-Centric Sync Agent
================================
Syncs ABM audience data between ad platforms and the DG Hub DB.

Campaign-centric model: the unit of work is the campaign-segment relationship,
not the segment alone. Each row in ABMCampaignSegment represents one segment
attached to one active campaign, with performance and health data.

Daily run (6 AM PST):
1. Pull ACTIVE campaigns from each platform
2. For each active campaign, pull targeting → which segments are attached
3. Pull performance (30d) + segment sizes
4. Upsert into ABMCampaignSegment
5. For StackAdapt: pull B2B domain report → enrich + relevance score
6. Compute health flags
7. Archive inactive campaign-segment pairs

Run: python scripts/abm-campaign-sync.py [--dry-run] [--platform linkedin|stackadapt|google_ads|all]
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

# ─── Config ───────────────────────────────────────────

AGENT_SLUG = "abm-campaign-sync"
AGENT_NAME = "ABM Campaign-Centric Sync Agent"

DB_URL = "postgresql://localhost:5432/dghub"

LOG_DIR = os.path.expanduser("~/.openclaw/workspace/demand-gen-hub/logs/abm-sync")
os.makedirs(LOG_DIR, exist_ok=True)

PSQL = "/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"

# ─── DB Helpers ────────────────────────────────────────

def get_db():
    return psycopg2.connect(DB_URL)


def upsert_campaign_segment(cur, campaign_id, campaign_name, campaign_status,
                             campaign_budget, platform, parsed_product, parsed_variant,
                             parsed_intent, segment_id, segment_name, segment_type,
                             segment_size, segment_source, segment_writable,
                             impressions, clicks, spend, conversions,
                             ctr, cpc, cpm, health_flags):
    """Upsert a campaign-segment relationship."""
    now = datetime.now(timezone.utc)
    cur.execute("""
        INSERT INTO "ABMCampaignSegment" (
            "campaignId", "campaignName", "campaignStatus", "campaignBudget",
            platform, "parsedProduct", "parsedVariant", "parsedIntent",
            "segmentId", "segmentName", "segmentType", "segmentSize",
            "segmentSource", "segmentWritable",
            "impressions30d", "clicks30d", "spend30d", "conversions30d",
            "ctr30d", "cpc30d", "cpm30d", "healthFlags",
            "lastSyncedAt", "createdAt", "updatedAt"
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT ("campaignId", "segmentId", platform) DO UPDATE SET
            "campaignName" = EXCLUDED."campaignName",
            "campaignStatus" = EXCLUDED."campaignStatus",
            "campaignBudget" = EXCLUDED."campaignBudget",
            "parsedProduct" = EXCLUDED."parsedProduct",
            "parsedVariant" = EXCLUDED."parsedVariant",
            "parsedIntent" = EXCLUDED."parsedIntent",
            "segmentName" = EXCLUDED."segmentName",
            "segmentType" = EXCLUDED."segmentType",
            "segmentSize" = EXCLUDED."segmentSize",
            "segmentSource" = EXCLUDED."segmentSource",
            "segmentWritable" = EXCLUDED."segmentWritable",
            "impressions30d" = EXCLUDED."impressions30d",
            "clicks30d" = EXCLUDED."clicks30d",
            "spend30d" = EXCLUDED."spend30d",
            "conversions30d" = EXCLUDED."conversions30d",
            "ctr30d" = EXCLUDED."ctr30d",
            "cpc30d" = EXCLUDED."cpc30d",
            "cpm30d" = EXCLUDED."cpm30d",
            "healthFlags" = EXCLUDED."healthFlags",
            "lastSyncedAt" = EXCLUDED."lastSyncedAt",
            "updatedAt" = EXCLUDED."updatedAt"
    """, (campaign_id, campaign_name, campaign_status, campaign_budget,
          platform, parsed_product, parsed_variant, parsed_intent,
          segment_id, segment_name, segment_type, segment_size,
          segment_source, segment_writable,
          impressions, clicks, spend, conversions,
          ctr, cpc, cpm, json.dumps(health_flags),
          now, now, now))


def compute_health_flags(platform, segment_size, impressions, clicks, ctr, budget, campaign_status):
    """Compute health flags for a campaign-segment pair."""
    flags = []
    
    # Undersized: segment too small for effective delivery
    min_size = {"linkedin": 300, "stackadapt": 500, "google_ads": 100}.get(platform, 300)
    if segment_size is not None and int(segment_size) < min_size:
        flags.append("undersized")
    elif budget and budget > 5000 and segment_size is not None and int(segment_size) < 1000:
        flags.append("undersized")
    
    # Zero impressions: active campaign but no delivery
    if campaign_status in ("enabled", "live", "ACTIVE") and impressions == 0:
        flags.append("zero_impressions")
    
    # Low CTR: below half of platform average
    avg_ctr = {"linkedin": 0.52, "stackadapt": 1.0, "google_ads": 6.39}.get(platform, 1.0)
    if ctr is not None and impressions > 1000 and ctr < avg_ctr * 0.5:
        flags.append("low_ctr")
    
    return flags


# ─── LinkedIn API ─────────────────────────────────────

def load_linkedin_creds():
    path = os.path.expanduser("~/.config/linkedin-ads/credentials.json")
    with open(path) as f:
        return json.load(f)


def li_get(path, token, params=None):
    url = f"https://api.linkedin.com/v2/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def li_get_active_campaigns(token, account_id):
    """Get all ACTIVE campaigns with their parsed context."""
    campaigns = []
    start = 0
    account_urn = f"urn:li:sponsoredAccount:{account_id}"
    while True:
        url = (
            f"https://api.linkedin.com/v2/adCampaignsV2"
            f"?q=search"
            f"&search.account.values[0]={urllib.parse.quote(account_urn)}"
            f"&search.status.values[0]=ACTIVE"
            f"&count=100&start={start}"
        )
        try:
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:500]
            print(f"  LinkedIn campaign fetch error: {e.code} {body}")
            break
        
        elements = data.get("elements", [])
        if not elements:
            break
        campaigns.extend(elements)
        paging = data.get("paging", {})
        total = paging.get("total", 0)
        start += 100
        if start >= total:
            break
    
    return campaigns


def li_get_campaign_targeting(token, campaign_id):
    """Get targeting criteria for a campaign, extracting adSegment URNs."""
    try:
        data = li_get(f"adCampaignsV2/{campaign_id}", token)
        targeting = data.get("targetingCriteria", {})
        return targeting
    except Exception as e:
        print(f"  LinkedIn targeting fetch error for {campaign_id}: {e}")
        return {}


def li_get_all_dmp_segments(token, account_id):
    """Fetch all DMP segments with sizes, return dict of URN → segment data."""
    segments = {}
    start = 0
    while True:
        params = {
            "q": "account",
            "account": f"urn:li:sponsoredAccount:{account_id}",
            "count": 100,
            "start": start,
        }
        try:
            data = li_get("dmpSegments", token, params)
        except urllib.error.HTTPError as e:
            print(f"  LinkedIn DMP segment fetch error: {e.code}")
            break
        
        elements = data.get("elements", [])
        for seg in elements:
            urn = seg.get("id", "")
            segments[urn] = seg
        
        paging = data.get("paging", {})
        total = paging.get("total", 0)
        start += 100
        if start >= total or not elements:
            break
    
    return segments


def extract_ad_segments_from_targeting(targeting):
    """Extract adSegment URNs from LinkedIn targeting criteria.
    
    LinkedIn structures targeting as nested AND/OR with facet keys.
    Segments appear under keys like:
    - urn:li:adTargetingFacet:dynamicSegments
    - urn:li:adTargetingFacet:audienceMatchingSegments
    
    Simplest reliable approach: regex over the JSON string.
    """
    targeting_json = json.dumps(targeting)
    import re
    segments = set(re.findall(r'urn:li:adSegment:\d+', targeting_json))
    return list(segments)


# ─── StackAdapt API ────────────────────────────────────

def load_stackadapt_creds():
    path = os.path.expanduser("~/.config/stackadapt/credentials.json")
    with open(path) as f:
        return json.load(f)


def sa_graphql(query, token, variables=None):
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
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def sa_get_live_campaigns(token, advertiser_id=93053):
    """Get all LIVE campaigns with their custom segments."""
    # Split into two queries to stay under SA's 40K query cost limit
    # Query 1: campaigns with group IDs only
    query1 = """
    {
      campaigns(filterBy: { advertiserIds: [%d], states: [LIVE] }, first: 500) {
        nodes {
          id name
          campaignGroup { id }
        }
      }
    }
    """ % advertiser_id
    
    data1 = sa_graphql(query1, token)
    errors = data1.get("errors", [])
    if errors:
        print(f"  StackAdapt campaign fetch errors: {[e.get('message') for e in errors[:3]]}")
        return []
    
    camp_nodes = data1.get("data", {}).get("campaigns", {}).get("nodes", [])
    
    # Query 2: for each campaign, get its audience segments (batched)
    for camp in camp_nodes:
        camp_id = int(camp["id"])
        seg_query = """
        {
          campaigns(filterBy: { ids: [%d] }, first: 1) {
            nodes {
              audience {
                customSegments { nodes { id name size duidSize } }
              }
            }
          }
        }
        """ % camp_id
        try:
            seg_data = sa_graphql(seg_query, token)
            seg_nodes = seg_data.get("data", {}).get("campaigns", {}).get("nodes", [])
            if seg_nodes:
                camp["audience"] = seg_nodes[0].get("audience", {"customSegments": {"nodes": []}})
            else:
                camp["audience"] = {"customSegments": {"nodes": []}}
        except Exception as e:
            camp["audience"] = {"customSegments": {"nodes": []}}
            print(f"  SA segment fetch error for campaign {camp_id}: {e}")
    
    return camp_nodes


def sa_get_campaign_performance(token, campaign_group_id, date_from, date_to):
    """Get campaign-level performance for a campaign group."""
    query = """
    {
      campaignDelivery(
        filterBy: { campaignGroupIds: [%s] }
        date: { from: "%s", to: "%s" }
        granularity: TOTAL
        dataType: TABLE
      ) {
        ... on CampaignDeliveryOutcome {
          records(first: 1) {
            nodes {
              campaign { id name }
              metrics { impressionsBigint clicksBigint cost ctr conversionsBigint }
            }
          }
        }
      }
    }
    """ % (campaign_group_id, date_from, date_to)
    
    try:
        data = sa_graphql(query, token)
        records = data.get("data", {}).get("campaignDelivery", {}).get("records", {}).get("nodes", [])
        if records:
            m = records[0].get("metrics", {})
            return {
                "impressions": int(m.get("impressionsBigint", 0) or 0),
                "clicks": int(m.get("clicksBigint", 0) or 0),
                "spend": float(m.get("cost", 0) or 0),
                "conversions": int(m.get("conversionsBigint", 0) or 0),
                "ctr": float(m.get("ctr", 0) or 0),
            }
    except Exception as e:
        print(f"  StackAdapt performance fetch error: {e}")
    return {"impressions": 0, "clicks": 0, "spend": 0, "conversions": 0, "ctr": 0}


# ─── Google Ads (campaign-level only) ─────────────────

def sync_google_ads(cur, dry_run=False):
    """Sync Google Ads campaigns → ABMCampaignSegment.
    
    Google Ads doesn't provide domain-level data. We use campaign-level
    CampaignAudience entries to identify user lists / Customer Match.
    """
    print("\n📊 Syncing Google Ads...")
    
    # Get active Google Ads campaigns from Campaign table
    cur.execute("""
        SELECT id, name, status, budget, impressions, clicks, spend, conversions,
               "parsedProduct", "parsedVariant", "parsedIntent"
        FROM "Campaign"
        WHERE platform = 'google_ads' AND status IN ('enabled', 'ACTIVE')
    """)
    campaigns = cur.fetchall()
    print(f"  Found {len(campaigns)} active Google Ads campaigns")
    
    synced = 0
    for row in campaigns:
        (camp_id, camp_name, camp_status, budget, impressions, clicks,
         spend, conversions, parsed_product, parsed_variant, parsed_intent) = row
        
        # Get audience targeting from CampaignAudience
        cur.execute("""
            SELECT "audienceType", name, value
            FROM "CampaignAudience"
            WHERE "campaignId" = %s AND platform = 'google_ads'
              AND "audienceType" IN ('audience_segment', 'matched_audience')
        """, (camp_id,))
        audiences = cur.fetchall()
        
        if not audiences:
            continue
        
        for aud_type, aud_name, aud_value in audiences:
            # Determine segment type
            seg_type = "customer_match" if aud_type == "matched_audience" else "audience_segment"
            
            # Compute metrics
            imp = impressions or 0
            clk = clicks or 0
            spn = float(spend or 0)
            conv = conversions or 0
            ctr = (clk / imp * 100) if imp > 0 else None
            cpc = (spn / clk) if clk > 0 else None
            cpm = (spn / imp * 1000) if imp > 0 else None
            
            flags = compute_health_flags("google_ads", None, imp, clk, ctr, budget, camp_status)
            
            if not dry_run:
                upsert_campaign_segment(
                    cur, camp_id, camp_name, camp_status, budget,
                    "google_ads", parsed_product, parsed_variant, parsed_intent,
                    aud_value or aud_name, aud_name, seg_type,
                    None, None, False,
                    imp, clk, spn, conv, ctr, cpc, cpm, flags
                )
            synced += 1
    
    print(f"  Synced {synced} campaign-segment pairs")
    return synced


# ─── LinkedIn Sync ─────────────────────────────────────

def sync_linkedin(cur, dry_run=False):
    """Sync LinkedIn campaigns → ABMCampaignSegment."""
    print("\n💼 Syncing LinkedIn...")
    
    creds = load_linkedin_creds()
    token = creds["access_token"]
    account_id = creds["ad_account_id"]
    
    # Get all DMP segments (for name/size lookup)
    print("  Fetching DMP segments...")
    segments_map = li_get_all_dmp_segments(token, account_id)
    print(f"  Found {len(segments_map)} DMP segments from API")
    
    # Also load segment names + sizes from ABMListHealth (more reliable for names)
    cur.execute("""
        SELECT h.\"platformSegmentId\", l.name, h.\"audienceSize\"
        FROM \"ABMListHealth\" h
        JOIN \"ABMList\" l ON h.\"listId\" = l.id
        WHERE h.platform = 'linkedin' AND h.\"platformSegmentId\" IS NOT NULL
    """)
    li_segment_lookup = {}
    for row in cur.fetchall():
        urn, name, size = row
        li_segment_lookup[urn] = {"name": name, "size": size}
    print(f"  Loaded {len(li_segment_lookup)} segment names from DB")
    
    # Get active campaigns
    print("  Fetching active campaigns...")
    campaigns = li_get_active_campaigns(token, account_id)
    print(f"  Found {len(campaigns)} active campaigns")
    
    synced = 0
    for camp in campaigns:
        camp_id = camp.get("id", "")
        camp_name = camp.get("name", "")  # localized name
        camp_status = "enabled"
        
        # Get parsed context from DB (match by LI platformId or li_ prefixed id)
        cur.execute("""
            SELECT id, "parsedProduct", "parsedVariant", "parsedIntent", budget
            FROM "Campaign" WHERE "platformId" = %s OR id = %s
        """, (str(camp_id), f"li_{camp_id}"))
        row = cur.fetchone()
        if not row:
            continue
        db_camp_id = row[0]
        parsed_product = row[1]
        parsed_variant = row[2]
        parsed_intent = row[3]
        budget = float(row[4]) if row[4] else None
        
        # Get targeting for this campaign
        targeting = li_get_campaign_targeting(token, camp_id)
        ad_segments = extract_ad_segments_from_targeting(targeting)
        
        # Get campaign-level performance from DB
        cur.execute("""
            SELECT impressions, clicks, spend, conversions
            FROM "Campaign"
            WHERE "platformId" = %s OR id = %s
        """, (str(camp_id), f"li_{camp_id}"))
        perf_row = cur.fetchone()
        imp = perf_row[0] if perf_row and perf_row[0] else 0
        clk = perf_row[1] if perf_row and perf_row[1] else 0
        spn = float(perf_row[2]) if perf_row and perf_row[2] else 0
        conv = perf_row[3] if perf_row and perf_row[3] else 0
        
        # LinkedIn doesn't break down performance per segment — attribute campaign-level to each
        for seg_urn in ad_segments:
            # Look up segment details — prefer DB lookup (has human-readable names), fall back to API
            db_info = li_segment_lookup.get(seg_urn, {})
            seg_data = segments_map.get(seg_urn, {})
            
            seg_name = db_info.get("name") or seg_data.get("name", "")
            if not seg_name:
                # Extract numeric ID from URN as fallback
                seg_name = seg_urn.split(":")[-1] if ":" in seg_urn else seg_urn
            
            seg_size = db_info.get("size")
            if seg_size is None:
                # Try from API data
                for dest in seg_data.get("destinations", []):
                    if dest.get("audienceSize"):
                        seg_size = int(dest["audienceSize"])
                        break
            
            # Determine segment type and source
            seg_type_val = seg_data.get("type", "DMP")
            if "COMPANY" in str(seg_type_val):
                seg_type = "company_list"
            elif "USER" in str(seg_type_val):
                seg_type = "intent_vector"
            else:
                seg_type = "abm_segment"
            
            seg_source = "linkedin_native"
            seg_writable = False
            seg_name_lower = str(seg_name).lower()
            if "hockeystack" in seg_name_lower:
                seg_source = "hockeystack"
            elif "salesforce" in seg_name_lower or "sf " in seg_name_lower:
                seg_source = "salesforce"
            elif any(kw in seg_name_lower for kw in ["research", "ares", "apac", "emea"]):
                seg_source = "ares-built"
                seg_writable = True
            elif "vector" in seg_name_lower:
                seg_source = "ares-built"
                seg_writable = True
            
            ctr = (clk / imp * 100) if imp > 0 else None
            cpc = (spn / clk) if clk > 0 else None
            cpm = (spn / imp * 1000) if imp > 0 else None
            
            flags = compute_health_flags("linkedin", seg_size, imp, clk, ctr, budget, camp_status)
            
            if not dry_run:
                upsert_campaign_segment(
                    cur, db_camp_id, camp_name, camp_status, budget,
                    "linkedin", parsed_product, parsed_variant, parsed_intent,
                    seg_urn, seg_name, seg_type, seg_size, seg_source, seg_writable,
                    imp, clk, spn, conv, ctr, cpc, cpm, flags
                )
            synced += 1
    
    print(f"  Synced {synced} campaign-segment pairs")
    return synced


# ─── StackAdapt Sync ───────────────────────────────────

def sync_stackadapt(cur, dry_run=False):
    """Sync StackAdapt campaigns → ABMCampaignSegment."""
    print("\n📊 Syncing StackAdapt...")
    
    creds = load_stackadapt_creds()
    token = creds["graphql"]["token"]
    advertiser_id = 93053
    
    # Get live campaigns with their segments
    print("  Fetching live campaigns...")
    campaigns = sa_get_live_campaigns(token, advertiser_id)
    print(f"  Found {len(campaigns)} live campaigns")
    
    # Date range for performance (30 days)
    date_to = datetime.now().strftime("%Y-%m-%d")
    date_from = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    
    synced = 0
    for camp in campaigns:
        camp_id = str(camp["id"])
        camp_name = camp.get("name", "")
        camp_status = "live"
        camp_group_id = camp.get("campaignGroup", {}).get("id", camp_id)
        budget = None  # SA doesn't expose budget directly in this query
        
        # Get parsed context from DB (match by SA platformId)
        cur.execute("""
            SELECT id, "parsedProduct", "parsedVariant", "parsedIntent", budget
            FROM "Campaign" WHERE "platformId" = %s AND platform = 'stackadapt'
        """, (str(camp_id),))
        row = cur.fetchone()
        if not row:
            # Skip campaigns not in our DB
            continue
        db_camp_id = row[0]
        parsed_product = row[1]
        parsed_variant = row[2]
        parsed_intent = row[3]
        budget = float(row[4]) if row[4] else None
        
        # Get campaign-level performance
        perf = sa_get_campaign_performance(token, camp_group_id, date_from, date_to)
        imp = perf["impressions"]
        clk = perf["clicks"]
        spn = perf["spend"]
        conv = perf["conversions"]
        ctr = perf["ctr"]
        cpc = (spn / clk) if clk > 0 else None
        cpm = (spn / imp * 1000) if imp > 0 else None
        
        # Get custom segments attached to this campaign
        custom_segments = camp.get("audience", {}).get("customSegments", {}).get("nodes", [])
        
        for seg in custom_segments:
            seg_id = str(seg["id"])
            seg_name = seg.get("name", "")
            seg_size = seg.get("size")  # None if not yet computed
            
            # Determine source from segment name
            seg_source = "stackadapt"
            seg_name_lower = seg_name.lower()
            if any(kw in seg_name_lower for kw in ["research", "ares", "apac", "emea", "voice ai"]):
                seg_source = "ares-built"
            elif "123push" in seg_name_lower:
                seg_source = "third_party"
            elif "statsocial" in seg_name_lower:
                seg_source = "third_party"
            elif "bombora" in seg_name_lower:
                seg_source = "third_party"
            
            seg_writable = seg_source == "ares-built"
            
            flags = compute_health_flags("stackadapt", seg_size, imp, clk, ctr, budget, camp_status)
            
            if not dry_run:
                upsert_campaign_segment(
                    cur, db_camp_id, camp_name, camp_status, budget,
                    "stackadapt", parsed_product, parsed_variant, parsed_intent,
                    seg_id, seg_name, "abm_audience", seg_size, seg_source, seg_writable,
                    imp, clk, spn, conv, ctr, cpc, cpm, flags
                )
            synced += 1
    
    print(f"  Synced {synced} campaign-segment pairs")
    return synced


# ─── Main ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ABM Campaign-Centric Sync")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done")
    parser.add_argument("--platform", choices=["linkedin", "stackadapt", "google_ads", "all"],
                       default="all", help="Sync only a specific platform")
    args = parser.parse_args()
    
    print(f"🚀 {AGENT_NAME} starting...")
    print(f"   Dry run: {args.dry_run}")
    print(f"   Platform: {args.platform}")
    
    conn = get_db()
    cur = conn.cursor()
    
    # Clear existing data for full refresh (campaign-centric = always rebuild)
    if not args.dry_run:
        cur.execute('DELETE FROM "ABMCampaignSegment"')
        print("  Cleared existing ABMCampaignSegment data for full refresh")
    
    total = 0
    
    try:
        if args.platform in ("stackadapt", "all"):
            total += sync_stackadapt(cur, args.dry_run)
        
        if args.platform in ("linkedin", "all"):
            total += sync_linkedin(cur, args.dry_run)
        
        if args.platform in ("google_ads", "all"):
            total += sync_google_ads(cur, args.dry_run)
        
        if not args.dry_run:
            conn.commit()
            print(f"\n✅ Synced {total} campaign-segment pairs total")
        else:
            print(f"\n📋 Dry run: would sync {total} campaign-segment pairs")
        
        # Print summary
        cur.execute("""
            SELECT platform, count(*), 
                   count(CASE WHEN "healthFlags" @> '["undersized"]'::jsonb THEN 1 END) as undersized,
                   count(CASE WHEN "healthFlags" @> '["zero_impressions"]'::jsonb THEN 1 END) as zero_imp,
                   count(CASE WHEN "healthFlags" @> '["low_ctr"]'::jsonb THEN 1 END) as low_ctr
            FROM "ABMCampaignSegment"
            GROUP BY platform
        """)
        print("\n📊 Summary by platform:")
        print(f"  {'Platform':<12} {'Total':>6} {'Undersized':>11} {'Zero Imp':>9} {'Low CTR':>8}")
        for row in cur.fetchall():
            print(f"  {row[0]:<12} {row[1]:>6} {row[2]:>11} {row[3]:>9} {row[4]:>8}")
    
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Sync failed: {e}")
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
