# Telnyx Creative Generator

AI-powered system that takes natural language briefs and generates production-ready ad creatives (copy + visuals).

## What It Does

**Input:** Natural language brief
```
"A LinkedIn ad for healthcare targeting HIPAA compliance..."
```

**Output:** Complete creative assets
- ✅ Ad copy (headlines, descriptions, CTA)
- ✅ Images in all platform-required sizes
- ✅ Brand-compliant visuals
- ✅ Ready to upload to ad platforms

---

## Quick Start

### 1. Generate from command line

```bash
cd ~/.openclaw/workspace/demand-gen-hub

# From text prompt
npm run generate-creative -- --prompt="A LinkedIn ad for healthcare targeting HIPAA compliance"

# From file
npm run generate-creative -- --file=briefs/prompt-2-healthcare.txt
```

### 2. Check output

```bash
ls output/creatives/linkedin-trust-healthcare-*/
# Output:
#   1200x627.html (and .png when Puppeteer conversion is enabled)
#   1200x1200.html
#   628x1200.html
#   copy.json
```

---

## Example Briefs

### Healthcare LinkedIn Ad (Prompt 2)
```
npm run generate-creative -- --file=briefs/prompt-2-healthcare.txt
```

Generates:
- Copy targeting CTOs, VPs Engineering in healthtech
- HIPAA compliance messaging
- 3 LinkedIn image sizes (1200x627, 1200x1200, 628x1200)
- Trust pillar visuals (compliance badges, security)

### Vapi Competitive Ad (Prompt 6)
```
npm run generate-creative -- --file=briefs/prompt-6-vapi.txt
```

Generates:
- Copy targeting Vapi users
- Infrastructure pillar messaging
- 3 StackAdapt native sizes (1200x628, 600x600, 800x600)
- NO text overlay (editorial style)

---

## Platform Support

### LinkedIn
**Sizes:** 1200x627, 1200x1200, 628x1200
**Style:** Professional, thought leadership
**Copy limits:** Headlines 200 chars, Descriptions 600 chars

### StackAdapt Native
**Sizes:** 1200x628, 600x600, 800x600
**Style:** Editorial, blend with publisher content
**Rules:** NO text overlay on images

### StackAdapt Display
**Sizes:** 300x250, 728x90, 160x600, 300x600, 320x50
**Style:** Standard IAB display
**Rules:** Text overlay allowed, CTA button

### Reddit
**Sizes:** 1080x1350, 1080x1080, 1920x1080
**Style:** Authentic, casual, mobile-first

### Google Display
**Sizes:** 300x250, 728x90, 160x600, 300x600, 320x50
**Style:** Direct, transactional

---

## Messaging Pillars

The system automatically detects the pillar from your brief:

### Trust
**Keywords:** HIPAA, compliance, secure, SOC2, PCI
**Visuals:** Compliance shields, security badges
**Data points:** "HIPAA-ready", "SOC 2 Type II", "99.999% uptime"

### Infrastructure
**Keywords:** network, platform, vendor, integration
**Visuals:** Architecture diagrams, 1 vs 5 vendors
**Data points:** "1 platform", "Own network", "140+ countries"

### Physics
**Keywords:** latency, ms, speed, performance
**Visuals:** Latency charts, speed comparisons
**Data points:** "<200ms", "Sub-500ms", "Co-located inference"

---

## Output Structure

```
output/creatives/
  linkedin-trust-healthcare-1776082455/
    ├── 1200x627.html (preview)
    ├── 1200x627.png (when Puppeteer is enabled)
    ├── 1200x1200.html
    ├── 1200x1200.png
    ├── 628x1200.html
    ├── 628x1200.png
    └── copy.json
```

### copy.json structure:
```json
{
  "brief": {
    "platform": "linkedin",
    "pillar": "trust",
    "audience": "healthcare IT decision makers",
    "coreMessage": "HIPAA-ready Voice AI for 24/7 patient access"
  },
  "copy": {
    "headlines": [
      "Voice AI That's HIPAA-Ready from Day One",
      "24/7 Patient Access Without Adding Staff",
      ...
    ],
    "descriptions": [
      "Reduce after-hours call volume by 60%. HIPAA-compliant Voice AI handles scheduling, reminders, and refills—integrated with your EHR.",
      ...
    ],
    "cta": "See How It Works"
  },
  "generatedAt": "2026-04-13T05:20:00.000Z"
}
```

---

## How It Works

### Step 1: Parse Brief (AI)
Extracts:
- Platform (LinkedIn, StackAdapt, Reddit, etc.)
- Target audience
- Pain points
- Core message
- Messaging pillar (Trust, Infrastructure, Physics)

### Step 2: Generate Copy (AI)
Uses:
- Telnyx brand guidelines
- Platform-specific character limits
- Pillar-specific data points
- Tone matching (professional, editorial, casual)

### Step 3: Generate Visuals (Template)
Creates HTML templates with:
- Brand colors (#0A0A0A, #00CE9C)
- Pillar-specific data highlights
- Platform-appropriate layout
- Responsive sizing

### Step 4: Export
- Saves HTML previews
- Converts to PNG (when Puppeteer is configured)
- Organizes by platform-pillar-audience

---

## Advanced Usage

### Batch generation
Create a JSON file with multiple prompts:

```json
[
  {
    "prompt": "A LinkedIn ad for healthcare...",
    "name": "healthcare-linkedin"
  },
  {
    "prompt": "A StackAdapt native ad for developers...",
    "name": "developer-stackadapt"
  }
]
```

Then run:
```bash
npm run generate-creative -- --batch=briefs/all-prompts.json
```

---

## Enabling PNG Export

Currently, the system generates HTML previews. To enable PNG export:

1. Puppeteer is already installed in package.json
2. Uncomment the PNG conversion code in `scripts/generate-creative.ts` (line ~425)
3. Run again - PNGs will be generated alongside HTMLs

---

## Integration with Existing Agents

The creative generator works alongside your existing agents:

```
ad-copy-generator.ts       → Copy only (already working)
creative-asset-generator.ts → Copy + Visuals (integrated agent)
generate-creative.ts        → CLI tool (standalone)
```

Use the CLI for quick generation, or call `creativeAssetGenerator` from other agents.

---

## Next Steps

1. **Test with your 13 prompts**
   - Create brief files for each
   - Generate creatives
   - Review output

2. **Enable PNG export**
   - Uncomment Puppeteer code
   - Test PNG generation

3. **Add to workflow**
   - Integrate with campaign orchestrator
   - Auto-generate variants for A/B tests
   - Connect to platform APIs for direct upload

4. **Extend**
   - Add carousel support
   - Add video thumbnail generation
   - Add brand asset library (logos, product shots)

---

## Support

Questions? Check:
- `/scripts/generate-creative.ts` - Main generator code
- `/src/agents/creative-asset-generator.ts` - Agent version
- `/src/agents/ad-copy-generator.ts` - Copy generation logic

Or run:
```bash
npm run generate-creative -- --help
```
