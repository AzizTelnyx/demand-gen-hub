# DG Hub Launch Plan — March 16, 2026

**Goal:** Get everything working, tested, and documented before Aziz's 3-week leave.

---

## Architecture (Corrected Understanding)

### Dual-Trigger System
Agents have **two trigger paths** by design:

1. **Cron path (autopilot)** — OpenClaw crons fire on schedule → run Python scripts directly
   - These are the standalone agents: `negative-keyword`, `budget-pacing-manager`, `keyword-hygiene`, etc.
   - They run regardless of GDE. They're our daily optimization loop.

2. **A2A path (on-demand via GDE)** — A2A poll workers listen for messages from Ian's GDE system → forward to OpenClaw agent sessions
   - These are the A2A-connected agents: `neg-keyword`, `budget-pacing`, `creative-qa`, `keyword-bid-optimizer`, `stackadapt-ops`
   - They can be triggered by GDE signals ("re-evaluate budget, we just launched a campaign")

**These are NOT duplicates.** They serve different purposes:
- Cron agents = scheduled autopilot (runs every day regardless)
- A2A agents = reactive on-demand (triggered by external signals from GDE)

### Current A2A Workers (PM2)
| PM2 Process | A2A Agent ID | OpenClaw Agent |
|-------------|-------------|----------------|
| a2a-ares | paid.demand.gen:aziz:ares | main |
| a2a-budget-pacing | paid.demand.gen:aziz:budget-pacing | budget-pacing |
| a2a-creative-qa | paid.demand.gen:aziz:creative-qa | creative-qa |
| a2a-keyword-bid-optimizer | paid.demand.gen:aziz:keyword-bid-optimizer | keyword-bid-optimizer |
| a2a-neg-keyword | paid.demand.gen:aziz:neg-keyword | neg-keyword |
| a2a-stackadapt-ops | paid.demand.gen:aziz:stackadapt-ops | stackadapt-ops |

All 6 A2A workers are online and polling. ✅

### Agents Missing A2A Workers
These cron agents have no A2A path yet — GDE can't trigger them on-demand:
- `keyword-hygiene`
- `ad-copy-review`
- `ad-quality-audit`
- `reddit-ops`
- `hub-doctor`
- `landing-page-validator`
- Fleet agents (audience-targeting, device-geo, frequency-reach, google-search-manager)

---

## Full Audit Results

### Hub Health: CRITICAL
- `/api/health` returns `critical` — pm2 path not found in hub's shell, sync >12h stale on all platforms
- Hub Doctor reports 23 issues, mostly agent success rates <90%
- Hub Doctor cron report (Telegram) shows cleaner picture but misses deeper issues

### Agent Inventory (21 agents in DB)

#### A2A-Connected Agents (enabled in DB)
| Agent (A2A slug) | Cron Counterpart | Dry-Run | A2A Worker | Issues |
|-----------------|------------------|---------|------------|--------|
| budget-pacing | budget-pacing-manager | ✅ Works | ✅ Online | None — solid |
| neg-keyword | negative-keyword | ⚠️ **HANGS** | ✅ Online | A2A version hangs. Cron version works fine. |
| keyword-bid-optimizer | (same) | ✅ Works | ✅ Online | Weekly cron errored |
| creative-qa | ad-copy-review | ✅ Works | ✅ Online | DB shows 0% success rate (tracking bug?) |
| google-creative-specialist | (same) | ✅ Runs, 0 findings | No A2A | Finds nothing — thresholds too conservative? |
| ad-quality-audit | (same) | ✅ Works | No A2A | Finds real issues (sitelink violations) |
| reddit-ops | (same) | ✅ Works (1 finding/30d) | No A2A | **NO CRON.** Telegram send fails (400). |
| stackadapt-ops | (same) | ✅ Works | ✅ Online | Monday cron broken |

#### Cron-Only Agents (disabled in DB — no A2A worker)
| Agent | Dry-Run | Cron | Notes |
|-------|---------|------|-------|
| negative-keyword | ✅ Works | Daily 2 AM ✅ | Cron version of neg-keyword — works fine |
| keyword-hygiene | ✅ Works (89 findings) | Weekly Sun 3 AM | Finding real issues. Should be enabled. |
| ad-copy-review | ✅ Works (char limit violations) | Daily 3 AM | Finds real problems in active ads |
| landing-page-validator | ✅ Works | Fleet 7 AM | Checks broken URLs, UTM params |
| hub-doctor | ✅ Works | Daily 6 AM cron ✅ | Posts to Telegram. Disabled in DB but cron runs fine. |
| budget-pacing-manager | Untested | Fleet 7 AM | Cron counterpart of budget-pacing |
| google-search-manager | ✅ 4 done runs | Fleet 7 AM | Works in fleet |
| audience-targeting-optimizer | Errored | Fleet 7 AM | `externalId` column missing |
| device-geo-optimizer | Errored | Fleet 7 AM | `externalId` column missing |
| frequency-reach-manager | Errored | Fleet 7 AM | `externalId` column missing |
| google-ads-optimizer | Untested | — | 0 runs ever |

#### Broken (can't run at all)
| Agent | Error | Root Cause |
|-------|-------|-----------|
| creative-manager | 💥 ImportError: `CampaignContext` | Class removed from `agent_base.py` |
| domain-publisher-manager | 💥 ImportError: `CampaignContext` | Same broken import |
| audience-targeting-optimizer | 💥 `externalId` column | Missing DB column |
| device-geo-optimizer | 💥 `externalId` column | Same |
| frequency-reach-manager | 💥 `externalId` column | Same |

### Broken Infrastructure
1. **`CampaignContext` missing from `agent_base.py`** — creative-manager + domain-publisher-manager crash on import
2. **`externalId` column missing from Campaign table** — 3 fleet agents crash
3. **Hub health check broken** — pm2 path not in hub's shell PATH
4. **Sync staleness** — Google Ads & Reddit >18h stale (syncs should run every 6h)
5. **Reddit Telegram posting** — HTTP 400 on send
6. **Agent success rate tracking** — shows 0% for agents that actually complete successfully
7. **`neg-keyword` (A2A version) hangs** — while cron version `negative-keyword` works fine

### Cron Status
| Cron | Schedule | Status | Issue |
|------|----------|--------|-------|
| Neg Keyword Daily | 2 AM | `error` | Agent hangs |
| Keyword & Bid Weekly | Sun 3 AM | `error` | Unknown |
| Agent Fleet Weekly | Sun 4 AM | `error` | Unknown |
| StackAdapt Mon | Mon 5 AM | `error` | Unknown |
| Reddit Ops | **NOT SCHEDULED** | — | Needs cron |

---

## Execution Plan (Prioritized)

### Block 1: Fix Broken Agents & Infrastructure
_Make everything that exists actually work._

| # | Task | Est. | Status |
|---|------|------|--------|
| 1.1 | Fix `agent_base.py` — restore `CampaignContext` + `ActionLevel` | 15m | ✅ Added compat shims + fixed imports |
| 1.2 | Fix `externalId` column — add to Campaign table | 15m | ✅ Already resolved; fixed google-ads-optimizer ref |
| 1.3 | Debug why `neg-keyword` (A2A version) hangs but `negative-keyword` (cron) works | 30m | ✅ Lobster YAML parse error + fetch_context auto-discovery |
| 1.4 | Fix Reddit Telegram send (HTTP 400) | 15m | |
| 1.5 | Fix 4 errored crons (neg-keyword, fleet weekly, stackadapt mon, kw-bid weekly) | 30m | |
| 1.6 | Fix campaign sync staleness (Google & Reddit >18h) | 20m | |
| 1.7 | Fix hub health check (pm2 PATH issue) | 15m | |
| 1.8 | Fix agent success rate tracking in DB (0% for working agents) | 20m | |
| 1.9 | Enable cron agents in DB: keyword-hygiene, ad-copy-review, landing-page-validator, hub-doctor | 10m | |
| 1.10 | Schedule Reddit Ops cron (Tue/Fri 5 AM PST) | 10m | |
| 1.11 | Investigate PM2 high restarts: abm-worker(32), dg-hub(14) | 15m | |

### Block 2: Hub UX & Documentation
_Make hub understandable and functional for someone diving in cold._

| # | Task | Est. | Status |
|---|------|------|--------|
| 2.1 | Audit hub UI — agents page, health page, activity log | 30m | |
| 2.2 | Fix agent status display to reflect both cron + A2A trigger paths | 30m | |
| 2.3 | Verify all hub API endpoints return correct data | 20m | |
| 2.4 | Write HANDOFF.md — operations runbook for 3-week absence | 30m | |
| 2.5 | Post guide to Telegram Guide & Data Info topic (thread 139) | 15m | |

### Block 3: New Agents — Creative Specialists
_Build LinkedIn + StackAdapt creative agents with both cron + A2A paths._

| # | Task | Est. | Status |
|---|------|------|--------|
| 3.1 | LinkedIn Creative Specialist — copy generation with brand rules | 2h | |
| 3.2 | StackAdapt Creative Specialist — native ad + display copy | 1.5h | |
| 3.3 | Lobster workflows for new agents | 30m | |
| 3.4 | Register in DB, create crons, add A2A workers + PM2 configs | 30m | |
| 3.5 | Dry-run + test Telegram output | 30m | |

### Block 4: Final Validation
| # | Task | Est. | Status |
|---|------|------|--------|
| 4.1 | Full fleet dry-run — every agent, both paths | 30m | |
| 4.2 | Verify all crons will fire correctly tonight/tomorrow | 15m | |
| 4.3 | Hub walkthrough — fresh eyes test | 20m | |
| 4.4 | Update MEMORY.md with final state | 15m | |

---

## Decisions Made

- [x] **Both trigger paths are intentional** — cron (autopilot) + A2A (GDE on-demand). Not duplicates.
- [x] **Reddit cron**: Tue/Fri (6 active campaigns don't need daily)
- [ ] **Fleet agents**: Fix `externalId` and keep in fleet? Or deprioritize?
- [ ] **Google Creative Specialist**: Review thresholds? Or accept 0 findings for now?
- [ ] **A2A workers for remaining agents**: Add A2A path for keyword-hygiene, ad-copy-review, etc.? Or leave cron-only for now?

---

_Last updated: 2026-03-16 06:32 PDT_
