/**
 * Brand Colors System
 *
 * Complete Telnyx brand color specification supporting all three composition patterns:
 * - Pattern A (Clean SaaS): Cream backgrounds with brand accents
 * - Pattern B (Product Highlight): Product-specific tinted backgrounds
 * - Pattern C (Dark Mode): Black backgrounds for competitive/data-heavy content
 *
 * @module brand-colors
 */

/* ─── Neutral Colors ───────────────────────────────────────────────────────── */

export const NEUTRALS = {
  /** Warm off-white for light backgrounds */
  cream: '#FEFDF5',

  /** Pure black for dark mode and text */
  black: '#000000',

  /** Warm gray for subtle borders and secondary elements */
  tan: '#E6E3D3',

  /** 30% brightness gray for muted text */
  bright_30: '#4D4D4D',

  /** Pure white for contrast elements */
  white: '#FFFFFF',

  /** Mid-gray for body text on light backgrounds */
  gray: '#666666',

  /** Light gray for subtle borders */
  lightGray: '#E5E5E5',
} as const;

/* ─── Brand Colors ─────────────────────────────────────────────────────────── */

export const BRAND = {
  /** Primary Telnyx green */
  primary: '#00E3AA',

  /** Light tint of primary for backgrounds */
  tint: '#CCF9EE',

  /** Darker variant for hover states */
  dark: '#00B88A',
} as const;

/* ─── Product Colors ───────────────────────────────────────────────────────── */

export interface ProductColor {
  /** Primary accent color */
  primary: string;
  /** Light tint for backgrounds */
  tint: string;
  /** Display name for badges */
  name: string;
  /** Gradient start (optional) */
  gradientStart?: string;
  /** Gradient end (optional) */
  gradientEnd?: string;
}

export const PRODUCTS: Record<string, ProductColor> = {
  /** Generic AI product */
  ai: {
    primary: '#FF7442',
    tint: '#FFE3D9',
    name: 'AI',
    gradientStart: '#FF7442',
    gradientEnd: '#FF9B6B',
  },

  /** Voice AI Agent product */
  voice_ai_agent: {
    primary: '#E57EFF',
    tint: '#FAE5FF',
    name: 'VOICE AI',
    gradientStart: '#E57EFF',
    gradientEnd: '#F5AAFF',
  },

  /** Voice API product */
  voice_api: {
    primary: '#8850F9',
    tint: '#E7DCFE',
    name: 'VOICE API',
    gradientStart: '#8850F9',
    gradientEnd: '#A87AFF',
  },

  /** eSIM product */
  esim: {
    primary: '#00BCD4',
    tint: '#E0F7FA',
    name: 'ESIM',
    gradientStart: '#00BCD4',
    gradientEnd: '#4DD0E1',
  },

  /** RCS messaging */
  rcs: {
    primary: '#4CAF50',
    tint: '#E8F5E9',
    name: 'RCS',
    gradientStart: '#4CAF50',
    gradientEnd: '#81C784',
  },

  /** SMS/Messaging */
  messaging: {
    primary: '#2196F3',
    tint: '#E3F2FD',
    name: 'MESSAGING',
    gradientStart: '#2196F3',
    gradientEnd: '#64B5F6',
  },

  /** SIP Trunking */
  sip: {
    primary: '#9C27B0',
    tint: '#F3E5F5',
    name: 'SIP TRUNKING',
    gradientStart: '#9C27B0',
    gradientEnd: '#BA68C8',
  },

  /** Numbers/DID */
  numbers: {
    primary: '#FF5722',
    tint: '#FBE9E7',
    name: 'NUMBERS',
    gradientStart: '#FF5722',
    gradientEnd: '#FF8A65',
  },

  /** Networking/IoT */
  networking: {
    primary: '#607D8B',
    tint: '#ECEFF1',
    name: 'NETWORKING',
    gradientStart: '#607D8B',
    gradientEnd: '#90A4AE',
  },

  /** Default/Platform */
  default: {
    primary: '#00E3AA',
    tint: '#CCF9EE',
    name: 'PLATFORM',
    gradientStart: '#00E3AA',
    gradientEnd: '#33EBBB',
  },
} as const;

/* ─── Pattern-Specific Palettes ────────────────────────────────────────────── */

export interface PatternPalette {
  /** Background color or gradient */
  background: string;
  /** Primary text color */
  text: string;
  /** Secondary/muted text color */
  textMuted: string;
  /** CTA background */
  ctaBackground: string;
  /** CTA text */
  ctaText: string;
  /** Border color */
  border: string;
  /** Card/container background */
  cardBackground: string;
  /** Accent color for highlights */
  accent: string;
}

/**
 * Get palette for Pattern A (Clean SaaS)
 * Light cream backgrounds with product accent colors
 */
export function getCleanSaasPalette(product?: string): PatternPalette {
  const productColor = getProductColor(product);

  return {
    background: `linear-gradient(135deg, ${productColor.tint} 0%, ${NEUTRALS.cream} 40%, ${NEUTRALS.tan} 100%)`,
    text: NEUTRALS.black,
    textMuted: NEUTRALS.gray,
    ctaBackground: NEUTRALS.white,
    ctaText: NEUTRALS.black,
    border: NEUTRALS.black,
    cardBackground: NEUTRALS.white,
    accent: productColor.primary,
  };
}

/**
 * Get palette for Pattern B (Product Highlight)
 * Product-colored tinted backgrounds with product UI focus
 */
export function getProductHighlightPalette(product?: string): PatternPalette {
  const productColor = getProductColor(product);

  return {
    background: `linear-gradient(135deg, ${productColor.tint} 0%, ${NEUTRALS.cream} 100%)`,
    text: NEUTRALS.black,
    textMuted: NEUTRALS.bright_30,
    ctaBackground: productColor.primary,
    ctaText: NEUTRALS.white,
    border: productColor.primary,
    cardBackground: NEUTRALS.white,
    accent: productColor.primary,
  };
}

/**
 * Get palette for Pattern C (Dark Mode)
 * Black backgrounds for competitive positioning and data visualization
 */
export function getDarkModePalette(product?: string): PatternPalette {
  const productColor = getProductColor(product);

  return {
    background: NEUTRALS.black,
    text: NEUTRALS.white,
    textMuted: '#AAAAAA',
    ctaBackground: productColor.primary,
    ctaText: NEUTRALS.black,
    border: '#333333',
    cardBackground: '#1A1A1A',
    accent: productColor.primary,
  };
}

/* ─── Helper Functions ─────────────────────────────────────────────────────── */

/**
 * Get product color by product key
 * Supports both hyphenated (voice-ai) and underscored (voice_ai_agent) formats
 *
 * @param product - Product identifier
 * @returns ProductColor object with primary, tint, and name
 *
 * @example
 * getProductColor('voice-ai') // Returns voice_ai_agent colors
 * getProductColor('voice_api') // Returns voice_api colors
 * getProductColor(undefined) // Returns default/platform colors
 */
export function getProductColor(product?: string): ProductColor {
  if (!product) return PRODUCTS.default;

  // Normalize product key (handle both formats)
  const normalized = product
    .toLowerCase()
    .replace(/-/g, '_')
    .replace('voice_ai', 'voice_ai_agent');

  // Direct match
  if (normalized in PRODUCTS) {
    return PRODUCTS[normalized];
  }

  // Try partial match
  const keys = Object.keys(PRODUCTS);
  for (const key of keys) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return PRODUCTS[key];
    }
  }

  return PRODUCTS.default;
}

/**
 * Get appropriate palette based on pattern type
 *
 * @param pattern - Pattern type: 'clean-saas', 'product-highlight', or 'dark-mode'
 * @param product - Optional product identifier for accent colors
 * @returns PatternPalette with all color values
 *
 * @example
 * getPaletteForPattern('dark-mode', 'voice-ai')
 * getPaletteForPattern('clean-saas') // Uses default product colors
 */
export function getPaletteForPattern(
  pattern: 'clean-saas' | 'product-highlight' | 'dark-mode',
  product?: string
): PatternPalette {
  switch (pattern) {
    case 'product-highlight':
      return getProductHighlightPalette(product);
    case 'dark-mode':
      return getDarkModePalette(product);
    case 'clean-saas':
    default:
      return getCleanSaasPalette(product);
  }
}

/**
 * Generate CSS gradient string for product
 *
 * @param product - Product identifier
 * @param direction - Gradient direction (default: 135deg)
 * @returns CSS gradient string
 */
export function getProductGradient(product?: string, direction = '135deg'): string {
  const colors = getProductColor(product);
  const start = colors.gradientStart || colors.primary;
  const end = colors.gradientEnd || colors.tint;
  return `linear-gradient(${direction}, ${start}, ${end})`;
}

/**
 * Get contrasting text color for a background
 * Uses luminance calculation to determine black or white text
 *
 * @param backgroundColor - Hex color code
 * @returns '#000000' or '#FFFFFF'
 */
export function getContrastingTextColor(backgroundColor: string): string {
  // Remove # if present
  const hex = backgroundColor.replace('#', '');

  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? NEUTRALS.black : NEUTRALS.white;
}

/* ─── Type Exports ─────────────────────────────────────────────────────────── */

export type PatternType = 'clean-saas' | 'product-highlight' | 'dark-mode';
export type ProductKey = keyof typeof PRODUCTS;
export type NeutralKey = keyof typeof NEUTRALS;
