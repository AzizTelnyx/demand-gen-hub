# ABM Lifecycle Engine — Business & Technical Design

**Date:** April 16, 2026
**Author:** Ares (with Aziz)
**Status:** Approved — Phase 1 build starting

---

## The Problem

Our ABM lists are static. We build a list, upload it to LinkedIn/StackAdapt, attach it to campaigns, and never touch it again. This creates three compounding issues:

1. **Stale audiences** — Companies change, get acquired, pivot, or go out of business. Lists from months ago still run with outdated targets.
2. **No negative management** — We're paying to show ads to ISPs, competitors, and companies that never convert. No one reviews or blocks them.
3. **Small audience sizes** — Most campaigns target the same small lists for months. As the DG ramp scales from $180K to $650K/month, these audiences are too small to absorb the spend.

Meanwhile, ElevenLabs and competitors are running dynamic, ever-expanding ABM programs that auto-refresh and auto-expand.

## The Solution: ABM Lifecycle Engine

A system of agents that treat ABM lists as **living assets** with a full lifecycle: build → deploy → monitor → optimize → refresh → expand.

**The database is the source of truth.** Every platform audience is a projection of what's in the DB. Agents work the DB; sync pushes to platforms.

---

## Current State

### What We Have on Each Platform

| | LinkedIn | StackAdapt | Google Ads | Reddit |
|---|---|---|---|---|
| **ABM approach** | Company list segments (COMPANY type DMP segments) | Domain-based ABM audiences | Customer Match (email lists) | Email-based custom audiences |
| **Current lists** | 262 DMP segments (2 company lists, 48+ intent/behavioral vectors, 19 campaigns with 54 unique segments) | 50+ custom segments | 245 user lists (95 active) | 26 campaigns, minimal ABM |
| **API access** | Near-full: create segments, read sizes, attach/detach to campaigns, archive. **One gap: can't upload domains into segments via API (UI only).** | **Full CRUD: create, update, delete ABM audiences, upload domains directly, attach to campaigns, read engagement.** | Full: Customer Match upload, attach to campaigns, read sizes | Low priority for ABM |
| **Dynamic segments** | Some segments synced from Hockeystack/Salesforce (read-only for us) | N/A | N/A | N/A |
| **Domain data** | Campaign-level only (no per-domain engagement) | ✅ B2B domain-level impressions & engagement | Campaign-level only | N/A |

### What's NOT in the DG Hub

- The 262 LinkedIn DMP segments (names, sizes, which campaigns they're on) — not synced
- Hockeystack/Salesforce-managed dynamic segments — not tracked
- Audience size trends over time — not tracked
- Which segments overlap across campaigns — not analyzed

---

## Architecture

### New DB Tables

```
ABMListRule
├── id, name, description
├── verticals (JSON array)
├── regions (JSON array)
├── companySizeMin, companySizeMax
├── productFit (JSON array — voice-api, ai-agent, sip-trunk, etc.)
├── excludeVerticals (JSON array — telecom, ISP, CPaaS, etc.)
├── excludeCompetitors (boolean)
├── targetAudienceSize (integer — per-platform target)
├── status, createdBy, createdAt, updatedAt

ABMListHealth
├── id, listId, platform
├── audienceSize (integer)
├── previousSize (integer)
├── growthRate (float)
├── engagementRate (float)
├── stalenessScore (0-100)
├── lastSyncAt, lastExpandedAt, lastPrunedAt
├── flags (JSON — ["undersized", "stale", "no_engagement"])
├── createdAt, updatedAt

ABMAccountEngagement
├── id, accountId, campaignId, platform
├── impressions, clicks, conversions, cost
├── dateFrom, dateTo
├── lastSeenAt
```

`ABMListRule` is the key unlock. Instead of manually adding companies, you define rules like:

```yaml
name: APAC Voice AI Buyers
verticals: [technology, healthcare, fintech, travel]
regions: [APAC]
companySize: 50-5000
productFit: [voice-api, ai-agent]
exclude:
  verticals: [telecom, isp, cpaas, ucaas]
  competitors: true
targetAudienceSize: 5000
```

The Expander keeps adding until the target is hit. The Pruner removes dead weight. The Auditor flags when audience drops below thresholds.

### Segment Ownership Model

Not all segments are ours to manage. Some come from other systems:

| Source | Read | Write | Notes |
|--------|------|-------|-------|
| **Ares-built** (research agent) | ✅ | ✅ | Full lifecycle management |
| **Hockeystack-synced** | ✅ | ❌ | Dynamic segments from HS — read sizes & campaign associations only |
| **Salesforce-synced** | ✅ | ❌ | SF campaign member lists — read-only |
| **LinkedIn native** (intent vectors, lookalikes) | ✅ | ❌ | LinkedIn's built-in segments — we attach/detach but don't modify |
| **Third-party** (Bombora, 123Push, etc.) | ✅ | ❌ | Pre-built intent segments on StackAdapt/LinkedIn |

The Auditor monitors ALL segments. The Expander/Pruner only touch Ares-built ones.

---

## Agents

### 1. ABM Auditor (Weekly — Monday 6 AM)

**What it does:** Scans all ABM lists across platforms and produces a health scorecard.

**Checks per list:**
- Audience size vs. platform minimums (LinkedIn: 300, StackAdapt: 500)
- Size trend (growing, stable, shrinking)
- Engagement rate (impressions per account)
- Staleness (days since last add/remove)
- Overlap with other lists (duplicate accounts wasting reach)
- Campaign attachment (orphaned lists not on any campaign)

**Output:** Health scorecard to #agent-activity, flags for human review.

### 2. ABM Expander (Weekly — Tuesday 5 AM)

**What it does:** For lists below target size, generates new candidate companies.

**How it works:**
1. Reads ABMListRule for the list's ICP criteria
2. Uses AI research (Gemini/GPT) to find matching companies
3. Enriches via Clearbit (verify HQ, industry, size)
4. Cross-checks Salesforce (already in pipeline? existing customer?)
5. Applies exclusion filters (competitors, ISPs, etc.)
6. Queues additions for approval (or auto-adds if confidence ≥80%)

**Platform sync:**
- **StackAdapt:** Direct domain upload via API ✅
- **LinkedIn:** Adds domains to list via Campaign Manager (manual) OR API if we find the upload endpoint ⚠️
- **Google Ads:** Converts domains → emails via Clearbit → Customer Match upload ✅

### 3. ABM Pruner (Biweekly — Sunday 5 AM)

**What it does:** Finds dead-weight accounts and suggests removals.

**Criteria for pruning:**
- 90+ days in a list with zero engagement (no impressions, clicks, conversions)
- Not in Salesforce pipeline (no active opportunity)
- Not in Hockeystack active audience
- Company dissolved/acquired (Clearbit check)

**Safeguards:**
- Never removes from Hockeystack/SF-managed segments
- Never removes accounts with active SF opportunities
- All removals queued for approval (not auto-executed)

### 4. ABM Sync (Daily — 6 AM)

**What it does:** Pushes DB state to all platforms and reads platform state back.

**LinkedIn:**
- Read: All 262 DMP segments (sizes, status, campaign attachments)
- Write: Attach/detach segments to campaigns (targetingCriteria patch)
- Write: Create new empty COMPANY segments
- ⚠️ Populate: Domain upload requires Campaign Manager UI (one-time per new segment)
- Backfill: Sync all 262 segments + campaign associations to DB on first run

**StackAdapt:**
- Read: All custom segments (sizes, status)
- Write: Create/update ABM audiences with domain lists
- Write: Attach/detach audiences to campaigns
- Write: Full domain upload via API ✅

**Google Ads:**
- Read: All user lists (sizes)
- Write: Customer Match upload (domains → emails → list)
- Write: Attach/detach to campaigns

**Reddit:**
- Read-only for now

### 5. ABM Negative Builder (Monthly — 1st Sunday)

**What it does:** Analyzes spend waste and builds exclusion lists.

**Sources:**
- StackAdapt B2B domain data: domains with high impressions but zero conversions
- LinkedIn: Industry/job title patterns in non-converting audiences
- Salesforce: Closed-lost accounts that keep seeing ads
- Competitor domains from knowledge base

**Output:** Platform-specific exclusion lists, queued for approval.

### 6. ABM Segment Engine (On-demand)

**What it does:** Splits broad lists into focused sub-lists for specific campaigns.

**Use case:** A list of 5,000 APAC companies is too broad for a "Voice AI for Healthcare" campaign. The Segment Engine slices it into:
- APAC Healthcare Voice AI (500 companies)
- APAC Fintech Voice AI (300 companies)
- APAC SaaS Voice AI (200 companies)

Each sub-list gets its own campaign with tailored messaging.

---

## LinkedIn: The Missing Upload Piece

### Current State

We can create an empty COMPANY segment via API (`POST /v2/dmpSegments` → 201 Created). But we cannot programmatically upload a list of company domains into it. The upload endpoint patterns we've tried (`/uploads`, `/actions`, `/batch`) all return 404.

### What This Means in Practice

When the Expander finds 57 new APAC companies to add:

| Step | Method | Automated? |
|------|--------|------------|
| 1. Create "APAC Expansion R2" segment | API (`POST /dmpSegments`) | ✅ |
| 2. Populate it with 57 domains | **Campaign Manager UI** | ❌ Manual |
| 3. Attach segment to campaigns | API (`PATCH targetingCriteria`) | ✅ |
| 4. Monitor audience size | API (`GET /dmpSegments`) | ✅ |
| 5. Archive when done | API (`PATCH status=ARCHIVED`) | ✅ |

Step 2 is the only manual step. It takes ~2 minutes per new segment.

### Paths to Full Automation

1. **Find the upload endpoint** — LinkedIn's internal tools (Hockeystack, etc.) must use one. Could be an undocumented REST endpoint or a batch API pattern we haven't tried. Investigating.
2. **LinkedIn Audience Management API** — A separate API product that may include the upload capability. Requires applying for access (similar to how we got Advertising API).
3. **Hockeystack integration** — If Hockeystack is already syncing segments to LinkedIn, we could push our domain lists TO Hockeystack and let it handle the LinkedIn upload. Would need Hockeystack API access.
4. **Browser automation** — Last resort. Automate the Campaign Manager UI upload via browser control. Fragile but would work.

### Recommendation

Pursue options 1 and 3 in parallel. Option 2 (new API product) is a longer timeline (weeks for approval). Option 4 is the fallback.

---

## LinkedIn Backfill: First-Run Sync

On first run, the ABM Sync agent will:

1. **Read all 262 DMP segments** → `GET /v2/dmpSegments?q=account`
2. For each segment, record: name, type, audience size, status, destination segment URN
3. **Read all active campaign targeting** → identify which segments are on which campaigns
4. Write to DB with `source: linkedin_native` or `source: hockeystack` (based on name pattern)
5. Flag segments not yet in DB as "discovered" — Auditor will triage them

This gives us immediate visibility into what's actually running on LinkedIn.

---

## Community Management API Request

**Separate from ABM management.** This is for the attribution fix — resolving `li_org:XXXXXXX` URNs to company names and websites.

**Status:** Need to submit support request to LinkedIn.

**Form fields:**

| Field | Value |
|-------|-------|
| What is this about? | Technical Issue |
| Inquiry Topic | Community Management |
| Urgency | High |
| Application Client ID | 86hy8fnr3lz69z |
| Subject | Access to Community Management API for Organization Lookup — Advertising Account Attribution |

**Description:**

> We use the LinkedIn Marketing/Advertising API to run and measure ad campaigns for our business (Telnyx). We need access to the Organization Lookup API to resolve organization URNs into company names and website URLs.
>
> **The problem:**
> When we pull impression data from the LinkedIn Ads API, organizations are returned as URNs in the format `li_org:XXXXXXX`. We have no way to resolve these URNs to identify which companies they represent. Currently, 97.2% of our LinkedIn impression data (743,101 out of 764,570 impressions) cannot be identified because they arrive as `li_org:` URNs instead of resolvable company domains.
>
> **What we need:**
> The ability to call an Organization Lookup endpoint (e.g., `GET /v2/organizations/{id}`) that, given an organization URN, returns the company name and website URL. We need read-only access to organization metadata only — we do not need any content posting, page management, or community interaction capabilities.
>
> **Why this matters:**
> Without being able to resolve `li_org:` URNs to company names and websites, we cannot match our LinkedIn ad impressions to accounts in our CRM (Salesforce). This means we cannot attribute pipeline revenue or measure ROI on our LinkedIn ad spend ($30K/month, ~$580K in pipeline currently unattributed).
>
> **Current setup:**
> - Active Advertising API app (Client ID: 86hy8fnr3lz69z)
> - Scopes: r_ads, r_ads_reporting, r_organization_social, r_organization, rw_ads
> - Ad account ID: 505973078
>
> If a separate application is required for Community Management API access, we're happy to create one — just need guidance on the approval process.

---

## Build Phases

### Phase 1 — This Week: Visibility + Foundation
- [ ] New tables: ABMListRule, ABMListHealth, ABMAccountEngagement
- [ ] ABM Sync agent (daily): LinkedIn backfill + StackAdapt sync + ongoing reads
- [ ] ABM Auditor agent (weekly): Health scorecard across all platforms
- [ ] First-run: Backfill all 262 LinkedIn segments to DB

**Outcome:** For the first time, we can SEE what audiences are running, their sizes, which campaigns they're on, and what's stale.

### Phase 2 — Next Week: Expand + Prune + Rules
- [ ] ABM Expander agent: AI research + Clearbit enrichment + SF cross-check
- [ ] ABM Pruner agent: Dead-weight detection + approval queue
- [ ] ABMListRule table: Rule-based list definition
- [ ] StackAdapt ABM connector: Full CRUD with domain upload

**Outcome:** Lists auto-expand when undersized, auto-clean when stale. StackAdapt is fully automated.

### Phase 3 — Week 3: Negatives + Segments
- [ ] ABM Negative Builder: Systematic exclusion management
- [ ] ABM Segment Engine: Smart list splitting for campaign-specific audiences
- [ ] LinkedIn upload automation (pursue API/HS/browser path)
- [ ] Google Ads Customer Match connector

**Outcome:** Full lifecycle automation across LinkedIn + StackAdapt + Google Ads.

### Scaling with the DG Ramp

| Month | Budget | ABM Milestone |
|-------|--------|--------------|
| April | $180K | Audit + clean existing lists, backfill LinkedIn segments |
| May | $273K | Expand APAC + EMEA lists to target sizes via Expander |
| June | $450K | Launch AMER enterprise trust segments, split vertical lists |
| July | $510K | Full negative management, LATAM list build |
| August | $650K | Cross-product audience overlap detection, full automation |
