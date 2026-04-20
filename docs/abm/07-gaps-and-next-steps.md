# ABM System — Status, Gaps & Next Steps

> **Last updated:** 2026-04-20 by Ares
> **Owner:** Aziz (Head of Demand Gen, Telnyx)

---

## Current State at a Glance

| Metric | Value |
|--------|-------|
| Total accounts in ABM | 2,555 |
| Accounts with product fit | 938 (37%) |
| Accounts with null product fit | 1,617 (63%) |
| Pipeline accounts (active SF opps) | 41 |
| Domains excluded from targeting | 771 |
| Total exclusion records (incl. per-product) | 3,922 |
| SA exclusion audiences (pushed live) | 6 audiences |
| Products scored | AI Agent (498), IoT SIM (182), Voice API (165), SMS (66), SIP (27) |

---

## ✅ What's Live & Working

### Data Foundation
- **Product fit scorer** (`abm_product_scorer.py`) — scores accounts by description/tags/tech/size with rescue signals and telecom overrides
- **Structural exclusions v2** (`abm_structural_exclusions_v2.py`) — tag-based exclusion with multi-label logic (Clearbit tags as primary signal, not just industry)
- **Exclusion push to StackAdapt** (`abm_exclusion_push.py`) — 771 domains across 6 SA audiences, all marked pushed
- **SF integration** — 122 accounts linked via domain matching, 41 in pipeline, 260 with switchSignal
- **Clearbit enrichment** — descriptions, tags, tech stack, employee count, revenue

### Agent Fleet (Lobster Workflows)
| Agent | Status | Schedule | What it does |
|-------|--------|----------|-------------|
| ABM Sync | ✅ Live | Daily 6 AM | Syncs campaigns, creatives, SF data |
| Negative Keyword | ✅ Live | Daily 2 AM | AI-powered search term analysis |
| Ad Copy Review | ✅ Live | Daily 3 AM | Audits creatives against brand rules |
| ABM Expander v3 | ✅ Built, dry-run validated | Weekly Tue 5 AM | Pipeline-driven + segment-size expansion |
| ABM Pruner | ⚠️ Built, dry-run only | Biweekly Sun 5 AM | Removes dead/impossible domains from segments |
| ABM Negative Builder | ⚠️ Needs re-run | Monthly 1st Sun | Builds exclusion lists from scoring |
| ABM Auditor | ⚠️ Built, dry-run only | Weekly Mon | Audits segment health |

### Hub UI
- **Domains page** — redesigned with Active Targets vs Excluded tabs, labeled reason badges
- **Ads Library** — 777 creatives across Google/SA/Reddit/LinkedIn
- **Budget page** — pacing and allocation
- **Dashboard** — high-level metrics

---

## 🔴 Blocked

### LinkedIn Attribution (blocked since 2026-03-12)
- **Problem:** 97.2% of LinkedIn impressions have `li_org:` IDs, can't match to SF accounts
- **Impact:** ~$580K pipeline from only 36 deals (tiny fraction of actual LI contribution)
- **Blocker:** Community Management API approval stalled. Created separate app as LinkedIn required. Still not approved.
- **Next:** Escalate with LinkedIn support (Josh B, ticket #66960)
- **Doc:** https://docs.google.com/document/d/1-kyOmmGPtpEO7okaa4Gt_dU_v7mX0TMohVDtFx3Mo5Q/edit

### LinkedIn Ads Ops Agent
- **Problem:** Blocked on same API approval. Can't automate LI campaign ops.
- **Status:** Designed, can't build until API access granted.

---

## 🟡 Needs Live Validation (built but not tested end-to-end)

### Expander → SA Push
- **What:** Expander finds new domains, should push them to SA targeting audiences
- **Status:** Dry run works — found 19 candidates for AI Agent (Kore.ai, Cognigy excluded; Rasa, Observe.AI, Replicant scored 0.75-0.80)
- **Gap:** Haven't run a real push to verify domains appear in SA campaigns
- **Effort:** ~1 hour controlled test

### Pruner
- **What:** Removes dead domains from segments, flags low-relevance for review
- **Status:** Dry-run only. 11 AgentRun records stuck in `dry_run` status from testing.
- **Gap:** Needs a real run against production data
- **Effort:** ~30 minutes

### Negative Builder Re-run
- **What:** Regenerates exclusion lists based on corrected productFit scoring
- **Why:** Last run used the old broken scoring (1,990/2,555 wrongly labeled "AI Agent"). Current scoring is correct.
- **Effort:** ~1 hour (run + review + push to SA)

---

## 🟠 Gaps to Close

### 1. Hub UI — DomainSlideOut missing SF data
- **Problem:** Click a domain → slide-out shows empty pipeline/opp/switch fields
- **Fix:** Wire component to query SFAccount + SFOpportunity tables
- **Shows:** Pipeline status, opp stage, amount, switchSignal, currentProvider
- **Effort:** ~2 hours

### 2. SF Sync not croned
- **Problem:** `sync_salesforce.py` runs manually → stale pipeline data
- **Fix:** Add to cron (daily 5 AM, before ABM Sync at 6 AM)
- **Effort:** ~15 minutes

### 3. ABMExclusion.saAudienceId backfill
- **Problem:** All exclusion rows have `saAudienceId = NULL`. Push script works around it but tracking is fragile.
- **Fix:** Backfill from known audience IDs (2502446-2502450, 2502525)
- **Effort:** ~30 minutes

### 4. 1,617 null-productFit accounts
- **Problem:** 63% of accounts have no product fit. Most are genuinely irrelevant (pharmacies, food, fashion).
- **Options:**
  - (A) Let Pruner handle them — slow but safe
  - (B) Bulk exclude null-productFit — fast but aggressive
  - (C) Looser thresholds — risks false positives
- **Recommendation:** Option A. Pruner will systematically remove waste. Don't force-classify.

### 5. Expander positive audience push
- **Problem:** Expander finds new domains but doesn't push them to SA targeting audiences yet
- **Fix:** Wire `createAbmAudience` + `updateAbmAudienceWithDomainsList` into Expander push flow
- **Note:** SA connector methods already exist in `scripts/platforms/stackadapt.py`
- **Effort:** ~3 hours

### 6. Cosmetic log bug
- **Problem:** Expander logs show "v2 v3" instead of just "v3" (likely stale AGENT_NAME variable)
- **Effort:** ~10 minutes

---

## 🔵 Future / Low Priority

| # | Item | Description | Effort |
|---|------|-------------|--------|
| 7 | Attribution dashboard | SQL + UI showing segment → domains → SQOs → pipeline | ~1 day |
| 8 | Detach exclusion audiences | `detachAudienceFromCampaign` not built in SA connector | ~2 hours |
| 9 | currentProvider detection | Detect competitor usage from SF/Clearbit/AI research for conquesting | ~1 day |
| 10 | Google Ads Customer Match | Upload ABM audiences to Google. Zero code. Deferred until LI+SA automated. | ~1 day |
| 11 | Segment Engine | Dynamic segment creation based on rules (industry + tech + geo) | ~2 days |
| 12 | Hub UI — Attach exclusion audiences to campaigns | UI to connect SA audiences to specific campaigns | ~3 hours |

---

## Build Priority Order (recommended)

1. ⬜ **Cron SF sync** (15 min, unblocks fresh pipeline data)
2. ⬜ **Negative Builder re-run** (1 hr, cleans up exclusion lists)
3. ⬜ **Live Expander validation** (1 hr, confirms end-to-end push works)
4. ⬜ **Live Pruner validation** (30 min, confirms cleanup works)
5. ⬜ **DomainSlideOut SF wiring** (2 hrs, makes Hub actually useful for pipeline review)
6. ⬜ **ABMExclusion.saAudienceId backfill** (30 min, data hygiene)
7. ⬜ **Expander positive audience push** (3 hrs, actually targets new domains)
8. ⬜ **Escalate LinkedIn API** (ongoing)
9. ⬜ **Attribution dashboard** (1 day)
10. ⬜ **Google Ads Customer Match** (1 day, after LI+SA fully automated)

---

## Architecture Decisions (for reference)

- **productFit scored from company data, not campaign source** — 1,990 accounts were wrongly labeled "AI Agent" because fit was derived from which campaign served impressions
- **AI Agent keywords are strict** — no generic telecom terms (voice, telephony, sms). Only AI-specific terms.
- **Structural exclusions use Clearbit tags as PRIMARY signal** — multi-label tags are curated. Hospital gets "Medical Care"+"Surgical Hospitals" (waste). Healthtech gets "Health Care"+"Technology"+"SAAS" (NOT waste).
- **Pipeline accounts are ALWAYS protected from exclusion** — 41 domains never excluded regardless of industry
- **Competitor domains include CPaaS + conversational AI + CCaaS** — Kore.ai, Cognigy, Five9, TalkDesk, Dialpad, etc. excluded from Expander targeting
- **Pipeline-driven expansion is primary mode** — Expander v3 uses SF opps to find lookalikes (MOFU thresholds). Segment-size is fallback for products without pipeline seeds.
