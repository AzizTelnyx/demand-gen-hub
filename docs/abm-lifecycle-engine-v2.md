# ABM Lifecycle Engine v2 — Design Document

**Last updated:** 2026-04-19
**Status:** Data foundation complete, connectors + closed loop in progress

---

## 1. Vision

Closed-loop ABM: automatically grow, clean, and optimize target account lists across StackAdapt and LinkedIn. The system detects waste, finds new qualified accounts, pushes changes to platforms, and measures pipeline impact — all with human approval gates.

**Google Ads is out of scope for now.** Focus on StackAdapt (best ABM platform, native domain upload) and LinkedIn (large reach, partial API access).

---

## 2. Data Foundation (Current State)

| Table | Count | Notes |
|-------|-------|-------|
| ABMAccount | 2,555 | 2,375 with country (93%), 2,344 with description |
| ABMExclusion | 3,810 | Competitors, ISPs, hospitals, irrelevant verticals |
| ABMCampaignSegment | 287 | With 30d performance data + health flags |
| ABMListRule | 8 | 5 AI Agent variants + Voice/SMS/SIP/IoT |
| ABMList | 435 | Platform segment references |
| AdImpression | 32,591 | StackAdapt has domain-level data; LinkedIn is li_org: blocked |

### Platform Data Reality

| Platform | Domain-Level Data | Can Push Changes | Status |
|----------|------------------|-----------------|--------|
| **StackAdapt** | ✅ 2,555 domains, 1.55M imps, $12.5K spend | ❌ Connector not built | #1 priority |
| **LinkedIn** | ❌ 97% li_org: IDs, only 12 resolved domains | ⚠️ Create segment works, populate doesn't | Blocked on API |
| **Google Ads** | ❌ Aggregate only | ❌ Out of scope | Deferred |

---

## 3. Agent Architecture

All agents use Lobster workflows. No standalone Python pipelines.

```
┌──────────────────────────────────────────────────────┐
│                  ABM LIFECYCLE                       │
│                                                      │
│  ┌─────────┐    ┌──────────┐    ┌──────────────┐    │
│  │  SYNC   │───▶│ AUDITOR  │───▶│ EXPANDER     │    │
│  │ (daily) │    │ (weekly) │    │ (opt-in only)│    │
│  └─────────┘    └──────────┘    └──────────────┘    │
│                      │                    │          │
│                      ▼                    ▼          │
│               ┌──────────┐    ┌──────────────┐      │
│               │  PRUNER  │    │ NEG BUILDER  │      │
│               │ (weekly) │    │ (monthly)    │      │
│               └──────────┘    └──────────────┘      │
│                      │                    │          │
│                      ▼                    ▼          │
│               ┌──────────────────────────────────┐  │
│               │   PLATFORM CONNECTOR (SA/LI)     │  │
│               │   Push changes to live segments  │  │
│               └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 4. Agent Details

### 4.1 ABM Sync (Daily 6 AM)
**What:** Pull campaign + segment + impression data from platforms into DB.
**LLM:** None. Fully deterministic.
**Status:** ✅ Working (split into fast/slow sync crons)

### 4.2 ABM Auditor (Weekly Mon 6 AM)
**What:** Health scorecard for all campaign-segment pairs. Waste detection, undersized alerts, anomaly flags.
**LLM:** None. Fully deterministic.
**Status:** ✅ Built + croned

### 4.3 ABM Pruner (Weekly Sun 5 AM)
**What:** Remove accounts that are wasting spend or irrelevant. Uses StackAdapt domain-level impression data.

**Logic:**
1. Fetch all domains from ABMAccount that appear in AdImpression (StackAdapt only for now)
2. For each domain, calculate: impressions, clicks, conversions, spend, CTR, CPC over last 30d
3. Score relevance against ICP rules (description 40%, industry 30%, size 15%, country 15%)
4. Flag into tiers:

| Tier | Criteria | Action | Confidence Required |
|------|----------|--------|-------------------|
| **Auto-remove** | Spend > 0 + relevance = 0 | Auto-remove from segment | High — zero relevance by definition |
| **Auto-remove** | Already in ABMExclusion + still getting impressions | Auto-remove (sync issue) | High — already excluded |
| **Review** | Moderate spend + low relevance (0.01–0.3) | Flag for human review | Needs judgment |
| **Keep** | Relevance ≥ 0.3 | No action | — |

**Auto-removal confidence:** Only when relevance is truly zero (no ICP match on any dimension) AND we have real impression data showing spend. No guessing — if we can't score confidently, it goes to review.

**Lobster workflow:** `workflows/abm-pruner.lobster` (all deterministic, no LLM)

### 4.4 ABM Expander (Opt-In, Per Campaign)
**What:** Find and add new qualified accounts to opted-in campaign segments.

**Key design change (2026-04-19):** The Expander does NOT use segment size as a trigger. We always want to expand — the question is which campaigns want this, not whether a segment is "too small."

**Opt-in mechanism:**
- `abmExpandEnabled` boolean on ABMCampaignSegment (default: false)
- Only campaigns where this flag is true get expanded
- Managed via Hub UI (checkbox per campaign)
- Can also be set via DB directly for bulk operations

**Logic:**
1. Fetch all ABMCampaignSegment rows where `abmExpandEnabled = true`
2. For each opted-in campaign:
   a. Load ICP rule (product, variant, target industries, use case keywords)
   b. Load current segment members (dedup against existing)
   c. Load ABMExclusion list (skip excluded domains)
   d. Load Salesforce existing customers (skip or flag as upsell)
3. AI research (LLM): "Find companies matching [ICP rule] not already in [segment]"
4. For each candidate:
   a. Clearbit enrichment: description, industry, employees, country
   b. Relevance score against ICP rule
   c. Skip if score < 0.4, skip if in ABMExclusion, skip if already customer
   d. Categorize: auto-add (≥ 0.7) vs. review (0.4–0.7)
5. Approval gate → present candidates per campaign with reasoning
6. If approved → add to ABMAccount + ABMListMember in DB
7. **If StackAdapt connector built** → also push to StackAdapt segment

**Lobster workflow:** `workflows/abm-expander.lobster` (1 LLM step for research, rest deterministic)

### 4.5 ABM Negative Builder (Monthly 1st 4 AM)
**What:** Build product-scoped exclusion lists from irrelevant domain patterns.
**LLM:** None. Fully deterministic.
**Status:** ✅ Built + croned. 1,372 exclusions added last run.

---

## 5. Platform Connectors (To Build)

### 5.1 StackAdapt ABM Connector — HIGHEST PRIORITY

This closes the loop. Without it, all agent decisions stay in the DB and don't affect live campaigns.

**Methods needed:**
- `createAbmAudience(input)` — create new ABM audience from company domains
- `updateAbmAudienceWithDomainsList(input)` — add/remove domains from existing segment
- `attachAudienceToCampaign(segmentId, campaignId)` — attach segment to campaign targeting
- `detachAudienceFromCampaign(segmentId, campaignId)` — remove segment from targeting
- `getAudienceInsights(segmentId)` — domain-level engagement data (already have via sync)

**What this enables:**
- Pruner auto-removes → connector removes domain from StackAdapt segment → stops showing ads to irrelevant companies
- Expander adds → connector uploads domain to StackAdapt segment → starts showing ads to new qualified companies
- Negative Builder → connector adds domains to exclusion targeting → blocks across all StackAdapt campaigns

### 5.2 LinkedIn ABM Connector — BLOCKED (partial)

**What works via API:**
- Create COMPANY type DMP segments ✅
- Attach/detach segments to campaigns ✅
- Read segment sizes ✅
- Archive segments ✅

**What's blocked:**
- **Populating segments with domains** — upload endpoint undocumented. Workaround: create via API, populate via Campaign Manager UI.
- **Resolving li_org: to company names** — Community Management API approval stalled since 2026-03-12. Would unlock 8,338 domains.

**Priority after StackAdapt connector is built.**

### 5.3 Google Ads — DEFERRED
Not in scope. Customer Match requires domain→email conversion. Aggregate data only.

---

## 6. ABM Budget & Bid Manager (Roadmap)

**Not building yet. Design for later.**

A StackAdapt-specific agent that manages:
- **Bid optimization** — adjust bids based on domain-level engagement (high-engagement domains get higher bids)
- **Reach management** — monitor segment saturation, flag when we're over-exposing to same domains
- **Performance-based allocation** — shift budget toward segments with better pipeline metrics
- **Frequency capping** — reduce spend on domains that have seen >X impressions with no engagement

This requires the StackAdapt connector first (to read domain-level data + adjust targeting/bids).

---

## 7. Hub UI Design

**Goal:** Intuitive ABM management. Not a data table — a control panel.

### 7.1 ABM Dashboard (Main View)

```
┌──────────────────────────────────────────────────┐
│  ABM LIFECYCLE ENGINE                            │
│                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │ 2,555       │  │ 3,810       │  │ 287      │ │
│  │ Accounts    │  │ Exclusions  │  │ Segments │ │
│  └─────────────┘  └─────────────┘  └──────────┘ │
│                                                  │
│  Last Audit: Mon 6 AM  │  Next Prune: Sun 5 AM  │
│  WASTE DETECTED: $598/mo on irrelevant domains   │
│                                                  │
│  ┌─── Campaign Segments ──────────────────────┐ │
│  │ AI Agent - Contact Center    [EXPAND ✓]    │ │
│  │ Voice API - Healthcare       [EXPAND ✗]   │ │
│  │ SMS API - Fintech            [EXPAND ✓]    │ │
│  │ SIP Trunking - Enterprise    [EXPAND ✗]   │ │
│  └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 7.2 Campaign Segment Detail View

Clicking a segment shows:
- **Members**: list of domains with relevance scores, impression data, engagement
- **Exclusions**: domains excluded for this product/segment
- **Performance**: 30d impressions, clicks, conversions, spend, CTR, CPC
- **Health flags**: low_ctr, undersized, waste_detected, etc.
- **Expand toggle**: checkbox to opt-in/out of Expander
- **Actions**: "Add domains", "Remove domains", "Push to StackAdapt"

### 7.3 Pruner Results View

After Pruner runs:
- **Auto-removed** (zero relevance): shown as list with reason + spend saved
- **Pending review**: cards with domain, relevance score, spend, reason → Approve/Reject buttons
- **Kept**: summary count

### 7.4 Expander Results View

After Expander runs:
- **New candidates** per campaign: domain, company name, relevance score, ICP match reasoning
- **Auto-added** (≥ 0.7 confidence): shown with reasoning
- **Pending review** (0.4–0.7): cards → Approve/Reject buttons
- **Source**: AI research or Clearbit discovery

### 7.5 Exclusion Manager View

- All ABMExclusion rows grouped by category (competitor, ISP, hospital, etc.)
- Add/remove exclusions
- Push to StackAdapt (when connector built)

### 7.6 UI Architecture Decision

- Current Hub UI can be reworked or replaced
- If replacing, save current UI code in a branch for reference
- Priority: functionality over polish — get the controls working first
- Must be usable by any team member, not just engineers

---

## 8. Attribution Loop (To Build)

**Goal:** Prove ABM pipeline impact. "Companies in our Voice API segment generated $X in SQOs."

**Data sources:**
- StackAdapt domain-level impressions (2,555 domains)
- Salesforce opportunities with account domains
- ABMAccount + ABMCampaignSegment membership

**Query pattern:**
```
StackAdapt domain impressions
  → JOIN ABMAccount (which segment is this domain in?)
  → JOIN Salesforce Opportunity (did this company create an SQO?)
  → Result: "Voice API segment → 45 domains with impressions → 8 SQOs → $240K pipeline"
```

Not built yet. Data exists, needs the SQL + Hub visualization.

---

## 9. Lobster Architecture

### Why Lobster

| Problem | Lobster Fix |
|---------|-------------|
| No audit trail | Each step logs inputs/outputs as structured JSON |
| No approval gates | `approval: required` on write steps |
| No deterministic/LLM separation | Deterministic steps = 0 LLM tokens |
| No rollback data | Before/after captured at approval gate |

### Workflow Files

| Workflow | File | LLM Steps | Deterministic Steps |
|----------|------|-----------|-------------------|
| Expander | `workflows/abm-expander.lobster` | 1 (AI research) | 5+ (fetch, Clearbit, SF, score, execute) |
| Pruner | `workflows/abm-pruner.lobster` | 0 | 5+ (fetch, score, tier, execute) |
| Negative Builder | `workflows/abm-negative-builder.lobster` | 0 | 5+ (fetch, score, execute) |
| Auditor | `workflows/abm-auditor.lobster` | 0 | 4+ (fetch, score, report) |

### Scoring Formula (Shared)

- Description keywords: 40%
- Variant-specific tags: 20%
- Industry tags: 20%
- Tech stack: 10%
- Company size: 10%

**Thresholds:**
| Agent | Auto-execute | Review | Skip |
|-------|-------------|--------|------|
| Expander | ≥ 0.7 (TOFU: 0.6) | 0.4–0.7 | < 0.4 |
| Pruner | Relevance = 0 + spend > 0 | 0.01–0.3 + spend | ≥ 0.3 |
| Negative Builder | < 0.2 | — | ≥ 0.2 |

### Cron Schedules

| Agent | Schedule | Cron ID |
|-------|----------|---------|
| Sync (fast) | Every 6h at :00 | `bda9e9f6` |
| Sync (slow) | Every 6h at :30 | `863f5015` |
| Auditor | Mon 6 AM | `6d6b33c6` |
| Expander | Tue 6 AM | `a02e0a21` |
| Pruner | Sun 5 AM | `4d9f1337` |
| Negative Builder | 1st of month 4 AM | `492ac827` |

---

## 10. Build Priority

### Phase 1: Close the Loop (StackAdapt)
1. Build StackAdapt ABM connector (CRUD methods)
2. Update Pruner to auto-push removals to StackAdapt
3. Update Expander to auto-push additions to StackAdapt
4. Update Negative Builder to push exclusions to StackAdapt
5. Build attribution query

### Phase 2: Hub UI
6. ABM Dashboard (main view with stats + expand toggles)
7. Campaign Segment Detail view
8. Pruner/Expander results views
9. Exclusion Manager view

### Phase 3: LinkedIn
10. LinkedIn ABM connector (create segments, attach/detach)
11. LinkedIn domain upload workaround or API discovery
12. Follow up on Community Management API approval

### Phase 4: Advanced
13. StackAdapt Budget & Bid Manager agent
14. Frequency capping by domain
15. Cross-platform attribution (when LinkedIn data resolves)
