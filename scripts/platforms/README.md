# Platform Connector Abstraction

Standard interface for ad platform integrations. Adding a new platform = implementing `PlatformConnector` + a credentials JSON file.

## Architecture

```
platforms/
├── __init__.py          # Public API
├── base.py              # Abstract base class + data types
├── registry.py          # Auto-discovery + singleton management
├── google_ads.py        # Google Ads connector (full R/W)
├── linkedin.py          # LinkedIn connector (read-only — needs rw_ads scope)
├── stackadapt.py        # StackAdapt connector (R/W via GraphQL)
└── README.md
```

## Usage

```python
from platforms import get_connector, get_all_connectors, list_platforms

# Single platform
google = get_connector("google_ads")
metrics = google.query_metrics("2026-01-01", "2026-01-31")
print(metrics.total_spend, metrics.campaign_count)

# All platforms
for conn in get_all_connectors():
    r = conn.query_metrics("2026-02-01", "2026-02-28")
    print(f"{conn.display_name}: ${r.total_spend:,.0f}")

# Write operations
result = google.add_negative_keyword("12345", "esim", "PHRASE")
result = google.pause_campaign("12345")
```

## Standard Interface

Every connector implements:

| Method | Description | Returns |
|--------|-------------|---------|
| `query_metrics(from, to, search?, active_only?)` | Live campaign metrics | `MetricsResult` |
| `fetch_campaigns(active_only?)` | Campaigns for DB sync | `list[CampaignData]` |
| `fetch_creatives(active_only?)` | Creatives for DB sync | `list[CreativeData]` |
| `add_negative_keyword(campaign_id, keyword, match)` | Add negative keyword | `WriteResult` |
| `pause_campaign(campaign_id)` | Pause a campaign | `WriteResult` |
| `enable_campaign(campaign_id)` | Enable a campaign | `WriteResult` |

Write methods return `WriteResult(success=False, error="...")` if the platform doesn't support them.

## Adding a New Platform

1. Create `scripts/platforms/my_platform.py`
2. Implement `PlatformConnector`:
   - Set `slug`, `display_name`, `status_map`
   - Implement `load_credentials()`, `query_metrics()`, `fetch_campaigns()`, `fetch_creatives()`
   - Override write methods if supported
3. Add credentials to `~/.config/my-platform/credentials.json`
4. Register in `registry.py` `_register_builtins()`

## Credentials

All credentials live in `~/.config/<platform>/credentials.json`. Never hardcoded.

| Platform | Credential File | Write Access |
|----------|----------------|--------------|
| Google Ads | `~/.config/google-ads/credentials.json` | Full (negative keywords, pause/enable) |
| LinkedIn | `~/.config/linkedin-ads/credentials.json` | Read-only (needs `rw_ads` scope) |
| StackAdapt | `~/.config/stackadapt/credentials.json` | Full (R/W GraphQL token) |

## Status Normalization

All platforms normalize to: `active`, `paused`, `ended`, `removed`

| Platform | Active | Paused | Ended | Removed |
|----------|--------|--------|-------|---------|
| Google Ads | ENABLED | PAUSED | — | REMOVED |
| LinkedIn | ACTIVE | PAUSED/DRAFT | ARCHIVED/COMPLETED | CANCELED |
| StackAdapt | LIVE | PAUSED | ENDED | ARCHIVED |
