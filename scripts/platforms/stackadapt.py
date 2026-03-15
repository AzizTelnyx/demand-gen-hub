"""Fixed StackAdapt platform connector methods."""

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

    # ─── Frequency Cap Management ──────────────────────────────────

    def get_frequency_cap(self, campaign_group_id: str) -> dict:
        """Get frequency cap from campaign group settings."""
        if not self._token:
            self.load_credentials()
        query = """
        {
          campaigns(filterBy: { campaignGroupIds: [%s] }, first: 1) {
            nodes {
              campaignGroup { id name freqCapLimit freqCapExpiry }
            }
          }
        }
        """ % campaign_group_id
        try:
            data = self._gql(query, timeout=30)
            nodes = data.get("data", {}).get("campaigns", {}).get("nodes", [])
            if nodes:
                cg = nodes[0].get("campaignGroup") or {}
                return {
                    "cap": cg.get("freqCapLimit"),
                    "expiry_hours": cg.get("freqCapExpiry"),
                    "campaign_group_id": cg.get("id")
                }
            return {}
        except Exception as e:
            print(f"  StackAdapt get_frequency_cap error: {e}")
            return {}

    def get_reach_frequency(self, campaign_group_id: str, start_time: str, end_time: str, period: int = 7) -> list[dict]:
        """Get reach/frequency stats for a campaign group.
        start_time/end_time: ISO 8601 timestamps. period: days per bucket."""
        if not self._token:
            self.load_credentials()
        query = """
        {
          reachFrequency(
            filterBy: {
              campaignGroupIds: [%s]
              startTime: "%s"
              endTime: "%s"
              period: %d
            }
            first: 50
          ) {
            nodes { frequency impressions uniqueImpressions channel }
          }
        }
        """ % (campaign_group_id, start_time, end_time, period)
        try:
            data = self._gql(query, timeout=30)
            nodes = data.get("data", {}).get("reachFrequency", {}).get("nodes", [])
            return [
                {
                    "frequency": n.get("frequency"),
                    "impressions": n.get("impressions"),
                    "unique_impressions": n.get("uniqueImpressions"),
                    "channel": n.get("channel"),
                }
                for n in nodes
            ]
        except Exception as e:
            print(f"  StackAdapt reach_frequency error: {e}")
            return []

    def update_frequency_cap(self, campaign_group_id: str, cap: int, expiry_hours: int = 24) -> WriteResult:
        """Update frequency cap for a campaign group.
        cap: max impressions per user. expiry_hours: reset window in hours."""
        if not self._token:
            self.load_credentials()
        mutation = """
        mutation {
          updateCampaignGroup(input: {
            id: %s
            freqCapLimit: %d
            freqCapExpiry: %d
          }) {
            campaignGroup { id freqCapLimit freqCapExpiry }
          }
        }
        """ % (campaign_group_id, cap, expiry_hours)
        try:
            data = self._gql(mutation, timeout=30)
            errors = data.get("errors", [])
            if errors:
                return WriteResult(success=False, error=str(errors[0].get("message", errors)))
            return WriteResult(success=True, resource_name=f"campaignGroups/{campaign_group_id}")
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    # ─── Domain Management ───────────────────────────────────────

    def get_domain_lists(self, campaign_group_id: str) -> dict:
        """Get domain inclusion and exclusion lists for a campaign group."""
        if not self._token:
            self.load_credentials()
        query = """
        {
          campaigns(filterBy: { campaignGroupIds: [%s] }, first: 1) {
            nodes {
              campaignGroup { id name domains domainExclusions }
            }
          }
        }
        """ % campaign_group_id
        try:
            data = self._gql(query, timeout=30)
            nodes = data.get("data", {}).get("campaigns", {}).get("nodes", [])
            if nodes:
                cg = nodes[0].get("campaignGroup") or {}
                return {
                    "campaign_group_id": cg.get("id"),
                    "domains": cg.get("domains", []),
                    "domain_exclusions": cg.get("domainExclusions", []),
                }
            return {"domains": [], "domain_exclusions": []}
        except Exception as e:
            print(f"  StackAdapt get_domain_lists error: {e}")
            return {"domains": [], "domain_exclusions": []}

    # ─── Creative Metrics ────────────────────────────────────────

    def get_creative_metrics(self, campaign_group_id: str, date_from: str, date_to: str, limit: int = 500) -> list[dict]:
        """Get per-ad metrics using adDelivery query."""
        if not self._token:
            self.load_credentials()
        query = """
        {
          adDelivery(
            filterBy: { campaignGroupIds: [%s] }
            date: { from: "%s", to: "%s" }
            granularity: TOTAL
            dataType: TABLE
          ) {
            ... on AdDeliveryOutcome {
              records(first: %d) { nodes {
                ad { id name }
                campaign { id name }
                metrics { impressionsBigint clicksBigint cost ctr conversionsBigint viewedMeasuredImpressionsBigint }
              } }
            }
          }
        }
        """ % (campaign_group_id, date_from, date_to, limit)
        try:
            data = self._gql(query, timeout=60)
            nodes = data.get("data", {}).get("adDelivery", {}).get("records", {}).get("nodes", [])
            results = []
            for n in nodes:
                ad = n.get("ad") or {}
                campaign = n.get("campaign") or {}
                m = n.get("metrics", {})
                results.append({
                    "creative_id": str(ad.get("id", "")),
                    "name": ad.get("name", ""),
                    "campaign_id": str(campaign.get("id", "")),
                    "campaign_name": campaign.get("name", ""),
                    "impressions": int(m.get("impressionsBigint", 0) or 0),
                    "clicks": int(m.get("clicksBigint", 0) or 0),
                    "spend": float(m.get("cost", 0) or 0),
                    "ctr": float(m.get("ctr", 0) or 0),
                    "conversions": int(m.get("conversionsBigint", 0) or 0),
                    "viewable_impressions": int(m.get("viewedMeasuredImpressionsBigint", 0) or 0),
                })
            return results
        except Exception as e:
            print(f"  StackAdapt creative metrics error: {e}")
            return []

    # ─── Geo Report (works) ───────────────────────────────────────

    def get_geo_report(self, campaign_group_id: str, date_from: str, date_to: str, limit: int = 500) -> list[dict]:
        """Get geo-level delivery report."""
        if not self._token:
            self.load_credentials()
        query = """
        {
          campaignDelivery(
            filterBy: { campaignGroupIds: [%s] }
            date: { from: "%s", to: "%s" }
            granularity: TOTAL
            dataType: TABLE
            adBreakdowns: [COUNTRY]
          ) {
            ... on CampaignDeliveryOutcome {
              records(first: %d) { nodes {
                breakdown { country }
                metrics { impressionsBigint clicksBigint cost ctr conversionsBigint }
              } }
            }
          }
        }
        """ % (campaign_group_id, date_from, date_to, limit)
        try:
            data = self._gql(query, timeout=60)
            nodes = data.get("data", {}).get("campaignDelivery", {}).get("records", {}).get("nodes", [])
            results = []
            for n in nodes:
                country = (n.get("breakdown") or {}).get("country", "")
                m = n.get("metrics", {})
                results.append({
                    "country": country,
                    "impressions": int(m.get("impressionsBigint", 0) or 0),
                    "clicks": int(m.get("clicksBigint", 0) or 0),
                    "spend": float(m.get("cost", 0) or 0),
                    "conversions": int(m.get("conversionsBigint", 0) or 0),
                })
            return results
        except Exception as e:
            print(f"  StackAdapt geo report error: {e}")
            return []

    # ─── Campaign fetch with campaignGroupId ──────────────────────

    def fetch_campaigns_with_groups(self, active_only: bool = True) -> list[dict]:
        """Fetch campaigns with their campaign group IDs."""
        if not self._token:
            self.load_credentials()

        query = """
        {
          campaigns(filterBy: { advertiserIds: [%d] }, first: 500) {
            nodes {
              id
              name
              campaignStatus { state }
              campaignGroup { id }
            }
          }
        }
        """ % self.ADVERTISER_ID

        data = self._gql(query, timeout=30)
        nodes = data.get("data", {}).get("campaigns", {}).get("nodes", [])

        results = []
        for c in nodes:
            status_raw = (c.get("campaignStatus", {}).get("state", "")).upper()
            status = self.normalize_status(status_raw)
            if active_only and status != "active":
                continue
            results.append({
                "campaign_id": str(c["id"]),
                "campaign_group_id": str((c.get("campaignGroup") or {}).get("id", c["id"])),
                "name": c.get("name", ""),
                "status": status,
            })
        return results

    # ─── Original methods (keep for compatibility) ───────────────

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
            nodes { id name campaignStatus { state } campaignGroup { id } }
          }
        }
        """ % self.ADVERTISER_ID
        camp_data = self._gql(camp_query, timeout=30)
        camp_nodes = camp_data.get("data", {}).get("campaigns", {}).get("nodes", [])
        camp_status = {str(c["id"]): (c.get("campaignStatus", {}).get("state", "")).upper() for c in camp_nodes}
        camp_group = {str(c["id"]): str((c.get("campaignGroup") or {}).get("id", c["id"])) for c in camp_nodes}

        # Get metrics using campaign group filter
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

        camps = self.fetch_campaigns(active_only=active_only)
        camp_ids = {c.external_id for c in camps}

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

    def update_budget(self, campaign_id: str, new_budget: float, budget_type: str = "total") -> WriteResult:
        """Update a StackAdapt campaign's budget via GraphQL mutation."""
        if not self._token:
            self.load_credentials()
        mutation = """
        mutation {
          updateCampaign(input: { id: %s, budget: %s }) {
            campaign { id budget campaignStatus { state } }
          }
        }
        """ % (campaign_id, new_budget)
        try:
            data = self._gql(mutation)
            errors = data.get("errors", [])
            if errors:
                return WriteResult(success=False, error=str(errors[0].get("message", errors)))
            return WriteResult(success=True, resource_name=f"campaigns/{campaign_id}")
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def update_domain_exclusions(self, campaign_id: str, domains: list[str]) -> WriteResult:
        """Update domain exclusions for a StackAdapt campaign."""
        if not self._token:
            self.load_credentials()
        domains_str = json.dumps(domains)
        mutation = """
        mutation {
          updateCampaign(input: { id: %s, domainExclusions: %s }) {
            campaign { id }
          }
        }
        """ % (campaign_id, domains_str)
        try:
            data = self._gql(mutation)
            errors = data.get("errors", [])
            if errors:
                return WriteResult(success=False, error=str(errors[0].get("message", errors)))
            return WriteResult(success=True, resource_name=f"campaigns/{campaign_id}")
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def exclude_domains(self, campaign_group_id: str, domains: list[str]) -> WriteResult:
        """Add domains to campaign group exclusion list.
        NOTE: This REPLACES the entire exclusion list. Caller must merge with existing."""
        if not self._token:
            self.load_credentials()
        # First fetch current exclusions to append
        current = self.get_domain_lists(campaign_group_id)
        existing = set(current.get("domain_exclusions", []))
        merged = sorted(existing | set(domains))
        domain_list = ", ".join(f'"{d}"' for d in merged)
        mutation = """
        mutation {
          updateCampaignGroup(input: {
            id: %s
            domainExclusions: [%s]
          }) {
            campaignGroup { id name domainExclusions }
          }
        }
        """ % (campaign_group_id, domain_list)
        try:
            data = self._gql(mutation)
            errors = data.get("errors", [])
            if errors:
                return WriteResult(success=False, error=str(errors[0].get("message", errors)))
            return WriteResult(success=True, resource_name=f"campaignGroups/{campaign_group_id}")
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def update_creative_impression_share(self, campaign_id: str, creative_id: str, weight: int) -> WriteResult:
        """Update native ad weight (impression share) within a campaign."""
        if not self._token:
            self.load_credentials()
        mutation = """
        mutation {
          updateNativeAd(input: {
            id: %s
            weight: %d
          }) {
            nativeAd { id name weight }
          }
        }
        """ % (creative_id, weight)
        try:
            data = self._gql(mutation)
            errors = data.get("errors", [])
            if errors:
                return WriteResult(success=False, error=str(errors[0].get("message", errors)))
            return WriteResult(success=True, resource_name=f"nativeAds/{creative_id}")
        except Exception as e:
            return WriteResult(success=False, error=str(e))
