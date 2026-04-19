# Paid Fleet — Agent Registry & Architecture

## Overview

14 agents managing $140K/mo in paid media across Google Ads, LinkedIn, StackAdapt, and Reddit. Agents handle negative keywords, ad copy compliance, budget pacing, bid optimization, creative fatigue, audience hygiene, landing page validation, and system health — running daily on automated schedules.

All agents share a knowledge base (38 files), guardrails system, approval workflow, and PostgreSQL backend.

---

## Agent Registry

### Operational ✅

| # | Agent | Script | Schedule | Function | Platform Access |
|---|-------|--------|----------|----------|----------------|
| 1 | **Negative Keyword Agent** | `negative-keyword-agent.py` | Daily 2 AM | Search term analysis, auto-blocks ≥80% confidence | Google Ads R/W |
| 2 | **Ad Copy Review Agent** | `ad-copy-review-agent.py` | Daily 3 AM | Audits creatives against brand/copy rules | Google Ads R, LinkedIn R, StackAdapt R |
| 3 | **Google Ads Optimizer** | `google-ads-optimizer.py` | Daily 4 AM | Budget efficiency, impression share, keyword + campaign health | Google Ads R/W |
| 4 | **Keyword Hygiene Agent** | `keyword-hygiene-agent.py` | Weekly Sun 3 AM | Duplicates, low performers, match type conflicts | Google Ads R/W |
| 5 | **Hub Doctor** | `hub-doctor.py` | Daily 6 AM | System health — PM2, crons, DB, syncs, APIs, agent run status | Internal only |
| 6 | **Budget & Pacing Manager** | `budget-pacing-manager.py` | Fleet daily 7 AM | Multi-platform pacing, reallocation proposals | All platforms R |
| 7 | **Google Search Manager** | `google-search-manager.py` | Fleet daily 7 AM | Keyword pauses, device bid adjustments | Google Ads R/W |
| 8 | **Audience & Targeting** | `audience-targeting-optimizer.py` | Fleet daily 7 AM | ABM audience contamination, targeting hygiene | LinkedIn R, StackAdapt R |
| 9 | **Device & Geo Optimizer** | `device-geo-optimizer.py` | Fleet daily 7 AM | Device bids, geographic performance analysis | Google Ads R/W |
| 10 | **Landing Page Validator** | `landing-page-validator.py` | Fleet daily 7 AM | LP URLs, UTM parameters, broken link checks | Google Ads R, HTTP |
| 15 | **Flight Auto-Extend** | `flight-auto-extend-agent.py` | Daily 6 AM | Extends StackAdapt flights nearing end date, prevents campaigns from going dark | StackAdapt R/W |
| 16 | **ABM Negative Builder** | `abm-negative-builder-agent.py` | Monthly 1st 4 AM | Builds exclusion lists from irrelevant-domain patterns | DB R/W |
| 17 | **ABM Expander** | `abm-expander-agent.py` | Weekly Tue 6 AM | AI research + Clearbit validation to grow undersized segments | DB R/W, Clearbit |
| 18 | **ABM Pruner** | `abm-pruner-agent.py` | Weekly Sun 5 AM | Removes zero-engagement + relevance-mismatch accounts | DB R/W |
| 19 | **ABM Auditor** | `abm-auditor-agent.py` | Weekly Mon 6 AM | Health scorecard + waste detection + undersized alerts | DB R |

**Flight Auto-Extend SLAs:**
- Max dead time: 24 hours (daily check ensures this)
- Extension success rate: ≥95% (failures → immediate Telegram escalation)
- Coverage: All active StackAdapt campaigns
- Lead time: 7 days before flight end (extends when ≤7 days remaining)
- Extension length: 30 days per extension
- Budget: Same as ending flight (no auto-increase without approval)
- Alert: Any campaign that can't be auto-extended → immediate Telegram alert to Agent Activity thread

### Needs Fix ⚠️

| # | Agent | Issue |
|---|-------|-------|
| 11 | **Creative Manager** | StackAdapt `get_creative_metrics()` GQL timeout |
| 12 | **Domain & Publisher Manager** | StackAdapt `get_domain_report()` GQL timeout |
| 13 | **Frequency & Reach Manager** | StackAdapt frequency cap API timeout |

Root cause: 3 StackAdapt GraphQL connector methods. One fix unblocks all three.

### Blocked 🔴

| # | Agent | Blocker |
|---|-------|---------|
| 14 | **LinkedIn Optimizer** | Needs `rw_ads` + `r_organization_social` API scope |

---

## Shared Infrastructure

### Knowledge Base — 38 files (`knowledge/`)

| Category | What It Covers |
|----------|---------------|
| `brand/` | Messaging, tone, 4 pillars, proof points |
| `products/` | Per-product positioning, features, differentiators |
| `competitors/` | Twilio, Vonage, Bandwidth, Plivo intel |
| `icps/` | Ideal customer profiles by vertical and use case |
| `standards/` | Ad copy rules, creative specs, RSA best practices |
| `messaging-frameworks/` | Per-product messaging (voice API, contact center, healthcare) |
| `playbooks/` | Campaign playbooks, launch sequences |
| `verticals/` | Healthcare, financial services, contact center |
| `campaigns/` | Active campaign context, intent mapping |
| Root | `telnyx-strategy.md`, `product-groups.md`, `budget-config.json` |

**Served via API:** `GET /api/context?section=<name>` — any agent or service can request knowledge at runtime. Not locked to the paid fleet — designed to be shared.

### Guardrails (DB-backed, runtime-enforced)

| Rule | Value |
|------|-------|
| Budget floor | $10/day per campaign |
| Max budget change without approval | $500 |
| Cross-product reallocation | Always requires approval |
| Learning period | 14 days for new campaigns |
| Confidence threshold | 80% to auto-execute |
| Max actions/campaign/day | 3 |
| Kill switch | 50% CPA spike → halt |

### Approval System
- Confidence + risk → auto-execute or human review
- Telegram inline buttons (✅ Approve / ❌ Reject) per recommendation
- Unified callback handler (`scripts/lib/approval_handler.py`)
- Hub UI approval queue with full context

### Platform Connectors

| Platform | Read | Write | Notes |
|----------|------|-------|-------|
| Google Ads | ✅ | ✅ | Standard Access — keywords, bids, budgets, campaigns |
| LinkedIn | ✅ | ❌ | Read-only until scope approved |
| StackAdapt | ✅ | ✅ | 92 GQL mutations — flights, budgets, targeting, domains |
| Reddit | ✅ | ✅ | Budgets, ad group targeting |

### BaseAgent Class (`scripts/lib/agent_base.py`)
Shared foundation every agent inherits:
- Knowledge loading from shared knowledge base
- Guardrails enforcement at runtime
- Kill switch monitoring
- DB logging (runs, findings, recommendations, changes with rollback data)
- Telegram reporting with inline approval buttons

### Database (PostgreSQL `dghub`)

| Table | Purpose |
|-------|---------|
| `Campaign` | All campaigns, parsed context (product, region, intent, variant) |
| `AdCreative` | 10K+ creatives synced from all platforms |
| `AdImpression` | Impressions, clicks, conversions (campaign + domain level) |
| `Recommendation` | Agent recommendations with confidence + approval status |
| `CampaignChange` | Applied changes with rollback data |
| `AgentRun` | Execution logs per agent per run |
| `AgentGuardrail` | Runtime guardrail config |
| `RegionalPriority` | Region × product priority weights per quarter |
| `BudgetAllocation` | Per-platform monthly budget targets |

### Blocklists (`scripts/lib/blocklists.py`)
15 competitors, 8 tech giants, 5 email providers — used across negative keyword, audience, and creative agents.

---

## Schedule

| Time (PST) | What Runs | Frequency |
|------------|-----------|-----------|
| 1:00 AM | DB backup + GitHub push | Daily |
| 2:00 AM | Negative Keyword Agent | Daily |
| 3:00 AM | Ad Copy Review Agent | Daily |
| 3:00 AM | Keyword Hygiene Agent | Sunday |
| 4:00 AM | Google Ads Optimizer | Daily |
| 4:00 AM | Fleet Deep Analysis (--deep) | Sunday |
| 5:00 AM | LinkedIn Org Mapping Rebuild | Daily |
| 5:00 AM | Audience Hygiene Scan | Monday |
| 6:00 AM | Hub Doctor | Daily |
| 6:00 AM | Flight Auto-Extend Agent | Daily |
| 7:00 AM | Fleet Run (8 agents in sequence) | Daily |
| Every 6h :00 | Campaign Sync (Fast: local + LinkedIn + Salesforce) | 4x daily |
| Every 6h :30 | Campaign Sync (Slow: impressions + creatives) | 4x daily |
| 1st 4 AM | ABM Negative Builder | Monthly |
| Tue 6 AM | ABM Expander | Weekly |
| Sun 5 AM | ABM Pruner | Weekly |
| Mon 6 AM | ABM Auditor | Weekly |

---

## Architecture Direction

### Current State
All agents are Python scripts sharing `BaseAgent`, executed via cron through the main OpenClaw agent (Ares). Works well for execution, but every agent shares the same credentials, memory, and session context.

### Next State
Each agent becomes its own OpenClaw agent instance:

```
Shared Gateway (routing, inference, sessions)
  ├── Negative Keyword Agent    (own SOUL.md, workspace, scoped creds)
  ├── Ad Copy Review Agent      (own SOUL.md, workspace, scoped creds)
  ├── Budget & Pacing Manager   (own SOUL.md, workspace, scoped creds)
  ├── Google Ads Optimizer      (own SOUL.md, workspace, scoped creds)
  ├── Google Search Manager     (own SOUL.md, workspace, scoped creds)
  ├── Device & Geo Optimizer    (own SOUL.md, workspace, scoped creds)
  ├── Audience & Targeting      (own SOUL.md, workspace, scoped creds)
  ├── Creative Manager          (own SOUL.md, workspace, scoped creds)
  ├── Domain & Publisher        (own SOUL.md, workspace, scoped creds)
  ├── Frequency & Reach         (own SOUL.md, workspace, scoped creds)
  ├── Landing Page Validator    (own SOUL.md, workspace, scoped creds)
  ├── Hub Doctor                (own SOUL.md, workspace, scoped creds)
  ├── Keyword Hygiene           (own SOUL.md, workspace, scoped creds)
  └── LinkedIn Optimizer        (own SOUL.md, workspace, scoped creds)
```

**What this enables:**
- **Credential isolation** — neg keyword agent sees Google Ads, not email or Salesforce
- **Persistent memory** — each agent accumulates learnings across runs (patterns, edge cases, historical context)
- **Independent operation** — agents don't share session context, can't interfere with each other
- **External dispatch** — any orchestrator can send tasks via A2A protocol, not just Ares
- **Fleet composability** — agents can be added, removed, or shared across teams without touching other agents

**What stays shared:**
- Knowledge base (38 files, served via API)
- Database (PostgreSQL)
- Guardrails (DB-backed, read at runtime)
- Platform connectors (Python libs → become agent skills)
- Approval system (callback handler)

### Migration Path

**Phase 1 — Highest impact agents:**
Negative Keyword, Budget & Pacing, Google Ads Optimizer

**Phase 2 — Remaining operational agents:**
Ad Copy Review, Search Manager, Device/Geo, Audience, Hub Doctor, LP Validator, Keyword Hygiene

**Phase 3 — Fix and migrate:**
Creative Manager, Domain Publisher, Frequency Reach (after StackAdapt GQL fix), LinkedIn Optimizer (after API scope)

Per agent, the migration is:
- Python script → skill inside agent workspace
- Decision logic → SOUL.md instructions
- Shared env vars → scoped credentials
- Cron execution → agent session (still cron-triggered, but isolated)

### Interface Contract

For any orchestration layer or cross-team dispatch:

**Task input:**
```json
{
  "task_id": "string",
  "task_type": "budget_adjustment | keyword_pause | creative_refresh | bid_optimization | campaign_launch",
  "product": "voice-ai | sip | sms | iot | ...",
  "region": "noram | emea | apac | latam | mena",
  "priority_score": 0-100,
  "risk": "low | medium | high",
  "context": {},
  "expected_outcome": "string"
}
```

**Result output:**
```json
{
  "task_id": "string",
  "status": "completed | rejected | partial",
  "actions_taken": [],
  "metrics_before": {},
  "metrics_after": {},
  "confidence": 0.0-1.0,
  "requires_followup": false
}
```

---

## Immediate Priorities

1. Attach AI Agent + IoT SIM exclusion audiences to live SA campaigns
2. Create SA campaigns for SIP, SMS, Voice API (orphaned exclusion audiences)
3. Fix Landing Page Validator (hung runs)
4. Investigate PM2 restarts (277+)
5. Follow up on LinkedIn API scope + Community Management API approval
6. Align interface contract with AEO fleet for cross-team coordination
7. Investigate 17 Google Ads segments with 0 members
8. Complete Clearbit/country backfill for remaining ~344 ABMAccount rows
9. Build attribution query (StackAdapt domain impressions → SF pipeline)

## ABM Agent Details

All ABM agents use Lobster workflows for orchestration:
- `workflows/abm-expander.lobster` — preview → approve → execute
- `workflows/abm-pruner.lobster` — preview → approve → execute
- `workflows/abm-negative-builder.lobster` — run → report
- `workflows/abm-auditor.lobster` — run → report (read-only, no approval needed)

Expander is the only ABM agent that uses LLM (AI research step). All others are fully deterministic.
All support `--dry-run` flag.

### ABM DB Tables
| Table | Rows | Purpose |
|-------|------|---------|
| ABMAccount | 2,555 | Companies with Clearbit data (domain, country, desc, employees, industry) |
| ABMExclusion | ~1,348 | Product-scoped exclusions by negative_builder (AI Agent 262, IoT SIM 277, SIP 271, SMS 267, Voice API 271) |
| ABMCampaignSegment | 287 | Campaign-segment pairs with performance + health flags + segment sizes |
| ABMList / ABMListMember | — | ABM list membership |
| ABMListRule | 8 | ICP rules for segment building (AI Agent×4 variants, Voice API, SMS, SIP, IoT SIM) |

### Sync Cron Architecture (updated 2026-04-19)
Old single cron (6 scripts, 600s timeout) kept timing out. Split into:
- **Fast sync** (cron `bda9e9f6`): sync_local.py, sync_linkedin.py, sync_salesforce.py — every 6h at :00, 600s timeout
- **Slow sync** (cron `863f5015`): sync_ad_impressions.py, sync_creatives.py, sync_linkedin_impressions.py — every 6h at :30, 900s timeout
- Old combined cron `f2a2f45b` disabled
- All `urllib.request.urlopen()` calls have `timeout=60` to prevent hangs

### ABM Scoring Fix (2026-04-19)
**Problem:** Telecom/comm companies (IVR providers, VoIP services, call centers) scored 0.0 and were excluded from AI Agent targeting. Root cause: `clearbitTags` always `[]`, AI Agent keywords lacked telecom terms.

**Fix applied to both `abm_relevance.py` and `abm-negative-builder-agent.py`:**
- AI Agent `description_keywords`: +IVR, VoIP, voice, telephony, SMS, communication, messaging, phone, CPaaS, UCaaS, CCaaS
- AI Agent `buyer_industries`: +Telemarketing
- `strong_signals` expanded with telecom terms
- Waste penalty now has telecom override (desc with voice/VoIP/IVR partially overrides waste industry)
- Negative builder `compute_relevance_for_product()` floor of 0.35 for telecom signals
- Telemarketing + Call Center added to `tech_industries`

### StackAdapt ABM Exclusion Audiences (LIVE, 2026-04-19)
| Audience | SA ID | Domains | Status |
|----------|-------|---------|--------|
| ABM Exclusions - AI Agent | 2502391 | 262 | Ready to attach to 11 live SA campaigns |
| ABM Exclusions - IoT SIM | 2502392 | 277 | Ready to attach to 2 live SA campaigns |
| ABM Exclusions - SIP | 2502393 | 271 | Orphaned (no SA campaigns yet) |
| ABM Exclusions - SMS | 2502394 | 267 | Orphaned (no SA campaigns yet) |
| ABM Exclusions - Voice API | 2502395 | 271 | Orphaned (no SA campaigns yet) |
