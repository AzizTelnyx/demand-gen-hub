#!/usr/bin/env ts-node
/**
 * Creative Generator V2
 *
 * Modular, adaptive banner generation system supporting:
 * - Three composition patterns (Clean SaaS, Product Highlight, Dark Mode)
 * - Size-adaptive typography
 * - Data visualization components
 * - Zone-based layouts preventing collisions
 *
 * Usage:
 *   npm run generate-creative-v2 -- --prompt="LinkedIn ad for Voice AI targeting healthcare"
 *   npm run generate-creative-v2 -- --prompt="Compare Telnyx vs Twilio for developers"
 *   npm run generate-creative-v2 -- --file=briefs/prompt.txt
 *
 * @module generate-creative-v2
 */

import dotenv from 'dotenv';
dotenv.config();

import { createCompletion } from '../src/lib/ai-client';
import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

// Modular system imports
import {
  NEUTRALS,
  BRAND,
  getProductColor,
  getPaletteForPattern,
  PatternType,
  PatternPalette,
} from '../src/lib/brand-colors';

import {
  getTypography,
  getPadding,
  getSpacing,
  Typography,
} from '../src/lib/typography';

import {
  calculateLayout,
  detectAspectRatio,
  LayoutConfig,
} from '../src/lib/layout-engine';

import {
  selectPattern,
  detectProduct,
  detectIndustry,
  PatternSelection,
} from '../src/lib/pattern-selector';

import {
  selectComponent,
  renderComponent,
  ComponentType,
  Pillar,
} from '../src/lib/components';

import { selectAssets } from '../src/lib/asset-selector';
import { selectLogo } from '../src/lib/logo-selector';

/* ─── Platform Size Specifications ───────────────────────────────────────────── */

interface PlatformSize {
  width: number;
  height: number;
  label: string;
}

const PLATFORM_SIZES: Record<string, PlatformSize[]> = {
  linkedin: [
    { width: 1200, height: 627, label: '1200x627' },
    { width: 1200, height: 1200, label: '1200x1200' },
    { width: 628, height: 1200, label: '628x1200' },
  ],
  'stackadapt-native': [
    { width: 1200, height: 628, label: '1200x628' },
    { width: 600, height: 600, label: '600x600' },
    { width: 800, height: 600, label: '800x600' },
  ],
  'stackadapt-display': [
    { width: 300, height: 250, label: '300x250' },
    { width: 728, height: 90, label: '728x90' },
    { width: 160, height: 600, label: '160x600' },
    { width: 300, height: 600, label: '300x600' },
    { width: 320, height: 50, label: '320x50' },
  ],
  reddit: [
    { width: 1080, height: 1350, label: '1080x1350' },
    { width: 1080, height: 1080, label: '1080x1080' },
    { width: 1920, height: 1080, label: '1920x1080' },
  ],
  'google-display': [
    { width: 300, height: 250, label: '300x250' },
    { width: 728, height: 90, label: '728x90' },
    { width: 160, height: 600, label: '160x600' },
    { width: 300, height: 600, label: '300x600' },
    { width: 320, height: 50, label: '320x50' },
  ],
};

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface ParsedBrief {
  platform: string;
  format: string;
  audience: string;
  painPoints: string[];
  coreMessage: string;
  pillar: Pillar;
  adCopyExample?: string;
  ctaSuggestion: string;
}

interface GeneratedCopy {
  headlines: string[];
  descriptions: string[];
  cta: string;
}

interface CreativeAssets {
  logoBase64: string;
  backgroundImage?: string;
  productScreenshot?: string;
  industryPhoto?: string;
}

/* ─── Helper Functions ────────────────────────────────────────────────────────── */

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const fullPath = path.join(process.cwd(), imagePath);
    const imageBuffer = await fs.readFile(fullPath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1);
    return `data:image/${ext};base64,${base64}`;
  } catch (error) {
    console.warn(`   ⚠️  Could not load image: ${imagePath}`);
    return '';
  }
}

/* ─── Brief Parser ────────────────────────────────────────────────────────────── */

async function parseBrief(promptText: string): Promise<ParsedBrief> {
  const parsePrompt = `Parse this creative brief and extract structured information:

"${promptText}"

Extract:
1. Platform (linkedin, stackadapt-native, stackadapt-display, reddit, google-display)
2. Format (single-image, carousel, video)
3. Target audience (who are we targeting?)
4. Pain points (what problem are we solving?)
5. Core message (what's the main point?)
6. Pillar (trust, infrastructure, physics - based on keywords)
7. Ad copy example (if provided in quotes)
8. CTA suggestion

Telnyx messaging pillars:
- **Trust**: HIPAA, compliance, security, SOC2, enterprise
- **Infrastructure**: Own network, 1 platform vs 5 vendors, integration, stack
- **Physics**: Latency, speed, <200ms, performance, edge

Return JSON:
{
  "platform": "linkedin",
  "format": "single-image",
  "audience": "healthcare IT decision makers",
  "painPoints": ["after-hours coverage", "overwhelmed staff"],
  "coreMessage": "HIPAA-ready Voice AI for 24/7 patient access",
  "pillar": "trust",
  "adCopyExample": "",
  "ctaSuggestion": "Learn More"
}`;

  const response = await createCompletion({
    messages: [
      { role: 'system', content: 'Return ONLY valid JSON, no markdown.' },
      { role: 'user', content: parsePrompt },
    ],
    maxTokens: 1024,
    temperature: 0.3,
  });

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

/* ─── Copy Generator ──────────────────────────────────────────────────────────── */

async function generateCopy(brief: ParsedBrief, patternSelection: PatternSelection): Promise<GeneratedCopy> {
  const copyPrompt = `Generate ad copy for Telnyx Voice AI.

**Brief:**
- Platform: ${brief.platform}
- Audience: ${brief.audience}
- Pain points: ${brief.painPoints.join(', ')}
- Core message: ${brief.coreMessage}
- Pillar: ${brief.pillar}
- Pattern: ${patternSelection.pattern}
${patternSelection.product ? `- Product focus: ${patternSelection.product}` : ''}
${patternSelection.industry ? `- Industry: ${patternSelection.industry}` : ''}

**Telnyx differentiators:**
- Owns its own network (not a reseller like Twilio)
- Sub-500ms latency (inference co-located with telephony)
- HIPAA/SOC2/PCI compliant
- 140+ countries, 70+ languages
- One platform (not 4-5 vendors)

**Platform requirements:**
${brief.platform === 'linkedin' ? '- Headlines: Max 200 chars\n- Descriptions: Max 600 chars\n- Tone: Professional but human' : ''}
${brief.platform.includes('stackadapt') ? '- Headlines: Max 55 chars\n- Descriptions: Max 120 chars\n- Tone: Editorial' : ''}
${brief.platform === 'reddit' ? '- Headlines: Max 150 chars\n- Tone: Casual, authentic' : ''}
${brief.platform === 'google-display' ? '- Headlines: Max 30 chars\n- Descriptions: Max 90 chars' : ''}

**Rules:**
- No filler words (leading, best-in-class, innovative)
- Be specific with numbers
- Sound like an engineer, not a marketer
- No emojis
- ${patternSelection.pattern === 'dark-mode' ? 'Use competitive, direct language' : 'Use clear, benefit-focused language'}

Generate:
- 5 headline variations
- 3 description variations
- 1 CTA

Return JSON:
{
  "headlines": ["headline 1", "headline 2", ...],
  "descriptions": ["desc 1", "desc 2", ...],
  "cta": "Learn More"
}`;

  const response = await createCompletion({
    messages: [
      { role: 'system', content: 'Return ONLY valid JSON, no markdown.' },
      { role: 'user', content: copyPrompt },
    ],
    maxTokens: 2048,
    temperature: 0.6,
  });

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

/* ─── Asset Loader ────────────────────────────────────────────────────────────── */

async function loadAssets(
  brief: ParsedBrief,
  patternSelection: PatternSelection,
  palette: PatternPalette
): Promise<CreativeAssets> {
  // Select logo based on background color
  const bgColor = patternSelection.pattern === 'dark-mode' ? NEUTRALS.black : NEUTRALS.cream;
  const logoPath = await selectLogo(bgColor);
  const logoBase64 = await imageToBase64(logoPath);

  const assets: CreativeAssets = { logoBase64 };

  // Load additional assets based on pattern
  if (patternSelection.showProductScreenshot || patternSelection.showIndustryPhoto) {
    const selectedAssets = await selectAssets(brief);

    if (selectedAssets.productScreenshot && patternSelection.showProductScreenshot) {
      assets.productScreenshot = await imageToBase64(selectedAssets.productScreenshot);
      console.log(`   📸 Screenshot: ${path.basename(selectedAssets.productScreenshot)}`);
    }

    if (selectedAssets.industryPhoto && patternSelection.showIndustryPhoto) {
      assets.industryPhoto = await imageToBase64(selectedAssets.industryPhoto);
      console.log(`   📷 Industry: ${path.basename(selectedAssets.industryPhoto)}`);
    }

    if (selectedAssets.background) {
      assets.backgroundImage = await imageToBase64(selectedAssets.background);
    }
  }

  return assets;
}

/* ─── Template Generators ─────────────────────────────────────────────────────── */

/**
 * Generate Dark Mode template with data visualization
 */
function generateDarkModeTemplate(
  brief: ParsedBrief,
  copy: GeneratedCopy,
  width: number,
  height: number,
  typography: Typography,
  layout: LayoutConfig,
  palette: PatternPalette,
  assets: CreativeAssets,
  patternSelection: PatternSelection
): string {
  const { padding, spacing } = layout;
  const aspectRatio = detectAspectRatio(width, height);
  const isLandscape = aspectRatio === 'landscape';
  const isPortrait = aspectRatio === 'portrait';

  const productColors = getProductColor(patternSelection.product);

  // Render data visualization component
  const vizWidth = isLandscape ? Math.floor(width * 0.45) : width - padding * 2;
  const vizHeight = isLandscape ? height - padding * 2 - 100 : Math.floor(height * 0.4);

  const componentHTML = renderComponent({
    component: patternSelection.visualizationComponent,
    width: vizWidth,
    height: vizHeight,
    typography,
    palette,
    pillar: brief.pillar,
  });

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    background: ${NEUTRALS.black};
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: ${NEUTRALS.white};
    overflow: hidden;
    position: relative;
  }

  .content {
    display: flex;
    flex-direction: ${isLandscape ? 'row' : 'column'};
    height: 100%;
    padding: ${padding}px;
    padding-bottom: ${padding + 60}px;
    gap: ${spacing}px;
  }

  .text-section {
    flex: ${isLandscape ? '0 0 50%' : '1'};
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${Math.floor(spacing * 0.8)}px;
  }

  .viz-section {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    ${isPortrait ? 'order: -1;' : ''}
  }

  .label-badge {
    display: inline-block;
    background: ${productColors.primary};
    color: ${NEUTRALS.black};
    font-size: ${typography.label}px;
    font-weight: 700;
    padding: 8px 20px;
    border-radius: 20px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    align-self: flex-start;
  }

  .headline {
    font-size: ${typography.headline}px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.5px;
    color: ${NEUTRALS.white};
  }

  .description {
    font-size: ${typography.body}px;
    line-height: 1.6;
    color: #AAAAAA;
    max-width: 90%;
  }

  .cta-button {
    position: absolute;
    top: ${padding}px;
    right: ${padding}px;
    background: ${productColors.primary};
    color: ${NEUTRALS.black};
    padding: 12px 24px;
    border-radius: 20px;
    font-weight: 600;
    font-size: ${typography.cta}px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .logo {
    position: absolute;
    bottom: ${padding}px;
    left: ${padding}px;
    height: ${Math.round(padding * 0.6)}px;
  }
</style></head><body>
  <div class="content">
    <div class="text-section">
      <div class="label-badge">${productColors.name}</div>
      <div class="headline">${copy.headlines[0]}</div>
      <div class="description">${copy.descriptions[0]}</div>
    </div>
    ${componentHTML ? `<div class="viz-section">${componentHTML}</div>` : ''}
  </div>

  <div class="cta-button">${copy.cta}</div>
  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/**
 * Generate Product Highlight template
 */
function generateProductHighlightTemplate(
  brief: ParsedBrief,
  copy: GeneratedCopy,
  width: number,
  height: number,
  typography: Typography,
  layout: LayoutConfig,
  palette: PatternPalette,
  assets: CreativeAssets,
  patternSelection: PatternSelection
): string {
  const { padding, spacing } = layout;
  const aspectRatio = detectAspectRatio(width, height);
  const isLandscape = aspectRatio === 'landscape';

  const productColors = getProductColor(patternSelection.product);

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    background: linear-gradient(135deg, ${productColors.tint} 0%, ${NEUTRALS.cream} 40%, ${NEUTRALS.tan} 100%);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: ${NEUTRALS.black};
    overflow: hidden;
    position: relative;
  }

  .accent-overlay {
    position: absolute;
    top: 0;
    right: 0;
    width: 50%;
    height: 100%;
    background: radial-gradient(circle at top right, ${productColors.primary}08 0%, transparent 70%);
  }

  .content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: ${isLandscape ? 'row' : 'column'};
    height: 100%;
    padding: ${padding}px;
    padding-bottom: ${padding + 60}px;
    gap: ${spacing}px;
    align-items: center;
  }

  .text-section {
    flex: ${isLandscape ? '0 0 52%' : '1'};
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${Math.floor(spacing * 0.6)}px;
  }

  .image-section {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    ${!isLandscape ? 'display: none;' : ''}
  }

  .product-badge {
    display: inline-block;
    background: ${productColors.primary};
    color: ${NEUTRALS.white};
    font-size: ${typography.label}px;
    font-weight: 700;
    padding: 8px 20px;
    border-radius: 20px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    align-self: flex-start;
  }

  .headline {
    font-size: ${typography.headline}px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.5px;
  }

  .description {
    font-size: ${typography.body}px;
    line-height: 1.6;
    color: ${NEUTRALS.gray};
    max-width: 90%;
  }

  .cta-button {
    display: inline-block;
    background: ${NEUTRALS.white};
    color: ${NEUTRALS.black};
    padding: 12px 24px;
    border-radius: 16px;
    border: 2px solid ${NEUTRALS.black};
    font-weight: 400;
    font-size: ${typography.cta}px;
    text-transform: uppercase;
    margin-top: ${Math.floor(spacing * 0.5)}px;
    align-self: flex-start;
  }

  .product-visual {
    max-width: 88%;
    max-height: ${height * 0.6}px;
    border-radius: 12px;
    box-shadow: 0 20px 50px ${productColors.primary}18, 0 8px 20px rgba(0,0,0,0.08);
    border: 1px solid ${productColors.primary}12;
  }

  .logo {
    position: absolute;
    bottom: ${padding}px;
    left: ${padding}px;
    height: ${Math.round(padding * 0.6)}px;
  }
</style></head><body>
  <div class="accent-overlay"></div>

  <div class="content">
    <div class="text-section">
      <div class="product-badge">${productColors.name}</div>
      <div class="headline">${copy.headlines[0]}</div>
      <div class="description">${copy.descriptions[0]}</div>
      <div class="cta-button">${copy.cta}</div>
    </div>

    ${isLandscape && assets.productScreenshot ? `
    <div class="image-section">
      <img src="${assets.productScreenshot}" class="product-visual" alt="Product" />
    </div>
    ` : ''}
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/**
 * Generate Clean SaaS template (default)
 */
function generateCleanSaaSTemplate(
  brief: ParsedBrief,
  copy: GeneratedCopy,
  width: number,
  height: number,
  typography: Typography,
  layout: LayoutConfig,
  palette: PatternPalette,
  assets: CreativeAssets,
  patternSelection: PatternSelection
): string {
  const { padding, spacing } = layout;
  const aspectRatio = detectAspectRatio(width, height);
  const isLandscape = aspectRatio === 'landscape';
  const isPortrait = aspectRatio === 'portrait';

  const productColors = getProductColor(patternSelection.product);
  const hasIndustryPhoto = !!assets.industryPhoto;

  // For industry ABM: split layout with photo
  if (hasIndustryPhoto) {
    return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    background: ${NEUTRALS.cream};
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: ${NEUTRALS.black};
    overflow: hidden;
    position: relative;
  }

  .split-container {
    display: flex;
    height: 100%;
    flex-direction: ${isPortrait ? 'column-reverse' : 'row-reverse'};
  }

  .image-side {
    flex: ${isPortrait ? '0 0 45%' : '0 0 46%'};
    overflow: hidden;
  }

  .industry-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: ${isPortrait ? 'center top' : 'center center'};
  }

  .text-side {
    flex: 1;
    background: linear-gradient(135deg, ${productColors.tint} 0%, ${NEUTRALS.cream} 100%);
    padding: ${padding}px;
    padding-bottom: ${padding + 60}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${Math.floor(spacing * 0.6)}px;
  }

  .product-badge {
    display: inline-block;
    background: ${productColors.primary};
    color: ${NEUTRALS.white};
    font-size: ${typography.label}px;
    font-weight: 700;
    padding: 8px 20px;
    border-radius: 20px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    align-self: flex-start;
  }

  .headline {
    font-size: ${typography.headline}px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.5px;
  }

  .description {
    font-size: ${typography.body}px;
    line-height: 1.6;
    color: ${NEUTRALS.gray};
  }

  .cta-button {
    display: inline-block;
    background: ${NEUTRALS.white};
    color: ${NEUTRALS.black};
    padding: 12px 24px;
    border-radius: 16px;
    border: 2px solid ${NEUTRALS.black};
    font-weight: 400;
    font-size: ${typography.cta}px;
    text-transform: uppercase;
    align-self: flex-start;
  }

  .logo {
    position: absolute;
    bottom: ${padding}px;
    left: ${padding}px;
    height: ${Math.round(padding * 0.6)}px;
    z-index: 10;
  }
</style></head><body>
  <div class="split-container">
    <div class="image-side">
      <img src="${assets.industryPhoto}" class="industry-photo" alt="" />
    </div>
    <div class="text-side">
      <div class="product-badge">${productColors.name}</div>
      <div class="headline">${copy.headlines[0]}</div>
      <div class="description">${copy.descriptions[0]}</div>
      <div class="cta-button">${copy.cta}</div>
    </div>
  </div>
  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
  }

  // Default clean SaaS without industry photo
  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    background: linear-gradient(135deg, ${productColors.tint} 0%, ${NEUTRALS.cream} 40%, ${NEUTRALS.tan} 100%);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: ${NEUTRALS.black};
    overflow: hidden;
    position: relative;
  }

  .content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    padding: ${padding}px;
    padding-bottom: ${padding + 60}px;
    gap: ${Math.floor(spacing * 0.6)}px;
    max-width: ${isLandscape ? '60%' : '100%'};
  }

  .product-badge {
    display: inline-block;
    background: ${productColors.primary};
    color: ${NEUTRALS.white};
    font-size: ${typography.label}px;
    font-weight: 700;
    padding: 8px 20px;
    border-radius: 20px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    align-self: flex-start;
  }

  .headline {
    font-size: ${typography.headline}px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.5px;
  }

  .description {
    font-size: ${typography.body}px;
    line-height: 1.6;
    color: ${NEUTRALS.gray};
    max-width: 90%;
  }

  .cta-button {
    display: inline-block;
    background: ${NEUTRALS.white};
    color: ${NEUTRALS.black};
    padding: 12px 24px;
    border-radius: 16px;
    border: 2px solid ${NEUTRALS.black};
    font-weight: 400;
    font-size: ${typography.cta}px;
    text-transform: uppercase;
    margin-top: ${Math.floor(spacing * 0.3)}px;
    align-self: flex-start;
  }

  .logo {
    position: absolute;
    bottom: ${padding}px;
    left: ${padding}px;
    height: ${Math.round(padding * 0.6)}px;
  }
</style></head><body>
  <div class="content">
    <div class="product-badge">${productColors.name}</div>
    <div class="headline">${copy.headlines[0]}</div>
    <div class="description">${copy.descriptions[0]}</div>
    <div class="cta-button">${copy.cta}</div>
  </div>
  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── HTML Generator ──────────────────────────────────────────────────────────── */

function generateHTML(
  brief: ParsedBrief,
  copy: GeneratedCopy,
  width: number,
  height: number,
  assets: CreativeAssets,
  patternSelection: PatternSelection
): string {
  const typography = getTypography(width, height);
  const layout = calculateLayout(width, height);
  const palette = getPaletteForPattern(patternSelection.pattern, patternSelection.product);

  switch (patternSelection.pattern) {
    case 'dark-mode':
      return generateDarkModeTemplate(brief, copy, width, height, typography, layout, palette, assets, patternSelection);

    case 'product-highlight':
      return generateProductHighlightTemplate(brief, copy, width, height, typography, layout, palette, assets, patternSelection);

    case 'clean-saas':
    default:
      return generateCleanSaaSTemplate(brief, copy, width, height, typography, layout, palette, assets, patternSelection);
  }
}

/* ─── PNG Converter ───────────────────────────────────────────────────────────── */

async function convertHTMLtoPNG(
  html: string,
  outputPath: string,
  width: number,
  height: number
): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Save HTML for reference
    await fs.writeFile(outputPath.replace('.png', '.html'), html);

    // Generate PNG
    await page.screenshot({
      path: outputPath,
      type: 'png',
      fullPage: false,
    });
  } finally {
    await browser.close();
  }
}

/* ─── Main Generator ──────────────────────────────────────────────────────────── */

async function generateCreative(promptText: string) {
  console.log('\n🎨 Telnyx Creative Generator V2\n');
  console.log('━'.repeat(60));

  // Step 1: Parse brief
  console.log('\n📋 Parsing brief...');
  const brief = await parseBrief(promptText);
  console.log(`   Platform: ${brief.platform}`);
  console.log(`   Audience: ${brief.audience}`);
  console.log(`   Pillar: ${brief.pillar}`);

  // Step 2: Detect pattern
  console.log('\n🎯 Detecting pattern...');
  const patternSelection = selectPattern({
    briefText: promptText,
    pillar: brief.pillar,
    platform: brief.platform,
  });
  console.log(`   Pattern: ${patternSelection.pattern}`);
  console.log(`   Confidence: ${Math.round(patternSelection.confidence * 100)}%`);
  if (patternSelection.product) {
    console.log(`   Product: ${patternSelection.product}`);
  }
  if (patternSelection.industry) {
    console.log(`   Industry: ${patternSelection.industry}`);
  }
  if (patternSelection.visualizationComponent !== 'none') {
    console.log(`   Component: ${patternSelection.visualizationComponent}`);
  }

  // Step 3: Generate copy
  console.log('\n✍️  Generating copy...');
  const copy = await generateCopy(brief, patternSelection);
  console.log(`   ✓ ${copy.headlines.length} headlines`);
  console.log(`   ✓ ${copy.descriptions.length} descriptions`);
  console.log(`   ✓ CTA: ${copy.cta}`);

  // Step 4: Load assets
  console.log('\n🖼️  Loading assets...');
  const palette = getPaletteForPattern(patternSelection.pattern, patternSelection.product);
  const assets = await loadAssets(brief, patternSelection, palette);
  console.log(`   ✓ Logo loaded`);

  // Step 5: Generate visuals for all sizes
  console.log(`\n📐 Generating visuals for ${brief.platform}...`);
  const sizes = PLATFORM_SIZES[brief.platform] || PLATFORM_SIZES.linkedin;

  const outputDir = path.join(
    process.cwd(),
    'output',
    'creatives',
    `v2-${patternSelection.pattern}-${brief.platform}-${Date.now()}`
  );
  await fs.mkdir(outputDir, { recursive: true });

  for (const size of sizes) {
    console.log(`   → ${size.label}...`);
    const html = generateHTML(brief, copy, size.width, size.height, assets, patternSelection);
    const outputPath = path.join(outputDir, `${size.label}.png`);
    await convertHTMLtoPNG(html, outputPath, size.width, size.height);
  }

  // Step 6: Save metadata
  const metadataPath = path.join(outputDir, 'metadata.json');
  await fs.writeFile(
    metadataPath,
    JSON.stringify(
      {
        brief,
        copy,
        pattern: patternSelection,
        generatedAt: new Date().toISOString(),
        generator: 'creative-generator-v2',
      },
      null,
      2
    )
  );

  console.log(`\n✅ Creative generated successfully!`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`\n📋 Generated Files:`);
  console.log(`   - ${sizes.length} HTML files (preview)`);
  console.log(`   - ${sizes.length} PNG files (production-ready)`);
  console.log(`   - metadata.json`);
  console.log('\n' + '━'.repeat(60) + '\n');
}

/* ─── CLI ─────────────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
Telnyx Creative Generator V2

Usage:
  npm run generate-creative-v2 -- --prompt="Your brief here"
  npm run generate-creative-v2 -- --file=path/to/brief.txt

Patterns:
  - Clean SaaS: Light backgrounds, general messaging
  - Product Highlight: Product screenshots, feature focus
  - Dark Mode: Black background, data visualization

Examples:
  # Clean SaaS pattern
  npm run generate-creative-v2 -- --prompt="LinkedIn ad for Voice AI targeting healthcare"

  # Dark Mode pattern (triggered by competitive keywords)
  npm run generate-creative-v2 -- --prompt="Compare Telnyx vs Twilio for developers, show latency data"

  # Product Highlight pattern
  npm run generate-creative-v2 -- --prompt="Voice API feature ad for fintech compliance"

Output:
  - All platform-required sizes
  - Organized in output/creatives/v2-[pattern]-[platform]-[timestamp]/
    `);
    process.exit(0);
  }

  const promptArg = args.find((arg) => arg.startsWith('--prompt='));
  const fileArg = args.find((arg) => arg.startsWith('--file='));

  let promptText = '';

  if (promptArg) {
    promptText = promptArg.replace('--prompt=', '');
  } else if (fileArg) {
    promptText = await fs.readFile(fileArg.replace('--file=', ''), 'utf-8');
  } else {
    console.error('❌ Error: Provide --prompt or --file');
    process.exit(1);
  }

  await generateCreative(promptText);
}

main().catch(console.error);
