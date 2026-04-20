# Demand Gen Hub

Unified operations platform for Telnyx Demand Generation — campaign management, ABM lifecycle, agent automation, and cross-platform analytics.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    DG Hub (Next.js)                       │
│  localhost:3000 / telnyx-dg-hub.ngrok.app                 │
├──────────┬──────────┬──────────┬──────────┬──────────────┤
│ Campaigns│   ABM    │   Ads    │  Agents  │    Docs      │
│Dashboard │ Lifecycle│ Library  │  Fleet   │   System     │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴──────┬───────┘
     │          │          │          │            │
     ▼          ▼          ▼          ▼            ▼
┌──────────────────────────────────────────────────────────┐
│              PostgreSQL (dghub)                           │
│  ABMAccount · ABMExclusion · ABMCampaignSegment          │
│  SFAccount · SFOpportunity · Campaign · Creative         │
│  AdImpression · AgentRun · WorkItem · ABMList             │
└──────────────────────────────────────────────────────────┘
     │          │          │          │
     ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Google │ │LinkedIn│ │StackAdt│ │ Reddit │ │Salesfrce│
│  Ads   │ │  Ads   │ │        │ │  Ads   │ │         │
└────────┘ └────────┘ └────────┘ └────────┘ └─────────┘
```

## Core Modules

### 🎯 Campaigns Dashboard
- Unified view across Google Ads, LinkedIn, StackAdapt, Reddit
- Budget pacing, spend tracking, CPA monitoring
- Filter by platform, status, product, region

### 🏢 ABM Lifecycle Engine
Full account-based marketing pipeline from identification to exclusion:

| Component | What It Does |
|-----------|-------------|
| **Product Fit Scorer** | Classifies 2,555 accounts into Voice API, SMS, SIP, IoT SIM, or AI Agent based on Clearbit data + SF signals |
| **Structural Exclusions** | Tag-based waste classifier — 136 non-buyer domains excluded (hospitals, airlines, banks, etc.) with rescue logic for healthtech/fintech |
| **ABM Sync** | Daily Clearbit enrichment + relevance scoring for all accounts |
| **ABM Expander** | AI-powered segment expansion — finds new accounts via research + lookalike matching |
| **ABM Pruner** | Removes stale/unresponsive accounts from active segments |
| **ABM Negative Builder** | Generates negative keywords from excluded domains per product |

→ **Full docs:** [`docs/abm/`](./docs/abm/README.md)

### 📋 Ads Library
- 777 active creatives across Google (497), LinkedIn (130), StackAdapt (100), Reddit (50)
- Search by headline, copy, platform, campaign
- Copy review against brand guidelines

### 🤖 Agent Fleet
All agents follow the hybrid layered architecture:

```
GLOBAL (cross-platform)         PLATFORM FLEETS
├── Budget & Pacing ✅           Google Ads:
├── Creative QA ✅              ├── neg-keyword ✅
├── Attribution 🆕               ├── keyword-bid-optimizer ✅
└── Hub Doctor ✅                └── creative-specialist ✅
                                 StackAdapt: stackadapt-ops ✅
                                 LinkedIn: 🆕 (blocked on API)
                                 Reddit: reddit-ops ✅
```

**Design rules:**
- Platform specialists stay SEPARATE (focused context, isolated failures)
- No orchestrator — hub + DB + budget-pacing coordinate
- Creative QA = compliance. Creative OPTIMIZATION = per-platform
- All agents use `BaseAgent` framework, Lobster workflows, DB logging, approval gates

→ **Agent details:** [`docs/abm/03-agent-fleet.md`](./docs/abm/03-agent-fleet.md)

### 📊 Salesforce Integration
- 122 accounts linked to SF via domain matching
- 41 accounts with active pipeline ($14.2M total)
- `switchSignal` populated from SF opp source for 260 accounts
- Pipeline accounts protected from all exclusion logic

→ **SF integration:** [`docs/abm/05-salesforce-integration.md`](./docs/abm/05-salesforce-integration.md)

## Product Fit Scoring

Accounts are classified using a multi-signal scorer:

| Signal | Weight | Source |
|--------|--------|--------|
| Description keywords | 40% | Clearbit |
| Industry/Tags | 30% | Clearbit |
| Tech stack | 15% | Clearbit |
| Company size/employee range | 15% | Clearbit + SF |

**Current distribution (2,555 accounts):**

| Product | Accounts | Notes |
|---------|----------|-------|
| AI Agent | 498 | Strict keywords only — no generic telecom terms |
| IoT SIM | 182 | Includes logistics/emergency response |
| Voice API | 165 | Telecom infrastructure gets routed here |
| SMS | 66 | Messaging platform companies |
| SIP | 27 | VoIP/telephony providers |
| null | 1,617 | No strong product signal — waste/pruning candidates |

→ **Scoring details:** [`docs/abm/02-product-fit-scoring.md`](./docs/abm/02-product-fit-scoring.md)

## Structural Exclusions

Tag-based waste classification using Clearbit's curated multi-label tags:

**Algorithm:**
1. Must have a waste tag (e.g., "Medical Care", "Banking", "Airlines")
2. Must NOT have a rescue tag (e.g., "Technology", "SAAS", "Cloud Solutions") — healthtech/fintech rescued
3. Pipeline accounts always protected
4. Description provides secondary confirmation

| Category | Excluded |
|----------|----------|
| Hospital / Healthcare | 68 |
| Hospitality / Travel / Airlines | 31 |
| E-commerce / Retail | 21 |
| Banking / Insurance | 18 |
| Real Estate | 10 |
| Agencies | 8 |
| Pharma / Biotech | 3 |
| Media / Publishing | 3 |
| Government | 2 |
| Legal | 1 |
| **Total** | **136** |

All pushed to 6 StackAdapt exclusion audiences (5 product + 1 structural).

## Platform Connectors

| Platform | Status | Capabilities |
|----------|--------|-------------|
| **Google Ads** | ✅ Active | Campaign sync, creative sync, negative keywords, bid management |
| **StackAdapt** | ✅ Active | Campaign sync, ABM audience create/update/push, exclusion audiences, creative sync |
| **Reddit** | ✅ Active | Campaign sync, creative sync |
| **LinkedIn** | 🔴 Blocked | Advertising API works, Community Management API stalled (needed for attribution fix) |
| **Salesforce** | ✅ Active | Account linking, pipeline data, opp stages |

## Tech Stack

- **Frontend:** Next.js 16, React, Tailwind CSS, Prisma
- **Database:** PostgreSQL 17 (localhost:5432/dghub)
- **Agents:** Python (BaseAgent framework) + Lobster workflows
- **Orchestration:** OpenClaw (Ares) + A2A hooks
- **Hosting:** PM2 (localhost:3000) + ngrok

## Documentation

Full system documentation in [`docs/abm/`](./docs/abm/):

| Doc | Content |
|-----|---------|
| [README](./docs/abm/README.md) | Architecture overview, quick start |
| [Data Model](./docs/abm/01-data-model.md) | All tables, columns, relationships |
| [Product Fit Scoring](./docs/abm/02-product-fit-scoring.md) | Scoring algorithm, keywords, distribution |
| [Agent Fleet](./docs/abm/03-agent-fleet.md) | All agents, schedules, workflows, SLAs |
| [Platform Connectors](./docs/abm/04-platform-connectors.md) | SA, LinkedIn, Google, Reddit connectors |
| [Salesforce Integration](./docs/abm/05-salesforce-integration.md) | Pipeline data, attribution loop |
| [Hub UI](./docs/abm/06-hub-ui.md) | Pages, routes, components |
| [Gaps & Next Steps](./docs/abm/07-gaps-and-next-steps.md) | Prioritized backlog |

## Getting Started

```bash
# Install dependencies
npm install

# Set up database
npx prisma generate
npx prisma db push

# Run development server
npm run dev
```

## Environment Variables

```
DATABASE_URL="postgresql://localhost:5432/dghub"
APP_PASSWORD="your-shared-password"
NGROK_URL="https://telnyx-dg-hub.ngrok.app"
```

## License

Internal use only — Telnyx Marketing
