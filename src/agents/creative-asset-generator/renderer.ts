// Renderer - Uses existing visual-templates-final and asset selection
import { promises as fs } from 'fs';
import path from 'path';
import type { CreativeBrief, GeneratedCopy, SizeConfig, SelectedAssets, TemplateType } from './types';

// Import existing good templates
import { VISUAL_TEMPLATES_FINAL, type VisualCreativeData, type VisualAssets } from '../../../scripts/visual-templates-final';

// Import existing asset selection
import { selectAssets, detectProduct, detectIndustry } from '@/lib/asset-selector';
import { selectLogo } from '@/lib/logo-selector';

/* ─── Image to Base64 ─────────────────────────────────── */

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const fullPath = path.join(process.cwd(), imagePath);
    const imageBuffer = await fs.readFile(fullPath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1);
    return `data:image/${ext};base64,${base64}`;
  } catch (error) {
    console.warn(`Could not load image: ${imagePath}`);
    return '';
  }
}

/* ─── Load Assets ─────────────────────────────────────── */

export async function loadAssets(brief: CreativeBrief): Promise<SelectedAssets> {
  // Convert our brief format to asset-selector format
  const assetBrief = {
    platform: brief.platform,
    audience: brief.audience,
    painPoints: brief.painPoints,
    coreMessage: brief.coreMessage,
    pillar: brief.pillar,
    product: brief.product,
    industry: brief.industry,
  };

  // Use existing smart asset selector
  const selectedAssets = await selectAssets(assetBrief);

  // Light background templates use black logo
  const logoPath = await selectLogo('#FEFDF5'); // Light bg → black logo
  const logoBase64 = await imageToBase64(logoPath);

  // Load selected assets as base64
  const result: SelectedAssets = {
    logoBase64,
    detectedProduct: selectedAssets.detectedProduct,
    detectedIndustry: selectedAssets.detectedIndustry,
  };

  if (selectedAssets.background) {
    result.backgroundImage = await imageToBase64(selectedAssets.background);
  }

  if (selectedAssets.productScreenshot) {
    result.productScreenshot = await imageToBase64(selectedAssets.productScreenshot);
  }

  if (selectedAssets.industryPhoto) {
    result.industryPhoto = await imageToBase64(selectedAssets.industryPhoto);
  }

  return result;
}

/* ─── Template Selection ──────────────────────────────── */

export function selectTemplate(brief: CreativeBrief, assets: SelectedAssets): TemplateType {
  const detectedProduct = assets.detectedProduct || brief.product;
  const detectedIndustry = assets.detectedIndustry || brief.industry;

  // Detect use-case focused briefs
  const useCaseKeywords = ['concierge', 'booking', 'appointment', 'reservation', 'lab results', 'prescription', 'symptom', 'triage', 'waitlist', 'loyalty', 'policy', 'claims'];
  const briefText = `${brief.audience} ${brief.coreMessage} ${brief.painPoints.join(' ')}`.toLowerCase();
  const isUseCaseFocused = useCaseKeywords.some(keyword => briefText.includes(keyword));

  const isVoiceAIProduct = detectedProduct === 'voice-ai' || detectedProduct === 'voice-api';

  // Priority logic (matches generate-creative.ts)
  if (isUseCaseFocused && detectedIndustry && assets.industryPhoto) {
    return 'industry-abm';
  } else if (isVoiceAIProduct && (assets.productScreenshot || assets.backgroundImage)) {
    return 'voice-ai-product';
  } else if (detectedIndustry && assets.industryPhoto && !isVoiceAIProduct) {
    return 'industry-abm';
  } else {
    return 'voice-ai-product'; // Default
  }
}

/* ─── Generate HTML ───────────────────────────────────── */

export function generateHTML(
  brief: CreativeBrief,
  copy: GeneratedCopy,
  assets: SelectedAssets,
  size: SizeConfig,
  templateType: TemplateType
): string {
  // Prepare data for visual templates
  const visualData: VisualCreativeData = {
    headline: copy.headlines[0],
    description: copy.descriptions[0],
    cta: copy.cta,
    pillar: brief.pillar,
    audience: brief.audience,
    platform: brief.platform,
    product: (assets.detectedProduct || brief.product) as any,
    industry: (assets.detectedIndustry || brief.industry) as any,
  };

  const visualAssets: VisualAssets = {
    logoBase64: assets.logoBase64,
    backgroundImage: assets.backgroundImage,
    productScreenshot: assets.productScreenshot,
    industryPhoto: assets.industryPhoto,
  };

  // Use the existing good templates
  const template = VISUAL_TEMPLATES_FINAL[templateType];
  return template(visualData, visualAssets, size.width, size.height);
}

/* ─── PNG Conversion ──────────────────────────────────── */

export async function htmlToPng(
  html: string,
  size: SizeConfig,
  outputPath: string
): Promise<void> {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    // Puppeteer not available, save HTML instead
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const htmlPath = outputPath.replace(/\.png$/, '.html');
    await fs.writeFile(htmlPath, html, 'utf-8');
    console.log(`Puppeteer not available, saved HTML to: ${htmlPath}`);
    return;
  }

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: size.width, height: size.height });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Wait for fonts
    await page.evaluate(() => document.fonts.ready);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Save HTML for reference
    await fs.writeFile(outputPath.replace('.png', '.html'), html, 'utf-8');

    // Generate PNG
    await page.screenshot({
      path: outputPath,
      type: 'png',
      fullPage: false,
    });

    console.log(`Generated: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

/* ─── Batch Generation ────────────────────────────────── */

export async function generateAllBanners(
  brief: CreativeBrief,
  copy: GeneratedCopy,
  assets: SelectedAssets,
  sizes: SizeConfig[],
  outputDir: string
): Promise<{ size: SizeConfig; html: string; pngPath: string; templateUsed: TemplateType }[]> {
  const results: { size: SizeConfig; html: string; pngPath: string; templateUsed: TemplateType }[] = [];

  // Select template once (same for all sizes)
  const templateType = selectTemplate(brief, assets);
  console.log(`Using template: ${templateType}`);

  for (const size of sizes) {
    const html = generateHTML(brief, copy, assets, size, templateType);
    const pngPath = path.join(outputDir, `${size.label}.png`);

    await htmlToPng(html, size, pngPath);

    results.push({
      size,
      html,
      pngPath,
      templateUsed: templateType,
    });
  }

  return results;
}
