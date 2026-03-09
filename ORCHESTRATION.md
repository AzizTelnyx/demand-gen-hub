# Orchestration System

## Flow

```
Message → Intent Router → Agent/Workflow → Results → Approval → Execution
```

### Intent Router (`src/lib/intent-router.ts`)

1. **Keyword shortcuts** (fast, no AI): regex patterns for common commands
2. **AI classification** (Sonnet): for ambiguous messages
3. **Agent mapping**: intent → agent slug

| Intent | Agent | Example |
|--------|-------|---------|
| campaign_launch | campaign-orchestrator | "Launch a Voice AI campaign" |
| ad_copy | ad-copy-generator | "Write Google Search ads for SIP" |
| keyword_research | keyword-researcher | "Keyword ideas for IoT" |
| ad_review | ad-review | "Review the Voice AI campaign copy" |
| campaign_analysis | campaign-deep-dive | "Analyze BOFU Voice AI SA US" |
| optimize | campaign-optimizer | "Optimize all Google campaigns" |
| health_check | health-check | "Health check" |
| budget | budget-calculator | "Budget for LinkedIn campaign" |
| report | reporting | "Weekly report" |
| overlap_check | overlap-checker | "Check keywords for overlap" |
| question | (direct AI answer) | "What's our top campaign?" |

### Tracker Bridge (`src/lib/tracker-bridge.ts`)

Every agent task auto-creates a Tracker entry:
- Status flow: `pending → in_progress → awaiting_approval → completed/failed`
- Visible in the hub UI tracker views

### Workflow Engine (`src/lib/workflow-engine.ts`)

For multi-step workflows (campaign launch):
- Phase-based execution with approval gates
- State persisted in `WorkflowRun` table
- Each step runs an agent via the registry
- Results accumulate in context, passed between steps
- `resumeWorkflow()` called after approval to continue

## Campaign Launch Workflow

```
INTAKE                          BUILD                           LAUNCH                    TRACK
┌─────────────────────┐        ┌─────────────────────┐        ┌──────────────────┐      ┌──────────┐
│ Parse Brief (AI)    │        │ Keyword Research     │        │ Create Plan      │      │ Tracker  │
│ Standards Check     │  ──►   │ Budget Calc          │  ──►   │ Validate (prog)  │ ──►  │ Schedule │
│ Overlap Check       │        │ Ad Copy Gen          │        │ Write Ops        │      │ Reviews  │
└──────────┬──────────┘        └──────────┬──────────┘        └────────┬─────────┘      └──────────┘
           │                              │                            │
      ⏸️ APPROVAL                    ⏸️ APPROVAL                  ⏸️ APPROVAL
```

## Approval Gates

All write operations require approval. Approval happens via:
1. **Hub UI** — Orchestration page has approve/reject buttons
2. **API** — `POST /api/workflows/approve` with `{ workflowRunId, approved, feedback }`
3. **Telegram** — (future) Ares calls the API

## Safety Invariants

These are enforced in code and cannot be bypassed:

1. **No data fabrication** — keyword volumes from API only, metrics from DB only
2. **No auto-execution** — `createWriteOp()` always sets `requiresApproval: true`
3. **Programmatic validation** — `safety.ts` has validators for:
   - Character limits (counts chars, not AI-reported)
   - No em/en dashes
   - Campaign name format (YYYYMM, no underscores)
   - UTM parameters (regex)
   - Match types (EXACT/PHRASE only, NEVER broad)
   - Google Ads settings (PAUSED, PRESENCE, SEARCH)
   - Budget math (daily × days = total ± 2%)
4. **Confidence scoring** — every output tagged HIGH/MEDIUM/LOW
5. **Cost tracking** — estimated token cost per AI call
6. **Audit trail** — every AgentRun, Recommendation, CampaignChange logged

## Adding a New Agent

1. Create `src/agents/{slug}.ts` implementing `AgentHandler` interface
2. Load knowledge via `KB.*` helpers from `src/lib/knowledge-loader.ts`
3. Use `safety.ts` validators for all programmatic checks
4. Include `computeConfidence()` in output
5. Register in `src/agents/registry.ts`
6. Seed to DB: add to `scripts/seed-agents.ts` and run it
7. If needed, add intent mapping in `src/lib/intent-router.ts`

## Error Handling

- **Step failure = workflow STOP.** No partial execution.
- Validation failures retry ONCE (built into individual agents), then stop.
- All errors logged to AgentRun with full context.
- Tracker updated to "failed" with error details.
- UI surfaces errors clearly in findings.

## Knowledge Base Usage

| Agent | Knowledge Files |
|-------|----------------|
| Ad Copy Generator | brand-messaging, ad-copy-rules, rsa-best-practices, voice-ai-landscape, products/{product} |
| Keyword Researcher | products/{product}, telnyx-icp |
| Ad Review | brand-messaging, ad-copy-rules, rsa-best-practices, products/{product} |
| Campaign Deep Dive | channel-benchmarks |
| Campaign Optimizer | campaign-orchestration (rules) |
| Campaign Orchestrator | campaign-orchestration, campaign-naming, geo-targeting, utm-tagging |
