"""StackAdapt platform connector."""

import json
import os
import urllib.request
from typing import Optional

from .base import (
    PlatformConnector, MetricsResult, CampaignMetrics, CampaignData,
    CreativeData, WriteResult,
)


class StackAdaptConnector(PlatformConnector):
    slug = "stackadapt"
    display_name = "StackAdapt"
    status_map = {
        "LIVE": "active",
        "PAUSED": "paused",
        "ENDED": "ended",
        "PENDING": "paused",
        "ARCHIVED": "removed",
    }

    GQL_URL = "https://api.stackadapt.com/graphql"
    ADVERTISER_ID = 93053

    def __init__(self):
        self._token = None

    def load_credentials(self) -> bool:
        cred_path = os.path.expanduser("~/.config/stackadapt/credentials.json")
        if not os.path.exists(cred_path):
            return False
        with open(cred_path) as f:
            creds = json.load(f)
        self._token = creds.get("graphql", {}).get("token")
        return bool(self._token)

    def _gql(self, query: str, timeout: int = 60) -> dict:
        headers = {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}
        req = urllib.request.Request(
            self.GQL_URL,
            data=json.dumps({"query": query}).encode(),
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())

    # ─── Query ────────────────────────────────────────

    def query_metrics(self, date_from: str, date_to: str, search: Optional[str] = None, active_only: bool = True) -> MetricsResult:
        if not self._token:
            self.load_credentials()
        if not self._token:
            return MetricsResult(platform=self.slug, date_from=date_from, date_to=date_to, error="No StackAdapt token")

        try:
            return self._query_metrics_impl(date_from, date_to, search, active_only)
        except Exception as e:
            return MetricsResult(platform=self.slug, date_from=date_from, date_to=date_to, error=str(e))

    def _query_metrics_impl(self, date_from, date_to, search, active_only):
        # Get campaign statuses
        camp_query = """
        {
          campaigns(filterBy: { advertiserIds: [%d] }, first: 500) {
            nodes { id name campaignStatus { state } }
          }
        }
        """ % self.ADVERTISER_ID
        camp_data = self._gql(camp_query, timeout=30)
        camp_nodes = camp_data.get("data", {}).get("campaigns", {}).get("nodes", [])
        camp_status = {str(c["id"]): (c.get("campaignStatus", {}).get("state", "")).upper() for c in camp_nodes}

        # Get metrics
        delivery_query = """
        {
          campaignDelivery(
            filterBy: { advertiserIds: [%d] }
            date: { from: "%s", to: "%s" }
            granularity: TOTAL
            dataType: TABLE
          ) {
            ... on CampaignDeliveryOutcome {
              records { nodes {
                campaign { id name }
                metrics { impressionsBigint clicksBigint cost ctr conversionsBigint }
              } }
            }
          }
        }
        """ % (self.ADVERTISER_ID, date_from, date_to)

        data = self._gql(delivery_query)
        nodes = data.get("data", {}).get("campaignDelivery", {}).get("records", {}).get("nodes", [])

        campaigns = []
        for n in nodes:
            cid = str(n["campaign"]["id"])
            name = n["campaign"]["name"]
            status_raw = camp_status.get(cid, "UNKNOWN")
            status = self.normalize_status(status_raw)
            m = n["metrics"]

            if active_only and status not in ("active", "unknown"):
                continue
            if search and search.lower() not in name.lower():
                continue

            spend = float(m.get("cost", 0) or 0)
            impressions = int(m.get("impressionsBigint", 0) or 0)
            clicks = int(m.get("clicksBigint", 0) or 0)
            conversions = int(m.get("conversionsBigint", 0) or 0)

            if spend > 0 or impressions > 0:
                campaigns.append(CampaignMetrics(
                    name=name, campaign_id=cid, platform=self.slug, status=status,
                    spend=spend, impressions=impressions, clicks=clicks, conversions=conversions,
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

        query = """
        {
          campaigns(filterBy: { advertiserIds: [%d] }, first: 500) {
            nodes {
              id name
              campaignStatus { state }
            }
          }
        }
        """ % self.ADVERTISER_ID

        data = self._gql(query)
        nodes = data.get("data", {}).get("campaigns", {}).get("nodes", [])

        results = []
        for c in nodes:
            status_raw = (c.get("campaignStatus", {}).get("state", "")).upper()
            status = self.normalize_status(status_raw)
            if active_only and status != "active":
                continue
            results.append(CampaignData(
                external_id=str(c["id"]),
                name=c.get("name", ""),
                platform=self.slug,
                status=status,
                budget_type="total",
            ))
        return results

    def fetch_creatives(self, active_only: bool = True) -> list[CreativeData]:
        if not self._token:
            self.load_credentials()

        # Get active campaign IDs first
        camps = self.fetch_campaigns(active_only=active_only)
        camp_ids = {c.external_id for c in camps}

        # Fetch native ads
        query = """
        {
          nativeAds(filterBy: { advertiserIds: [%d] }, first: 500) {
            nodes {
              id name
              campaignId
              headline body brandname
              imageUrl
              clickUri
            }
          }
        }
        """ % self.ADVERTISER_ID

        data = self._gql(query)
        nodes = data.get("data", {}).get("nativeAds", {}).get("nodes", [])

        creatives = []
        for n in nodes:
            cid = str(n.get("campaignId", ""))
            if active_only and cid not in camp_ids:
                continue
            creatives.append(CreativeData(
                external_id=str(n["id"]),
                campaign_id=cid,
                platform=self.slug,
                ad_type="Native",
                status="active" if cid in camp_ids else "paused",
                name=n.get("name", ""),
                headlines=[n.get("headline", "")] if n.get("headline") else None,
                body=n.get("body", ""),
                image_url=n.get("imageUrl", ""),
                final_url=n.get("clickUri", ""),
            ))
        return creatives

    # ─── Write (R/W token available) ──────────────────

    def pause_campaign(self, campaign_id: str) -> WriteResult:
        if not self._token:
            self.load_credentials()
        mutation = """
        mutation {
          pauseCampaigns(input: { campaignIds: [%s], reason: OTHER }) {
            campaigns { id campaignStatus { state } }
          }
        }
        """ % campaign_id
        try:
            data = self._gql(mutation)
            errors = data.get("errors", [])
            if errors:
                return WriteResult(success=False, error=str(errors[0].get("message", errors)))
            return WriteResult(success=True, resource_name=f"campaigns/{campaign_id}")
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def enable_campaign(self, campaign_id: str) -> WriteResult:
        if not self._token:
            self.load_credentials()
        mutation = """
        mutation {
          resumeCampaigns(input: { campaignIds: [%s] }) {
            campaigns { id campaignStatus { state } }
          }
        }
        """ % campaign_id
        try:
            data = self._gql(mutation)
            errors = data.get("errors", [])
            if errors:
                return WriteResult(success=False, error=str(errors[0].get("message", errors)))
            return WriteResult(success=True, resource_name=f"campaigns/{campaign_id}")
        except Exception as e:
            return WriteResult(success=False, error=str(e))
