"""Google Ads platform connector."""

import json
import os
from typing import Optional

from .base import (
    PlatformConnector, MetricsResult, CampaignMetrics, CampaignData,
    CreativeData, WriteResult,
)


class GoogleAdsConnector(PlatformConnector):
    slug = "google_ads"
    display_name = "Google Ads"
    status_map = {
        "ENABLED": "active",
        "PAUSED": "paused",
        "REMOVED": "removed",
        "0": "unspecified", "1": "unknown", "2": "active", "3": "paused", "4": "removed",
    }

    def __init__(self):
        self._client = None
        self._customer_id = None
        self._creds = None

    def load_credentials(self) -> bool:
        cred_path = os.path.expanduser("~/.config/google-ads/credentials.json")
        if not os.path.exists(cred_path):
            return False
        with open(cred_path) as f:
            self._creds = json.load(f)
        self._customer_id = str(self._creds.get("accounts", {}).get("marketing_telnyx", {}).get("customer_id", "2356650573"))
        return True

    def _get_client(self):
        if self._client is None:
            from google.ads.googleads.client import GoogleAdsClient
            self._client = GoogleAdsClient.load_from_dict({
                "developer_token": self._creds["developer_token"],
                "client_id": self._creds["client_id"],
                "client_secret": self._creds["client_secret"],
                "refresh_token": self._creds["refresh_token"],
                "login_customer_id": str(self._creds.get("login_customer_id", "2893524941")),
                "use_proto_plus": True,
            })
        return self._client

    def _service(self):
        return self._get_client().get_service("GoogleAdsService")

    # ─── Query ────────────────────────────────────────

    def query_metrics(self, date_from: str, date_to: str, search: Optional[str] = None, active_only: bool = True) -> MetricsResult:
        if not self._creds:
            self.load_credentials()
        try:
            return self._query_metrics_impl(date_from, date_to, search, active_only)
        except Exception as e:
            return MetricsResult(platform=self.slug, date_from=date_from, date_to=date_to, error=str(e))

    def _query_metrics_impl(self, date_from, date_to, search, active_only):
        ga = self._service()
        STATUS_MAP = {0: "UNSPECIFIED", 1: "UNKNOWN", 2: "ENABLED", 3: "PAUSED", 4: "REMOVED"}

        where = [f"segments.date >= '{date_from}'", f"segments.date <= '{date_to}'"]
        if active_only:
            where.append("campaign.status = 'ENABLED'")
        else:
            where.append("campaign.status != 'REMOVED'")
        if search:
            where.append(f"campaign.name LIKE '%{search}%'")

        query = f"""
            SELECT campaign.name, campaign.id, campaign.status,
                   metrics.cost_micros, metrics.impressions, metrics.clicks,
                   metrics.conversions, metrics.all_conversions, metrics.ctr, metrics.average_cpc
            FROM campaign WHERE {' AND '.join(where)}
            ORDER BY metrics.cost_micros DESC
        """

        campaigns = []
        response = ga.search(customer_id=self._customer_id, query=query)
        for row in response:
            cost = row.metrics.cost_micros / 1_000_000
            avg_cpc = row.metrics.average_cpc / 1_000_000 if row.metrics.average_cpc else 0
            status_raw = STATUS_MAP.get(row.campaign.status, str(row.campaign.status))
            campaigns.append(CampaignMetrics(
                name=row.campaign.name,
                campaign_id=str(row.campaign.id),
                platform=self.slug,
                status=self.normalize_status(status_raw),
                spend=cost,
                impressions=row.metrics.impressions,
                clicks=row.metrics.clicks,
                conversions=row.metrics.all_conversions,
                primary_conversions=row.metrics.conversions,
                ctr=row.metrics.ctr * 100 if row.metrics.ctr else 0,
                avg_cpc=avg_cpc,
            ))

        # Conversion action breakdown
        conv_query = f"""
            SELECT campaign.id, segments.conversion_action_name, metrics.all_conversions
            FROM campaign WHERE {' AND '.join(where)}
        """
        conv_map = {}
        try:
            for row in ga.search(customer_id=self._customer_id, query=conv_query):
                cid = str(row.campaign.id)
                if row.metrics.all_conversions > 0:
                    conv_map.setdefault(cid, []).append({
                        "action": row.segments.conversion_action_name,
                        "conversions": round(row.metrics.all_conversions, 1),
                    })
        except Exception:
            pass

        for c in campaigns:
            if c.campaign_id in conv_map:
                c.conversion_breakdown = sorted(conv_map[c.campaign_id], key=lambda x: x["conversions"], reverse=True)

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
        if not self._creds:
            self.load_credentials()
        ga = self._service()
        STATUS_MAP = {0: "UNSPECIFIED", 1: "UNKNOWN", 2: "ENABLED", 3: "PAUSED", 4: "REMOVED"}

        where = ["campaign.status != 'REMOVED'"]
        if active_only:
            where = ["campaign.status = 'ENABLED'"]

        query = f"""
            SELECT campaign.id, campaign.name, campaign.status,
                   campaign.advertising_channel_type,
                   campaign_budget.amount_micros
            FROM campaign WHERE {' AND '.join(where)}
        """

        results = []
        for row in ga.search(customer_id=self._customer_id, query=query):
            status_raw = STATUS_MAP.get(row.campaign.status, str(row.campaign.status))
            budget = row.campaign_budget.amount_micros / 1_000_000 if row.campaign_budget.amount_micros else None
            results.append(CampaignData(
                external_id=str(row.campaign.id),
                name=row.campaign.name,
                platform=self.slug,
                status=self.normalize_status(status_raw),
                campaign_type=str(row.campaign.advertising_channel_type).replace("AdvertisingChannelType.", ""),
                budget=budget,
                budget_type="daily",
            ))
        return results

    def fetch_creatives(self, active_only: bool = True) -> list[CreativeData]:
        if not self._creds:
            self.load_credentials()
        ga = self._service()

        status_filter = "AND campaign.status = 'ENABLED'" if active_only else ""
        creatives = []

        # RSA
        query = f"""
            SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status,
                   ad_group_ad.ad.responsive_search_ad.headlines,
                   ad_group_ad.ad.responsive_search_ad.descriptions,
                   ad_group_ad.ad.final_urls, campaign.id
            FROM ad_group_ad
            WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
            {status_filter}
        """
        try:
            for row in ga.search(customer_id=self._customer_id, query=query):
                ad = row.ad_group_ad.ad
                headlines = [h.text for h in (ad.responsive_search_ad.headlines or [])]
                descriptions = [d.text for d in (ad.responsive_search_ad.descriptions or [])]
                creatives.append(CreativeData(
                    external_id=str(ad.id),
                    campaign_id=str(row.campaign.id),
                    platform=self.slug,
                    ad_type="Responsive Search",
                    status=self.normalize_status(str(row.ad_group_ad.status)),
                    name=ad.name or "",
                    headlines=headlines,
                    descriptions=descriptions,
                    final_url=list(ad.final_urls)[0] if ad.final_urls else "",
                ))
        except Exception:
            pass

        return creatives

    # ─── Write ────────────────────────────────────────

    def add_negative_keyword(self, campaign_id: str, keyword: str, match_type: str = "EXACT") -> WriteResult:
        if not self._creds:
            self.load_credentials()
        client = self._get_client()
        MATCH_MAP = {"EXACT": 2, "PHRASE": 3, "BROAD": 4}

        service = client.get_service("CampaignCriterionService")
        op = client.get_type("CampaignCriterionOperation")
        criterion = op.create
        criterion.campaign = client.get_service("CampaignService").campaign_path(self._customer_id, campaign_id)
        criterion.negative = True
        criterion.keyword.text = keyword
        criterion.keyword.match_type = MATCH_MAP.get(match_type.upper(), 2)

        try:
            response = service.mutate_campaign_criteria(customer_id=self._customer_id, operations=[op])
            rn = response.results[0].resource_name
            return WriteResult(success=True, resource_name=rn)
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def pause_campaign(self, campaign_id: str) -> WriteResult:
        return self._set_campaign_status(campaign_id, 3)  # PAUSED

    def enable_campaign(self, campaign_id: str) -> WriteResult:
        return self._set_campaign_status(campaign_id, 2)  # ENABLED

    def update_budget(self, campaign_id: str, new_budget: float, budget_type: str = "daily") -> WriteResult:
        """Update a campaign's daily budget via CampaignBudgetService."""
        if not self._creds:
            self.load_credentials()
        client = self._get_client()
        ga = self._service()

        try:
            # Step 1: Get the campaign's budget resource name
            query = f"""
                SELECT campaign.id, campaign_budget.resource_name
                FROM campaign WHERE campaign.id = {campaign_id}
            """
            budget_resource_name = None
            for row in ga.search(customer_id=self._customer_id, query=query):
                budget_resource_name = row.campaign_budget.resource_name
                break

            if not budget_resource_name:
                return WriteResult(success=False, error=f"Campaign {campaign_id} not found or has no budget")

            # Step 2: Mutate the budget
            from google.protobuf import field_mask_pb2
            service = client.get_service("CampaignBudgetService")
            op = client.get_type("CampaignBudgetOperation")
            budget = op.update
            budget.resource_name = budget_resource_name
            budget.amount_micros = int(new_budget * 1_000_000)
            client.copy_from(op.update_mask, field_mask_pb2.FieldMask(paths=["amount_micros"]))

            response = service.mutate_campaign_budgets(customer_id=self._customer_id, operations=[op])
            return WriteResult(success=True, resource_name=response.results[0].resource_name)
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def update_device_bid(self, campaign_id: str, device_type: str, modifier_pct: float) -> WriteResult:
        """Update device bid modifier for a campaign.
        device_type: MOBILE, DESKTOP, TABLET
        modifier_pct: e.g. -0.15 for -15%, 0.20 for +20%
        """
        if not self._creds:
            self.load_credentials()
        client = self._get_client()
        from google.protobuf import field_mask_pb2

        DEVICE_MAP = {"MOBILE": 30001, "DESKTOP": 30000, "TABLET": 30002}
        device_id = DEVICE_MAP.get(device_type.upper())
        if device_id is None:
            return WriteResult(success=False, error=f"Unknown device type: {device_type}")

        service = client.get_service("CampaignCriterionService")
        resource_name = (
            f"customers/{self._customer_id}/campaignCriteria/{campaign_id}~{device_id}"
        )

        op = client.get_type("CampaignCriterionOperation")
        criterion = op.update
        criterion.resource_name = resource_name
        criterion.bid_modifier = 1.0 + modifier_pct
        client.copy_from(op.update_mask, field_mask_pb2.FieldMask(paths=["bid_modifier"]))

        try:
            response = service.mutate_campaign_criteria(
                customer_id=self._customer_id, operations=[op]
            )
            return WriteResult(success=True, resource_name=response.results[0].resource_name)
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def get_device_metrics(self, date_from: str, date_to: str, active_only: bool = True) -> list[dict]:
        """Get device-segmented campaign metrics."""
        if not self._creds:
            self.load_credentials()
        ga = self._service()
        where = [f"segments.date >= '{date_from}'", f"segments.date <= '{date_to}'"]
        if active_only:
            where.append("campaign.status = 'ENABLED'")
        query = f"""
            SELECT campaign.id, campaign.name, segments.device,
                   metrics.cost_micros, metrics.clicks, metrics.impressions,
                   metrics.conversions, metrics.all_conversions
            FROM campaign
            WHERE {' AND '.join(where)}
        """
        results = []
        try:
            for row in ga.search(customer_id=self._customer_id, query=query):
                results.append({
                    "campaign_id": str(row.campaign.id),
                    "campaign_name": row.campaign.name,
                    "device": str(row.segments.device).replace("Device.", ""),
                    "spend": row.metrics.cost_micros / 1_000_000,
                    "clicks": row.metrics.clicks,
                    "impressions": row.metrics.impressions,
                    "conversions": row.metrics.all_conversions,
                })
        except Exception as e:
            print(f"  Google device metrics error: {e}")
        return results

    def get_geo_metrics(self, date_from: str, date_to: str, active_only: bool = True) -> list[dict]:
        """Get geo-segmented campaign metrics."""
        if not self._creds:
            self.load_credentials()
        ga = self._service()
        where = [f"segments.date >= '{date_from}'", f"segments.date <= '{date_to}'"]
        if active_only:
            where.append("campaign.status = 'ENABLED'")
        query = f"""
            SELECT campaign.id, campaign.name,
                   geographic_view.country_criterion_id,
                   metrics.cost_micros, metrics.clicks, metrics.impressions,
                   metrics.conversions, metrics.all_conversions
            FROM geographic_view
            WHERE {' AND '.join(where)}
        """
        results = []
        try:
            for row in ga.search(customer_id=self._customer_id, query=query):
                results.append({
                    "campaign_id": str(row.campaign.id),
                    "campaign_name": row.campaign.name,
                    "country_id": str(row.geographic_view.country_criterion_id),
                    "spend": row.metrics.cost_micros / 1_000_000,
                    "clicks": row.metrics.clicks,
                    "impressions": row.metrics.impressions,
                    "conversions": row.metrics.all_conversions,
                })
        except Exception as e:
            print(f"  Google geo metrics error: {e}")
        return results

    def pause_keyword(self, campaign_id: str, ad_group_id: str, criterion_id: str) -> WriteResult:
        """Pause a keyword (ad group criterion) via Google Ads API."""
        if not self._creds:
            self.load_credentials()
        client = self._get_client()
        from google.protobuf import field_mask_pb2

        service = client.get_service("AdGroupCriterionService")
        resource_name = service.ad_group_criterion_path(self._customer_id, ad_group_id, criterion_id)

        op = client.get_type("AdGroupCriterionOperation")
        criterion = op.update
        criterion.resource_name = resource_name
        criterion.status = client.enums.AdGroupCriterionStatusEnum.PAUSED
        client.copy_from(op.update_mask, field_mask_pb2.FieldMask(paths=["status"]))

        try:
            response = service.mutate_ad_group_criteria(customer_id=self._customer_id, operations=[op])
            return WriteResult(success=True, resource_name=response.results[0].resource_name)
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def update_device_bid(self, campaign_id: str, device_type: str, modifier: float) -> WriteResult:
        """Update device bid modifier for a campaign. modifier is relative (e.g., -0.15 = -15%)."""
        if not self._creds:
            self.load_credentials()
        client = self._get_client()
        from google.protobuf import field_mask_pb2

        service = client.get_service("CampaignCriterionService")
        ga = self._service()

        # Check if device criterion exists
        query = f"""
            SELECT campaign_criterion.resource_name
            FROM campaign_criterion
            WHERE campaign.id = {campaign_id}
              AND campaign_criterion.type = 'DEVICE'
              AND campaign_criterion.device.type = '{device_type.upper()}'
        """
        existing_rn = None
        try:
            for row in ga.search(customer_id=self._customer_id, query=query):
                existing_rn = row.campaign_criterion.resource_name
                break
        except Exception:
            pass

        bid_value = 1.0 + modifier

        try:
            if existing_rn:
                op = client.get_type("CampaignCriterionOperation")
                criterion = op.update
                criterion.resource_name = existing_rn
                criterion.bid_modifier = bid_value
                client.copy_from(op.update_mask, field_mask_pb2.FieldMask(paths=["bid_modifier"]))
            else:
                op = client.get_type("CampaignCriterionOperation")
                criterion = op.create
                criterion.campaign = client.get_service("CampaignService").campaign_path(self._customer_id, campaign_id)
                criterion.device.type_ = client.enums.DeviceEnum[device_type.upper()].value
                criterion.bid_modifier = bid_value

            response = service.mutate_campaign_criteria(customer_id=self._customer_id, operations=[op])
            return WriteResult(success=True, resource_name=response.results[0].resource_name)
        except Exception as e:
            return WriteResult(success=False, error=str(e))

    def _set_campaign_status(self, campaign_id: str, status: int) -> WriteResult:
        if not self._creds:
            self.load_credentials()
        client = self._get_client()
        service = client.get_service("CampaignService")
        op = client.get_type("CampaignOperation")
        campaign = op.update
        campaign.resource_name = service.campaign_path(self._customer_id, campaign_id)
        campaign.status = status
        from google.api_core import protobuf_helpers
        from google.protobuf import field_mask_pb2
        client.copy_from(op.update_mask, field_mask_pb2.FieldMask(paths=["status"]))

        try:
            response = service.mutate_campaigns(customer_id=self._customer_id, operations=[op])
            return WriteResult(success=True, resource_name=response.results[0].resource_name)
        except Exception as e:
            return WriteResult(success=False, error=str(e))
