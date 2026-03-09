# Demand Gen Hub — Setup & Architecture

## Overview
Local-only Next.js operations platform for Telnyx demand gen. Syncs campaigns from Google Ads, LinkedIn Ads, and StackAdapt. Provides pipeline attribution, ABM list building, ad library search, budget tracking, campaign health monitoring, and AI-powered chat.

## Prerequisites
- **macOS** (tested on Mac mini M-series)
- **Node.js** ≥ 20
- **Python 3.14** (in `~/.venv`)
- **PostgreSQL 17** (Homebrew: `brew install postgresql@17`)
- **pm2** (`npm i -g pm2`)
- **OpenClaw** (gateway running on port 18789)

## Database
```bash
# Create database
createdb dghub

# Connection string
postgresql://localhost:5432/dghub

# Run migrations
cd demand-gen-hub
npx prisma migrate deploy
# Or reset: npx prisma migrate reset
```

## Credentials

All stored in `~/.config/` — never committed to repo.

### Google Ads (`~/.config/google-ads/credentials.json`)
```json
{
  "developer_token": "...",
  "client_id": "...",
  "client_secret": "...",
  "refresh_token": "...",
  "login_customer_id": "2893524941",
  "customer_id": "2356650573"
}
```
- MCC (login): `2893524941`
- Marketing Telnyx account: `2356650573`
- Dev token is in **test mode** — can read but not write campaigns
- Also needs `~/.config/google-ads/google-ads.yaml` for the Python client

### StackAdapt (`~/.config/stackadapt/credentials.json`)
```json
{
  "rest_api_key": "...",
  "graphql": { "token": "..." }
}
```
- Advertiser ID: `93053`
- GraphQL API for ads/creatives, REST for basic queries
- `campaignInsight(B2B_DOMAIN)` is async — must poll for results

### LinkedIn Ads (`~/.config/linkedin-ads/credentials.json`)
```json
{
  "client_id": "78l6ny8cki6h6o",
  "client_secret": "...",
  "access_token": "...",
  "ad_account_id": "505973078",
  "redirect_uri": "http://localhost:9876/callback"
}
```
- OAuth token expires **~April 20, 2026** (60-day refresh cycle)
- Reminder cron set for April 15
- Re-auth: `node scripts/linkedin-oauth.js` → opens browser → paste callback URL
- Uses v2 API (NOT versioned REST — returns 426 errors)
- `r_organization_social` scope insufficient for `/v2/organizations/{id}` GET
- Workaround: vanity name lookup from SF domains

### Salesforce (`~/.config/salesforce/credentials.json`)
```json
{
  "instance_url": "https://telnyx.my.salesforce.com",
  "access_token": "...",
  "username": "marketing.squad@telnyx.com",
  "api_version": "59.0"
}
```
- Authenticated via SF CLI: `sf org login web --alias telnyx-prod`
- Session expires — re-auth via CLI when needed
- Org ID: `00Dj0000001nifJEAQ`

## Environment Variables (`.env`)
```
DATABASE_URL=postgresql://localhost:5432/dghub
POSTGRES_PRISMA_URL=postgresql://localhost:5432/dghub
APP_PASSWORD=telnyx-dg-2026
OPENCLAW_GATEWAY_TOKEN=<from openclaw config>
GOOGLE_ADS_CUSTOMER_ID=2356650573
GOOGLE_ADS_LOGIN_CUSTOMER_ID=2893524941
STACKADAPT_API_KEY=<rest api key>
LINKEDIN_ADS_ACCOUNT=505973078
```

## Running

### Build & Start
```bash
cd demand-gen-hub
npm install
npm run build

# Start via pm2
OPENCLAW_GATEWAY_TOKEN=<token> pm2 start npm --name dg-hub -- start
OPENCLAW_GATEWAY_TOKEN=<token> pm2 start scripts/abm-worker.js --name abm-worker
```

### pm2 Processes
| Process | What | Port |
|---------|------|------|
| `dg-hub` | Next.js app | 3000 |
| `abm-worker` | Background ABM research jobs | — |

### Authentication
- Cookie-based: `dg-hub-session`
- Password: set via `APP_PASSWORD` env var
- Login endpoint: `POST /api/auth/login`

## Sync Scripts

All in `scripts/`. Run from the hub directory with the venv:

```bash
~/.venv/bin/python3 scripts/<script>.py
```

| Script | What | Frequency | Records |
|--------|------|-----------|---------|
| `sync_local.py` | Google Ads + StackAdapt campaigns | Daily | ~320 |
| `sync_linkedin.py` | LinkedIn campaigns + analytics | Daily | ~304 |
| `sync_salesforce.py` | SF campaigns, accounts, opportunities | Daily | ~8000 |
| `sync_ad_impressions.py` | StackAdapt B2B domain impressions | Weekly | ~5800 |
| `sync_linkedin_impressions.py` | LinkedIn company-level impressions | Weekly | ~5000 |
| `sync_changes.py` | Detect campaign state changes | Every 6-12h | — |

### What each sync pulls:
- **sync_local.py**: Campaign name, status, budget, spend (30d), impressions, clicks, conversions, `startDate`, `endDate`
- **sync_linkedin.py**: Same + `runSchedule.start/end` for dates, `metadata` JSON with objective/format
- **sync_salesforce.py**: SF campaigns (474), accounts (5000, ordered by revenue), opportunities (2545, created since 2025-01-01, amount > 0)
- **sync_ad_impressions.py**: StackAdapt `B2B_DOMAIN` insight — domain, impressions, clicks, cost, date range
- **sync_linkedin_impressions.py**: `MEMBER_COMPANY` pivot analytics, matched to SF accounts via `LinkedInOrgMapping` table. Only resolves accounts with active pipeline deals (67 vs 5000+).

## Architecture

### AI Routing
All AI calls proxy through OpenClaw gateway:
```
POST http://127.0.0.1:18789/v1/chat/completions
Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
Model: openclaw:main (routes to Anthropic Claude)
```

### Pages
| Route | Description |
|-------|-------------|
| `/dashboard` | Summary metrics, alerts, channel performance, trackers |
| `/campaigns` | All campaigns, inline health signals, AI deep dive |
| `/pipeline` | SF pipeline with multi-platform ad attribution (90-day lookback) |
| `/optimizations` | Timeline of campaign changes |
| `/ads` | Natural language ad creative search across platforms |
| `/budget` | Spend breakdown by 5 dimensions, platform filter |
| `/abm` | ABM list builder with AI research, many-to-many lists |
| `/agents` | Agent management, health checks, recommendations |
| `/chat` | AI chat with full campaign context |

### Attribution Model
- Matches StackAdapt + LinkedIn B2B domain impressions against SF account domains
- **90-day lookback** per deal (not global window)
- **New Business only** — excludes Renewal, Upsell, Cross-sell
- Two modes: Impressions (saw ads) / Clicks (engaged with ads)
- Open pipeline always shown unfiltered; date range filters attribution analysis

### Dashboard Alerts Logic
- **$0 Conversions**: Only BOFU campaigns, only if live >14 days, only if spend >$100
- **Expiring**: Campaigns ending within 7 days
- **Zero Impressions**: Only mature campaigns (>14 days), likely broken
- **Learning Phase**: Informational — campaigns <14 days old
- **Pacing removed**: Budget field is daily for Google/LinkedIn, total for StackAdapt — can't reliably calculate without `budgetType` field

### ABM System
- Many-to-many lists via `ABMList` + `ABMListMember` join table
- Background job system: wave-based (25/wave), max 500, dry streak detection
- Uses Sonnet (`anthropic/claude-sonnet-4-20250514`) for cost efficiency
- Worker polls every 5 seconds, runs as pm2 process

### Agent Framework
- 7 agents seeded: health-check, budget, optimizer, strategy, creative, reporting, executor
- Standard interface: `{task, context, config} → {findings, recommendations, artifacts}`
- Safety levels: 0 (observe), 1 (recommend), 2 (auto-apply)
- Health Check agent live — 6 checks, pure DB queries, <1 second

### Theme System
- Light/dark mode via `data-theme` attribute on `<html>`
- CSS variable overrides in `globals.css` remap hardcoded Tailwind dark-mode classes
- Light mode accent: mint green/emerald (no purple/blue indigo)
- Sidebar: collapsible, persists in localStorage

## Key API Quirks
- **Google Ads**: Dev token in test mode. Budget field is **daily**. Campaign dates: `campaign.start_date_time` (not `start_date`)
- **StackAdapt**: GraphQL for ads (REST ignores campaign filter). Status truth: `status.code` not `state`. Budget is **total campaign** budget. `campaignInsight(B2B_DOMAIN)` is async.
- **LinkedIn**: v2 API only (versioned REST returns 426). Budget can be daily OR monthly (no reliable way to tell). `organizations/{id}` returns 403 with current scopes. Analytics needs explicit `fields` param. Rate limit: ~4 req/sec.
- **Salesforce**: Session expires frequently — re-auth via `sf org login web`. `Amount` field = "12 Month Potential MRR" (forecast, not realized). `Current_MRR__c` = actual realized revenue for won deals.

## Team Access
- **ngrok Hobbyist ($8/mo)**: https://telnyx-dg-hub.ngrok.app — stable custom domain, no interstitial page
- **Health check**: `scripts/check-ngrok.sh` runs every 20 min via cron, auto-restarts if tunnel dies
- **Tailscale**: Installed but ACLs block inter-machine traffic. IT won't open ports.

## Database Counts (as of Feb 19, 2026)
- 623 campaigns (258 Google Ads + 304 LinkedIn + 61 StackAdapt)
- 474 SF campaigns
- 5000 SF accounts
- 2545 SF opportunities
- 5851+ ad impression records
- 983 ABM accounts
- 42 LinkedIn org mappings
- 7 agents, 21 recommendations
