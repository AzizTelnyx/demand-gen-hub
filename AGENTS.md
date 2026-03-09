# Demand Gen Hub — Agent Documentation

## Architecture

All agent logic lives in the hub (src/agents/). All state in PostgreSQL via Prisma. The orchestration API (`POST /api/orchestrate`) is the single entry point — any client (Telegram, hub UI, CLI) calls the same backend.

**Safety principles (non-negotiable):**
- Never fabricate data. API fails = STOP.
- Never auto-execute writes. All write ops require approval.
- Validate programmatically, not via AI (char limits, UTMs, match types).
- Knowledge base grounding — copy must cite messaging pillars.
- Confidence scoring on all outputs: HIGH / MEDIUM / LOW.
- Full audit trail on every run.

## Agents

### 1. Health Check (`health-check`)
**What:** Scans all active campaigns for delivery issues and spend anomalies.
**Knowledge:** None (data-driven).
**Input:** None required.
**Output:** Findings (zero impressions, spend-no-conversions, overpacing, underpacing, high CPC, low CTR).
**No AI.** Pure database queries with threshold rules.

### 2. Creative Review (`creative`)
**What:** AI analysis of ad creatives with copy suggestions.
**Knowledge:** Brand messaging, product files, competitor landscape.
**Input:** Automatic (scans top 30 campaigns by spend).
**Output:** Copy refresh recommendations, A/B test suggestions, pillar coverage gaps.
**Uses Sonnet** for analysis.

### 3. Ad Copy Generator (`ad-copy-generator`)
**What:** Generates platform-specific ad copy grounded in knowledge base.
**Knowledge:** `brand/brand-messaging-q1-2026.md`, `standards/ad-copy-rules.md`, `standards/google-ads-rsa-best-practices.md`, `competitors/voice-ai-landscape.md`, `products/{product}.md`.
**Input:** `{ product, funnel_stage, channel, competitors, landing_page, ad_groups }`
**Output:** Headlines + descriptions per ad group, tagged with messaging pillars.
**Validation:** Programmatic char limits (Google: 30/90, LinkedIn: 200/600, StackAdapt: 90/150), em dash check, duplicate check, pillar citation check.
**Uses Sonnet** for generation, then validates every character count in code.

### 4. Keyword Researcher (`keyword-researcher`)
**What:** Keyword ideas via Google Ads Keyword Planner API.
**Knowledge:** `products/{product}.md`, `standards/telnyx-icp.md`.
**Input:** `{ product, competitors, regions, seed_keywords }`
**Output:** Keywords with volume, CPC, competition per country.
**Classification:** >5K/mo (standalone), 1-5K/mo (regional), <1K/mo (skip).
**Match types:** EXACT for competitor/branded, PHRASE for solution terms. **NEVER broad.**
**API failure = STOP.** Never fabricates volume data.
**Calls:** `scripts/keyword-research.py` → Google Ads KeywordPlanIdeaService.

### 5. Budget Calculator (`budget-calculator`)
**What:** Deterministic budget math. No AI.
**Knowledge:** Channel benchmarks (hardcoded from `playbooks/channel-benchmarks.md`).
**Input:** `{ channel, keyword_data, goal, duration_days, regions }`
**Formulas:**
- Google: `(Daily Searches × CTR × Avg CPC) × 1.2 buffer`
- LinkedIn: `(Target Impressions ÷ 1000 × CPM) × 1.2 buffer` (CPM $30-80)
- StackAdapt: `(Target Impressions ÷ 1000 × CPM) × 1.2 buffer` (display $8-15, native $15-25)
**Always shows math.** Budget math validated programmatically (daily × days = total ± 2%).

### 6. Ad Review (`ad-review`)
**What:** Reviews existing ad copy for brand alignment.
**Knowledge:** `brand/brand-messaging-q1-2026.md`, `standards/ad-copy-rules.md`, `standards/google-ads-rsa-best-practices.md`, `products/{product}.md`.
**Input:** `{ campaign_name, ad_copy: { headlines, descriptions }, platform }`
**Output format:** `CURRENT → ISSUE → USE THIS` (exact replacement copy).
**Validation:** Programmatic char limits on original AND replacement text.
**Uses Sonnet** for messaging analysis. AI replacements that exceed char limits are flagged.

### 7. Campaign Deep Dive (`campaign-deep-dive`)
**What:** Deep performance analysis of a specific campaign.
**Knowledge:** `playbooks/channel-benchmarks.md`.
**Input:** `{ campaign_name, platform, days }`
**Output:** Performance metrics, account-average benchmarks, search term waste, geo/device breakdown.
**Data:** Tries live API first, falls back to DB with warning.
**Uses Sonnet** only for narrative synthesis (never for numbers).

### 8. Campaign Optimizer (`campaign-optimizer`)
**What:** Rule-based optimization recommendations.
**Knowledge:** `workflows/campaign-orchestration.md` (rules).
**Input:** `{ scope, platform_filter }`
**Rules:**
- Auto-pause: spend >$300 + 0 conversions
- Auto-pause: CTR <0.5% with 5K+ impressions
- Scale: CTR >3% + has conversions
- Bid switch: Manual→MaxConv (3+ conv), MaxConv→TargetCPA (30+ conv)
**Exclusions:** Campaigns <14 days old, TOFU/MOFU exempt from conversion alerts.
**NEVER auto-executes.** All recommendations require approval.
**Platforms:** Google Ads + StackAdapt (can execute), LinkedIn (recommend only).

### 9. Overlap Checker (`overlap-checker`)
**What:** Checks proposed keywords against existing account keywords.
**Knowledge:** None (data-driven).
**Input:** `{ proposed_keywords }`
**Output:** PASS/FAIL verdict, exact conflicts, partial overlaps, safe keywords list.
**Data:** Queries Google Ads API for existing keywords. API fail = STOP.
**Calls:** `scripts/keyword-research.py --mode existing-keywords`.

### 10. Reporting (`reporting`)
**What:** Performance summary with top/bottom performers and alerts.
**Knowledge:** None (data-driven).
**Input:** `{ period, platform_filter }`
**Output:** Spend by platform, top 5 by efficiency, bottom 5 (zero conversions), alerts, pipeline data.
**Uses Sonnet** for executive narrative only. All numbers from DB.

### 11. Campaign Orchestrator (`campaign-orchestrator`)
**What:** Master workflow that chains sub-agents through 4 phases.
**Knowledge:** All KB files relevant to campaign creation.
**Input:** `{ brief, phase }`
**Phases:**
1. **INTAKE:** Parse brief (AI), standards validation (programmatic), overlap check → APPROVAL GATE
2. **BUILD:** Keyword research, budget calc, ad copy gen → APPROVAL GATE
3. **LAUNCH:** Create campaign plan, validate settings (programmatic) → APPROVAL GATE
4. **TRACK:** Create tracker, schedule reviews → DONE
**Every phase pauses for human approval.** Campaign always created PAUSED.
**Uses Opus** via gateway (orchestration-level reasoning).

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/orchestrate` | POST | Main entry — intent classification → agent routing |
| `/api/workflows/status` | GET | List workflow runs or get specific run details |
| `/api/workflows/approve` | POST | Approve/reject workflow step or recommendation |
| `/api/agents/run` | POST | Direct agent execution (existing) |
| `/api/agents/status` | GET | All agents with last run info (existing) |
| `/api/agents/recommendations` | GET/POST | List/approve recommendations (existing) |

## Python Scripts

| Script | Purpose |
|--------|---------|
| `scripts/keyword-research.py` | Keyword Planner API (ideas + existing keywords) |
| `scripts/create-campaign.py` | Google Ads campaign creation (PAUSED, PRESENCE, SEARCH, no broad) |
| `scripts/optimize-campaign.py` | Pause/enable/budget/bid/negatives via Google Ads API |
