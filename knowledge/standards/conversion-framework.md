# Telnyx Demand Gen Conversion Framework

*Last updated: 2026-02-01*

## Funnel Stages & Goals

| Stage | Conversion Goals | Priority |
|-------|------------------|----------|
| **TOFU** | Contact Sales form, Signup form | Lead volume |
| **MOFU** | Contact Sales form, Signup form | Lead quality |
| **BOFU** | SQOs (Sales Qualified Opportunities) | **Primary metric** |
| **Closed** | Deals Won | Revenue |

## Primary Metric: SQOs

**SQO = Sales Qualified Opportunity**

This is the demand gen team's north star. Everything rolls up to SQO creation and growth.

- SQOs are the handoff point between Marketing and Sales
- Indicates lead quality, not just volume
- Directly tied to pipeline and revenue

## B2B Lifecycle Context

- **Cycle length:** 3-6 months from first ad impression to deal closed
- **Journey:** Multi-touch, non-linear
- **Attribution:** Many touchpoints, significant offline activity
- **Implication:** Can't judge campaign success on same-session conversions alone

## What This Means for Analysis

1. **Don't over-index on TOFU conversions** — volume without quality is noise
2. **Track SQO attribution** — which campaigns drive qualified pipeline?
3. **Account for lag** — a campaign running today may not show SQO impact for weeks/months
4. **Offline matters** — SFDC imports capture what GA4 can't see

## Google Ads Conversion Mapping

| Conversion Action | Funnel Stage |
|-------------------|--------------|
| Signup Form Sub | TOFU/MOFU |
| Contact Sales Form Sub | TOFU/MOFU |
| SF Lead: MQL | MOFU |
| SF Lead: SQL | BOFU |
| SFDC: SQL 2023 | BOFU |
| Lead - MQL SFDC | MOFU |
| Opp - AQL SFDC (Discovery) | BOFU |
| Opp - AQL SFDC (Closed Won) | Closed |
| SF Opportunity: Won | Closed |
