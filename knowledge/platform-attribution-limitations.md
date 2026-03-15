# Platform Attribution Limitations

## Domain-Level Attribution by Platform

| Platform    | Domain/Company-Level Data | Notes |
|-------------|--------------------------|-------|
| **StackAdapt** | ✅ Yes — B2B domain impressions | Primary source for domain-level attribution. Uses `B2B_DOMAIN` attribute in campaignInsight API. |
| **LinkedIn**   | ✅ Yes — Company impressions | Uses `MEMBER_COMPANY` pivot in adAnalyticsV2. Requires `LinkedInOrgMapping` table to resolve org IDs → domains. Synced by `sync_linkedin_impressions.py`. |
| **Google Ads** | ❌ No | Google Ads does **not** provide company or domain-level impression data. Only campaign-level metrics (impressions, clicks, cost) are available. Records stored with `domain='__campaign__'`. This is a **platform limitation**, not a bug. |
| **Reddit**     | ❌ No | Reddit Ads API only provides campaign-level metrics. No company/domain attribution. Records stored with `domain='__campaign__'`. |

## Impact on Pipeline Attribution

The pipeline page (`/api/pipeline`) matches `AdImpression.domain` against `SFOpportunity.accountDomain` to determine which deals were "ad-exposed."

- Only **StackAdapt** and **LinkedIn** contribute to deal-level attribution
- Google Ads and Reddit contribute to **platform totals** (spend, impressions) but cannot attribute to specific deals
- This means Google Ads ROI cannot be measured at the deal level through impression matching — only through Salesforce opportunity source/campaign membership

## Match Rate (as of March 2026)

- SF Opportunity domains: ~2,384
- Ad impression domains (StackAdapt + LinkedIn): ~11,926
- **Matched domains: 329** (~13.8% of SF opportunity domains have ad impression data)

The match rate is bounded by:
1. StackAdapt B2B domain coverage (not all impressions resolve to domains)
2. LinkedIn org → domain mapping completeness
3. SF opportunity domain cleanliness (some have no domain or malformed domains)
