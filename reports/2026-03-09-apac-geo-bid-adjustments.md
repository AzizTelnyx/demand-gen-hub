# APAC AI Agent Campaigns — Geo Bid Adjustments
**Date:** March 9, 2026
**Changed by:** Aziz Alsinafi (via Ares)

---

## Problem
Telnyx was not showing up on Google Search for "voice ai" in Sydney, Australia despite running 5 active APAC AI Agent campaigns.

## Root Cause Analysis

### 1. Budget consumed by low-value geos
APAC spend breakdown (last 30 days) showed Pakistan, Indonesia, and Philippines consuming **67% of the total APAC budget** due to ultra-low CPCs ($0.26-$0.32), while Australia received only **5.6% of spend**:

| Country | Spend | % of Budget | Conv | CPC |
|---------|-------|-------------|------|-----|
| Pakistan | $2,007 | 34.5% | 32 | $0.32 |
| Indonesia | $1,077 | 18.5% | 0 | $0.26 |
| Philippines | $838 | 14.4% | 8 | $0.28 |
| Malaysia | $727 | 12.5% | 5 | $0.67 |
| Thailand | $519 | 8.9% | 2 | $0.70 |
| Australia | $327 | 5.6% | 1 | $2.32 |
| Singapore | $227 | 3.9% | 1 | $3.50 |
| Japan | $90 | 1.5% | 0 | $1.58 |

Google's algorithm was optimizing for cheap clicks in low-CPC countries rather than business-valuable impressions in high-CPC markets (AU, SG, JP).

### 2. Impression share loss
APAC campaigns were showing for only **23-36% of eligible searches**, losing 44-55% to budget constraints:

| Campaign | Impression Share | Lost to Budget | Lost to Rank |
|----------|-----------------|----------------|--------------|
| MOFU AI Agent APAC | 32% | 44% | 23% |
| TOFU ElevenLabs APAC | 24% | 55% | 21% |
| TOFU Vapi APAC | 36% | 50% | 14% |
| TOFU Contact Center APAC | 23% | 23% | 55% |
| TOFU LiveKit APAC | 73% | 6% | 21% |

### 3. Missing geo targeting
4 of 5 APAC campaigns (MOFU, ElevenLabs, Vapi, LiveKit) **do not target Australia at all**. Only Contact Center includes AU in its geo targets. This is the primary reason for low visibility in Sydney.

## Changes Applied

### Geo Bid Adjustments (19 total)

| Geo | Adjustment | Rationale |
|-----|-----------|-----------|
| 🇦🇺 Australia | **+50%** | High-value market, enterprise pipeline potential. Only applied to Contact Center (only campaign targeting AU). |
| 🇸🇬 Singapore | **+30%** | High-value market, strong enterprise presence |
| 🇯🇵 Japan | **+20%** | Growing market, moderate CPC |
| 🇵🇰 Pakistan | **-50%** | Consuming 34.5% of budget at $0.32 CPC. Conversions likely low-quality signups. |
| 🇮🇩 Indonesia | **-40%** | 18.5% of budget, zero conversions |
| 🇵🇭 Philippines | **-30%** | 14.4% of budget, minimal conversions |
| 🇲🇾 Malaysia | No change | Moderate spend, some conversions |
| 🇹🇭 Thailand | No change | Low spend, acceptable |

### Campaigns Modified
- 202602 MOFU AI Agent SA APAC
- 202602 TOFU AI Agent Contact Center SA APAC
- 202602 TOFU AI Agent ElevenLabs SA APAC
- 202602 TOFU AI Agent LiveKit SA APAC
- 202602 TOFU AI Agent Vapi SA APAC

## Additional Geo Targets Added
Australia 🇦🇺 (+50% bid) and Japan 🇯🇵 (+20% bid) added as new geo targets to 4 campaigns that were missing them:
- 202602 MOFU AI Agent SA APAC
- 202602 TOFU AI Agent ElevenLabs SA APAC
- 202602 TOFU AI Agent Vapi SA APAC
- 202602 TOFU AI Agent LiveKit SA APAC

Previously only Contact Center targeted AU/JP. Now all 5 APAC campaigns cover Australia.

## Expected Impact
- Shift 15-25% of APAC spend from PK/ID/PH toward AU/SG/JP
- Improve impression share in Australia from current ~5% budget allocation
- Better alignment between ad spend and pipeline potential by market
- More qualified traffic from enterprise-heavy geos

## Search Term Validation
"voice ai" is actively triggering our ads — 7,129 impressions on MOFU APAC alone (last 30 days). The keyword coverage is fine; it's the geo distribution that needed fixing.

---

*Changes applied via Google Ads API. Monitor for 7-14 days before further adjustments.*
