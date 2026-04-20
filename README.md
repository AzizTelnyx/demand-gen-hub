# Demand Gen Hub

Unified operations platform for Telnyx Demand Generation — campaign management, ABM lifecycle, agent automation, and cross-platform analytics.

## How It Works

### ABM Lifecycle — Account → Campaign → Pipeline

The ABM system manages the full lifecycle of target accounts: from discovery to campaign targeting to pipeline attribution.

**1. Account Ingestion**
Accounts come from StackAdapt impression data — when a company sees our ads, their domain is captured. These get enriched with Clearbit data (industry, tags, tech stack, description, revenue, employee count) and stored in `ABMAccount`. Salesforce accounts are matched by domain to add pipeline data (active opps, stage, amount).

**2. Product Classification**
Each account is scored against 5 products (AI Agent, Voice API, SMS, SIP, IoT SIM) using Clearbit signals — description keywords (40%), industry tags (30%), tech stack (15%), and company size (15%). Accounts that don't match any product get `null` productFit — these are waste impressions (hospitals, airlines, retail) that need exclusion.

**3. Waste Exclusion**
Accounts tagged with non-buyer categories (hospitals, airlines, banks, retail, law firms, government) are automatically excluded — unless they also have tech rescue tags (Technology, SAAS, Cloud Solutions) which means they're healthtech/fintech, not actual hospitals/banks. All excluded domains are pushed to StackAdapt exclusion audiences so they stop seeing our ads. Pipeline accounts ($14.2M across 41 active opps) are always protected from exclusion.

**4. Segment Management**
Accounts with a product fit are grouped into segments per product. These segments are pushed to StackAdapt as targeting audiences — so the right companies see the right product ads. Segments are kept fresh by daily sync (new accounts, updated firmographics) and weekly pruning (remove unresponsive accounts that haven't converted after multiple touchpoints).

**5. Expansion (AI-Powered)**
The Expander finds undersized ABM segments — audiences that are below the minimum size for their platform (StackAdapt needs 500, LinkedIn needs 300). It uses an LLM to research companies matching the product ICP, validates them against Clearbit data, cross-checks Salesforce to skip existing customers/partners, then relevance-scores and adds them to the segment. New domains get pushed to StackAdapt targeting audiences. This turns thin audiences into properly sized ones.

**6. Campaign Hygiene**
The Negative Builder generates negative keywords per product so we stop bidding on irrelevant search terms. The Auditor runs weekly checks on segment health — stale accounts, misaligned product fit, exclusion overlaps. The Hub Doctor monitors all agents and flags anomalies.

### Campaign Management

All campaigns across Google Ads, LinkedIn, StackAdapt, and Reddit are synced into a unified dashboard. Creative assets (777 active ads) are cataloged and searchable. Budget pacing is monitored against the $140K/mo cap with per-platform limits.

### Agent Fleet

Agents are organized in a hybrid layered model — global agents that work across all platforms, and platform specialists that handle platform-specific optimization:

**Global agents:** Budget & Pacing, Creative QA (compliance), Attribution, Hub Doctor
**Platform specialists:** Google (negative keywords, bid optimization, creative), StackAdapt (campaign ops, audience management), Reddit (campaign ops)

All agents follow the same framework: `BaseAgent` for guardrails + DB logging, Lobster workflows for deterministic steps, LLM for analysis, approval gates for actions. No agent makes a material change without going through the approval system.

## Current Status

### What's Live
- ✅ Account ingestion + Clearbit enrichment (2,555 accounts)
- ✅ Product fit scoring with strict AI Agent keywords
- ✅ Structural waste exclusion (136 domains, tag-based with rescue logic)
- ✅ StackAdapt exclusion audiences pushed and attached to 13 active campaigns
- ✅ Salesforce linking (122 accounts, 41 pipeline, $14.2M)
- ✅ ABM Sync agent (daily Clearbit refresh)
- ✅ Negative keyword agent (daily, Google Ads)
- ✅ Hub UI — campaigns, ABM domains, ads library, docs
- ✅ Campaign + creative sync across all 4 platforms

### What's Designed But Needs Live Validation
- 🔶 ABM Expander — Lobster workflow built, needs a live run to verify domains push correctly to SA
- 🔶 ABM Pruner — workflow built, only dry-run tested
- 🔶 ABM Negative Builder — updated keywords, needs re-run with corrected productFit

### What's Next
- 🆕 Attach exclusion audiences to remaining SA campaigns
- 🆕 LinkedIn attribution fix (blocked on Community Management API approval)
- 🆕 Attribution query — connect ad impressions → SF pipeline
- 🆕 Google Ads Customer Match for ABM audiences
- 🆕 DomainSlideOut in Hub UI — show SF pipeline + opp data per account

## Platform Connectors

| Platform | Status | What It Does |
|----------|--------|-------------|
| **Google Ads** | ✅ Active | Sync campaigns/creatives, negative keywords, bid management |
| **StackAdapt** | ✅ Active | Sync campaigns/creatives, ABM audience create/update/push, exclusion audiences |
| **Reddit** | ✅ Active | Sync campaigns/creatives |
| **LinkedIn** | 🔴 Blocked | Ads API works, but attribution needs Community Management API (stalled) |
| **Salesforce** | ✅ Active | Account matching, pipeline data, opp stages |

## Tech Stack

- **Frontend:** Next.js 16, React, Tailwind CSS, Prisma
- **Database:** PostgreSQL 17 (localhost:5432/dghub)
- **Agents:** Python (BaseAgent framework) + Lobster workflows
- **Orchestration:** OpenClaw + A2A hooks
- **Hosting:** PM2 (localhost:3000) + ngrok

## Documentation

Full system documentation in [`docs/abm/`](./docs/abm/):

| Doc | Content |
|-----|---------|
| [README](./docs/abm/README.md) | Architecture overview |
| [Data Model](./docs/abm/01-data-model.md) | Tables, columns, relationships |
| [Product Fit Scoring](./docs/abm/02-product-fit-scoring.md) | Algorithm, keywords, distribution |
| [Agent Fleet](./docs/abm/03-agent-fleet.md) | Agents, schedules, workflows |
| [Platform Connectors](./docs/abm/04-platform-connectors.md) | SA, LinkedIn, Google, Reddit |
| [Salesforce](./docs/abm/05-salesforce-integration.md) | Pipeline data, attribution |
| [Hub UI](./docs/abm/06-hub-ui.md) | Pages, routes, components |
| [Gaps & Next Steps](./docs/abm/07-gaps-and-next-steps.md) | Prioritized backlog |

## Getting Started

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

## License

Internal use only — Telnyx Marketing
