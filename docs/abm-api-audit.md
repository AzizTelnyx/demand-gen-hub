# ABM API Audit — Platform Capabilities & Gaps

**Date:** 2026-04-16
**Purpose:** What each platform API can do for ABM audience lifecycle management

## Summary Matrix

| Capability | Google Ads | StackAdapt | LinkedIn | Reddit |
|---|---|---|---|---|
| **List audiences** | ✅ 245 lists, sizes available | ✅ customSegments, audiences | ⚠️ Can see segment URNs in campaigns, but NOT list/query audiences directly | ⚠️ Need to verify |
| **Create audience/list** | ✅ Customer Match API | ✅ createAbmAudience, createAbmAudienceWithDomainsList, createCrmSegment, createProfileList | ❌ Matched Audience API returns 404 — needs Audience Management API product | ❌ Unknown |
| **Update audience** | ✅ Add/remove members | ✅ updateAbmAudience, updateAbmAudienceWithDomainsList, updateCrmSegment, updateProfileListProfiles | ❌ Same blocker | ❌ Unknown |
| **Delete audience** | ✅ | ✅ deleteCustomSegment, deleteProfileList | ❌ | ❌ Unknown |
| **Audience size/count** | ✅ size_for_search, size_for_display | ✅ size/duidSize on segments | ❌ audienceCounts API returns 404 | ❌ Unknown |
| **Campaign-level targeting** | ✅ Full CRUD | ✅ upsertCampaign with targeting | ✅ Can read/write targetingCriteria | ✅ Can read campaigns |
| **Domain-based targeting** | ✅ Customer Match (email) | ✅ ABM with domain lists (THE key feature) | ✅ audienceMatchingSegments | ❌ Email-based only |
| **Negative audiences** | ✅ CampaignCriterion exclusions | ✅ Exclusion targeting in campaigns | ✅ exclude in targetingCriteria | ⚠️ Limited |
| **Enrichment** | N/A | ✅ B2B domain insights, Bombora intent | ✅ Can see which segments are in use | N/A |

## Platform Details

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

**This is the best platform for ABM automation** — direct domain upload, domain-level engagement data, and full CRUD on audiences.

### LinkedIn — Partial Access ⚠️
**Scopes:** `r_ads, r_ads_reporting, r_organization_social, r_organization, rw_ads`
**Current:** 19 active campaigns referencing 54 adSegment URNs
**What works:**
- Read/write campaign targeting (targetingCriteria)
- Read adSegment URNs used in campaigns
- Campaign CRUD
- Analytics (adAnalyticsV2)

**What's BLOCKED:**
- Matched Audiences API → 404 (needs Audience Management API product, not just rw_ads)
- Audience Counts API → 404
- DMP Segments API → 404
- Cannot create/update/delete audience lists via API
- Cannot get audience sizes programmatically

**Workaround:** Manage audiences via LinkedIn Campaign Manager UI, and sync targeting criteria (which segments are applied to which campaigns) via API.

**To unblock:** Apply for LinkedIn Marketing API → Audience Management API product. This is separate from Advertising API access.

### Reddit — Needs Verification ⚠️
**Scopes:** Full API access via OAuth2
**Current:** 26 campaigns synced, working campaign/metrics APIs
**ABM approach:** Custom audiences (email-based)
**Key APIs:**
- `/ad_accounts/{id}/audiences`: List/create custom audiences (needs verification)
- Campaign targeting: works
- Reports: works

**Gap:** Reddit is bottom-of-funnel, not primarily ABM. Audience sizes are small. Low priority for ABM automation.

## Architecture Implications

### What We Can Automate End-to-End
1. **StackAdapt ABM** — Full lifecycle: create domain lists → attach to campaigns → monitor engagement → expand/prune → sync back
2. **Google Ads Customer Match** — Near-full: convert domains → emails → upload → attach → monitor → update
3. **LinkedIn targeting** — Partial: can read/write which segments are on campaigns, but can't create/manage the segments themselves

### What Needs Manual Steps
1. **LinkedIn audience management** — Must use Campaign Manager UI to create/update matched audiences. API can only attach existing ones.
2. **Reddit audience management** — Likely similar to LinkedIn, needs verification

### Recommended Sync Architecture
```
DB (source of truth)
    │
    ├── ABM Sync Agent (daily)
    │   ├── StackAdapt: Full CRUD — create/update ABM audiences, attach to campaigns
    │   ├── Google Ads: Customer Match upload — domain→email→list, attach to campaigns
    │   ├── LinkedIn: Read targeting (which segments on which campaigns), WRITE targeting (attach/detach existing segments)
    │   └── Reddit: Read-only for now
    │
    ├── ABM Auditor (weekly) — uses DB + platform data
    ├── ABM Expander (weekly) — writes to DB only
    └── ABM Pruner (biweekly) — writes to DB only
```

### Priority Order for ABM Automation
1. **StackAdapt** — Full automation possible, highest ROI (domain-based ABM is their core)
2. **Google Ads** — Near-full, needs email conversion step
3. **LinkedIn** — Partial until Audience Management API approved
4. **Reddit** — Low priority for ABM

## Action Items
- [ ] Apply for LinkedIn Audience Management API product access
- [ ] Verify Reddit custom audience API endpoints
- [ ] Build StackAdapt ABM connector (highest priority — full CRUD)
- [ ] Build Google Ads Customer Match connector
- [ ] Create ABMListRule table for rule-based list management
