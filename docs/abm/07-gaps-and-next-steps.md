# Gaps & Next Steps

> **Last updated:** 2026-04-20

---

## High Priority

### 1. 1,617 accounts with null productFit (63%)

**Problem:** Most of these are genuinely irrelevant — pharmacies, food companies, fashion brands that received impressions on broad TOFU campaigns. They'll never convert.

**Options:**
- **(A) Let the Pruner handle them** — Pruner will flag relevance=0 domains with spend > 0 for removal. Slow but safe.
- **(B) Bulk exclude null-productFit domains** — Add all 1,617 to ABMExclusion with reason "null product fit". Fast but aggressive — might catch some latent prospects.
- **(C) Looser thresholds** — Lower the 0.15 threshold to classify more. Risks false positives (the exact problem we just fixed).

**Recommendation:** Option A for now. The Pruner runs weekly and will systematically remove waste. No need to rush-force-classify.

### 2. Hub UI doesn't show Salesforce data

**Problem:** DomainSlideOut has fields for pipeline status, opp stage, amount, switchSignal, currentProvider — but they're all empty because the component doesn't query SFAccount/SFOpportunity.

**Fix:** Wire DomainSlideOut to fetch from SF tables. Show:
- Pipeline badge (green if active opp)
- Opp stage + amount
- Switch signal (if any)
- SF account link

**Effort:** ~2 hours

### 3. Negative Builder needs re-run

**Problem:** Last run used the broken productFit data (AI Agent keywords too broad). Exclusion lists are based on stale scoring.

**Fix:** Re-run `abm-negative-builder-agent.py` with corrected productFit. Will generate cleaner, more accurate exclusion lists.

**Effort:** ~1 hour (run + review)

---

## Medium Priority

### 4. LinkedIn Community Management API — still blocked

**Problem:** 97.2% of LinkedIn impressions have `li_org:` IDs we can't resolve. Can't attribute pipeline from LinkedIn.

**Status:** Separate app created for Community Management API ✅. Approval stalled since 2026-03-12.

**Next:** Escalate with LinkedIn support. Contact: Josh B, ticket #66960. Support request doc: https://docs.google.com/document/d/1-kyOmmGPtpEO7okaa4Gt_dU_v7mX0TMohVDtFx3Mo5Q/edit

### 5. SF sync not croned

**Problem:** `sync_salesforce.py` runs manually. Stale SF data means stale pipeline info.

**Fix:** Add to cron schedule (daily 5 AM, before ABM Sync at 6 AM).

**Effort:** ~15 minutes

### 6. Expander/Pruner end-to-end live validation

**Problem:** The Lobster workflows + SA connector push bridge haven't been tested with a real live run end-to-end. Code exists but hasn't been validated.

**Fix:** Run a controlled Expander cycle on one campaign and verify domains appear in SA.

**Effort:** ~1 hour

### 7. ABMExclusion.saAudienceId backfill

**Problem:** All 3,810 exclusion rows have `saAudienceId = NULL`. The push script works around this but it makes tracking fragile.

**Fix:** Backfill from the known audience IDs (2502446-2502450).

**Effort:** ~30 minutes

---

## Low Priority

### 8. Attribution dashboard

Build the SQL + visualization to show: "Voice API segment → 45 domains → 8 SQOs → $240K pipeline". Data exists, needs UI.

### 9. Positive audience upload for Expander

When Expander adds new domains, they should be pushed to SA targeting audiences (not just exclusion). `create_abm_audience` and `update_abm_audience_domains` methods exist in the connector — just need to wire them into the Expander push flow.

### 10. Detach exclusion audiences from campaigns

`detachAudienceFromCampaign` not built yet. Needed for when we want to remove an exclusion from a specific campaign.

### 11. currentProvider detection

Need logic to detect which competitor a company uses (Twilio, Vonage, Bandwidth) from SF data, Clearbit tech stack, or AI research. Would enable competitive conquesting campaigns.

### 12. Google Ads Customer Match

Deferred until LinkedIn + StackAdapt are fully automated. Zero code written.

---

## Build Priority Order

1. ⬜ Re-run Negative Builder with corrected productFit
2. ⬜ Wire Hub UI DomainSlideOut to SF data
3. ⬜ Cron SF sync (daily 5 AM)
4. ⬜ Validate Expander → SA push end-to-end
5. ⬜ Backfill ABMExclusion.saAudienceId
6. ⬜ Escalate LinkedIn API approval
7. ⬜ Attribution dashboard
8. ⬜ Positive audience upload for Expander
9. ⬜ Detach exclusion audiences
10. ⬜ currentProvider detection
11. ⬜ Google Ads Customer Match
