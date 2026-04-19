

---

## Lobster Architecture (April 19, 2026)

**Mandate:** All ABM agents must use Lobster workflows. No standalone Python pipelines. Per SOUL.md build standards, ALL multi-step deterministic pipelines must use Lobster workflow files.

### Why Lobster

| Problem | Lobster Fix |
|---------|-------------|
| No audit trail | Each step logs inputs/outputs as structured JSON |
| No approval gates | `approval: required` on write steps — human reviews before execution |
| No deterministic/LLM separation | DB queries, Clearbit lookups, scoring = deterministic steps (0 LLM tokens). AI research = only LLM step. |
| No rollback data | Before/after captured at approval gate |
| Ad-hoc Python logging | Lobster step I/O is the audit trail |
| No reusable steps | Steps like `fetch_enriched_accounts` shared across workflows |

### Architecture: Deterministic Core + LLM Edge

```
┌─────────────────────────────────────────────────┐
│              LOBSTER WORKFLOW                    │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ DB Query │→ │ Clearbit │→ │ Scoring  │       │
│  │(det.)    │  │ (det.)   │  │ (det.)   │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│        │                            │           │
│        ▼                            ▼           │
│  ┌──────────┐               ┌──────────┐       │
│  │ SF Check │               │ LLM      │       │
│  │ (det.)   │               │ Research │       │
│  └──────────┘               │ (Expander│       │
│        │                    │  only)   │       │
│        ▼                    └──────────┘       │
│  ┌──────────┐                     │           │
│  │ APPROVAL │◄────────────────────┘           │
│  │  GATE    │                                  │
│  └────┬─────┘                                  │
│       │ approved                                │
│       ▼                                         │
│  ┌──────────┐  ┌──────────┐                     │
│  │ Executor │  │ Telegram │                     │
│  │ (write)  │  │ Summary  │                     │
│  └──────────┘  └──────────┘                     │
└─────────────────────────────────────────────────┘
```

### Workflow Files

| Workflow | File | LLM Steps | Deterministic Steps |
|----------|------|-----------|-------------------|
| Expander | `workflows/abm-expander.lobster` | 1 (AI research) | 5 (fetch, Clearbit, SF, score, execute) |
| Pruner | `workflows/abm-pruner.lobster` | 0 | 5 (fetch accounts, fetch context, SF, score, execute) |
| Negative Builder | `workflows/abm-negative-builder.lobster` | 0 | 5 (fetch enriched, fetch exclusions, SF, score, execute) |

### Executor Scripts (Write Layer)

Thin Python scripts that Lobster calls for DB writes. No scoring, no research — just execute approved changes.

| Script | What it writes |
|--------|---------------|
| `scripts/abm-expander-executor.py` | Insert ABMAccount + ABMListMember rows |
| `scripts/abm-pruner-executor.py` | Insert ABMExclusion rows |
| `scripts/abm-negative-builder-executor.py` | Insert product-scoped ABMExclusion rows |

### Legacy Scripts (Keep for Reference)

| Script | Status | Replace With |
|--------|--------|-------------|
| `scripts/abm-expander-agent.py` | Superseded by Lobster workflow | `workflows/abm-expander.lobster` + `scripts/abm-expander-executor.py` |
| `scripts/abm-pruner-agent.py` | Superseded by Lobster workflow | `workflows/abm-pruner.lobster` + `scripts/abm-pruner-executor.py` |
| `scripts/abm-negative-builder-agent.py` | Superseded by Lobster workflow | `workflows/abm-negative-builder.lobster` + `scripts/abm-negative-builder-executor.py` |

Legacy scripts contain scoring logic that should be refactored into standalone scoring modules or Lobster step commands. Do NOT delete — reference for scoring algorithms.

### Approval Flow

1. Lobster workflow runs deterministic steps → produces candidate list with scores
2. Approval gate triggered — posts candidates to Telegram thread 164 with inline buttons
3. Human approves → executor runs
4. Human rejects → workflow ends, no writes
5. All decisions logged in Lobster step output + AgentRun table

### Scoring Module (Shared)

All three workflows share the same relevance scoring algorithm. Currently duplicated across legacy scripts. TODO: extract to `scripts/abm_scoring.py` and import from Lobster steps.

**Scoring formula:**
- Description keywords: 40% weight
- Variant-specific tags: 20% weight (VARIANT_TAGS dict)
- Industry tags: 20% weight
- Tech stack: 10% weight
- Company size: 10% weight

**Thresholds:**
| Agent | Auto-execute | Review | Keep |
|-------|-------------|--------|------|
| Expander | ≥ 0.7 (TOFU: 0.6) | 0.4-0.7 | < 0.4 |
| Pruner | < 0.2 | 0.2-0.4 | ≥ 0.4 |
| Negative Builder | < 0.2 | — | ≥ 0.2 |

### Cron Scheduling

```bash
# Expander: Weekly Tuesday 5 AM PST
0 5 * * 2 cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && node /Users/azizalsinafi/.openclaw/workspace/skills/lobster/bin/lobster.js run --file workflows/abm-expander.lobster

# Pruner: Biweekly Sunday 5 AM PST
0 5 1-7,15-21 * 0 cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && node /Users/azizalsinafi/.openclaw/workspace/skills/lobster/bin/lobster.js run --file workflows/abm-pruner.lobster

# Negative Builder: Monthly 1st Sunday
0 5 1-7 * 0 cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && node /Users/azizalsinafi/.openclaw/workspace/skills/lobster/bin/lobster.js run --file workflows/abm-negative-builder.lobster
```
