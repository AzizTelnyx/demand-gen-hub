# Platform Connectors

> **Last updated:** 2026-04-20

---

## StackAdapt — ✅ COMPLETE

**Connector:** `scripts/platforms/stackadapt.py` (750+ lines)
**Write connector:** `scripts/stackadapt_write_connector.py` (321 lines)
**Push bridge:** `scripts/abm_push_to_stackadapt.py` (called by Lobster workflows)

### What's Built

| Method | Purpose | Status |
|--------|---------|--------|
| `fetch_campaigns_with_groups()` | List campaigns + campaign groups | ✅ |
| `query_metrics()` | Campaign performance metrics | ✅ |
| `fetch_creatives()` | Creative asset data | ✅ |
| `pause_campaign()` | Pause a campaign | ✅ |
| `enable_campaign()` | Resume a campaign | ✅ |
| `update_budget()` | Change campaign budget | ✅ |
| `get_frequency_cap()` | Read frequency cap settings | ✅ |
| `update_frequency_cap()` | Change frequency cap | ✅ |
| `get_reach_frequency()` | Reach/frequency stats | ✅ |
| `exclude_domains()` | Add domains to exclusion list | ✅ |
| `update_domain_exclusions()` | Update exclusion domains | ✅ |
| `create_abm_audience()` | Create ABM audience with domain list | ✅ |
| `update_abm_audience_domains()` | Update audience's domain list | ✅ |
| `attach_segment_to_campaign()` | Attach segments to campaign | ✅ |
| `delete_segment()` | Remove a segment | ✅ |
| `update_creative_impression_share()` | Adjust creative weight | ✅ |

### Exclusion Audiences (Live in SA)

| Product | SA Audience ID | Domains |
|---------|---------------|---------|
| SMS | 2502446 | ~400 |
| SIP | 2502447 | ~200 |
| IoT SIM | 2502448 | ~600 |
| Voice API | 2502449 | ~300 |
| AI Agent | 2502450 | ~500 |

Total: 1,348 excluded domains pushed to StackAdapt.

### Campaigns with Exclusions Attached

13 active SA campaigns have exclusion audiences attached: 2882131, 2903819, 2903846, 2925035, 2978014, 2978199, 2983357, 2991872, 3105131, 3105136, 3116860, 3125891, 3125909

### Push Flow

```
Agent runs → DB changes (ABMExclusion/ABMAccount)
    → abm_push_to_stackadapt.py reads pending changes
    → calls StackAdaptConnector methods
    → updates DB flags (pushedToSa, saPushedAt)
```

### Known Gaps

- ⚠️ `detachAudienceFromCampaign` not built yet
- ⚠️ `list_audiences()` doesn't return ABM audiences (IDs cached locally)
- ⚠️ SMS/SIP/Voice API exclusion audiences have no active SA campaigns (those products run on Google/LinkedIn only)
- ⚠️ `ABMExclusion.saAudienceId` column is NULL for all rows — needs backfill
- ⚠️ Expander/Pruner auto-push hasn't been validated end-to-end live yet

---

## LinkedIn — ⚠️ PARTIALLY UNBLOCKED (2026-04-21)

### What Works

| Method | Status | Notes |
|--------|--------|-------|
| Create COMPANY type DMP segments | ✅ | |
| Attach/detach segments to campaigns | ✅ | |
| Read segment sizes | ✅ | |
| Archive segments | ✅ | |
| Resolve org URNs to company names | ✅ | `adTargetingEntities` API — batch of 20 |
| Fetch company-level impressions | ✅ | `MEMBER_COMPANY` pivot in analytics API |
| Match companies to Salesforce | ✅ | 517 matched, 8,969 net-new |

### What's Still Blocked

**Populating segments with domains** — upload endpoint undocumented. Workaround: create via API, populate via Campaign Manager UI.

**Organization Lookup API (full profile)** — Community Management API approval stalled since 2026-03-12. Would give website, vanity URL, and full org profile. Currently we only get company name from `adTargetingEntities`.

### The li_org: Problem — SOLVED (2026-04-21)

**Previous state:** 97.2% of LinkedIn impressions had `li_org:XXXX` IDs that couldn't be matched to Salesforce.

**Breakthrough:** The existing LinkedIn Ads API token already has `r_organization` scope. Two endpoints unlock org resolution:

1. **`GET /rest/adAnalytics?q=analytics&pivot=MEMBER_COMPANY`** — returns company-level impressions with `urn:li:organization:XXXX` URNs per campaign
2. **`GET /rest/adTargetingEntities?q=urns&urns=List(...)`** — resolves URNs to company names (batch of 20)

**Results (full run across 19 active campaigns):**
- 9,535 unique companies extracted from LinkedIn impressions
- 9,463 org IDs resolved to company names (99.2%)
- 517 matched to existing Salesforce accounts
- 8,969 net-new companies pushed to ABMAccount as prospects
- 473,914 total impressions now attributable

**Script:** `scripts/linkedin-org-resolver.py` — handles seeding, resolution, SF matching, and ABM push.

### Remaining LinkedIn Attribution Gaps

- **Domains from org IDs:** `adTargetingEntities` only returns names, not domains. Need Clearbit autocomplete or CM API for domain resolution.
- **Domain upload to campaigns:** Can't programmatically add targeting audiences via API.
- **CM API app approval:** Still stalled (Josh B, ticket #66960). Would unlock Organization Lookup API (full profile with website URL).

---

## Google Ads — ❌ DEFERRED

Not in scope for ABM. Reasons:
- Aggregate data only (no domain-level impressions)
- Customer Match requires domain→email conversion
- ABM targeting works better on SA (native domain upload) and LinkedIn (company targeting)

Google Ads optimization happens through the keyword-bid-optimizer and creative-specialist agents, not ABM.
