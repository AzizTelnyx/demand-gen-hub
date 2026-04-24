#!/usr/bin/env python3
"""
Sync audience/targeting data from ad platforms into CampaignAudience table.

Supports: Google Ads (keywords, geo, audiences), LinkedIn (targeting criteria),
StackAdapt (segments), Reddit (subreddits, interests).

Runnable standalone or callable from sync_local.py.
"""

import json
import os
import sys
import uuid
import signal
import time
from datetime import datetime, timezone

# Default timeout per platform audience sync (seconds)
SYNC_TIMEOUT = int(os.environ.get("AUDIENCE_SYNC_TIMEOUT", "600"))  # 10 min default


def _timeout_handler(signum, frame):
    raise TimeoutError(f"Audience sync exceeded {SYNC_TIMEOUT}s timeout")


def with_timeout(func, timeout_seconds=None):
    """Run a sync function with a timeout. Returns 0 on timeout."""
    secs = timeout_seconds or SYNC_TIMEOUT
    old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(secs)
    try:
        result = func()
        signal.alarm(0)
        return result
    except TimeoutError as e:
        print(f"  ⏱ {e}")
        return 0
    except Exception as e:
        signal.alarm(0)
        raise
    finally:
        signal.signal(signal.SIGALRM, old_handler)

# Use the local venv
VENV_SITE = os.path.expanduser("~/.venv/lib")
for d in os.listdir(VENV_SITE):
    sp = os.path.join(VENV_SITE, d, "site-packages")
    if os.path.isdir(sp) and sp not in sys.path:
        sys.path.insert(0, sp)

import psycopg2

DB_URL = "postgresql://azizalsinafi@localhost:5432/dghub"
GOOGLE_ADS_CUSTOMER_ID = "2356650573"


def get_db():
    return psycopg2.connect(DB_URL)


def upsert_audience(cur, campaign_id, platform, audience_type, name, value=None,
                    match_type=None, status=None, metadata=None):
    """Upsert an audience record. Dedup by campaignId + platform + audienceType + name + value."""
    cur.execute('''
        SELECT id FROM "CampaignAudience"
        WHERE "campaignId" = %s AND platform = %s AND "audienceType" = %s
              AND name = %s AND COALESCE(value, '') = COALESCE(%s, '')
    ''', (campaign_id, platform, audience_type, name, value))
    existing = cur.fetchone()

    now = datetime.now(timezone.utc)
    if existing:
        cur.execute('''
            UPDATE "CampaignAudience" SET
                "matchType" = COALESCE(%s, "matchType"),
                status = COALESCE(%s, status),
                metadata = COALESCE(%s, metadata),
                "lastSyncedAt" = %s, "updatedAt" = %s
            WHERE id = %s
        ''', (match_type, status, json.dumps(metadata) if metadata else None, now, now, existing[0]))
    else:
        cur.execute('''
            INSERT INTO "CampaignAudience"
                (id, "campaignId", platform, "audienceType", name, value, "matchType", status, metadata, "lastSyncedAt", "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ''', (
            str(uuid.uuid4()), campaign_id, platform, audience_type, name, value,
            match_type, status, json.dumps(metadata) if metadata else None,
            now, now, now,
        ))


def get_campaign_map(conn, platform):
    """Get mapping of platformId → Campaign.id for a given platform."""
    cur = conn.cursor()
    cur.execute('SELECT id, "platformId" FROM "Campaign" WHERE platform = %s', (platform,))
    return {row[1]: row[0] for row in cur.fetchall()}


# ─── Google Ads ───────────────────────────────────────

def sync_google_ads_audiences(conn):
    """Sync keywords, geo targets, and audience segments from Google Ads."""
    print("Syncing Google Ads audiences...")

    try:
        from google.ads.googleads.client import GoogleAdsClient

        yaml_path = os.path.expanduser("~/.config/google-ads/google-ads.yaml")
        json_path = os.path.expanduser("~/.config/google-ads/credentials.json")

        if os.path.exists(yaml_path):
            client = GoogleAdsClient.load_from_storage(yaml_path)
        elif os.path.exists(json_path):
            with open(json_path) as f:
                creds = json.load(f)
            client = GoogleAdsClient.load_from_dict({
                "developer_token": creds["developer_token"],
                "client_id": creds["client_id"],
                "client_secret": creds["client_secret"],
                "refresh_token": creds["refresh_token"],
                "login_customer_id": str(creds.get("login_customer_id", "2893524941")),
                "use_proto_plus": True,
            })
        else:
            print("  No Google Ads credentials found")
            return 0

        ga = client.get_service("GoogleAdsService")
        camp_map = get_campaign_map(conn, "google_ads")
        cur = conn.cursor()
        total = 0

        MATCH_TYPE_MAP = {0: "UNSPECIFIED", 1: "UNKNOWN", 2: "EXACT", 3: "PHRASE", 4: "BROAD"}
        STATUS_MAP = {0: "UNSPECIFIED", 1: "UNKNOWN", 2: "ENABLED", 3: "PAUSED", 4: "REMOVED"}

        # 1. Keywords (from ad group criteria)
        print("  Fetching keywords...")
        kw_query = """
            SELECT campaign.id, ad_group_criterion.keyword.text,
                   ad_group_criterion.keyword.match_type,
                   ad_group_criterion.status, ad_group_criterion.negative
            FROM ad_group_criterion
            WHERE ad_group_criterion.type = 'KEYWORD'
            AND campaign.status != 'REMOVED'
        """
        try:
            kw_count = 0
            for row in ga.search(customer_id=GOOGLE_ADS_CUSTOMER_ID, query=kw_query, page_size=1000):
                cid = str(row.campaign.id)
                db_id = camp_map.get(cid)
                if not db_id:
                    continue
                kw_text = row.ad_group_criterion.keyword.text
                match_raw = row.ad_group_criterion.keyword.match_type
                match_type = MATCH_TYPE_MAP.get(match_raw, str(match_raw)).lower()
                status_raw = row.ad_group_criterion.status
                status = STATUS_MAP.get(status_raw, str(status_raw)).lower()
                is_negative = row.ad_group_criterion.negative

                upsert_audience(cur, db_id, "google_ads",
                               "negative_keyword" if is_negative else "keyword",
                               kw_text, match_type=match_type, status=status)
                kw_count += 1
                if kw_count % 5000 == 0:
                    print(f"    ...{kw_count} keywords so far")
            total += kw_count
            print(f"    {kw_count} keywords")
        except Exception as e:
            print(f"    Keywords error: {e}")

        # 2. Geo targets (campaign criteria)
        print("  Fetching geo targets...")
        geo_query = """
            SELECT campaign.id, campaign_criterion.location.geo_target_constant,
                   campaign_criterion.negative
            FROM campaign_criterion
            WHERE campaign_criterion.type = 'LOCATION'
            AND campaign.status != 'REMOVED'
        """
        try:
            geo_count = 0
            for row in ga.search(customer_id=GOOGLE_ADS_CUSTOMER_ID, query=geo_query, page_size=1000):
                cid = str(row.campaign.id)
                db_id = camp_map.get(cid)
                if not db_id:
                    continue
                geo_constant = row.campaign_criterion.location.geo_target_constant
                is_negative = row.campaign_criterion.negative
                # geo_constant is like "geoTargetConstants/2840" (US)
                geo_id = geo_constant.split("/")[-1] if "/" in geo_constant else geo_constant

                upsert_audience(cur, db_id, "google_ads",
                               "geo_exclude" if is_negative else "geo",
                               geo_constant, value=geo_id)
                geo_count += 1
            total += geo_count
            print(f"    {geo_count} geo targets")
        except Exception as e:
            print(f"    Geo targets error: {e}")

        # 3. Audience segments (campaign-level user lists)
        print("  Fetching audience segments...")
        aud_query = """
            SELECT campaign.id, campaign_criterion.user_list.user_list,
                   campaign_criterion.negative
            FROM campaign_criterion
            WHERE campaign_criterion.type = 'USER_LIST'
            AND campaign.status != 'REMOVED'
        """
        try:
            aud_count = 0
            for row in ga.search(customer_id=GOOGLE_ADS_CUSTOMER_ID, query=aud_query, page_size=1000):
                cid = str(row.campaign.id)
                db_id = camp_map.get(cid)
                if not db_id:
                    continue
                user_list = row.campaign_criterion.user_list.user_list
                is_negative = row.campaign_criterion.negative
                list_id = user_list.split("/")[-1] if "/" in user_list else user_list

                upsert_audience(cur, db_id, "google_ads",
                               "audience_exclude" if is_negative else "audience_segment",
                               user_list, value=list_id)
                aud_count += 1
            total += aud_count
            print(f"    {aud_count} audience segments")
        except Exception as e:
            print(f"    Audience segments error: {e}")

        conn.commit()
        print(f"  Total: {total} Google Ads audience records")
        return total

    except Exception as e:
        print(f"  Error: {e}")
        import traceback
        traceback.print_exc()
        return 0


# ─── LinkedIn ─────────────────────────────────────────

def sync_linkedin_audiences(conn):
    """Sync targeting criteria from LinkedIn campaigns."""
    print("Syncing LinkedIn audiences...")

    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from platforms import get_connector

        li = get_connector("linkedin")
        if not li._token:
            li.load_credentials()
        if not li._token:
            print("  No LinkedIn credentials")
            return 0

        camp_map = get_campaign_map(conn, "linkedin")
        cur = conn.cursor()
        total = 0

        # Fetch all campaigns with targeting criteria
        all_camps = li._fetch_all_campaigns()

        for camp in all_camps:
            cid = str(camp["id"])
            db_id = camp_map.get(cid)
            if not db_id:
                continue

            # LinkedIn targeting is in the campaign object under targetingCriteria
            targeting = camp.get("targetingCriteria", {})
            if not targeting:
                # Try fetching individually
                try:
                    import urllib.parse
                    url = f"https://api.linkedin.com/v2/adCampaignsV2/{cid}?fields=targetingCriteria"
                    data = li._api_get(url)
                    targeting = data.get("targetingCriteria", {})
                except Exception:
                    continue

            includes = targeting.get("include", {}).get("and", [])
            for clause in includes:
                or_clause = clause.get("or", {})
                for facet, values in or_clause.items():
                    # facet is like "urn:li:adTargetingFacet:titles"
                    facet_name = facet.split(":")[-1] if ":" in facet else facet
                    audience_type_map = {
                        "titles": "job_title", "industries": "industry",
                        "staffCountRanges": "company_size", "seniorities": "demographic",
                        "locations": "geo", "interfaceLocales": "geo",
                        "skills": "interest", "degrees": "demographic",
                        "fieldsOfStudy": "interest", "memberGroups": "interest",
                        "employers": "matched_audience",
                    }
                    audience_type = audience_type_map.get(facet_name, "audience_segment")

                    for val in values:
                        name = val if isinstance(val, str) else str(val)
                        upsert_audience(cur, db_id, "linkedin", audience_type, name)
                        total += 1

        conn.commit()
        print(f"  Total: {total} LinkedIn audience records")
        return total

    except Exception as e:
        print(f"  Error: {e}")
        import traceback
        traceback.print_exc()
        return 0


# ─── Reddit ───────────────────────────────────────────

def sync_reddit_audiences(conn):
    """Sync subreddit and interest targeting from Reddit campaigns."""
    print("Syncing Reddit audiences...")

    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from platforms import get_connector

        reddit = get_connector("reddit")
        camps = reddit.fetch_campaigns(active_only=False)
        camp_map = get_campaign_map(conn, "reddit")
        cur = conn.cursor()
        total = 0

        for camp in camps:
            db_id = camp_map.get(camp.external_id)
            if not db_id:
                continue

            targeting = camp.extra.get("targeting", {})

            # Communities (subreddits)
            for community in targeting.get("communities", []):
                upsert_audience(cur, db_id, "reddit", "subreddit", community)
                total += 1

            # Interests
            for interest in targeting.get("interests", []):
                upsert_audience(cur, db_id, "reddit", "interest", interest)
                total += 1

            # Geolocations
            for geo in targeting.get("geolocations", []):
                upsert_audience(cur, db_id, "reddit", "geo", geo)
                total += 1

            # Custom audiences
            if targeting.get("has_custom_audience"):
                upsert_audience(cur, db_id, "reddit", "matched_audience", "custom_audience")
                total += 1

        conn.commit()
        print(f"  Total: {total} Reddit audience records")
        return total

    except Exception as e:
        print(f"  Error: {e}")
        import traceback
        traceback.print_exc()
        return 0


# ─── StackAdapt ───────────────────────────────────────

def sync_stackadapt_audiences(conn):
    """Sync audience segments from StackAdapt campaigns."""
    print("Syncing StackAdapt audiences...")

    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from platforms import get_connector

        sa = get_connector("stackadapt")
        if not sa._token:
            sa.load_credentials()
        if not sa._token:
            print("  No StackAdapt credentials")
            return 0

        camp_map = get_campaign_map(conn, "stackadapt")
        cur = conn.cursor()
        total = 0

        # Fetch campaign targeting via GraphQL
        query = """
        {
          campaigns(filterBy: { advertiserIds: [93053] }, first: 500) {
            nodes {
              id name
              audiences { nodes { id name } }
              contextualTargeting { nodes { id name } }
              geoTargets { nodes { id name geoType } }
            }
          }
        }
        """
        try:
            data = sa._gql(query)
            nodes = data.get("data", {}).get("campaigns", {}).get("nodes", [])
        except Exception as e:
            # Fallback: some fields may not be available in the API
            print(f"  GraphQL query failed (some targeting fields may not be available): {e}")
            # Try simpler query
            query2 = """
            {
              campaigns(filterBy: { advertiserIds: [93053] }, first: 500) {
                nodes { id name }
              }
            }
            """
            data = sa._gql(query2)
            nodes = data.get("data", {}).get("campaigns", {}).get("nodes", [])

        for node in nodes:
            cid = str(node["id"])
            db_id = camp_map.get(cid)
            if not db_id:
                continue

            # Audiences
            for aud in (node.get("audiences", {}) or {}).get("nodes", []):
                upsert_audience(cur, db_id, "stackadapt", "audience_segment",
                               aud.get("name", ""), value=str(aud.get("id", "")))
                total += 1

            # Contextual targeting
            for ctx in (node.get("contextualTargeting", {}) or {}).get("nodes", []):
                upsert_audience(cur, db_id, "stackadapt", "contextual",
                               ctx.get("name", ""), value=str(ctx.get("id", "")))
                total += 1

            # Geo targets
            for geo in (node.get("geoTargets", {}) or {}).get("nodes", []):
                upsert_audience(cur, db_id, "stackadapt", "geo",
                               geo.get("name", ""), value=str(geo.get("id", "")),
                               metadata={"geoType": geo.get("geoType")})
                total += 1

        conn.commit()
        print(f"  Total: {total} StackAdapt audience records")
        return total

    except Exception as e:
        print(f"  Error: {e}")
        import traceback
        traceback.print_exc()
        return 0


# ─── Audience Inference (StackAdapt fallback) ─────────

# Product+vertical → audience profile mapping (from knowledge/product-audience-profiles.md)
AUDIENCE_PROFILES = {
    "AI Agent": {
        "titles": ["VP Engineering", "CTO", "Head of Product", "Head of CX"],
        "personas": ["Developers building voice AI", "AI/ML engineers"],
        "industries": ["Tech", "SaaS", "Enterprise Software"],
    },
    "AI Agent+Healthcare": {
        "titles": ["Healthcare IT Director", "CTO/CIO at Hospital Systems", "VP of Patient Experience"],
        "personas": ["Digital health companies", "Telehealth platforms"],
        "industries": ["Healthcare", "Health Tech", "Hospitals"],
    },
    "AI Agent+Fintech": {
        "titles": ["VP Product", "Head of CX", "CTO at Fintech Companies"],
        "personas": ["Payment platform engineers"],
        "industries": ["Fintech", "Banking", "Insurance"],
    },
    "AI Agent+Travel": {
        "titles": ["VP Digital", "Head of CX at Travel Companies"],
        "personas": ["Airline tech", "Hospitality tech buyers"],
        "industries": ["Travel", "Hospitality", "Airlines"],
    },
    "AI Agent+Contact Center": {
        "titles": ["Contact Center Director", "VP of CX", "Head of Operations", "BPO Leader"],
        "industries": ["BPO", "Customer Service", "Enterprise"],
    },
    "AI Agent+Insurance": {
        "titles": ["VP Claims", "Head of CX", "CTO at Insurance Companies"],
        "industries": ["Insurance", "Insurtech"],
    },
    "AI Agent+Banking": {
        "titles": ["VP Digital Banking", "Head of CX", "CTO at Banks"],
        "industries": ["Banking", "Financial Services"],
    },
    "Voice API": {
        "titles": ["Developer", "Engineering Manager", "Telecom Engineer", "VoIP Architect"],
        "personas": ["CPaaS evaluators"],
        "industries": ["Tech", "Telecom", "SaaS"],
    },
    "Voice API+Twilio": {
        "titles": ["Developer", "Engineering Manager", "Telecom Engineer", "VoIP Architect"],
        "personas": ["Twilio users evaluating alternatives"],
        "industries": ["Tech", "Telecom", "SaaS"],
    },
    "SIP": {
        "titles": ["Telecom Engineer", "IT Director", "VoIP Admin", "UCaaS Buyer"],
        "industries": ["Telecom", "Enterprise IT", "MSPs"],
    },
    "SMS": {
        "titles": ["Product Manager", "Growth Engineer", "Marketing Ops"],
        "personas": ["Developers building notifications/2FA"],
        "industries": ["E-commerce", "SaaS", "Fintech"],
    },
    "Numbers": {
        "titles": ["Telecom Buyer", "IT Procurement", "Developer"],
        "industries": ["Telecom", "Enterprise", "Contact Centers"],
    },
    "IoT SIM": {
        "titles": ["IoT Platform Engineer", "Fleet Manager", "Connected Device PM", "M2M Architect"],
        "industries": ["IoT", "Logistics", "Fleet", "Utilities", "Manufacturing"],
    },
    "RCS": {
        "titles": ["Product Manager", "Growth Engineer", "Marketing Ops"],
        "industries": ["E-commerce", "SaaS", "Retail", "Fintech"],
    },
}


def _get_profile_key(product, variant):
    """Build lookup key for AUDIENCE_PROFILES from product + variant."""
    if not product:
        return None
    # Check if variant is a vertical (not a competitor or sub-brand)
    verticals = {"Healthcare", "Fintech", "Travel", "Contact Center", "Insurance", "Banking", "BPO"}
    if variant and variant in verticals:
        key = f"{product}+{variant}"
        if key in AUDIENCE_PROFILES:
            return key
    # Check competitor-based keys (e.g., Twilio)
    if variant:
        key = f"{product}+{variant}"
        if key in AUDIENCE_PROFILES:
            return key
    return product if product in AUDIENCE_PROFILES else None


def infer_stackadapt_audiences(conn):
    """
    Fallback audience inference for StackAdapt campaigns with no audience data.
    Priority: 1) cross-platform match, 2) name-based inference from profiles.
    """
    print("Inferring audiences for StackAdapt campaigns...")
    cur = conn.cursor()

    # Find StackAdapt campaigns with zero audience records
    cur.execute('''
        SELECT c.id, c.name, c."parsedProduct", c."parsedIntent", c."parsedVariant", c."parsedRegion"
        FROM "Campaign" c
        LEFT JOIN "CampaignAudience" a ON c.id = a."campaignId"
        WHERE c.platform = 'stackadapt'
        GROUP BY c.id
        HAVING COUNT(a.id) = 0
    ''')
    no_audience = cur.fetchall()
    if not no_audience:
        print("  All StackAdapt campaigns already have audiences.")
        return 0

    print(f"  {len(no_audience)} StackAdapt campaigns missing audience data")

    total_inferred = 0

    for camp_id, name, product, intent, variant, region in no_audience:
        # Strategy 1: Cross-platform match (same product + region + intent on another platform)
        if product and intent and region:
            cur.execute('''
                SELECT c2.id FROM "Campaign" c2
                JOIN "CampaignAudience" a2 ON c2.id = a2."campaignId"
                WHERE c2.platform != 'stackadapt'
                  AND c2."parsedProduct" = %s AND c2."parsedIntent" = %s AND c2."parsedRegion" = %s
                GROUP BY c2.id
                HAVING COUNT(a2.id) > 0
                LIMIT 1
            ''', (product, intent, region))
            match = cur.fetchone()
            if match:
                source_id = match[0]
                # Copy audience records as inferred
                cur.execute('''
                    SELECT platform, "audienceType", name, value, "matchType", status
                    FROM "CampaignAudience" WHERE "campaignId" = %s
                ''', (source_id,))
                rows = cur.fetchall()
                for plat, atype, aname, aval, amatch, astatus in rows:
                    upsert_audience(cur, camp_id, "stackadapt", "inferred",
                                    aname, value=aval, match_type=amatch, status=astatus,
                                    metadata={"source": "cross_platform", "sourceId": source_id,
                                              "originalType": atype})
                    total_inferred += 1
                print(f"    ✓ {name}: {len(rows)} records from cross-platform match")
                continue

        # Strategy 2: Name-based inference from product-audience profiles
        profile_key = _get_profile_key(product, variant)
        if profile_key:
            profile = AUDIENCE_PROFILES[profile_key]
            count = 0
            for title in profile.get("titles", []):
                upsert_audience(cur, camp_id, "stackadapt", "inferred",
                                title, value=None,
                                metadata={"source": "name_inference", "profile": profile_key,
                                           "category": "job_title"})
                count += 1
            for persona in profile.get("personas", []):
                upsert_audience(cur, camp_id, "stackadapt", "inferred",
                                persona, value=None,
                                metadata={"source": "name_inference", "profile": profile_key,
                                           "category": "persona"})
                count += 1
            for industry in profile.get("industries", []):
                upsert_audience(cur, camp_id, "stackadapt", "inferred",
                                industry, value=None,
                                metadata={"source": "name_inference", "profile": profile_key,
                                           "category": "industry"})
                count += 1
            total_inferred += count
            print(f"    ✓ {name}: {count} records from profile '{profile_key}'")
            continue

        # Strategy 3: Skip
        print(f"    – {name}: no match, skipped")

    conn.commit()
    print(f"  Total inferred: {total_inferred} audience records")
    return total_inferred


# ─── Main ─────────────────────────────────────────────

def sync_all_audiences(conn=None):
    """Sync audiences from all platforms. Pass conn or one will be created."""
    own_conn = conn is None
    if own_conn:
        conn = get_db()

    totals = {}
    # Each platform gets its own timeout so one hang doesn't block the rest
    try:
        totals["google_ads"] = with_timeout(lambda: sync_google_ads_audiences(conn))
    except Exception as e:
        print(f"  Google Ads audience sync failed: {e}")
        totals["google_ads"] = 0

    try:
        totals["linkedin"] = with_timeout(lambda: sync_linkedin_audiences(conn))
    except Exception as e:
        print(f"  LinkedIn audience sync failed: {e}")
        totals["linkedin"] = 0

    try:
        totals["reddit"] = with_timeout(lambda: sync_reddit_audiences(conn))
    except Exception as e:
        print(f"  Reddit audience sync failed: {e}")
        totals["reddit"] = 0

    try:
        totals["stackadapt"] = with_timeout(lambda: sync_stackadapt_audiences(conn))
    except Exception as e:
        print(f"  StackAdapt audience sync failed: {e}")
        totals["stackadapt"] = 0

    # Inference doesn't call external APIs, no timeout needed
    totals["stackadapt_inferred"] = infer_stackadapt_audiences(conn)

    if own_conn:
        conn.close()

    print(f"\nAudience sync complete: {sum(totals.values())} total records")
    return totals


if __name__ == "__main__":
    sync_all_audiences()
