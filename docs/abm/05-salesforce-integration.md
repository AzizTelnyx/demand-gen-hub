# Salesforce Integration

> **Last updated:** 2026-04-20

---

## Overview

Salesforce is the source of truth for pipeline data. The ABM system uses it for:

1. **Account enrichment** — industry, revenue, firmo tier, sales segment
2. **Pipeline status** — which accounts have active opportunities
3. **Attribution** — which ad-impressed domains converted to pipeline
4. **Switch signals** — opp source data (competitor churn signals)

---

## Data Sync

**Script:** `scripts/sync_salesforce.py`
**Auth:** `sf` CLI with `--target-org telnyx-prod`
**Schedule:** On demand (not yet croned)

### What It Syncs

| SF Object | Target Table | Records | Filter |
|-----------|-------------|---------|--------|
| Account | SFAccount | 5,000 | Has website or Clearbit domain |
| Opportunity | SFOpportunity | 3,031 | Created ≥ 2025-01-01, Amount > 0 |
| Campaign | SFCampaign | 492 | Has opportunities |

---

## ABM ↔ SF Linking

**Script:** `scripts/sf_link_and_classify.py`

Links ABMAccount to SFAccount by matching `ABMAccount.domain` → `SFAccount.cleanDomain`.

### Current State

| Metric | Count |
|--------|-------|
| ABM accounts linked to SF | 122 / 2,555 (4.8%) |
| Accounts with active pipeline opps | 41 |
| Active pipeline value | $14.2M |
| Accounts with switchSignal | 260 |

### What Gets Linked

When a match is found, the following ABMAccount fields are populated from SF:

| ABMAccount Field | SF Source | Populated |
|-----------------|----------|-----------|
| `sfAccountId` | SFAccount.sfId | ✅ 122 |
| `industry` | SFAccount.industry | ✅ (merged) |
| `annualRevenue` | SFAccount.annualRevenue | ✅ 122 |
| `employeeCount` | SFAccount.employees | ✅ 122 |
| `inPipeline` | Active opp exists | ✅ 41 |
| `switchSignal` | SFOpportunity.oppSource | ✅ 260 |
| `currentProvider` | Derived from SF industry | ❌ needs logic |

---

## Pipeline Breakdown

Active opportunities (not Closed Won/Lost) on ABM-matched domains:

| Stage | Accounts | Amount |
|-------|----------|--------|
| 0: AE Qualification | 3 | $13.4M |
| 3: Testing and Negotiation | 11 | $370K |
| 2: Proposal and Quoting | 24 | $349K |
| 1: Discovery & Scoping | 3 | $29.5K |
| **Total** | **41** | **$14.2M** |

All opportunities (including closed) on ABM-matched domains:

| Stage | Count |
|-------|-------|
| Closed Won | 224 |
| Lost Business | 60 |
| Proposal and Quoting | 24 |
| Testing and Negotiation | 11 |
| AE Qualification | 3 |
| Discovery & Scoping | 3 |
| Cancelled/Terminated | 3 |
| Self Service | 2 |

---

## Attribution Loop (Not Yet Built)

**Goal:** Prove ABM pipeline impact. "Companies in our Voice API segment generated $X in SQOs."

**Query pattern:**
```sql
SELECT a."productFit", count(DISTINCT a.domain) as domains,
       count(DISTINCT o.id) as opps, sum(o.amount) as pipeline
FROM "ABMAccount" a
JOIN "SFOpportunity" o ON a.domain = o."accountDomain"
WHERE o."stageName" NOT IN ('Closed Won', 'Lost Business', 'Cancelled/Terminated', 'Self Service')
GROUP BY a."productFit"
```

**Not built yet.** Data exists, needs SQL + Hub visualization.

---

## Gaps

1. **Low match rate** — Only 122/2,555 (4.8%) ABM accounts link to SF. Most ABM accounts are from StackAdapt impressions (broad TOFU), not curated targets. SF accounts skew larger/enterprise.
2. **currentProvider missing** — Need logic to detect competitor from SF data (Twilio, Vonage, Bandwidth in tech stack or opp notes)
3. **Hub UI doesn't show SF data** — DomainSlideOut has fields for pipeline/provider/signal but they're empty. Needs to query SFAccount + SFOpportunity.
4. **SF sync not croned** — Running manually. Should run daily.
