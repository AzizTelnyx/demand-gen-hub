# Global Demand Engine — Execution Plan

## What the GDE Is

A coordination layer that connects two independent agent fleets (Paid + AEO) through shared knowledge, market signals, and a common task interface. Not a platform. Not a monolith. A thin layer that makes independent agents smarter by giving them better inputs and connecting their outputs.

---

## Three Layers

```
┌──────────────────────────────────────────────────────────┐
│                   KNOWLEDGE & STRATEGY                    │
│                                                          │
│  Brand · Products · Competitors · ICPs · Standards       │
│  Regional Priorities · PMM Narratives · Copy Rules       │
│                                                          │
│  38+ files today, served via API                         │
│  Every agent across both fleets reads from here          │
│  PMMs contribute narrative docs per product lane         │
│                                                          │
│  WHY SHARED: When messaging changes, every agent picks   │
│  it up. No manual propagation. One source of truth.      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    SIGNAL LAYER                           │
│                                                          │
│  Market signals that generate work for both fleets:      │
│                                                          │
│  • GSC — ranking changes, CTR shifts, new keywords       │
│  • Competitor monitoring — launches, SERP changes        │
│  • Intent signals — HockeyStack / Salesforce surges      │
│  • LLM visibility — AI search citation tracking          │
│  • Paid performance — CPA spikes, budget gaps            │
│                                                          │
│  WHY SHARED: A ranking drop on "voice AI latency"        │
│  should trigger BOTH a content refresh (AEO) AND a       │
│  paid bid adjustment (Paid). Siloed signals = missed     │
│  opportunities.                                          │
└─────────────┬────────────────────────┬───────────────────┘
              │                        │
              │    INTERFACE           │
              │    CONTRACTS           │
              │                        │
     ┌────────▼─────────┐    ┌────────▼─────────┐
     │   PAID FLEET     │    │   AEO FLEET      │
     │   (Execution)    │    │   (Execution)    │
     │                  │    │                  │
     │  10+ agents      │    │  4 agents        │
     │  Google Ads R/W  │    │  Content Creator │
     │  LinkedIn R      │    │  Content Optim.  │
     │  StackAdapt R/W  │    │  SEO Intel       │
     │  Reddit R/W      │    │  AEO Monitor     │
     │                  │    │                  │
     │  Own guardrails  │    │  Own guardrails  │
     │  Own approvals   │    │  Own approvals   │
     │  Own memory      │    │  Own memory      │
     │                  │    │                  │
     │  Changes cost    │    │  Changes cost    │
     │  money in hours  │    │  time in weeks   │
     └──────────────────┘    └──────────────────┘
```

### Why Execution Stays Separate

Paid and AEO agents have fundamentally different:
- **Risk profiles** — pausing a $500/day campaign is immediate financial impact. Publishing a blog post is not.
- **Approval gates** — paid changes above $500 need human review. Content changes need editorial review.
- **Feedback cycles** — paid results show in hours/days. SEO results show in weeks/months.
- **Platform access** — paid agents need ad platform API keys. Content agents need CMS credentials.
- **Kill switches** — paid agents halt on 50% CPA spike. Content agents halt on indexation failure.

Merging these into one fleet creates confusion about who owns what, which rules apply, and how to evaluate results. Shared intelligence, separate execution.

---

## What Exists Today

### Paid Fleet (Aziz)
See [PAID-FLEET.md](./PAID-FLEET.md) for full registry.

- 14 agents (10 operational, 3 need fix, 1 blocked)
- $140K/mo managed across 4 platforms
- Knowledge base: 38 files served via API
- Guardrails: confidence scoring, budget floors, learning period protection
- Approval system: risk-based with Telegram inline buttons + hub UI
- Database: PostgreSQL with campaigns, creatives, metrics, recommendations, changes
- BaseAgent shared class: knowledge loading, guardrails, kill switch, DB logging, Telegram reporting

### AEO Fleet (Andy)
- Currently 1 agent, splitting into 4:
  - Content Creator — brief → write → visuals → publish → index
  - Content Optimizer — refresh decaying content, A/B test, internal linking
  - SEO Intelligence — keyword research, competitive gaps, technical audits
  - AEO Monitor — AI search visibility, community monitoring
- 32 skills in `aeo-skills` repo
- Building on OpenClaw with own SOUL.md per agent

### What Neither Fleet Has
- **Signal ingestion** from external market sources
- **Cross-channel routing** (ranking changes informing paid, paid performance informing content)
- **Unified prioritization** across paid and organic work
- **Feedback loop** connecting both sides

---

## Execution Sequence

### Phase 1: Align Foundations (Week 1)

**Goal:** Both fleets on shared knowledge, clean interface contracts defined.

| Task | Owner | Output |
|------|-------|--------|
| Open knowledge base API to AEO fleet | Aziz | AEO agents can read brand/product/competitor context |
| Andy adds SEO/AEO knowledge files | Andy | Keyword targets, content pillars, LLM visibility data in shared knowledge base |
| PMMs add narrative docs per product lane | PMMs | Product positioning docs in knowledge base |
| Define paid fleet interface contract | Aziz | Task input/output JSON spec (see below) |
| Define AEO fleet interface contract | Andy | Task input/output JSON spec |
| Both fleets on shared gateway or A2A protocol | Both | Agents can receive dispatched tasks |

**Paid fleet interface contract:**
```json
// Task in
{
  "task_id": "string",
  "task_type": "budget_adjustment | keyword_pause | creative_refresh | bid_optimization",
  "product": "voice-ai | sip | sms | ...",
  "region": "noram | emea | apac | latam | mena",
  "priority_score": 0-100,
  "risk": "low | medium | high",
  "context": {},
  "expected_outcome": "string"
}

// Result out
{
  "task_id": "string",
  "status": "completed | rejected | partial",
  "actions_taken": [],
  "metrics_before": {},
  "metrics_after": {},
  "confidence": 0.0-1.0
}
```

AEO fleet defines equivalent contract for content/SEO task types.

### Phase 2: Signal Ingestion (Week 2-3)

**Goal:** Both fleets receive market signals, not just platform data.

Start with signal sources where data already exists:

| Signal Source | Data Exists? | Feeds Which Fleet |
|---------------|-------------|-------------------|
| GSC (ranking changes, keywords) | Andy likely pulls this | Both — ranking drop = content refresh + paid bid adjustment |
| Paid performance (CPA, budget, conversions) | Yes, in Paid fleet DB | Both — high CPA = pause + content alternative |
| Salesforce intent (pipeline, deal signals) | Yes, synced every 6h | Both — intent surge = content + paid targeting |
| Competitor monitoring | No — needs DataForSEO or similar | Both — competitor launch = counter content + defensive paid |
| LLM visibility | No — needs AEO tracking | AEO primarily, Paid for branded queries |

**Build order:** GSC + Paid performance first (data exists). Competitor + LLM visibility second (needs new integrations).

Each signal gets:
- Collection script (pull data, detect changes)
- Signal record in DB (source, severity, region, product, timestamp)
- Routing logic (which fleet should act on this?)

### Phase 3: Cross-Channel Routing (Week 3-4)

**Goal:** Signals automatically generate tasks for the right fleet.

- LLM classifies signals into task candidates (the only LLM step in routing)
- Deterministic scoring: `(impact × strategic weight × time sensitivity) ÷ (cost × queue saturation)`
- Risk-based dispatch:
  - Low risk → auto-dispatch to the right fleet
  - Medium → single approval
  - High → escalate to team lead
- Kill rules prevent runaway task generation (CTR floor after 3 content pieces, ROAS floor after 14 days, spend cap with zero signups)
- Queue budgets cap daily task volume per fleet

**Don't build this until Phase 2 proves signals are flowing and useful.** Premature routing = complexity without value.

### Phase 4: Feedback Loop (Week 4-5)

**Goal:** Results from both fleets feed back into signal generation.

- Paid task completes → metrics reported back → GDE evaluates outcome
- AEO task completes → ranking/traffic changes reported back → GDE evaluates outcome
- Underperformers generate remediation signals (retry, pivot, or kill)
- Outperformers generate expansion signals (scale budget, expand to new regions)
- Regional briefs auto-update based on combined paid + organic performance

### Phase 5: Pilot (Week 5-6)

**Goal:** Full loop running for one product in two regions.

- **Product:** Voice AI
- **Regions:** NORAM + EMEA
- **Signal sources:** GSC + Paid performance + Salesforce intent
- **Success criteria:** Produces more valuable work with less human coordination than manual process

```
Signal → Classify → Score → Approve → Dispatch → Execute → Measure → Adapt
                                         │                      │
                                    ┌────┴────┐            ┌────┴────┐
                                    │  Paid   │            │  AEO    │
                                    │  Fleet  │            │  Fleet  │
                                    └─────────┘            └─────────┘
```

---

## Lessons From Building the Paid Fleet

These aren't theoretical — they come from 3+ weeks of building, breaking, and fixing 14 agents.

### 1. Start with signals, not agents
The most valuable thing isn't more agents — it's better information flowing to existing agents. If paid agents knew about ranking drops and competitor launches, they'd already make better decisions. Build the signal layer first.

### 2. One channel at a time
Paid works. Next is SEO (most data-rich, most automatable). Then AEO. Then events/content. Trying to do all channels simultaneously means none of them work well.

### 3. Humans steer, agents execute
Agents propose, humans approve high-risk items, agents execute. The approval queue isn't overhead — it's how you build trust and catch mistakes. Full autonomy sounds good until an agent spends $5K on the wrong keyword.

### 4. Knowledge base is the moat
The agents are reproducible. The knowledge base — brand positioning, product context, competitive intelligence, copy rules, regional strategy — is what makes them effective. Invest there.

### 5. Don't build the orchestrator until agents conflict
A routing/prioritization layer is needed when SEO agents and paid agents propose contradictory actions on the same keyword. Until then, independent agents with shared guardrails work fine. Premature orchestration adds complexity without solving a real problem.

### 6. Database from day one
We started with flat files and moved to PostgreSQL because state management in files breaks at scale. Signals, tasks, feedback — all need proper storage. Don't repeat this lesson.

### 7. Guardrails prevent disasters
Budget floors ($10/day minimum), confidence thresholds (80% to auto-execute), learning periods (14 days for new campaigns), kill switches (50% CPA spike). Without these, agents will confidently destroy your campaigns.

### 8. Agent isolation matters
Each agent should have scoped credentials, own memory, own rules. A negative keyword agent shouldn't see your email. A content agent shouldn't have write access to ad platforms. Blast radius containment.

---

## Key Decisions

| Decision | Options | Impact |
|----------|---------|--------|
| Who owns the signal layer? | Dedicated GDE agent / Shared between teams / Ian's team | Determines who builds and maintains signal ingestion |
| Where does signal data live? | Extend existing Paid DB / New shared DB / Both | Determines data architecture |
| What's the approval surface? | Slack / Telegram / Hub UI / All | Determines where humans review tasks |
| How do fleets communicate? | A2A protocol / Shared DB / API calls | Determines integration complexity |
| V1 scope | Voice AI only / Voice AI + one more product | Determines pilot size |

---

## Team Responsibilities

### Aziz (Paid)
- Open knowledge base API for cross-team access
- Define paid fleet interface contract
- Fix 3 broken agents (StackAdapt GQL)
- Migrate agents to isolated OpenClaw instances
- Expose paid performance data as signal source

### Andy (AEO)
- Split 1 agent into 4 isolated OpenClaw instances
- Define AEO fleet interface contract
- Add SEO/AEO knowledge to shared knowledge base
- Expose GSC/ranking data as signal source

### PMMs
- Contribute product narrative docs to shared knowledge base (one per PMM lane)
- Review and validate regional briefs generated by signal layer

### GDE Owner (TBD)
- Build signal ingestion pipelines
- Build routing logic (LLM classification + deterministic scoring)
- Build feedback loop
- Maintain cross-fleet interface contracts
- Own kill rules and queue budgets

---

## File Structure

```
demand-gen-hub/
├── PAID-FLEET.md          # Paid agent registry & architecture
├── GDE-PLAN.md            # This document
├── knowledge/             # Shared knowledge base (38+ files)
│   ├── brand/
│   ├── products/
│   ├── competitors/
│   ├── icps/
│   ├── standards/
│   ├── messaging-frameworks/
│   ├── playbooks/
│   ├── verticals/
│   ├── campaigns/
│   ├── telnyx-strategy.md
│   └── product-groups.md
├── scripts/               # Agent scripts (becoming skills)
│   ├── lib/               # Shared infrastructure
│   │   ├── agent_base.py
│   │   ├── knowledge.py
│   │   ├── blocklists.py
│   │   └── approval_handler.py
│   └── *.py               # Individual agent scripts
└── src/                   # Hub UI (Next.js)
```
