# Reporting Standards & Attribution Guidelines

## Core Principle
Never be a metrics vending machine. Lead with business impact, contextualize by campaign type, and guide stakeholders toward the right conclusions.

## Lookback Windows by Campaign Type

| Campaign Type | Performance Metrics | Pipeline Attribution | Reporting Cadence |
|---------------|-------------------|---------------------|-------------------|
| Demand Capture (Google Ads) | 30 days / MTD | 90 days | Weekly/MTD |
| Broad Awareness (LinkedIn, StackAdapt) | 30 days / MTD | 90 days | Monthly |
| ABM / Named Account | 90 days (engagement) | 180 days (pipeline) | Quarterly |
| Retargeting | 14-30 days | 60 days | Monthly |

### Adjustment Rules
- **Troubleshooting a drop**: Shorten to 7-14 days
- **Quarterly business review**: Extend to full quarter or 180 days
- **New campaign (<30 days)**: Use available window, flag insufficient data

## Attribution Model

### Platform-Reported Conversions
- Last-touch (that's what Google/LinkedIn/StackAdapt report)
- Always label as "platform-reported" — these are self-attributed

### Pipeline Attribution (Salesforce)
- **Influence-based**: Did the account see our ads before becoming an opportunity?
- **Sources**: StackAdapt domain-level impressions + LinkedIn org-level impressions matched to SF accounts
- **Google Ads / Reddit**: No company-level data available — excluded from account-level attribution
- Always state: "X deals influenced" not "X deals generated" — ads are one touch in a multi-touch journey

## What to Lead With (by audience)

### When anyone asks "how are campaigns doing?"
1. **Pipeline impact first**: Deals influenced, pipeline $ generated, cost per SQO
2. **Trend context**: Is it improving or declining vs prior period?
3. **Then efficiency**: Spend, CPA, ROAS
4. **Then volume**: Impressions, clicks, CTR last

### When someone fixates on CTR/CPC/CPM
- Acknowledge the metric, then redirect:
  - "CTR is X%, but more importantly these campaigns influenced Y deals worth $Z"
- Explain why surface metrics mislead:
  - LinkedIn/StackAdapt are awareness plays — low CTR is normal and expected
  - High CTR with zero pipeline impact is worse than low CTR with deals

### When comparing platforms
- **Never compare LinkedIn CPL to Google Ads CPL** — different funnel stages
- Compare: pipeline influenced per dollar spent, cost per SQO by channel
- Google Ads = demand capture (intent-based, direct conversions)
- LinkedIn = demand creation (audience-based, influence over time)
- StackAdapt = awareness + ABM (programmatic reach, domain-level targeting)
- Reddit = community awareness (early funnel, brand)

## ABM-Specific Reporting

### Primary Metrics (in order of importance)
1. **Account penetration** — % of target list reached
2. **Pipeline influenced** — target accounts that entered pipeline during/after exposure
3. **Engagement depth** — impressions → clicks → site visits → demo requests per account
4. **Velocity** — are ABM-touched accounts moving faster through pipeline?
5. **Deal size** — are ABM-touched deals larger?

### What NOT to lead with for ABM
- CPL (irrelevant for named accounts)
- Raw conversion count (small lists = small numbers, that's expected)
- CTR (awareness impressions on known accounts don't need clicks to work)

## Comparison Windows
- **WoW**: Only for troubleshooting sudden changes
- **MoM**: Standard for trend analysis
- **QoQ**: Strategic reviews, ABM programs, executive reporting

## Report Formatting Rules
- Always include date range
- Always include lookback window for attribution
- Always show math behind derived metrics (CPA = spend / conversions)
- Flag data gaps (e.g., "Reddit conversions unavailable via API")
- Flag attribution coverage (e.g., "LinkedIn org mapping at X% — pipeline numbers are conservative")
