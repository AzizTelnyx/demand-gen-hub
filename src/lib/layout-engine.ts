/**
 * Zone-Based Layout Engine
 *
 * Manages fixed and content zones across different aspect ratios.
 * Ensures logo and CTA never collide, and content adapts to canvas shape.
 *
 * Fixed Zones (consistent position across all sizes):
 * - Logo: bottom-left
 * - CTA: top-right pill OR bottom with text
 * - Label: top-left small caps
 *
 * Content Zones (adaptive based on aspect ratio):
 * - Landscape: 50/50 split (text | visualization)
 * - Square: 60/40 split or stacked
 * - Portrait: Stacked (visualization top, text below)
 *
 * @module layout-engine
 */

import { getPadding, getSpacing } from './typography';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type AspectRatioClass = 'landscape' | 'square' | 'portrait';
export type ContentLayout = 'split' | 'stacked' | 'full';
export type VisualizationPosition = 'right' | 'left' | 'top' | 'bottom' | 'background';

export interface Dimensions {
  width: number;
  height: number;
}

export interface Zone {
  /** X position from left */
  x: number;
  /** Y position from top */
  y: number;
  /** Zone width */
  width: number;
  /** Zone height */
  height: number;
}

export interface FixedZones {
  /** Logo zone (bottom-left) */
  logo: Zone & { height: number };

  /** CTA zone (top-right or bottom-center) */
  cta: Zone & { position: 'top-right' | 'bottom-center' };

  /** Label/badge zone (top-left) */
  label: Zone;
}

export interface ContentZones {
  /** Main text content zone */
  text: Zone;

  /** Visualization/image zone */
  visualization: Zone;

  /** Layout style for the content */
  layout: ContentLayout;

  /** Where visualization appears relative to text */
  visualizationPosition: VisualizationPosition;
}

export interface LayoutConfig {
  /** Canvas dimensions */
  dimensions: Dimensions;

  /** Detected aspect ratio class */
  aspectRatio: AspectRatioClass;

  /** Base padding value */
  padding: number;

  /** Spacing between elements */
  spacing: number;

  /** Fixed element zones */
  fixed: FixedZones;

  /** Content area zones */
  content: ContentZones;

  /** Safe area (accounting for all fixed elements) */
  safeArea: Zone;
}

export interface LayoutOptions {
  /** Force a specific layout style */
  forceLayout?: ContentLayout;

  /** CTA position preference */
  ctaPosition?: 'top-right' | 'bottom-center';

  /** Visualization position preference */
  visualizationPosition?: VisualizationPosition;

  /** Custom padding multiplier */
  paddingMultiplier?: number;

  /** Reserve extra space at bottom (for additional elements) */
  bottomReserve?: number;
}

/* ─── Constants ────────────────────────────────────────────────────────────── */

/** Logo height relative to padding */
const LOGO_HEIGHT_RATIO = 0.6;

/** CTA button approximate dimensions */
const CTA_DIMENSIONS = {
  minWidth: 100,
  height: 44,
  padding: 24,
};

/** Label badge dimensions */
const LABEL_DIMENSIONS = {
  height: 30,
  minWidth: 80,
};

/** Aspect ratio thresholds */
const ASPECT_THRESHOLDS = {
  /** Below this is portrait */
  portrait: 0.85,
  /** Above this is landscape */
  landscape: 1.15,
};

/** Content split ratios by aspect ratio */
const SPLIT_RATIOS = {
  landscape: { text: 0.52, viz: 0.48 },
  square: { text: 0.58, viz: 0.42 },
  portrait: { text: 0.55, viz: 0.45 },
};

/* ─── Core Functions ───────────────────────────────────────────────────────── */

/**
 * Detect aspect ratio class from dimensions
 *
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns AspectRatioClass
 */
export function detectAspectRatio(width: number, height: number): AspectRatioClass {
  const ratio = width / height;

  if (ratio < ASPECT_THRESHOLDS.portrait) {
    return 'portrait';
  } else if (ratio > ASPECT_THRESHOLDS.landscape) {
    return 'landscape';
  }
  return 'square';
}

/**
 * Calculate fixed zone positions
 * These remain consistent regardless of content
 */
function calculateFixedZones(
  width: number,
  height: number,
  padding: number,
  options: LayoutOptions = {}
): FixedZones {
  const logoHeight = Math.round(padding * LOGO_HEIGHT_RATIO);
  const bottomReserve = options.bottomReserve || 0;

  // Logo: always bottom-left
  const logo: FixedZones['logo'] = {
    x: padding,
    y: height - padding - logoHeight - bottomReserve,
    width: Math.min(200, width * 0.25),
    height: logoHeight,
  };

  // CTA: top-right by default, or bottom-center if specified
  const ctaPosition = options.ctaPosition || 'top-right';
  const cta: FixedZones['cta'] = ctaPosition === 'top-right'
    ? {
        x: width - padding - CTA_DIMENSIONS.minWidth - CTA_DIMENSIONS.padding * 2,
        y: padding,
        width: CTA_DIMENSIONS.minWidth + CTA_DIMENSIONS.padding * 2,
        height: CTA_DIMENSIONS.height,
        position: 'top-right',
      }
    : {
        x: width / 2 - (CTA_DIMENSIONS.minWidth + CTA_DIMENSIONS.padding * 2) / 2,
        y: height - padding - CTA_DIMENSIONS.height - bottomReserve,
        width: CTA_DIMENSIONS.minWidth + CTA_DIMENSIONS.padding * 2,
        height: CTA_DIMENSIONS.height,
        position: 'bottom-center',
      };

  // Label: top-left
  const label: FixedZones['label'] = {
    x: padding,
    y: padding,
    width: LABEL_DIMENSIONS.minWidth,
    height: LABEL_DIMENSIONS.height,
  };

  return { logo, cta, label };
}

/**
 * Calculate content zone positions based on aspect ratio
 */
function calculateContentZones(
  width: number,
  height: number,
  padding: number,
  spacing: number,
  aspectRatio: AspectRatioClass,
  fixed: FixedZones,
  options: LayoutOptions = {}
): ContentZones {
  const bottomReserve = options.bottomReserve || 0;

  // Calculate safe content area (avoiding fixed elements)
  const contentTop = fixed.label.y + fixed.label.height + spacing;
  const contentBottom = fixed.logo.y - spacing;
  const contentHeight = contentBottom - contentTop;
  const contentWidth = width - padding * 2;

  // Determine layout based on aspect ratio and options
  let layout: ContentLayout = options.forceLayout || 'split';
  let vizPosition: VisualizationPosition = options.visualizationPosition || 'right';

  if (aspectRatio === 'portrait') {
    layout = 'stacked';
    vizPosition = 'top';
  } else if (aspectRatio === 'square') {
    // Square can be split or stacked
    layout = options.forceLayout || 'split';
    vizPosition = options.visualizationPosition || 'right';
  }

  // Calculate zone dimensions
  const splitRatio = SPLIT_RATIOS[aspectRatio];

  let textZone: Zone;
  let vizZone: Zone;

  if (layout === 'stacked') {
    // Stacked layout (portrait or forced)
    const vizHeight = Math.round(contentHeight * splitRatio.viz);
    const textHeight = contentHeight - vizHeight - spacing;

    if (vizPosition === 'top') {
      vizZone = {
        x: padding,
        y: contentTop,
        width: contentWidth,
        height: vizHeight,
      };
      textZone = {
        x: padding,
        y: contentTop + vizHeight + spacing,
        width: contentWidth,
        height: textHeight,
      };
    } else {
      textZone = {
        x: padding,
        y: contentTop,
        width: contentWidth,
        height: textHeight,
      };
      vizZone = {
        x: padding,
        y: contentTop + textHeight + spacing,
        width: contentWidth,
        height: vizHeight,
      };
    }
  } else if (layout === 'split') {
    // Split layout (landscape or square)
    const textWidth = Math.round(contentWidth * splitRatio.text);
    const vizWidth = contentWidth - textWidth - spacing;

    if (vizPosition === 'right') {
      textZone = {
        x: padding,
        y: contentTop,
        width: textWidth,
        height: contentHeight,
      };
      vizZone = {
        x: padding + textWidth + spacing,
        y: contentTop,
        width: vizWidth,
        height: contentHeight,
      };
    } else {
      vizZone = {
        x: padding,
        y: contentTop,
        width: vizWidth,
        height: contentHeight,
      };
      textZone = {
        x: padding + vizWidth + spacing,
        y: contentTop,
        width: textWidth,
        height: contentHeight,
      };
    }
  } else {
    // Full layout (no visualization)
    textZone = {
      x: padding,
      y: contentTop,
      width: contentWidth,
      height: contentHeight,
    };
    vizZone = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }

  return {
    text: textZone,
    visualization: vizZone,
    layout,
    visualizationPosition: vizPosition,
  };
}

/**
 * Calculate complete layout configuration
 *
 * @param width - Canvas width
 * @param height - Canvas height
 * @param options - Layout customization options
 * @returns Complete LayoutConfig
 *
 * @example
 * // Landscape banner
 * const layout = calculateLayout(1200, 627);
 * // => { aspectRatio: 'landscape', content: { layout: 'split', ... } }
 *
 * @example
 * // Portrait with custom options
 * const layout = calculateLayout(628, 1200, {
 *   ctaPosition: 'bottom-center',
 *   bottomReserve: 40
 * });
 */
export function calculateLayout(
  width: number,
  height: number,
  options: LayoutOptions = {}
): LayoutConfig {
  const paddingMultiplier = options.paddingMultiplier || 1;
  const padding = getPadding(width, height) * paddingMultiplier;
  const spacing = getSpacing(width, height);
  const aspectRatio = detectAspectRatio(width, height);

  const fixed = calculateFixedZones(width, height, padding, options);
  const content = calculateContentZones(
    width,
    height,
    padding,
    spacing,
    aspectRatio,
    fixed,
    options
  );

  // Calculate safe area (usable space after fixed elements)
  const safeArea: Zone = {
    x: padding,
    y: fixed.label.y + fixed.label.height + spacing,
    width: width - padding * 2,
    height: fixed.logo.y - (fixed.label.y + fixed.label.height + spacing * 2),
  };

  return {
    dimensions: { width, height },
    aspectRatio,
    padding,
    spacing,
    fixed,
    content,
    safeArea,
  };
}

/* ─── CSS Generation ───────────────────────────────────────────────────────── */

/**
 * Generate CSS for fixed zones
 */
export function generateFixedZoneCSS(layout: LayoutConfig): string {
  const { fixed, padding } = layout;

  return `
    .logo-zone {
      position: absolute;
      left: ${fixed.logo.x}px;
      bottom: ${padding}px;
      height: ${fixed.logo.height}px;
      z-index: 10;
    }

    .cta-zone {
      position: absolute;
      ${fixed.cta.position === 'top-right'
        ? `top: ${fixed.cta.y}px; right: ${padding}px;`
        : `bottom: ${padding}px; left: 50%; transform: translateX(-50%);`}
      z-index: 10;
    }

    .label-zone {
      position: absolute;
      left: ${fixed.label.x}px;
      top: ${fixed.label.y}px;
      z-index: 10;
    }
  `.trim();
}

/**
 * Generate CSS for content zones
 */
export function generateContentZoneCSS(layout: LayoutConfig): string {
  const { content, padding, spacing } = layout;

  if (content.layout === 'split') {
    return `
      .content-container {
        display: flex;
        flex-direction: row;
        height: 100%;
        padding: ${padding}px;
        padding-top: ${content.text.y}px;
        padding-bottom: ${layout.fixed.logo.height + padding + spacing}px;
        gap: ${spacing}px;
      }

      .text-zone {
        flex: 0 0 ${content.text.width}px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: ${spacing}px;
      }

      .visualization-zone {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
    `.trim();
  }

  if (content.layout === 'stacked') {
    return `
      .content-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: ${padding}px;
        padding-top: ${content.visualization.y}px;
        padding-bottom: ${layout.fixed.logo.height + padding + spacing}px;
        gap: ${spacing}px;
      }

      .visualization-zone {
        flex: 0 0 ${content.visualization.height}px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .text-zone {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        gap: ${spacing * 0.75}px;
      }
    `.trim();
  }

  // Full layout (text only)
  return `
    .content-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: ${padding}px;
      padding-top: ${content.text.y}px;
      padding-bottom: ${layout.fixed.logo.height + padding + spacing}px;
    }

    .text-zone {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: ${spacing}px;
    }
  `.trim();
}

/**
 * Generate complete layout CSS
 */
export function generateLayoutCSS(layout: LayoutConfig): string {
  return `
    ${generateFixedZoneCSS(layout)}
    ${generateContentZoneCSS(layout)}
  `.trim();
}

/* ─── Layout Utilities ─────────────────────────────────────────────────────── */

/**
 * Check if a zone has sufficient space for content
 *
 * @param zone - Zone to check
 * @param minWidth - Minimum required width
 * @param minHeight - Minimum required height
 */
export function hasMinimumSpace(zone: Zone, minWidth: number, minHeight: number): boolean {
  return zone.width >= minWidth && zone.height >= minHeight;
}

/**
 * Get recommended component layout for visualization zone
 *
 * @param vizZone - Visualization zone dimensions
 * @returns Recommendation for component arrangement
 */
export function getVisualizationLayout(vizZone: Zone): {
  columns: number;
  rows: number;
  orientation: 'horizontal' | 'vertical' | 'grid';
} {
  const ratio = vizZone.width / vizZone.height;

  if (ratio > 1.5) {
    // Wide zone: horizontal layout
    return { columns: 4, rows: 1, orientation: 'horizontal' };
  } else if (ratio < 0.7) {
    // Tall zone: vertical layout
    return { columns: 1, rows: 4, orientation: 'vertical' };
  }
  // Square-ish: 2x2 grid
  return { columns: 2, rows: 2, orientation: 'grid' };
}

/**
 * Calculate if logo and CTA would collide at current positions
 * Used to validate layout and adjust if needed
 */
export function wouldCollide(layout: LayoutConfig): boolean {
  const { logo, cta } = layout.fixed;

  // Check horizontal overlap
  const horizontalOverlap =
    logo.x < cta.x + cta.width && logo.x + logo.width > cta.x;

  // Check vertical overlap
  const verticalOverlap =
    logo.y < cta.y + cta.height && logo.y + logo.height > cta.y;

  return horizontalOverlap && verticalOverlap;
}
