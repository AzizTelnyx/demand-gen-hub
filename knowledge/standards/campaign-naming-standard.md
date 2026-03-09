# Campaign Naming Standard

## Format

```
YYYYMM INTENT PRODUCT [VARIANT] ADTYPE REGION
```

### Fields

| Field | Required | Values |
|-------|----------|--------|
| **YYYYMM** | Yes | Launch date (e.g., 202602) |
| **INTENT** | Yes | See intent list below |
| **PRODUCT** | Yes (except BRAND) | See product taxonomy below |
| **VARIANT** | No | Competitor, use case/vertical, sub-product, or descriptor |
| **ADTYPE** | Yes | Platform-specific ad format code |
| **REGION** | Yes | GLOBAL, AMER, EMEA, APAC, MENA, or sub-region |

### Intent (campaign objective)

| Intent | Meaning | Example |
|--------|---------|---------|
| `TOFU` | Cold audience, new awareness | `TOFU AI Agent SA AMER` |
| `MOFU` | Engaged audience, consideration | `MOFU AI Agent DA GLOBAL` |
| `BOFU` | High intent, retargeting, RLSA | `BOFU Voice API Twilio RLSA GLOBAL` |
| `CONQUEST` | Targeting competitor users | `CONQUEST AI Agent Vapi SA AMER` |
| `UPSELL` | Existing customers | `UPSELL AI Agent DA GLOBAL` |
| `COMMERCIAL` | Big-spend creative/video pushes (occasional) | `COMMERCIAL AI Agent Halloween VA GLOBAL` |
| `BRAND` | Branded search or company-level awareness | `BRAND ClawdTalk SA GLOBAL` |
| `PARTNER` | Co-marketing with another company | `PARTNER AI Agent Yeastar SI GLOBAL` |
| `EVENT` | Event promotion | `EVENT AI Agent Voice AI Connect London SI EMEA` |

### Product Taxonomy (6 products)

| Product | Code in name | What it is |
|---------|-------------|------------|
| AI Agent | `AI Agent` | Flagship. Voice AI, conversational AI, voice agents. |
| Voice API | `Voice API` | Programmable voice calls |
| SIP | `SIP` | SIP trunking, carrier replacement |
| SMS | `SMS` | Programmable messaging |
| Numbers | `Numbers` | Virtual phone numbers |
| IoT SIM | `IoT SIM` | Device connectivity |

**These are the ONLY products.** Everything else is a use case, vertical, or variant:
- Contact Center → `AI Agent Contact Center` (use case)
- Healthcare → `AI Agent Healthcare` (vertical)
- Fintech → `AI Agent Fintech` (vertical)
- Travel → `AI Agent Travel` (vertical)
- TTS → `AI Agent TTS` (sub-product)
- STT → `AI Agent STT` (sub-product)

**Product is always required** except for BRAND awareness campaigns that aren't product-tied (e.g., `BRAND VA GLOBAL`).

### Conquest Campaigns

Product name always comes before competitor name. The competitor IS the variant.

| Competitor | Product we sell | Example |
|-----------|----------------|---------|
| ElevenLabs | AI Agent | `TOFU AI Agent ElevenLabs SA AMER` |
| Vapi | AI Agent | `TOFU AI Agent Vapi SA AMER` |
| Retell | AI Agent | `TOFU AI Agent Retell SA AMER` |
| LiveKit | AI Agent | `TOFU AI Agent LiveKit SA AMER` |
| Bland | AI Agent | `TOFU AI Agent Bland SA AMER` |
| Twilio | Voice API | `TOFU Voice API Twilio SA AMER` |

### Ad Type Codes (platform-specific)

| Code | Meaning | Platforms |
|------|---------|-----------|
| SA | Search Ads | Google |
| DA | Display Ads | Google, StackAdapt |
| VA | Video Ads | Google, LinkedIn, Reddit |
| NA | Native Ads | StackAdapt |
| SI | Sponsored/InMail | LinkedIn, Reddit |
| RT | Retargeting (display) | Google, LinkedIn |
| RLSA | Remarketing Lists for Search | Google |
| SPA | Sponsored Article / Spotlight | LinkedIn |
| GIF | GIF creative | LinkedIn |

### Region Codes

| Code | Meaning |
|------|---------|
| GLOBAL | All regions / no geo restriction |
| AMER | Americas |
| EMEA | Europe, Middle East, Africa |
| APAC | Asia-Pacific |
| MENA | Middle East & North Africa |

Sub-regions when needed: `APAC-AU`, `APAC-SEA`, `EMEA-UK`

### Rules

1. **ALL CAPS** for intent, ad type, and region
2. **Title Case** for product, competitor, and variant names
3. No trailing codes like `WV`, `v2`, `(from HS)` — keep it clean
4. No brackets around competitor names — just `AI Agent Vapi`, not `AI Agent [Vapi]`
5. One product per campaign. If multi-product, use the primary.
6. Product always before competitor/variant: `AI Agent ElevenLabs`, not `ElevenLabs AI Agent`
7. Use cases/verticals come after product: `AI Agent Contact Center`, `AI Agent Healthcare`
8. "Generic" or broad campaigns just use the product with no variant: `TOFU AI Agent SA AMER`
9. Social Boost is a variant/descriptor, not an intent: `TOFU AI Agent Social Boost SI GLOBAL`
