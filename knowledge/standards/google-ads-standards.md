# Google Ads Campaign Standards

## Campaign Settings
- **Bidding:** Manual CPC for new campaigns (first 1-2 weeks)
  - Switch to Maximize Conversions after 3+ conversions
  - Switch to Target CPA after 30+ conversions
- **Network:** Google Search only (no Search Partners unless approved)
- **Geo targeting:** Presence only (NOT "Presence or interest")
- **EU political advertising:** Not EU political
- **Status:** Always create as PAUSED (never launch enabled)

## Keywords
- **Match types:** Exact or Phrase ONLY (NEVER Broad match)
- Exact match for high-intent competitor/branded terms
- Phrase match for solution/discovery terms
- No duplicate keywords across ad groups
- No overlap with other campaigns
- Add negative keywords proactively

### High-Risk Generic Terms (likely overlap)
- text to speech, speech to text
- tts api, stt api
- voice ai, voice api
- conversational ai, voice recognition

## RSA (Responsive Search Ads)
- **Headlines:** 15 minimum, ≤30 characters each
- **Descriptions:** 4 minimum, ≤90 characters each
- **H1 pinned:** Search term / competitor mention (matches ad group)
- **H2 pinned:** Primary value prop
- **H3+:** Unpinned (Google optimizes)
- Each ad group gets UNIQUE ad copy matching its keywords
- **No em dashes in copy**
- UTMs directly on final URLs

## Budget Calculation Formula
```
Daily Budget = (Total Daily Searches × Expected CTR × Avg CPC) × 1.2 buffer
```
- CTR assumption: 3-5% for B2B
- ALWAYS show the math. Never set arbitrary budget.
- Use real Keyword Planner data. NEVER estimate or guess search volumes.

## Structure Decision Tree
```
Search volume > 10,000/mo per region?
├── YES → Split by region (AMER, EMEA, APAC)
└── NO → Single global campaign

Keywords > 50?
├── YES → Multiple ad groups by theme
└── NO → 2-4 ad groups max

Competitors in keywords?
├── YES → Separate ad group per competitor
└── NO → Group by intent
```

## Keyword Research — Country Geo Constants
```python
countries = {
    "AMER": [2840, 2124, 2076],  # US, Canada, Brazil
    "EMEA": [2826, 2276, 2250, 2528, 2752, 2372, 2380, 2724],  # UK, DE, FR, NL, SE, IE, IT, ES
    "APAC": [2036, 2392, 2702, 2356, 2410],  # AU, JP, SG, IN, KR
    "MENA": [2784, 2682, 2818],  # UAE, SA, EG
}
```

## Review Schedule (Post-Launch)
- **Day 3:** Impressions? Clicks? Disapproved ads? Search terms → add negatives
- **Week 1:** CTR vs benchmark (>3% for branded/competitor), CPC vs assumptions, Quality Score, pause low performers
- **Week 2:** Conversions tracking? Cost/conv acceptable? Bidding switch (3+ conv → Max Conv)? Budget pacing? Geo/device performance
- **Month 1:** Full analysis, ROI calculation, scale/optimize recommendations, document learnings
