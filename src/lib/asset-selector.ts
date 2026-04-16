/**
 * Smart Asset Selector
 *
 * Uses the asset library index to intelligently select the best assets
 * based on brief content, keywords, industry, product, and pillar.
 */

import { promises as fs } from "fs";
import path from "path";

interface AssetIndexItem {
  path: string;
  category: string;
  keywords?: string[];
  industry?: string;
  products?: string[];
  features?: string[];
  pillars?: string[];
  bestFor?: string[];
  mood?: string;
  visualStyle?: string;
}

interface AssetLibraryIndex {
  backgrounds: AssetIndexItem[];
  productScreenshots: AssetIndexItem[];
  industryPhotography: AssetIndexItem[];
  industryHeroes: AssetIndexItem[];
  useCaseScreenshots: AssetIndexItem[];
  icons: AssetIndexItem[];
  brandAssets: AssetIndexItem[];
}

interface Brief {
  platform: string;
  audience: string;
  painPoints: string[];
  coreMessage: string;
  pillar: string;
  product?: string;
  industry?: string;
}

let assetIndex: AssetLibraryIndex | null = null;

/**
 * Load the asset library index (cached)
 */
async function loadAssetIndex(): Promise<AssetLibraryIndex> {
  if (assetIndex) return assetIndex;

  const indexPath = path.join(process.cwd(), "config", "asset-library-index.json");
  const indexContent = await fs.readFile(indexPath, "utf-8");
  assetIndex = JSON.parse(indexContent);
  return assetIndex!;
}

/**
 * Calculate match score between brief and asset
 */
function calculateMatchScore(asset: AssetIndexItem, brief: Brief, briefText: string): number {
  let score = 0;
  const lowerBriefText = briefText.toLowerCase();

  // Exact industry match (high priority)
  if (asset.industry && brief.industry && asset.industry === brief.industry) {
    score += 50;
  }

  // Keyword matching
  if (asset.keywords) {
    const matchedKeywords = asset.keywords.filter(keyword =>
      lowerBriefText.includes(keyword.toLowerCase())
    );
    score += matchedKeywords.length * 10;
  }

  // Pillar alignment
  if (asset.pillars && asset.pillars.includes(brief.pillar)) {
    score += 30;
  }

  // Product matching
  if (asset.products && brief.product && asset.products.includes(brief.product)) {
    score += 40;
  }

  // Best-for matching
  if (asset.bestFor) {
    const matchedUses = asset.bestFor.filter(use =>
      lowerBriefText.includes(use.toLowerCase())
    );
    score += matchedUses.length * 15;
  }

  return score;
}

/**
 * Detect industry from brief
 */
export function detectIndustry(brief: Brief): string | null {
  const industryKeywords: Record<string, string[]> = {
    healthcare: ['healthcare', 'hipaa', 'patient', 'medical', 'hospital', 'clinic', 'telemedicine', 'health'],
    insurance: ['insurance', 'claims', 'policy', 'coverage', 'auto insurance', 'life insurance'],
    logistics: ['logistics', 'delivery', 'shipping', 'transportation', 'courier', 'freight', 'supply chain'],
    restaurants: ['restaurant', 'dining', 'food service', 'hospitality', 'cafe', 'bar', 'takeout'],
    travel: ['travel', 'hotel', 'booking', 'tourism', 'vacation', 'hospitality', 'reservation'],
    finance: ['finance', 'banking', 'financial services', 'fintech', 'investment', 'payment'],
    automotive: ['automotive', 'car', 'vehicle', 'dealership', 'auto'],
    retail: ['retail', 'ecommerce', 'shopping', 'commerce', 'store'],
  };

  const briefText = `${brief.audience} ${brief.coreMessage} ${brief.painPoints.join(' ')}`.toLowerCase();

  for (const [industry, keywords] of Object.entries(industryKeywords)) {
    if (keywords.some(keyword => briefText.includes(keyword))) {
      return industry;
    }
  }

  return null;
}

/**
 * Detect product from brief
 */
export function detectProduct(brief: Brief): string | null {
  const productKeywords: Record<string, string[]> = {
    'voice-ai': ['voice ai', 'ai agent', 'conversational ai', 'voice assistant', 'ai voice'],
    'voice-api': ['voice api', 'telephony', 'calling api', 'voice sdk'],
    'messaging': ['messaging', 'sms', 'mms', 'text messaging'],
    'rcs': ['rcs', 'rich communication'],
  };

  const briefText = `${brief.audience} ${brief.coreMessage} ${brief.painPoints.join(' ')}`.toLowerCase();

  for (const [product, keywords] of Object.entries(productKeywords)) {
    if (keywords.some(keyword => briefText.includes(keyword))) {
      return product;
    }
  }

  // Fallback: detect from pillar
  if (brief.pillar === 'physics' || brief.pillar === 'infrastructure') {
    return 'voice-ai'; // Default to voice-ai for technical pillars
  }

  return null;
}

/**
 * Select best background image
 */
export async function selectBackground(brief: Brief): Promise<string | null> {
  const index = await loadAssetIndex();
  const briefText = `${brief.audience} ${brief.coreMessage} ${brief.painPoints.join(' ')}`;

  const enrichedBrief = {
    ...brief,
    industry: brief.industry || detectIndustry(brief) || undefined,
    product: brief.product || detectProduct(brief) || undefined,
  };

  const scored = index.backgrounds.map(bg => ({
    asset: bg,
    score: calculateMatchScore(bg, enrichedBrief, briefText),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored[0] && scored[0].score > 0 ? scored[0].asset.path : null;
}

/**
 * Select best product screenshot
 */
export async function selectProductScreenshot(brief: Brief): Promise<string | null> {
  const index = await loadAssetIndex();
  const briefText = `${brief.audience} ${brief.coreMessage} ${brief.painPoints.join(' ')}`;

  const enrichedBrief = {
    ...brief,
    industry: brief.industry || detectIndustry(brief) || undefined,
    product: brief.product || detectProduct(brief) || undefined,
  };

  const scored = index.productScreenshots.map(screenshot => ({
    asset: screenshot,
    score: calculateMatchScore(screenshot, enrichedBrief, briefText),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored[0] && scored[0].score > 0 ? scored[0].asset.path : null;
}

/**
 * Select best industry photography OR use case screenshot
 */
export async function selectIndustryPhoto(brief: Brief): Promise<string | null> {
  const index = await loadAssetIndex();
  const briefText = `${brief.audience} ${brief.coreMessage} ${brief.painPoints.join(' ')}`;

  const enrichedBrief = {
    ...brief,
    industry: brief.industry || detectIndustry(brief) || undefined,
    product: brief.product || detectProduct(brief) || undefined,
  };

  // Smart selection: prefer use-case screenshots for specific use cases, otherwise prefer photography
  const useCaseKeywords = ['concierge', 'booking', 'appointment', 'reservation', 'lab results', 'prescription', 'symptom', 'triage', 'waitlist', 'loyalty', 'policy', 'claims'];
  const isUseCaseFocused = useCaseKeywords.some(keyword => briefText.toLowerCase().includes(keyword));

  const allIndustryAssets = [
    ...index.industryPhotography.map(photo => ({
      asset: photo,
      score: calculateMatchScore(photo, enrichedBrief, briefText) + (isUseCaseFocused ? 0 : 25)  // Photography bonus only for general industry
    })),
    ...index.useCaseScreenshots.map(screenshot => ({
      asset: screenshot,
      score: calculateMatchScore(screenshot, enrichedBrief, briefText) + (isUseCaseFocused ? 30 : 0)  // Screenshot bonus for specific use cases
    })),
  ];

  allIndustryAssets.sort((a, b) => b.score - a.score);

  // Use best matching industry asset (context-aware selection)
  return allIndustryAssets[0] && allIndustryAssets[0].score > 0 ? allIndustryAssets[0].asset.path : null;
}

/**
 * Select all relevant assets for a brief
 */
export async function selectAssets(brief: Brief): Promise<{
  background?: string;
  productScreenshot?: string;
  industryPhoto?: string;
  detectedIndustry?: string;
  detectedProduct?: string;
}> {
  const detectedIndustry = brief.industry || detectIndustry(brief) || undefined;
  const detectedProduct = brief.product || detectProduct(brief) || undefined;

  const enrichedBrief = {
    ...brief,
    industry: detectedIndustry,
    product: detectedProduct,
  };

  const [background, productScreenshot, industryPhoto] = await Promise.all([
    selectBackground(enrichedBrief),
    selectProductScreenshot(enrichedBrief),
    selectIndustryPhoto(enrichedBrief),
  ]);

  return {
    background: background || undefined,
    productScreenshot: productScreenshot || undefined,
    industryPhoto: industryPhoto || undefined,
    detectedIndustry,
    detectedProduct,
  };
}
