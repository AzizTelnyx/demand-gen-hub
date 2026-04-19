/**
 * Comparison Table Component
 *
 * Renders a two-column comparison showing competitor limitations vs Telnyx advantages.
 * Best for infrastructure pillar and competitive positioning.
 *
 * Example:
 * Multi-vendor stack    │  Telnyx Voice AI
 * ✗ SIP + STT + TTS    │  ✓ One platform
 * ✗ 3-5 carrier hops   │  ✓ Sub-second latency
 * ✗ 4 dashboards       │  ✓ End-to-end traces
 *
 * @module components/comparison-table
 */

import { NEUTRALS, PatternPalette } from '../brand-colors';
import { Typography } from '../typography';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface ComparisonRow {
  /** Text for the "bad" column (competitor/old way) */
  bad: string;

  /** Text for the "good" column (Telnyx advantage) */
  good: string;
}

export interface ComparisonData {
  /** Header for left column (e.g., "Multi-vendor stack") */
  badHeader: string;

  /** Header for right column (e.g., "Telnyx Voice AI") */
  goodHeader: string;

  /** Comparison rows */
  rows: ComparisonRow[];
}

export interface ComparisonTableOptions {
  /** Show column headers */
  showHeaders?: boolean;

  /** Show row separators */
  showSeparators?: boolean;

  /** Border radius for the table */
  borderRadius?: number;

  /** Use icons (✗/✓) or colored backgrounds */
  style?: 'icons' | 'backgrounds' | 'minimal';
}

/* ─── Default Comparisons ──────────────────────────────────────────────────── */

export const DEFAULT_VENDOR_COMPARISON: ComparisonData = {
  badHeader: 'Multi-vendor stack',
  goodHeader: 'Telnyx Voice AI',
  rows: [
    { bad: 'SIP + STT + TTS + LLM', good: 'One platform' },
    { bad: '3-5 carrier hops', good: 'Sub-second latency' },
    { bad: '4 dashboards', good: 'End-to-end traces' },
    { bad: 'Finger pointing', good: 'Single support ticket' },
  ],
};

export const DEFAULT_LATENCY_COMPARISON: ComparisonData = {
  badHeader: 'Typical multi-vendor',
  goodHeader: 'Telnyx',
  rows: [
    { bad: '1.5-3s response time', good: '<500ms response' },
    { bad: 'Multiple network hops', good: 'Direct carrier path' },
    { bad: 'Separate AI services', good: 'Co-located inference' },
    { bad: 'Inconsistent quality', good: 'HD voice guaranteed' },
  ],
};

export const DEFAULT_MIGRATION_COMPARISON: ComparisonData = {
  badHeader: 'Current provider',
  goodHeader: 'Telnyx Voice AI',
  rows: [
    { bad: 'Per-minute STT/TTS fees', good: 'Bundled pricing' },
    { bad: 'Complex integration', good: '1-click migration' },
    { bad: 'Limited languages', good: '70+ languages' },
    { bad: 'No telephony control', good: 'Full stack ownership' },
  ],
};

/* ─── Component Generator ──────────────────────────────────────────────────── */

/**
 * Generate HTML for comparison table component
 *
 * @param data - Comparison data with headers and rows
 * @param width - Container width
 * @param height - Container height
 * @param typography - Typography settings
 * @param palette - Color palette
 * @param options - Display options
 * @returns HTML string
 *
 * @example
 * const html = generateComparisonTable(
 *   DEFAULT_VENDOR_COMPARISON,
 *   500, 300,
 *   getTypography(1200, 627),
 *   getDarkModePalette()
 * );
 */
export function generateComparisonTable(
  data: ComparisonData,
  width: number,
  height: number,
  typography: Typography,
  palette: PatternPalette,
  options: ComparisonTableOptions = {}
): string {
  const {
    showHeaders = true,
    showSeparators = true,
    borderRadius = 12,
    style = 'icons',
  } = options;

  const columnWidth = Math.floor((width - 20) / 2);
  const headerHeight = showHeaders ? 48 : 0;
  const rowCount = data.rows.length;
  const rowHeight = Math.floor((height - headerHeight - 16) / rowCount);

  // Calculate font sizes based on available space
  const headerSize = Math.min(typography.label, Math.floor(headerHeight * 0.35));
  const rowSize = Math.min(typography.body, Math.floor(rowHeight * 0.35));
  const iconSize = Math.floor(rowHeight * 0.4);

  // Colors for good/bad indicators
  const badColor = palette.text === NEUTRALS.white ? '#FF6B6B' : '#DC3545';
  const goodColor = palette.accent;

  const headerHTML = showHeaders ? `
    <div class="comparison-headers" style="
      display: flex;
      height: ${headerHeight}px;
      border-bottom: 1px solid ${palette.border};
    ">
      <div class="header-bad" style="
        flex: 1;
        display: flex;
        align-items: center;
        padding: 0 16px;
        font-size: ${headerSize}px;
        font-weight: 600;
        color: ${palette.textMuted};
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">${data.badHeader}</div>
      <div class="header-good" style="
        flex: 1;
        display: flex;
        align-items: center;
        padding: 0 16px;
        font-size: ${headerSize}px;
        font-weight: 600;
        color: ${goodColor};
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">${data.goodHeader}</div>
    </div>
  ` : '';

  const rowsHTML = data.rows.map((row, index) => {
    const isLast = index === data.rows.length - 1;
    const separator = showSeparators && !isLast
      ? `border-bottom: 1px solid ${palette.border};`
      : '';

    if (style === 'icons') {
      return `
        <div class="comparison-row" style="
          display: flex;
          height: ${rowHeight}px;
          ${separator}
        ">
          <div class="row-bad" style="
            flex: 1;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 0 16px;
            color: ${palette.textMuted};
          ">
            <span style="
              font-size: ${iconSize}px;
              color: ${badColor};
              font-weight: 400;
            ">✗</span>
            <span style="
              font-size: ${rowSize}px;
              font-weight: 400;
            ">${row.bad}</span>
          </div>
          <div class="row-good" style="
            flex: 1;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 0 16px;
            color: ${palette.text};
          ">
            <span style="
              font-size: ${iconSize}px;
              color: ${goodColor};
              font-weight: 600;
            ">✓</span>
            <span style="
              font-size: ${rowSize}px;
              font-weight: 500;
            ">${row.good}</span>
          </div>
        </div>
      `;
    } else if (style === 'backgrounds') {
      return `
        <div class="comparison-row" style="
          display: flex;
          height: ${rowHeight}px;
          ${separator}
        ">
          <div class="row-bad" style="
            flex: 1;
            display: flex;
            align-items: center;
            padding: 0 16px;
            background: ${badColor}15;
            font-size: ${rowSize}px;
            color: ${palette.textMuted};
          ">${row.bad}</div>
          <div class="row-good" style="
            flex: 1;
            display: flex;
            align-items: center;
            padding: 0 16px;
            background: ${goodColor}15;
            font-size: ${rowSize}px;
            font-weight: 500;
            color: ${palette.text};
          ">${row.good}</div>
        </div>
      `;
    }

    // Minimal style
    return `
      <div class="comparison-row" style="
        display: flex;
        height: ${rowHeight}px;
        ${separator}
      ">
        <div class="row-bad" style="
          flex: 1;
          display: flex;
          align-items: center;
          padding: 0 16px;
          font-size: ${rowSize}px;
          color: ${palette.textMuted};
          text-decoration: line-through;
        ">${row.bad}</div>
        <div class="row-good" style="
          flex: 1;
          display: flex;
          align-items: center;
          padding: 0 16px;
          font-size: ${rowSize}px;
          font-weight: 500;
          color: ${palette.text};
        ">${row.good}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="comparison-table" style="
      width: ${width}px;
      height: ${height}px;
      background: ${palette.cardBackground};
      border: 1px solid ${palette.border};
      border-radius: ${borderRadius}px;
      overflow: hidden;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    ">
      ${headerHTML}
      <div class="comparison-rows">
        ${rowsHTML}
      </div>
    </div>
  `;
}

/**
 * Generate compact comparison (side-by-side cards)
 */
export function generateComparisonCards(
  data: ComparisonData,
  width: number,
  height: number,
  typography: Typography,
  palette: PatternPalette
): string {
  const cardWidth = Math.floor((width - 16) / 2);
  const headerSize = Math.min(typography.label, 12);
  const itemSize = Math.min(typography.body, 14);

  const badItemsHTML = data.rows.map(row => `
    <div style="
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
    ">
      <span style="color: #FF6B6B; font-size: 14px;">✗</span>
      <span style="font-size: ${itemSize}px; color: ${palette.textMuted};">${row.bad}</span>
    </div>
  `).join('');

  const goodItemsHTML = data.rows.map(row => `
    <div style="
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
    ">
      <span style="color: ${palette.accent}; font-size: 14px; font-weight: 600;">✓</span>
      <span style="font-size: ${itemSize}px; color: ${palette.text}; font-weight: 500;">${row.good}</span>
    </div>
  `).join('');

  return `
    <div class="comparison-cards" style="
      width: ${width}px;
      height: ${height}px;
      display: flex;
      gap: 16px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    ">
      <div class="card-bad" style="
        flex: 1;
        background: ${palette.cardBackground};
        border: 1px solid ${palette.border};
        border-radius: 12px;
        padding: 16px;
      ">
        <div style="
          font-size: ${headerSize}px;
          font-weight: 600;
          color: ${palette.textMuted};
          text-transform: uppercase;
          margin-bottom: 16px;
        ">${data.badHeader}</div>
        ${badItemsHTML}
      </div>
      <div class="card-good" style="
        flex: 1;
        background: ${palette.cardBackground};
        border: 1px solid ${palette.accent}40;
        border-radius: 12px;
        padding: 16px;
      ">
        <div style="
          font-size: ${headerSize}px;
          font-weight: 600;
          color: ${palette.accent};
          text-transform: uppercase;
          margin-bottom: 16px;
        ">${data.goodHeader}</div>
        ${goodItemsHTML}
      </div>
    </div>
  `;
}

/**
 * Get default comparison data by type
 */
export function getDefaultComparison(
  type: 'vendor' | 'latency' | 'migration'
): ComparisonData {
  switch (type) {
    case 'vendor':
      return DEFAULT_VENDOR_COMPARISON;
    case 'latency':
      return DEFAULT_LATENCY_COMPARISON;
    case 'migration':
      return DEFAULT_MIGRATION_COMPARISON;
    default:
      return DEFAULT_VENDOR_COMPARISON;
  }
}
