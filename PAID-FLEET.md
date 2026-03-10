# Paid Fleet — Agent Registry & Architecture

## Overview

The Paid Fleet manages $140K/mo in ad spend across Google Ads, LinkedIn, StackAdapt, and Reddit. 14 agents (10 operational, 3 broken, 1 blocked) run daily on cron schedules with shared infrastructure for knowledge, guardrails, approvals, and metrics.

All agents are currently Python scripts orchestrated by Ares (the main OpenClaw agent). The next step is migrating each to its own OpenClaw agent instance with isolated workspace, memory, and scoped credentials.

---

## Agent Registry

### Operational ✅

| # | Agent | Script | Schedule | What It Does | Platform Access Needed |
|---|-------|--------|----------|-------------|----------------------|
| 1 | **Negative Keyword Agent** | `negative-keyword-agent.py` | Daily 2 AM | AI-powered search term analysis, auto-blocks ≥80% confidence, flags rest for review | Google Ads (read/write) |
| 2 | **Ad Copy Review Agent** | `ad-copy-review-agent.py` | Daily 3 AM | Audits active ad creatives against brand/copy rules, flags violations | Google Ads (read), LinkedIn (read), StackAdapt (read) |
| 3 | **Google Ads Optimizer** | `google-ads-optimizer.py` | Daily 4 AM | Budget efficiency, impression share, keyword performance, campaign health | Google Ads (read/write) |
| 4 | **Keyword Hygiene Agent** | `keyword-hygiene-agent.py` | Weekly Sun 3 AM | Deep keyword cleanup — duplicates, low performers, match type conflicts | Google Ads (read/write) |
| 5 | **Hub Doctor** | `hub-doctor.py` | Daily 6 AM | System health: PM2, crons, DB, syncs, APIs, agent run status | Internal only (DB, PM2, APIs) |
| 6 | **Budget & Pacing Manager** | `budget-pacing-manager.py` | Fleet daily 7 AM | Multi-platform budget optimization, pacing analysis, reallocation proposals | Google Ads, LinkedIn, StackAdapt, Reddit (read) |
| 7 | **Google Search Manager** | `google-search-manager.py` | Fleet daily 7 AM | Keyword pauses, device bid adjustments based on performance | Google Ads (read/write) |
| 8 | **Audience & Targeting Optimizer** | `audience-targeting-optimizer.py` | Fleet daily 7 AM | ABM audience contamination scanning, targeting hygiene | LinkedIn (read), StackAdapt (read) |
| 9 | **Device & Geo Optimizer** | `device-geo-optimizer.py` | Fleet daily 7 AM | Device bid adjustments, geographic performance analysis | Google Ads (read/write) |
| 10 | **Landing Page & UTM Validator** | `landing-page-validator.py` | Fleet daily 7 AM | Validates landing page URLs, UTM parameters, checks for broken links | Google Ads (read), HTTP access |

### Broken ⚠️ (StackAdapt GQL timeout)

| # | Agent | Script | Issue | Fix Needed |
|---|-------|--------|-------|-----------|
| 11 | **Creative Manager** | `creative-manager.py` | Hangs on `get_creative_metrics()` | Fix StackAdapt GQL connector method |
| 12 | **Domain & Publisher Manager** | `domain-publisher-manager.py` | Hangs on `get_domain_report()` | Fix StackAdapt GQL connector method |
| 13 | **Frequency & Reach Manager** | `frequency-reach-manager.py` | Hangs on frequency cap API | Fix StackAdapt GQL connector method |

### Blocked 🔴

| # | Agent | Blocker |
|---|-------|---------|
| 14 | **LinkedIn Optimizer** | Needs `rw_ads` + `r_organization_social` API scope approval from LinkedIn |

---

## Shared Infrastructure

### BaseAgent Class (`scripts/lib/agent_base.py`)
Every agent inherits from `BaseAgent`, which provides:
- **Knowledge loading** — reads from shared knowledge base at runtime
- **Guardrails enforcement** — confidence thresholds, budget floors, learning period protection, max actions per campaign per day
- **Kill switch** — halts execution if CPA spikes >50%
- **DB integration** — logs runs, findings, recommendations, applied changes
- **Telegram reporting** — posts summaries + inline approval buttons to Agent Activity topic
- **Rollback data** — stores pre-change state for every modification

### Knowledge Base (`knowledge/` — 38 files)
Shared context every agent reads at runtime:

| Category | Files | What It Covers |
|----------|-------|---------------|
| `brand/` | Brand messaging, tone, 4 pillars, proof points | How Telnyx talks |
| `products/` | Per-product positioning, features, differentiators | What Telnyx sells |
| `competitors/` | Twilio, Vonage, Bandwidth, Plivo competitive intel | Who we compete with |
| `icps/` | Ideal customer profiles by vertical and use case | Who we sell to |
| `standards/` | Ad copy rules, creative specs, RSA best practices | How agents write/design |
| `messaging-frameworks/` | Per-product messaging (voice API, contact center, healthcare) | Deep product narratives |
| `playbooks/` | Campaign playbooks, launch sequences | How to execute |
| `verticals/` | Healthcare, financial services, contact center | Industry-specific context |
| `campaigns/` | Active campaign context, intent mapping | Current campaign state |
| Root files | `telnyx-strategy.md`, `product-groups.md`, `budget-config.json` | Overall strategy + structure |

**Served via API:** `GET /api/context?section=<name>` — any agent (Python, OpenClaw, external) can request knowledge at runtime.

### Guardrails System (DB-backed)
Runtime rules every agent respects:

| Rule | Value | What It Prevents |
|------|-------|-----------------|
| Budget floor | $10/day per campaign | Agents can't kill campaigns entirely |
| Max budget change | $500 without approval | Large spend shifts need human review |
| Cross-product reallocation | Always requires approval | Moving money between products = strategic decision |
| Learning period | 14 days for new campaigns | Agents don't optimize campaigns that haven't had time to learn |
| Confidence threshold | 80% to auto-execute | Below 80% → recommend only, human approves |
| Max actions/campaign/day | 3 | Prevents agents from thrashing the same campaign |
| Kill switch | 50% CPA spike | Emergency halt if something goes wrong |

### Approval System
- **Risk-based routing:** High confidence + low risk = auto-execute. Everything else = human review.
- **Telegram inline buttons:** ✅ Approve / ❌ Reject on each recommendation
- **Unified callback handler:** `scripts/lib/approval_handler.py` routes all button clicks
- **Hub UI:** Approval queue with full context on `/agents` page

### Platform Connectors
| Platform | Read | Write | Connector |
|----------|------|-------|-----------|
| Google Ads | ✅ | ✅ (Standard Access) | `scripts/lib/google_ads.py` |
| LinkedIn | ✅ | ❌ (read-only) | `scripts/lib/linkedin.py` |
| StackAdapt | ✅ | ✅ (92 GQL mutations) | `scripts/lib/stackadapt.py` |
| Reddit | ✅ | ✅ | `scripts/lib/reddit.py` |

### Database (PostgreSQL `dghub`)
Key tables agents read/write:

| Table | What It Stores |
|-------|---------------|
| `Campaign` | All campaigns across platforms with parsed context (product, region, intent, variant) |
| `AdCreative` | 10K+ ad creatives synced from all platforms |
| `AdImpression` | Impression/click/conversion data (campaign + domain level) |
| `Recommendation` | Agent-generated recommendations with confidence, status, callback data |
| `CampaignChange` | Applied changes with rollback data and agent attribution |
| `AgentRun` | Execution logs per agent per run |
| `AgentGuardrail` | Runtime guardrail config (key-value) |
| `RegionalPriority` | Region × product priority weights per quarter |
| `BudgetAllocation` | Per-platform monthly budget allocations |

### Blocklists (`scripts/lib/blocklists.py`)
- 15 competitors (Twilio, Vonage, etc.)
- 8 tech giants (Google, Amazon, etc.)
- 5 email providers
- Used by negative keyword agent, audience optimizer, and creative manager

---

## Cron Schedule

| Time (PST) | Agent | Frequency |
|------------|-------|-----------|
| 1:00 AM | DB Backup + GitHub push | Daily |
| 2:00 AM | Negative Keyword Agent | Daily |
| 3:00 AM | Ad Copy Review Agent | Daily |
| 3:00 AM (Sun) | Keyword Hygiene Agent | Weekly |
| 4:00 AM | Google Ads Optimizer | Daily |
| 5:00 AM | LinkedIn Org Mapping Rebuild | Daily |
| 6:00 AM | Hub Doctor | Daily |
| 7:00 AM | **Fleet Run** (Budget Pacing → Google Search → Audience → Device/Geo → Creative → Domain → Frequency → LP Validator) | Daily |
| 4:00 AM (Sun) | Fleet Deep Analysis (--deep flag) | Weekly |
| 5:00 AM (Mon) | Audience Hygiene Scan | Weekly |
| Every 6h | Campaign Sync (all platforms + Salesforce) | 4x daily |

---

## Migration Plan: Python Scripts → OpenClaw Agents

### Current State
All agents are Python scripts sharing `BaseAgent` class, run by cron via the main Ares OpenClaw instance.

### Target State
Each agent becomes its own OpenClaw agent with:
- Own `SOUL.md` (agent personality, decision rules, boundaries)
- Own `workspace/` (memory, state, config)
- Own `skills/` (the Python script becomes a skill)
- Scoped credentials (only the platform access it needs)
- Shared gateway (routing, inference, sessions)

### Migration Sequence

**Phase 1: High-value agents first**
1. Negative Keyword Agent → own instance (highest daily impact, clearest boundaries)
2. Budget & Pacing Manager → own instance (cross-platform, most complex decisions)
3. Google Ads Optimizer → own instance (write access to largest spend platform)

**Phase 2: Remaining operational agents**
4. Ad Copy Review → own instance
5. Google Search Manager → own instance  
6. Device & Geo Optimizer → own instance
7. Audience & Targeting → own instance
8. Hub Doctor → own instance
9. Landing Page Validator → own instance
10. Keyword Hygiene → own instance

**Phase 3: Fix broken + unblock new**
11. Fix StackAdapt GQL → migrate Creative Manager, Domain Publisher, Frequency Reach
12. LinkedIn API scope → build LinkedIn Optimizer

### What Changes Per Agent

| Component | Before (Python script) | After (OpenClaw agent) |
|-----------|----------------------|----------------------|
| Identity | Class name in Python | `SOUL.md` — full personality, rules, boundaries |
| Logic | Python code in `BaseAgent` subclass | SOUL.md instructions + skills |
| State | DB rows only | Own `memory/` directory + DB |
| Credentials | Shared env vars | Scoped per agent |
| Execution | Cron → Python | Cron → OpenClaw agent session |
| Communication | Telegram via Bot API | Native OpenClaw channel |
| Orchestration | Ares spawns via cron | GDE dispatches via A2A or Lobster |

### What Stays the Same
- Knowledge base (shared, read via API)
- Database (shared PostgreSQL)
- Guardrails (shared, read from DB)
- Platform connectors (shared Python libs, become skills)
- Approval system (shared callback handler)

---

## Integration with Global Demand Engine

### How GDE Dispatches to Paid Fleet
```
GDE Signal → Router → Task → A2A dispatch → Paid Agent → Execute → Report back
```

### Interface Contract

**GDE → Paid Agent (task input):**
```json
{
  "task_id": "gde_20260310_001",
  "task_type": "budget_adjustment | keyword_pause | creative_refresh | bid_optimization",
  "product": "voice-ai",
  "region": "emea",
  "priority_score": 82,
  "risk": "low | medium | high",
  "context": {
    "signal_source": "gsc_ranking_drop | paid_performance | competitor_launch",
    "data": { }
  },
  "expected_outcome": "description of desired result"
}
```

**Paid Agent → GDE (result output):**
```json
{
  "task_id": "gde_20260310_001",
  "status": "completed | rejected | partial",
  "actions_taken": [],
  "metrics_before": {},
  "metrics_after": {},
  "confidence": 0.85,
  "requires_followup": false
}
```

### What the GDE Unlocks for Paid
- **Cross-channel signals:** Ranking drops inform bid strategy, competitor launches trigger defensive campaigns
- **Unified prioritization:** Paid tasks scored alongside AEO tasks for optimal resource allocation  
- **Feedback loops:** Paid performance feeds back into regional briefs that inform all teams
- **PMM integration:** Product narrative changes auto-propagate to ad copy and creative rules

---

## Next Steps

1. **Fix broken agents** — StackAdapt GQL connector methods (unblocks 3 agents)
2. **Agent registry for Ian** — this document ✅
3. **Migrate first 3 agents** to own OpenClaw instances (Neg Keyword, Budget Pacing, Google Ads Optimizer)
4. **Define paid interface contract** for GDE dispatch
5. **Sync with Andy** — align AEO fleet contract so GDE can route to both
6. **Open knowledge base** — make `/api/context` accessible to GDE and AEO fleet
7. **LinkedIn API scope** — follow up with Josh to unblock LinkedIn Optimizer
