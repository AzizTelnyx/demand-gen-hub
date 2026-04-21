# ABM Lifecycle Engine — System Documentation

> **Last updated:** 2026-04-21
> **Repo:** https://github.com/AzizTelnyx/demand-gen-hub
> **Hub UI:** https://telnyx-dg-hub.ngrok.app/abm/domains

---

## What This System Does

Closed-loop ABM for Telnyx demand generation: automatically grow, clean, and optimize target account lists across ad platforms. The system detects wasted spend on irrelevant companies, finds new qualified accounts, pushes changes to platforms, and measures pipeline impact — all with human approval gates.

**One sentence:** Stop paying for impressions on companies that will never buy, start showing ads to companies that will.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        HUB UI (Next.js)                        │
│   /abm/domains  /abm/campaigns  /abm/exclusions  /abm/docs     │
│          │              │              │                        │
│          └──────────────┼──────────────┘                        │
│                         ▼                                       │
│                    POSTGRESQL (dghub)                            │
│     ABMAccount │ ABMExclusion │ ABMCampaignSegment │ SFAccount  │
│                         │                                       │
│            ┌────────────┼────────────┐                          │
│            ▼            ▼            ▼                           │
│     ┌──────────┐ ┌──────────┐ ┌──────────────┐                │
│     │  SYNC    │ │ AUDITOR  │ │   EXPANDER    │                │
│     │ (daily)  │ │ (weekly) │ │ (opt-in only) │                │
│     └──────────┘ └──────────┘ └──────────────┘                │
│                       │              │                          │
│                       ▼              ▼                          │
│                ┌──────────┐  ┌──────────────┐                  │
│                │  PRUNER  │  │ NEG BUILDER  │                  │
│                │ (weekly) │  │ (monthly)    │                  │
│                └──────────┘  └──────────────┘                  │
│                       │              │                          │
│                       ▼              ▼                          │
│              ┌────────────────────────────┐                     │
│              │  PLATFORM CONNECTORS      │                     │
│              │  SA ✅  │  LI ⚠️  │  GAds ❌  │                │
│              └────────────────────────────┘                     │
│                                                                  │
│              ┌────────────────────────────┐                     │
│              │  SALESFORCE (attribution)  │                     │
│              │  5K accounts │ 3K opps     │                     │
│              └────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- PostgreSQL 17 running on `localhost:5432`, database `dghub`
- Python 3.11+ in `/Users/azizalsinafi/.venv/bin/python3`
- Node.js 25+ for Hub UI
- `sf` CLI authenticated to `telnyx-prod` org
- StackAdapt API token in `~/.config/stackadapt/credentials.json`

### Running Agents
```bash
# Individual agent scripts (legacy — still work)
python3 scripts/abm-expander-agent.py --dry-run
python3 scripts/abm-pruner-agent.py --dry-run

# Lobster workflows (preferred)
node skills/lobster/bin/lobster.js run --mode tool --file workflows/abm-expander.lobster

# One-shot: link SF data + re-score null accounts
python3 scripts/sf_link_and_classify.py
```

### Hub UI
```bash
cd demand-gen-hub
npm run build && pm2 restart dg-hub
# → https://telnyx-dg-hub.ngrok.app
```

---

## Table of Contents

1. [Data Model](./01-data-model.md) — All tables, counts, relationships
2. [Product Fit Scoring](./02-product-fit-scoring.md) — How accounts get classified, the bug we fixed, current distribution
3. [Agent Fleet](./03-agent-fleet.md) — All 5 agents, schedules, workflows, LLM usage
4. [Platform Connectors](./04-platform-connectors.md) — SA (done), LinkedIn (blocked), Google (deferred)
5. [Salesforce Integration](./05-salesforce-integration.md) — Account linking, pipeline, attribution
6. [Hub UI](./06-hub-ui.md) — Pages, API routes, write actions
7. [Gaps & Next Steps](./07-gaps-and-next-steps.md) — Prioritized list of what's missing

---

## Builder Research Pipeline

The `/abm/builder` page creates new ABM domain lists from natural language briefs (e.g. "Find AI agent companies in APAC"). The research pipeline runs via Lobster:

```
Interpret → Search → Enrich → Score → Validate → Review → Commit
   LLM      API     API     determ    LLM        gate     DB
  (Flash)  (Brave) (Clear) (0 LLM)  (mini)     (human)  (write)
```

**Key principle:** AI = scorer and interpreter, NEVER the source. Every company comes from real web results (Brave Search), verified by Clearbit enrichment. Deterministic scoring filters 80% of junk with zero LLM cost.

**Scripts:** `abm-builder-interpret.py`, `abm-builder-search.py`, `abm-builder-enrich.py`, `abm-builder-score.py`, `abm-builder-validate.py`, `abm-builder-commit.py`
**Shared lib:** `abm_builder_lib.py` (reuses Expander's Clearbit, scoring, hallucination, SF logic)
**Workflow:** `workflows/abm-builder-research.lobster`
