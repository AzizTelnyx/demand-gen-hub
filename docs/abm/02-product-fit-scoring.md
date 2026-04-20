# Product Fit Scoring

> **Last updated:** 2026-04-20

---

## What productFit Does

Each ABMAccount gets scored against Telnyx's 5 product lines to determine which campaigns should target them. This drives:
- **Exclusion logic** — don't show IoT SIM ads to healthcare companies
- **Segment membership** — which product audience to add a domain to
- **Pruner decisions** — relevance = 0 + spend > 0 → auto-remove
- **Expander targeting** — find more companies matching high-scoring profiles

---

## Current Distribution

| Product | Count | % |
|---------|-------|---|
| **null** | 1,617 | 63% |
| **AI Agent** | 498 | 19% |
| **IoT SIM** | 182 | 7% |
| **Voice API** | 165 | 6% |
| **SMS** | 66 | 3% |
| **SIP** | 27 | 1% |

---

## The Bug We Fixed (2026-04-20)

### What was wrong

**Root cause:** `productFit` was derived from which campaign served impressions, not actual company relevance.

- 1,990/2,555 accounts (78%) were labeled "AI Agent" just because most campaigns are AI Agent campaigns
- A logistics company in an AI Agent campaign ≠ AI Agent fit
- The AI Agent keyword list included generic telecom terms: "voice", "sms", "telephony", "communication", "phone", "cpaas" — these match almost everything
- A telecom override floored score to 0.35, masking the real problem

**Example:** `priorityworldwide.com` (logistics/shipping company) was scored as AI Agent because it appeared in the `202601 TOFU AI Agent Travel NA GLOBAL` campaign.

### What we fixed

1. **New scorer** (`scripts/abm_product_scorer.py`) with strict product keywords
2. **AI Agent keywords** now only match AI-specific signals: "ai agent", "voice ai", "conversational ai", "llm", "chatbot", etc. — NOT generic telecom terms
3. **Telecom provider override redesigned** — specific signals like "telecommunications provider", "wireless carrier", "network operator", "isp" properly route to SIP/Voice API (0.5 floor), with 0.3x penalty for AI Agent
4. **Backfilled 1,925 accounts** with corrected productFit
5. **SF industry data** used as additional scoring signal (`scripts/sf_link_and_classify.py`)

### Before → After

| Product | Before | After | Change |
|---------|--------|-------|--------|
| null | 0 | 1,617 | +1,617 |
| AI Agent | 1,990 | 498 | −1,492 |
| IoT SIM | 233 | 182 | −51 |
| Voice API | 22 | 165 | +143 |
| SMS | 0 | 66 | +66 |
| SIP | 29 | 27 | −2 |

---

## Scoring Algorithm

**Script:** `scripts/abm_product_scorer.py`

Each account is scored against all 5 products. The highest-scoring product above 0.15 wins.

### Weights

| Signal | Weight | Source |
|--------|--------|--------|
| Core keywords in description | 40% | Clearbit description |
| Industry match | 30% | Clearbit + SF industry |
| Secondary keywords | 15% | Clearbit description |
| Tags match | 10% | Clearbit tags |
| Tech stack match | 5% | Clearbit tech |

### Product Keywords

#### AI Agent (strict — no generic telecom)
Core: "ai agent", "ai voice", "voice ai", "conversational ai", "llm", "chatbot", "voicebot", "virtual agent", "autonomous agent", "virtual assistant", "intelligent virtual assistant", "natural language", "voice recognition", "speech ai", "voice automation", "conversational platform", "ai-powered customer service", "ai calling", "ai dialer", "predictive dialer", "agent assist", "generative ai", "contact center ai", "call center ai"

Secondary: "customer service", "help desk", "support automation", "dialogue system", "text-to-speech", "speech-to-text"

Relevant industries: "software", "technology", "information", "telecommunications", "telemarketing", "call center", "computer"

#### Voice API
Core: "voice api", "voip", "sip", "pbx", "call routing", "ivr", "telephony", "voice platform", "voice gateway", "sip trunking", "cloud voice", "business voice", "voip service", "voice communication", "session border controller", "voice termination", "origination", "voice over ip"

Relevant industries: "telecommunications", "telemarketing", "call center", "technology", "information"

#### SMS
Core: "sms api", "messaging api", "text messaging", "a2p", "sms gateway", "bulk sms", "sms platform", "programmable sms", "sms notification", "otp sms", "two-factor authentication", "sms marketing", "mms api", "communication api"

#### SIP
Core: "sip trunk", "sip trunking", "voip gateway", "pbx", "unified communications", "sip provider", "sip gateway", "sip connection", "cloud pbx", "hosted pbx", "uc platform", "voip provider", "sip termination", "business phone system", "telephony provider", "session border controller"

#### IoT SIM
Core: "iot sim", "iot connectivity", "cellular iot", "m2m", "esim", "iot platform", "iot device management", "industrial iot", "asset tracking", "fleet tracking", "telematics", "remote monitoring", "connected device", "cellular connectivity", "logistics", "supply chain", "fleet management", "emergency response", "field operations", "cold chain", "smart meter", "connected vehicle"

Secondary: "logistics company", "developing nations", "oil and gas", "mining operations", "trucking", "warehousing", "shipping", "global logistics", "supply chain management", "last mile delivery"

### Telecom Provider Override

Companies that ARE telecom providers get special routing:
- **Signals:** "telecommunications provider", "telecom company", "wireless carrier", "network operator", "isp", "cell tower", "wireless infrastructure", "network infrastructure", "fiber optic", "broadband provider", "cable operator"
- **SIP/Voice API:** floor to 0.5 (they need our infrastructure)
- **AI Agent:** 0.3x penalty (they'd build, not buy)

### Waste Industry Penalty

E-commerce, retail, fashion, food, hospitality, etc. get 0.3x score unless they have strong core keyword hits in their description.

### Null ProductFit

1,617 accounts (63%) have no product signal. Most are genuinely irrelevant companies — pharmacies, food brands, fashion companies — that received impressions on broad TOFU campaigns. Options:
1. Let the Pruner gradually exclude them
2. Force-classify with looser thresholds (risks false positives)
3. Accept and move on — they'll never convert regardless

---

## Scripts

| Script | Purpose |
|--------|---------|
| `abm_product_scorer.py` | Score all accounts against all products, backfill |
| `sf_link_and_classify.py` | Link SF data, re-score nulls with SF industry |
| `abm-negative-builder-agent.py` | Build exclusion lists using same scoring logic |
