# Telnyx Brand System Guide

## Overview

The creative generation system now follows the official Telnyx brand color system with automatic logo selection, intelligent asset matching, and brand-compliant composition patterns.

---

## 📁 Configuration Files

### 1. Brand Colors (`config/brand-colors.json`)

The **official source of truth** for all colors used in creatives.

**Core Principles:**
- ✅ Use neutral base + product accent composition
- ✅ Prefer high contrast (black/cream backgrounds)
- ✅ Each product has a primary color + soft background tint
- ❌ Avoid mixing multiple product colors unless explicitly requested

**Color Categories:**

#### Neutrals
```json
{
  "cream": "#FEFDF5",      // Primary light background, default canvas
  "black": "#000000",       // Primary text, dark mode backgrounds
  "tan": "#E6E3D3",        // Secondary backgrounds
  "bright_30": "#F0EEE5"   // Soft cards, blocks
}
```

#### Brand Primary
```json
{
  "brandGreen": "#00E3AA",  // Primary brand identity, CTAs
  "greenTint": "#CCF9EE"    // Soft backgrounds behind green elements
}
```

#### Product Colors

Each product has:
- **Primary**: Emphasis, gradients, accents
- **Background**: Surfaces, cards, sections
- **Gradient**: Two-tone gradient values

| Product | Primary | Background | Use Case |
|---------|---------|------------|----------|
| **AI** | `#FF7442` (Orange) | `#FFE3D9` | General AI products |
| **Voice AI Agent** | `#E57EFF` (Pink) | `#FAE5FF` | Voice AI agents |
| **Voice API** | `#8850F9` (Purple) | `#E7DCFE` | Voice API services |
| **eSIM** | `#D3FFA6` (Citron) | `#EDFFDB` | eSIM products |
| **RCS** | `#3434EF` (Blue) | `#D6EFFC` | RCS messaging |

#### Pillar Colors

Used when messaging is pillar-focused (trust/infrastructure/physics):

- **Trust**: `#00E3AA` (Green) - Security, compliance
- **Infrastructure**: `#8850F9` (Purple) - Platform, network ownership
- **Physics**: `#FF7442` (Orange) - Performance, latency

---

### 2. Brand Assets (`config/brand-assets.json`)

Defines logo variants and typography.

**Logo Variants:**

```
📁 logo/
├── White:Black/
│   ├── Telnyx_Lockup_Primary_One-color_Cream_Large (7).png  ← White logo
│   └── Telnyx_Media-Kit_Logo-Black (1).png                  ← Black logo
└── green/
    ├── telnyx-logo-wordmark-green.png                       ← Green logo
    └── telnyx-logo-icon-green.png                           ← Icon only
```

**Logo Selection Rules (Automatic):**

| Background | Logo Color |
|------------|------------|
| Dark (black, dark grays) | White |
| Light (cream, white, tints) | Black |
| Brand green | White |
| Special occasions | Green |

The system automatically selects the correct logo based on background luminance.

**Typography:**
- **Headline**: PP Formula Extrabold
- **Body**: Inter
- **Fallbacks**: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif

---

### 3. Asset Library Index (`config/asset-library-index.json`)

Maps all 37+ visual assets with metadata for intelligent selection.

**Asset Categories:**

1. **Backgrounds** - Product backgrounds (Voice AI, RCS)
2. **Product Screenshots** - Feature UIs (multi-agent handoffs, voice playground)
3. **Industry Photography** - Real photos for ABM (healthcare, insurance, logistics, etc.)
4. **Industry Heroes** - Hero graphics (automotive, finance, retail)
5. **Use Case Screenshots** - Specific use case UIs (travel booking, etc.)
6. **Icons** - Product icons and badges
7. **Brand Assets** - Brand graphics (platform stack, etc.)

**Each asset has:**
```json
{
  "path": "brand-assets/assets/...",
  "category": "industry-photo",
  "industry": "insurance",
  "keywords": ["insurance", "claims", "emergency"],
  "products": ["voice-ai"],
  "pillars": ["trust"],
  "bestFor": ["claims processing", "emergency support"],
  "mood": "urgent, helpful, supportive"
}
```

---

## 🤖 How the System Works

### 1. Brief Analysis

When you provide a prompt like:
> "A LinkedIn ad for insurance companies about improving claims processing with AI voice agents"

The system:
1. **Parses the brief** using AI to extract:
   - Platform: `linkedin`
   - Audience: `insurance companies`
   - Pain points: `claims processing`
   - Core message: `improving claims with AI`
   - Pillar: `trust` or `infrastructure`

2. **Detects context**:
   - Product: `voice-ai` (from "AI voice agents")
   - Industry: `insurance` (from "insurance companies")

### 2. Asset Selection

The `asset-selector.ts` module:

1. Loads the asset library index
2. Scores each asset based on:
   - Industry match: +50 points
   - Product match: +40 points
   - Pillar alignment: +30 points
   - Keyword matches: +10 points each
   - "Best for" matches: +15 points each
3. Selects highest-scoring assets for:
   - Background image
   - Product screenshot
   - Industry photography

**Example scoring:**
```
Brief: "insurance + claims + voice ai"

Asset: industry-insurance-photography-car-tow-truck-accident.jpg
  ✓ Industry match (insurance): +50
  ✓ Keywords (insurance, claims, emergency): +30
  ✓ Best for (claims processing): +15
  Total: 95 points ⭐ Selected!
```

### 3. Logo Selection

The `logo-selector.ts` module:

1. Determines background color of the chosen template
2. Calculates luminance (brightness) of background
3. Selects logo variant:
   - Luminance < 128 (dark) → White logo
   - Luminance ≥ 128 (light) → Black logo
   - Can be forced to green for special occasions

### 4. Template Selection

Based on available assets, chooses:

- **Industry Photo Template**: When industry photography is available (ABM campaigns)
  - Split layout: 55% photo + 45% text
  - Dark background with overlay gradient
  - Example: Healthcare, insurance, logistics ads

- **Product Visual Template**: When Voice AI/product assets are available
  - Background image + product screenshot
  - Tech-forward gradient overlays
  - Example: Voice AI feature announcements

- **Metric Comparison Template**: Fallback for text-heavy ads
  - Professional two-column layout
  - Metric cards showing comparisons
  - Example: Technical performance ads

---

## 📊 Composition Patterns

### Pattern A: Clean SaaS
```
Background:  cream (#FEFDF5)
Accent:      product primary
CTA:         Telnyx green (#00E3AA)
Logo:        black
```

### Pattern B: Product Highlight
```
Background:  product tint (e.g., pink tint for Voice AI Agent)
Foreground:  product primary (e.g., #E57EFF)
Logo:        black
```

### Pattern C: Dark Mode
```
Background:  black (#000000)
Text:        white (#FFFFFF)
Accent:      product primary with glow
Logo:        white
```

---

## ✏️ How to Add New Assets

### Adding a New Photo

1. **Place the file:**
   ```
   /Users/azizalsinafi/Documents/Asset_Library/_NEW_AdGen_Library/
   photography/industry/[industry-name]/your-photo.jpg
   ```

2. **Index it** in `config/asset-library-index.json`:
   ```json
   {
     "path": "brand-assets/assets/photography/industry/retail/retail-store-customers.jpg",
     "category": "industry-photo",
     "industry": "retail",
     "keywords": ["retail", "shopping", "customers", "store", "commerce"],
     "mood": "busy, commercial, active",
     "bestFor": ["retail stores", "ecommerce", "customer experience"]
   }
   ```

3. **Test it:**
   ```bash
   npm run generate-creative -- --prompt "A LinkedIn ad for retail stores about customer engagement"
   ```

### Adding a New Logo Variant

1. **Place logo file:**
   ```
   brand-assets/assets/logo/[variant-name]/your-logo.png
   ```

2. **Update** `config/brand-assets.json`:
   ```json
   {
     "logos": {
       "newVariant": {
         "path": "brand-assets/assets/logo/variant/your-logo.png",
         "usage": "Use for specific contexts"
       }
     }
   }
   ```

### Adding a New Product Color

1. **Update** `config/brand-colors.json`:
   ```json
   {
     "products": {
       "new_product": {
         "primary": {
           "name": "Product Name Color",
           "hex": "#HEXCODE",
           "usage": "Product emphasis"
         },
         "background": {
           "name": "Product Tint",
           "hex": "#HEXCODE",
           "usage": "Product surfaces",
           "logoColor": "black"
         },
         "gradient": {
           "from": "#HEXCODE",
           "to": "#HEXCODE"
         }
       }
     }
   }
   ```

2. **Update asset index** to tag relevant assets with the new product.

---

## 🎯 Usage Examples

### Example 1: Healthcare HIPAA Compliance
```bash
npm run generate-creative -- --prompt "Healthcare targeting HIPAA compliance"
```

**System detects:**
- Industry: `healthcare`
- Pillar: `trust`
- Selects: Healthcare professional photo, white logo on dark background

### Example 2: Voice AI Latency
```bash
npm run generate-creative -- --prompt "Voice AI sub-200ms latency for developers"
```

**System detects:**
- Product: `voice-ai`
- Pillar: `physics`
- Selects: Voice AI background, multi-agent screenshot, orange accent color

### Example 3: Insurance Claims
```bash
npm run generate-creative -- --prompt "Insurance claims processing automation"
```

**System detects:**
- Industry: `insurance`
- Product: `voice-ai`
- Selects: Car accident photo, Voice AI features, trust green accent

---

## 🔧 Debugging Asset Selection

The generator outputs detailed selection info:

```
🎯 Detected: voice-ai / insurance
🖼️  Background: background_voice-ai-agent-6.png
📸 Screenshot: voice-ai-features-multi-agent-handoffs.png
📷 Industry photo: industry-insurance-photography-car-tow-truck-accident.jpg
✨ Using template: industry-photo
```

If assets aren't being selected correctly:

1. **Check keywords** in `config/asset-library-index.json`
2. **Add more keywords** that match common brief language
3. **Verify industry/product detection** in `src/lib/asset-selector.ts`
4. **Adjust scoring weights** if needed

---

## 📚 File Reference

| File | Purpose |
|------|---------|
| `config/brand-colors.json` | Official color system |
| `config/brand-assets.json` | Logo variants, typography |
| `config/asset-library-index.json` | All visual assets with metadata |
| `src/lib/asset-selector.ts` | Smart asset selection logic |
| `src/lib/logo-selector.ts` | Automatic logo variant selection |
| `src/lib/ai-client.ts` | AI brief parsing and copy generation |
| `scripts/generate-creative.ts` | Main generator orchestrator |
| `scripts/visual-templates.ts` | HTML templates with brand colors |
| `scripts/professional-creative-templates.ts` | Text-focused templates |

---

## 🚀 Quick Start

**Generate a creative:**
```bash
npm run generate-creative -- --prompt "Your creative brief here"
```

**Output location:**
```
output/creatives/[platform]-[pillar]-[audience]-[timestamp]/
├── 1200x627.png       (Production-ready)
├── 1200x627.html      (Preview)
├── 1200x1200.png
├── 1200x1200.html
├── 628x1200.png
├── 628x1200.html
└── copy.json          (All metadata)
```

---

## ✅ Brand Compliance Checklist

- [x] Uses official Telnyx brand colors from `brand-colors.json`
- [x] Automatically selects correct logo (white/black/green) based on background
- [x] Follows composition patterns (neutral + product accent)
- [x] High contrast text/backgrounds
- [x] Product colors used appropriately (no mixing)
- [x] Typography standards (PP Formula + Inter)
- [x] Asset selection based on industry/product context
- [x] Pillar-aligned messaging and colors

---

**Last Updated:** 2026-04-14
**System Version:** 2.0.0
