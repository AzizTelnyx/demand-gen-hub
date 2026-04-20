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

## LinkedIn — ⚠️ BLOCKED

### What Works

| Method | Status |
|--------|--------|
| Create COMPANY type DMP segments | ✅ |
| Attach/detach segments to campaigns | ✅ |
| Read segment sizes | ✅ |
| Archive segments | ✅ |

### What's Blocked

**Populating segments with domains** — upload endpoint undocumented. Workaround: create via API, populate via Campaign Manager UI.

**Resolving li_org: to company names** — Community Management API approval stalled since 2026-03-12. Would unlock 8,338 domains.

### The li_org: Problem

97.2% of LinkedIn impressions have account IDs in `li_org:XXXX` format instead of domain names. We can't match these to Salesforce accounts.

- 743,101 impressions with `li_org:` prefix (unresolvable)
- Only 21,469 impressions with resolvable domains (2.8%)
- Currently attributing ~$580K pipeline from 36 deals (tiny fraction)

**Solution path:** Community Management API → Organization Lookup API → company name + website → match to SF domains.

**Blocker:** LinkedIn required a separate app for Community Management API (legal/security). Created ✅. Approval stalled.

**Support contact:** Josh B, ticket #66960

---

## Google Ads — ❌ DEFERRED

Not in scope for ABM. Reasons:
- Aggregate data only (no domain-level impressions)
- Customer Match requires domain→email conversion
- ABM targeting works better on SA (native domain upload) and LinkedIn (company targeting)

Google Ads optimization happens through the keyword-bid-optimizer and creative-specialist agents, not ABM.
