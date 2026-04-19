# Composition Patterns

The creative generator supports three distinct composition patterns.

## Pattern A: Clean SaaS

Light, professional aesthetic for general messaging and industry ABM.

### Visual Characteristics
- **Background**: Cream/tan gradient with product tint
- **Text**: Black on light
- **CTA**: White with black border
- **Layout**: Text-focused with optional industry photo

### When Used
- Default pattern
- Industry-specific campaigns (healthcare, finance, etc.)
- General awareness campaigns
- ABM targeting

### Triggers
- Industry keywords (healthcare, finance, retail, etc.)
- No competitive/technical keywords
- Default when no specific pattern detected

### Example Output
```
┌────────────────────────────────────────────────────────────┐
│  [VOICE AI]                                                │
│                                                            │
│  24/7 AI voice agents         ┌────────────────────────┐  │
│  for patient scheduling       │                        │  │
│                               │   [Industry Photo]     │  │
│  HIPAA-compliant, integrates  │                        │  │
│  with your EHR system         └────────────────────────┘  │
│                                                            │
│  ┌─────────────┐                                          │
│  │ Learn More  │                                          │
│  └─────────────┘                                          │
│                                                            │
│  ◈ telnyx                                                 │
└────────────────────────────────────────────────────────────┘
```

---

## Pattern B: Product Highlight

Product-focused layout with UI screenshots and feature emphasis.

### Visual Characteristics
- **Background**: Product-tinted gradient
- **Text**: Black on light
- **CTA**: Product-colored or white with border
- **Layout**: 50/50 split with product screenshot

### When Used
- Specific product campaigns
- Feature announcements
- Demo/trial promotions

### Triggers
- Product names: "Voice AI", "Voice API", "SIP", "eSIM", "RCS"
- Feature keywords: "feature", "demo", "how it works"
- UI/interface mentions

### Example Output
```
┌────────────────────────────────────────────────────────────┐
│  [VOICE AI]                                                │
│                                                            │
│  Build voice agents         ┌──────────────────────────┐  │
│  in minutes                 │                          │  │
│                             │  ┌────────────────────┐  │  │
│  70+ languages, warm        │  │  Voice Playground  │  │  │
│  transfers, real-time       │  │  ─────────────────  │  │  │
│  transcription              │  │  [Product UI]      │  │  │
│                             │  └────────────────────┘  │  │
│  ┌─────────────┐            │                          │  │
│  │ Try Demo    │            └──────────────────────────┘  │
│  └─────────────┘                                          │
│                                                            │
│  ◈ telnyx                                                 │
└────────────────────────────────────────────────────────────┘
```

---

## Pattern C: Dark Mode

High-contrast design for competitive positioning and data-heavy content.

### Visual Characteristics
- **Background**: Solid black (#000000)
- **Text**: White on dark
- **CTA**: Product-colored pill (top-right)
- **Layout**: 50/50 split with data visualization

### When Used
- Competitive campaigns (vs Twilio, Vonage, etc.)
- Developer/technical audiences
- Performance/latency claims
- Data-heavy messaging

### Triggers
- "compare", "vs", "versus"
- "migrate", "switch from"
- "developer", "technical", "API"
- "latency", "performance", "benchmark"
- Competitor names: "Twilio", "Vonage", "Vapi"

### Example Output
```
┌────────────────────────────────────────────────────────────┐
│  [VOICE AI]                         ┌────────────────┐    │
│                                     │ OWN THE STACK  │    │
│                                     └────────────────┘    │
│  Your voice AI              ┌─────────────────────────┐   │
│  demo works.                │ Response latency  <500ms│   │
│  Production won't.          │ Multi-vendor      1.5-3s│   │
│                             │ Infrastructure  Full    │   │
│  Multi-vendor stacks add    │ Global PoPs       30+   │   │
│  latency that breaks real   └─────────────────────────┘   │
│  conversations.                                            │
│                                                            │
│  ◈ telnyx                                                 │
└────────────────────────────────────────────────────────────┘
```

---

## Pattern Selection Logic

```typescript
import { selectPattern } from '../src/lib/pattern-selector';

const selection = selectPattern({
  briefText: "Compare Telnyx vs Twilio for developers",
  pillar: "infrastructure",
  platform: "linkedin"
});

// Returns:
// {
//   pattern: 'dark-mode',
//   confidence: 0.85,
//   product: undefined,
//   industry: undefined,
//   visualizationComponent: 'comparison-table',
//   showProductScreenshot: false,
//   showIndustryPhoto: false,
//   reasons: ['Dark mode triggered by 3 competitive keywords']
// }
```

## Keyword Reference

### Dark Mode Triggers
```
compare, vs, versus, competitor, alternative, switch from,
migrate, migration, replace, better than, unlike,
developer, developers, engineering, technical, api, sdk,
infrastructure, latency, performance, benchmark,
twilio, vonage, bandwidth, vapi, retell, elevenlabs
```

### Product Highlight Triggers
```
voice ai, voice-ai, voice api, voice-api, sip trunking,
esim, e-sim, rcs, messaging, sms,
feature, capability, demo, product, interface, dashboard
```

### Industry Keywords
```
Healthcare: healthcare, medical, hospital, patient, hipaa
Finance: finance, banking, fintech, payment, compliance
Retail: retail, ecommerce, shopping, inventory
Travel: travel, hospitality, hotel, booking, concierge
Logistics: logistics, shipping, delivery, fleet
Insurance: insurance, claims, policy, underwriting
```

---

## Aspect Ratio Handling

Each pattern adapts to canvas dimensions:

### Landscape (width > height * 1.15)
- 50/50 horizontal split
- Visualization on right
- Full text column on left

### Square (width ≈ height)
- 60/40 horizontal split OR
- Stacked layout
- Centered data visualization

### Portrait (height > width * 1.15)
- Fully stacked layout
- Visualization on top
- Text below
- Compact typography
