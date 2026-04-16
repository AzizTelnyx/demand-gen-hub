#!/usr/bin/env python3
"""
Sync all ad creatives from Google Ads, StackAdapt, and LinkedIn into the AdCreative table.
Run via: python scripts/sync_creatives.py

Memory-optimized: streams records to DB in micro-batches, runs each platform in a subprocess,
and LinkedIn campaigns are processed in small subprocess batches to survive macOS jetsam.
"""
import gc
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2

DB_URL = os.environ.get("POSTGRES_URL_NON_POOLING") or os.environ.get("POSTGRES_PRISMA_URL", "postgresql://localhost:5432/dghub")
if "localhost" in DB_URL or "127.0.0.1" in DB_URL:
    DB_URL = DB_URL.split("?")[0]

BATCH_SIZE = 50

def get_conn():
    return psycopg2.connect(DB_URL)


def upsert_one(cur, c, now):
    cur.execute("""
        INSERT INTO "AdCreative" (id, platform, "platformAdId", "campaignName", "adGroupName", "adType",
            status, headlines, descriptions, "finalUrls", images, videos, dimensions, "brandName",
            "lastSyncedAt", "createdAt", "updatedAt")
        VALUES (
            gen_random_uuid()::text, %(platform)s, %(platformAdId)s, %(campaignName)s, %(adGroupName)s,
            %(adType)s, %(status)s, %(headlines)s, %(descriptions)s, %(finalUrls)s, %(images)s, %(videos)s,
            %(dimensions)s, %(brandName)s, %(now)s, %(now)s, %(now)s
        )
        ON CONFLICT (platform, "platformAdId") DO UPDATE SET
            "campaignName" = EXCLUDED."campaignName",
            "adGroupName" = EXCLUDED."adGroupName",
            "adType" = EXCLUDED."adType",
            status = EXCLUDED.status,
            headlines = EXCLUDED.headlines,
            descriptions = EXCLUDED.descriptions,
            "finalUrls" = EXCLUDED."finalUrls",
            images = EXCLUDED.images,
            videos = EXCLUDED.videos,
            dimensions = EXCLUDED.dimensions,
            "brandName" = EXCLUDED."brandName",
            "lastSyncedAt" = EXCLUDED."lastSyncedAt",
            "updatedAt" = EXCLUDED."updatedAt"
    """, {**c, "now": now,
          "adGroupName": c.get("adGroupName", ""),
          "dimensions": c.get("dimensions", "[]"),
          "brandName": c.get("brandName"),
          })


class BatchUpserter:
    """Accumulates records and flushes to DB in small batches."""

    def __init__(self, conn, batch_size=BATCH_SIZE):
        self.conn = conn
        self.batch_size = batch_size
        self.buffer = []
        self.total = 0

    def add(self, record):
        self.buffer.append(record)
        if len(self.buffer) >= self.batch_size:
            self.flush()

    def flush(self):
        if not self.buffer:
            return
        now = datetime.now(timezone.utc).isoformat()
        cur = self.conn.cursor()
        for c in self.buffer:
            upsert_one(cur, c, now)
        self.conn.commit()
        cur.close()
        self.total += len(self.buffer)
        self.buffer.clear()
        gc.collect()

    def finish(self):
        self.flush()
        return self.total


# ─── Google Ads ────────────────────────────────────────

def sync_google_ads_creatives(conn):
    from google.ads.googleads.client import GoogleAdsClient
    cred_path = os.path.expanduser("~/.config/google-ads/credentials.json")
    with open(cred_path) as f:
        creds = json.load(f)

    client = GoogleAdsClient.load_from_dict({
        "developer_token": creds["developer_token"],
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "login_customer_id": str(creds.get("login_customer_id", "2893524941")),
        "use_proto_plus": True,
    })

    customer_id = str(creds.get("accounts", {}).get("marketing_telnyx", {}).get("customer_id", "2356650573"))
    ga_service = client.get_service("GoogleAdsService")
    STATUS_MAP = {0: "UNSPECIFIED", 1: "UNKNOWN", 2: "ENABLED", 3: "PAUSED", 4: "REMOVED"}
    upserter = BatchUpserter(conn)

    def eff_status(row):
        cs = STATUS_MAP.get(row.campaign.status, str(row.campaign.status))
        ads = STATUS_MAP.get(row.ad_group_ad.status, str(row.ad_group_ad.status))
        return cs if cs in ("PAUSED", "REMOVED") else ads

    # RSA
    print("  Fetching RSA ads...")
    try:
        response = ga_service.search(customer_id=customer_id, query="""
            SELECT campaign.name, campaign.status, ad_group.name,
                   ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.final_urls,
                   ad_group_ad.ad.responsive_search_ad.headlines,
                   ad_group_ad.ad.responsive_search_ad.descriptions
            FROM ad_group_ad WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND campaign.status = 'ENABLED' AND ad_group_ad.status != 'REMOVED' LIMIT 5000
        """)
        for row in response:
            ad = row.ad_group_ad.ad
            upserter.add({
                "platform": "google_ads", "platformAdId": str(ad.id),
                "campaignName": row.campaign.name, "adGroupName": row.ad_group.name,
                "adType": "Responsive Search", "status": eff_status(row).lower(),
                "headlines": json.dumps([h.text for h in (ad.responsive_search_ad.headlines or [])]),
                "descriptions": json.dumps([d.text for d in (ad.responsive_search_ad.descriptions or [])]),
                "finalUrls": json.dumps(list(ad.final_urls)), "images": "[]", "videos": "[]",
            })
        del response; gc.collect()
    except Exception as e:
        print(f"  RSA error: {e}")

    # Display
    print("  Fetching Display ads...")
    try:
        response = ga_service.search(customer_id=customer_id, query="""
            SELECT campaign.name, campaign.status, ad_group.name,
                   ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.final_urls,
                   ad_group_ad.ad.responsive_display_ad.headlines,
                   ad_group_ad.ad.responsive_display_ad.long_headline,
                   ad_group_ad.ad.responsive_display_ad.descriptions,
                   ad_group_ad.ad.responsive_display_ad.marketing_images,
                   ad_group_ad.ad.responsive_display_ad.square_marketing_images
            FROM ad_group_ad WHERE ad_group_ad.ad.type = 'RESPONSIVE_DISPLAY_AD' AND campaign.status = 'ENABLED' AND ad_group_ad.status != 'REMOVED' LIMIT 5000
        """)
        for row in response:
            ad = row.ad_group_ad.ad; rda = ad.responsive_display_ad
            headlines = [h.text for h in (rda.headlines or [])]
            if rda.long_headline and rda.long_headline.text:
                headlines.append(rda.long_headline.text)
            image_assets = [img.asset for img in (rda.marketing_images or []) if img.asset] + \
                           [img.asset for img in (rda.square_marketing_images or []) if img.asset]
            upserter.add({
                "platform": "google_ads", "platformAdId": str(ad.id),
                "campaignName": row.campaign.name, "adGroupName": row.ad_group.name,
                "adType": "Responsive Display", "status": eff_status(row).lower(),
                "headlines": json.dumps(headlines),
                "descriptions": json.dumps([d.text for d in (rda.descriptions or [])]),
                "finalUrls": json.dumps(list(ad.final_urls)),
                "images": json.dumps(image_assets), "videos": "[]",
            })
        del response; gc.collect()
    except Exception as e:
        print(f"  Display error: {e}")

    # Video Responsive
    print("  Fetching Video Responsive ads...")
    video_asset_lookups = []
    try:
        response = ga_service.search(customer_id=customer_id, query="""
            SELECT campaign.name, campaign.status, ad_group.name,
                   ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.final_urls,
                   ad_group_ad.ad.video_responsive_ad.headlines,
                   ad_group_ad.ad.video_responsive_ad.long_headlines,
                   ad_group_ad.ad.video_responsive_ad.descriptions,
                   ad_group_ad.ad.video_responsive_ad.videos
            FROM ad_group_ad WHERE ad_group_ad.ad.type = 'VIDEO_RESPONSIVE_AD' AND campaign.status = 'ENABLED' AND ad_group_ad.status != 'REMOVED' LIMIT 2000
        """)
        for row in response:
            ad = row.ad_group_ad.ad; vra = ad.video_responsive_ad
            v_assets = [v.asset for v in (vra.videos or []) if v.asset]
            pid = str(ad.id)
            upserter.add({
                "platform": "google_ads", "platformAdId": pid,
                "campaignName": row.campaign.name, "adGroupName": row.ad_group.name,
                "adType": "Video", "status": eff_status(row).lower(),
                "headlines": json.dumps([h.text for h in (vra.headlines or [])] + [h.text for h in (vra.long_headlines or [])]),
                "descriptions": json.dumps([d.text for d in (vra.descriptions or [])]),
                "finalUrls": json.dumps(list(ad.final_urls)), "images": "[]", "videos": "[]",
            })
            if v_assets:
                video_asset_lookups.append((pid, v_assets))
        del response; gc.collect()
    except Exception as e:
        print(f"  Video Responsive error: {e}")

    # Video In-Stream
    print("  Fetching Video In-Stream ads...")
    try:
        response = ga_service.search(customer_id=customer_id, query="""
            SELECT campaign.name, campaign.status, ad_group.name,
                   ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.final_urls,
                   ad_group_ad.ad.video_ad.video.asset,
                   ad_group_ad.ad.video_ad.in_stream.action_headline
            FROM ad_group_ad WHERE ad_group_ad.ad.type = 'VIDEO_AD' AND campaign.status = 'ENABLED' AND ad_group_ad.status != 'REMOVED' LIMIT 2000
        """)
        for row in response:
            ad = row.ad_group_ad.ad
            v_asset = ad.video_ad.video.asset if ad.video_ad and ad.video_ad.video else None
            headline = ad.video_ad.in_stream.action_headline if ad.video_ad and ad.video_ad.in_stream else None
            pid = str(ad.id)
            upserter.add({
                "platform": "google_ads", "platformAdId": pid,
                "campaignName": row.campaign.name, "adGroupName": row.ad_group.name,
                "adType": "Video In-Stream", "status": eff_status(row).lower(),
                "headlines": json.dumps([headline] if headline else []),
                "descriptions": "[]", "finalUrls": json.dumps(list(ad.final_urls)),
                "images": "[]", "videos": "[]",
            })
            if v_asset:
                video_asset_lookups.append((pid, [v_asset]))
        del response; gc.collect()
    except Exception as e:
        print(f"  Video In-Stream error: {e}")

    # Resolve video assets
    if video_asset_lookups:
        all_assets = list(set(a for _, assets in video_asset_lookups for a in assets))
        print(f"  Resolving {len(all_assets)} video assets for thumbnails...")
        asset_map = {}
        for i in range(0, len(all_assets), 50):
            batch = all_assets[i:i+50]
            asset_ids = [a.split("/")[-1] for a in batch]
            try:
                result = ga_service.search(customer_id=customer_id, query=f"""
                    SELECT asset.id, asset.youtube_video_asset.youtube_video_id
                    FROM asset WHERE asset.id IN ({','.join(asset_ids)})
                """)
                for row in result:
                    vid_id = row.asset.youtube_video_asset.youtube_video_id if row.asset.youtube_video_asset else None
                    if vid_id:
                        for orig in batch:
                            if orig.endswith(f"/{row.asset.id}"):
                                asset_map[orig] = vid_id
                del result
            except Exception as e:
                print(f"  Asset resolve error: {e}")
        cur = conn.cursor()
        for pid, asset_paths in video_asset_lookups:
            thumbs = [f"https://img.youtube.com/vi/{asset_map[a]}/hqdefault.jpg" for a in asset_paths if a in asset_map]
            if thumbs:
                cur.execute('UPDATE "AdCreative" SET images = %s WHERE platform = %s AND "platformAdId" = %s',
                            (json.dumps(thumbs), "google_ads", pid))
        conn.commit(); cur.close()
        print(f"  Resolved {len(asset_map)} YouTube thumbnails")
        del asset_map, video_asset_lookups, all_assets; gc.collect()

    # ETA
    print("  Fetching ETA ads...")
    try:
        response = ga_service.search(customer_id=customer_id, query="""
            SELECT campaign.name, campaign.status, ad_group.name,
                   ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.final_urls,
                   ad_group_ad.ad.expanded_text_ad.headline_part1,
                   ad_group_ad.ad.expanded_text_ad.headline_part2,
                   ad_group_ad.ad.expanded_text_ad.headline_part3,
                   ad_group_ad.ad.expanded_text_ad.description,
                   ad_group_ad.ad.expanded_text_ad.description2
            FROM ad_group_ad WHERE ad_group_ad.ad.type = 'EXPANDED_TEXT_AD' AND campaign.status = 'ENABLED' AND ad_group_ad.status != 'REMOVED' LIMIT 5000
        """)
        for row in response:
            ad = row.ad_group_ad.ad; eta = ad.expanded_text_ad
            upserter.add({
                "platform": "google_ads", "platformAdId": str(ad.id),
                "campaignName": row.campaign.name, "adGroupName": row.ad_group.name,
                "adType": "Expanded Text", "status": eff_status(row).lower(),
                "headlines": json.dumps([h for h in [eta.headline_part1, eta.headline_part2, eta.headline_part3] if h]),
                "descriptions": json.dumps([d for d in [eta.description, eta.description2] if d]),
                "finalUrls": json.dumps(list(ad.final_urls)), "images": "[]", "videos": "[]",
            })
        del response; gc.collect()
    except Exception as e:
        print(f"  ETA error: {e}")

    count = upserter.finish()
    print(f"  Total Google Ads creatives: {count}")
    return count


# ─── StackAdapt ────────────────────────────────────────

def sync_stackadapt_creatives(conn):
    cred_path = os.path.expanduser("~/.config/stackadapt/credentials.json")
    if not os.path.exists(cred_path):
        print("  No StackAdapt credentials found"); return 0
    with open(cred_path) as f:
        creds = json.load(f)
    token = creds.get("graphql", {}).get("token")
    if not token:
        print("  No StackAdapt GraphQL token"); return 0

    upserter = BatchUpserter(conn)

    print("  Fetching StackAdapt campaigns...")
    req = urllib.request.Request("https://api.stackadapt.com/graphql",
        data=json.dumps({"query": "query { campaigns(first: 500) { edges { node { id name campaignStatus { state status } } } } }"}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            camp_data = json.loads(resp.read())
    except Exception as e:
        print(f"  Campaign fetch error: {e}"); return 0

    campaigns = camp_data.get("data", {}).get("campaigns", {}).get("edges", [])
    # Only sync creatives for LIVE campaigns to avoid OOM
    active_campaigns = [edge for edge in campaigns if edge["node"].get("campaignStatus", {}).get("state") == "LIVE"]
    camp_map = {edge["node"]["id"]: edge["node"] for edge in active_campaigns}
    camp_ids = [int(edge["node"]["id"]) for edge in active_campaigns]
    del camp_data, campaigns, active_campaigns
    print(f"  Found {len(camp_ids)} active campaigns, fetching ads...")

    for i in range(0, len(camp_ids), 50):
        batch = camp_ids[i:i+50]
        ads_query = """
            query($filter: AdFilters) {
              ads(first: 500, filterBy: $filter) {
                edges { node {
                    __typename id name brandname channelType clickUrl creativeSize paused
                    ... on NativeAd { heading tagline cta campaign { id } logo { s3Url }
                      creativesConnection(first: 3) { edges { node { s3Url width height } } } }
                    ... on DisplayAd { campaign { id }
                      creativesConnection(first: 3) { edges { node { ... on ImageCreative { s3Url width height } } } } }
                    ... on DoohAd { campaign { id }
                      creativesConnection(first: 3) { edges { node { ... on ImageCreative { s3Url width height } ... on UploadedVideo { thumbS3Url } } } } }
                    ... on VideoAd { heading tagline campaign { id } logo { s3Url }
                      creativesConnection(first: 3) { edges { node { ... on UploadedVideo { thumbS3Url s3Url width height } } } } }
                } } } }
        """
        req = urllib.request.Request("https://api.stackadapt.com/graphql",
            data=json.dumps({"query": ads_query, "variables": {"filter": {"campaignIds": batch}}}).encode(),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as resp:
                ads_data = json.loads(resp.read())
        except Exception as e:
            print(f"  Ads batch error: {e}"); continue

        for edge in ads_data.get("data", {}).get("ads", {}).get("edges", []):
            ad = edge["node"]
            camp_id = (ad.get("campaign") or {}).get("id")
            camp = camp_map.get(camp_id, {})
            cs = (camp.get("campaignStatus") or {}).get("state", "").lower()
            csv = (camp.get("campaignStatus") or {}).get("status", "").lower()
            if cs == "live" and csv == "active": es = "active"
            elif cs == "paused": es = "paused"
            elif csv == "end_date_reached" or cs == "ended": es = "ended"
            elif cs == "live": es = "active"
            else: es = cs or "unknown"
            if ad.get("paused"): es = "paused"

            ad_type = {"DoohAd": "DOOH", "NativeAd": "Native", "VideoAd": "Video", "DisplayAd": "Display"}.get(
                ad.get("__typename", ""), ad.get("channelType", "Other"))
            images, videos = [], []
            for ce in (ad.get("creativesConnection") or {}).get("edges", []):
                cn = ce.get("node", {})
                if cn.get("s3Url"): images.append(cn["s3Url"])
                if cn.get("thumbS3Url"):
                    images.append(cn["thumbS3Url"]); videos.append(cn.get("s3Url") or cn["thumbS3Url"])
            if (ad.get("logo") or {}).get("s3Url"): images.append(ad["logo"]["s3Url"])

            headlines = [ad["heading"]] if ad.get("heading") else []
            descriptions = []
            if ad.get("tagline"): descriptions.append(ad["tagline"])
            if ad.get("brandname"): descriptions.append(f"Brand: {ad['brandname']}")
            if ad.get("cta"): descriptions.append(f"CTA: {ad['cta']}")

            upserter.add({
                "platform": "stackadapt", "platformAdId": str(ad["id"]),
                "campaignName": camp.get("name", ad.get("name", "")), "adGroupName": "",
                "adType": ad_type, "status": es,
                "headlines": json.dumps(headlines),
                "descriptions": json.dumps([d for d in descriptions if d]),
                "finalUrls": json.dumps([ad["clickUrl"]] if ad.get("clickUrl") else []),
                "images": json.dumps(images), "videos": json.dumps(videos),
                "brandName": ad.get("brandname"),
                "dimensions": json.dumps([ad["creativeSize"]] if ad.get("creativeSize") else []),
            })
        del ads_data; gc.collect()

    count = upserter.finish()
    print(f"  Total StackAdapt creatives: {count}")
    return count


# ─── LinkedIn ──────────────────────────────────────────

def _fetch_linkedin_campaigns(token, account_id):
    """Fetch all LinkedIn campaign metadata. Returns list of dicts."""
    account_urn = f"urn:li:sponsoredAccount:{account_id}"
    headers_dict = {"Authorization": f"Bearer {token}"}
    start = 0
    all_campaigns = []
    while True:
        url = f"https://api.linkedin.com/v2/adCampaignsV2?q=search&search.account.values[0]={urllib.parse.quote(account_urn)}&count=100&start={start}"
        req = urllib.request.Request(url, headers=headers_dict)
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read())
        except Exception as e:
            print(f"  Campaign fetch error: {e}"); break
        all_campaigns.extend(data.get("elements", []))
        total = data.get("paging", {}).get("total", 0)
        start += 100
        if start >= total:
            break
    return all_campaigns


def sync_linkedin_batch(conn, token, account_id, campaigns_json):
    """Sync a batch of LinkedIn campaigns. Called from subprocess."""
    campaigns = json.loads(campaigns_json)
    headers_dict = {"Authorization": f"Bearer {token}"}
    now = datetime.now(timezone.utc).isoformat()
    cur = conn.cursor()
    count = 0

    for camp in campaigns:
        camp_id = str(camp.get("id", ""))
        camp_name = camp.get("name", "")
        camp_status = "active" if camp.get("status") == "ACTIVE" else "paused" if camp.get("status") == "PAUSED" else "archived"
        camp_urn = f"urn:li:sponsoredCampaign:{camp_id}"
        camp_format = camp.get("format") or camp.get("type") or "SPONSORED_CONTENT"

        cr_url = f"https://api.linkedin.com/v2/adCreativesV2?q=search&search.campaign.values[0]={urllib.parse.quote(camp_urn)}&count=50"
        req = urllib.request.Request(cr_url, headers=headers_dict)
        try:
            with urllib.request.urlopen(req) as resp:
                cr_data = json.loads(resp.read())
        except:
            continue

        for cr in cr_data.get("elements", []):
            cr_id = str(cr.get("id", ""))
            cr_status = "active" if cr.get("status") == "ACTIVE" else "paused"

            variables = (cr.get("variables") or {}).get("data") or {}
            var_key = list(variables.keys())[0] if variables else ""
            content = list(variables.values())[0] if variables else {}
            if not isinstance(content, dict):
                content = {}

            click_uri = (cr.get("variables") or {}).get("clickUri") or content.get("clickUri") or content.get("landingUrl") or ""
            headlines, descriptions, images = [], [], []

            if content.get("title"): headlines.append(content["title"])
            if content.get("headline"): headlines.append(content["headline"])
            if content.get("text"): descriptions.append(content["text"])
            if content.get("description"): descriptions.append(content["description"])
            if content.get("callToAction"): descriptions.append(f"CTA: {content['callToAction']}")

            is_text = "TextAd" in var_key
            is_spotlight = "Spotlight" in var_key
            is_sponsored = "SponsoredUpdate" in var_key
            is_conversation = "Conversation" in var_key or "Message" in var_key

            ad_type = "Text Ad" if is_text else "Spotlight" if is_spotlight else "Message Ad" if is_conversation else "Sponsored Content"
            if camp_format == "SINGLE_VIDEO" or "Video" in var_key: ad_type = "Video"
            elif camp_format == "SINGLE_IMAGE": ad_type = "Single Image"
            elif camp_format == "CAROUSEL" or "Carousel" in var_key: ad_type = "Carousel"

            # UGC enrichment only for active campaigns
            if is_sponsored and camp_status == "active":
                share_ref = content.get("share") or content.get("userGeneratedContentPost") or cr.get("reference") or ""
                if share_ref and ("ugcPost" in share_ref or "share" in share_ref):
                    try:
                        encoded = urllib.parse.quote(share_ref)
                        ugc_req = urllib.request.Request(f"https://api.linkedin.com/v2/ugcPosts/{encoded}", headers=headers_dict)
                        with urllib.request.urlopen(ugc_req) as resp:
                            ugc = json.loads(resp.read())
                        sc = ugc.get("specificContent", {}).get("com.linkedin.ugc.ShareContent", {})
                        commentary = sc.get("shareCommentary", {}).get("text", "")
                        if commentary: descriptions.append(commentary)
                        for m in sc.get("media", []):
                            t = (m.get("title") or {}).get("text", "")
                            if t and t not in headlines: headlines.append(t)
                            thumbs = m.get("thumbnails") or []
                            if thumbs and thumbs[0].get("url"): images.append(thumbs[0]["url"])
                            lp = (m.get("landingPage") or {}).get("landingPageUrl", "")
                            if lp and not click_uri: click_uri = lp
                        del ugc, sc
                    except:
                        pass

            # For Direct Sponsored Content, LinkedIn API doesn't expose actual content
            # Add fallback metadata and Campaign Manager link
            if not headlines and not descriptions:
                headlines.append(f"{ad_type} (Creative ID: {cr_id})")
                descriptions.append("Direct Sponsored Content - view in LinkedIn Campaign Manager")
                # Add Campaign Manager link as finalUrl fallback
                if not click_uri:
                    click_uri = f"https://www.linkedin.com/campaignmanager/accounts/{account_id}/campaigns/{camp_id}/creatives/{cr_id}"

            upsert_one(cur, {
                "platform": "linkedin", "platformAdId": cr_id,
                "campaignName": camp_name, "adGroupName": "",
                "adType": ad_type,
                "status": cr_status if cr_status != "active" else camp_status,
                "headlines": json.dumps(headlines),
                "descriptions": json.dumps([d for d in descriptions if d]),
                "finalUrls": json.dumps([click_uri] if click_uri else []),
                "images": json.dumps(images), "videos": "[]",
            }, now)
            count += 1

        # Commit after each campaign
        conn.commit()
        del cr_data
        gc.collect()

    cur.close()
    return count


def sync_linkedin_creatives(conn):
    """Orchestrator: fetches campaign list, then processes in micro-subprocess batches."""
    cred_path = os.path.expanduser("~/.config/linkedin-ads/credentials.json")
    if not os.path.exists(cred_path):
        print("  No LinkedIn credentials found"); return 0
    with open(cred_path) as f:
        creds = json.load(f)
    token = creds.get("access_token")
    account_id = creds.get("ad_account_id")
    if not token or not account_id:
        return 0

    all_campaigns = _fetch_linkedin_campaigns(token, account_id)
    active = [c for c in all_campaigns if c.get("status") == "ACTIVE"]
    print(f"  Found {len(all_campaigns)} campaigns, syncing {len(active)} active only (OOM fix)")
    del all_campaigns

    # Only sync active campaigns to avoid OOM
    total = sync_linkedin_batch(conn, token, account_id, json.dumps(active))
    del active
    print(f"  Total LinkedIn creatives: {total}")
    return total


# ─── Reddit ────────────────────────────────────────────

def sync_reddit_creatives(conn):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from platforms import get_connector

    try:
        reddit = get_connector("reddit")
        creatives = reddit.fetch_creatives(active_only=True)
    except Exception as e:
        print(f"  Reddit connector error: {e}")
        return 0

    upserter = BatchUpserter(conn)
    for c in creatives:
        upserter.add({
            "platform": "reddit",
            "platformAdId": c.external_id,
            "campaignName": c.campaign_id,  # Will be resolved to name if available
            "adGroupName": "",
            "adType": c.ad_type,
            "status": c.status,
            "headlines": json.dumps(c.headlines or []),
            "descriptions": json.dumps([c.body] if c.body else []),
            "finalUrls": json.dumps([c.final_url] if c.final_url else []),
            "images": json.dumps([c.image_url] if c.image_url else []),
            "videos": "[]",
        })

    count = upserter.finish()
    print(f"  Total Reddit creatives: {count}")
    return count


# ─── Main ─────────────────────────────────────────────

def sync_platform(platform_name, sync_fn):
    print(f"Syncing {platform_name} creatives...")
    conn = get_conn()
    try:
        count = sync_fn(conn)
        print(f"  Upserted {count} {platform_name} creatives")
        return count
    except Exception as e:
        print(f"  {platform_name} FAILED: {e}")
        import traceback; traceback.print_exc()
        return 0
    finally:
        conn.close(); gc.collect()


if __name__ == "__main__":
    import subprocess as sp

    if len(sys.argv) > 1 and sys.argv[1] == "--platform":
        platform = sys.argv[2] if len(sys.argv) > 2 else ""
        fns = {"google": ("Google Ads", sync_google_ads_creatives),
               "stackadapt": ("StackAdapt", sync_stackadapt_creatives),
               "linkedin": ("LinkedIn", sync_linkedin_creatives),
               "reddit": ("Reddit", sync_reddit_creatives)}
        if platform not in fns:
            print(f"Unknown platform: {platform}"); sys.exit(1)
        name, fn = fns[platform]
        count = sync_platform(name, fn)
        print(f"RESULT:{count}")
        sys.exit(0)

    # Main: run each platform as subprocess for memory isolation
    # LinkedIn runs in-process last (smallest peak memory after Google/StackAdapt subprocesses exit)
    print(f"Starting creative sync at {datetime.now(timezone.utc).isoformat()}")
    total = 0
    script = os.path.abspath(__file__)
    python = sys.executable

    # Google, StackAdapt, and Reddit as subprocesses (they import heavy libraries)
    for plat in ["google", "stackadapt", "reddit"]:
        print(f"\n--- {plat.upper()} (subprocess) ---")
        try:
            result = sp.run([python, "-u", script, "--platform", plat],
                capture_output=True, text=True, timeout=600,
                env={**os.environ, "POSTGRES_URL_NON_POOLING": DB_URL})
            print(result.stdout)
            if result.stderr: print(result.stderr)
            for line in result.stdout.split("\n"):
                if line.startswith("RESULT:"):
                    total += int(line.split(":")[1])
        except sp.TimeoutExpired:
            print(f"  {plat} timed out after 600s — skipping")
        except Exception as e:
            print(f"  {plat} subprocess error: {e}")

    # LinkedIn in-process (no heavy library imports, just urllib)
    # This avoids subprocess startup overhead and macOS jetsam targeting a new process
    print(f"\n--- LINKEDIN (in-process) ---")
    try:
        count = sync_platform("LinkedIn", sync_linkedin_creatives)
        total += count
        print(f"RESULT:{count}")
    except Exception as e:
        print(f"  LinkedIn error: {e}")

    print(f"\nSync complete! Total: {total} creatives")
