# Telnyx Knowledge Base

**Last Updated:** 2026-02-25  
**Source:** Google Drive (PMM folder)  
**Drive Folder:** https://drive.google.com/drive/folders/1xWHb7zKcgy8ER259j0D3U-5YhWdhB_TK

---

## How to Use

All agents should reference this knowledge base for:
- Official product messaging and positioning
- Campaign copy and taglines
- Value propositions by vertical/product
- ICP-specific messaging

**Rule:** Always check here before writing any customer-facing copy.

---

## Contents

### /brand/
Core Telnyx brand messaging and positioning.

| File | Description |
|------|-------------|
| brand-messaging-q1-2026.md | Master brand messaging document |

### /products/
Product-specific messaging by product line.

| File | Description |
|------|-------------|
| voice-api-messaging.txt | Voice API positioning and messaging |
| voice-ai-dev-messaging.txt | Voice AI for developers |
| esim-messaging.txt | eSIM product messaging |
| iot-messaging.txt | IoT SIM messaging |
| mobile-voice-messaging.txt | Mobile voice product messaging |

### /verticals/
Industry-specific messaging by vertical.

| File | Description |
|------|-------------|
| contact-center-messaging.txt | Contact center vertical |
| healthcare-messaging.txt | Healthcare vertical |
| voice-ai-financial.txt | Voice AI for financial institutions |

### /messaging-frameworks/
Detailed messaging frameworks from PMM.

| File | Description |
|------|-------------|
| contact-center-framework.txt | Full framework for contact center messaging |
| healthcare-framework.txt | Full framework for healthcare messaging |
| voice-api-framework.txt | Full framework for Voice API messaging |

---

## Sync Instructions

To refresh from Google Drive:
```bash
# Lil Aziz can run this on request
gog drive download <file_id> --out <path> --format txt
```

Or ask: "Update the knowledge base from Drive"

---

## File Formats

- `.md` files are markdown (structured, LLM-optimized)
- `.pdf` files are original PDFs (for reference/sharing)

**Agents should read the .md versions** for context injection.

### Formatting Notes
All files have been converted to structured markdown with:
- Clear headers and sections
- Bullet points and blockquotes
- Consistent structure (Value Prop → Elevator Pitch → Audience → Pillars → Why Telnyx)

## Standards

| Document | Path | Description |
|----------|------|-------------|
| Telnyx ICP | `standards/telnyx-icp.md` | ICP definitions, 3 paths to fit, firmographics, verticals, exclusions |
| Conversion Framework | `standards/conversion-framework.md` | TOFU/MOFU/BOFU goals, SQO as north star, B2B lifecycle |
| UTM Tagging 2025 | `standards/utm-tagging-2025.md` | UTM naming conventions, source/medium picklists, campaign naming |
| B2B Ad Copy Guide | `standards/b2b-ad-copy-guide.md` | Per-platform copy specs, char limits, writing best practices (Google/LinkedIn/StackAdapt/Reddit) |
| B2B Ad Creative Guide | `standards/b2b-ad-creative-guide.md` | Visual specs, image/video requirements, design best practices per platform |
