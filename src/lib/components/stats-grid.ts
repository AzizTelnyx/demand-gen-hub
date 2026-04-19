/**
 * Stats Grid Component
 *
 * Renders a 2x2 or 1x4 grid of stat cards with large numbers and labels.
 * Best for trust and infrastructure pillars showing metrics like:
 * - 30+ Countries
 * - 100+ Markets
 * - 70+ Languages
 * - 24/7 Support
 *
 * @module components/stats-grid
 */

import { NEUTRALS, PatternPalette } from '../brand-colors';
import { Typography } from '../typography';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface StatItem {
  /** Large value/number (e.g., "30+", "99.999%", "24/7") */
  value: string;

  /** Label below value (e.g., "Countries", "Uptime") */
  label: string;

  /** Optional sublabel for additional context */
  sublabel?: string;

  /** Optional icon name or path */
  icon?: string;
}

export interface StatsGridOptions {
  /** Grid arrangement: '2x2' or '1x4' or 'auto' */
  layout?: '2x2' | '1x4' | '1x3' | '2x1' | 'auto';

  /** Show borders between cards */
  showBorders?: boolean;

  /** Show background on cards */
  showCardBackground?: boolean;

  /** Card border radius in pixels */
  borderRadius?: number;

  /** Gap between cards */
  gap?: number;
}

/* ─── Default Stats ────────────────────────────────────────────────────────── */

export const DEFAULT_TRUST_STATS: StatItem[] = [
  { value: '30+', label: 'Countries', sublabel: 'with carrier license' },
  { value: '100+', label: 'Markets', sublabel: 'with local numbers' },
  { value: '70+', label: 'Languages', sublabel: 'supported' },
  { value: '24/7', label: 'Support', sublabel: 'engineering team' },
];

export const DEFAULT_INFRASTRUCTURE_STATS: StatItem[] = [
  { value: '1', label: 'Platform', sublabel: 'replaces 4-5 vendors' },
  { value: 'Own', label: 'Network', sublabel: 'not a reseller' },
  { value: '140+', label: 'Countries', sublabel: 'served' },
  { value: '0', label: 'Extra Hops', sublabel: 'direct carrier path' },
];

export const DEFAULT_PHYSICS_STATS: StatItem[] = [
  { value: '<500ms', label: 'Response', sublabel: 'end-to-end latency' },
  { value: '30+', label: 'Edge GPUs', sublabel: 'worldwide' },
  { value: '1 hop', label: 'Direct Path', sublabel: 'not 3-5 hops' },
  { value: 'HD', label: 'Voice Quality', sublabel: 'with noise suppression' },
];

/* ─── Component Generator ──────────────────────────────────────────────────── */

/**
 * Determine optimal grid layout based on container dimensions
 */
function getOptimalLayout(
  width: number,
  height: number,
  itemCount: number
): '2x2' | '1x4' | '1x3' | '2x1' {
  const aspectRatio = width / height;

  if (itemCount === 3) {
    return aspectRatio > 1.5 ? '1x3' : '1x3';
  }

  if (itemCount <= 2) {
    return aspectRatio > 1.5 ? '2x1' : '2x1';
  }

  // 4 items
  if (aspectRatio > 2) {
    return '1x4'; // Very wide: single row
  } else if (aspectRatio < 0.7) {
    return '2x2'; // Tall: 2x2 grid
  }
  return '2x2'; // Default to 2x2
}

/**
 * Generate HTML for stats grid component
 *
 * @param stats - Array of stat items to display
 * @param width - Container width
 * @param height - Container height
 * @param typography - Typography settings
 * @param palette - Color palette
 * @param options - Display options
 * @returns HTML string
 *
 * @example
 * const html = generateStatsGrid(
 *   DEFAULT_TRUST_STATS,
 *   400, 300,
 *   getTypography(1200, 627),
 *   getDarkModePalette()
 * );
 */
export function generateStatsGrid(
  stats: StatItem[],
  width: number,
  height: number,
  typography: Typography,
  palette: PatternPalette,
  options: StatsGridOptions = {}
): string {
  const {
    layout = 'auto',
    showBorders = true,
    showCardBackground = true,
    borderRadius = 12,
    gap = 12,
  } = options;

  const actualLayout = layout === 'auto'
    ? getOptimalLayout(width, height, stats.length)
    : layout;

  const isHorizontal = actualLayout === '1x4' || actualLayout === '1x3' || actualLayout === '2x1';
  const columns = actualLayout === '2x2' ? 2 : (actualLayout === '1x3' ? 3 : (actualLayout === '2x1' ? 2 : 4));
  const rows = actualLayout === '2x2' ? 2 : 1;

  // Calculate card dimensions
  const cardWidth = Math.floor((width - gap * (columns + 1)) / columns);
  const cardHeight = Math.floor((height - gap * (rows + 1)) / rows);

  // Adjust font sizes based on card size
  const valueSize = Math.min(typography.dataPoint, Math.floor(cardHeight * 0.35));
  const labelSize = Math.min(typography.dataLabel, Math.floor(cardHeight * 0.12));
  const sublabelSize = Math.min(typography.label, Math.floor(cardHeight * 0.1));

  const cardsHTML = stats.slice(0, 4).map((stat, index) => `
    <div class="stat-card" style="
      width: ${cardWidth}px;
      height: ${cardHeight}px;
      ${showCardBackground ? `background: ${palette.cardBackground};` : ''}
      ${showBorders ? `border: 1px solid ${palette.border};` : ''}
      border-radius: ${borderRadius}px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: ${Math.floor(cardHeight * 0.1)}px;
      gap: ${Math.floor(cardHeight * 0.05)}px;
    ">
      <div class="stat-value" style="
        font-size: ${valueSize}px;
        font-weight: 700;
        color: ${index === 0 ? palette.accent : palette.text};
        line-height: 1.1;
        letter-spacing: -0.5px;
      ">${stat.value}</div>
      <div class="stat-label" style="
        font-size: ${labelSize}px;
        font-weight: 600;
        color: ${palette.text};
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">${stat.label}</div>
      ${stat.sublabel ? `
        <div class="stat-sublabel" style="
          font-size: ${sublabelSize}px;
          font-weight: 400;
          color: ${palette.textMuted};
          text-align: center;
        ">${stat.sublabel}</div>
      ` : ''}
    </div>
  `).join('');

  return `
    <div class="stats-grid" style="
      width: ${width}px;
      height: ${height}px;
      display: grid;
      grid-template-columns: repeat(${columns}, 1fr);
      grid-template-rows: repeat(${rows}, 1fr);
      gap: ${gap}px;
      padding: ${gap}px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    ">
      ${cardsHTML}
    </div>
  `;
}

/**
 * Generate inline stats row (for compact displays)
 */
export function generateStatsRow(
  stats: StatItem[],
  width: number,
  typography: Typography,
  palette: PatternPalette
): string {
  const itemWidth = Math.floor(width / stats.length);
  const valueSize = Math.min(typography.metricValue, 24);
  const labelSize = Math.min(typography.metricLabel, 11);

  const itemsHTML = stats.map((stat, index) => `
    <div class="stat-item" style="
      flex: 1;
      text-align: center;
      ${index < stats.length - 1 ? `border-right: 1px solid ${palette.border};` : ''}
      padding: 8px;
    ">
      <div style="
        font-size: ${valueSize}px;
        font-weight: 700;
        color: ${palette.accent};
      ">${stat.value}</div>
      <div style="
        font-size: ${labelSize}px;
        font-weight: 500;
        color: ${palette.textMuted};
        text-transform: uppercase;
        margin-top: 4px;
      ">${stat.label}</div>
    </div>
  `).join('');

  return `
    <div class="stats-row" style="
      width: ${width}px;
      display: flex;
      background: ${palette.cardBackground};
      border: 1px solid ${palette.border};
      border-radius: 8px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    ">
      ${itemsHTML}
    </div>
  `;
}

/**
 * Get default stats for a pillar
 */
export function getDefaultStats(pillar: 'trust' | 'infrastructure' | 'physics'): StatItem[] {
  switch (pillar) {
    case 'trust':
      return DEFAULT_TRUST_STATS;
    case 'infrastructure':
      return DEFAULT_INFRASTRUCTURE_STATS;
    case 'physics':
      return DEFAULT_PHYSICS_STATS;
    default:
      return DEFAULT_TRUST_STATS;
  }
}
