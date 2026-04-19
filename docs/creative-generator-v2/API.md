# API Reference

Function signatures, parameters, and return types.

## Brand Colors

### `getProductColor(product?: string): ProductColor`

Get product color configuration.

```typescript
interface ProductColor {
  primary: string;   // Main accent color
  tint: string;      // Light background tint
  name: string;      // Display name for badges
  gradientStart?: string;
  gradientEnd?: string;
}

// Example
getProductColor('voice-ai');
// => { primary: '#E57EFF', tint: '#FAE5FF', name: 'VOICE AI' }

getProductColor('voice_api');  // Underscores work too
getProductColor(undefined);    // Returns default/platform colors
```

### `getPaletteForPattern(pattern, product?): PatternPalette`

Get complete color palette for a pattern.

```typescript
type PatternType = 'clean-saas' | 'product-highlight' | 'dark-mode';

interface PatternPalette {
  background: string;     // CSS background (color or gradient)
  text: string;           // Primary text color
  textMuted: string;      // Secondary text color
  ctaBackground: string;  // CTA button background
  ctaText: string;        // CTA button text
  border: string;         // Border color
  cardBackground: string; // Card/container background
  accent: string;         // Highlight color
}

// Example
const palette = getPaletteForPattern('dark-mode', 'voice-ai');
```

### `getContrastingTextColor(backgroundColor: string): string`

Get black or white text based on background luminance.

```typescript
getContrastingTextColor('#E57EFF'); // => '#000000'
getContrastingTextColor('#000000'); // => '#FFFFFF'
```

---

## Typography

### `getTypography(width, height, options?): Typography`

Calculate size-adaptive font sizes.

```typescript
interface Typography {
  headline: number;      // Hero text (48px base)
  subheadline: number;   // Secondary headline (32px base)
  body: number;          // Body text (16px base)
  label: number;         // Small labels (11px base)
  cta: number;           // CTA buttons (14px base)
  dataPoint: number;     // Large stats (64px base)
  dataLabel: number;     // Stat labels (12px base)
  metricValue: number;   // Metric values (24px base)
  metricLabel: number;   // Metric labels (11px base)
}

interface TypographyOptions {
  enforceMinimums?: boolean;   // Force min readable sizes (default: true)
  scaleMultiplier?: number;    // Custom scale (default: 1.0)
  adjustForAspect?: boolean;   // Boost for portrait (default: true)
}

// Examples
getTypography(1200, 627);    // Reference size
getTypography(300, 250);     // Small display
getTypography(628, 1200);    // Portrait
```

### `getPadding(width, height): number`

Get recommended padding for canvas size.

```typescript
getPadding(1200, 627); // => 70
getPadding(300, 250);  // => 24
```

### `getSpacing(width, height): number`

Get recommended gap/spacing for canvas size.

```typescript
getSpacing(1200, 627); // => 35
getSpacing(300, 250);  // => 12
```

---

## Layout Engine

### `calculateLayout(width, height, options?): LayoutConfig`

Calculate complete layout with zones.

```typescript
interface LayoutConfig {
  dimensions: { width: number; height: number };
  aspectRatio: 'landscape' | 'square' | 'portrait';
  padding: number;
  spacing: number;
  fixed: FixedZones;
  content: ContentZones;
  safeArea: Zone;
}

interface Zone {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutOptions {
  forceLayout?: 'split' | 'stacked' | 'full';
  ctaPosition?: 'top-right' | 'bottom-center';
  visualizationPosition?: 'right' | 'left' | 'top' | 'bottom';
  paddingMultiplier?: number;
  bottomReserve?: number;
}

// Example
const layout = calculateLayout(1200, 627, {
  ctaPosition: 'top-right',
  visualizationPosition: 'right'
});
```

### `detectAspectRatio(width, height): AspectRatioClass`

Classify canvas aspect ratio.

```typescript
type AspectRatioClass = 'landscape' | 'square' | 'portrait';

detectAspectRatio(1200, 627);  // => 'landscape'
detectAspectRatio(1200, 1200); // => 'square'
detectAspectRatio(628, 1200);  // => 'portrait'
```

---

## Pattern Selector

### `selectPattern(input): PatternSelection`

Detect composition pattern from brief.

```typescript
interface PatternDetectionInput {
  briefText: string;
  pillar: 'trust' | 'infrastructure' | 'physics';
  platform?: string;
  product?: string;
  industry?: string;
}

interface PatternSelection {
  pattern: 'clean-saas' | 'product-highlight' | 'dark-mode';
  confidence: number;        // 0-1 confidence score
  product?: string;          // Detected product
  industry?: string;         // Detected industry
  visualizationComponent: ComponentType;
  showProductScreenshot: boolean;
  showIndustryPhoto: boolean;
  reasons: string[];         // Explanation
}

// Example
const selection = selectPattern({
  briefText: "Compare Telnyx vs Twilio",
  pillar: "infrastructure"
});
```

### `detectProduct(text: string): string | undefined`

Extract product from text.

```typescript
detectProduct("Voice AI for healthcare"); // => 'voice-ai'
detectProduct("SIP trunking solution");   // => 'sip'
detectProduct("General messaging");       // => undefined
```

### `detectIndustry(text: string): string | undefined`

Extract industry from text.

```typescript
detectIndustry("HIPAA compliant for hospitals"); // => 'healthcare'
detectIndustry("Fintech compliance");            // => 'finance'
```

---

## Components

### `selectComponent(briefText, pillar): ComponentSelection`

Select appropriate visualization component.

```typescript
interface ComponentSelection {
  component: ComponentType;
  confidence: number;
  reason: string;
  defaultDataType?: string;
}

type ComponentType = 'stats-grid' | 'comparison-table' |
                     'numbered-list' | 'metric-cards' | 'none';

// Example
selectComponent("Compare latency vs competitors", "physics");
// => { component: 'comparison-table', confidence: 0.8, ... }
```

### `renderComponent(options): string`

Render a component to HTML.

```typescript
interface ComponentRenderOptions {
  component: ComponentType;
  width: number;
  height: number;
  typography: Typography;
  palette: PatternPalette;
  pillar?: 'trust' | 'infrastructure' | 'physics';
  data?: unknown;  // Custom data or uses defaults
}

// Example
const html = renderComponent({
  component: 'stats-grid',
  width: 400,
  height: 300,
  typography: getTypography(1200, 627),
  palette: getPaletteForPattern('dark-mode'),
  pillar: 'trust'
});
```

### Component Generators

```typescript
// Stats Grid
generateStatsGrid(stats: StatItem[], width, height, typography, palette, options?)

// Comparison Table
generateComparisonTable(data: ComparisonData, width, height, typography, palette, options?)

// Numbered List
generateNumberedList(items: NumberedItem[], width, height, typography, palette, options?)

// Metric Cards
generateMetricCards(metrics: MetricItem[], width, height, typography, palette, options?)
```

### Default Data Getters

```typescript
getDefaultStats(pillar: 'trust' | 'infrastructure' | 'physics')
getDefaultComparison(type: 'vendor' | 'latency' | 'migration')
getDefaultSteps(type: 'build' | 'migration' | 'integration')
getDefaultMetrics(type: 'latency' | 'performance' | 'infrastructure' | 'comparison')
```

---

## Types

### Pillar Type

```typescript
type Pillar = 'trust' | 'infrastructure' | 'physics';
```

### Product Keys

```typescript
type ProductKey = 'ai' | 'voice_ai_agent' | 'voice_api' | 'esim' |
                  'rcs' | 'messaging' | 'sip' | 'numbers' | 'default';
```

### Pattern Type

```typescript
type PatternType = 'clean-saas' | 'product-highlight' | 'dark-mode';
```
