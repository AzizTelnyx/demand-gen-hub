# Data Model

> **Last updated:** 2026-04-20

---

## Core Tables

### ABMAccount — 2,555 accounts

The master list of companies we're targeting (or have targeted) in ABM campaigns.

| Column | Type | Purpose | Populated |
|--------|------|---------|-----------|
| `id` | UUID | Primary key | ✅ |
| `company` | text | Company name | ✅ 2,555 |
| `domain` | text | Primary identifier, normalized | ✅ 2,555 |
| `vertical` | text | Clearbit vertical | ✅ 2,375 (93%) |
| `country` | text | HQ country | ✅ 2,375 (93%) |
| `region` | text | NA/EMEA/APAC/LATAM | ✅ 2,375 |
| `companySize` | text | Employee range | ✅ 2,390 |
| `tier` | text | Tier 1/2/3 | ✅ |
| `productFit` | text | Best Telnyx product fit | ✅ 938 (37%), null 1,617 (63%) |
| `currentProvider` | text | Competitor they use | ❌ 0 |
| `inPipeline` | boolean | Has active SF opportunity | ✅ 41 |
| `sfAccountId` | text | Salesforce Account ID | ✅ 122 |
| `switchSignal` | text | SF opp source signal | ✅ 260 |
| `annualRevenue` | text | Revenue | ✅ 1,109 |
| `employeeCount` | text | Exact employee count | ✅ 2,390 |
| `clearbitDesc` | text | Company description from Clearbit | ✅ 2,440 (95%) |
| `clearbitTags` | text[] | Industry tags | ✅ 2,210 |
| `clearbitTech` | text[] | Tech stack | ✅ 1,580 |
| `enrichmentSource` | text | Where data came from | ✅ |
| `lastEnrichedAt` | timestamp | When last enriched | ✅ |
| `pushedToSa` | boolean | Pushed to StackAdapt | ✅ |
| `saPushedAt` | timestamp | When pushed to SA | ✅ |

**Key insight:** All 2,555 accounts come from `source = stackadapt_impressions`. They're companies that received at least one impression on a Telnyx StackAdapt campaign. This is NOT a curated target list — it's who saw our ads.

### ABMExclusion — 3,810 exclusions

Domains we've identified as irrelevant and should not receive impressions.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `domain` | text | Excluded domain |
| `category` | text | Product name or `*` (all products) |
| `reason` | text | Why excluded (competitor, ISP, hospital, etc.) |
| `source` | text | How discovered (manual, negative-builder, pruner) |
| `pushedToSa` | boolean | Whether pushed to SA exclusion audience |
| `saAudienceId` | integer | SA audience ID it was pushed to |

### ABMCampaignSegment — 287 segments

Maps campaign-segment pairs with performance data and health flags.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `campaignId` | text | SA campaign ID |
| `campaignName` | text | Human-readable name |
| `platform` | text | stackadapt/linkedin |
| `parsedProduct` | text | Extracted product (Voice API, AI Agent, etc.) |
| `parsedVariant` | text | Campaign variant |
| `parsedIntent` | text | TOFU/MOFU/BOFU |
| `segmentId` | text | Targeting segment ID |
| `segmentName` | text | Segment name |
| `impressions30d` | bigint | Last 30-day impressions |
| `spend30d` | float | Last 30-day spend |
| `healthFlags` | text[] | Array of health issues |

### ABMListRule — 8 rules

Scoring rules for each product. Defines what makes a company relevant.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `product` | text | Product name |
| `variant` | text | Rule variant |
| `icpRules` | jsonb | ICP matching criteria |
| `relevanceThreshold` | float | Minimum score to include |

### ABMList — 435 lists

Platform segment references.

## Salesforce Tables

### SFAccount — 5,000 accounts

| Column | Type | Populated |
|--------|------|-----------|
| `sfId` | text | ✅ 5,000 |
| `name` | text | ✅ 5,000 |
| `cleanDomain` | text | ✅ 5,000 |
| `industry` | text | ✅ 4,044 |
| `annualRevenue` | float | ✅ 5,000 |
| `employees` | integer | ✅ |
| `firmoTier` | text | ✅ |
| `salesSegment` | text | ✅ 14 |
| `abmSegment` | text | ✅ |

### SFOpportunity — 3,031 opportunities

| Column | Type | Populated |
|--------|------|-----------|
| `sfId` | text | ✅ 3,031 |
| `amount` | float | ✅ |
| `stageName` | text | ✅ |
| `accountDomain` | text | ✅ |
| `oppSource` | text | ✅ |
| `isClosed` | boolean | ✅ |

### SFCampaign — 492 campaigns

Linked to SF opportunities for attribution.

## Relationship Map

```
ABMAccount.domain ──→ SFAccount.cleanDomain (122 linked)
ABMAccount.domain ──→ SFOpportunity.accountDomain (41 in active pipeline)
ABMExclusion.category ──→ ABMAccount.productFit (product-scoped exclusions)
ABMCampaignSegment.segmentId ──→ StackAdapt audience IDs
SFOpportunity.CampaignId ──→ SFCampaign.sfId (attribution)
```

## Sync Scripts

| Script | What it syncs | Schedule |
|--------|--------------|----------|
| `sync_salesforce.py` | SF accounts, opps, campaigns | On demand |
| `sync_ad_impressions.py` | Ad impressions from SA | Every 6h |
| `sync_audiences.py` | SA audience data | Every 6h |
| `sync_creatives.py` | Ad creatives | Every 6h |
