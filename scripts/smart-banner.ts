#!/usr/bin/env ts-node
/**
 * Smart Banner Generator
 *
 * Uses pre-composed visuals from the asset library properly.
 * Understands which assets work for which scenarios.
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { selectLogo } from '../src/lib/logo-selector';

const BRAND_ASSETS = '/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/brand-assets';

// ─── Asset Library ──────────────────────────────────────────────────────────

const ASSETS = {
  // Pre-composed visuals (ready for ads)
  composed: {
    warmTransfers: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Features/01_Voice-AI-Agent/Voice-AI-Agent_Feature_Warm transfers/Voice-AI-Agent_Feature_Warm transfers900x620.png`,
    financeMultilingual: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/industry/use-cases/finances/industry-usecases-finance-multilingual.png`,
    restaurantsReorder: `${BRAND_ASSETS}/telnyx-assets/Industry_Visuals/Social_Assets/Restaurants/Industry_Restaurants_Reorder.png`,
    retailEcommerce: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/industry/hero/industry_retail_ecommerce_hero.png`,
  },
  // Gradient backgrounds
  backgrounds: {
    gradientTeal: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/backgrounds/rcs/gradient_rcs-4.png`,
  },
  // Stock photos
  photos: {
    financePayment: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/photography/industry/finance/industry-finance-photography-tap-payment-transaction-contactless-phone-iphone.jpg`,
    logistics: `${BRAND_ASSETS}/telnyx-assets/Photography/Stock_Unsplash (Free)/03_Industry-Verticals/05_Logistics/isaac-tE2br7mJZ3E-unsplash.jpg`,
    insurance: `${BRAND_ASSETS}/telnyx-assets/Photography/Stock_Unsplash (Free)/03_Industry-Verticals/02_Insurance/md-rifat-X0bOUOFlnck-unsplash.jpg`,
    personLaptop: `${BRAND_ASSETS}/telnyx-assets/Photography/Stock_Unsplash (Free)/01_People+Device/christin-hume-Hcfwew744z4-unsplash (1).jpg`,
  },
  // 3D icons (dark bg only)
  icons: {
    aiStar: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/00_AI/AI00050.png`,
    voiceAI: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/01_Voice-AI-Agent/Voice ai_00033.png`,
  },
};

// ─── Utilities ──────────────────────────────────────────────────────────────

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext;
    return `data:image/${mimeType};base64,${base64}`;
  } catch (e) {
    console.error(`Failed to load: ${imagePath}`);
    return '';
  }
}

async function convertHTMLtoPNG(html: string, outputPath: string, width: number, height: number): Promise<void> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width, height } });
  } finally {
    await browser.close();
  }
}

// ─── Template: Visual as Background ─────────────────────────────────────────
// Uses pre-composed visual or gradient as the main background
// Text overlaid on one side

function visualBackgroundTemplate(
  config: {
    width: number;
    height: number;
    headline: string;
    highlightWords: string[];
    subtext?: string;
    cta?: string;
    textPosition: 'left' | 'right' | 'bottom' | 'center';
    textColor: 'light' | 'dark';
    overlayOpacity?: number;
  },
  assets: {
    logoBase64: string;
    visualBase64: string;
  }
): string {
  const { width, height, textPosition, textColor, overlayOpacity = 0 } = config;
  const isVertical = height > width;

  // Process headline
  let processedHeadline = config.headline;
  config.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  });

  // Scale based on canvas
  const scale = Math.min(width, height) / 627;
  const headlineSize = Math.round(isVertical ? 42 * scale : 48 * scale);
  const subtextSize = Math.round(16 * scale);
  const ctaSize = Math.round(14 * scale);
  const padding = Math.round(40 * scale);

  // Text positioning
  const textStyles: Record<string, string> = {
    left: `left: ${padding}px; top: 50%; transform: translateY(-50%); max-width: 45%;`,
    right: `right: ${padding}px; top: 50%; transform: translateY(-50%); max-width: 45%; text-align: right;`,
    bottom: `left: ${padding}px; right: ${padding}px; bottom: ${padding}px; text-align: center;`,
    center: `left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; max-width: 80%;`,
  };

  const colors = textColor === 'light'
    ? { text: '#FFFFFF', highlight: '#00E5CC', subtext: 'rgba(255,255,255,0.85)', ctaBg: '#00D4CC', ctaText: '#0A0A0A' }
    : { text: '#1A1A1A', highlight: '#00D4AA', subtext: '#555', ctaBg: '#FFFFFF', ctaText: '#1A1A1A' };

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
  }

  .visual-bg {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    object-fit: cover;
    width: 100%;
    height: 100%;
  }

  .overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,${overlayOpacity});
  }

  .logo {
    position: absolute;
    top: ${padding}px;
    left: ${padding}px;
    height: ${Math.round(28 * scale)}px;
    z-index: 100;
  }

  .content {
    position: absolute;
    ${textStyles[textPosition]}
    z-index: 50;
  }

  .headline {
    font-size: ${headlineSize}px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -1px;
    color: ${colors.text};
    margin-bottom: ${Math.round(16 * scale)}px;
  }
  .headline .highlight {
    color: ${colors.highlight};
  }

  .subtext {
    font-size: ${subtextSize}px;
    font-weight: 400;
    line-height: 1.4;
    color: ${colors.subtext};
    margin-bottom: ${Math.round(20 * scale)}px;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: ${colors.ctaBg};
    color: ${colors.ctaText};
    font-size: ${ctaSize}px;
    font-weight: 600;
    padding: ${Math.round(12 * scale)}px ${Math.round(24 * scale)}px;
    border-radius: 40px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  }
  .cta::after { content: '>'; }

</style></head><body>
  <img src="${assets.visualBase64}" class="visual-bg" />
  ${overlayOpacity > 0 ? '<div class="overlay"></div>' : ''}
  <img src="${assets.logoBase64}" class="logo" />
  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${config.subtext ? `<div class="subtext">${config.subtext}</div>` : ''}
    ${config.cta ? `<div class="cta">${config.cta}</div>` : ''}
  </div>
</body></html>`;
}

// ─── Template: Split Layout ─────────────────────────────────────────────────
// Visual on one side, text on the other

function splitLayoutTemplate(
  config: {
    width: number;
    height: number;
    headline: string;
    highlightWords: string[];
    subtext?: string;
    cta?: string;
    visualPosition: 'left' | 'right';
    theme: 'light' | 'dark';
  },
  assets: {
    logoBase64: string;
    visualBase64: string;
  }
): string {
  const { width, height, visualPosition, theme } = config;

  let processedHeadline = config.headline;
  config.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  });

  const scale = Math.min(width, height) / 627;
  const padding = Math.round(40 * scale);

  const colors = theme === 'dark'
    ? { bg: '#0A0A0A', text: '#FFFFFF', highlight: '#00E5CC', subtext: 'rgba(255,255,255,0.8)', ctaBg: '#00D4CC', ctaText: '#0A0A0A' }
    : { bg: '#F8F8F6', text: '#1A1A1A', highlight: '#00D4AA', subtext: '#555', ctaBg: '#1A1A1A', ctaText: '#FFFFFF' };

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    display: flex;
    flex-direction: ${visualPosition === 'left' ? 'row' : 'row-reverse'};
    background: ${colors.bg};
  }

  .visual-side {
    width: 50%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .visual-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .text-side {
    width: 50%;
    height: 100%;
    padding: ${padding}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .logo {
    position: absolute;
    top: ${padding}px;
    ${visualPosition === 'left' ? 'right' : 'left'}: ${padding}px;
    height: ${Math.round(28 * scale)}px;
    z-index: 100;
  }

  .headline {
    font-size: ${Math.round(40 * scale)}px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -1px;
    color: ${colors.text};
    margin-bottom: ${Math.round(16 * scale)}px;
  }
  .headline .highlight { color: ${colors.highlight}; }

  .subtext {
    font-size: ${Math.round(16 * scale)}px;
    color: ${colors.subtext};
    line-height: 1.4;
    margin-bottom: ${Math.round(24 * scale)}px;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: ${colors.ctaBg};
    color: ${colors.ctaText};
    font-size: ${Math.round(14 * scale)}px;
    font-weight: 600;
    padding: ${Math.round(14 * scale)}px ${Math.round(28 * scale)}px;
    border-radius: 8px;
    width: fit-content;
  }
  .cta::after { content: '>'; }

</style></head><body>
  <img src="${assets.logoBase64}" class="logo" />
  <div class="visual-side">
    <img src="${assets.visualBase64}" class="visual-img" />
  </div>
  <div class="text-side">
    <div class="headline">${processedHeadline}</div>
    ${config.subtext ? `<div class="subtext">${config.subtext}</div>` : ''}
    ${config.cta ? `<div class="cta">${config.cta}</div>` : ''}
  </div>
</body></html>`;
}

// ─── Template: Dark Mode with 3D Icon ───────────────────────────────────────
// For when we want to use 3D icons (only works on dark)

function darkIconTemplate(
  config: {
    width: number;
    height: number;
    headline: string;
    highlightWords: string[];
    subtext?: string;
    cta?: string;
  },
  assets: {
    logoBase64: string;
    iconBase64: string;
  }
): string {
  const { width, height } = config;
  const isVertical = height > width;

  let processedHeadline = config.headline;
  config.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  });

  const scale = Math.min(width, height) / 627;

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    background: #0A0A0A;
    color: #FFFFFF;
    display: flex;
    flex-direction: ${isVertical ? 'column' : 'row'};
  }

  .icon-side {
    ${isVertical ? 'height: 45%;' : 'width: 45%;'}
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .icon-3d {
    max-width: 80%;
    max-height: 80%;
    object-fit: contain;
  }

  .text-side {
    ${isVertical ? 'height: 55%;' : 'width: 55%;'}
    padding: ${Math.round(40 * scale)}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    ${isVertical ? 'align-items: center; text-align: center;' : ''}
  }

  .logo {
    position: absolute;
    top: ${Math.round(40 * scale)}px;
    left: ${Math.round(40 * scale)}px;
    height: ${Math.round(28 * scale)}px;
  }

  .headline {
    font-size: ${Math.round(isVertical ? 36 : 44) * scale}px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -1px;
    margin-bottom: ${Math.round(16 * scale)}px;
  }
  .headline .highlight { color: #00E5CC; }

  .subtext {
    font-size: ${Math.round(16 * scale)}px;
    color: rgba(255,255,255,0.8);
    line-height: 1.4;
    margin-bottom: ${Math.round(24 * scale)}px;
    max-width: ${isVertical ? '90%' : '80%'};
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #00D4CC;
    color: #0A0A0A;
    font-size: ${Math.round(14 * scale)}px;
    font-weight: 600;
    padding: ${Math.round(14 * scale)}px ${Math.round(28 * scale)}px;
    border-radius: 40px;
  }
  .cta::after { content: '>'; }

</style></head><body>
  <img src="${assets.logoBase64}" class="logo" />
  <div class="icon-side">
    <img src="${assets.iconBase64}" class="icon-3d" />
  </div>
  <div class="text-side">
    <div class="headline">${processedHeadline}</div>
    ${config.subtext ? `<div class="subtext">${config.subtext}</div>` : ''}
    ${config.cta ? `<div class="cta">${config.cta}</div>` : ''}
  </div>
</body></html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎨 Smart Banner Generator\n');

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `smart-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Load logos
  const whiteLogoPath = await selectLogo('#000000');
  const blackLogoPath = await selectLogo('#FFFFFF');
  const whiteLogo = await imageToBase64(path.join(process.cwd(), whiteLogoPath));
  const blackLogo = await imageToBase64(path.join(process.cwd(), blackLogoPath));

  // Load composed visuals
  const warmTransfers = await imageToBase64(ASSETS.composed.warmTransfers);
  const financeMultilingual = await imageToBase64(ASSETS.composed.financeMultilingual);
  const restaurantsReorder = await imageToBase64(ASSETS.composed.restaurantsReorder);
  const retailEcommerce = await imageToBase64(ASSETS.composed.retailEcommerce);

  // Load backgrounds & photos
  const gradientBg = await imageToBase64(ASSETS.backgrounds.gradientTeal);
  const financePhoto = await imageToBase64(ASSETS.photos.financePayment);

  // Load 3D icons
  const aiIcon = await imageToBase64(ASSETS.icons.aiStar);
  const voiceAIIcon = await imageToBase64(ASSETS.icons.voiceAI);

  console.log('   Composed visuals:', warmTransfers ? '✓' : '✗', financeMultilingual ? '✓' : '✗');
  console.log('   Backgrounds:', gradientBg ? '✓' : '✗');
  console.log('   Icons:', aiIcon ? '✓' : '✗', voiceAIIcon ? '✓' : '✗');
  console.log('');

  // ─── Generate Banners ─────────────────────────────────────────────────────

  // 1. LinkedIn horizontal - Warm transfers visual
  const banner1 = visualBackgroundTemplate(
    {
      width: 1200, height: 627,
      headline: 'AI agents that handle warm transfers seamlessly',
      highlightWords: ['AI agents'],
      subtext: 'Transfer calls to humans without dropping context.',
      cta: 'See How It Works',
      textPosition: 'left',
      textColor: 'dark',
    },
    { logoBase64: blackLogo, visualBase64: warmTransfers }
  );
  await convertHTMLtoPNG(banner1, path.join(outputDir, '01-warm-transfers.png'), 1200, 627);
  console.log('   ✓ 01-warm-transfers.png');

  // 2. LinkedIn horizontal - Finance multilingual
  const banner2 = visualBackgroundTemplate(
    {
      width: 1200, height: 627,
      headline: 'Voice AI that speaks your customers\' language',
      highlightWords: ['Voice AI'],
      subtext: 'Automatic language detection and switching.',
      cta: 'Try Multilingual',
      textPosition: 'left',
      textColor: 'dark',
    },
    { logoBase64: blackLogo, visualBase64: financeMultilingual }
  );
  await convertHTMLtoPNG(banner2, path.join(outputDir, '02-multilingual.png'), 1200, 627);
  console.log('   ✓ 02-multilingual.png');

  // 3. LinkedIn horizontal - Split layout with restaurant visual
  const banner3 = splitLayoutTemplate(
    {
      width: 1200, height: 627,
      headline: 'AI agents for restaurants that never miss an order',
      highlightWords: ['AI agents'],
      subtext: 'Handle reorders, reservations, and inquiries 24/7.',
      cta: 'See Restaurant Demo',
      visualPosition: 'right',
      theme: 'light',
    },
    { logoBase64: blackLogo, visualBase64: restaurantsReorder }
  );
  await convertHTMLtoPNG(banner3, path.join(outputDir, '03-restaurants-split.png'), 1200, 627);
  console.log('   ✓ 03-restaurants-split.png');

  // 4. LinkedIn horizontal - Gradient background
  const banner4 = visualBackgroundTemplate(
    {
      width: 1200, height: 627,
      headline: 'Ship voice AI to production in days, not months',
      highlightWords: ['voice AI'],
      subtext: 'One platform. Zero multi-vendor complexity.',
      cta: 'Start Building',
      textPosition: 'center',
      textColor: 'dark',
    },
    { logoBase64: blackLogo, visualBase64: gradientBg }
  );
  await convertHTMLtoPNG(banner4, path.join(outputDir, '04-gradient-center.png'), 1200, 627);
  console.log('   ✓ 04-gradient-center.png');

  // 5. LinkedIn horizontal - Dark with 3D icon
  const banner5 = darkIconTemplate(
    {
      width: 1200, height: 627,
      headline: 'Build AI agents that scale globally',
      highlightWords: ['AI agents'],
      subtext: 'From prototype to production on unified infrastructure.',
      cta: 'Get Started Free',
    },
    { logoBase64: whiteLogo, iconBase64: voiceAIIcon }
  );
  await convertHTMLtoPNG(banner5, path.join(outputDir, '05-dark-icon.png'), 1200, 627);
  console.log('   ✓ 05-dark-icon.png');

  // 6. Vertical story - Gradient
  const banner6 = visualBackgroundTemplate(
    {
      width: 1080, height: 1920,
      headline: 'Voice AI infrastructure that just works',
      highlightWords: ['Voice AI'],
      subtext: 'Own the network. Own the latency.',
      cta: 'Learn More',
      textPosition: 'bottom',
      textColor: 'dark',
    },
    { logoBase64: blackLogo, visualBase64: gradientBg }
  );
  await convertHTMLtoPNG(banner6, path.join(outputDir, '06-story-gradient.png'), 1080, 1920);
  console.log('   ✓ 06-story-gradient.png');

  // 7. Vertical story - Dark with icon
  const banner7 = darkIconTemplate(
    {
      width: 1080, height: 1920,
      headline: 'Your voice AI demo works. Production won\'t.',
      highlightWords: ['Production won\'t.'],
      subtext: 'Multi-vendor stacks add latency that breaks conversations.',
      cta: 'Fix It Now',
    },
    { logoBase64: whiteLogo, iconBase64: aiIcon }
  );
  await convertHTMLtoPNG(banner7, path.join(outputDir, '07-story-dark.png'), 1080, 1920);
  console.log('   ✓ 07-story-dark.png');

  // 8. Square - Retail/ecommerce
  const banner8 = visualBackgroundTemplate(
    {
      width: 1080, height: 1080,
      headline: 'AI agents for delivery updates customers actually want',
      highlightWords: ['AI agents'],
      subtext: 'Proactive notifications via voice, SMS, or RCS.',
      cta: 'See Retail Demo',
      textPosition: 'bottom',
      textColor: 'light',
      overlayOpacity: 0.4,
    },
    { logoBase64: whiteLogo, visualBase64: retailEcommerce }
  );
  await convertHTMLtoPNG(banner8, path.join(outputDir, '08-square-retail.png'), 1080, 1080);
  console.log('   ✓ 08-square-retail.png');

  console.log(`\n✅ Done! Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
