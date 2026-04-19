# Brand Colors

Complete color specification for the Telnyx creative generator.

## Neutrals

Base colors used across all patterns:

| Name | Hex | Usage |
|------|-----|-------|
| Cream | `#FEFDF5` | Light pattern backgrounds |
| Black | `#000000` | Dark mode background, text |
| Tan | `#E6E3D3` | Subtle borders, gradient end |
| Bright 30 | `#4D4D4D` | Muted text |
| White | `#FFFFFF` | Contrast elements |
| Gray | `#666666` | Body text on light |
| Light Gray | `#E5E5E5` | Subtle borders |

## Brand Colors

Primary Telnyx brand colors:

| Name | Hex | Usage |
|------|-----|-------|
| Primary | `#00E3AA` | Main brand green |
| Tint | `#CCF9EE` | Light background tint |
| Dark | `#00B88A` | Hover states |

## Product Colors

Each product has a primary color and light tint:

### Voice AI Agent
- Primary: `#E57EFF` (Pink/Purple)
- Tint: `#FAE5FF`
- Badge: "VOICE AI"

### Voice API
- Primary: `#8850F9` (Purple)
- Tint: `#E7DCFE`
- Badge: "VOICE API"

### AI (Generic)
- Primary: `#FF7442` (Orange)
- Tint: `#FFE3D9`
- Badge: "AI"

### eSIM
- Primary: `#00BCD4` (Cyan)
- Tint: `#E0F7FA`
- Badge: "ESIM"

### RCS
- Primary: `#4CAF50` (Green)
- Tint: `#E8F5E9`
- Badge: "RCS"

### Messaging/SMS
- Primary: `#2196F3` (Blue)
- Tint: `#E3F2FD`
- Badge: "MESSAGING"

### SIP Trunking
- Primary: `#9C27B0` (Purple)
- Tint: `#F3E5F5`
- Badge: "SIP TRUNKING"

### Numbers
- Primary: `#FF5722` (Deep Orange)
- Tint: `#FBE9E7`
- Badge: "NUMBERS"

### Default/Platform
- Primary: `#00E3AA` (Brand Green)
- Tint: `#CCF9EE`
- Badge: "PLATFORM"

## Pattern Palettes

### Clean SaaS (Pattern A)
```css
background: linear-gradient(135deg, {productTint} 0%, #FEFDF5 40%, #E6E3D3 100%);
text: #000000;
text-muted: #666666;
cta-background: #FFFFFF;
cta-border: #000000;
accent: {productPrimary};
```

### Product Highlight (Pattern B)
```css
background: linear-gradient(135deg, {productTint} 0%, #FEFDF5 100%);
text: #000000;
text-muted: #4D4D4D;
cta-background: {productPrimary};
cta-text: #FFFFFF;
accent: {productPrimary};
```

### Dark Mode (Pattern C)
```css
background: #000000;
text: #FFFFFF;
text-muted: #AAAAAA;
cta-background: {productPrimary};
cta-text: #000000;
card-background: #1A1A1A;
border: #333333;
accent: {productPrimary};
```

## Usage in Code

```typescript
import {
  NEUTRALS,
  BRAND,
  getProductColor,
  getPaletteForPattern,
} from '../src/lib/brand-colors';

// Get product colors
const voiceAI = getProductColor('voice-ai');
// => { primary: '#E57EFF', tint: '#FAE5FF', name: 'VOICE AI' }

// Get full palette for a pattern
const palette = getPaletteForPattern('dark-mode', 'voice-ai');
// => { background: '#000000', text: '#FFFFFF', accent: '#E57EFF', ... }
```

## Gradients

Product gradients for backgrounds:

```typescript
import { getProductGradient } from '../src/lib/brand-colors';

const gradient = getProductGradient('voice-ai', '135deg');
// => 'linear-gradient(135deg, #E57EFF, #FAE5FF)'
```

## Contrast Colors

Get contrasting text color for any background:

```typescript
import { getContrastingTextColor } from '../src/lib/brand-colors';

getContrastingTextColor('#E57EFF'); // => '#000000' (black text)
getContrastingTextColor('#000000'); // => '#FFFFFF' (white text)
```
