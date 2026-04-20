#!/usr/bin/env ts-node
/**
 * Proper Banner Generator - Uses ACTUAL 3D assets, not CSS drawings
 *
 * Key insight: The reference banners use pre-rendered 3D visuals as images,
 * not CSS-drawn shapes. This script composites real assets correctly.
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { selectLogo } from '../src/lib/logo-selector';

// ─── Asset Paths ─────────────────────────────────────────────────────────────

const BRAND_ASSETS = '/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/brand-assets';
const ASSET_LIBRARY = '/Users/azizalsinafi/Documents/Asset_Library';
const PP_FORMULA_FONT = `${BRAND_ASSETS}/fonts/PP Formula - Extrabold v2.0/PPFormula-Extrabold.ttf`;

// Actual 3D visual assets (pre-rendered with lighting, depth, gradients)
const VISUAL_ASSETS = {
  // Voice AI 3D arches - these are the actual assets used in reference banners
  arches: {
    tealGradient: `${ASSET_LIBRARY}/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Animations/Icon-Animations_Colorful/01_Voice-AI-Agent/Voice AI_Icon-Colorful_Animated_Static_Png/Voice ai_00035.png`,
    withStar: `${ASSET_LIBRARY}/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Animations/Icon-Animations_Colorful/01_Voice-AI-Agent/Voice AI_Icon-Colorful_Animated_Static_Png/Voice ai_00050.png`,
    expanded: `${ASSET_LIBRARY}/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Animations/Icon-Animations_Colorful/01_Voice-AI-Agent/Voice AI_Icon-Colorful_Animated_Static_Png/Voice ai_00080.png`,
  },
  // Background visual with star
  backgroundVisual: `${ASSET_LIBRARY}/_NEW_AdGen_Library/backgrounds/voice-ai/background_voice-ai-agent-6.png`,
  // Industry heroes
  industryHeroes: {
    finance: `${ASSET_LIBRARY}/_NEW_AdGen_Library/industry/hero/industry_finance_hero.png`,
    retail: `${ASSET_LIBRARY}/_NEW_AdGen_Library/industry/hero/industry_retail_ecommerce_hero.png`,
    automotive: `${ASSET_LIBRARY}/_NEW_AdGen_Library/industry/hero/industry_automotive_hero.png`,
  },
};

// ─── Utilities ───────────────────────────────────────────────────────────────

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext;
    return `data:image/${mimeType};base64,${imageBuffer.toString('base64')}`;
  } catch (error) {
    console.error(`Failed to load image: ${imagePath}`);
    return '';
  }
}

async function loadFont(): Promise<string> {
  const fontBuffer = await fs.readFile(PP_FORMULA_FONT);
  return fontBuffer.toString('base64');
}

// ─── Template: Arches with Real 3D Assets ────────────────────────────────────
// Replicates banner_16 style using actual pre-rendered visual assets

function archesTemplateHTML(
  fontBase64: string,
  logoBase64: string,
  visualBase64: string,
  options: {
    headline: string;
    highlightWords: string[];
    cta: string;
    size: { width: number; height: number };
  }
): string {
  const { headline, highlightWords, cta, size } = options;
  const isSquare = size.width === size.height;

  // Process headline to highlight words
  let processedHeadline = headline;
  highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="hl">$1</span>'
    );
  });

  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${size.width}px;
    height: ${size.height}px;
    background: #0A0A0A;
    font-family: 'PP Formula', sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
  }

  /* Logo - top left */
  .logo {
    position: absolute;
    top: ${isSquare ? 50 : 40}px;
    left: ${isSquare ? 50 : 60}px;
    height: ${isSquare ? 56 : 48}px;
    z-index: 100;
  }

  /* 3D Visual Asset - positioned on right side */
  .hero-visual {
    position: absolute;
    right: ${isSquare ? -100 : 50}px;
    top: ${isSquare ? 50 : 0}px;
    width: ${isSquare ? 750 : 600}px;
    height: ${isSquare ? 900 : 627}px;
    object-fit: contain;
    object-position: right center;
    z-index: 1;
  }

  /* Headline - left side */
  .headline {
    position: absolute;
    top: ${isSquare ? 160 : 120}px;
    left: ${isSquare ? 50 : 60}px;
    font-size: ${isSquare ? 68 : 52}px;
    font-weight: bold;
    line-height: 1.0;
    max-width: ${isSquare ? 550 : 480}px;
    z-index: 50;
  }
  .hl {
    color: #5DE8DC;
    font-style: italic;
  }

  /* Subtext */
  .subtext {
    position: absolute;
    top: ${isSquare ? 520 : 380}px;
    left: ${isSquare ? 50 : 60}px;
    font-size: ${isSquare ? 20 : 17}px;
    font-family: system-ui, -apple-system, sans-serif;
    color: rgba(255,255,255,0.7);
    max-width: ${isSquare ? 450 : 400}px;
    line-height: 1.5;
    z-index: 50;
  }

  /* Waveform badge - voice indicator */
  .waveform-badge {
    position: absolute;
    left: ${isSquare ? 60 : 80}px;
    bottom: ${isSquare ? 300 : 200}px;
    background: #1A1A1A;
    border-radius: 18px;
    padding: 16px 22px;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    z-index: 50;
  }
  .wave-bar {
    width: 7px;
    background: #FFFFFF;
    border-radius: 4px;
  }
  .wave-bar:nth-child(1) { height: 16px; }
  .wave-bar:nth-child(2) { height: 30px; }
  .wave-bar:nth-child(3) { height: 22px; }
  .wave-bar:nth-child(4) { height: 36px; }
  .wave-bar:nth-child(5) { height: 18px; }

  /* Code card */
  .code-card {
    position: absolute;
    right: ${isSquare ? 80 : 100}px;
    bottom: ${isSquare ? 180 : 100}px;
    background: rgba(255,255,255,0.95);
    border-radius: 16px;
    padding: 16px 20px;
    width: ${isSquare ? 320 : 280}px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    z-index: 60;
  }
  .code-dots {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }
  .code-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #E0E0E0;
  }
  .code-text {
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    font-size: ${isSquare ? 13 : 11}px;
    color: #333;
    line-height: 1.6;
  }

  /* Asterisk/AI badge */
  .ai-badge {
    position: absolute;
    right: ${isSquare ? 60 : 80}px;
    bottom: ${isSquare ? 340 : 220}px;
    width: 52px;
    height: 52px;
    background: #1A1A1A;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 60;
  }
  .ai-badge svg {
    width: 26px;
    height: 26px;
    fill: #FFFFFF;
  }

  /* Dashed connector lines */
  .dashed-line {
    position: absolute;
    border: 2px dashed rgba(255,255,255,0.25);
    z-index: 40;
  }
  .dashed-h {
    left: ${isSquare ? 170 : 190}px;
    bottom: ${isSquare ? 280 : 180}px;
    width: ${isSquare ? 200 : 160}px;
    height: 0;
  }
  .dashed-v {
    right: ${isSquare ? 85 : 105}px;
    bottom: ${isSquare ? 395 : 275}px;
    width: 0;
    height: 50px;
  }
  .dashed-corner {
    left: ${isSquare ? 170 : 190}px;
    bottom: ${isSquare ? 200 : 130}px;
    width: ${isSquare ? 240 : 190}px;
    height: 80px;
    border-radius: 0 0 24px 0;
    border-top: none;
    border-left: none;
  }

  /* CTA */
  .cta {
    position: absolute;
    bottom: ${isSquare ? 50 : 40}px;
    left: ${isSquare ? 50 : 60}px;
    font-size: ${isSquare ? 22 : 18}px;
    font-family: system-ui, -apple-system, sans-serif;
    z-index: 50;
  }
</style>
</head>
<body>
  <!-- Logo -->
  <img src="${logoBase64}" class="logo" />

  <!-- 3D Visual Asset (actual pre-rendered image, not CSS) -->
  <img src="${visualBase64}" class="hero-visual" />

  <!-- Headline -->
  <div class="headline">${processedHeadline}</div>

  <!-- Subtext -->
  <div class="subtext">From prototype to production on one platform. Build voice AI that scales.</div>

  <!-- Waveform badge -->
  <div class="waveform-badge">
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
  </div>

  <!-- Dashed connectors -->
  <div class="dashed-line dashed-corner"></div>
  <div class="dashed-line dashed-v"></div>

  <!-- Code card -->
  <div class="code-card">
    <div class="code-dots">
      <div class="code-dot"></div>
      <div class="code-dot"></div>
      <div class="code-dot"></div>
    </div>
    <div class="code-text">
      curl -L 'https://api.telnyx.com/<br/>
      v2/calls/CALL_CONTROL_ID/<br/>
      actions/ai_assistant_start' \\
    </div>
  </div>

  <!-- AI Badge -->
  <div class="ai-badge">
    <svg viewBox="0 0 24 24">
      <path d="M12 2C13.1 2 14 2.9 14 4V9.5L18.5 6.8C19.5 6.2 20.7 6.5 21.3 7.5C21.9 8.5 21.6 9.7 20.6 10.3L16 13L20.6 15.7C21.6 16.3 21.9 17.5 21.3 18.5C20.7 19.5 19.5 19.8 18.5 19.2L14 16.5V22C14 23.1 13.1 24 12 24C10.9 24 10 23.1 10 22V16.5L5.5 19.2C4.5 19.8 3.3 19.5 2.7 18.5C2.1 17.5 2.4 16.3 3.4 15.7L8 13L3.4 10.3C2.4 9.7 2.1 8.5 2.7 7.5C3.3 6.5 4.5 6.2 5.5 6.8L10 9.5V4C10 2.9 10.9 2 12 2Z"/>
    </svg>
  </div>

  <!-- CTA -->
  <div class="cta">${cta} ></div>
</body>
</html>`;
}

// ─── Template: Phone Mockup (like banner_43) ─────────────────────────────────

function phoneMockupHTML(
  fontBase64: string,
  logoBase64: string,
  options: {
    headline: string;
    highlightWords: string[];
    contactName: string;
    size: { width: number; height: number };
  }
): string {
  const { headline, highlightWords, contactName, size } = options;
  const isSquare = size.width === size.height;

  let processedHeadline = headline;
  highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="hl">$1</span>'
    );
  });

  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${size.width}px;
    height: ${size.height}px;
    background: #0A0A0A;
    font-family: 'PP Formula', sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
  }

  .logo {
    position: absolute;
    top: ${isSquare ? 50 : 40}px;
    left: 50%;
    transform: translateX(-50%);
    height: ${isSquare ? 56 : 48}px;
  }

  .headline {
    position: absolute;
    top: ${isSquare ? 140 : 100}px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    font-size: ${isSquare ? 60 : 48}px;
    font-weight: bold;
    line-height: 1.05;
    width: 90%;
  }
  .hl { color: #5DE8DC; }

  /* Phone mockup */
  .phone {
    position: absolute;
    bottom: ${isSquare ? -80 : -60}px;
    left: 50%;
    transform: translateX(-50%);
    width: ${isSquare ? 400 : 340}px;
    background: #1A1A1A;
    border-radius: 40px;
    padding: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }

  .phone-screen {
    background: #2A2A2A;
    border-radius: 28px;
    padding: 20px;
    min-height: ${isSquare ? 480 : 380}px;
  }

  .phone-status {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    font-family: system-ui, sans-serif;
    color: rgba(255,255,255,0.7);
    margin-bottom: 20px;
  }

  .phone-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
  }
  .nav-btn {
    width: 44px;
    height: 44px;
    background: #3A3A3A;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #FFF;
    font-size: 20px;
  }
  .edit-btn {
    background: #3A3A3A;
    padding: 10px 20px;
    border-radius: 20px;
    font-size: 14px;
    font-family: system-ui, sans-serif;
  }

  /* Contact avatar */
  .contact-avatar {
    width: ${isSquare ? 140 : 120}px;
    height: ${isSquare ? 140 : 120}px;
    background: linear-gradient(180deg, #5DE8DC 0%, #00B4A8 100%);
    border-radius: 50%;
    margin: 0 auto 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .avatar-icon {
    width: 50%;
    height: 50%;
    background: #0A0A0A;
    clip-path: polygon(50% 0%, 61% 35%, 100% 50%, 61% 65%, 50% 100%, 39% 65%, 0% 50%, 39% 35%);
  }

  .contact-name {
    text-align: center;
    font-size: ${isSquare ? 28 : 24}px;
    font-family: system-ui, sans-serif;
    font-weight: 600;
    margin-bottom: 24px;
  }

  /* Action buttons */
  .action-row {
    display: flex;
    justify-content: center;
    gap: 20px;
  }
  .action-btn {
    width: 60px;
    height: 60px;
    background: #3A3A3A;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .action-btn svg {
    width: 28px;
    height: 28px;
    fill: #FFF;
  }
</style>
</head>
<body>
  <img src="${logoBase64}" class="logo" />
  <div class="headline">${processedHeadline}</div>

  <div class="phone">
    <div class="phone-screen">
      <div class="phone-status">
        <span>9:41</span>
        <span>●●● ⚡ 🔋</span>
      </div>

      <div class="phone-nav">
        <div class="nav-btn">‹</div>
        <div class="edit-btn">Edit</div>
      </div>

      <div class="contact-avatar">
        <div class="avatar-icon"></div>
      </div>

      <div class="contact-name">${contactName}</div>

      <div class="action-row">
        <div class="action-btn">
          <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
        </div>
        <div class="action-btn">
          <svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
        </div>
        <div class="action-btn">
          <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
        </div>
        <div class="action-btn">
          <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎯 Generating banners with ACTUAL 3D assets...\n');

  // Create output directory
  const outputDir = path.join(process.cwd(), 'output', 'creatives', `proper-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Load assets
  const fontBase64 = await loadFont();
  const logoPath = await selectLogo('#000000');
  const logoBase64 = await imageToBase64(path.join(process.cwd(), logoPath));

  // Load 3D visual assets
  const archesVisualBase64 = await imageToBase64(VISUAL_ASSETS.arches.tealGradient);
  const archesWithStarBase64 = await imageToBase64(VISUAL_ASSETS.arches.withStar);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    // ─── Banner 1: Arches template (square) ───────────────────────────────────
    console.log('1. Generating arches template (1080x1080)...');
    {
      const html = archesTemplateHTML(fontBase64, logoBase64, archesVisualBase64, {
        headline: 'Get predictable real-time AI performance at enterprise scale',
        highlightWords: ['predictable', 'real-time'],
        cta: 'Try Telnyx free',
        size: { width: 1080, height: 1080 },
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
      await new Promise(r => setTimeout(r, 500));
      await page.screenshot({ path: path.join(outputDir, 'banner-arches-square.png'), type: 'png' });
      await page.close();
      console.log('   ✓ banner-arches-square.png');
    }

    // ─── Banner 2: Arches template with star (square) ─────────────────────────
    console.log('2. Generating arches with star (1080x1080)...');
    {
      const html = archesTemplateHTML(fontBase64, logoBase64, archesWithStarBase64, {
        headline: 'Build Voice AI agents in minutes',
        highlightWords: ['Voice AI'],
        cta: 'Start free',
        size: { width: 1080, height: 1080 },
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
      await new Promise(r => setTimeout(r, 500));
      await page.screenshot({ path: path.join(outputDir, 'banner-arches-star-square.png'), type: 'png' });
      await page.close();
      console.log('   ✓ banner-arches-star-square.png');
    }

    // ─── Banner 3: Phone mockup (square) ──────────────────────────────────────
    console.log('3. Generating phone mockup (1080x1080)...');
    {
      const html = phoneMockupHTML(fontBase64, logoBase64, {
        headline: 'AI voice agents built to scale fintech support',
        highlightWords: ['AI voice'],
        contactName: 'Fintech AI',
        size: { width: 1080, height: 1080 },
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
      await new Promise(r => setTimeout(r, 500));
      await page.screenshot({ path: path.join(outputDir, 'banner-phone-square.png'), type: 'png' });
      await page.close();
      console.log('   ✓ banner-phone-square.png');
    }

    // ─── Banner 4: Arches LinkedIn horizontal ─────────────────────────────────
    console.log('4. Generating arches template (1200x627 LinkedIn)...');
    {
      const html = archesTemplateHTML(fontBase64, logoBase64, archesVisualBase64, {
        headline: 'Get predictable real-time AI performance',
        highlightWords: ['predictable', 'real-time'],
        cta: 'Try Telnyx free',
        size: { width: 1200, height: 627 },
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 627, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
      await new Promise(r => setTimeout(r, 500));
      await page.screenshot({ path: path.join(outputDir, 'banner-arches-linkedin.png'), type: 'png' });
      await page.close();
      console.log('   ✓ banner-arches-linkedin.png');
    }

    // ─── Banner 5: Phone mockup LinkedIn ──────────────────────────────────────
    console.log('5. Generating phone mockup (1200x627 LinkedIn)...');
    {
      const html = phoneMockupHTML(fontBase64, logoBase64, {
        headline: 'AI voice agents built for fintech',
        highlightWords: ['AI voice'],
        contactName: 'Fintech AI',
        size: { width: 1200, height: 627 },
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 627, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
      await new Promise(r => setTimeout(r, 500));
      await page.screenshot({ path: path.join(outputDir, 'banner-phone-linkedin.png'), type: 'png' });
      await page.close();
      console.log('   ✓ banner-phone-linkedin.png');
    }

  } finally {
    await browser.close();
  }

  console.log(`\n✅ Output: ${outputDir}\n`);

  // Open folder
  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
