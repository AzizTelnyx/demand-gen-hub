# ABM API Audit — Platform Capabilities & Gaps

**Date:** 2026-04-16 (updated with verified API test results)
**Purpose:** What each platform API can do for ABM audience lifecycle management

## Summary Matrix

| Capability | StackAdapt | LinkedIn | Google Ads | Reddit |
|---|---|---|---|---|
| **List audiences** | ✅ customSegments (50+), sizes | ✅ 262 DMP segments with sizes | ✅ 245 lists, 95 active | ⚠️ Low priority |
| **Create audience** | ✅ createAbmAudience, createAbmAudienceWithDomainsList | ✅ POST /dmpSegments (type=COMPANY) — verified 201 Created | ✅ Customer Match | ❌ N/A |
| **Update audience members** | ✅ updateAbmAudienceWithDomainsList | ⚠️ Upload endpoint not found yet — likely needs UI or undocumented endpoint | ✅ Add/remove members | ❌ N/A |
| **Archive/delete audience** | ✅ deleteCustomSegment | ✅ PATCH status=ARCHIVED — verified | ✅ | ❌ N/A |
| **Audience size** | ✅ size/duidSize | ✅ audienceSize in destinations | ✅ size_for_search/display | ❌ N/A |
| **Attach/detach from campaign** | ✅ upsertCampaign with targeting | ✅ PATCH targetingCriteria — verified add/remove segments | ✅ CampaignCriterion | ❌ N/A |
| **Domain-based targeting** | ✅ Direct domain upload | ✅ COMPANY type DMP segments | ⚠️ Email-based only | ❌ N/A |
| **Negative audiences** | ✅ Exclusion targeting | ✅ exclude in targetingCriteria | ✅ is_negative=true | ⚠️ |
| **Engagement data** | ✅ B2B_DOMAIN insights | ⚠️ Campaign-level only | ✅ Campaign-level | ❌ N/A |

## Platform Details

### StackAdapt — Full Access ✅✅ (Best ABM Platform)
**Scopes:** Full GraphQL read/write
**Current:** 50+ custom segments, campaigns reference ABM audiences
**ABM approach:** Domain lists (upload company domains directly!) — this is THE differentiator
**Key Mutations:**
- `createAbmAudience(input)`: Create ABM audience from company domains
- `createAbmAudienceWithDomainsList(input)`: Create with explicit domain list
- `updateAbmAudience(input)`: Update existing ABM audience
- `updateAbmAudienceWithDomainsList(input)`: Add/remove domains
- `createCrmSegment(input)`: CRM-based audience (email/device)
- `createProfileList(input)`: Profile-based targeting
- `updateProfileListProfiles(input)`: Add/remove profiles from list
- `scheduleAudienceInsights(input)`: Get audience intelligence
**Key Queries:**
- `customSegments`: List all segments with sizes
- `campaignInsight(attributes: [B2B_DOMAIN])`: Domain-level engagement data
- `audienceInsights(jobId)`: Audience intelligence results

**Best platform for ABM automation** — direct domain upload, domain-level engagement data, and full CRUD on audiences.

### LinkedIn — Near-Full Access ✅ (CORRECTED — earlier audit was wrong)
**Scopes:** `r_ads, r_ads_reporting, r_organization_social, r_organization, rw_ads`
**Current:** 19 active campaigns, 262 DMP segments (2 COMPANY type, 48+ USER/intent type), 54 unique adSegment URNs in active campaigns

**✅ What WORKS (verified by API testing):**
- **CREATE matched audiences**: `POST /v2/dmpSegments` with `type=COMPANY` returns 201 Created ✅
- **READ all DMP segments**: `GET /v2/dmpSegments?q=account&account=urn:li:sponsoredAccount:{id}` — returns 262 segments with audience sizes ✅
- **UPDATE campaign targeting**: `PATCH /v2/adCampaignsV2/{id}` with `{"patch":{"$set":{"targetingCriteria":...}}}` — verified by adding/removing real segments ✅
- **ARCHIVE segments**: `PATCH /v2/dmpSegments/{id}` with `{"patch":{"$set":{"status":"ARCHIVED"}}}` ✅
- **READ analytics**: adAnalyticsV2 ✅
- **UPDATE campaigns** (status, budget, name): Partial update with patch format ✅

**⚠️ Not yet verified (needs further testing):**
- **POPULATE COMPANY segments** with domains — the upload endpoint pattern is undocumented
  - `/dmpSegments/{id}/uploads` → 404
  - `/dmpSegments/{id}/actions` → 404
  - The sourcePlatform is `ABM_HUB_COMPANY_TIERING` which suggests LinkedIn Campaign Manager's ABM Hub
  - **Likely needs**: The matched audience upload API which may require the `rw_audiences` scope or a specific product
  - **Workaround**: Create the segment via API, populate it via Campaign Manager UI, then manage targeting via API

**⚠️ Still missing:**
- Audience Counts API (for estimating reach before campaign launch)
- Company lookup API (for finding URNs by company name) — the Community Management API would solve this

**Critical discovery:** The initial "ACCESS_DENIED" errors were due to **wrong request format** (flat JSON vs LinkedIn's patch document format `{"patch":{"$set":{...}}}`). The `rw_ads` scope IS sufficient for most operations.

### Google Ads — Full Access ✅
**Scopes:** Full read/write via Google Ads API v23
**Current:** 245 user lists, 95 with non-zero sizes
**ABM approach:** Customer Match (upload emails/hashes → matched audience)
**Key APIs:**
- `user_list` resource: list, create, update, get sizes
- `CustomerMatchUserListMetadata`: upload email/contact lists
- `CampaignCriterion`: attach/detach audiences to campaigns, set bid modifiers
- Negative audiences via `campaign_criterion` with `is_negative = true`

**Gap:** No domain-based targeting. Must convert domains → emails via Clearbit/SF before uploading.

### Reddit — Low ABM Priority
Not a primary ABM platform. Email-based audiences. Deprioritized.

## Architecture Implications

### What We Can Automate End-to-End
1. **StackAdapt ABM** — Full lifecycle: create domain lists → attach to campaigns → monitor engagement → expand/prune → all via API
2. **LinkedIn ABM** — Near-full: create segments → attach/detach to campaigns → monitor → archive. Only gap: populating segments with company domains (UI needed until we find the upload endpoint)
3. **Google Ads** — Near-full: convert domains → emails → Customer Match upload → attach

### What Needs the UI Workaround
1. **LinkedIn company list population** — After creating a COMPANY segment via API, populate it via Campaign Manager UI. Then manage targeting via API.
2. This is a one-time step per new segment — the ongoing management (attach/detach to campaigns, archive) is fully automated.

### Recommended Sync Architecture
```
DB (source of truth)
    │
    ├── ABM Sync Agent (daily)
    │   ├── StackAdapt: Full CRUD — create/update ABM audiences, upload domains, attach to campaigns
    │   ├── LinkedIn: Create segments, attach/detach to campaigns, read sizes, archive
    │   │   └── UI fallback: Populate new COMPANY segments with domains via Campaign Manager
    │   ├── Google Ads: Customer Match upload — domain→email→list, attach to campaigns
    │   └── Reddit: Read-only for now
    │
    ├── ABM Auditor (weekly) — reads DB + platform sizes, flags stale/undersized lists
    ├── ABM Expander (weekly) — researches new companies, enriches, writes to DB
    └── ABM Pruner (biweekly) — finds zero-engagement accounts, suggests removals
```

### Priority Order for ABM Automation
1. **StackAdapt** — Full automation, highest ROI (domain upload is native)
2. **LinkedIn** — Near-full, just needs UI for initial population of new segments
3. **Google Ads** — Near-full, needs email conversion step
4. **Reddit** — Low priority for ABM

## Action Items
- [x] ~~Apply for LinkedIn Audience Management API product access~~ — NOT NEEDED, rw_ads is sufficient
- [ ] Investigate LinkedIn COMPANY segment upload endpoint (undocumented)
- [ ] Build StackAdapt ABM connector (highest priority — full CRUD)
- [ ] Build LinkedIn ABM connector (create segments, attach/detach, read sizes)
- [ ] Build Google Ads Customer Match connector
- [ ] Create ABMListRule table for rule-based list management
