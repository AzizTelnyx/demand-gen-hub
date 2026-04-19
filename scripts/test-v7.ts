#!/usr/bin/env ts-node
/**
 * V7 Test - Using ACTUAL Telnyx assets
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

import { selectLogo } from '../src/lib/logo-selector';

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const imageBuffer = await fs.readFile(imagePath);
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
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 500));
    // Only save PNG, no HTML
    await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width, height } });
  } finally {
    await browser.close();
  }
}

/* ─── Template matching the EXACT sample style ──────────────────────────────── */

function createHealthcareAd(
  content: { headline: string; description: string; cta: string },
  assets: { logoBase64: string; visualBase64: string },
  width: number,
  height: number
): string {
  // Detect aspect ratio for layout adjustments
  const isWide = width > height * 1.2;
  const isTall = height > width * 1.2;
  const isSquare = !isWide && !isTall;

  // Scale based on area
  const area = width * height;
  const refArea = 300 * 250;
  const scale = Math.sqrt(area / refArea);

  // Text zone width (left side) - NO overlap with visual
  const textZoneWidth = isWide ? Math.round(width * 0.52) : isTall ? Math.round(width * 0.95) : Math.round(width * 0.55);

  // Visual zone (right side)
  const visualSize = isTall ? Math.round(width * 0.85) : Math.round(Math.min(width * 0.5, height * 0.7));

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
    background: #F5F2ED;
  }

  /* Soft gradient on left side */
  .gradient-accent {
    position: absolute;
    left: -10%;
    top: -10%;
    width: 60%;
    height: 120%;
    background: linear-gradient(145deg,
      rgba(0, 210, 175, 0.5) 0%,
      rgba(170, 120, 210, 0.4) 45%,
      rgba(100, 180, 240, 0.3) 100%
    );
    filter: blur(${Math.round(30 * scale)}px);
    z-index: 1;
  }

  /* Visual - positioned in its own zone on right (or bottom for tall) */
  .visual {
    position: absolute;
    ${isTall ? `
      right: 50%;
      transform: translateX(50%);
      bottom: ${Math.round(35 * scale)}px;
      width: ${visualSize}px;
      height: ${visualSize}px;
    ` : `
      right: 0;
      bottom: ${Math.round(25 * scale)}px;
      width: ${visualSize}px;
      height: ${visualSize}px;
    `}
    z-index: 2;
  }
  .visual img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: ${isTall ? 'center bottom' : 'right bottom'};
  }

  /* Text content - stays in left zone, no overlap */
  .content {
    position: relative;
    z-index: 3;
    padding: ${Math.round(14 * scale)}px ${Math.round(16 * scale)}px;
    width: ${textZoneWidth}px;
    ${isTall ? `padding-bottom: ${visualSize + 40 * scale}px;` : ''}
  }

  .headline {
    font-size: ${Math.round(19 * scale)}px;
    font-weight: 700;
    color: #1A1A1A;
    line-height: 1.18;
    margin-bottom: ${Math.round(8 * scale)}px;
    letter-spacing: -0.3px;
  }

  .description {
    font-size: ${Math.round(11.5 * scale)}px;
    font-weight: 400;
    color: #4A4A4A;
    line-height: 1.4;
    margin-bottom: ${Math.round(12 * scale)}px;
  }

  .cta {
    display: inline-block;
    background: #00C9A7;
    color: #FFFFFF;
    font-size: ${Math.round(10.5 * scale)}px;
    font-weight: 600;
    padding: ${Math.round(8 * scale)}px ${Math.round(18 * scale)}px;
    border-radius: ${Math.round(20 * scale)}px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .logo {
    position: absolute;
    bottom: ${Math.round(10 * scale)}px;
    left: ${Math.round(16 * scale)}px;
    height: ${Math.round(14 * scale)}px;
    z-index: 4;
  }
</style></head><body>
  <div class="gradient-accent"></div>

  <div class="visual">
    <img src="${assets.visualBase64}" alt="" />
  </div>

  <div class="content">
    <div class="headline">${content.headline}</div>
    <div class="description">${content.description}</div>
    <div class="cta">${content.cta}</div>
  </div>

  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
</body></html>`;
}

/* ─── Native banner (728x90 style) ──────────────────────────────────────────── */

function createNativeBanner(
  content: { headline: string; cta: string },
  assets: { logoBase64: string; iconBase64?: string },
  width: number,
  height: number
): string {
  const scale = Math.min(width / 728, height / 90);
  const hasIcon = !!assets.iconBase64;

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
    background: linear-gradient(90deg, #9BE0D8 0%, #B8D4F0 50%, #D4C8E8 100%);
  }

  .container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
    padding: 0 ${24 * scale}px;
  }

  .headline {
    font-size: ${20 * scale}px;
    font-weight: 700;
    color: #1A1A1A;
    line-height: 1.2;
  }

  ${hasIcon ? `
  .icon {
    width: ${55 * scale}px;
    height: ${55 * scale}px;
    margin: 0 ${20 * scale}px;
  }
  .icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  ` : ''}

  .right {
    display: flex;
    align-items: center;
    gap: ${18 * scale}px;
  }

  .cta {
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: ${12 * scale}px;
    font-weight: 600;
    padding: ${10 * scale}px ${22 * scale}px;
    border-radius: ${25 * scale}px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }

  .logo {
    height: ${16 * scale}px;
  }
</style></head><body>
  <div class="container">
    <div class="headline">${content.headline}</div>

    ${hasIcon ? `
    <div class="icon">
      <img src="${assets.iconBase64}" alt="" />
    </div>
    ` : ''}

    <div class="right">
      <div class="cta">${content.cta}</div>
      <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
    </div>
  </div>
</body></html>`;
}

async function main() {
  console.log('\n🎨 V7 Test - Matching ACTUAL Telnyx Ads\n');

  // Load real assets
  const logoPath = await selectLogo('#F5F2ED');
  const logoBase64 = await imageToBase64(path.join(process.cwd(), logoPath));

  // Load the healthcare visual (photo + mockup composite)
  const healthcareVisual = await imageToBase64(
    '/Users/azizalsinafi/Documents/Asset_Library/Industry_Visuals/Social_Assets/Healthcare/Industry_Healthcare_Lab-Results@2x.png'
  );

  // Load 3D voice icon for banner
  const voiceIcon = await imageToBase64(
    path.join(process.cwd(), 'brand-assets/_new_collection_product-icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/01_Voice-AI-Agent/Voice ai_00123.png')
  );

  console.log(`   Logo: ${logoBase64 ? '✓' : '✗'}`);
  console.log(`   Healthcare visual: ${healthcareVisual ? '✓' : '✗'}`);
  console.log(`   Voice icon: ${voiceIcon ? '✓' : '✗'}`);

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `v7-actual-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Standard ad sizes
  const sizes = [
    { w: 300, h: 250, name: '300x250' },      // Medium Rectangle
    { w: 300, h: 600, name: '300x600' },      // Half Page
    { w: 336, h: 280, name: '336x280' },      // Large Rectangle
    { w: 728, h: 90, name: '728x90' },        // Leaderboard
    { w: 160, h: 600, name: '160x600' },      // Wide Skyscraper
    { w: 320, h: 50, name: '320x50' },        // Mobile Leaderboard
    { w: 970, h: 250, name: '970x250' },      // Billboard
    { w: 300, h: 50, name: '300x50' },        // Mobile Banner
  ];

  const content = {
    headline: 'Multilingual always on patient support',
    description: 'Deploy 24/7 AI voice agents to reduce wait times and language barriers across your patient journey.',
    cta: 'Learn More',
  };

  for (const size of sizes) {
    // Use banner template for very wide formats
    if (size.w / size.h > 4) {
      const banner = createNativeBanner(
        { headline: 'Build AI Voice Agents with Telnyx engineers', cta: 'Get Started' },
        { logoBase64, iconBase64: voiceIcon },
        size.w, size.h
      );
      await convertHTMLtoPNG(banner, path.join(outputDir, `banner-${size.name}.png`), size.w, size.h);
    } else {
      const ad = createHealthcareAd(content, { logoBase64, visualBase64: healthcareVisual }, size.w, size.h);
      await convertHTMLtoPNG(ad, path.join(outputDir, `healthcare-${size.name}.png`), size.w, size.h);
    }
    console.log(`   ✓ ${size.name}`);
  }

  console.log(`\n✅ Done! Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
