# StackAdapt Playbook

## Campaign Structure

### Naming Convention
```
YYYYMM {Funnel} {Product} {Channel} {Geo}
```
Examples:
- `202602 TOFU Voice AI DA US/UK` (Display Ads)
- `202602 MOFU AI Agent Contact Center NA US` (Native Ads)
- `202602 RETAR Voice AI DA GLOBAL` (Retargeting)
- `202602 ABM Enterprise CTV US` (Connected TV)

### Channel Types

| Channel | Abbreviation | CPM Range | Use Case |
|---------|--------------|-----------|----------|
| Display | DA | $5-15 | Awareness, retargeting |
| Native | NA | $12-25 | Content promotion, MOFU |
| Video | VA | $15-30 | Brand awareness |
| CTV | CTV | $25-50 | Premium awareness |
| Audio | AA | $10-20 | Podcast listeners |
| DOOH | DOOH | $8-25 | Events, ABM |

## Targeting Strategy

### Audience Types

**1. Intent Segments (Bombora)**
- Best for MOFU/BOFU
- Topic-based intent signals
- 7-day recency typical
- Example: "Contact Center Software", "Voice AI"

**2. Firmographic**
- Company size
- Industry
- Revenue range
- Good for B2B targeting

**3. First-Party Data**
- Website visitors (retargeting)
- CRM lists (email match)
- Account lists (ABM)

**4. Contextual**
- Content categories
- Keywords in page content
- Good for brand safety + relevance

**5. Third-Party Audiences**
- Oracle, LiveRamp, etc.
- Job titles, interests
- Less precise than LinkedIn

### Targeting Combinations

**TOFU Awareness:**
```
Intent: Category-level (CPaaS, Cloud Communications)
+ Firmographic: 200+ employees, Tech/Finance/Healthcare
+ Contextual: Business technology publications
```

**MOFU Consideration:**
```
Intent: Solution-level (Voice AI, Contact Center AI)
+ Firmographic: 500+ employees, target industries
+ Exclude: Current customers
```

**BOFU Retargeting:**
```
First-Party: Website visitors (last 30 days)
- Exclude: Converted leads
- Segment: Pricing page visitors (higher intent)
```

**ABM:**
```
Account List: Upload target companies
+ Third-Party: Decision maker titles
+ Intent: Topic-level signals
```

## Creative Specifications

### Display
| Size | Use |
|------|-----|
| 300x250 | Most inventory, required |
| 728x90 | Leaderboard, desktop |
| 160x600 | Skyscraper, desktop |
| 320x50 | Mobile banner |
| 300x600 | Half page, high impact |

### Native
- **Headline:** 25-40 characters
- **Description:** 90-150 characters  
- **Image:** 1200x627 (1.91:1)
- **Brand Logo:** 1:1, min 300x300

### Video
- **Length:** 15-30 seconds (6-15 for bumpers)
- **Format:** MP4, 16:9
- **Resolution:** 1920x1080
- **File Size:** <100MB

### CTV
- **Length:** 15 or 30 seconds
- **Format:** MP4
- **Resolution:** 1920x1080
- **Audio:** Required, levels -12 to -6 dB

## Budget Guidelines

### Minimum Viable Budgets
| Channel | Min Daily | Min Monthly |
|---------|-----------|-------------|
| Display | $30 | $900 |
| Native | $50 | $1,500 |
| Video | $50 | $1,500 |
| CTV | $75 | $2,000 |
| Audio | $50 | $1,500 |
| DOOH | $100 | $3,000 |

### Budget Calculation (CPM-based)
```
Monthly Budget = (Target Impressions × CPM) / 1000

Where:
- Target Impressions = Audience × Reach% × Frequency
- Reach% = 20-40% for broad, 50-70% for ABM
- Frequency = 5-8 for awareness, 10-15 for retargeting
```

### Example Calculation:
```
Audience: 150,000
Reach: 30% = 45,000 people
Frequency: 5x/month = 225,000 impressions
CPM: $12
Budget: 225,000 × $12 / 1000 = $2,700/month
```

## Bidding Strategy

### Optimization Goals
| Goal | When to Use |
|------|-------------|
| Viewability | Brand awareness, TOFU |
| Clicks | Traffic, MOFU |
| Conversions | Lead gen, BOFU |
| Video Completion | Video campaigns |

### Bid Recommendations
- Start 10-20% above floor for reach
- Let algorithm optimize for 2 weeks
- Adjust based on win rate (target 50-70%)

## Campaign Types

### 1. Prospecting (TOFU/MOFU)
- Broad intent + firmographic targeting
- Display + Native mix
- Optimize for viewability initially
- Frequency cap: 3/day, 15/week

### 2. Retargeting
- Website visitor audiences
- Segment by page/behavior
- Higher frequency cap: 5/day
- Exclude converters

### 3. ABM
- Account list upload
- Layer with intent signals
- Multi-channel (display + native + CTV)
- Frequency: 8-12/month per account

### 4. Contextual
- Target specific content categories
- Good for brand safety
- Lower CPMs than intent
- Works well for TOFU

## Creative Best Practices

### Display Ads
- Clear value proposition
- Brand visible
- CTA button
- Minimal text
- High contrast

### Native Ads
- Editorial tone, not promotional
- Benefit-focused headlines
- Curiosity gap (but not clickbait)
- Image: Real people, no stock clichés

### Video
- Hook in first 3 seconds
- Branding early (5-10 sec)
- Captions required
- Clear CTA at end

## Optimization Cadence

### Daily
- Check pacing and delivery
- Review win rates
- Flag creative issues

### Weekly
- Creative performance (CTR, VTC)
- Audience performance
- Placement review (blacklist low quality)
- Frequency check

### Monthly
- Full performance analysis
- Creative refresh
- Audience expansion/refinement
- Budget reallocation

## DOOH Specifics

### Venue Types
- Airports (premium, travelers)
- Office buildings (B2B decision makers)
- Transit (urban professionals)
- Billboards (mass reach)
- Retail (consumer)

### DOOH for B2B Events
1. Geo-fence conference venue
2. Target 7 days before, during, after
3. Use digital billboards near venue
4. Combine with mobile retargeting

### DOOH Budget
- Higher minimums ($3K+/month)
- CPMs: $8-25 depending on venue
- Best for ABM and events

## Integration Notes

### Telnyx StackAdapt API
- Advertiser ID: 93053 (Telnyx)
- GraphQL API
- Can create campaigns programmatically
- Pull delivery metrics

### Pixels and Tracking
- Universal pixel on all pages
- Event-based conversions
- Retargeting audiences auto-build

## Common Mistakes to Avoid

1. **Too narrow targeting** - Need scale for programmatic
2. **Ignoring frequency caps** - Annoyance = brand damage
3. **Single creative** - Need 3-5 variations
4. **Forgetting mobile** - 60%+ traffic
5. **No placement review** - Block low-quality sites
6. **Set and forget** - Optimize weekly minimum
