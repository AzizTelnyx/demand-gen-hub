#!/usr/bin/env ts-node
/**
 * Flexible Ad Generator
 *
 * Takes a brief and generates ads using appropriate templates and assets.
 * Matches the actual Telnyx StackAdapt ad style.
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { selectLogo } from '../src/lib/logo-selector';

// ─── Asset Loading ──────────────────────────────────────────────────────────

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const fullPath = imagePath.startsWith('/') ? imagePath : path.join(process.cwd(), imagePath);
    const imageBuffer = await fs.readFile(fullPath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
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
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width, height } });
  } finally {
    await browser.close();
  }
}

// ─── Asset Paths ────────────────────────────────────────────────────────────

const ASSETS = {
  voiceAI: {
    icon: 'brand-assets/_new_collection_product-icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/01_Voice-AI-Agent/Voice ai_00123.png',
  },
  industries: {
    healthcare: '/Users/azizalsinafi/Documents/Asset_Library/Industry_Visuals/Social_Assets/Healthcare/Industry_Healthcare_Lab-Results@2x.png',
    insurance: '/Users/azizalsinafi/Documents/Asset_Library/Industry_Visuals/Social_Assets/Insurance/',
    restaurants: '/Users/azizalsinafi/Documents/Asset_Library/Industry_Visuals/Social_Assets/Restaurants/',
    retail: '/Users/azizalsinafi/Documents/Asset_Library/Industry_Visuals/Social_Assets/Retail/',
    travel: '/Users/azizalsinafi/Documents/Asset_Library/Industry_Visuals/Social_Assets/Travel/',
  }
};

// ─── Template: Product Focus (3D Icon) ──────────────────────────────────────
// Use when: Builder/developer focused, product features, no specific industry

function productFocusTemplate(
  content: { headline: string; description: string; cta: string },
  assets: { logoBase64: string; productIconBase64: string },
  width: number,
  height: number
): string {
  const scale = Math.sqrt((width * height) / (300 * 250));
  const iconSize = Math.round(Math.min(width * 0.55, height * 0.65));

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
    background: linear-gradient(135deg, #E8F4F2 0%, #F0E8F4 40%, #E8EEF8 70%, #F5F3EE 100%);
  }

  /* 3D product icon - positioned to create colorful pattern on left */
  .product-icon {
    position: absolute;
    left: ${Math.round(-iconSize * 0.3)}px;
    top: 50%;
    transform: translateY(-50%);
    width: ${iconSize}px;
    height: ${iconSize}px;
    z-index: 1;
    opacity: 0.9;
  }
  .product-icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .content {
    position: relative;
    z-index: 3;
    padding: ${Math.round(16 * scale)}px;
    padding-left: ${Math.round(width * 0.28)}px;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .headline {
    font-size: ${Math.round(19 * scale)}px;
    font-weight: 700;
    color: #1A1A1A;
    line-height: 1.15;
    margin-bottom: ${Math.round(8 * scale)}px;
    letter-spacing: -0.3px;
  }

  .description {
    font-size: ${Math.round(11 * scale)}px;
    font-weight: 400;
    color: #3A3A3A;
    line-height: 1.4;
    margin-bottom: ${Math.round(12 * scale)}px;
    max-width: 90%;
  }

  .cta {
    display: inline-block;
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: ${Math.round(10 * scale)}px;
    font-weight: 600;
    padding: ${Math.round(8 * scale)}px ${Math.round(18 * scale)}px;
    border-radius: ${Math.round(4 * scale)}px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .logo {
    position: absolute;
    bottom: ${Math.round(10 * scale)}px;
    left: ${Math.round(width * 0.28)}px;
    height: ${Math.round(14 * scale)}px;
    z-index: 5;
  }
</style></head><body>
  <div class="product-icon">
    <img src="${assets.productIconBase64}" alt="" />
  </div>

  <div class="content">
    <div class="headline">${content.headline}</div>
    <div class="description">${content.description}</div>
    <div class="cta">${content.cta}</div>
  </div>

  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
</body></html>`;
}

// ─── Template: Industry Focus (Photo + Mockup) ──────────────────────────────
// Use when: Industry-specific messaging with use case

function industryFocusTemplate(
  content: { headline: string; description: string; cta: string },
  mockup: { title: string; message: string },
  assets: { logoBase64: string; photoBase64: string },
  width: number,
  height: number
): string {
  const scale = Math.sqrt((width * height) / (300 * 250));
  const photoSize = Math.round(Math.min(width * 0.35, height * 0.45));
  const mockupWidth = Math.round(photoSize * 0.9);

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
    background: linear-gradient(135deg, #E8F4F2 0%, #F0E8F4 40%, #E8EEF8 70%, #F5F3EE 100%);
  }

  .gradient-blur {
    position: absolute;
    left: -15%;
    top: -20%;
    width: 70%;
    height: 140%;
    background: linear-gradient(160deg,
      rgba(0, 220, 180, 0.6) 0%,
      rgba(180, 100, 220, 0.5) 40%,
      rgba(100, 180, 255, 0.4) 80%
    );
    filter: blur(${Math.round(40 * scale)}px);
    z-index: 1;
  }

  .content {
    position: relative;
    z-index: 3;
    padding: ${Math.round(16 * scale)}px;
    max-width: 65%;
  }

  .headline {
    font-size: ${Math.round(20 * scale)}px;
    font-weight: 700;
    color: #1A1A1A;
    line-height: 1.15;
    margin-bottom: ${Math.round(8 * scale)}px;
  }

  .description {
    font-size: ${Math.round(11 * scale)}px;
    color: #3A3A3A;
    line-height: 1.4;
    margin-bottom: ${Math.round(12 * scale)}px;
  }

  .cta {
    display: inline-block;
    background: #00C9A7;
    color: #FFFFFF;
    font-size: ${Math.round(10 * scale)}px;
    font-weight: 600;
    padding: ${Math.round(8 * scale)}px ${Math.round(18 * scale)}px;
    border-radius: ${Math.round(4 * scale)}px;
    text-transform: uppercase;
  }

  .photo {
    position: absolute;
    right: ${Math.round(8 * scale)}px;
    bottom: ${Math.round(28 * scale)}px;
    width: ${photoSize}px;
    height: ${photoSize}px;
    z-index: 2;
  }
  .photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: ${Math.round(6 * scale)}px;
  }

  .mockup-card {
    position: absolute;
    right: ${Math.round(5 * scale)}px;
    bottom: ${Math.round(30 * scale)}px;
    width: ${mockupWidth}px;
    background: #FFFFFF;
    border-radius: ${Math.round(6 * scale)}px;
    padding: ${Math.round(8 * scale)}px;
    box-shadow: 0 ${Math.round(3 * scale)}px ${Math.round(12 * scale)}px rgba(0,0,0,0.1);
    z-index: 4;
  }
  .mockup-title {
    font-size: ${Math.round(8 * scale)}px;
    font-weight: 600;
    color: #1A1A1A;
    margin-bottom: ${Math.round(3 * scale)}px;
  }
  .mockup-text {
    font-size: ${Math.round(6.5 * scale)}px;
    color: #666;
    line-height: 1.3;
  }

  .logo {
    position: absolute;
    bottom: ${Math.round(10 * scale)}px;
    left: ${Math.round(16 * scale)}px;
    height: ${Math.round(16 * scale)}px;
    z-index: 5;
  }
</style></head><body>
  <div class="gradient-blur"></div>

  <div class="content">
    <div class="headline">${content.headline}</div>
    <div class="description">${content.description}</div>
    <div class="cta">${content.cta}</div>
  </div>

  <div class="photo">
    <img src="${assets.photoBase64}" alt="" />
  </div>

  <div class="mockup-card">
    <div class="mockup-title">${mockup.title}</div>
    <div class="mockup-text">${mockup.message}</div>
  </div>

  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
</body></html>`;
}

// ─── Template: Native Banner (728x90) ───────────────────────────────────────

function nativeBannerTemplate(
  content: { headline: string; cta: string },
  assets: { logoBase64: string },
  width: number,
  height: number
): string {
  const scale = Math.min(width / 728, height / 90);
  const iconSize = Math.round(50 * scale);

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    background: linear-gradient(90deg, #9BE8E0 0%, #B8D8F0 50%, #D8C8E8 100%);
  }

  .container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
    padding: 0 ${Math.round(24 * scale)}px;
  }

  .headline {
    font-size: ${Math.round(18 * scale)}px;
    font-weight: 700;
    color: #1A1A1A;
    flex: 1;
  }

  .icon-container {
    width: ${iconSize}px;
    height: ${iconSize}px;
    background: #FFFFFF;
    border-radius: ${Math.round(12 * scale)}px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 ${Math.round(30 * scale)}px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  .icon-waves {
    display: flex;
    gap: ${Math.round(3 * scale)}px;
  }
  .wave {
    width: ${Math.round(4 * scale)}px;
    height: ${Math.round(20 * scale)}px;
    background: #1A1A1A;
    border-radius: ${Math.round(2 * scale)}px;
  }
  .wave:nth-child(2) { height: ${Math.round(28 * scale)}px; }
  .wave:nth-child(3) { height: ${Math.round(16 * scale)}px; }
  .wave:nth-child(4) { height: ${Math.round(24 * scale)}px; }

  .right-section {
    display: flex;
    align-items: center;
    gap: ${Math.round(20 * scale)}px;
  }

  .cta {
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: ${Math.round(11 * scale)}px;
    font-weight: 600;
    padding: ${Math.round(10 * scale)}px ${Math.round(22 * scale)}px;
    border-radius: ${Math.round(4 * scale)}px;
    text-transform: uppercase;
  }

  .logo { height: ${Math.round(14 * scale)}px; }
</style></head><body>
  <div class="container">
    <div class="headline">${content.headline}</div>
    <div class="icon-container">
      <div class="icon-waves">
        <div class="wave"></div>
        <div class="wave"></div>
        <div class="wave"></div>
        <div class="wave"></div>
      </div>
    </div>
    <div class="right-section">
      <div class="cta">${content.cta}</div>
      <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
    </div>
  </div>
</body></html>`;
}

// ─── Brief Parser ───────────────────────────────────────────────────────────

interface ParsedBrief {
  templateType: 'product' | 'industry' | 'banner';
  industry?: string;
  headline: string;
  description: string;
  cta: string;
  mockup?: { title: string; message: string };
}

function parseBrief(brief: string): ParsedBrief {
  const lowerBrief = brief.toLowerCase();

  // Detect industry
  const industries = ['healthcare', 'insurance', 'restaurant', 'retail', 'travel'];
  const detectedIndustry = industries.find(i => lowerBrief.includes(i));

  // Detect if it's builder/developer focused
  const isBuilderFocused = ['builder', 'developer', 'engineer', 'build', 'api', 'sdk'].some(k => lowerBrief.includes(k));

  // Detect if it's a banner format request
  const isBanner = ['banner', '728', 'leaderboard', 'native'].some(k => lowerBrief.includes(k));

  // Default content based on detected type
  if (isBanner) {
    return {
      templateType: 'banner',
      headline: 'Build AI Voice Agents with Telnyx engineers',
      description: '',
      cta: 'Get Started',
    };
  }

  if (isBuilderFocused) {
    return {
      templateType: 'product',
      headline: 'Ship voice AI agents in days, not months',
      description: 'Full-stack platform with telephony, STT, TTS, and LLM orchestration. No multi-vendor complexity.',
      cta: 'Start Building',
    };
  }

  if (detectedIndustry) {
    const industryContent: Record<string, ParsedBrief> = {
      healthcare: {
        templateType: 'industry',
        industry: 'healthcare',
        headline: 'Multilingual always on patient support',
        description: 'Deploy 24/7 AI voice agents to reduce wait times and language barriers across your patient journey.',
        cta: 'Learn More',
        mockup: { title: 'Your lab results are ready.', message: 'Please check your patient portal for more detailed information.' },
      },
      insurance: {
        templateType: 'industry',
        industry: 'insurance',
        headline: 'Automate claims intake 24/7',
        description: 'AI voice agents that handle first notice of loss, policy questions, and claims status updates.',
        cta: 'Learn More',
        mockup: { title: 'Claim #12345 received.', message: 'An adjuster will contact you within 24 hours.' },
      },
      restaurant: {
        templateType: 'industry',
        industry: 'restaurants',
        headline: 'Never miss a reservation call',
        description: 'AI voice agents that book tables, answer menu questions, and take orders around the clock.',
        cta: 'Learn More',
        mockup: { title: 'Table for 4 confirmed.', message: 'Friday at 7pm. See you soon!' },
      },
      retail: {
        templateType: 'industry',
        industry: 'retail',
        headline: 'Scale customer support without scaling costs',
        description: 'AI voice agents that handle order status, returns, and product questions instantly.',
        cta: 'Learn More',
        mockup: { title: 'Order shipped!', message: 'Track your package with the link below.' },
      },
      travel: {
        templateType: 'industry',
        industry: 'travel',
        headline: 'Handle booking changes at any hour',
        description: 'AI voice agents for flight changes, hotel bookings, and travel assistance worldwide.',
        cta: 'Learn More',
        mockup: { title: 'Flight rebooked.', message: 'New confirmation: UA1234 departing 3:30pm.' },
      },
    };
    return industryContent[detectedIndustry] || industryContent.healthcare;
  }

  // Default to product focus
  return {
    templateType: 'product',
    headline: 'Voice AI that just works',
    description: 'Build, deploy, and scale AI voice agents on one platform. No integration headaches.',
    cta: 'Get Started',
  };
}

// ─── Main Generator ─────────────────────────────────────────────────────────

async function generateAd(brief: string, sizes: Array<{ w: number; h: number; name: string }>) {
  console.log(`\n🎨 Generating ads for: "${brief}"\n`);

  const parsed = parseBrief(brief);
  console.log(`   Template: ${parsed.templateType}`);
  if (parsed.industry) console.log(`   Industry: ${parsed.industry}`);

  // Load assets
  const logoBase64 = await imageToBase64(path.join(process.cwd(), await selectLogo('#F5F3EE')));

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `generated-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  for (const size of sizes) {
    let html: string;

    // Very wide banners use banner template
    if (size.w / size.h > 4) {
      html = nativeBannerTemplate(
        { headline: parsed.headline, cta: parsed.cta },
        { logoBase64 },
        size.w, size.h
      );
    } else if (parsed.templateType === 'product') {
      const productIconBase64 = await imageToBase64(path.join(process.cwd(), ASSETS.voiceAI.icon));
      html = productFocusTemplate(
        { headline: parsed.headline, description: parsed.description, cta: parsed.cta },
        { logoBase64, productIconBase64 },
        size.w, size.h
      );
    } else if (parsed.templateType === 'industry' && parsed.industry) {
      const photoBase64 = await imageToBase64(ASSETS.industries.healthcare); // TODO: load correct industry
      html = industryFocusTemplate(
        { headline: parsed.headline, description: parsed.description, cta: parsed.cta },
        parsed.mockup || { title: '', message: '' },
        { logoBase64, photoBase64 },
        size.w, size.h
      );
    } else {
      const productIconBase64 = await imageToBase64(path.join(process.cwd(), ASSETS.voiceAI.icon));
      html = productFocusTemplate(
        { headline: parsed.headline, description: parsed.description, cta: parsed.cta },
        { logoBase64, productIconBase64 },
        size.w, size.h
      );
    }

    await convertHTMLtoPNG(html, path.join(outputDir, `${size.name}.png`), size.w, size.h);
    console.log(`   ✓ ${size.name}`);
  }

  console.log(`\n✅ Done! Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const brief = process.argv.slice(2).join(' ') || 'AI agent banner for builders using eleven labs';

const sizes = [
  { w: 300, h: 250, name: '300x250' },
  { w: 300, h: 600, name: '300x600' },
  { w: 728, h: 90, name: '728x90' },
  { w: 970, h: 250, name: '970x250' },
  { w: 1200, h: 627, name: '1200x627' },
];

generateAd(brief, sizes).catch(console.error);
