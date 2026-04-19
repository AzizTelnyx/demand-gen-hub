/**
 * Product Asset Selector
 *
 * Selects 3D product icons and pattern backgrounds based on product type.
 * These assets add visual richness to banners beyond CSS-only styling.
 */

import { promises as fs } from 'fs';
import path from 'path';

export type ProductType = 'voice-ai' | 'voice-api' | 'esim' | 'rcs' | 'general';

export interface ProductAssetPaths {
  icon: string | null;           // 3D product icon PNG
  patternBackground: string | null;  // Colorful pattern background
  iconPosition: 'right' | 'left' | 'center';
  iconScale: number;             // Scale factor for the icon (0.5 - 1.5)
}

// Asset path mappings
const ASSET_BASE = 'brand-assets/_new_collection_product-icons/_NEW_Product-Icon-Static';

const PRODUCT_ASSET_MAP: Record<ProductType, { iconFolder: string; patternFolder: string } | null> = {
  'voice-ai': {
    iconFolder: `${ASSET_BASE}/Icon_Colorful_Static/01_Voice-AI-Agent`,
    patternFolder: `${ASSET_BASE}/Pattern_Colorful_Static/01_Voice-AI-Agent`,
  },
  'voice-api': {
    iconFolder: `${ASSET_BASE}/Icon_Colorful_Static/02_Voice-API`,
    patternFolder: `${ASSET_BASE}/Pattern_Colorful_Static/02_Voice-API`,
  },
  'esim': {
    iconFolder: null as unknown as string,
    patternFolder: `${ASSET_BASE}/Pattern_Colorful_Static/03_eSIM`,
  },
  'rcs': {
    iconFolder: null as unknown as string,
    patternFolder: null as unknown as string,
  },
  'general': null,
};

// Best icon frames (manually curated for best visual appearance)
const BEST_ICON_FRAMES: Record<string, string> = {
  'voice-ai': 'Voice ai_00123.png',    // Static frame, good visual
  'voice-api': 'voiceAPI_00087.png',   // Mid-range frame
};

const BEST_PATTERN_FRAMES: Record<string, string> = {
  'voice-ai': 'Voice-AI-Agent_Bkrd-2_16x9.png',
  'voice-api': 'Voice-API_Bkrd-2_16x9.png',
  'esim': 'eSIM_Bkrd-2_16x9.png',
};

/**
 * Detect product type from brief text
 */
export function detectProductType(briefText: string): ProductType {
  const lower = briefText.toLowerCase();

  if (lower.includes('voice ai') || lower.includes('voice-ai') || lower.includes('voice agent') || lower.includes('ai agent')) {
    return 'voice-ai';
  }
  if (lower.includes('voice api') || lower.includes('voice-api') || lower.includes('sip') || lower.includes('telephony')) {
    return 'voice-api';
  }
  if (lower.includes('esim') || lower.includes('e-sim') || lower.includes('iot') || lower.includes('connectivity')) {
    return 'esim';
  }
  if (lower.includes('rcs') || lower.includes('messaging') || lower.includes('sms')) {
    return 'rcs';
  }

  // Default to voice-ai for Telnyx campaigns
  return 'voice-ai';
}

/**
 * Get the best icon file from a folder
 */
async function getBestIconFromFolder(folderPath: string, productType: ProductType): Promise<string | null> {
  try {
    const fullPath = path.join(process.cwd(), folderPath);
    const files = await fs.readdir(fullPath);
    const pngFiles = files.filter(f => f.endsWith('.png'));

    if (pngFiles.length === 0) return null;

    // Check for curated best frame
    const bestFrame = BEST_ICON_FRAMES[productType];
    if (bestFrame && pngFiles.includes(bestFrame)) {
      return path.join(folderPath, bestFrame);
    }

    // Fallback: pick a frame in the middle of the animation
    const midIndex = Math.floor(pngFiles.length / 2);
    return path.join(folderPath, pngFiles[midIndex]);
  } catch {
    return null;
  }
}

/**
 * Get the best pattern background from a folder
 */
async function getBestPatternFromFolder(folderPath: string, productType: ProductType): Promise<string | null> {
  try {
    const fullPath = path.join(process.cwd(), folderPath);
    const files = await fs.readdir(fullPath);
    const pngFiles = files.filter(f => f.endsWith('.png'));

    if (pngFiles.length === 0) return null;

    // Check for curated best pattern
    const bestPattern = BEST_PATTERN_FRAMES[productType];
    if (bestPattern && pngFiles.includes(bestPattern)) {
      return path.join(folderPath, bestPattern);
    }

    // Fallback: first pattern
    return path.join(folderPath, pngFiles[0]);
  } catch {
    return null;
  }
}

/**
 * Select product assets based on product type and aspect ratio
 */
export async function selectProductAssets(
  productType: ProductType,
  aspectRatio: 'landscape' | 'square' | 'portrait' = 'landscape'
): Promise<ProductAssetPaths> {
  const assetConfig = PRODUCT_ASSET_MAP[productType];

  if (!assetConfig) {
    return {
      icon: null,
      patternBackground: null,
      iconPosition: 'right',
      iconScale: 1.0,
    };
  }

  const icon = assetConfig.iconFolder
    ? await getBestIconFromFolder(assetConfig.iconFolder, productType)
    : null;

  const patternBackground = assetConfig.patternFolder
    ? await getBestPatternFromFolder(assetConfig.patternFolder, productType)
    : null;

  // Adjust icon position and scale based on aspect ratio
  let iconPosition: 'right' | 'left' | 'center' = 'right';
  let iconScale = 1.0;

  switch (aspectRatio) {
    case 'landscape':
      iconPosition = 'right';
      iconScale = 0.8;
      break;
    case 'square':
      iconPosition = 'center';
      iconScale = 0.6;
      break;
    case 'portrait':
      iconPosition = 'center';
      iconScale = 0.5;
      break;
  }

  return {
    icon,
    patternBackground,
    iconPosition,
    iconScale,
  };
}

/**
 * Convert image file to base64 data URL
 */
export async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const fullPath = path.join(process.cwd(), imagePath);
    const imageBuffer = await fs.readFile(fullPath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1);
    return `data:image/${ext};base64,${base64}`;
  } catch {
    console.warn(`   ⚠️  Could not load: ${imagePath}`);
    return '';
  }
}

/**
 * Load all product assets as base64 for embedding in HTML
 */
export async function loadProductAssetsAsBase64(
  productType: ProductType,
  aspectRatio: 'landscape' | 'square' | 'portrait' = 'landscape'
): Promise<{
  iconBase64: string | null;
  patternBase64: string | null;
  iconPosition: 'right' | 'left' | 'center';
  iconScale: number;
}> {
  const assets = await selectProductAssets(productType, aspectRatio);

  const iconBase64 = assets.icon ? await imageToBase64(assets.icon) : null;
  const patternBase64 = assets.patternBackground ? await imageToBase64(assets.patternBackground) : null;

  return {
    iconBase64,
    patternBase64,
    iconPosition: assets.iconPosition,
    iconScale: assets.iconScale,
  };
}
