"""
Platform connector registry.
Auto-discovers and loads connectors. Add new platforms by creating a module
in this package that defines a class extending PlatformConnector.
"""

from typing import Optional
from .base import PlatformConnector

# Lazy import to avoid loading all platform SDKs at once
_CONNECTORS: dict[str, type[PlatformConnector]] = {}
_INSTANCES: dict[str, PlatformConnector] = {}


def _register_builtins():
    if _CONNECTORS:
        return
    from .google_ads import GoogleAdsConnector
    from .linkedin import LinkedInConnector
    from .stackadapt import StackAdaptConnector
    from .reddit import RedditConnector

    for cls in [GoogleAdsConnector, LinkedInConnector, StackAdaptConnector, RedditConnector]:
        _CONNECTORS[cls.slug] = cls


def register_connector(cls: type[PlatformConnector]):
    """Register a custom platform connector."""
    _CONNECTORS[cls.slug] = cls


def get_connector(slug: str) -> PlatformConnector:
    """Get a connector instance by platform slug. Credentials loaded lazily."""
    _register_builtins()
    if slug not in _INSTANCES:
        if slug not in _CONNECTORS:
            raise ValueError(f"Unknown platform: {slug}. Available: {list(_CONNECTORS.keys())}")
        instance = _CONNECTORS[slug]()
        instance.load_credentials()
        _INSTANCES[slug] = instance
    return _INSTANCES[slug]


def get_all_connectors() -> list[PlatformConnector]:
    """Get all registered connector instances."""
    _register_builtins()
    return [get_connector(slug) for slug in _CONNECTORS]


def list_platforms() -> list[str]:
    """List all registered platform slugs."""
    _register_builtins()
    return list(_CONNECTORS.keys())
