/**
 * Composition Pattern Selector
 *
 * Detects which of the three Telnyx composition patterns should be used
 * based on brief text, product focus, and target audience.
 *
 * Patterns:
 * - Pattern A (Clean SaaS): Default, general product messaging
 * - Pattern B (Product Highlight): Specific product focus with UI screenshots
 * - Pattern C (Dark Mode): Competitive, data-heavy, technical audiences
 *
 * @module pattern-selector
 */

import { PatternType, ProductColor, getProductColor } from './brand-colors';
import { ComponentType, selectComponent, Pillar } from './components';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface PatternSelection {
  /** Selected pattern type */
  pattern: PatternType;

  /** Confidence score (0-1) */
  confidence: number;

  /** Detected product focus */
  product?: string;

  /** Detected industry vertical */
  industry?: string;

  /** Recommended data visualization component */
  visualizationComponent: ComponentType;

  /** Whether to show product screenshot */
  showProductScreenshot: boolean;

  /** Whether to show industry photo */
  showIndustryPhoto: boolean;

  /** Reasoning for selection */
  reasons: string[];
}

export interface PatternDetectionInput {
  /** Brief text to analyze */
  briefText: string;

  /** Detected pillar (trust, infrastructure, physics) */
  pillar: Pillar;

  /** Platform (linkedin, stackadapt, etc.) */
  platform?: string;

  /** Explicitly specified product */
  product?: string;

  /** Explicitly specified industry */
  industry?: string;
}

/* ─── Keyword Dictionaries ─────────────────────────────────────────────────── */

/**
 * Keywords that trigger Dark Mode pattern (Pattern C)
 * Competitive, data-heavy, technical content
 */
const DARK_MODE_TRIGGERS = [
  // Competitive keywords
  'compare', 'vs', 'versus', 'competitor', 'alternative', 'switch from',
  'migrate', 'migration', 'replace', 'better than', 'unlike',

  // Technical/developer keywords
  'developer', 'developers', 'engineering', 'technical', 'api', 'sdk',
  'infrastructure', 'latency', 'performance', 'benchmark', 'specifications',

  // Data-heavy keywords
  'data', 'metrics', 'statistics', 'numbers', 'comparison', 'analysis',
  'specifications', 'requirements', 'enterprise',

  // Specific competitor names
  'twilio', 'vonage', 'bandwidth', 'plivo', 'sinch', 'vapi',
  'retell', 'elevenlabs', '11labs',
];

/**
 * Keywords that trigger Product Highlight pattern (Pattern B)
 * Specific product focus with UI/feature emphasis
 */
const PRODUCT_HIGHLIGHT_TRIGGERS = [
  // Product names
  'voice ai', 'voice-ai', 'voice api', 'voice-api', 'sip trunking',
  'sip trunk', 'esim', 'e-sim', 'rcs', 'messaging', 'sms',

  // Feature-focused keywords
  'feature', 'features', 'capability', 'capabilities', 'demo', 'product',
  'platform', 'interface', 'dashboard', 'console', 'portal',

  // UI/visual keywords
  'screenshot', 'ui', 'interface', 'design', 'workflow', 'how it works',
];

/**
 * Industry verticals for ABM targeting
 */
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  healthcare: [
    'healthcare', 'health care', 'medical', 'hospital', 'clinic', 'patient',
    'hipaa', 'physician', 'doctor', 'nurse', 'pharmacy', 'prescription',
    'appointment', 'lab results', 'symptoms', 'diagnosis', 'telehealth',
  ],
  finance: [
    'finance', 'financial', 'banking', 'bank', 'fintech', 'payment',
    'insurance', 'investment', 'trading', 'mortgage', 'loan', 'credit',
    'compliance', 'fraud', 'authentication', 'verification',
  ],
  retail: [
    'retail', 'ecommerce', 'e-commerce', 'shopping', 'store', 'inventory',
    'order', 'shipping', 'customer service', 'support', 'returns',
  ],
  travel: [
    'travel', 'hospitality', 'hotel', 'airline', 'booking', 'reservation',
    'concierge', 'guest', 'tourism', 'vacation', 'flight',
  ],
  logistics: [
    'logistics', 'shipping', 'delivery', 'fleet', 'transportation',
    'warehouse', 'supply chain', 'tracking', 'dispatch', 'driver',
  ],
  insurance: [
    'insurance', 'claims', 'policy', 'underwriting', 'adjuster',
    'coverage', 'premium', 'deductible', 'policyholder',
  ],
};

/**
 * Product detection keywords
 */
const PRODUCT_KEYWORDS: Record<string, string[]> = {
  'voice-ai': [
    'voice ai', 'voice-ai', 'ai agent', 'conversational ai', 'voice bot',
    'virtual agent', 'automated calls', 'ai calls', 'intelligent assistant',
  ],
  'voice-api': [
    'voice api', 'voice-api', 'telephony api', 'call api', 'programmable voice',
    'sip', 'webrtc', 'call control', 'media streaming',
  ],
  'messaging': [
    'sms', 'messaging', 'text message', 'mms', 'short code', 'toll-free',
  ],
  'rcs': [
    'rcs', 'rich messaging', 'rich communication', 'business messaging',
  ],
  'esim': [
    'esim', 'e-sim', 'embedded sim', 'iot connectivity', 'global sim',
  ],
  'sip': [
    'sip trunk', 'sip trunking', 'origination', 'termination', 'elastic sip',
  ],
};

/* ─── Detection Functions ──────────────────────────────────────────────────── */

/**
 * Calculate keyword match score
 */
function getKeywordScore(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      score += 1;
    }
  }

  return score;
}

/**
 * Detect product from brief text
 */
export function detectProduct(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  let bestProduct: string | undefined;
  let bestScore = 0;

  for (const [product, keywords] of Object.entries(PRODUCT_KEYWORDS)) {
    const score = getKeywordScore(lowerText, keywords);
    if (score > bestScore) {
      bestProduct = product;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestProduct : undefined;
}

/**
 * Detect industry from brief text
 */
export function detectIndustry(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  let bestIndustry: string | undefined;
  let bestScore = 0;

  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    const score = getKeywordScore(lowerText, keywords);
    if (score > bestScore) {
      bestIndustry = industry;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestIndustry : undefined;
}

/**
 * Select composition pattern based on brief analysis
 *
 * @param input - Pattern detection input
 * @returns PatternSelection with pattern and metadata
 *
 * @example
 * const selection = selectPattern({
 *   briefText: "Compare Telnyx vs Twilio for developers",
 *   pillar: "infrastructure"
 * });
 * // => { pattern: 'dark-mode', confidence: 0.85, ... }
 *
 * @example
 * const selection = selectPattern({
 *   briefText: "Voice AI for healthcare HIPAA compliance",
 *   pillar: "trust",
 *   industry: "healthcare"
 * });
 * // => { pattern: 'clean-saas', showIndustryPhoto: true, ... }
 */
export function selectPattern(input: PatternDetectionInput): PatternSelection {
  const { briefText, pillar, platform, product: explicitProduct, industry: explicitIndustry } = input;

  const reasons: string[] = [];
  const lowerText = briefText.toLowerCase();

  // Detect product and industry
  const detectedProduct = explicitProduct || detectProduct(briefText);
  const detectedIndustry = explicitIndustry || detectIndustry(briefText);

  // Score each pattern
  const darkModeScore = getKeywordScore(lowerText, DARK_MODE_TRIGGERS);
  const productHighlightScore = getKeywordScore(lowerText, PRODUCT_HIGHLIGHT_TRIGGERS);

  // Determine pattern
  let pattern: PatternType;
  let confidence: number;

  // Check for dark mode triggers
  if (darkModeScore >= 2) {
    pattern = 'dark-mode';
    confidence = Math.min(0.95, 0.6 + darkModeScore * 0.1);
    reasons.push(`Dark mode triggered by ${darkModeScore} competitive/technical keywords`);
  }
  // Check for product highlight triggers
  else if (productHighlightScore >= 2 && detectedProduct) {
    pattern = 'product-highlight';
    confidence = Math.min(0.9, 0.5 + productHighlightScore * 0.15);
    reasons.push(`Product highlight for ${detectedProduct} with ${productHighlightScore} product keywords`);
  }
  // Check if industry-focused (ABM)
  else if (detectedIndustry && !detectedProduct) {
    pattern = 'clean-saas';
    confidence = 0.8;
    reasons.push(`Clean SaaS pattern for ${detectedIndustry} industry ABM`);
  }
  // Default to clean SaaS
  else {
    pattern = 'clean-saas';
    confidence = 0.7;
    reasons.push('Default clean SaaS pattern');
  }

  // Determine visualization needs
  const componentSelection = selectComponent(briefText, pillar);
  const visualizationComponent = pattern === 'dark-mode'
    ? componentSelection.component
    : 'none';

  // Determine asset needs
  const showProductScreenshot = pattern === 'product-highlight' && !!detectedProduct;
  const showIndustryPhoto = pattern === 'clean-saas' && !!detectedIndustry;

  if (showProductScreenshot) {
    reasons.push(`Will show ${detectedProduct} product screenshot`);
  }
  if (showIndustryPhoto) {
    reasons.push(`Will show ${detectedIndustry} industry photo`);
  }
  if (visualizationComponent !== 'none') {
    reasons.push(`Will render ${visualizationComponent} component`);
  }

  return {
    pattern,
    confidence,
    product: detectedProduct,
    industry: detectedIndustry,
    visualizationComponent,
    showProductScreenshot,
    showIndustryPhoto,
    reasons,
  };
}

/**
 * Get pattern display name
 */
export function getPatternDisplayName(pattern: PatternType): string {
  const names: Record<PatternType, string> = {
    'clean-saas': 'Clean SaaS',
    'product-highlight': 'Product Highlight',
    'dark-mode': 'Dark Mode',
  };
  return names[pattern];
}

/**
 * Get pattern description
 */
export function getPatternDescription(pattern: PatternType): string {
  const descriptions: Record<PatternType, string> = {
    'clean-saas': 'Light cream background with product accent colors. Best for general messaging and industry ABM.',
    'product-highlight': 'Product-tinted background with UI screenshots. Best for specific product feature ads.',
    'dark-mode': 'Black background with data visualization. Best for competitive positioning and technical audiences.',
  };
  return descriptions[pattern];
}

/**
 * Check if dark mode is appropriate for the content
 */
export function shouldUseDarkMode(briefText: string): boolean {
  const score = getKeywordScore(briefText, DARK_MODE_TRIGGERS);
  return score >= 2;
}

/**
 * Get product color configuration
 */
export function getPatternProductColor(product?: string): ProductColor {
  return getProductColor(product);
}

/* ─── Exports ──────────────────────────────────────────────────────────────── */

export {
  DARK_MODE_TRIGGERS,
  PRODUCT_HIGHLIGHT_TRIGGERS,
  INDUSTRY_KEYWORDS,
  PRODUCT_KEYWORDS,
};
