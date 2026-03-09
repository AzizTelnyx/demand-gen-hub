# Channel Benchmarks & Guidelines

## Google Search
- **Best for:** High-intent capture (BOFU)
- **Typical CTR:** 3-5% for B2B branded/competitor
- **Typical CPC:** $6-20 depending on keyword competition
- **Budget type:** Daily

## LinkedIn
- **Best for:** Decision-maker reach, ABM, awareness
- **Typical CPM:** $30-80 for B2B
- **Typical CPC:** $8-15
- **Budget type:** Varies (daily or total) — can't reliably determine from API
- **Write access:** READ ONLY (r_ads scope). No campaign creation via API currently.

## StackAdapt
- **Best for:** Intent-based targeting, awareness, retargeting
- **Typical CPM:** $8-15 for display, $15-25 for native
- **Budget type:** Total campaign budget (not daily)
- **Write access:** Full (GraphQL mutations: upsertCampaign, pause/resume/archive)
- **Note:** Shows 0 conversions because we don't track them. Value shows in pipeline attribution.

## Reddit
- **Best for:** Developer audiences, community targeting
- **Typical CPM:** $5-20
- **Note:** Limited enterprise B2B audience for non-dev products

## Channel Selection by Funnel Stage
| Stage | Primary | Secondary |
|-------|---------|-----------|
| TOFU (Awareness) | StackAdapt, LinkedIn | Reddit |
| MOFU (Consideration) | LinkedIn, StackAdapt | Google Display |
| BOFU (Decision) | Google Search | LinkedIn |

## Platform API Access
| Platform | Read | Write | Notes |
|----------|------|-------|-------|
| Google Ads | ✅ | ✅ | Full Standard Access, customer_id: 2356650573 |
| StackAdapt | ✅ | ✅ | GraphQL mutations available |
| LinkedIn | ✅ | ❌ | r_ads + r_ads_reporting scopes only |
