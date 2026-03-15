# DG Hub — Agent Architecture

## Overview

Hybrid layered architecture: cross-platform global agents + platform-specific specialist fleets. Each platform starts with one agent and splits into specialists when workload justifies it.

**Current: 7 agents (5 AI + 2 utility) | Planned: 6 more**

---

## Architecture

```
GLOBAL AGENTS (cross-platform)
├── Budget & Pacing              ✅ Production
├── Creative QA                  ✅ Production (brand compliance)
├── Attribution & Pipeline       🆕 Planned
└── Hub Doctor                   ✅ Production (cron utility)

GOOGLE ADS FLEET
├── Search Term Specialist       ✅ Production (neg-keyword)
├── Bid & Device Specialist      ✅ Production (keyword-bid-optimizer)
└── Creative Specialist          🆕 Planned (RSA optimization)

STACKADAPT FLEET
└── StackAdapt Ops               ✅ Production (frequency, domains, geo, UTMs)

LINKEDIN FLEET
├── LinkedIn Ops                 🆕 Planned (blocked on API)
└── (split into specialists when justified)

REDDIT FLEET
├── Reddit Ops                   🆕 Planned (API ready)
└── (split into specialists when justified)
```

---

## Global Agents

### Budget & Pacing ✅
**Status:** Production  
**Schedule:** Every 6h (1 AM, 7 AM, 1 PM, 7 PM PST)  
**Platforms:** Google Ads, LinkedIn, StackAdapt, Reddit  

Monitors pacing across all 4 platforms against $140K/mo budget. Recommends reallocations when platforms over/underpace.

| Platform | Monthly Budget |
|----------|---------------|
| Google Ads | $85K |
| LinkedIn | $30K |
| StackAdapt | $15K |
| Reddit | $10K |

**Rules:**
- Budget floor $10/day per campaign
- Max $500 change without approval
- Cross-product reallocation = always human approval
- 80% confidence threshold to auto-execute

---

### Creative QA ✅
**Status:** Production  
**Schedule:** Daily 3 AM PST  
**Platforms:** All 4  

Cross-platform brand compliance and QA. Does NOT do creative optimization (that's per-platform).

**What it does:**
- Audits ad copy against brand messaging rules (knowledge base)
- Validates UTM parameters across all platforms
- Checks landing page URLs are live
- Flags copy violating product-specific rules (e.g., no dollar signs for API products)
- 9 skills validated

**Note:** Creative OPTIMIZATION (A/B testing, variant performance, format-specific recommendations) belongs in each platform fleet because formats/mechanics differ per platform.

---

### Attribution & Pipeline 🆕
**Status:** Planned (priority 3)  
**Platforms:** All 4  

Correlates ad exposure with Salesforce deal progression. The pipeline API (`/api/pipeline`) already does the matching — this agent watches it proactively.

**What it will do:**
- Identify which campaigns influence the most pipeline
- Flag deals with high ad exposure that are stalling
- Recommend budget shifts based on pipeline influence (not just CTR/CPA)
- Surface cross-platform touchpoint patterns
- Weekly pipeline influence report to Telegram

**Data sources:**
- AdImpression table (domain-level for StackAdapt, org-level for LinkedIn)
- SFOpportunity table (deals, stages, amounts, accountDomain)
- `/api/pipeline` endpoint (already built)

**Blocked by:** LinkedIn org ID resolution (Community Management API — submitted 2026-03-12)

**Current attribution:**
- StackAdapt: 15,083 domain-level records → matching works
- LinkedIn: 97.2% stuck as `li_org:XXXXX` → needs org resolution
- Google/Reddit: Campaign-level only (no domain attribution from their APIs)

---

### Hub Doctor ✅
**Status:** Production (cron utility)  
**Schedule:** Daily 6 AM PST  

System health checks. Not an AI agent — runs as a Python script on cron.

**What it does:**
- PM2 process health, DB connectivity, gateway status
- Agent run failure monitoring
- Sync script status checks
- Posts health report to Telegram (🏥 Hub Health topic)

---

## Google Ads Fleet

### Search Term Specialist ✅ (neg-keyword)
**Status:** Production  
**Schedule:** Daily 2 AM PST  
**Coverage:** 35+ active campaigns, ~249 recommendations/day  

Analyzes search terms and blocks wasteful queries before they burn budget.

**What it does:**
- Fetches last 7 days of search terms across ALL active campaigns
- Classifies each: BLOCK, KEEP, or MONITOR
- Auto-blocks at ≥80% confidence
- Special conquest campaign logic (block any non-branded term)
- Checks against global negative keyword list

**Key rules:**
- NEVER block terms with conversions > 0
- NEVER block brand terms (telnyx, clawdtalk)
- NEVER block competitor names on conquest campaigns
- Conquest campaigns: block non-branded terms with ANY impressions
- PHRASE match for concepts, EXACT match for specific queries

---

### Bid & Device Specialist ✅ (keyword-bid-optimizer)
**Status:** Production  
**Schedule:** Daily 3 AM PST  

Optimizes keyword bids, device bid modifiers, and geo bid modifiers.

**What it does:**
- **Device optimization:** Identifies mobile/desktop/tablet bid waste on B2B campaigns
- **Geo optimization:** Adjusts regional bids based on conversion performance
- **Keyword bids:** Flags high-spend/low-conversion keywords for bid reduction or pause

**Recent action (2026-03-12):**
- Applied -20% mobile bids on 3 campaigns (Contact Center AMER/APAC, Voice API Twilio EMEA)
- Combined mobile waste: $2,400/mo with 0 conversions

**Key rules:**
- Max ±30% bid adjustment
- B2B products: mobile conversions are suspect — validate against SQO data before increasing
- Enterprise products (Contact Center): default to reducing mobile bids
- 80% confidence to auto-execute, 60-79% = flag for review

---

### Creative Specialist 🆕
**Status:** Planned  
**Platform:** Google Ads  

RSA-specific creative optimization that requires deep Google Ads knowledge.

**What it will do:**
- Analyze RSA asset-level performance (which headlines/descriptions drive clicks and conversions)
- Recommend new headline/description variants based on top performers
- Flag "Poor" and "Average" ad strength ratings with specific improvement suggestions
- Identify headline pinning opportunities
- Recommend asset removal for consistently low-performing headlines/descriptions
- A/B test recommendations based on statistical significance

**Why separate from Creative QA:**
Creative QA checks compliance (brand rules, UTMs, LPs). This agent optimizes PERFORMANCE within Google's RSA format — completely different skillset.

---

## StackAdapt Fleet

### StackAdapt Ops ✅
**Status:** Production  
**Schedule:** Tue/Fri 4 AM PST  

Handles all StackAdapt optimization. Currently one agent with 9 skills — may split into specialists if workload grows.

**What it does:**
- Frequency cap optimization (reduce if engagement drops after 3rd impression)
- Domain/publisher blocking (auto-block >1000 impressions, 0 clicks)
- Geo bid optimization (regional performance adjustments)
- UTM validation, landing page validation
- Campaign context awareness (ABM measurement, not conversion-based)

**Key rules:**
- StackAdapt is ABM — "0 conversions" is expected
- Measure by domain reach and engagement, not CPA
- All write operations support dry_run mode

**Future split candidates:**
- Domain/Publisher Specialist (if domain blocking volume grows)
- Audience/ABM Specialist (if ABM list management becomes complex)

---

## LinkedIn Fleet

### LinkedIn Ops 🆕
**Status:** Planned (priority 4, blocked on API)  
**Budget:** $30K/mo  

**What it will do:**
- Audience targeting optimization (job title, company, seniority)
- Creative rotation analysis (single image vs carousel vs video)
- Bid strategy optimization (CPC vs CPM per campaign type)
- ABM account targeting (leverage shared ABM lists)
- Org attribution (resolve li_org IDs to company domains)

**Blocked by:** Community Management API access (submitted 2026-03-12). Current scopes: `r_ads`, `r_ads_reporting`, `r_organization_social`. Need: `r_organization_admin` from new app.

**Future split candidates:**
- Audience Specialist (if audience management complexity grows)
- Creative Specialist (if creative testing volume grows)

---

## Reddit Fleet

### Reddit Ops 🆕
**Status:** Planned (priority 2, API ready)  
**Budget:** $10K/mo  

**What it will do:**
- Subreddit targeting optimization (which subreddits drive engagement vs waste)
- Creative performance analysis (which ad formats/copy resonate per community)
- Bid optimization (adjust based on conversion data)
- Interest-based targeting refinement
- Comment sentiment monitoring on promoted posts

**Reddit API:** Available with write access for bid/targeting changes.

**Future split candidates:**
- Targeting Specialist (if subreddit/interest management grows)
- Creative Specialist (if creative testing volume grows)

---

## Agent Execution Model

Every AI agent follows the same pattern:

```
1. DATA FETCH (Lobster workflow — deterministic, no LLM tokens)
   └── Fetch metrics, campaign data, knowledge base

2. ANALYSIS (LLM — reads data + knowledge base + SOUL.md rules)
   └── Identify issues, opportunities, patterns

3. DECISION (LLM — confidence scoring)
   ├── ≥80% confidence → auto-execute
   ├── 60-79% confidence → flag for review (Telegram)
   └── <60% confidence → monitor only

4. EXECUTION (Platform skill — deterministic API call)
   └── block-keyword, update-device-bid, exclude-domain, etc.

5. LOGGING (DB + Telegram)
   └── AgentRun → Recommendation → Change records
```

**What LLMs do that scripts can't:**
- Intent understanding ("sim card iot devices" = relevant on IoT, waste on Voice AI)
- Product context ("mobile conversions on enterprise B2B = suspect")
- Judgment calls ("low Quality Score on conquest term = expected, don't pause")

---

## Shared Infrastructure

### Knowledge Base (47 files)
```
knowledge/
├── brand/                → Brand messaging, tone, 4 pillars
├── products/             → Voice AI, SIP, IoT, Contact Center, SMS
├── standards/            → Ad copy rules, RSA practices, naming, negatives
├── icps/                 → Developer ICP, Enterprise Contact Center ICP
├── messaging-frameworks/ → Voice API, Contact Center, Healthcare
├── campaigns/            → Campaign briefs
├── competitors/          → Voice AI competitive landscape
└── playbooks/            → Platform-specific playbooks
```

Every agent loads context via: `GET /api/context?section=<name>`

### Database (PostgreSQL — dghub)
| Table | Purpose |
|-------|---------|
| Campaign | All campaigns, synced every 6h |
| AdCreative | Active creatives with headlines/descriptions |
| AdImpression | Domain-level impressions (attribution) |
| SFOpportunity | Salesforce deals with accountDomain |
| ABMAccount | Shared target account list |
| Agent | Agent registry |
| AgentRun | Run history (status, timestamps) |
| Recommendation | All recommendations (confidence, status, rationale) |
| LinkedInOrgLookup | LinkedIn org ID → company domain resolution |

### Live Metrics
```bash
# NEVER use DB spend columns — always use live query
python scripts/query_metrics.py --platform all --from YYYY-MM-DD --to YYYY-MM-DD
```

---

## Design Principles

1. **Platform specialists, not generalists** — Each agent deeply understands one platform's API, benchmarks, and mechanics.
2. **Start with one agent per platform, split when justified** — Google already justified 2 specialists. Others start as one.
3. **Global agents for cross-platform decisions only** — Budget allocation and attribution need the big picture. Everything else needs platform depth.
4. **No orchestrator (yet)** — Hub + shared DB + budget-pacing already coordinate. Build orchestrator when real coordination problems emerge.
5. **Knowledge base is the glue** — Brand rules, product context, and campaign strategy are shared. Each platform agent loads the same context but applies it differently.
6. **LLM for decisions, scripts for execution** — Lobster workflows fetch data. LLM analyzes and decides. Skills execute API calls.
7. **Confidence scoring gates everything** — ≥80% = auto-execute. <80% = human review. No autonomous action without confidence.

---

## Build Order

| Priority | Agent | Effort | Value | Blocker |
|----------|-------|--------|-------|---------|
| 1 | Google Creative Specialist | Medium | RSA optimization on $85K/mo | None |
| 2 | Reddit Ops | Medium | $10K/mo unmanaged | None |
| 3 | Attribution & Pipeline | Medium | Pipeline visibility | LinkedIn org resolution |
| 4 | LinkedIn Ops | Medium | $30K/mo highest after Google | Community Management API |

---

*Last updated: 2026-03-12*  
*Architecture by: Ares ⚔️*
