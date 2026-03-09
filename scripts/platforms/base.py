"""
Base classes and types for platform connectors.
Every platform implements PlatformConnector.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class CampaignMetrics:
    """Normalized campaign-level metrics."""
    name: str
    campaign_id: str
    platform: str
    status: str  # normalized: "active", "paused", "ended", "removed"
    spend: float = 0.0
    impressions: int = 0
    clicks: int = 0
    conversions: float = 0.0
    ctr: float = 0.0
    avg_cpc: float = 0.0
    # Optional enrichments
    primary_conversions: Optional[float] = None
    conversion_breakdown: Optional[list] = None
    leads: int = 0
    signups: int = 0
    page_visits: int = 0
    key_conversions: int = 0


@dataclass
class MetricsResult:
    """Standardized metrics response from any platform."""
    platform: str
    date_from: str
    date_to: str
    total_spend: float = 0.0
    total_impressions: int = 0
    total_clicks: int = 0
    total_conversions: float = 0.0
    campaign_count: int = 0
    campaigns: list[CampaignMetrics] = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> dict:
        d = {
            "platform": self.platform,
            "dateFrom": self.date_from,
            "dateTo": self.date_to,
            "totalSpend": round(self.total_spend, 2),
            "totalImpressions": self.total_impressions,
            "totalClicks": self.total_clicks,
            "totalConversions": round(self.total_conversions, 1),
            "campaignCount": self.campaign_count,
            "campaigns": [
                {
                    "name": c.name,
                    "campaignId": c.campaign_id,
                    "platform": c.platform,
                    "status": c.status,
                    "spend": round(c.spend, 2),
                    "impressions": c.impressions,
                    "clicks": c.clicks,
                    "conversions": round(c.conversions, 1),
                    "ctr": round(c.ctr, 2),
                    "avgCpc": round(c.avg_cpc, 2),
                    **({"primaryConversions": round(c.primary_conversions, 1)} if c.primary_conversions is not None else {}),
                    **({"conversionBreakdown": c.conversion_breakdown} if c.conversion_breakdown else {}),
                }
                for c in self.campaigns
            ],
        }
        if self.error:
            d["error"] = self.error
        return d


@dataclass
class CampaignData:
    """Campaign data for sync to DB."""
    external_id: str
    name: str
    platform: str
    status: str
    campaign_type: str = ""
    objective: str = ""
    budget: Optional[float] = None
    budget_type: str = ""  # "daily" | "total" | "monthly"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    targeting_type: str = ""  # "keyword" | "abm" | "interest" | "retargeting"
    extra: dict = field(default_factory=dict)


@dataclass
class CreativeData:
    """Creative data for sync to DB."""
    external_id: str
    campaign_id: str
    platform: str
    ad_type: str
    status: str
    name: str = ""
    headlines: Optional[list] = None
    descriptions: Optional[list] = None
    body: str = ""
    image_url: str = ""
    final_url: str = ""
    extra: dict = field(default_factory=dict)


@dataclass
class WriteResult:
    """Result of a write mutation."""
    success: bool
    resource_name: str = ""
    error: str = ""


class PlatformConnector(ABC):
    """
    Abstract base for all platform connectors.
    Implement this to add a new ad platform.
    """

    @property
    @abstractmethod
    def slug(self) -> str:
        """Platform identifier: 'google_ads', 'linkedin', 'stackadapt', etc."""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name: 'Google Ads', 'LinkedIn', etc."""
        ...

    @property
    @abstractmethod
    def status_map(self) -> dict[str, str]:
        """Map platform-native status values to normalized: active/paused/ended/removed."""
        ...

    @abstractmethod
    def load_credentials(self) -> bool:
        """Load credentials from config file. Returns True if valid."""
        ...

    # ─── Query ────────────────────────────────────────

    @abstractmethod
    def query_metrics(
        self,
        date_from: str,
        date_to: str,
        search: Optional[str] = None,
        active_only: bool = True,
    ) -> MetricsResult:
        """Query live campaign-level metrics for a date range."""
        ...

    # ─── Sync ─────────────────────────────────────────

    @abstractmethod
    def fetch_campaigns(self, active_only: bool = True) -> list[CampaignData]:
        """Fetch all campaigns for sync to DB."""
        ...

    @abstractmethod
    def fetch_creatives(self, active_only: bool = True) -> list[CreativeData]:
        """Fetch ad creatives for sync to DB."""
        ...

    # ─── Write (optional — override if platform supports) ───

    def add_negative_keyword(self, campaign_id: str, keyword: str, match_type: str = "EXACT") -> WriteResult:
        """Add a negative keyword to a campaign. Override if supported."""
        return WriteResult(success=False, error=f"{self.display_name} does not support negative keywords")

    def pause_campaign(self, campaign_id: str) -> WriteResult:
        """Pause a campaign. Override if supported."""
        return WriteResult(success=False, error=f"{self.display_name} write access not available")

    def enable_campaign(self, campaign_id: str) -> WriteResult:
        """Enable a paused campaign. Override if supported."""
        return WriteResult(success=False, error=f"{self.display_name} write access not available")

    def update_budget(self, campaign_id: str, new_budget: float, budget_type: str = "daily") -> WriteResult:
        """Update campaign daily budget. Override if supported."""
        return WriteResult(success=False, error=f"{self.display_name} budget updates not available")

    # ─── Helpers ──────────────────────────────────────

    def normalize_status(self, raw_status: str) -> str:
        """Convert platform-native status to normalized value."""
        return self.status_map.get(raw_status.upper(), raw_status.lower())
