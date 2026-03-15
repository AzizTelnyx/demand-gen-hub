# Global Negative Keyword List

Universal negatives to block across ALL Telnyx Google Ads campaigns regardless of product, region, or funnel stage (unless noted).

## Categories

### 1. Job/Career Related
**Applies to:** ALL campaigns, ALL funnel stages
**Match type:** Phrase

| Keyword | Notes |
|---------|-------|
| jobs | |
| careers | |
| salary | |
| hiring | |
| employment | |
| interview | Job interview context |
| resume | |
| job posting | |
| work from home | |
| remote jobs | |
| call center jobs | |
| recruiter | |

### 2. Free/Consumer
**Applies to:** ALL campaigns, ALL funnel stages
**Match type:** Phrase

| Keyword | Notes |
|---------|-------|
| free | Blocks "free voice api", "free sip trunking", etc. |
| cheap | Consumer price-shopping |
| free trial | Exception: can allow on BOFU if we offer trials |
| open source | Wrong buyer intent for CPaaS |
| freemium | |
| free download | |
| free app | |

### 3. Educational/DIY
**Applies to:** MOFU and BOFU only — **allow on TOFU** (awareness/research queries)
**Match type:** Phrase

| Keyword | Notes |
|---------|-------|
| tutorial | Allow on TOFU |
| how to build | Allow on TOFU |
| course | |
| certification | |
| training | |
| udemy | |
| coursera | |
| learn | Allow on TOFU |
| bootcamp | |

### 4. Content Creation (Wrong Category)
**Applies to:** ALL campaigns, ALL funnel stages
**Match type:** Phrase

| Keyword | Notes |
|---------|-------|
| video | Unless in video-specific campaign |
| movie | |
| film | |
| youtube | |
| tiktok | |
| instagram | |
| podcast | |
| music | |
| song | |
| voice over | Consumer voice-over, not voice API |
| voiceover | |
| text to speech free | |
| ai voice generator free | |

### 5. Downloads/Software
**Applies to:** ALL campaigns, ALL funnel stages
**Match type:** Phrase

| Keyword | Notes |
|---------|-------|
| download | |
| install | |
| crack | |
| torrent | |
| github | Developer browsing, not buying |
| npm | |
| pip install | |

### 6. Support/Existing Customers
**Applies to:** ALL campaigns, ALL funnel stages
**Match type:** Phrase

| Keyword | Notes |
|---------|-------|
| login | Existing customer navigation |
| dashboard | |
| sign in | |
| status page | |
| documentation | |
| docs | |
| support ticket | |
| help center | |

### 7. Other Irrelevant
**Applies to:** ALL campaigns (some BOFU-specific noted)
**Match type:** Phrase unless noted

| Keyword | Match Type | Notes |
|---------|------------|-------|
| stock price | Phrase | Financial research |
| ipo | Phrase | |
| earnings | Phrase | |
| revenue | Phrase | Company financials |
| wikipedia | Phrase | Informational only |
| reddit | Phrase | Platform browsing |
| quora | Phrase | Platform browsing |
| what is | Phrase | Block on BOFU only — allow on TOFU/MOFU |

## Usage Notes

- **Auto-block confidence:** Any search term matching this list should be treated as ≥80% confidence for blocking, regardless of spend or impression thresholds.
- **Funnel stage exceptions:** Check the campaign name for TOFU/MOFU/BOFU to apply stage-specific rules (see Category 3 and 7).
- **Phrase match default:** Use phrase match so variations are caught (e.g., "free" catches "free voice api", "free sip trunking").
- **Review quarterly:** Update this list based on new patterns found in search term reports.
