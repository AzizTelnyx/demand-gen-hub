# Data Visualization Components

Reusable components for displaying data in creatives.

## Stats Grid

2x2 or 1x4 grid showing key metrics.

```
┌─────────┬─────────┐
│  30+    │  100+   │
│Countries│ Markets │
├─────────┼─────────┤
│  70+    │  24/7   │
│Languages│ Support │
└─────────┴─────────┘
```

### Usage

```typescript
import { generateStatsGrid, getDefaultStats } from '../src/lib/components';

const stats = getDefaultStats('trust');
const html = generateStatsGrid(stats, 400, 300, typography, palette);
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| layout | `'2x2'`, `'1x4'`, `'auto'` | `'auto'` | Grid arrangement |
| showBorders | boolean | true | Show borders between cards |
| showCardBackground | boolean | true | Show card backgrounds |
| borderRadius | number | 12 | Card border radius |
| gap | number | 12 | Gap between cards |

### Default Stats by Pillar

**Trust:**
- 30+ Countries (with carrier license)
- 100+ Markets (with local numbers)
- 70+ Languages (supported)
- 24/7 Support (engineering team)

**Infrastructure:**
- 1 Platform (replaces 4-5 vendors)
- Own Network (not a reseller)
- 140+ Countries (served)
- 0 Extra Hops (direct carrier path)

**Physics:**
- <500ms Response (end-to-end latency)
- 30+ Edge GPUs (worldwide)
- 1 hop Direct Path (not 3-5 hops)
- HD Voice Quality (with noise suppression)

---

## Comparison Table

Two-column comparison showing competitor limitations vs Telnyx advantages.

```
Multi-vendor stack    │  Telnyx Voice AI
✗ SIP + STT + TTS    │  ✓ One platform
✗ 3-5 carrier hops   │  ✓ Sub-second latency
✗ 4 dashboards       │  ✓ End-to-end traces
```

### Usage

```typescript
import { generateComparisonTable, getDefaultComparison } from '../src/lib/components';

const data = getDefaultComparison('vendor');
const html = generateComparisonTable(data, 500, 300, typography, palette);
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| showHeaders | boolean | true | Show column headers |
| showSeparators | boolean | true | Show row separators |
| borderRadius | number | 12 | Table border radius |
| style | `'icons'`, `'backgrounds'`, `'minimal'` | `'icons'` | Visual style |

### Comparison Types

**Vendor Comparison:**
- Multi-vendor stack vs Telnyx Voice AI
- Shows integration, latency, support differences

**Latency Comparison:**
- Typical multi-vendor vs Telnyx
- Focus on response times and network paths

**Migration Comparison:**
- Current provider vs Telnyx Voice AI
- Shows pricing, integration, feature differences

---

## Numbered List

Process steps with circled numbers.

```
① Build your agent
② Pick your model
③ Connect telephony
④ Test & launch
```

### Usage

```typescript
import { generateNumberedList, getDefaultSteps } from '../src/lib/components';

const steps = getDefaultSteps('build');
const html = generateNumberedList(steps, 400, 300, typography, palette);
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| direction | `'vertical'`, `'horizontal'` | `'vertical'` | Layout direction |
| showConnectors | boolean | true | Show connector lines |
| numberStyle | `'circled'`, `'plain'`, `'filled'` | `'circled'` | Number display style |
| startNumber | number | 1 | Starting number |
| gap | number | 16 | Gap between items |

### Step Types

**Build Steps:**
1. Build your agent
2. Pick your model
3. Connect telephony
4. Test & launch

**Migration Steps:**
1. Connect your account
2. Import configuration
3. Test in parallel
4. Switch traffic

**Integration Steps:**
1. Get API credentials
2. Install SDK
3. Configure webhook
4. Go live

---

## Metric Cards

Horizontal metric display for benchmarks.

```
┌─────────────────────────────┐
│ Response latency    <500ms │
│ Typical multi-vendor  1.5-3s │
│ Infrastructure      Full stack │
│ Global PoPs           30+   │
└─────────────────────────────┘
```

### Usage

```typescript
import { generateMetricCards, getDefaultMetrics } from '../src/lib/components';

const metrics = getDefaultMetrics('latency');
const html = generateMetricCards(metrics, 400, 300, typography, palette);
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| layout | `'stacked'`, `'grid'`, `'horizontal'` | `'stacked'` | Card arrangement |
| showDividers | boolean | true | Show dividers between metrics |
| showBackground | boolean | true | Show card backgrounds |
| borderRadius | number | 12 | Card border radius |
| showComparison | boolean | false | Show comparison values |

### Metric Types

**Latency Metrics:**
- Response latency: <500ms (vs 1.5-3s)
- Typical multi-vendor: 1.5-3s
- Infrastructure: Full stack
- Global PoPs: 30+

**Performance Metrics:**
- End-to-end latency: <500ms
- Voice quality: HD
- Languages: 70+
- Uptime SLA: 99.999%

**Infrastructure Metrics:**
- Vendors replaced: 4-5 → 1
- Network hops: 0 extra
- Countries: 140+
- Support: 24/7

---

## Component Selection

Automatic component selection based on brief:

```typescript
import { selectComponent, renderComponent } from '../src/lib/components';

// Select component based on brief text and pillar
const selection = selectComponent(
  "Compare Telnyx vs Twilio for developers",
  "infrastructure"
);
// => { component: 'comparison-table', confidence: 0.9, ... }

// Render the selected component
const html = renderComponent({
  component: selection.component,
  width: 400,
  height: 300,
  typography,
  palette,
  pillar: 'infrastructure',
});
```

### Selection Logic

| Component | Trigger Keywords |
|-----------|-----------------|
| stats-grid | stats, countries, languages, compliance, trust |
| comparison-table | compare, vs, competitor, migrate, vendors |
| numbered-list | steps, process, how to, build, integrate |
| metric-cards | latency, performance, ms, benchmark, metrics |
