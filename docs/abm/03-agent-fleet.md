# Agent Fleet

> **Last updated:** 2026-04-20

---

## 5 Agents

All agents use Lobster workflows for deterministic steps. Only the Expander uses LLM.

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

## Cron Schedule

| Agent | Schedule | Cron ID |
|-------|----------|---------|
| Sync (fast) | Every 6h at :00 | `bda9e9f6` |
| Sync (slow) | Every 6h at :30 | `863f5015` |
| Auditor | Mon 6 AM | `6d6b33c6` |
| Expander | Tue 6 AM | `a02e0a21` |
| Pruner | Sun 5 AM | `4d9f1337` |
| Negative Builder | 1st of month 4 AM | `492ac827` |

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
