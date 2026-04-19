/**
 * Data Visualization Components Registry
 *
 * Exports all data visualization components and provides helper functions
 * to select appropriate components based on pattern, pillar, and content.
 *
 * @module components
 */

// Re-export all components
export {
  generateStatsGrid,
  generateStatsRow,
  getDefaultStats,
  type StatItem,
  type StatsGridOptions,
  DEFAULT_TRUST_STATS,
  DEFAULT_INFRASTRUCTURE_STATS,
  DEFAULT_PHYSICS_STATS,
} from './stats-grid';

export {
  generateComparisonTable,
  generateComparisonCards,
  getDefaultComparison,
  type ComparisonRow,
  type ComparisonData,
  type ComparisonTableOptions,
  DEFAULT_VENDOR_COMPARISON,
  DEFAULT_LATENCY_COMPARISON,
  DEFAULT_MIGRATION_COMPARISON,
} from './comparison-table';

export {
  generateNumberedList,
  generateCompactNumberedList,
  generateStepIndicator,
  getDefaultSteps,
  type NumberedItem,
  type NumberedListOptions,
  DEFAULT_BUILD_STEPS,
  DEFAULT_MIGRATION_STEPS,
  DEFAULT_INTEGRATION_STEPS,
} from './numbered-list';

export {
  generateMetricCards,
  generateLargeMetric,
  generateComparisonBar,
  getDefaultMetrics,
  type MetricItem,
  type MetricCardsOptions,
  DEFAULT_LATENCY_METRICS,
  DEFAULT_PERFORMANCE_METRICS,
  DEFAULT_INFRASTRUCTURE_METRICS,
  DEFAULT_COMPARISON_METRICS,
} from './metric-cards';

import { PatternPalette } from '../brand-colors';
import { Typography } from '../typography';
import { generateStatsGrid, getDefaultStats } from './stats-grid';
import { generateComparisonTable, getDefaultComparison } from './comparison-table';
import { generateNumberedList, getDefaultSteps } from './numbered-list';
import { generateMetricCards, getDefaultMetrics } from './metric-cards';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type ComponentType =
  | 'stats-grid'
  | 'comparison-table'
  | 'numbered-list'
  | 'metric-cards'
  | 'none';

export type Pillar = 'trust' | 'infrastructure' | 'physics';

export interface ComponentSelection {
  /** Selected component type */
  component: ComponentType;

  /** Confidence score (0-1) */
  confidence: number;

  /** Reason for selection */
  reason: string;

  /** Default data to use if not provided */
  defaultDataType?: string;
}

export interface ComponentRenderOptions {
  /** Component type to render */
  component: ComponentType;

  /** Width of container */
  width: number;

  /** Height of container */
  height: number;

  /** Typography settings */
  typography: Typography;

  /** Color palette */
  palette: PatternPalette;

  /** Pillar for default data selection */
  pillar?: Pillar;

  /** Custom data (if not provided, uses defaults) */
  data?: unknown;
}

/* ─── Component Selection Logic ────────────────────────────────────────────── */

/**
 * Keywords that suggest specific components
 */
const COMPONENT_KEYWORDS: Record<ComponentType, string[]> = {
  'stats-grid': [
    'stats', 'statistics', 'countries', 'languages', 'markets', 'uptime',
    'coverage', 'global', 'compliance', 'certifications', 'trust',
  ],
  'comparison-table': [
    'compare', 'vs', 'versus', 'competitor', 'alternative', 'better than',
    'unlike', 'whereas', 'multi-vendor', 'stack', 'vendors', 'migrate',
  ],
  'numbered-list': [
    'steps', 'process', 'how to', 'getting started', 'quick start',
    'workflow', 'build', 'integrate', 'setup', 'guide',
  ],
  'metric-cards': [
    'latency', 'performance', 'speed', 'ms', 'milliseconds', 'benchmark',
    'metrics', 'response time', 'infrastructure', 'specifications',
  ],
  'none': [],
};

/**
 * Pillar to component mapping
 */
const PILLAR_COMPONENTS: Record<Pillar, ComponentType[]> = {
  trust: ['stats-grid', 'comparison-table'],
  infrastructure: ['comparison-table', 'numbered-list', 'stats-grid'],
  physics: ['metric-cards', 'comparison-table'],
};

/**
 * Select appropriate component based on brief text and pillar
 *
 * @param briefText - Full brief text to analyze
 * @param pillar - Messaging pillar
 * @returns ComponentSelection with recommendation
 *
 * @example
 * const selection = selectComponent(
 *   "Compare Telnyx vs Twilio for developers",
 *   "infrastructure"
 * );
 * // => { component: 'comparison-table', confidence: 0.9, ... }
 */
export function selectComponent(
  briefText: string,
  pillar: Pillar
): ComponentSelection {
  const lowerText = briefText.toLowerCase();

  // Score each component type based on keyword matches
  const scores: Record<ComponentType, number> = {
    'stats-grid': 0,
    'comparison-table': 0,
    'numbered-list': 0,
    'metric-cards': 0,
    'none': 0,
  };

  // Check keywords
  for (const [component, keywords] of Object.entries(COMPONENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        scores[component as ComponentType] += 1;
      }
    }
  }

  // Boost scores for pillar-appropriate components
  const pillarComponents = PILLAR_COMPONENTS[pillar];
  for (const component of pillarComponents) {
    scores[component] += 0.5;
  }

  // Find highest scoring component
  let bestComponent: ComponentType = 'none';
  let bestScore = 0;

  for (const [component, score] of Object.entries(scores)) {
    if (score > bestScore && component !== 'none') {
      bestComponent = component as ComponentType;
      bestScore = score;
    }
  }

  // Calculate confidence (normalize to 0-1)
  const maxPossibleScore = 5; // Approximate max keyword matches
  const confidence = Math.min(1, bestScore / maxPossibleScore);

  // Determine default data type
  let defaultDataType: string | undefined;
  switch (bestComponent) {
    case 'stats-grid':
      defaultDataType = pillar;
      break;
    case 'comparison-table':
      defaultDataType = lowerText.includes('migrate') ? 'migration'
        : lowerText.includes('latency') ? 'latency' : 'vendor';
      break;
    case 'numbered-list':
      defaultDataType = lowerText.includes('migrate') ? 'migration'
        : lowerText.includes('integrate') ? 'integration' : 'build';
      break;
    case 'metric-cards':
      defaultDataType = lowerText.includes('infrastructure') ? 'infrastructure'
        : lowerText.includes('compare') ? 'comparison' : 'latency';
      break;
  }

  // Generate reason
  const reasons: Record<ComponentType, string> = {
    'stats-grid': `Stats grid chosen for ${pillar} pillar to show key metrics`,
    'comparison-table': 'Comparison table chosen for competitive positioning',
    'numbered-list': 'Numbered list chosen to show process/workflow',
    'metric-cards': 'Metric cards chosen for performance data display',
    'none': 'No data visualization component recommended',
  };

  return {
    component: bestComponent,
    confidence,
    reason: reasons[bestComponent],
    defaultDataType,
  };
}

/**
 * Render a component with given options
 *
 * @param options - Component render options
 * @returns HTML string for the component
 *
 * @example
 * const html = renderComponent({
 *   component: 'stats-grid',
 *   width: 400,
 *   height: 300,
 *   typography: getTypography(1200, 627),
 *   palette: getDarkModePalette(),
 *   pillar: 'trust'
 * });
 */
export function renderComponent(options: ComponentRenderOptions): string {
  const { component, width, height, typography, palette, pillar = 'trust', data } = options;

  switch (component) {
    case 'stats-grid': {
      const stats = data || getDefaultStats(pillar);
      return generateStatsGrid(stats as any, width, height, typography, palette);
    }

    case 'comparison-table': {
      const comparisonType = pillar === 'physics' ? 'latency'
        : pillar === 'infrastructure' ? 'vendor' : 'vendor';
      const comparisonData = data || getDefaultComparison(comparisonType);
      return generateComparisonTable(comparisonData as any, width, height, typography, palette);
    }

    case 'numbered-list': {
      const stepType = pillar === 'infrastructure' ? 'build' : 'integration';
      const steps = data || getDefaultSteps(stepType);
      return generateNumberedList(steps as any, width, height, typography, palette);
    }

    case 'metric-cards': {
      const metricType = pillar === 'physics' ? 'latency'
        : pillar === 'infrastructure' ? 'infrastructure' : 'performance';
      const metrics = data || getDefaultMetrics(metricType);
      return generateMetricCards(metrics as any, width, height, typography, palette);
    }

    case 'none':
    default:
      return '';
  }
}

/**
 * Check if a component should be shown based on available space
 *
 * @param component - Component type
 * @param width - Available width
 * @param height - Available height
 * @returns Whether the component has enough space
 */
export function hasMinimumSpace(
  component: ComponentType,
  width: number,
  height: number
): boolean {
  const minimums: Record<ComponentType, { width: number; height: number }> = {
    'stats-grid': { width: 200, height: 150 },
    'comparison-table': { width: 300, height: 200 },
    'numbered-list': { width: 250, height: 180 },
    'metric-cards': { width: 250, height: 150 },
    'none': { width: 0, height: 0 },
  };

  const min = minimums[component];
  return width >= min.width && height >= min.height;
}

/**
 * Get all available component types
 */
export function getAvailableComponents(): ComponentType[] {
  return ['stats-grid', 'comparison-table', 'numbered-list', 'metric-cards'];
}

/**
 * Get recommended components for a pillar
 */
export function getRecommendedComponents(pillar: Pillar): ComponentType[] {
  return PILLAR_COMPONENTS[pillar];
}
