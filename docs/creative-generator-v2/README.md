# Creative Generator V2

Modular, adaptive banner generation system for Telnyx marketing creatives.

## Overview

The Creative Generator V2 is a complete rebuild of the banner generation system with:

- **Three Composition Patterns**: Clean SaaS, Product Highlight, Dark Mode
- **Size-Adaptive Typography**: Text scales intelligently across all banner sizes
- **Data Visualization Components**: Stats grids, comparison tables, metric cards
- **Zone-Based Layouts**: Logo and CTA never collide, content adapts to aspect ratio
- **Smart Pattern Detection**: Automatically selects the best pattern based on brief

## Quick Start

```bash
# Generate from a prompt
npm run generate-creative-v2 -- --prompt="LinkedIn ad for Voice AI targeting healthcare"

# Generate from a file
npm run generate-creative-v2 -- --file=briefs/my-brief.txt
```

## Architecture

```
src/lib/
├── brand-colors.ts      # Color system with product colors
├── typography.ts        # Size-adaptive font calculator
├── layout-engine.ts     # Zone-based layouts
├── pattern-selector.ts  # Pattern detection from briefs
└── components/
    ├── index.ts              # Component registry
    ├── stats-grid.ts         # 2x2/1x4 stat cards
    ├── comparison-table.ts   # Side-by-side comparison
    ├── numbered-list.ts      # Process steps
    └── metric-cards.ts       # Performance metrics

scripts/
└── generate-creative-v2.ts   # Main generator
```

## Pattern Selection

The generator automatically detects which pattern to use:

| Pattern | Triggers | Best For |
|---------|----------|----------|
| Clean SaaS | Default, industry keywords | General messaging, ABM |
| Product Highlight | Product names, feature keywords | Product demos, features |
| Dark Mode | "compare", "vs", "developer", "latency" | Competitive, technical |

## Output

Generated creatives are saved to `output/creatives/v2-[pattern]-[platform]-[timestamp]/`:

```
output/creatives/v2-dark-mode-linkedin-1713512400000/
├── 1200x627.html     # Preview HTML
├── 1200x627.png      # Production-ready image
├── 1200x1200.html
├── 1200x1200.png
├── 628x1200.html
├── 628x1200.png
└── metadata.json     # Brief, copy, pattern info
```

## Examples

### Clean SaaS (Healthcare ABM)

```bash
npm run generate-creative-v2 -- --prompt="LinkedIn ad for Voice AI targeting healthcare HIPAA compliance"
```

### Dark Mode (Competitive)

```bash
npm run generate-creative-v2 -- --prompt="Compare Telnyx vs Twilio for developers, show latency data"
```

### Product Highlight

```bash
npm run generate-creative-v2 -- --prompt="Voice API feature ad showing call recording for fintech"
```

## Documentation

- [Brand Colors](./BRAND-COLORS.md) - Full color specification
- [Components](./COMPONENTS.md) - Data visualization components
- [Patterns](./PATTERNS.md) - Composition pattern details
- [API](./API.md) - Function signatures and types

## Pipeline

```
Brief → Parse → Detect Product → Select Pattern → Select Components →
       → Calculate Typography → Render HTML → Export PNG
```

1. **Parse Brief**: AI extracts platform, audience, pain points, pillar
2. **Detect Product/Industry**: Keywords identify product focus and industry vertical
3. **Select Pattern**: Algorithm chooses Clean SaaS, Product Highlight, or Dark Mode
4. **Select Components**: Data visualization components chosen based on pattern/pillar
5. **Calculate Typography**: Font sizes scaled to canvas area
6. **Render HTML**: Template generated with all elements
7. **Export PNG**: Puppeteer converts HTML to production-ready images
