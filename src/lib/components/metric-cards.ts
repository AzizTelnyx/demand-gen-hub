/**
 * Metric Cards Component
 *
 * Renders horizontal metric display cards for benchmarks and comparisons.
 * Best for physics pillar showing performance metrics.
 *
 * Example:
 * ┌─────────────────────────────┐
 * │ Response latency    <500ms │
 * │ Typical multi-vendor  1.5-3s │
 * │ Infrastructure      Full stack │
 * │ Global PoPs           30+   │
 * └─────────────────────────────┘
 *
 * @module components/metric-cards
 */

import { PatternPalette } from '../brand-colors';
import { Typography } from '../typography';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface MetricItem {
  /** Metric label (e.g., "Response latency") */
  label: string;

  /** Metric value (e.g., "<500ms") */
  value: string;

  /** Optional sublabel for context */
  sublabel?: string;

  /** Is this a "good" metric (will be highlighted) */
  highlight?: boolean;

  /** Optional comparison value (e.g., "vs 1.5-3s") */
  comparison?: string;
}

export interface MetricCardsOptions {
  /** Layout style */
  layout?: 'stacked' | 'grid' | 'horizontal';

  /** Show dividers between metrics */
  showDividers?: boolean;

  /** Show background on cards */
  showBackground?: boolean;

  /** Border radius */
  borderRadius?: number;

  /** Show comparison column */
  showComparison?: boolean;
}

/* ─── Default Metrics ──────────────────────────────────────────────────────── */

export const DEFAULT_LATENCY_METRICS: MetricItem[] = [
  { label: 'Response latency', value: '<500ms', highlight: true, comparison: 'vs 1.5-3s' },
  { label: 'Typical multi-vendor', value: '1.5-3s', highlight: false },
  { label: 'Infrastructure', value: 'Full stack', highlight: true },
  { label: 'Global PoPs', value: '30+', highlight: true },
];

export const DEFAULT_PERFORMANCE_METRICS: MetricItem[] = [
  { label: 'End-to-end latency', value: '<500ms', highlight: true },
  { label: 'Voice quality', value: 'HD', highlight: true },
  { label: 'Languages', value: '70+', highlight: true },
  { label: 'Uptime SLA', value: '99.999%', highlight: true },
];

export const DEFAULT_INFRASTRUCTURE_METRICS: MetricItem[] = [
  { label: 'Vendors replaced', value: '4-5 → 1', highlight: true },
  { label: 'Network hops', value: '0 extra', highlight: true },
  { label: 'Countries', value: '140+', highlight: true },
  { label: 'Support', value: '24/7', highlight: true },
];

export const DEFAULT_COMPARISON_METRICS: MetricItem[] = [
  { label: 'Response latency', value: '<500ms', comparison: '1.5-3s', highlight: true },
  { label: 'Network path', value: 'Direct', comparison: '3-5 hops', highlight: true },
  { label: 'Integration', value: '1 platform', comparison: '4-5 vendors', highlight: true },
  { label: 'Support', value: 'One ticket', comparison: 'Finger pointing', highlight: true },
];

/* ─── Component Generator ──────────────────────────────────────────────────── */

/**
 * Generate HTML for metric cards component
 *
 * @param metrics - Array of metrics to display
 * @param width - Container width
 * @param height - Container height
 * @param typography - Typography settings
 * @param palette - Color palette
 * @param options - Display options
 * @returns HTML string
 *
 * @example
 * const html = generateMetricCards(
 *   DEFAULT_LATENCY_METRICS,
 *   400, 300,
 *   getTypography(1200, 627),
 *   getDarkModePalette()
 * );
 */
export function generateMetricCards(
  metrics: MetricItem[],
  width: number,
  height: number,
  typography: Typography,
  palette: PatternPalette,
  options: MetricCardsOptions = {}
): string {
  const {
    layout = 'stacked',
    showDividers = true,
    showBackground = true,
    borderRadius = 12,
    showComparison = false,
  } = options;

  const itemCount = metrics.length;
  const padding = 16;
  const gap = 8;

  // Calculate dimensions based on layout
  let itemWidth: number;
  let itemHeight: number;

  if (layout === 'stacked') {
    itemWidth = width - padding * 2;
    itemHeight = Math.floor((height - padding * 2 - gap * (itemCount - 1)) / itemCount);
  } else if (layout === 'grid') {
    const cols = 2;
    const rows = Math.ceil(itemCount / cols);
    itemWidth = Math.floor((width - padding * 2 - gap) / cols);
    itemHeight = Math.floor((height - padding * 2 - gap * (rows - 1)) / rows);
  } else {
    // horizontal
    itemWidth = Math.floor((width - padding * 2 - gap * (itemCount - 1)) / itemCount);
    itemHeight = height - padding * 2;
  }

  // Calculate font sizes
  const labelSize = Math.min(typography.metricLabel, itemHeight * 0.25);
  const valueSize = Math.min(typography.metricValue, itemHeight * 0.4);
  const comparisonSize = Math.min(typography.label, itemHeight * 0.2);

  const metricsHTML = metrics.map((metric, index) => {
    const isLast = index === metrics.length - 1;
    const divider = showDividers && !isLast && layout === 'stacked'
      ? `border-bottom: 1px solid ${palette.border};`
      : '';

    return `
      <div class="metric-card" style="
        ${layout === 'stacked' ? `width: 100%; height: ${itemHeight}px;` : ''}
        ${layout === 'grid' ? `width: ${itemWidth}px; height: ${itemHeight}px;` : ''}
        ${layout === 'horizontal' ? `width: ${itemWidth}px; height: 100%;` : ''}
        display: flex;
        ${layout === 'horizontal' ? 'flex-direction: column;' : 'flex-direction: row;'}
        align-items: center;
        justify-content: ${layout === 'horizontal' ? 'center' : 'space-between'};
        padding: ${gap}px ${padding}px;
        ${divider}
        ${layout !== 'stacked' && showBackground ? `
          background: ${palette.cardBackground};
          border: 1px solid ${palette.border};
          border-radius: ${borderRadius / 2}px;
        ` : ''}
      ">
        <div class="metric-label" style="
          font-size: ${labelSize}px;
          font-weight: 500;
          color: ${palette.textMuted};
          ${layout === 'horizontal' ? 'text-align: center; margin-bottom: 8px;' : ''}
        ">${metric.label}</div>
        <div class="metric-value-container" style="
          display: flex;
          align-items: center;
          gap: 8px;
        ">
          <div class="metric-value" style="
            font-size: ${valueSize}px;
            font-weight: 700;
            color: ${metric.highlight ? palette.accent : palette.text};
            letter-spacing: -0.5px;
          ">${metric.value}</div>
          ${showComparison && metric.comparison ? `
            <div class="metric-comparison" style="
              font-size: ${comparisonSize}px;
              font-weight: 400;
              color: ${palette.textMuted};
              text-decoration: line-through;
            ">${metric.comparison}</div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  const gridStyles = layout === 'grid' ? `
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: ${gap}px;
  ` : '';

  const flexStyles = layout === 'stacked' ? `
    display: flex;
    flex-direction: column;
  ` : layout === 'horizontal' ? `
    display: flex;
    flex-direction: row;
    gap: ${gap}px;
  ` : '';

  return `
    <div class="metric-cards" style="
      width: ${width}px;
      height: ${height}px;
      ${showBackground && layout === 'stacked' ? `
        background: ${palette.cardBackground};
        border: 1px solid ${palette.border};
        border-radius: ${borderRadius}px;
      ` : ''}
      padding: ${padding}px;
      ${gridStyles}
      ${flexStyles}
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    ">
      ${metricsHTML}
    </div>
  `;
}

/**
 * Generate single large metric display
 */
export function generateLargeMetric(
  metric: MetricItem,
  width: number,
  height: number,
  typography: Typography,
  palette: PatternPalette
): string {
  const valueSize = Math.min(typography.dataPoint, height * 0.35);
  const labelSize = Math.min(typography.body, height * 0.12);
  const sublabelSize = Math.min(typography.label, height * 0.08);

  return `
    <div class="large-metric" style="
      width: ${width}px;
      height: ${height}px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    ">
      <div style="
        font-size: ${valueSize}px;
        font-weight: 700;
        color: ${palette.accent};
        letter-spacing: -1px;
        line-height: 1;
      ">${metric.value}</div>
      <div style="
        font-size: ${labelSize}px;
        font-weight: 600;
        color: ${palette.text};
        text-transform: uppercase;
        letter-spacing: 1px;
      ">${metric.label}</div>
      ${metric.sublabel ? `
        <div style="
          font-size: ${sublabelSize}px;
          font-weight: 400;
          color: ${palette.textMuted};
        ">${metric.sublabel}</div>
      ` : ''}
    </div>
  `;
}

/**
 * Generate comparison bar (Telnyx vs competitor)
 */
export function generateComparisonBar(
  telnyxValue: number,
  competitorValue: number,
  label: string,
  unit: string,
  width: number,
  height: number,
  typography: Typography,
  palette: PatternPalette
): string {
  // Calculate bar widths (Telnyx should be smaller = better for latency)
  const maxValue = Math.max(telnyxValue, competitorValue);
  const telnyxWidth = Math.floor((telnyxValue / maxValue) * (width - 120));
  const competitorWidth = Math.floor((competitorValue / maxValue) * (width - 120));

  const barHeight = Math.floor((height - 40) / 2);
  const labelSize = typography.label;
  const valueSize = typography.metricValue;

  return `
    <div class="comparison-bar" style="
      width: ${width}px;
      height: ${height}px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 8px;
    ">
      <div style="
        font-size: ${labelSize}px;
        font-weight: 600;
        color: ${palette.textMuted};
        text-transform: uppercase;
        margin-bottom: 12px;
      ">${label}</div>

      <div style="
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      ">
        <div style="
          font-size: ${labelSize}px;
          color: ${palette.accent};
          font-weight: 600;
          width: 60px;
        ">Telnyx</div>
        <div style="
          width: ${telnyxWidth}px;
          height: ${barHeight}px;
          background: ${palette.accent};
          border-radius: 4px;
        "></div>
        <div style="
          font-size: ${valueSize}px;
          font-weight: 700;
          color: ${palette.accent};
        ">${telnyxValue}${unit}</div>
      </div>

      <div style="
        display: flex;
        align-items: center;
        gap: 12px;
      ">
        <div style="
          font-size: ${labelSize}px;
          color: ${palette.textMuted};
          font-weight: 500;
          width: 60px;
        ">Others</div>
        <div style="
          width: ${competitorWidth}px;
          height: ${barHeight}px;
          background: ${palette.border};
          border-radius: 4px;
        "></div>
        <div style="
          font-size: ${valueSize}px;
          font-weight: 700;
          color: ${palette.textMuted};
        ">${competitorValue}${unit}</div>
      </div>
    </div>
  `;
}

/**
 * Get default metrics by type
 */
export function getDefaultMetrics(
  type: 'latency' | 'performance' | 'infrastructure' | 'comparison'
): MetricItem[] {
  switch (type) {
    case 'latency':
      return DEFAULT_LATENCY_METRICS;
    case 'performance':
      return DEFAULT_PERFORMANCE_METRICS;
    case 'infrastructure':
      return DEFAULT_INFRASTRUCTURE_METRICS;
    case 'comparison':
      return DEFAULT_COMPARISON_METRICS;
    default:
      return DEFAULT_LATENCY_METRICS;
  }
}
