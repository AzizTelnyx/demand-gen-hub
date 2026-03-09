# Telnyx Demand Gen Strategy Reference

*Moved from USER.md — 2026-02-17*
*Read on demand, not auto-loaded*

---

## Strategic Goals

1. **Scale enterprise pipeline** — shift from SMB-heavy to higher-value enterprise
2. **Improve lead quality over volume** — leads that convert to SQOs and revenue
3. **Build predictable demand engine** — repeatable programs with clear ROI
4. **Enable Sales with high-intent accounts** — intent data + ABM
5. **Prove marketing's revenue contribution** — pipeline influence, not just MQLs
6. **Globalize demand programs** — localized campaigns across regions

---

## Strategic Challenges

- Balancing self-serve developer motion with high-touch enterprise sales
- Competing against larger, better-funded competitors (Twilio)
- Educating market on Telnyx's infrastructure advantages
- Aligning Marketing, Sales, RevOps on funnel definitions
- Building attribution for long, multi-touch enterprise cycles
- Scaling without scaling headcount → automation and AI

---

## Key Metrics

- Inbound leads
- SQOs (Sales Qualified Opportunities)
- Pipeline generated and influenced
- Pipeline velocity
- Customer acquisition cost (CAC)
- Channel and campaign ROI
- Website conversion rates

---

## Success Definitions

- **Leading:** Inbound volume, lead→MQL, MQL→SQO conversion, cost per SQO
- **Lagging:** Pipeline created/influenced, closed-won revenue, CAC payback
- **Efficiency:** CAC by channel, ROI by campaign, budget pacing
- **Quality:** SQO acceptance rate, avg deal size, sales feedback

---

## Aziz's Responsibilities

- Own global demand generation strategy (AMER, EU, APAC, MENA)
- Drive inbound demand and SQO creation with Sales and RevOps
- Execute campaigns across paid, ABM, lifecycle, and web
- Own marketing budget, pacing, and ROI accountability
- Lead paid acquisition (Google, LinkedIn, StackAdapt, Reddit)
- Coordinate with Product Marketing on positioning/launches
- Build enterprise ABM programs
- Establish funnel analytics and attribution reporting

---

## Cross-Functional Dynamics

- **Sales:** Primary customer — demand gen feeds them qualified opportunities
- **RevOps:** Funnel definitions, Salesforce, attribution, reporting
- **Product Marketing:** Messaging, positioning, competitive intel, launches
- **Content:** Campaign assets, landing pages, nurture sequences
- **Finance:** Budget planning, spend forecasting, ROI reporting

---

## Regional Structure

| Region | Budget Share | Focus | Status |
|--------|------------|-------|--------|
| AMER | 45% | Full product stack — AI Agent, Voice API, SIP, SMS, Numbers, IoT SIM | Mature, scaling |
| EMEA | 35% | Enterprise, Voice AI, SIP | Growing |
| APAC | 15% | Voice AI only, competitor takeouts. SIP/IoT winding down | Restructured Feb 2026 |
| MENA | 5% | Emerging | Early |

**APAC regional shift (Feb 2026):** Budget reallocated from legacy SIP/IoT to AI Agent. All new APAC campaigns launched Feb 19, 2026: Vapi, ElevenLabs, LiveKit, AI Agent Contact Center, Retell, MOFU AI Agent. Legacy IoT/SIP APAC campaigns paused.

**Geographic mapping:**
- AMER = US, Canada, Latin America
- EMEA = UK, EU, Middle East (some campaigns include AU/NZ/SG as catch-all — this is a known legacy issue, AU/NZ belong in APAC)
- APAC = Australia, New Zealand, Singapore, Japan, India, Southeast Asia
- MENA = UAE, Saudi Arabia, Egypt, etc.

---

## Campaign Naming Convention

Format: `[Product] [Type] [Funnel] [Region]`

Examples:
- `Voice API SA MOFU APAC` = Voice API, StackAdapt, Mid-Funnel, APAC
- `SIP Trunking GS BOFU AMER` = SIP Trunking, Google Search, Bottom-Funnel, AMER
- `TOFU AI Agent Contact Center SI EMEA` = AI Agent (Contact Center use case), LinkedIn, Top-Funnel, EMEA

Abbreviations:
- GS = Google Search, GD = Google Display, SA = StackAdapt, LI = LinkedIn, DA = Display Ads
- TOFU = Top of Funnel (awareness), MOFU = Mid Funnel (consideration), BOFU = Bottom of Funnel (conversion)
- NA = Native Ads

**Note:** The YYYYMM prefix in some campaign names is NOT the launch date. Don't use it for age calculations. Use the campaign's API `startDate`.

---

## Measurement Framework

### Conversion Model (per platform)

| Platform | Conversion Type | What It Measures | How |
|----------|----------------|------------------|-----|
| Google Ads | `all_conversions` | Pixel + offline SF conversions | Direct tracking — Contact Sales forms, signups |
| LinkedIn | ABM influence | Pipeline influence via impressions | Domain matching — company impressions matched to SF accounts |
| StackAdapt | ABM influence | Pipeline influence via impressions | B2B domain reports matched to SF accounts |

**Critical:** LinkedIn and StackAdapt showing "0 conversions" is **expected and correct**. They are ABM/impression channels. Measuring them by pixel conversions is wrong. Pipeline influence is measured through domain-level attribution (ad impressions on company domains → matched to Salesforce accounts with open deals).

### Product-Specific Conversion Paths

- **Legacy products (SIP, IoT):** Contact Sales is the primary conversion → measured via UTM/website attribution → HockeyStack → Salesforce
- **AI/Voice AI products:** Signups > Contact Sales (developers test the platform first). Many could be ICPs but too new to tell.
- **ABM platforms (LinkedIn/StackAdapt):** Count pipeline influence, not clicks/conversions. Not comparable to Google (high-intent search).

### Campaign Performance Rules

- **14-day learning phase:** Campaigns live <14 days are "still learning." Don't flag them for low performance or recommend changes.
- **BOFU $0 conversions alert:** Only flag Google Ads BOFU campaigns for $0 conversions. TOFU/MOFU are awareness — not meant to convert directly. LinkedIn/StackAdapt are never flagged for $0 conversions.
- **Active campaigns only:** Default to active campaigns (Google/LinkedIn: `enabled`, StackAdapt: `live`). Don't include paused/ended unless explicitly asked.
- **Budget types vary:** Google Ads budget = daily. StackAdapt budget = lifetime per flight. LinkedIn = varies (daily or monthly, can't reliably determine from API). Don't calculate pacing.

### Platform Status Values

| Platform | Active | Inactive |
|----------|--------|----------|
| Google Ads | `enabled` | `paused` |
| LinkedIn | `enabled` | `paused` |
| StackAdapt | `live` | `ended` |

---

## Current Priorities (Updated Feb 2026)

1. Voice AI campaigns globally — Telnyx's growth bet
2. Competitor takeout campaigns (LiveKit, ElevenLabs, Vapi, Retell)
3. Enterprise pipeline through ABM
4. Marketing foundation in APAC (content, SEO, localization, user journeys)
5. Attribution model build-out (LinkedIn + StackAdapt domain matching → SF pipeline)
