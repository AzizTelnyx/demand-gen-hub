# 2025 UTM URL Creation & Tagging Standards

*Source: Telnyx Guru — Last updated: 2026-02-01*

## 1. Purpose

Consistent UTM tagging ensures accurate campaign tracking and reporting across platforms. Every marketing campaign must include the correct UTM parameters and follow the naming conventions outlined below.

**UTM URL Builder:** https://claude.ai/public/artifacts/8b97ea47-2a3d-4012-9d6c-821d64f5a2d0

---

## 2. Required UTM Parameters

| UTM Parameter | Definition | Example |
|---------------|------------|---------|
| `utm_source` | Platform sending the traffic | linkedin, google, reddit, stackadapt, x, sponsored |
| `utm_medium` | Type of campaign | paid_search, paid_social, display, youtube_ad, newsletter, dooh, ctv |
| `utm_campaign` | Descriptive campaign name (follows naming convention) | 202510_TOFU_VoiceAI_SI_MENA |
| `utm_content` | Ad creative or asset identifier | demo-video1, carousel2, bannerA |
| `utm_term` | Keyword or targeting detail (if applicable) | voice+automation |

---

## 3. Active Source & Medium Picklists

### UTM Source
- google
- linkedin
- reddit
- stackadapt
- twitter (X)
- sponsored

### UTM Medium
- paid_search
- paid_social
- display
- youtube_ad
- newsletter
- dooh
- ctv
- social (organic)
- youtube (organic)

**⚠️ Use only these approved values in new campaigns. This ensures clean and unified reporting in analytics.**

---

## 4. Campaign Naming Convention

### Format
```
YEARMM_FunnelStage_ProductName_[AdditionalContext]_Content_Region
```

### Naming Components

| Component | Definition | Examples |
|-----------|------------|----------|
| YEARMM | Year and month of campaign launch | 202510 |
| FunnelStage | Campaign stage | TOFU, MOFU, BOFU |
| ProductName | Product(s) promoted (from Truth List) | AI_Agent, Voice_API, IoT_SIM |
| AdditionalContext | Optional — distinguishes similar campaigns | Amazon_Connect, Enterprise, SMB |
| Content | Content or ad type (see abbreviations) | SI, VA, CA, etc. |
| Region | Target region | AMER, EMEA, APAC, MENA, GLOBAL |

---

## 5. Telnyx Products Truth List

Use this as the source of truth when naming campaigns. Use underscores `_` between words.

### Core Products
- SIP
- Voice_API
- Voice_SDK
- Fax_API
- Video_API
- SMS
- MMS
- IoT_SIM
- Cloud_VPN
- Virtual_Cross_Connect (VXC)
- Storage
- Verify
- Switch_Data
- Number_Look_Up
- Numbers
- RCS
- AI_Agent
- VoLTE

### Competitor Brands (for competitive campaigns)
- Twilio
- Vonage
- Bandwidth
- ElevenLabs
- Vapi
- Kore
- Hologram
- Telstra

### Format Examples
- **Single product:** `202510_TOFU_AI_Agent_SA_GLOBAL`
- **Product + context:** `202510_TOFU_AI_Agent_Amazon_Connect_SA_GLOBAL`
- **Multiple products:** `202510_MOFU_Voice_API_Voice_SDK_VA_EMEA`

---

## 6. Content Type Abbreviations

| Content Type | Abbreviation |
|--------------|--------------|
| Single Image Ad | SI |
| Video Ad | VA |
| Carousel Ad | CA |
| Native Ad | NA |
| Display Ad | DA |
| Message Ad | MA |
| Spotlight Ad | SPA |
| Thought Leadership | TL |
| Search Ad | SA |
| Interactive Media | IM |

A single campaign may include multiple content formats (e.g., `SI_VA_CA`).

---

## 7. Examples

### Single Format
```
utm_campaign=202509_TOFU_Voice_AI_SPA_MENA
```

### Multiple Formats
```
utm_campaign=202510_BOFU_IoT_SIM_SI_VA_CA_GLOBAL
```

### With Product Context
```
utm_campaign=202510_TOFU_AI_Agent_Amazon_Connect_SA_GLOBAL
```

### Full URL Example
```
https://www.telnyx.com/voice-ai?utm_source=linkedin&utm_medium=paid_social&utm_campaign=202510_TOFU_AI_Agent_Amazon_Connect_SA_GLOBAL&utm_content=video1&utm_term=voice+automation
```

---

## 8. Funnel Stage Reference Table

| Funnel Stage | Example Product | Region | Content Type | UTM Source | UTM Medium |
|--------------|-----------------|--------|--------------|------------|------------|
| TOFU | SIP | AMER | SI | google | paid_search |
| MOFU | Voice API | MENA | VA | linkedin | paid_social |
| BOFU | Voice SDK | EMEA | CA | reddit | display |
| Partnership | Fax API | APAC | NA | stackadapt | youtube_ad |
| Events | Video API | — | DA | twitter | newsletter |
| Commercial | SMS | — | MA | sponsored | dooh |

---

## 9. UTM Tracking in HockeyStack

HockeyStack automatically captures and attributes all UTM parameters from incoming traffic. Once users land on a tracked page, HockeyStack stores their UTM values for the entire customer journey.

### How It Works

When a user visits a Telnyx property with UTMs, HockeyStack records:
- utm_source
- utm_medium
- utm_campaign
- utm_content
- utm_term

These values are tied to the visitor session and subsequent conversions.

### Best Practices
- Always verify UTM links before launch
- Ensure that all landing pages are tracked in HockeyStack
- Keep campaign names consistent so data aligns properly
- Review attribution reports regularly to confirm mapping accuracy

---

## 10. UTM Creation Checklist

- [ ] Use only approved sources and mediums
- [ ] Follow the naming convention exactly
- [ ] Reference the Telnyx Products Truth List
- [ ] Add context when needed to distinguish campaigns
- [ ] Use acronyms for content types
- [ ] Verify links in Google's Campaign URL Builder
- [ ] Confirm attribution in HockeyStack
