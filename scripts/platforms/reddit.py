"""Reddit Ads platform connector."""

import json
import os
import time
import urllib.request
import urllib.parse
from typing import Optional

import requests

from .base import (
    PlatformConnector, MetricsResult, CampaignMetrics, CampaignData,
    CreativeData, WriteResult,
)


class RedditConnector(PlatformConnector):
    slug = "reddit"
    display_name = "Reddit"
    status_map = {
        "ACTIVE": "active",
        "PAUSED": "paused",
        "CAMPAIGN_PAUSED": "paused",
        "ARCHIVED": "removed",
        "DELETED": "removed",
    }

    API_BASE = "https://ads-api.reddit.com/api/v3"
    AUTH_URL = "https://www.reddit.com/api/v1/access_token"
    USER_AGENT = "TelnyxDGHub:o-qtINw0ep_DORQPRiiCUQ:v1.0 (by /u/TelnyxLLC)"

    def __init__(self):
        self._access_token = None
        self._client_id = None
        self._client_secret = None
        self._refresh_token = None
        self._account_id = None
        self._business_id = None

    def load_credentials(self) -> bool:
        cred_path = os.path.expanduser("~/.config/reddit-ads/credentials.json")
        if not os.path.exists(cred_path):
            return False
        with open(cred_path) as f:
            creds = json.load(f)
        self._access_token = creds.get("access_token")
        self._refresh_token = creds.get("refresh_token")
        self._client_id = creds.get("client_id", "o-qtINw0ep_DORQPRiiCUQ")
        self._client_secret = creds.get("client_secret", "")
        self._account_id = creds.get("account_id", "t2_na6v8ho2")
        self._business_id = creds.get("business_id", "2429a838-b905-481b-93bf-63efd3a3a99b")
        return bool(self._access_token)

    def _refresh_access_token(self):
        """Refresh OAuth2 access token."""
        if not self._refresh_token or not self._client_id:
            return
        data = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "refresh_token": self._refresh_token,
        }).encode()
        req = urllib.request.Request(self.AUTH_URL, data=data)
        # Basic auth with client_id:client_secret
        import base64
        credentials = base64.b64encode(f"{self._client_id}:{self._client_secret}".encode()).decode()
        req.add_header("Authorization", f"Basic {credentials}")
        req.add_header("User-Agent", self.USER_AGENT)
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
            self._access_token = result.get("access_token")
            # Save updated token
            cred_path = os.path.expanduser("~/.config/reddit-ads/credentials.json")
            with open(cred_path) as f:
                creds = json.load(f)
            creds["access_token"] = self._access_token
            with open(cred_path, "w") as f:
                json.dump(creds, f, indent=2)
        except Exception as e:
            print(f"  Reddit token refresh failed: {e}")

    def _api(self, method: str, path: str, body: dict = None, timeout: int = 60) -> dict:
        """Make a Reddit Ads API request."""
        url = f"{self.API_BASE}{path}"
        headers = {
            "Authorization": f"Bearer {self._access_token}",
            "User-Agent": self.USER_AGENT,
            "Content-Type": "application/json",
        }
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 401:
                # Try refreshing token
                self._refresh_access_token()
                headers["Authorization"] = f"Bearer {self._access_token}"
                req = urllib.request.Request(url, data=data, headers=headers, method=method)
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return json.loads(resp.read())
            raise

    # ─── Query ────────────────────────────────────────

    def query_metrics(self, date_from: str, date_to: str, search: Optional[str] = None, active_only: bool = True) -> MetricsResult:
        if not self._access_token:
            self.load_credentials()
        if not self._access_token:
            return MetricsResult(platform=self.slug, date_from=date_from, date_to=date_to, error="No Reddit access token")

        try:
            return self._query_metrics_impl(date_from, date_to, search, active_only)
        except Exception as e:
            return MetricsResult(platform=self.slug, date_from=date_from, date_to=date_to, error=str(e))

    def _query_metrics_impl(self, date_from, date_to, search, active_only):
        # Fetch campaigns
        camp_data = self._api("GET", f"/ad_accounts/{self._account_id}/campaigns")
        camp_list = camp_data.get("data", [])

        # Build status map
        camp_status = {}
        camp_names = {}
        for c in camp_list:
            cid = str(c.get("id", ""))
            camp_status[cid] = (c.get("effective_status") or c.get("status", "")).upper()
            camp_names[cid] = c.get("name", "")

        # Fetch metrics via reports endpoint
        # Reddit API v3: use breakdowns for per-campaign data, ends_at must be hourly
        # Bump end date to next day at 00:00:00Z to include the full last day
        from datetime import datetime, timedelta
        end_dt = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
        report_body = {
            "data": {
                "starts_at": f"{date_from}T00:00:00Z",
                "ends_at": end_dt.strftime("%Y-%m-%dT00:00:00Z"),
                "fields": [
                    "SPEND", "IMPRESSIONS", "CLICKS", "CAMPAIGN_ID",
                    "CONVERSION_LEAD_CLICKS", "CONVERSION_LEAD_VIEWS",
                    "CONVERSION_SIGN_UP_CLICKS", "CONVERSION_SIGN_UP_VIEWS",
                    "CONVERSION_PAGE_VISIT_CLICKS", "CONVERSION_PAGE_VISIT_VIEWS",
                    "KEY_CONVERSION_TOTAL_COUNT", "KEY_CONVERSION_ECPA",
                ],
                "breakdowns": ["CAMPAIGN_ID"],
            }
        }
        try:
            report_data = self._api("POST", f"/ad_accounts/{self._account_id}/reports", report_body)
            records = report_data.get("data", {}).get("metrics", [])
        except Exception:
            records = []

        # Build metrics by campaign — spend is in micros (divide by 1,000,000)
        metrics_by_id = {}
        for r in records:
            cid = str(r.get("campaign_id", ""))
            lead_clicks = int(r.get("conversion_lead_clicks", 0) or 0)
            lead_views = int(r.get("conversion_lead_views", 0) or 0)
            signup_clicks = int(r.get("conversion_sign_up_clicks", 0) or 0)
            signup_views = int(r.get("conversion_sign_up_views", 0) or 0)
            page_visit_clicks = int(r.get("conversion_page_visit_clicks", 0) or 0)
            page_visit_views = int(r.get("conversion_page_visit_views", 0) or 0)
            total_leads = lead_clicks + lead_views
            total_signups = signup_clicks + signup_views
            conversions = total_leads + total_signups  # leads + signups = meaningful conversions
            metrics_by_id[cid] = {
                "spend": float(r.get("spend", 0) or 0) / 1_000_000,
                "impressions": int(r.get("impressions", 0) or 0),
                "clicks": int(r.get("clicks", 0) or 0),
                "conversions": conversions,
                "leads": total_leads,
                "signups": total_signups,
                "page_visits": page_visit_clicks + page_visit_views,
                "key_conversions": int(r.get("key_conversion_total_count", 0) or 0),
            }

        campaigns = []
        for c in camp_list:
            cid = str(c.get("id", ""))
            name = c.get("name", "")
            status_raw = camp_status.get(cid, "UNKNOWN")
            status = self.normalize_status(status_raw)

            if active_only and status != "active":
                continue
            if search and search.lower() not in name.lower():
                continue

            m = metrics_by_id.get(cid, {})
            spend = m.get("spend", 0)
            impressions = m.get("impressions", 0)
            clicks = m.get("clicks", 0)
            conversions = m.get("conversions", 0)

            if spend > 0 or impressions > 0:
                campaigns.append(CampaignMetrics(
                    name=name, campaign_id=cid, platform=self.slug, status=status,
                    spend=spend, impressions=impressions, clicks=clicks, conversions=conversions,
                    ctr=(clicks / impressions * 100) if impressions > 0 else 0,
                    avg_cpc=(spend / clicks) if clicks > 0 else 0,
                    leads=m.get("leads", 0),
                    signups=m.get("signups", 0),
                    page_visits=m.get("page_visits", 0),
                    key_conversions=m.get("key_conversions", 0),
                ))

        campaigns.sort(key=lambda c: c.spend, reverse=True)
        return MetricsResult(
            platform=self.slug, date_from=date_from, date_to=date_to,
            total_spend=sum(c.spend for c in campaigns),
            total_impressions=sum(c.impressions for c in campaigns),
            total_clicks=sum(c.clicks for c in campaigns),
            total_conversions=sum(c.conversions for c in campaigns),
            campaign_count=len(campaigns),
            campaigns=campaigns,
        )

    # ─── Sync ─────────────────────────────────────────

    def fetch_campaigns(self, active_only: bool = True) -> list[CampaignData]:
        if not self._access_token:
            self.load_credentials()

        camp_data = self._api("GET", f"/ad_accounts/{self._account_id}/campaigns")
        camp_list = camp_data.get("data", [])

        results = []
        for c in camp_list:
            status_raw = (c.get("effective_status") or c.get("status", "")).upper()
            status = self.normalize_status(status_raw)
            if active_only and status != "active":
                continue

            cid = str(c.get("id", ""))

            # Fetch ad groups to get targeting details
            targeting_summary = {}
            try:
                ag_data = self._api("GET", f"/ad_accounts/{self._account_id}/ad_groups?campaign_id={cid}")
                ad_groups = ag_data.get("data", [])
                all_communities = set()
                all_geos = set()
                all_interests = set()
                has_custom_audience = False
                for ag in ad_groups:
                    t = ag.get("targeting", {})
                    all_communities.update(t.get("communities", []))
                    all_geos.update(t.get("geolocations", []))
                    all_interests.update(t.get("interests", []))
                    if t.get("custom_audience_ids"):
                        has_custom_audience = True
                targeting_summary = {
                    "communities": sorted(all_communities),
                    "geolocations": sorted(all_geos),
                    "interests": sorted(all_interests),
                    "has_custom_audience": has_custom_audience,
                    "ad_group_count": len(ad_groups),
                }
            except Exception:
                pass

            # Determine targeting type
            targeting_type = "interest"
            if targeting_summary.get("has_custom_audience"):
                targeting_type = "retargeting"
            elif targeting_summary.get("communities"):
                targeting_type = "community"

            results.append(CampaignData(
                external_id=cid,
                name=c.get("name", ""),
                platform=self.slug,
                status=status,
                objective=c.get("objective", ""),
                budget=float(c.get("budget_cents", 0) or 0) / 100,
                budget_type="daily" if c.get("is_daily_budget") else "total",
                start_date=c.get("start_time", "")[:10] if c.get("start_time") else None,
                end_date=c.get("end_time", "")[:10] if c.get("end_time") else None,
                targeting_type=targeting_type,
                extra={"targeting": targeting_summary},
            ))
        return results

    def fetch_creatives(self, active_only: bool = True) -> list[CreativeData]:
        if not self._access_token:
            self.load_credentials()

        # Fetch ads
        try:
            ads_data = self._api("GET", f"/ad_accounts/{self._account_id}/ads")
            ads_list = ads_data.get("data", [])
        except Exception:
            ads_list = []

        # Get active campaign IDs
        camps = self.fetch_campaigns(active_only=active_only)
        camp_ids = {c.external_id for c in camps}

        creatives = []
        for ad in ads_list:
            campaign_id = str(ad.get("campaign_id", ""))
            if active_only and campaign_id not in camp_ids:
                continue

            ad_status = (ad.get("effective_status") or ad.get("status", "")).upper()
            status = self.normalize_status(ad_status)

            # Reddit ads: copy lives on the Reddit post, not in the ad object.
            # We store the ad name (which is the ad title) and fetch post content.
            ad_name = ad.get("name", "")
            post_url = ad.get("post_url", "")
            post_id = ad.get("post_id", "")

            # Try to fetch post title/body/image from Reddit via OAuth API
            headline = ad_name  # fallback to ad name
            body = ""
            if post_id:
                try:
                    time.sleep(1.2)  # Reddit rate limit: ~60 req/min for OAuth
                    # Use OAuth endpoint (higher rate limit than public)
                    resp = requests.get(
                        f"https://oauth.reddit.com/api/info?id={post_id}",
                        headers={
                            "Authorization": f"Bearer {self._access_token}",
                            "User-Agent": self.USER_AGENT,
                        },
                        timeout=10,
                    )
                    if resp.status_code == 200:
                        listing = resp.json().get("data", {}).get("children", [])
                        if listing:
                            post_info = listing[0].get("data", {})
                            headline = post_info.get("title", ad_name)
                            body = post_info.get("selftext", "")
                            # Extract image from post
                            if not ad.get("thumbnail_url"):
                                # Try preview images (highest quality)
                                preview = post_info.get("preview", {})
                                if preview and "images" in preview:
                                    src = preview["images"][0].get("source", {})
                                    if src.get("url"):
                                        ad["thumbnail_url"] = src["url"].replace("&amp;", "&")
                                # Fallback: direct image URL
                                if not ad.get("thumbnail_url") and post_info.get("url", ""):
                                    url = post_info["url"]
                                    if any(url.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"]):
                                        ad["thumbnail_url"] = url
                                # Fallback: thumbnail from post
                                if not ad.get("thumbnail_url") and post_info.get("thumbnail", "") not in ("", "self", "default", "nsfw", "spoiler"):
                                    ad["thumbnail_url"] = post_info["thumbnail"]
                except Exception as e:
                    print(f"  Warning: Failed to fetch post {post_id}: {e}")

            creatives.append(CreativeData(
                external_id=str(ad.get("id", "")),
                campaign_id=campaign_id,
                platform=self.slug,
                ad_type="Promoted Post",
                status=status,
                name=ad_name,
                headlines=[headline] if headline else None,
                body=body,
                image_url=ad.get("thumbnail_url", ""),
                final_url=ad.get("click_url", ""),
                extra={
                    "post_url": post_url,
                    "post_id": post_id,
                    "ad_group_id": str(ad.get("ad_group_id", "")),
                },
            ))
        return creatives

    # ─── Write ────────────────────────────────────────

    def pause_campaign(self, campaign_id: str) -> WriteResult:
        if not self._access_token:
            self.load_credentials()
        try:
            self._api("PATCH", f"/campaigns/{campaign_id}", {"data": {"status": "PAUSED"}})
            return WriteResult(success=True, resource_name=f"campaigns/{campaign_id}")
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def enable_campaign(self, campaign_id: str) -> WriteResult:
        if not self._access_token:
            self.load_credentials()
        try:
            self._api("PATCH", f"/campaigns/{campaign_id}", {"data": {"status": "ACTIVE"}})
            return WriteResult(success=True, resource_name=f"campaigns/{campaign_id}")
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def update_budget(self, campaign_id: str, new_budget: float, budget_type: str = "daily") -> WriteResult:
        """Update a Reddit campaign's budget (in dollars, converted to cents for API)."""
        if not self._access_token:
            self.load_credentials()
        try:
            budget_cents = int(new_budget * 100)
            self._api("PATCH", f"/campaigns/{campaign_id}", {"data": {"budget_cents": budget_cents}})
            return WriteResult(success=True, resource_name=f"campaigns/{campaign_id}")
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def update_ad_group_targeting(self, ad_group_id: str, targeting_changes: dict) -> WriteResult:
        """Update targeting for a Reddit ad group (communities, interests, geolocations, etc.)."""
        if not self._access_token:
            self.load_credentials()
        try:
            self._api("PATCH", f"/ad_groups/{ad_group_id}", {"data": {"targeting": targeting_changes}})
            return WriteResult(success=True, resource_name=f"ad_groups/{ad_group_id}")
        except Exception as e:
            return WriteResult(success=False, error=str(e))
