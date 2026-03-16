# Architecture — Demand Gen Hub

_Single source of truth for how the system works. Updated every time we change something._

Last updated: 2026-03-16

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    TRIGGER LAYER                             │
│                                                             │
│   OpenClaw Crons (autopilot)    A2A Broker (GDE on-demand) │
│   ┌──────────────────────┐      ┌────────────────────────┐  │
│   │ 2 AM  neg-keyword    │      │ PM2 poll workers       │  │
│   │ 3 AM  kw-bid-optim   │      │ Listen for GDE signals │  │
│   │ 3 AM  creative-qa    │      │ Forward to OpenClaw    │  │
│   │ 6 AM  hub-doctor     │      │ agents via gateway     │  │
│   │ 6 AM  ad-quality     │      │                        │  │
│   │ 7 AM  fleet (lobster)│      │ 6 workers online       │  │
│   │ Tue/Fri stackadapt   │      └────────────────────────┘  │
│   │ Every 6h budget      │                                   │
│   │ Every 6h sync        │      Hub Webhook (proxy)          │
│   └──────────────────────┘      POST /api/hooks/agent        │
│                                  → gateway /hooks/agent       │
└──────────────┬──────────────────────────┬────────────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────────────────────────────────────────┐
│                    AGENT LAYER                                │
│                                                              │
│   Python scripts in scripts/                                 │
│   All extend BaseAgent (scripts/lib/agent_base.py)           │
│   All write to PostgreSQL dghub via DB helpers               │
│   All post findings to Telegram thread 164                   │
│   All load knowledge base at runtime                         │
│                                                              │
│   Guardrails: confidence scoring, budget floors,             │
│   max actions/day, kill switch on CPA spikes                 │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                 │
│                                                              │
│   PostgreSQL dghub (localhost:5432)                           │
│   ├── Campaign (668 rows — Google, LinkedIn, StackAdapt, Reddit) │
│   ├── AdCreative (778 rows)                                  │
│   ├── AdImpression (40K+ rows)                               │
│   ├── Agent (21 registered)                                  │
│   ├── AgentRun (run history per agent)                       │
│   ├── Recommendation (pending/approved/rejected)             │
│   ├── SFOpportunity, SFAccount, SFCampaign (Salesforce)     │
│   ├── ABMAccount, ABMList, ABMListMember                     │
│   └── BudgetAllocation, CampaignChange, WorkItem            │
│                                                              │
│   Knowledge Base: 38 files in knowledge/                     │
│   Served via: GET /api/context?section=<name>                │
│                                                              │
│   Credentials: ~/.config/ (google-ads, stackadapt,           │
│   linkedin-ads, salesforce, reddit)                          │
└──────────────────────────────────────────────────────────────┘
```

---

## Dual-Trigger System

Every agent can be triggered two ways. **Both paths are intentional and should both work.**

### Path 1: OpenClaw Crons (Autopilot)
- Fire on schedule regardless of external signals
- Run Python scripts directly via `openclaw cron`
- Use the standalone agent DB slugs (e.g., `negative-keyword`, `budget-pacing-manager`)
- This is the daily optimization loop — runs whether or not GDE exists

### Path 2: A2A Broker (GDE On-Demand)
- PM2 poll workers listen for messages from Ian's GDE system
- When GDE sends a signal (e.g., "re-evaluate budget, new campaign launched"), the worker forwards to OpenClaw
- OpenClaw routes to the correct agent session
- Uses A2A-specific DB slugs (e.g., `neg-keyword`, `budget-pacing`)
- Agent IDs follow pattern: `paid.demand.gen:aziz:<slug>`

### Why Both Exist
- Crons = guaranteed daily coverage. Agents run even if GDE is down or hasn't sent a signal.
- A2A = reactive. GDE can trigger agents in response to real-time events.
- Same underlying Python scripts, different trigger mechanisms.
- DB has separate slugs because cron agents and A2A agents register independently.

### A2A Workers (PM2)
| PM2 Process | A2A Agent ID | OpenClaw Agent | Config |
|-------------|-------------|----------------|--------|
| a2a-ares | paid.demand.gen:aziz:ares | main | config-ares.json (if exists) |
| a2a-budget-pacing | paid.demand.gen:aziz:budget-pacing | budget-pacing | config-budget-pacing.json |
| a2a-creative-qa | paid.demand.gen:aziz:creative-qa | creative-qa | config-creative-qa.json |
| a2a-keyword-bid-optimizer | paid.demand.gen:aziz:keyword-bid-optimizer | keyword-bid-optimizer | config-keyword-bid-optimizer.json |
| a2a-neg-keyword | paid.demand.gen:aziz:neg-keyword | neg-keyword | config-neg-keyword.json |
| a2a-stackadapt-ops | paid.demand.gen:aziz:stackadapt-ops | stackadapt-ops | config-stackadapt-ops.json |

Config files: `~/.openclaw/workspace/skills/a2a-messaging/config-<name>.json`
Poll wrapper: `skills/a2a-messaging/poll-wrapper.sh` → `poll-messages.sh`

### Agents Without A2A Workers (cron-only, GDE can't trigger)
- keyword-hygiene
- ad-copy-review
- ad-quality-audit
- reddit-ops
- hub-doctor
- landing-page-validator
- Fleet agents (audience-targeting, device-geo, frequency-reach, google-search-manager)

---

## Agent Registry

### Agent Slug Mapping (Cron ↔ A2A)
| Cron Slug (standalone) | A2A Slug (GDE) | Script | Notes |
|----------------------|---------------|--------|-------|
| negative-keyword | neg-keyword | negative-keyword-agent.py | Both should work |
| budget-pacing-manager | budget-pacing | budget-pacing-manager.py / budget-pacing-agent.py | Check which script each uses |
| (same) | keyword-bid-optimizer | keyword-research.py | Single identity |
| ad-copy-review | creative-qa | ad-copy-review-agent.py | Different names, similar function |
| (same) | stackadapt-ops | domain-publisher-manager.py | Single identity |
| (same) | google-creative-specialist | google-creative-specialist.py | No A2A worker yet |
| (same) | reddit-ops | reddit-ops-agent.py | No A2A worker, no cron |
| (same) | ad-quality-audit | ad-quality-audit-agent.py | No A2A worker |

### All Agents — Current Status (as of 2026-03-16)

#### Google Ads
| Agent | Script | Cron | A2A | Status |
|-------|--------|------|-----|--------|
| Negative Keyword | negative-keyword-agent.py | Daily 2 AM ✅ | neg-keyword ✅ | Cron works. A2A version HANGS. |
| Keyword & Bid Optimizer | keyword-research.py (?) | Daily 3 AM ✅ | keyword-bid-optimizer ✅ | Works. Weekly cron errored. |
| Keyword Hygiene | keyword-hygiene-agent.py | Weekly Sun 3 AM | No A2A | Works (89 findings). Disabled in DB. |
| Google Creative Specialist | google-creative-specialist.py | Fleet | No A2A | Runs but 0 findings. |
| Ad Quality Audit | ad-quality-audit-agent.py | Daily 6 AM ✅ | No A2A | Works. Finds real issues. |
| Google Search Manager | google-search-manager.py | Fleet weekly | No A2A | Works in fleet. |

#### LinkedIn
| Agent | Script | Cron | A2A | Status |
|-------|--------|------|-----|--------|
| LinkedIn Org Mapping | (sync scripts) | Daily 5 AM ✅ | No | Sync only, not optimization |
| LinkedIn Optimizer | — | — | — | 🔴 Blocked on API scope |

#### StackAdapt
| Agent | Script | Cron | A2A | Status |
|-------|--------|------|-----|--------|
| StackAdapt Ops | domain-publisher-manager.py | Tue/Fri 4 AM ✅ | stackadapt-ops ✅ | Works. Mon cron errored. |
| Creative Manager | creative-manager.py | — | No A2A | 💥 BROKEN — ImportError |
| Domain Publisher | domain-publisher-manager.py | — | No A2A | 💥 BROKEN — ImportError |
| Frequency & Reach | frequency-reach-manager.py | Fleet weekly | No A2A | 💥 BROKEN — externalId column |

#### Reddit
| Agent | Script | Cron | A2A | Status |
|-------|--------|------|-----|--------|
| Reddit Ops | reddit-ops-agent.py | **NONE** | No A2A | Works on dry-run. Telegram 400. No schedule. |

#### Cross-Platform
| Agent | Script | Cron | A2A | Status |
|-------|--------|------|-----|--------|
| Budget & Pacing | budget-pacing-agent.py | Every 6h ✅ | budget-pacing ✅ | Solid. |
| Creative QA | ad-copy-review-agent.py | Daily 3 AM UTC ✅ | creative-qa ✅ | Works. 0% success rate in DB (tracking bug). |
| Ad Copy Review | ad-copy-review-agent.py | — | No A2A | Works. Disabled. |
| Hub Doctor | hub-doctor.py | Daily 6 AM ✅ | No A2A | Works. Posts to Telegram. |
| Landing Page Validator | landing-page-validator.py | Fleet | No A2A | Works. |
| Audience Targeting | audience-targeting-optimizer.py | Fleet weekly | No A2A | 💥 BROKEN — externalId column |
| Device & Geo | device-geo-optimizer.py | Fleet weekly | No A2A | 💥 BROKEN — externalId column |

---

## Lobster Workflows

Lobster handles multi-step deterministic pipelines. Agent logic stays in Python; Lobster orchestrates.

| Workflow | Schedule | What It Does |
|----------|----------|-------------|
| agent-fleet-daily.lobster | 7 AM daily (cron) | Checks all agent runs from last 24h, flags failures |
| agent-fleet-weekly.lobster | Sun 4 AM (cron) | Runs fleet agents with extended lookback (30d) |
| agent-run-triage.lobster | Every heartbeat | Quick check for stuck/errored runs |
| budget-pacing-realloc.lobster | On demand | Budget reallocation with approval gates |
| system-health.lobster | Heartbeat rotation | PM2, disk, gateway, hub check |
| morning-briefing.lobster | First heartbeat of day | Email + calendar + weather + agents + health |
| memory-maintenance.lobster | Heartbeat rotation | File sizes, staleness, prune |
| audience-hygiene-scan.lobster | Mon 5 AM (cron) | ABM audience contamination scan |

---

## Hub (Next.js)

### Infrastructure
- **Runtime**: Next.js on localhost:3000, managed by PM2 (`dg-hub`)
- **Public URL**: https://telnyx-dg-hub.ngrok.app (ngrok stable domain)
- **Database**: PostgreSQL `dghub` via Prisma ORM
- **Auth**: NextAuth (internal only)

### Key Pages
| Route | What It Shows |
|-------|-------------- |
| `/` | Dashboard — high-level metrics |
| `/agents` | Agent fleet grid — status, last run, findings |
| `/agents/[slug]` | Per-agent detail — logs, recommendations, config |
| `/agents/config` | Global agent config |
| `/activity` | Activity log — all agent actions, approvals |
| `/health` | System health |
| `/budget` | Budget tracking |
| `/pipeline` | Salesforce pipeline data |
| `/abm` | ABM list management |

### Key API Routes
| Endpoint | Purpose |
|----------|---------|
| GET /api/agents/status | All agents with last run info |
| GET /api/agents/schedule | Agent schedules |
| GET /api/health | System health check |
| GET /api/context?section=X | Knowledge base API (serves to agents) |
| GET /api/campaigns | Campaign data |
| GET /api/budget | Budget/pacing data |
| POST /api/hooks/agent | GDE webhook proxy → OpenClaw gateway |

---

## Sync System

Campaign data syncs from ad platforms every 6 hours via OpenClaw cron:

| Cron | Script | Platforms |
|------|--------|-----------|
| Campaign Sync | sync_local.py | Google Ads, StackAdapt, Reddit, LinkedIn |
| Sync Changes | sync_changes.py | Tracks campaign changes over time |
| LinkedIn Org Mapping | (multiple scripts) | Resolves li_org: → company domains |

Sync staleness thresholds: >12h = warning, >24h = critical.

---

## Telegram Integration

All agent output goes to the DG Hub Telegram group (`-1003786506284`).

| Topic | Thread ID | What Posts There |
|-------|-----------|-----------------|
| 🤖 Agent Activity | 164 | All agent findings + approval buttons |
| 💬 Ask Ares | 134 | Team @mentions route to Ares |
| 📖 Guide & Data Info | 139 | Documentation, how-to |
| ✍️ Ad Copy Generator | 214 | Ad copy generation requests |
| 🏥 Hub Health | 951 | Hub Doctor daily reports |

Approval flow: Agent posts recommendation with ✅/❌ inline buttons → callback routes to `scripts/approve-negative.py` (or equivalent) → applies/rejects via platform API → updates DB.

---

## GDE Integration

The Global Demand Engine (Ian's project) sits above both Paid and AEO fleets.

```
GDE (Signal → Strategy → Dispatch)
  │
  ├── A2A Broker → Paid Fleet agents (this system)
  │     POST to agent ID: paid.demand.gen:aziz:<slug>
  │     Hub webhook: POST /api/hooks/agent (Bearer gde-hooks-a2a-2026)
  │
  └── A2A Broker → AEO Fleet agents (separate system)
```

GDE can trigger any agent that has an A2A worker. Agents without A2A workers are invisible to GDE.

Full GDE plan: `GDE-PLAN.md`
Architecture gist: https://gist.github.com/AzizTelnyx/5c95cfb88077272806c223947fb6b03b

---

## Guardrails (DB-backed, runtime-enforced)

| Rule | Value |
|------|-------|
| Budget floor | $10/day per campaign |
| Max budget change without approval | $500 |
| Cross-product reallocation | Always requires approval |
| Learning period | 14 days for new campaigns |
| Confidence threshold | 80% to auto-execute |
| Max actions/campaign/day | 3 |
| Kill switch | 50% CPA spike → halt all changes |

---

## Known Issues (as of 2026-03-16)

See `LAUNCH-PLAN.md` for the full audit and fix plan.

Summary:
1. `CampaignContext` + `ActionLevel` missing from agent_base.py (breaks 2 agents)
2. `externalId` column missing from Campaign table (breaks 3 fleet agents)
3. Hub health check can't find pm2 (PATH issue)
4. Campaign sync >18h stale on Google Ads + Reddit
5. neg-keyword A2A version hangs (cron version works)
6. Reddit Telegram send HTTP 400
7. Agent success rate shows 0% for working agents (tracking bug)
8. 4 crons in error state
9. Reddit Ops has no cron or A2A worker

---

## File Map

```
demand-gen-hub/
├── ARCHITECTURE.md          ← You are here
├── LAUNCH-PLAN.md           ← Current fix/launch plan
├── PAID-FLEET.md            ← Agent registry (needs update to match this doc)
├── GDE-PLAN.md              ← GDE integration plan
├── SETUP.md                 ← Dev setup instructions
├── src/
│   └── app/
│       ├── api/             ← Next.js API routes
│       ├── agents/          ← Agent UI pages
│       ├── health/          ← Health UI
│       └── ...
├── scripts/
│   ├── lib/
│   │   ├── agent_base.py    ← BaseAgent class (shared by all agents)
│   │   └── approval_handler.py
│   ├── platforms/
│   │   ├── google_ads.py    ← Google Ads connector
│   │   ├── linkedin.py      ← LinkedIn connector
│   │   ├── stackadapt.py    ← StackAdapt connector
│   │   └── reddit.py        ← Reddit connector
│   ├── negative-keyword-agent.py
│   ├── budget-pacing-agent.py
│   ├── ad-copy-review-agent.py
│   ├── keyword-hygiene-agent.py
│   ├── hub-doctor.py
│   ├── reddit-ops-agent.py
│   ├── google-creative-specialist.py
│   ├── ...
│   ├── sync_local.py        ← Campaign sync (all platforms)
│   └── query_metrics.py     ← Live metrics (never stale DB)
├── knowledge/               ← 38 files, served via /api/context
│   ├── brand/
│   ├── products/
│   ├── competitors/
│   ├── standards/
│   └── ...
├── prisma/
│   └── schema.prisma        ← DB schema
└── logs/                    ← Agent run logs (per-agent dirs)
```

---

_This document must be updated every time we change agent architecture, add/remove agents, modify trigger paths, or change infrastructure. If this doc is stale, that's a bug._
