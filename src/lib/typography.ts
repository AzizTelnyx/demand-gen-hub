/**
 * Size-Adaptive Typography System
 *
 * Calculates font sizes dynamically based on canvas dimensions to ensure
 * readable text across all banner sizes (landscape, square, portrait).
 *
 * Reference canvas: 1200x627 (LinkedIn landscape)
 * Scale factor is calculated using square root of area ratio for balanced scaling.
 *
 * @module typography
 */

/* ─── Configuration ────────────────────────────────────────────────────────── */

/** Reference dimensions for scale calculations */
const REFERENCE = {
  width: 1200,
  height: 627,
  get area() {
    return this.width * this.height;
  },
} as const;

/** Base font sizes at reference dimensions (1200x627) */
const BASE_SIZES = {
  /** Hero/main headline */
  headline: 48,

  /** Secondary headline / subheadline */
  subheadline: 32,

  /** Body text / descriptions */
  body: 16,

  /** Small labels / badges */
  label: 11,

  /** CTA button text */
  cta: 14,

  /** Data point numbers (large stats) */
  dataPoint: 64,

  /** Data point labels */
  dataLabel: 12,

  /** Metric value in cards */
  metricValue: 24,

  /** Metric label in cards */
  metricLabel: 11,
} as const;

/** Scaling constraints to prevent extreme sizes */
const SCALE_LIMITS = {
  headline: { min: 0.5, max: 1.4 },
  subheadline: { min: 0.6, max: 1.3 },
  body: { min: 0.7, max: 1.3 },
  label: { min: 0.8, max: 1.2 },
  cta: { min: 0.7, max: 1.2 },
  dataPoint: { min: 0.5, max: 1.5 },
  dataLabel: { min: 0.8, max: 1.2 },
  metricValue: { min: 0.6, max: 1.3 },
  metricLabel: { min: 0.8, max: 1.2 },
} as const;

/** Minimum pixel sizes for readability */
const MIN_READABLE_SIZES = {
  headline: 24,
  subheadline: 18,
  body: 12,
  label: 9,
  cta: 11,
  dataPoint: 32,
  dataLabel: 9,
  metricValue: 16,
  metricLabel: 9,
} as const;

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface Typography {
  /** Hero/main headline size in pixels */
  headline: number;

  /** Secondary headline size */
  subheadline: number;

  /** Body text / description size */
  body: number;

  /** Small label / badge size */
  label: number;

  /** CTA button text size */
  cta: number;

  /** Large data point number size */
  dataPoint: number;

  /** Data point label size */
  dataLabel: number;

  /** Metric card value size */
  metricValue: number;

  /** Metric card label size */
  metricLabel: number;
}

export interface TypographyOptions {
  /** Force minimum sizes for small canvases */
  enforceMinimums?: boolean;

  /** Custom scale multiplier (1.0 = normal) */
  scaleMultiplier?: number;

  /** Aspect ratio adjustment (increase sizes for portrait) */
  adjustForAspect?: boolean;
}

export interface LineHeights {
  /** Tight line height for headlines */
  tight: number;

  /** Normal line height for body text */
  normal: number;

  /** Relaxed line height for large blocks */
  relaxed: number;
}

export interface FontWeights {
  /** Thin weight (100) */
  thin: number;

  /** Light weight (300) */
  light: number;

  /** Regular weight (400) */
  regular: number;

  /** Medium weight (500) */
  medium: number;

  /** Semibold weight (600) */
  semibold: number;

  /** Bold weight (700) */
  bold: number;

  /** Extra bold weight (800) */
  extrabold: number;

  /** Black weight (900) */
  black: number;
}

/* ─── Core Functions ───────────────────────────────────────────────────────── */

/**
 * Calculate typography sizes based on canvas dimensions
 *
 * Uses area-based scaling with square root to provide balanced sizing
 * across different aspect ratios. Applies min/max constraints and
 * enforces minimum readable sizes.
 *
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param options - Optional configuration
 * @returns Typography object with all calculated sizes
 *
 * @example
 * // Standard LinkedIn landscape
 * getTypography(1200, 627)
 * // => { headline: 48, body: 16, ... }
 *
 * @example
 * // Small display ad
 * getTypography(300, 250)
 * // => { headline: 24, body: 12, ... }
 *
 * @example
 * // Portrait format
 * getTypography(628, 1200)
 * // => { headline: 38, body: 14, ... } (adjusted for aspect)
 */
export function getTypography(
  width: number,
  height: number,
  options: TypographyOptions = {}
): Typography {
  const {
    enforceMinimums = true,
    scaleMultiplier = 1.0,
    adjustForAspect = true,
  } = options;

  // Calculate area-based scale factor
  const area = width * height;
  let scale = Math.sqrt(area / REFERENCE.area) * scaleMultiplier;

  // Adjust for portrait orientation (text needs to be larger relative to width)
  if (adjustForAspect && height > width) {
    const aspectRatio = height / width;
    // Boost scale for portrait (up to 15% for very tall formats)
    scale *= 1 + Math.min(0.15, (aspectRatio - 1) * 0.1);
  }

  // Calculate each size with constraints
  const calculateSize = (
    key: keyof typeof BASE_SIZES & keyof typeof SCALE_LIMITS
  ): number => {
    const base = BASE_SIZES[key];
    const limits = SCALE_LIMITS[key];
    const minReadable = MIN_READABLE_SIZES[key];

    // Apply scale with limits
    const clampedScale = Math.max(limits.min, Math.min(limits.max, scale));
    let size = Math.round(base * clampedScale);

    // Enforce minimum readable size
    if (enforceMinimums && size < minReadable) {
      size = minReadable;
    }

    return size;
  };

  return {
    headline: calculateSize('headline'),
    subheadline: calculateSize('subheadline'),
    body: calculateSize('body'),
    label: calculateSize('label'),
    cta: calculateSize('cta'),
    dataPoint: calculateSize('dataPoint'),
    dataLabel: calculateSize('dataLabel'),
    metricValue: calculateSize('metricValue'),
    metricLabel: calculateSize('metricLabel'),
  };
}

/**
 * Get line heights for typography
 * Returns multipliers to use with font sizes
 */
export function getLineHeights(): LineHeights {
  return {
    tight: 1.15,
    normal: 1.5,
    relaxed: 1.7,
  };
}

/**
 * Get font weight values
 */
export function getFontWeights(): FontWeights {
  return {
    thin: 100,
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  };
}

/**
 * Get recommended padding based on canvas size
 *
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Padding value in pixels
 */
export function getPadding(width: number, height: number): number {
  const minDimension = Math.min(width, height);

  // Scale padding relative to canvas size
  // Minimum 24px, maximum 80px
  const basePadding = minDimension * 0.06;
  return Math.round(Math.max(24, Math.min(80, basePadding)));
}

/**
 * Get recommended spacing/gap based on canvas size
 *
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Gap value in pixels
 */
export function getSpacing(width: number, height: number): number {
  const padding = getPadding(width, height);
  return Math.round(padding * 0.5);
}

/**
 * Calculate optimal headline length (characters) for width
 * Helps determine if text should be truncated or wrapped
 *
 * @param width - Available width for text
 * @param fontSize - Font size in pixels
 * @returns Recommended max characters
 */
export function getOptimalHeadlineLength(width: number, fontSize: number): number {
  // Approximate characters per pixel (based on Inter font)
  const charsPerPixel = 1 / (fontSize * 0.55);
  return Math.floor(width * charsPerPixel);
}

/**
 * Truncate text to fit within character limit with ellipsis
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum character length
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3).trim() + '...';
}

/* ─── CSS Generation ───────────────────────────────────────────────────────── */

/**
 * Generate CSS custom properties for typography
 *
 * @param typography - Typography object from getTypography
 * @returns CSS string with custom properties
 *
 * @example
 * const typo = getTypography(1200, 627);
 * const css = generateTypographyCSS(typo);
 * // => `:root { --font-headline: 48px; --font-body: 16px; ... }`
 */
export function generateTypographyCSS(typography: Typography): string {
  const lineHeights = getLineHeights();

  return `
    :root {
      /* Font Sizes */
      --font-headline: ${typography.headline}px;
      --font-subheadline: ${typography.subheadline}px;
      --font-body: ${typography.body}px;
      --font-label: ${typography.label}px;
      --font-cta: ${typography.cta}px;
      --font-data-point: ${typography.dataPoint}px;
      --font-data-label: ${typography.dataLabel}px;
      --font-metric-value: ${typography.metricValue}px;
      --font-metric-label: ${typography.metricLabel}px;

      /* Line Heights */
      --line-height-tight: ${lineHeights.tight};
      --line-height-normal: ${lineHeights.normal};
      --line-height-relaxed: ${lineHeights.relaxed};

      /* Font Family */
      --font-family-headline: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-family-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
  `.trim();
}

/**
 * Generate inline styles object for a typography role
 *
 * @param role - Typography role (headline, body, etc.)
 * @param typography - Typography object from getTypography
 * @returns Style object suitable for inline styles
 */
export function getInlineStyles(
  role: keyof Typography,
  typography: Typography
): Record<string, string> {
  const lineHeights = getLineHeights();
  const weights = getFontWeights();

  const roleConfig: Record<keyof Typography, {
    lineHeight: keyof LineHeights;
    weight: keyof FontWeights;
    letterSpacing?: string;
  }> = {
    headline: { lineHeight: 'tight', weight: 'bold', letterSpacing: '-0.5px' },
    subheadline: { lineHeight: 'tight', weight: 'semibold', letterSpacing: '-0.3px' },
    body: { lineHeight: 'normal', weight: 'regular' },
    label: { lineHeight: 'normal', weight: 'bold', letterSpacing: '1.5px' },
    cta: { lineHeight: 'normal', weight: 'regular', letterSpacing: '-0.01em' },
    dataPoint: { lineHeight: 'tight', weight: 'bold', letterSpacing: '-1px' },
    dataLabel: { lineHeight: 'normal', weight: 'medium' },
    metricValue: { lineHeight: 'tight', weight: 'bold' },
    metricLabel: { lineHeight: 'normal', weight: 'medium' },
  };

  const config = roleConfig[role];

  return {
    fontSize: `${typography[role]}px`,
    lineHeight: String(lineHeights[config.lineHeight]),
    fontWeight: String(weights[config.weight]),
    ...(config.letterSpacing && { letterSpacing: config.letterSpacing }),
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };
}
