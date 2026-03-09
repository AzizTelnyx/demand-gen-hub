"""
Platform Connector Abstraction
==============================
Standard interface for ad platform integrations.
Adding a new platform = implementing PlatformConnector + a credentials JSON file.

Usage:
    from platforms import get_connector, get_all_connectors
    
    # Single platform
    google = get_connector("google_ads")
    metrics = google.query_metrics("2026-01-01", "2026-01-31")
    
    # All platforms
    for connector in get_all_connectors():
        metrics = connector.query_metrics("2026-01-01", "2026-01-31")
"""

from .base import PlatformConnector, MetricsResult, CampaignMetrics, CampaignData, CreativeData
from .registry import get_connector, get_all_connectors, list_platforms

__all__ = [
    "PlatformConnector", "MetricsResult", "CampaignMetrics", "CampaignData", "CreativeData",
    "get_connector", "get_all_connectors", "list_platforms",
]
