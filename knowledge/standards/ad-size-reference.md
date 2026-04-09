# Ad Size Reference — Shorthand to Dimensions

**Purpose:** When generating creative briefs, specs, or asset lists, always reference this file. Any time a platform + format is named, the bot must populate ALL required sizes automatically.

---

## Usage Rules

1. **Platform naming triggers size lookup** — If you say "StackAdapt NA" or "LinkedIn single image", the bot must provide ALL sizes for that format.
2. **Never partial lists** — When a format has multiple sizes, list ALL of them. Don't pick one.
3. **Primary sizes marked** — If one size is the "best performer" or "recommended", mark it with ⭐.
4. **Platform-specific rules apply** — Each platform has unique constraints (e.g., StackAdapt NA = NO text overlay).

---

## StackAdapt

| Shorthand | Full Name | All Sizes | Rules |
|-----------|-----------|-----------|-------|
| **SA-NA** | Native Display | ⭐ 1200×628, 600×600, 800×600 | **NO text overlay. Editorial style.** |
| **SA-DA** | Display Ad | ⭐ 300×250, 728×90, 160×600, 300×600, 320×50 | Standard IAB sizes |
| **SA-VA** | Video Ad | 1920×1080 (16:9), 1080×1080 (1:1), 1080×1920 (9:16) | MP4/MOV, 15-30s optimal |

**When someone says "StackAdapt native" or "SA-NA":**
- Provide 3 sizes: 1200×628, 600×600, 800×600
- Remind: NO TEXT OVERLAY on images

**When someone says "StackAdapt display" or "SA-DA":**
- Provide 5 sizes: 300×250, 728×90, 160×600, 300×600, 320×50

---

## LinkedIn

| Shorthand | Full Name | All Sizes | Best For |
|-----------|-----------|-----------|----------|
| **LI-SI-H** | Single Image Horizontal | ⭐ 1200×627 | Desktop + mobile |
| **LI-SI-S** | Single Image Square | ⭐ 1200×1200 | Universal, both platforms |
| **LI-SI-V** | Single Image Vertical | 628×1200, 720×900 (4:5) | **Mobile only** (won't show desktop) |
| **LI-CAR** | Carousel | ⭐ 1080×1080 per card | 2-10 cards, square only |
| **LI-DOC** | Document Ad | 1080×1080 per page | PDF/PPT, 3-10 pages |
| **LI-VID-L** | Video Landscape | 1920×1080 (16:9) | Desktop placement |
| **LI-VID-S** | Video Square | ⭐ 1080×1080 (1:1) | Universal |
| **LI-VID-V** | Video Vertical | 1080×1920 (9:16) | Mobile optimized |

**When someone says "LinkedIn single image":**
- Provide 3 variants: 1200×627 (horizontal), 1200×1200 (square), 628×1200 (vertical)
- Note: 80% of LinkedIn traffic is mobile → prioritize square or vertical

**When someone says "LinkedIn video":**
- Provide 3 sizes: 1920×1080 (landscape), 1080×1080 (square), 1080×1920 (vertical)
- Note: Square recommended for universal delivery

**When someone says "LinkedIn carousel":**
- Provide: 1080×1080 per card
- Note: 2-10 cards, square only

---

## Reddit

| Shorthand | Full Name | All Sizes | Notes |
|-----------|-----------|-----------|-------|
| **R-IMG-P** | Image Portrait | ⭐ 1080×1350 (4:5) | **Best for mobile** (70%+ traffic) |
| **R-IMG-S** | Image Square | 1080×1080 (1:1) | Universal |
| **R-IMG-L** | Image Landscape | 1920×1080 (16:9) | Desktop |
| **R-CAR** | Carousel | 1200×1200 per card | 2-6 cards |
| **R-VID** | Video | Same ratios as images | 5-60s, MP4/MOV |

**When someone says "Reddit image":**
- Provide 3 sizes: 1080×1350 (portrait), 1080×1080 (square), 1920×1080 (landscape)
- Recommend: 4:5 portrait for mobile (70%+ of Reddit traffic)

---

## Google Ads

| Shorthand | Full Name | All Sizes | Notes |
|-----------|-----------|-----------|-------|
| **G-DISP-MR** | Medium Rectangle | ⭐ 300×250 | **Highest reach**, mobile + desktop |
| **G-DISP-LB** | Leaderboard | 728×90 | Desktop |
| **G-DISP-WS** | Wide Skyscraper | 160×600 | Desktop sidebar |
| **G-DISP-HP** | Half Page | 300×600 | Large desktop |
| **G-DISP-MB** | Mobile Banner | 320×50 | Mobile only |
| **G-DISP-LMB** | Large Mobile Banner | 320×100 | Mobile |
| **G-PMAX** | Performance Max | ⭐ 1200×1200 (sq), 1200×628 (land), 960×1200 (port) | Square REQUIRED, others optional |
| **G-RDA** | Responsive Display | 1200×628, 1200×1200 | Let Google auto-crop |
| **G-VID** | YouTube Video | 1920×1080 (16:9), 1080×1080 (1:1), 1080×1920 (9:16 Shorts) | MP4, captions required |

**When someone says "Google display ads":**
- Provide 5 standard sizes: 300×250, 728×90, 160×600, 300×600, 320×50
- Note: 300×250 is universal best performer

**When someone says "Performance Max":**
- Provide: 1200×1200 (square - REQUIRED), 1200×628 (landscape), 960×1200 (portrait)
- Note: Must include square at minimum

---

## Quick Reference: What to Provide

| Request | Provide These Sizes |
|---------|---------------------|
| "StackAdapt native" | 1200×628, 600×600, 800×600 |
| "StackAdapt display" | 300×250, 728×90, 160×600, 300×600, 320×50 |
| "LinkedIn single image" | 1200×627, 1200×1200, 628×1200 |
| "LinkedIn carousel" | 1080×1080 per card |
| "LinkedIn video" | 1920×1080, 1080×1080, 1080×1920 |
| "Reddit image" | 1080×1350, 1080×1080, 1920×1080 |
| "Google display" | 300×250, 728×90, 160×600, 300×600, 320×50 |
| "Performance Max" | 1200×1200, 1200×628, 960×1200 |

---

## Platform-Specific Rules

### StackAdapt Native (SA-NA)
- **NO TEXT OVERLAY on images** — Headline/description go in separate fields
- Editorial quality, blends with publisher content
- Clean, professional photography

### LinkedIn
- 80%+ mobile traffic → prioritize square (1:1) or vertical (4:5)
- Captions required for video (91% watch without sound)
- Real people > stock photography

### Reddit
- 70%+ mobile traffic → prioritize portrait (4:5)
- Less polished = better performance
- Avoid corporate aesthetic

### Google Display
- 300×250 is the universal best performer
- Text-light images (Google adds headlines)
- Performance Max requires square (1200×1200) minimum

---

## When Creating Asset Lists

If asked to create an asset list or creative brief:

1. **Always include ALL sizes for each format** — Don't make the user ask for individual sizes
2. **Mark primary/recommended sizes** with ⭐
3. **Include platform rules** as notes (e.g., "NO text overlay" for StackAdapt NA)
4. **Default to mobile-optimized** when platform has majority mobile traffic

### Example Output

**Request:** "Create a LinkedIn single image asset list for Infrastructure pillar"

**Response:**
```
LinkedIn Single Image - Infrastructure Pillar
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Horizontal (1200×627px) - Desktop + Mobile
   Message: "One platform: inference + telephony + network."
   
2. Square (1200×1200px) ⭐ RECOMMENDED - Universal
   Message: "Your voice AI stack has 5 vendors. That's the problem."
   
3. Vertical (628×1200px) - Mobile only
   Message: "Sub-200ms latency. Because inference runs where the call terminates."

Notes:
- 80% LinkedIn traffic is mobile → prioritize square or vertical
- Real people/authentic imagery preferred over stock
```
