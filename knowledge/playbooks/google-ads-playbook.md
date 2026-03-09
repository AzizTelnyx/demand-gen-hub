# Google Ads Playbook

## Campaign Structure

### Naming Convention
```
YYYYMM {Funnel} {Product} {Type} {Geo}
```
Examples:
- `202602 BOFU Voice AI SA US` (Search Ads, US)
- `202602 MOFU SMS API DSA GLOBAL` (Dynamic Search Ads)
- `202602 TOFU AI Agent Contact Center DA US/UK` (Display Ads)

### Funnel Stages

| Stage | Intent | Bid Strategy | Keywords |
|-------|--------|--------------|----------|
| TOFU | Awareness | Max clicks or Target CPM | Category, educational |
| MOFU | Consideration | Target CPA or Max conversions | Solution, comparison |
| BOFU | Decision | Target ROAS or Max conversions | High intent, competitor |

### Campaign Types

| Type | Abbreviation | Use Case |
|------|--------------|----------|
| Search Ads | SA | High-intent keyword targeting |
| Dynamic Search | DSA | Broad coverage, new keywords |
| Display Ads | DA | Awareness, retargeting |
| Performance Max | PMAX | Full-funnel automation |
| Demand Gen | DG | YouTube, Discovery, Gmail |

## Keyword Strategy

### BOFU (High Intent)
- Product terms: "voice AI API", "SMS gateway"
- Competitor terms: "twilio alternative", "vonage competitor"
- Action terms: "buy", "pricing", "demo", "trial"
- CTR: 5-8%, CPC: $8-20

### MOFU (Solution Aware)
- Solution terms: "programmable voice", "cloud SMS"
- Comparison terms: "best SMS API", "voice API comparison"
- How-to terms: "how to send SMS programmatically"
- CTR: 3-5%, CPC: $5-12

### TOFU (Awareness)
- Category terms: "business communications", "CPaaS"
- Educational terms: "what is SIP trunking"
- Problem terms: "reduce telecom costs"
- CTR: 2-4%, CPC: $3-8

### Negative Keywords (Standard)
```
free
cheap
jobs
careers
salary
tutorial (for BOFU)
what is (for BOFU)
```

## Ad Copy Best Practices

### Headlines (30 char max)
- Include keyword
- Include differentiator
- Include CTA
- Pin H1: Primary message
- Pin H2: Supporting benefit

### Descriptions (90 char max)
- D1: Value prop + proof point
- D2: Features + CTA

### Example RSA:
```
Headlines:
H1: Voice AI API - Deploy Today [pinned]
H2: 99.99% Uptime SLA [pinned]
H3: Cut Costs 50% vs Twilio
H4: Enterprise-Grade Voice AI
H5: Start Free - No Credit Card
...

Descriptions:
D1: Deploy AI voice agents in hours. Own the network, own the quality. Start free trial today.
D2: Sub-200ms latency. SOC 2 certified. 24/7 support. Used by thousands of developers worldwide.
```

## Bidding Strategy

### New Campaigns (First 2 weeks)
- Start with **Maximize Clicks** (with bid cap)
- Goal: Gather conversion data
- Min conversions needed: 15-30 before switching

### Mature Campaigns
- **Target CPA**: When optimizing for leads
- **Max Conversions**: When budget-constrained
- **Target ROAS**: When optimizing for revenue

### Bid Adjustments
| Factor | Adjustment |
|--------|------------|
| Mobile | -20% to +20% (test) |
| Desktop | Baseline |
| Top locations | +10-20% |
| Low-performing locations | -20-50% |
| Business hours | +10-15% |
| Weekends | -20-30% (B2B) |

## Budget Guidelines

### Minimum Viable Budgets
| Campaign Type | Min Daily | Min Monthly |
|---------------|-----------|-------------|
| Search (BOFU) | $50 | $1,500 |
| Search (MOFU) | $30 | $900 |
| Display | $30 | $900 |
| PMAX | $50 | $1,500 |

### Budget Calculation
```
Daily Budget = (Target Clicks × Avg CPC) × 1.2

Where:
- Target Clicks = Monthly Lead Goal / Conversion Rate
- 1.2 = 20% buffer for auction dynamics
```

## Optimization Cadence

### Daily
- Check for disapproved ads
- Review search terms (add negatives)
- Monitor spend pacing

### Weekly
- Performance review by campaign
- Bid adjustments
- Ad copy performance (pause losers)
- Search term analysis (add keywords, negatives)

### Monthly
- Full performance analysis
- Budget reallocation
- Test new ad variations
- Keyword expansion

### Quarterly
- Strategy review
- Competitor analysis
- Landing page tests
- Account structure review

## Conversion Tracking

### Primary Conversions
- Demo request (weight: 1.0)
- Contact sales (weight: 1.0)
- Sign up (weight: 0.5)

### Secondary Conversions
- Documentation visit (weight: 0.1)
- Pricing page visit (weight: 0.2)
- Resource download (weight: 0.3)

## Regional Considerations

| Region | Notes |
|--------|-------|
| US | Highest CPCs, largest volume |
| UK | 20-30% lower CPCs than US |
| DACH | German language campaigns required |
| APAC | English for Singapore/AU, local for JP/KR |
| LATAM | Spanish/Portuguese, lower CPCs |

## Common Mistakes to Avoid

1. **Single ad group with all keywords** - Segment by intent
2. **No negative keywords** - Review search terms weekly
3. **Same ads for all stages** - Match message to intent
4. **Ignoring mobile** - Check device performance
5. **Set and forget bidding** - Review bid strategy monthly
6. **Too broad targeting** - Start narrow, expand with data
