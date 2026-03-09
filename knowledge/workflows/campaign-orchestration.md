# Campaign Orchestration Workflow

## 4 Phases: Intake → Build → Launch → Track

### Phase 1: INTAKE
1. **Parse Brief** — Extract: ICP, competitors, keywords, value props, landing page, funnel stage, product
2. **Check Standards** — UTM format, naming convention, brand guidelines, geo targeting rules
3. **Check Overlap** — Query existing Google Ads keywords, flag conflicts
4. **Present for Approval** — STOP. Wait for approval before BUILD.

### Phase 2: BUILD
1. **Keyword Research** — Google Ads Keyword Planner API, per-country breakdown, real data only
2. **Budget Calculation** — Formula: `(Daily Searches × CTR × CPC) × 1.2`, show all math
3. **Structure Planning** — Decision tree based on volume, keyword count, competitor presence
4. **Ad Copy Generation** — Unique per ad group, pinned H1/H2, UTMs on final URLs
5. **Present Full Plan** — STOP. Wait for approval before LAUNCH.

### Phase 3: LAUNCH
1. **Create Campaign** — status=PAUSED, Presence only, no underscores in name
2. **Create Ad Groups** — CPC bids calculated
3. **Add Keywords** — Correct match types, no duplicates
4. **Create Ads** — UTMs verified, pinning verified, copy matches theme
5. **Final QA** — Query created campaign, verify all settings match plan

### Phase 4: POST-LAUNCH
1. **Log to Tracker** — Campaign name, budget, keywords, ads, review schedule
2. **Schedule Reviews** — Day 3, Week 1, Week 2, Month 1
3. **Health Monitor** — Ongoing performance monitoring

## Validation Gates
| Gate | Condition | If Fail |
|------|-----------|---------|
| Post-INTAKE | Aziz approval | Wait |
| Post-Overlap | status == "PASS" | Stop, report conflicts |
| Post-BUILD | Aziz approval | Wait |
| Post-Validator | status == "PASS" | Stop, report issues |

## Error Handling
1. Log the error
2. Report with context
3. Do NOT proceed to next step
4. Wait for guidance

## Campaign State Schema
```json
{
  "campaign_name": "202602 BOFU AI Agent LiveKit SA GLOBAL",
  "phase": "INTAKE | BUILD | LAUNCH | LIVE | COMPLETED",
  "sub_agent_outputs": { ... },
  "approvals": { "intake": {}, "build": {} },
  "google_ads": { "campaign_id": null, "ad_group_ids": [] }
}
```

## Optimization Rules (Post-Launch)
### Auto-pause if:
- Spend > $300 AND conversions = 0
- CTR < 0.5% for 7+ days

### Auto-scale if:
- CTR > 3% AND CPA < target
- Impression share < 50% (increase budget)

### Bidding switch:
- Manual → Max Conversions (3+ conversions)
- Max Conversions → Target CPA (30+ conversions)

### Add negatives if:
- Search term = 0 conversions AND $50+ spend
