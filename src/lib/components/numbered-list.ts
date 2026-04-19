/**
 * Numbered List Component
 *
 * Renders process steps or ordered lists with circled numbers.
 * Best for infrastructure pillar showing workflows like:
 * ① Build your agent
 * ② Pick your model
 * ③ Connect telephony
 * ④ Test & launch
 *
 * @module components/numbered-list
 */

import { PatternPalette } from '../brand-colors';
import { Typography } from '../typography';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface NumberedItem {
  /** Main text for the step */
  text: string;

  /** Optional description below main text */
  description?: string;

  /** Optional icon to show instead of number */
  icon?: string;
}

export interface NumberedListOptions {
  /** Layout direction */
  direction?: 'vertical' | 'horizontal';

  /** Show connector lines between steps */
  showConnectors?: boolean;

  /** Number style */
  numberStyle?: 'circled' | 'plain' | 'filled';

  /** Starting number */
  startNumber?: number;

  /** Gap between items */
  gap?: number;
}

/* ─── Default Steps ────────────────────────────────────────────────────────── */

export const DEFAULT_BUILD_STEPS: NumberedItem[] = [
  { text: 'Build your agent', description: 'Design conversation flows' },
  { text: 'Pick your model', description: 'GPT-4, Claude, or bring your own' },
  { text: 'Connect telephony', description: 'Add phone numbers instantly' },
  { text: 'Test & launch', description: 'Go live in minutes' },
];

export const DEFAULT_MIGRATION_STEPS: NumberedItem[] = [
  { text: 'Connect your account', description: 'OAuth integration' },
  { text: 'Import configuration', description: 'Automatic agent setup' },
  { text: 'Test in parallel', description: 'Side-by-side comparison' },
  { text: 'Switch traffic', description: 'Zero downtime cutover' },
];

export const DEFAULT_INTEGRATION_STEPS: NumberedItem[] = [
  { text: 'Get API credentials', description: 'Instant access' },
  { text: 'Install SDK', description: 'npm, pip, or REST' },
  { text: 'Configure webhook', description: 'Real-time events' },
  { text: 'Go live', description: 'Production ready' },
];

/* ─── Unicode Numbers ──────────────────────────────────────────────────────── */

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const FILLED_NUMBERS = ['❶', '❷', '❸', '❹', '❺', '❻', '❼', '❽', '❾', '❿'];

function getNumberSymbol(
  index: number,
  style: 'circled' | 'plain' | 'filled',
  startNumber: number
): string {
  const num = startNumber + index;
  switch (style) {
    case 'circled':
      return CIRCLED_NUMBERS[num - 1] || String(num);
    case 'filled':
      return FILLED_NUMBERS[num - 1] || String(num);
    case 'plain':
    default:
      return `${num}.`;
  }
}

/* ─── Component Generator ──────────────────────────────────────────────────── */

/**
 * Generate HTML for numbered list component
 *
 * @param items - Array of items to display
 * @param width - Container width
 * @param height - Container height
 * @param typography - Typography settings
 * @param palette - Color palette
 * @param options - Display options
 * @returns HTML string
 *
 * @example
 * const html = generateNumberedList(
 *   DEFAULT_BUILD_STEPS,
 *   400, 300,
 *   getTypography(1200, 627),
 *   getDarkModePalette()
 * );
 */
export function generateNumberedList(
  items: NumberedItem[],
  width: number,
  height: number,
  typography: Typography,
  palette: PatternPalette,
  options: NumberedListOptions = {}
): string {
  const {
    direction = 'vertical',
    showConnectors = true,
    numberStyle = 'circled',
    startNumber = 1,
    gap = 16,
  } = options;

  const isVertical = direction === 'vertical';
  const itemCount = items.length;

  // Calculate dimensions
  const itemWidth = isVertical
    ? width - gap * 2
    : Math.floor((width - gap * (itemCount + 1)) / itemCount);

  const itemHeight = isVertical
    ? Math.floor((height - gap * (itemCount + 1)) / itemCount)
    : height - gap * 2;

  // Calculate font sizes
  const numberSize = Math.min(typography.dataPoint * 0.5, itemHeight * 0.4);
  const textSize = Math.min(typography.body, itemHeight * 0.25);
  const descSize = Math.min(typography.label, itemHeight * 0.18);

  const itemsHTML = items.map((item, index) => {
    const number = getNumberSymbol(index, numberStyle, startNumber);
    const isLast = index === items.length - 1;

    // Connector line (if not last item)
    const connectorHTML = showConnectors && !isLast ? `
      <div class="connector" style="
        ${isVertical
          ? `position: absolute;
             left: ${numberSize / 2 + gap}px;
             top: ${numberSize + 4}px;
             width: 2px;
             height: calc(100% - ${numberSize}px);`
          : `position: absolute;
             right: 0;
             top: 50%;
             transform: translateY(-50%);
             width: ${gap}px;
             height: 2px;`
        }
        background: ${palette.border};
      "></div>
    ` : '';

    return `
      <div class="numbered-item" style="
        position: relative;
        ${isVertical
          ? `width: 100%; height: ${itemHeight}px;`
          : `width: ${itemWidth}px; height: 100%;`
        }
        display: flex;
        ${isVertical ? 'flex-direction: row;' : 'flex-direction: column;'}
        align-items: ${isVertical ? 'flex-start' : 'center'};
        gap: ${gap}px;
        padding: ${gap / 2}px;
      ">
        <div class="number" style="
          font-size: ${numberSize}px;
          font-weight: 500;
          color: ${palette.accent};
          line-height: 1;
          flex-shrink: 0;
          ${isVertical ? '' : 'text-align: center;'}
        ">${number}</div>
        <div class="item-content" style="
          display: flex;
          flex-direction: column;
          gap: 4px;
          ${isVertical ? '' : 'text-align: center;'}
        ">
          <div class="item-text" style="
            font-size: ${textSize}px;
            font-weight: 600;
            color: ${palette.text};
            line-height: 1.3;
          ">${item.text}</div>
          ${item.description ? `
            <div class="item-description" style="
              font-size: ${descSize}px;
              font-weight: 400;
              color: ${palette.textMuted};
              line-height: 1.4;
            ">${item.description}</div>
          ` : ''}
        </div>
        ${connectorHTML}
      </div>
    `;
  }).join('');

  return `
    <div class="numbered-list" style="
      width: ${width}px;
      height: ${height}px;
      display: flex;
      ${isVertical ? 'flex-direction: column;' : 'flex-direction: row;'}
      gap: ${gap}px;
      padding: ${gap}px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    ">
      ${itemsHTML}
    </div>
  `;
}

/**
 * Generate compact numbered list (single line per item)
 */
export function generateCompactNumberedList(
  items: NumberedItem[],
  width: number,
  typography: Typography,
  palette: PatternPalette,
  options: NumberedListOptions = {}
): string {
  const {
    numberStyle = 'circled',
    startNumber = 1,
  } = options;

  const textSize = Math.min(typography.body, 14);
  const gap = 12;

  const itemsHTML = items.map((item, index) => {
    const number = getNumberSymbol(index, numberStyle, startNumber);

    return `
      <div class="compact-item" style="
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: ${gap}px;
      ">
        <span style="
          font-size: ${textSize + 4}px;
          color: ${palette.accent};
        ">${number}</span>
        <span style="
          font-size: ${textSize}px;
          font-weight: 500;
          color: ${palette.text};
        ">${item.text}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="compact-numbered-list" style="
      width: ${width}px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    ">
      ${itemsHTML}
    </div>
  `;
}

/**
 * Generate horizontal step indicator
 */
export function generateStepIndicator(
  items: NumberedItem[],
  width: number,
  height: number,
  typography: Typography,
  palette: PatternPalette,
  activeStep: number = 0
): string {
  const stepWidth = Math.floor(width / items.length);
  const circleSize = Math.min(height * 0.5, 40);
  const lineHeight = 3;

  const stepsHTML = items.map((item, index) => {
    const isActive = index === activeStep;
    const isCompleted = index < activeStep;
    const isLast = index === items.length - 1;

    return `
      <div class="step" style="
        width: ${stepWidth}px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        position: relative;
      ">
        ${!isLast ? `
          <div class="step-line" style="
            position: absolute;
            top: ${circleSize / 2}px;
            left: 50%;
            width: 100%;
            height: ${lineHeight}px;
            background: ${isCompleted ? palette.accent : palette.border};
          "></div>
        ` : ''}
        <div class="step-circle" style="
          width: ${circleSize}px;
          height: ${circleSize}px;
          border-radius: 50%;
          background: ${isActive || isCompleted ? palette.accent : palette.cardBackground};
          border: 2px solid ${isActive || isCompleted ? palette.accent : palette.border};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${circleSize * 0.45}px;
          font-weight: 600;
          color: ${isActive || isCompleted ? (palette.text === '#000000' ? '#FFFFFF' : '#000000') : palette.textMuted};
          position: relative;
          z-index: 1;
        ">${index + 1}</div>
        <div class="step-label" style="
          font-size: ${typography.label}px;
          font-weight: ${isActive ? 600 : 400};
          color: ${isActive ? palette.text : palette.textMuted};
          text-align: center;
          max-width: ${stepWidth - 8}px;
        ">${item.text}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="step-indicator" style="
      width: ${width}px;
      height: ${height}px;
      display: flex;
      align-items: flex-start;
      padding-top: 8px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    ">
      ${stepsHTML}
    </div>
  `;
}

/**
 * Get default steps by type
 */
export function getDefaultSteps(
  type: 'build' | 'migration' | 'integration'
): NumberedItem[] {
  switch (type) {
    case 'build':
      return DEFAULT_BUILD_STEPS;
    case 'migration':
      return DEFAULT_MIGRATION_STEPS;
    case 'integration':
      return DEFAULT_INTEGRATION_STEPS;
    default:
      return DEFAULT_BUILD_STEPS;
  }
}
