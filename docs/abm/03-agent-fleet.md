# Agent Fleet

> **Last updated:** 2026-04-21

---

## 6 Agents

All agents use Lobster workflows for deterministic steps. Two agents use LLM (Expander + Builder).

```
┌─────────────────────────────────────────────────────────────┐
│                    ABM LIFECYCLE                            │
│                                                             │
│  ┌──────────┐   ┌───────────┐   ┌──────────────┐          │
│  │   SYNC   │──▶│  AUDITOR  │──▶│   EXPANDER   │          │
│  │ (daily)  │   │ (weekly)  │   │ (opt-in only)│          │
│  │ LLM: 0  │   │ LLM: 0   │   │ LLM: 1 step │          │
│  └──────────┘   └───────────┘   └──────────────┘          │
│                      │                   │                 │
│                      ▼                   ▼                 │
│               ┌───────────┐   ┌──────────────┐           │
│               │  PRUNER   │   │ NEG BUILDER  │           │
│               │ (weekly)  │   │ (monthly)    │           │
│               │ LLM: 0   │   │ LLM: 0      │           │
│               └───────────┘   └──────────────┘           │
│                                                             │
│  ┌──────────────────────────────────────────────┐          │
│  │  BUILDER RESEARCH (on-demand)                │          │
│  │  Interpret → Search → Enrich → Score →      │          │
│  │  Validate → Commit                            │          │
│  │  LLM: 2 steps (interpret + validate edges)   │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│  All → Platform Connectors (SA/LI) → Live campaigns        │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. ABM Sync — Daily 6 AM

**What:** Pull campaign, segment, and impression data from platforms into DB.

**LLM steps:** 0 — fully deterministic.

**Status:** ✅ Working

**Scripts:**
- `sync_ad_impressions.py` — SA impression data
- `sync_audiences.py` — SA audience sizes
- `sync_creatives.py` — Creative data
- `sync_salesforce.py` — SF accounts, opps, campaigns

**Cron:** Fast sync every 6h at :00, slow sync every 6h at :30

---

## 2. ABM Auditor — Weekly Mon 6 AM

**What:** Health scorecard for all 287 campaign-segment pairs. Waste detection, undersized alerts, anomaly flags.

**LLM steps:** 0 — fully deterministic.

**Logic:**
- For each campaign-segment: check impressions, spend, CTR, CPC vs benchmarks
- Flag: undersized segments, over-budget campaigns, zero-conversion campaigns, wasted spend
- Output: health report with actionable recommendations

**Status:** ✅ Built + croned

---

## 3. ABM Expander — Opt-In, Per Campaign

**What:** Find and add new qualified accounts to opted-in campaign segments.

**LLM steps:** 1 — AI research to find companies matching ICP rules.

**Opt-in mechanism:** `abmExpandEnabled` boolean on ABMCampaignSegment (default: false). Only campaigns where this is true get expanded. Managed via Hub UI.

**Logic:**
1. Fetch ABMCampaignSegment rows where `abmExpandEnabled = true`
2. For each opted-in campaign: load ICP rule, current members, exclusions
3. AI research: "Find companies matching [ICP rule] not already in [segment]"
4. For each candidate: Clearbit enrichment → relevance score → dedup against exclusions and existing members
5. Categorize: auto-add (≥ 0.7, TOFU ≥ 0.6) vs. review (0.4–0.7)
6. Approval gate → present candidates with reasoning
7. If approved → add to ABMAccount + ABMListMember + push to SA

**Lobster workflow:** `workflows/abm-expander.lobster`

**Status:** ✅ Built + croned (Tue 6 AM). Push to SA wired via `abm_push_to_stackadapt.py`.

---

## 4. ABM Pruner — Weekly Sun 5 AM

**What:** Remove accounts that are wasting spend or are irrelevant.

**LLM steps:** 0 — fully deterministic.

**Logic:**
1. Fetch all domains with StackAdapt impression data
2. Calculate: impressions, clicks, conversions, spend, CTR, CPC over last 30d
3. Score relevance against ICP rules
4. Flag into tiers:

| Tier | Criteria | Action | Confidence |
|------|----------|--------|------------|
| Auto-remove | Spend > 0 + relevance = 0 | Remove from segment | High |
| Auto-remove | In ABMExclusion + still getting imps | Remove (sync issue) | High |
| Review | Moderate spend + low relevance (0.01–0.3) | Flag for review | Needs judgment |
| Keep | Relevance ≥ 0.3 | No action | — |

**Lobster workflow:** `workflows/abm-pruner.lobster`

**Status:** ✅ Built + croned

---

## 5. ABM Negative Builder — Monthly 1st 4 AM

**What:** Build product-scoped exclusion lists from irrelevant domain patterns.

**LLM steps:** 0 — fully deterministic.

**Logic:**
1. Load all ABMAccount domains with their productFit scores
2. Load existing ABMExclusion entries
3. For each product: identify domains with zero relevance that have received impressions
4. Generate exclusion candidates: competitors, ISPs, hospitals, irrelevant verticals
5. Push to StackAdapt exclusion audiences via connector

**Lobster workflow:** `workflows/abm-negative-builder.lobster`

**Status:** ✅ Built + croned. 1,372 exclusions added last run.

**Note:** After the productFit scoring fix (2026-04-20), the negative builder needs re-running with corrected productFit data. Old runs used the broken AI Agent keywords.

---

## 6. ABM Builder Research — On-Demand

**What:** Find real companies matching a research brief (e.g. "find AI agent companies in APAC").

**LLM steps:** 2 — interpret (Gemini Flash) + validate edge cases (gpt-4.1-mini). Everything else is deterministic.

**Key principle:** AI is scorer and interpreter, NEVER the source. Every company comes from real web results (Brave Search), verified by Clearbit.

**Pipeline:**

```
Interpret → Search → Enrich → Score → Validate → Review → Commit
   LLM      API     API     determ    LLM        gate     DB
  (Flash)  (Brave) (Clear) (0 LLM)  (mini)     (human)  (write)
```

| Step | Script | LLM? | What it does |
|------|--------|-------|-------------|
| interpret | `abm-builder-interpret.py` | Gemini Flash | Parse brief → structured criteria + search queries |
| search | `abm-builder-search.py` | No | Brave Search API → extract company domains |
| enrich | `abm-builder-enrich.py` | No | Clearbit v2 firmographics + hallucination check |
| score | `abm-builder-score.py` | No | Deterministic relevance (desc 40%, tags 30%, tech 15%, size 15%). Drop < 0.15. |
| validate | `abm-builder-validate.py` | gpt-4.1-mini | AI validates borderline (0.15–0.6). Auto-accepts > 0.6. |
| commit | `abm-builder-commit.py` | No | Upsert to ABMAccount + ABMListMember |

**Shared library:** `abm_builder_lib.py` — reusable functions (Clearbit, scoring, hallucination check, SF cross-check, Brave search) extracted from Expander.

**Lobster workflow:** `workflows/abm-builder-research.lobster` — chains all 6 steps with approval gate before commit.

**How to run:**
```bash
# Via Lobster (preferred)
node skills/lobster/bin/lobster.js run --mode tool --file workflows/abm-builder-research.lobster

# Or individual steps for debugging
python3 scripts/abm-builder-interpret.py --brief "Find AI agent companies in APAC"
python3 scripts/abm-builder-search.py --criteria-json '<interpret output>'
python3 scripts/abm-builder-enrich.py --domains-json '<search output>'
python3 scripts/abm-builder-score.py --accounts-json '<enrich output>' --products '["voice-ai"]'
python3 scripts/abm-builder-validate.py --accounts-json '<score output>' --criteria-json '<interpret output>'
python3 scripts/abm-builder-commit.py --accounts-json '<validate output>' --list-name 'AI Agent APAC' --criteria-json '<interpret output>'
```

**Status:** ✅ Built (2026-04-21). Awaiting first live run.

---

## Cron Schedule

| Agent | Schedule | Cron ID |
|-------|----------|---------|
| Sync (fast) | Every 6h at :00 | `bda9e9f6` |
| Sync (slow) | Every 6h at :30 | `863f5015` |
| Auditor | Mon 6 AM | `6d6b33c6` |
| Expander | Tue 6 AM | `a02e0a21` |
| Pruner | Sun 5 AM | `4d9f1337` |
| Negative Builder | 1st of month 4 AM | `492ac827` |
| Builder Research | On-demand | — |

---

## Approval System

All agents follow the same approval pattern via Lobster:

1. **Preview step** — dry run, show what would change
2. **Approval gate** — `approval: required` in workflow
3. **Execute step** — only runs if approved, condition: `$approve.approved`
4. **Push step** — applies changes to platform via connector

**Confidence thresholds:**

| Agent | Auto-execute | Review | Skip |
|-------|-------------|--------|------|
| Expander | ≥ 0.7 (TOFU: 0.6) | 0.4–0.7 | < 0.4 |
| Pruner | Relevance = 0 + spend > 0 | 0.01–0.3 + spend | ≥ 0.3 |
| Negative Builder | < 0.2 | — | ≥ 0.2 |

**Approval channels:** Telegram inline buttons (✅ / ❌) + Hub UI approval queue.
