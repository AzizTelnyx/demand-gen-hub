# ABM Lifecycle Engine — v2 Design (Reality-Checked)

**Date:** April 17, 2026
**Author:** Ares + Aziz
**Status:** Approved — build starting
**Supersedes:** `abm-lifecycle-engine.md` (v1, Apr 16)

---

## Why v2

v1 had the right architecture but made assumptions about data availability that don't hold. This version is built on tested APIs, real data, and honest assessment of what each data source can and can't do.

Key changes from v1:
- **Relevance scoring redesigned** — Clearbit tags alone can't distinguish "healthcare SaaS" from "healthcare insurance." Description text analysis + AI research carry the weight.
- **AI research is the core intelligence layer**, not a nice-to-have. Without it, we're matching industry labels, not use cases.
- **StackAdapt connector methods need building** — `createAbmAudience`, `createAbmAudienceWithDomainsList`, `updateAbmAudienceWithDomainsList` are documented in the API audit but not implemented in `stackadapt.py`.
- **Google Ads Customer Match deferred** — zero code exists, email matching rates are 30-50%, not worth building until LI + SA are fully automated.
- **Campaign-centric model** — the segment doesn't exist in isolation. It's attached to a campaign with a specific product, variant, and intent stage. That context drives everything.

---

## The Problem

Our ABM lists are static. We build a list, upload it, attach it to campaigns, and never touch it again. This creates three issues:

1. **Wrong companies on campaigns** — We're showing "Build AI Voice Agents" ads to vacation rental companies, health insurers, and medical supply manufacturers. They're in "Healthcare" but they don't buy voice AI software.
2. **No lifecycle management** — Lists don't grow, shrink, or adapt as campaigns evolve and companies change.
3. **No visibility** — We can't see which segments are on which campaigns, how they're performing, or whether the audience is actually relevant.

**Real example from production data:**

The "TOFU AI Agent Healthcare" campaign on StackAdapt reaches 12 top domains. Clearbit tags put all 12 in "Health Care." But only 3 are actual voice AI buyers:

| Domain | Clearbit Tags | What they actually do | Voice AI buyer? |
|--------|--------------|----------------------|-----------------|
| artera.io | Health Care, VOIP | SaaS patient communication platform | ✅ YES |
| patientpoint.com | Computing Infrastructure | Patient engagement platform | ✅ YES |
| hicuityhealth.com | Health Care | Telemedicine solutions | ✅ YES |
| solutionreach.com | IT & Services, Medical Care | Cloud-based patient relationship mgmt | ⚠️ MAYBE |
| mahec.net | Health Care | Rural health education center | ❌ NO |
| capsahealthcare.com | Manufacturing, Medical Supplies | Medical storage carts | ❌ NO |
| mdwise.org | Health Insurance | Health insurance company | ❌ NO |
| swoop.com | Pharmaceuticals | Pharma marketing company | ❌ NO |
| allhealthnetwork.org | Mental Health | Nonprofit mental health org | ❌ NO |
| healthjoy.com | Health Insurance | Health insurance platform | ❌ NO |
| wellframe.com | Health | Digital care management | ❌ NO |
| northstarnetwork.org | Consulting | Administrative consulting | ❌ NO |

**Industry tags say all 12 match. Reality says 75% are waste.** This is the core problem the engine solves.

---

## Current State — What's Real

### Data we have

| Source | What it gives us | Quality | Gaps |
|--------|-----------------|---------|------|
| **Clearbit Company API** | Company name, domain, tags (industry labels), tech (web infra like AWS, GA), employees, revenue, description | Tags are broad. Tech is web stack, not product stack. Description is inconsistent — sometimes great, sometimes empty. | `industry` and `sector` fields always return None. No hiring data. No "uses Twilio Voice" signal. |
| **StackAdapt B2B domain report** | Per-domain impressions, clicks, cost, conversions per campaign | Rich — 17,854 domain-level records. Named companies, not URNs. | Only StackAdapt. LinkedIn gives `li_org:` (useless) or 162 resolvable domains. Google = `__campaign__` only. |
| **LinkedIn API** | DMP segments (262), campaign targeting, segment sizes, attach/detach | Working. Token valid until June 6, 2026. | Can't upload domains into COMPANY segments. 12,482 `li_org:` domains are unresolvable. |
| **StackAdapt API** | Campaigns, segments, domain exclusions, B2B reports | Read works well. | Connector missing: `createAbmAudience`, `updateAbmAudienceWithDomainsList`, `attachAudienceToCampaign`. Only read + exclude_domains exist. |
| **Salesforce CLI** | Accounts with website + industry. Opportunities with stage + amount. | Connected to telnyx-prod. Can query by website to match domains. | No `Product_Family__c` on Opportunity — can't filter by product line. Must use Name/Account fields. |
| **Google Ads API** | Campaigns, keywords, audiences. Customer Match available in theory. | Read works. | Zero code for Customer Match. No domain-level data. Would need email lists — low match rate. Deferred. |
| **Campaign parsing** | `parsedProduct`, `parsedVariant`, `parsedIntent` on Campaign table | 88 active campaigns parsed. | Some campaigns have empty parsedProduct (brand campaigns). Parsing is best-effort. |

### DB tables that exist

| Table | Row count | Status |
|-------|-----------|--------|
| ABMList | 465 | Synced from LI (210 native, 40 HS, 10 vector) + SA (170) + research-agent (22) + manual (8) + SF (1) |
| ABMAccount | 2,627 | Partially enriched — has company, domain, vertical, region, productFit. Missing Clearbit data for most. |
| ABMListMember | 3,037 | Accounts linked to lists |
| ABMListHealth | 434 | Segment sizes per platform. 128 archived LI, 102 undersized LI, 78 undersized SA. |
| ABMListRule | 0 | **Empty.** No ICP criteria defined yet. |
| ABMAccountEngagement | 0 | **Empty.** No per-account engagement data. |
| ABMExclusion | (exists) | Not yet used |
| ABMJob | (exists) | Not yet used |
| Campaign | 88 active | Has parsedProduct/Variant/Intent |
| CampaignAudience | ~5,000 | Segments per campaign — has audienceType, name, value |
| AdImpression | ~52,000 | StackAdapt: 17,854 domain rows. LinkedIn: 31,986 (mostly li_org:). Google: 177 (campaign-level). Reddit: 22. |

### API credentials — what works right now

| Service | Credential | Status |
|---------|-----------|--------|
| Clearbit | API key in `enrich_abm_clearbit.py` | ✅ Live. Tested Apr 17. Returns tags, tech, employees, revenue, description. |
| LinkedIn Ads | `~/.config/linkedin-ads/credentials.json` | ✅ Token valid until June 6, 2026. Can read segments, patch targeting, create COMPANY segments. |
| StackAdapt | `~/.config/stackadapt/credentials.json` | ✅ Read works. Write methods need to be built in connector. |
| Google Ads | `~/.config/google-ads/credentials.json` | ✅ Read works. Customer Match not built. |
| Salesforce | `sf` CLI connected to telnyx-prod | ✅ Can query accounts + opportunities by website. |

---

## Architecture — Campaign-Centric

**The segment doesn't exist in isolation.** It exists because a campaign targets it. The campaign has a product, a variant, an intent stage. That context determines whether a company belongs on that segment.

The same `urn:li:adSegment:60666064` on a Healthcare campaign = relevant. On a SIP Trunking campaign = probably wrong audience.

**The relationship is the unit, not the segment.**

---

### Data Model

#### New table: `ABMCampaignSegment`

The campaign-centric joined view. One row = one segment attached to one active campaign, with its performance and health.

```sql
CREATE TABLE "ABMCampaignSegment" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "campaignId"    text NOT NULL REFERENCES "Campaign"(id) ON DELETE CASCADE,
  "campaignName"  text NOT NULL,
  "campaignStatus" text NOT NULL,        -- enabled | paused | live | ended
  "campaignBudget" double precision,
  platform        text NOT NULL,           -- linkedin | stackadapt | google_ads
  "parsedProduct" text,                    -- from Campaign
  "parsedVariant" text,                    -- from Campaign
  "parsedIntent"  text,                    -- TOFU | MOFU | BOFU | UPSELL

  "segmentId"     text NOT NULL,           -- platform's segment/adSegment URN
  "segmentName"   text,
  "segmentType"   text,                    -- company_list | abm_audience | customer_match | intent_vector | matched_audience
  "segmentSize"   integer,
  "segmentSource" text,                    -- ares-built | hockeystack | salesforce | linkedin_native | third_party
  "segmentWritable" boolean DEFAULT false, -- can we add/remove companies?

  -- Performance (last 30 days)
  "impressions30d"  integer DEFAULT 0,
  "clicks30d"       integer DEFAULT 0,
  "spend30d"        double precision DEFAULT 0,
  "conversions30d"  integer DEFAULT 0,
  "ctr30d"          real,                  -- computed: clicks/impressions
  "cpc30d"          real,                  -- computed: spend/clicks
  "cpm30d"          real,                  -- computed: spend/impressions * 1000

  -- Health
  "healthFlags"     jsonb DEFAULT '[]'::jsonb,  -- ["undersized","zero_impressions","low_ctr","stale","overlapping"]

  -- Sync
  "lastSyncedAt"    timestamp,
  "createdAt"       timestamp DEFAULT now(),
  "updatedAt"       timestamp DEFAULT now(),

  UNIQUE ("campaignId", "segmentId", platform)
);
```

#### Enriched `ABMAccount` — add Clearbit columns

```sql
ALTER TABLE "ABMAccount" ADD COLUMN IF NOT EXISTS
  "industry"          text,                -- Clearbit tags[0] (most specific industry label)
ALTER TABLE "ABMAccount" ADD COLUMN IF NOT EXISTS
  "clearbitTags"      jsonb DEFAULT '[]'::jsonb,  -- Full Clearbit tags array
ALTER TABLE "ABMAccount" ADD COLUMN IF NOT EXISTS
  "clearbitTech"      jsonb DEFAULT '[]'::jsonb,  -- Web tech stack (limited utility for product inference)
ALTER TABLE "ABMAccount" ADD COLUMN IF NOT EXISTS
  "clearbitDesc"      text,                -- Company description — the best signal for use-case matching
ALTER TABLE "ABMAccount" ADD COLUMN IF NOT EXISTS
  "employeeCount"     integer,             -- From Clearbit (exact number, not range string)
ALTER TABLE "ABMAccount" ADD COLUMN IF NOT EXISTS
  "annualRevenue"     text,                -- Clearbit estimatedAnnualRevenue range
ALTER TABLE "ABMAccount" ADD COLUMN IF NOT EXISTS
  "lastEnrichedAt"    timestamp,
ALTER TABLE "ABMAccount" ADD COLUMN IF NOT EXISTS
  "enrichmentSource"  text DEFAULT 'clearbit';
```

#### Enhanced `ABMListRule` — add use-case fields

The existing `ABMListRule` table already has `verticals`, `regions`, `companySizeMin/Max`, `productFit`, `excludeVerticals`, `excludeCompetitors`. Need to add:

```sql
ALTER TABLE "ABMListRule" ADD COLUMN IF NOT EXISTS
  "useCaseKeywords"    jsonb DEFAULT '[]'::jsonb,  -- What the Expander searches for: ["voice bot","virtual assistant","automated calling"]
ALTER TABLE "ABMListRule" ADD COLUMN IF NOT EXISTS
  "competitorNames"    jsonb DEFAULT '[]'::jsonb,  -- For competitive variants: ["elevenlabs","vapi","bland_ai"]
ALTER TABLE "ABMListRule" ADD COLUMN IF NOT EXISTS
  "descriptionKeywords" jsonb DEFAULT '[]'::jsonb; -- Words to look for in Clearbit description: ["communication","SaaS","platform","telemedicine"]
```

#### Enhanced `ABMExclusion` — add scoping

```sql
ALTER TABLE "ABMExclusion" ADD COLUMN IF NOT EXISTS
  "exclusionType"    text,                -- domain | industry | vertical | company_size
ALTER TABLE "ABMAccount" ADD COLUMN IF NOT EXISTS
  "scope"            jsonb DEFAULT '["*"]'::jsonb,  -- Which campaign products this applies to: ["ai_agent"] or ["*"] for global
ALTER TABLE "ABMExclusion" ADD COLUMN IF NOT EXISTS
  "reason"           text,                -- competitor | irrelevant_vertical | closed_lost | too_small | no_use_case
ALTER TABLE "ABMExclusion" ADD COLUMN IF NOT EXISTS
  "evidence"         jsonb;               -- {"impressions":10000,"clicks":0,"industry":"broadcast_media"}
```

---

### Relevance Engine

The brain that connects company profiles to campaign intent. Every agent queries it.

**What we learned from testing:** Clearbit tags alone can't distinguish a healthcare SaaS company from a health insurance company. Both are "Health Care." The `description` field is the strongest signal — when it exists. AI research fills the gap for companies with no useful description.

**Scoring model (revised):**

```
Input: ABMAccount (enriched with Clearbit) + Campaign context (parsedProduct, parsedVariant)
Output: relevance score 0-1 + reasoning

1. Industry match (30% weight)
   - Clearbit tags contain a target industry for this campaign's product?
     E.g., "AI Agent Healthcare" campaign → tags include "Health Care" → match
   - This is the BROAD filter. It catches obvious mismatches (travel companies on healthcare campaigns)
   - But it can't separate "healthcare SaaS" from "healthcare insurance"

2. Description / use-case match (40% weight) — THE CORE SIGNAL
   - Scan Clearbit description for keywords related to the campaign's product:
     "AI Agent" campaigns → look for "AI", "automation", "agent", "voice", "chatbot", "SaaS", "platform"
     "Voice API" campaigns → look for "communication", "calling", "telephony", "voice", "VOIP"
   - If description is missing or too short → this score is NULL → defer to AI research
   - Keywords come from ABMListRule.descriptionKeywords + hardcoded product-keyword mapping

3. Company type signal (15% weight)
   - Clearbit tags suggest they BUILD software? ("Information Technology", "Software", "SaaS")
   - Or are they a CONSUMER of software? ("Health Care", "Insurance", "Manufacturing")
   - SaaS/platform companies are more likely to build with APIs → higher score
   - Non-software companies can still be buyers (hospitals buying voice AI) but need stronger description match

4. Size + stage fit (15% weight)
   - Employee count from Clearbit
   - Matches ABMListRule companySizeMin/Max? → pass
   - Too small for enterprise campaign? → penalize
   - Revenue suggests they can afford our product? → boost

Final score:
  > 0.7 = strong fit (auto-include in Expander)
  0.4-0.7 = moderate (queue for human review)
  < 0.4 = weak (skip in Expander, flag in Pruner)
  < 0.2 = irrelevant (candidate for Negative Builder)

IMPORTANT: If description is missing or ambiguous, the score is unreliable.
Flag for AI research rather than making a wrong call.
```

**What happens when Clearbit isn't enough:**

For domains where:
- Clearbit returns no data (HTTP 202 = pending, or domain not found)
- Description is empty/generic
- Tags are ambiguous (broad "Health Care" without distinguishing SaaS vs. insurance)

→ Defer to **AI research step**: web search for the company + product use case. The LLM reads the company's website / about page and determines if they're a voice AI buyer.

This is slower (1-2 seconds per company vs. Clearbit's instant) but accurate. Use it as a fallback, not first pass.

---

### Sync — Campaign-Centric (Rebuilt)

**Current sync:** Dumps all segments from LinkedIn/StackAdapt into flat tables. 434 health records, 128 archived ghosts, no performance data.

**New sync — campaign-centric:**

```
Daily run:

1. Pull ACTIVE campaigns from each platform
   - LinkedIn: GET campaigns where status=ACTIVE
   - StackAdapt: GET campaigns where status=live
   - Google Ads: GET campaigns where status=enabled
   Skip paused/ended/archived.

2. For each active campaign:
   a. Pull targeting → which segments/audiences are attached
      - LinkedIn: parse targetingCriteria from campaign → extract adSegment URNs
      - StackAdapt: parse campaign targeting → extract audience IDs
      - Google Ads: parse CampaignCriterion → extract user list IDs
   b. Pull performance → impressions, clicks, spend, conversions (30 days)
      - LinkedIn: campaign-level (no per-segment breakdown available)
      - StackAdapt: campaign-level + B2B domain-level breakdown
      - Google Ads: campaign-level only
   c. Pull segment sizes → audience count for each segment
      - LinkedIn: GET /dmpSegments → audienceSize per segment
      - StackAdapt: GraphQL customSegments → size per segment
      - Google Ads: user list size
   d. Upsert into ABMCampaignSegment

3. For StackAdapt campaigns with domain-level data:
   a. Pull B2B domain report → which companies saw/clicked
   b. For each domain:
      - Fetch/refresh Clearbit enrichment (if not enriched in last 30 days)
      - Run relevance score against campaign context
      - Upsert into ABMAccount (enriched) + ABMAccountEngagement
   c. Rate limit: max 600 Clearbit calls/min, batch domains

4. For LinkedIn campaigns:
   a. Resolvable domains (162 total) → enrich + relevance score
   b. li_org: domains (12,482) → skip (can't identify)
   c. Pull abm_segment/matched_audience associations → upsert to ABMCampaignSegment

5. For Google Ads campaigns:
   a. Campaign-level only → upsert to ABMCampaignSegment with __campaign__ placeholder
   b. No domain-level data available

6. Health flag computation:
   - undersized: segmentSize < platform minimum (LI: 300, SA: 500)
                OR segmentSize < budget-appropriate threshold (roughly: spend > $5K/mo but segment < 1000)
   - zero_impressions: impressions30d = 0 despite active campaign + non-zero budget
   - low_ctr: ctr30d < half of platform average (LI: <0.26%, SA: <0.5%, GA: <3.2%)
   - stale: segment size unchanged for 30+ days
   - overlapping: same segmentId on 3+ active campaigns

7. Archive logic:
   - Campaign goes inactive → mark ABMCampaignSegment.campaignStatus = 'inactive'
   - Keep row (history), stop surfacing on dashboard
   - Only show active campaign-segment pairs by default

8. ABMListHealth update:
   - Keep existing table in sync (backward compatibility for lifecycle agents)
   - Write health flags from ABMCampaignSegment analysis
```

**First run output:** Not 434 ghost records. Active campaigns only. Each with: what segment it's using, how that segment is performing, whether the audience size is sufficient, and health flags. Plus domain-level enrichment for all StackAdapt domains.

---

## The Agents

### 1. ABM Auditor (Weekly — Monday 6 AM)

**What it does:** Produces a health scorecard. The visibility layer.

**Inputs:**
- `ABMCampaignSegment` — all active campaign-segment pairs with performance + health flags
- `ABMAccount` (enriched) — for relevance scoring of domains with engagement data
- `AdImpression` — domain-level performance for waste detection

**Analysis — four sections:**

```
1. SEGMENT HEALTH SUMMARY
   "47 active ABM segments across 3 platforms.
    6 undersized. 3 zero delivery. 8 low CTR.
    12 segments overlap between LinkedIn and StackAdapt.
    Estimated $X/month in wasted spend on irrelevant domains."

2. PER-SEGMENT REPORT
   For each ABMCampaignSegment row:
   - Campaign: "202510 TOFU AI Agent Healthcare VA GLOBAL"
   - Segment: urn:li:adSegment:60666064 (size: 45,000)
   - Performance: 40K imp, 222 clicks, CTR 0.55%, $X spend, 2 conv
   - Health: [overlapping — on 8 campaigns]
   - Recommendation: "Consider splitting — broad segment on 8 campaigns with different variants"

3. WASTE DETECTION (domain-level, StackAdapt only)
   Domains with high impressions + low relevance:
   - vacasa.com: 25K imp, relevance 0.12, $195 spend → WASTE
   - angi.com: 21K imp, relevance 0.08, $165 spend → WASTE
   - hertz.com: 9.7K imp, relevance 0.05, $75 spend → WASTE
   Total identified waste: $X/month

4. UNDERSIZED SEGMENT ALERT
   Segments that can't absorb budget:
   - "APAC Voice AI" on StackAdapt: 320 accounts, needs 2,000
   - "EMEA Contact Center" on LinkedIn: 150 accounts, needs 300
   - These should be Expander's priority this week
```

**Output:** Posted to DG Hub Agent Activity topic (thread 164). Actionable, not informational.

**Build effort:** 2-3 hrs. Reads existing tables. No API calls needed (sync already populated the data). Just SQL queries + LLM analysis + Telegram post.

---

### 2. ABM Expander (Weekly — Tuesday 5 AM)

**What it does:** Grows undersized lists with companies that have a USE CASE for the specific campaign.

**The core insight:** The Expander doesn't find "healthcare companies." It finds "healthcare companies building voice AI solutions." The ABMListRule defines the ICP. The campaign context defines the use case. AI research does the heavy lifting. Clearbit validates firmographics.

**Prerequisite:** ABMListRule must be populated with useCaseKeywords and descriptionKeywords. Without rules, the Expander is blind.

**Flow:**

```
1. Find undersized lists
   - ABMCampaignSegment where healthFlags contains "undersized"
   - OR ABMListRule.targetAudienceSize > current segment size

2. For each undersized list:
   a. Read campaign context
      - parsedProduct: "AI Agent"
      - parsedVariant: "Healthcare"
      - parsedIntent: "TOFU" (broad match) or "BOFU" (narrow match)

   b. Read ABMListRule
      - Base: verticals, regions, companySizeMin/Max, exclusions
      - useCaseKeywords: what to search for
      - descriptionKeywords: what to look for in Clearbit descriptions
      - competitorNames: for competitive variants

   c. AI RESEARCH (the intelligence core)
      Construct a research query from campaign context + rule:
      
      "Find companies in [regions] in [verticals] vertical that are
       building or deploying voice AI agents, virtual assistants, or
       automated calling solutions. Focus on companies with 50-5000
       employees. Exclude telecom providers, ISPs, CPaaS platforms,
       and companies that are purely healthcare providers (hospitals,
       clinics, insurance) without a software/AI product."
      
      Returns: company names + domains + brief description of their use case

   d. Enrich candidates via Clearbit
      For each candidate domain:
      - Verify: industry tags, employee count, HQ country
      - Check description for descriptionKeywords
      - Confirm they're not in an excluded vertical
      - Note: Clearbit can't verify "uses voice AI" — that's the AI research step's job

   e. Cross-check Salesforce
      sf data query by domain:
      - Already a customer? → skip (or add to upsell list)
      - Open opportunity? → skip (sales is handling it)
      - Closed-lost? → skip (they said no)
      - Not in SF? → net-new (best candidate)

   f. Cross-check existing ABMAccount
      - Already in this list? → skip
      - Already in another list? → note (may want to add to this list too)
      - Net-new → insert ABMAccount + ABMListMember

   g. Relevance score
      Score each candidate against the campaign context.
      - > 0.7: auto-add (high confidence)
      - 0.4-0.7: queue for review (post to Agent Activity with context)
      - < 0.4: skip (AI research was wrong or Clearbit contradicts)

   h. Execute additions
      - StackAdapt: API domain upload (once connector methods are built)
      - LinkedIn: Flag for manual upload (create segment, add to staging list in DB)
      - DB: Insert ABMAccount + ABMListMember with addedBy="expander", reason, relevanceScore
```

**What makes this smart (and honest about limitations):**

- AI research finds use cases, not just industries. This is the real intelligence layer.
- Clearbit validates firmographics (size, location, industry). It's a filter, not a discovery tool.
- Salesforce cross-check prevents targeting companies already in the pipeline.
- Relevance scoring uses description text (strongest Clearbit signal) + tags (broad filter) + size (fit check).
- When Clearbit description is missing → flag for manual review rather than guessing.

**Build effort:** 3-4 hrs. Needs: AI research call (LLM + web search), Clearbit enrichment, SF query, StackAdapt write connector, relevance scoring, DB writes.

---

### 3. ABM Pruner (Biweekly — Sunday 5 AM)

**What it does:** Removes companies that no longer belong on a list.

**Two pruning reasons:**

**A. Performance decay** — company is on a list but not engaging
- 90-day zero impressions across all campaigns they're targeted on
- 90-day zero clicks despite >1000 impressions
- High frequency (>10 impressions in 30 days) with no SF pipeline movement

**B. Relevance mismatch** — company never belonged or no longer fits
- Clearbit industry tags don't match any campaign the list feeds into
- Clearbit description has no overlap with the campaign's product keywords
- Relevance score < 0.3 — they were added to a broad list but the campaigns are now specific

**Flow:**

```
1. Pull all ABMListMembers for Ares-built lists (segmentWritable = true)
   Skip Hockeystack, SF, LinkedIn native segments.

2. For each member:
   a. Check performance
      - From AdImpression: any impressions in 90 days? Any clicks?
      - From ABMAccountEngagement: engagement data (if populated)
      - Zero everything → performance decay candidate

   b. Re-score relevance
      - Refresh Clearbit if stale >30 days (rate limit: batch, max 600/min)
      - Re-run relevance against current campaign context
      - Score < 0.3 → relevance mismatch candidate

   c. Check Salesforce (safety gate)
      - Active opportunity? → KEEP regardless of performance
      - Closed-won (customer)? → KEEP (upsell potential)
      - Closed-lost recently? → strong prune candidate
      - Not in SF? → prune based on performance + relevance

   d. Generate removal recommendation
      "Remove vacasa.com from 'AI Agent APAC' list:
       90-day: 25K impressions, 5 clicks, CTR 0.02%
       Relevance: 0.12 (vacation rental, no voice AI use case)
       Not in SF pipeline
       Confidence: 95%"

3. Execute
   - ≤10 removals per list: auto-execute with logged reason
   - >10 removals per list: post to Agent Activity for approval
   - StackAdapt: Remove domain from audience via API
   - LinkedIn: Flag for manual removal
   - DB: Set ABMListMember.status = 'removed', log reason + relevance
```

**Build effort:** 2-3 hrs. Reads existing data + Clearbit refresh. No new API integrations needed.

---

### 4. ABM Negative Builder (Monthly — 1st Sunday)

**What it does:** Builds exclusion lists — companies we actively want to BLOCK from seeing our ads.

**Different from Pruner:** Pruner removes from our lists. Negative Builder blocks from campaigns entirely.

**Flow:**

```
1. Pull StackAdapt B2B domain report (richest data source)
   Domains with >1000 impressions + 0 clicks → total mismatch
   Domains with >5000 impressions + CTR < 0.1% → near-total mismatch
   Group by industry pattern (from Clearbit tags)

2. Run relevance scoring on high-impression domains
   Score < 0.2 with >5000 impressions → auto-exclude candidate
   Score 0.2-0.4 with >10000 impressions + zero conversions → review candidate

3. AI-powered pattern detection
   "These 23 domains are all in travel/hospitality:
    lufthansa.com, hertz.com, vacasa.com, bcdtravel.com, mgmresorts.com
    Combined: 80K+ impressions, $535 spend, 0 conversions
    These companies don't build software or buy voice APIs.
    Recommend: 'Travel/Hospitality Exclusion' for AI Agent campaigns"

4. Campaign-specific scoping
   A company can be excluded from AI Agent campaigns but NOT from SIP Trunking.
   ABMExclusion.scope = ["ai_agent"] or ["voice_api"] or ["*"]
   In practice: create platform-specific exclusion lists per product.
   Attach exclusion list to relevant campaigns during sync.
   This is a sync/attachment problem, not just metadata.

5. Salesforce cross-check (safety gate)
   - Active opportunity? → DO NOT exclude
   - Customer? → DO NOT exclude
   - Closed-lost? → auto-exclude

6. Competitor block list
   From knowledge base: Twilio, Vonage, Bandwidth, Plivo domains
   Employee domains: twilio.com, vonage.com, etc.
   Auto-exclude from all campaigns.

7. Output
   Platform-specific exclusion lists with evidence.
   StackAdapt: apply via exclude_domains() API.
   LinkedIn: create exclusion segment + attach to campaigns.
   Queued for approval.
```

**Build effort:** 2-3 hrs. Heavy on AI pattern detection + SQL aggregation. StackAdapt write API exists for exclusions.

---

### 5. ABM Segment Engine (On-demand — Phase 3)

**What it does:** Splits broad lists into focused sub-lists for specific campaigns.

**When:** When one segment is on 3+ campaigns with different variants. The "AI Agent" generic list on Healthcare, Fintech, Travel, and Competitive campaigns needs splitting.

**Deferred to Phase 3.** The Auditor will flag overlapping segments. The Segment Engine is the response. Not building until Phases 1-2 are proven.

---

## Hub Dashboard

### `/abm/active` — Main view

**Summary bar:**
"47 active ABM segments | 3 platforms | 6 undersized | 3 zero delivery | $X waste | 8 low-relevance audiences"

**Table:**
| Campaign | Segment | Platform | Size | Impr | CTR | Spend | Conv | Relevance | Flags |
|---|---|---|---|---|---|---|---|---|---|

**Filter tabs:** All | Undersized | Zero Impressions | Low CTR | Low Relevance | Overlapping

**Cross-platform merge:** Same segment on LI + SA → grouped row showing combined reach + split performance

**Drill-down:** Click segment → member companies with relevance scores, performance per company, enrichment data

### `/abm/waste` — Spend waste view

"Companies seeing our ads that have no reason to buy. $X/month in wasted spend."

Sorted by cost × (1 - relevanceScore). Most wasteful at top.

### `/abm/exclusions` — Exclusion management

Current exclusions, pending recommendations, campaign scoping.

---

## Build Sequence

### Phase 1 — Data Foundation (Day 1)

| Step | What | Effort | Depends on |
|------|------|--------|------------|
| 1 | Create `ABMCampaignSegment` table | 15 min | — |
| 2 | Add Clearbit columns to `ABMAccount` | 10 min | — |
| 3 | Add useCase/description columns to `ABMListRule` | 10 min | — |
| 4 | Add scoping columns to `ABMExclusion` | 10 min | — |
| 5 | Build StackAdapt connector methods: `createAbmAudience`, `createAbmAudienceWithDomainsList`, `updateAbmAudienceWithDomainsList`, `attachAudienceToCampaign` | 2 hrs | — |
| 6 | Rebuild sync script (campaign-centric) | 3 hrs | Step 1 |
| 7 | Batch Clearbit enrichment on existing StackAdapt domains in AdImpression | 1 hr | Step 2 |
| 8 | First sync run + verify | 30 min | Steps 5-7 |
| 9 | Relevance scoring function (Python) | 1 hr | Step 7 |

### Phase 2 — Visibility (Day 2)

| Step | What | Effort | Depends on |
|------|------|--------|------------|
| 10 | Hub API routes (`/api/abm/active`, `/api/abm/waste`) | 1 hr | Phase 1 |
| 11 | Hub dashboard page (`/abm/active`) | 2 hrs | Step 10 |
| 12 | ABM Auditor agent | 2-3 hrs | Phase 1 |
| 13 | Seed ABMListRules for existing research-agent lists (22 lists) | 1 hr | Step 3 |

### Phase 3 — Agents (Days 3-4)

| Step | What | Effort | Depends on |
|------|------|--------|------------|
| 14 | ABM Expander agent | 3-4 hrs | Steps 5, 9, 13 |
| 15 | ABM Pruner agent | 2-3 hrs | Step 9 |
| 16 | ABM Negative Builder agent | 2-3 hrs | Steps 4, 9 |

### Phase 4 — Later

| Step | What | Notes |
|------|------|-------|
| 17 | ABM Segment Engine | On-demand, build when needed |
| 18 | Google Ads Customer Match | Low ROI, deferred |
| 19 | LinkedIn domain upload automation | Pursue API endpoint or browser automation |
| 20 | Clearbit Prospector for hiring signals | Separate product, may not be worth cost |

---

## What We're NOT Building (and Why)

| Thing | Why not |
|-------|--------|
| **Tech stack signals from Clearbit** | Clearbit `tech` returns web infrastructure (AWS, Google Analytics, Cloudflare). It does NOT return "uses Twilio Voice API" or "uses Dialogflow." Can't infer product usage from web tech. |
| **Hiring signals** | Clearbit Company API doesn't return job postings. That's Clearbit Prospector — separate product, separate cost. |
| **Real-time relevance decay detection** | Company data doesn't change fast enough to justify live monitoring. Quarterly Clearbit refresh + re-score is sufficient. |
| **Google Ads Customer Match** | No code exists. Email match rates are 30-50%. Requires converting domains → emails. Low ROI until LI + SA are automated. |
| **LinkedIn li_org: resolution** | Blocked on Community Management API approval. 12,482 domains are invisible to us. Nothing we can build fixes this without LinkedIn's API access. |
| **Universal exclusion scoping** | Exclusions are at the campaign level, not "campaign type" level. We manage which exclusion lists attach to which campaigns during sync. It's a relationship, not a metadata field. |
| **ABM Segment Engine** | Nice-to-have. The Auditor flags overlapping segments. The Segment Engine splits them. Build when the overlap problem is real and quantified, not before. |

---

## API Reference — What Works

### Clearbit Company API
```
GET https://company.clearbit.com/v2/companies/find?domain={domain}
Authorization: Bearer sk_6a6f1e4c6f26338d6340d688ad197d48

Returns:
  name: "Stripe"
  tags: ["Information Technology & Services", "Financial Transactions", ...]  ← USE THIS for industry
  tech: ["aws_route_53", "google_apps", ...]                                  ← Web infra only, not product stack
  description: "Stripe is a technology company..."                            ← BEST signal for use-case matching
  metrics.employees: 8000
  metrics.employeesRange: "5K-10K"
  metrics.estimatedAnnualRevenue: "$10B+"

  industry: null     ← ALWAYS null, don't use
  sector: null       ← ALWAYS null, don't use

Rate limit: 600 req/min
Status: LIVE, tested April 17 2026
```

### LinkedIn Marketing API
```
Token valid until: June 6, 2026
Scopes: r_ads, r_ads_reporting, r_organization_social, r_organization, rw_ads

✅ Read all DMP segments: GET /v2/dmpSegments?q=account
✅ Create COMPANY segment: POST /v2/dmpSegments (returns 201)
✅ Patch campaign targeting: PATCH /v2/adCampaignsV2/{id}
✅ Archive segment: PATCH status=ARCHIVED
❌ Upload domains into segment: NO KNOWN ENDPOINT (UI only)
❌ Resolve li_org: URNs: BLOCKED (needs Community Management API)
```

### StackAdapt GraphQL API
```
✅ Read campaigns with groups
✅ Read custom segments with sizes
✅ Read B2B domain reports (impressions, clicks, cost per domain per campaign)
✅ Exclude domains from campaigns: exclude_domains()
❌ Create ABM audience: NOT IN CONNECTOR (documented in audit, needs building)
❌ Update ABM audience with domains: NOT IN CONNECTOR (needs building)
❌ Attach audience to campaign: NOT IN CONNECTOR (needs building)
```

### Salesforce CLI
```
Connected: telnyx-prod (marketing.squad@telnyx.com)

✅ Query accounts by website: sf data query "SELECT Id, Name, Website, Industry FROM Account WHERE Website = 'x.com'"
✅ Query opportunities by account: sf data query "SELECT Id, Account.Name, StageName, Amount FROM Opportunity WHERE Account.Website = 'x.com'"
❌ Product_Family__c doesn't exist on Opportunity
❌ Bulk matching (one domain at a time via CLI, not bulk API)
```

---

## Quick Win — Waste Audit (Do Immediately)

Before building any agents, we can run a one-time waste audit on existing StackAdapt domain data:

1. Batch-enrich all unique domains in AdImpression (StackAdapt) via Clearbit
2. Run relevance scoring against each campaign's parsedProduct
3. Sum spend on domains with relevance < 0.3
4. Report: "You're spending $X/month showing ads to companies that have no use case for your product"

This takes ~1 hour and produces an immediate, actionable number. No agents needed. Just SQL + Clearbit + scoring.

---

## Expander v2 — Gap Analysis & Fixes (April 19, 2026)

All 15 gaps identified and fixed in `scripts/abm-expander-agent.py`.

### Critical (🔴)

| # | Gap | Fix |
|---|-----|----|
| 1 | **SF cross-check skips Prospects/ABM Targets** — exactly who we want | `salesforce_should_skip()` — only skip `Customer` and `Partner` types. Prospects, ABM Targets, Target Accounts all PASS. |
| 2 | **Shared segments across conflicting campaigns** — `urn:li:adSegment:60191623` on 17 campaigns with different variants | `is_shared_segment()` — detects when a segment is shared across campaigns with different variants. Flags in results for Segment Engine action. Doesn't block addition but warns. |
| 3 | **No geographic scoping** — NA campaign gets EMEA companies | `parse_geo_from_name()` + `check_geo_match()` — parses NA/EMEA/APAC/GLOBAL from campaign name, verifies against Clearbit HQ country code. |
| 4 | **Relevance scoring ignores variant** — Healthcare variant scored same as generic AI Agent | Variant-specific tags from `VARIANT_TAGS` dict added to both description and tag matching. Healthcare campaigns now look for healthcare-specific signals. |

### Moderate (🟡)

| # | Gap | Fix |
|---|-----|----|
| 5 | **LLM hallucinated companies pass validation** | `check_hallucination()` — fuzzy name match between LLM suggestion and Clearbit returned name. Ratio < 0.5 = flagged as hallucination. |
| 6 | **Clearbit 202 (async pending) treated as failure** | `clearbit_enrich()` now retries after 3s on HTTP 202. Some companies resolve on second call. |
| 7 | **Review queue has no workflow** | `post_review_to_telegram()` — moderate-score candidates posted to Agent Activity thread (164) with details. |
| 8 | **SF queries one-at-a-time + partial match** | `salesforce_batch_check()` — queries all candidate domains at once with `CleanDomain__c IN (...)`. Exact match, no LIKE. |
| 9 | **No budget-awareness** — adding domains to $0 spend campaigns | `find_undersized_segments()` skips segments where `impressions30d=0 AND spend30d=0`. Also scales min size with spend: `max(base_min, spend * 0.5)`. |
| 10 | **ABMAccountEngagement table missing** | Pruner will query AdImpression directly. No need for intermediate table. |

### Minor (🟢)

| # | Gap | Fix |
|---|-----|----|
| 11 | **No unique constraint on (listId, accountId)** | `add_unique_constraint()` runs at Expander startup. Prevents duplicate list memberships. |
| 12 | **Competitor domains not in exclusion table** | `seed_competitor_exclusions()` — seeds twilio.com, vonage.com, bandwidth.com, plivo.com, signalwire.com, messagebird.com, infobip.com, sinch.com with scope `*`. |
| 13 | **Intent stage doesn't affect thresholds** | `THRESHOLDS` dict — TOFU auto-add at 0.6, MOFU at 0.7, BOFU/UPSELL at 0.8. |
| 14 | **No discovery source audit trail** | Every result now includes `discoverySource` and `llmModel` fields. |
| 15 | **Static segment minimums** | Budget-scaled minimums: `max(platform_min, spend30d * 0.5)`. $20K/mo campaign → min 10,000. |

### Model Strategy

- **Primary**: `gpt-4.1-mini` via LiteLLM — fast, cheap, good enough for company research
- **Fallback**: `claude-3-5-haiku-20241022` via LiteLLM — smarter if primary fails
- **Agent runtime**: GLM-5 via OpenClaw — cheapest for cron/orchestration
- **Never use Claude Opus** for routine agent work

---
