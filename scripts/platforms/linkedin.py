"""LinkedIn Ads platform connector."""

import json
import os
import urllib.parse
import urllib.request
from typing import Optional

from .base import (
    PlatformConnector, MetricsResult, CampaignMetrics, CampaignData,
    CreativeData, WriteResult,
)


class LinkedInConnector(PlatformConnector):
    slug = "linkedin"
    display_name = "LinkedIn"
    status_map = {
        "ACTIVE": "active",
        "PAUSED": "paused",
        "ARCHIVED": "ended",
        "COMPLETED": "ended",
        "CANCELED": "removed",
        "DRAFT": "paused",
    }

    def __init__(self):
        self._token = None
        self._account_id = None

    def load_credentials(self) -> bool:
        cred_path = os.path.expanduser("~/.config/linkedin-ads/credentials.json")
        if not os.path.exists(cred_path):
            return False
        with open(cred_path) as f:
            creds = json.load(f)
        self._token = creds.get("access_token")
        self._account_id = creds.get("ad_account_id")
        return bool(self._token and self._account_id)

    def _headers(self):
        return {"Authorization": f"Bearer {self._token}"}

    def _api_get(self, url: str) -> dict:
        req = urllib.request.Request(url, headers=self._headers())
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    def _fetch_all_campaigns(self) -> list[dict]:
        account_urn = f"urn:li:sponsoredAccount:{self._account_id}"
        all_camps = []
        start = 0
        while True:
            url = (
                f"https://api.linkedin.com/v2/adCampaignsV2?"
                f"q=search&search.account.values[0]={urllib.parse.quote(account_urn)}"
                f"&count=100&start={start}"
            )
            data = self._api_get(url)
            elements = data.get("elements", [])
            all_camps.extend(elements)
            total = data.get("paging", {}).get("total", 0)
            start += 100
            if start >= total:
                break
        return all_camps

    # ─── Query ────────────────────────────────────────

    def query_metrics(self, date_from: str, date_to: str, search: Optional[str] = None, active_only: bool = True) -> MetricsResult:
        if not self._token:
            self.load_credentials()
        if not self._token:
            return MetricsResult(platform=self.slug, date_from=date_from, date_to=date_to, error="No LinkedIn credentials")

        try:
            return self._query_metrics_impl(date_from, date_to, search, active_only)
        except Exception as e:
            return MetricsResult(platform=self.slug, date_from=date_from, date_to=date_to, error=str(e))

    def _query_metrics_impl(self, date_from, date_to, search, active_only):
        all_camps = self._fetch_all_campaigns()
        if active_only:
            all_camps = [c for c in all_camps if c.get("status") == "ACTIVE"]
        if search:
            sl = search.lower()
            all_camps = [c for c in all_camps if sl in (c.get("name") or "").lower()]

        camp_map = {str(c["id"]): c for c in all_camps}
        campaign_ids = list(camp_map.keys())

        if not campaign_ids:
            return MetricsResult(platform=self.slug, date_from=date_from, date_to=date_to)

        # Parse dates
        y0, m0, d0 = date_from.split("-")
        y1, m1, d1 = date_to.split("-")

        campaigns = []
        for i in range(0, len(campaign_ids), 20):
            batch = campaign_ids[i:i + 20]
            params = [
                "q=analytics",
                f"dateRange.start.day={int(d0)}", f"dateRange.start.month={int(m0)}", f"dateRange.start.year={int(y0)}",
                f"dateRange.end.day={int(d1)}", f"dateRange.end.month={int(m1)}", f"dateRange.end.year={int(y1)}",
                "timeGranularity=ALL", "pivot=CAMPAIGN",
                "fields=externalWebsiteConversions,costInLocalCurrency,impressions,clicks",
            ]
            for j, cid in enumerate(batch):
                params.append(f"campaigns[{j}]=urn:li:sponsoredCampaign:{cid}")

            url = f"https://api.linkedin.com/v2/adAnalyticsV2?{'&'.join(params)}"
            try:
                data = self._api_get(url)
            except Exception:
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
                spend = float(el.get("costInLocalCurrency", 0) or 0)
                impressions = int(el.get("impressions", 0) or 0)
                clicks = int(el.get("clicks", 0) or 0)
                conversions = float(el.get("externalWebsiteConversions", 0) or 0)

                if spend > 0 or impressions > 0:
                    campaigns.append(CampaignMetrics(
                        name=camp.get("name", f"Campaign {camp_id}"),
                        campaign_id=camp_id,
                        platform=self.slug,
                        status=self.normalize_status(camp.get("status", "UNKNOWN")),
                        spend=spend, impressions=impressions, clicks=clicks,
                        conversions=conversions,
                        ctr=(clicks / impressions * 100) if impressions > 0 else 0,
                        avg_cpc=(spend / clicks) if clicks > 0 else 0,
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
        if not self._token:
            self.load_credentials()
        all_camps = self._fetch_all_campaigns()
        if active_only:
            all_camps = [c for c in all_camps if c.get("status") == "ACTIVE"]

        results = []
        for c in all_camps:
            results.append(CampaignData(
                external_id=str(c["id"]),
                name=c.get("name", ""),
                platform=self.slug,
                status=self.normalize_status(c.get("status", "UNKNOWN")),
                campaign_type=c.get("type", ""),
                objective=c.get("objectiveType", ""),
                budget=float(c.get("dailyBudget", {}).get("amount", 0) or 0) if c.get("dailyBudget") else None,
                budget_type="daily" if c.get("dailyBudget") else "",
            ))
        return results

    def fetch_creatives(self, active_only: bool = True) -> list[CreativeData]:
        if not self._token:
            self.load_credentials()

        # Fetch campaigns first to filter
        camps = self._fetch_all_campaigns()
        if active_only:
            camp_ids = {str(c["id"]) for c in camps if c.get("status") == "ACTIVE"}
        else:
            camp_ids = {str(c["id"]) for c in camps}

        # Fetch creatives
        creatives = []
        start = 0
        account_urn = f"urn:li:sponsoredAccount:{self._account_id}"
        while True:
            url = (
                f"https://api.linkedin.com/v2/adCreativesV2?"
                f"q=search&search.account.values[0]={urllib.parse.quote(account_urn)}"
                f"&count=100&start={start}"
            )
            try:
                data = self._api_get(url)
            except Exception:
                break

            elements = data.get("elements", [])
            for el in elements:
                camp_id = str(el.get("campaign", "")).split(":")[-1]
                if camp_id not in camp_ids:
                    continue
                creatives.append(CreativeData(
                    external_id=str(el.get("id", "")),
                    campaign_id=camp_id,
                    platform=self.slug,
                    ad_type=el.get("type", "SPONSORED_UPDATE"),
                    status=self.normalize_status(el.get("status", "UNKNOWN")),
                ))

            total = data.get("paging", {}).get("total", 0)
            start += 100
            if start >= total:
                break

        return creatives

    # ─── Write (read-only for now — needs rw_ads scope) ───
    # pause_campaign and enable_campaign use defaults (not supported)
