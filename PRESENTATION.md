# Demand Gen Hub
## The AI-Powered Operations Platform for Telnyx Demand Generation

---

# What is the Demand Gen Hub?

- **Central operations platform** for Telnyx's demand generation team
- Built on **Next.js + PostgreSQL + Claude AI** (via OpenClaw gateway)
- Runs locally on a **Mac mini**, accessible to the team via ngrok
- **Single source of truth** for all paid media operations
- Replaces spreadsheets, manual checks, and platform-hopping with one unified interface

> **Speaker notes:** This started as a way to stop context-switching between 4+ ad platforms and Salesforce. It's grown into a full AI-powered ops layer that saves hours per week and catches issues humans miss.

---

# Architecture

```
┌─────────────────────────────────────────────┐
│              Next.js Frontend                │
├─────────────────────────────────────────────┤
│              PostgreSQL Database             │
├──────────┬──────────┬───────────┬───────────┤
│ Google   │ LinkedIn │ StackAdapt│ Salesforce│
│ Ads API  │ Ads API  │ GraphQL   │ CLI       │
└──────────┴──────────┴───────────┴───────────┘
        ↕ Sync every 6 hours ↕
┌─────────────────────────────────────────────┐
│  Claude AI (Anthropic) via OpenClaw Gateway │
│  13 Autonomous Agents on Cron Schedules     │
│  Telegram Bot Interface (@aziz_ares_bot)    │
└─────────────────────────────────────────────┘
```

### By the Numbers

| Metric | Count |
|--------|-------|
| Ad creatives synced | **10,163** |
| Total campaigns | **627** |
| Active campaigns | **89** |
| Salesforce accounts | **5,000** |
| Opportunities tracked | **2,596** |
| AI agents registered | **13** |
| Knowledge base files | **36** |

> **Speaker notes:** Everything syncs every 6 hours automatically. No manual exports, no stale data. The database means instant search and filtering — no waiting on live API calls.

---

# Section 1: Dashboard

## Command Center

- **Real-time KPIs** across all platforms in one view
- **Alert banners** for critical issues:
  - BOFU campaigns with $0 conversions
  - Budget anomalies and pacing issues
  - Campaigns that need immediate attention
- **Platform spend charts** — Google, LinkedIn, StackAdapt at a glance
- Issues surface automatically — no need to dig through each platform

> **Speaker notes:** The alert system is the most valuable part. Instead of checking 3 platforms daily, the dashboard tells you exactly what's broken right now.

---

# Section 2: Campaigns

## Every Campaign, One View

- **627 campaigns** across Google Ads, LinkedIn, StackAdapt
- **Inline health signals** — green/yellow/red status at a glance
- Click any campaign → **AI deep dive analysis** expands inline
  - Performance trends, anomalies, recommendations
  - Powered by Claude analyzing real campaign data
- Filter by platform, status, funnel stage
- No more logging into 3 separate platforms to check performance

> **Speaker notes:** The AI analysis isn't generic — it pulls the actual campaign metrics and gives specific, actionable insights. It knows our ICPs, our messaging, our goals.

---

# Section 3: Pipeline

## Salesforce Pipeline + Ad Exposure Attribution

- Full **Salesforce pipeline** view with ad attribution overlay
- **Attribution model** matches ad impressions → SF account domains
  - StackAdapt B2B domain-level impressions
  - LinkedIn company-level impression data
- **90-day lookback window** per deal
- **Lift metrics:**
  - Deal size lift: ad-exposed vs. unexposed accounts
  - Win rate lift: ad-exposed vs. unexposed accounts
- New Business only (excludes upsell/cross-sell/renewal)

> **Speaker notes:** This is the slide that gets sales leaders' attention. We can show that accounts exposed to our ads close bigger deals at higher rates. It's not last-click — it's impression-level exposure matched to pipeline.

---

# Section 4: Optimizations

## Change Detection Timeline

- **Timeline view** of every campaign change across all platforms
- Automatically detected every **6 hours**
- Track what changed, when, and on which platform
- Bid adjustments, budget changes, status changes, targeting updates
- Full audit trail — know exactly what happened and when

> **Speaker notes:** This solves the "who changed what?" problem. Every optimization is logged automatically. Useful for debugging performance shifts and team accountability.

---

# Section 5: Ads Library

## 10,163 Creatives, Instantly Searchable

- **All ad creatives** across Google, LinkedIn, StackAdapt in one place
- **Instant search** — backed by PostgreSQL (no live API calls)
- Filter by:
  - Platform
  - Status (active/paused/removed)
  - Ad type (text, image, video, carousel)
- Find any creative in seconds
- See what's running, what's been tested, what's been retired

> **Speaker notes:** Before this, finding an old ad meant digging through platform UIs. Now it's a search box. Great for creative reviews, competitive analysis, and avoiding duplicate messaging.

---

# Section 6: Budget & Spend

## Real-Time Spend Intelligence

- **Live spend breakdown** across every dimension:
  - By **platform** — Google, LinkedIn, StackAdapt
  - By **funnel stage** — TOFU, MOFU, BOFU
  - By **region** — Americas, EMEA, APAC
  - By **product line**
  - By **channel type**
- **Active campaigns only** — no noise from paused/completed
- Pacing vs. budget targets
- Instant answers to "where is the money going?"

> **Speaker notes:** Finance and leadership ask "how much are we spending on X?" constantly. This page answers every variation of that question in real time.

---

# Section 7: ABM

## AI-Powered Account-Based Marketing

- **983 accounts** across **6 verticals**
- **Many-to-many list system** — accounts can belong to multiple lists
- **AI-powered company research:**
  - Wave-based background jobs
  - Claude researches each company: industry, size, tech stack, fit signals
  - Enriches accounts beyond what Salesforce provides
- Build, segment, and export target account lists
- Feed directly into ad platform targeting

> **Speaker notes:** The AI research is the differentiator. Instead of manually Googling companies, Claude does deep research in waves — 50 companies at a time, running in the background. Results feed directly into our ABM targeting.

---

# Section 8: Orchestration

## ChatGPT-Style AI for Campaign Ops

- **Natural language interface** — ask anything about your campaigns
- Queries **real data** from the database, not hallucinated answers
- Capabilities:
  - "How are our BOFU campaigns performing this week?"
  - "Do keyword research for [product]"
  - "Draft a campaign launch plan for [initiative]"
  - "What's our spend by region this month?"
- **Intent router** classifies requests → routes to specialized agents
- **Agent chaining** — complex tasks break into subtasks automatically

> **Speaker notes:** This is the "wow" feature. It's like having a demand gen analyst who knows every campaign, every metric, every creative — and can answer in seconds. The intent router means it knows whether to pull data, generate content, or build a strategy.

---

# Section 9: Agents

## Autonomous AI That Works While You Sleep

- **13 registered agents**, each with a specific job
- **Negative Keyword Agent** (runs daily):
  - Scans search term reports across all Google Ads campaigns
  - Auto-blocks high-confidence wasteful terms
  - Flags borderline terms for human review
  - **Est. $2K/month in wasted spend prevented**
- **Health Check Agent:**
  - Flags real performance issues across platforms
  - Distinguishes noise from actual problems
- **Approve/reject workflow** — pending actions queue for human oversight
- No auto-execution of writes without approval

> **Speaker notes:** The agents are the force multiplier. The negative keyword agent alone pays for the infrastructure many times over. And it runs daily — no human could check every search term across every campaign every single day.

---

# AI & Automation Deep Dive

## 13 Agents, One Knowledge Base

### Registered Agents
| Agent | Function |
|-------|----------|
| negative-keyword | Block wasteful search terms |
| health-check | Flag performance issues |
| campaign-optimizer | Suggest bid/budget changes |
| keyword-researcher | Find new keyword opportunities |
| budget-calculator | Pacing and allocation |
| ad-copy-generator | Write ad copy to brand guidelines |
| ad-review | Audit creative quality |
| overlap-checker | Find audience/keyword overlap |
| reporting | Generate performance reports |
| campaign-orchestrator | End-to-end campaign launch |
| abm-list | Build and enrich ABM lists |
| creative | Creative strategy and briefs |
| strategy | Campaign and channel strategy |

### Safety Guardrails
- ❌ No auto-execute of write operations without approval
- ✅ Programmatic validation before any changes
- ✅ Confidence scoring on all recommendations
- 📚 **36-file knowledge base**: brand messaging, ICPs, product messaging, competitor positioning

> **Speaker notes:** The knowledge base is critical. Every agent has access to our brand guidelines, ICPs, product positioning, and competitor intel. That's why the outputs are specific to Telnyx, not generic marketing advice.

---

# Telegram Integration

## AI in Your Team Chat

- **@aziz_ares_bot** in the Demand Gen Hub Telegram group
- Team members @mention the bot → get real answers from real data
- Capabilities:
  - Query campaign performance
  - Generate and send **CSV reports** directly in chat
  - Get recommendations and next steps
  - Links to relevant hub pages for deeper analysis
- No need to open the hub for quick questions
- Democratizes data access for the whole team

> **Speaker notes:** This removes the bottleneck of one person pulling reports. Anyone on the team can ask the bot, and it responds with actual data from the hub — not canned responses.

---

# Attribution Model

## Proving Ad Impact on Pipeline

```
Ad Impressions                    Salesforce Pipeline
┌──────────────┐                 ┌──────────────┐
│ StackAdapt   │───┐             │ Account      │
│ B2B Domains  │   │  Domain     │ Domains      │
├──────────────┤   ├─ Matching ──├──────────────┤
│ LinkedIn     │   │             │ Opportunities│
│ Company-Level│───┘             │ (New Biz)    │
└──────────────┘                 └──────────────┘
```

### Model Details
- **90-day per-deal lookback** — was this account exposed to ads before the deal was created?
- **New Business only** — excludes upsell, cross-sell, renewal
- **Domain matching** — StackAdapt B2B + LinkedIn company → SF account domain

### Key Outputs
- **Deal size lift**: avg deal size for ad-exposed vs. unexposed accounts
- **Win rate lift**: close rate for ad-exposed vs. unexposed accounts
- Per-deal attribution detail — which ads, which platforms, how many impressions

> **Speaker notes:** This is our answer to "are ads actually helping pipeline?" We're not claiming attribution — we're showing correlation with exposure. Accounts that see our ads close bigger and more often. The 90-day window per deal means we capture the full buying cycle influence.

---

# What's Next

## Roadmap

- 🎨 **Ad Copy Optimization Agent** — AI reviews existing ads, suggests improvements based on performance data + brand guidelines
- 🖼️ **Banner Generation Pipeline** — automated creative generation from templates
- 🚀 **Full Campaign Launch via API** — end-to-end campaign creation without touching platform UIs
- 🔒 **Permanent Team Access** — Cloudflare Tunnel replacing ngrok for stable, always-on access

> **Speaker notes:** The goal is full-loop automation: research → strategy → creative → launch → optimize → report. We're about 60% of the way there. Cloudflare Tunnel will make this a real production tool the whole team relies on daily.

---

# Summary

## One Platform. Real Data. AI That Works.

| What | Impact |
|------|--------|
| **10,163** creatives indexed | Find any ad in seconds |
| **627** campaigns tracked | No more platform-hopping |
| **13** AI agents | Automation that runs 24/7 |
| **~$2K/mo** waste blocked | Negative keyword agent alone |
| **90-day** attribution | Prove ad impact on pipeline |
| **6-hour** sync cycle | Always-current data |
| **1** interface | For everything demand gen |

> **Speaker notes:** The Demand Gen Hub isn't a dashboard — it's an operating system for demand generation. It sees everything, remembers everything, and increasingly acts on what it sees. The AI isn't a gimmick — it's integrated into every workflow with real guardrails and real data.
