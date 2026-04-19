#!/usr/bin/env ts-node
/**
 * Square 1080x1080 Banner Generator
 *
 * Templates:
 * 1. Infrastructure (dark) - UI pills stack
 * 2. Light mode - gradient stars + UI elements
 * 3. Photo overlay - stock photo with text
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { selectLogo } from '../src/lib/logo-selector';

const SIZE = 1080;
const BRAND_ASSETS = '/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/brand-assets';
const PP_FORMULA_FONT = `${BRAND_ASSETS}/fonts/PP Formula - Extrabold v2.0/PPFormula-Extrabold.ttf`;

// Load font as base64 for embedding in HTML
async function loadFontBase64(fontPath: string): Promise<string> {
  try {
    const fontBuffer = await fs.readFile(fontPath);
    return fontBuffer.toString('base64');
  } catch (e) {
    console.error(`Failed to load font: ${fontPath}`);
    return '';
  }
}

function getFontFaceCSS(fontBase64: string): string {
  return `
    @font-face {
      font-family: 'PP Formula';
      src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
      font-weight: bold;
      font-style: normal;
    }
  `;
}

// Asset paths
const ASSETS = {
  photos: {
    finance: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/photography/industry/finance/industry-finance-photography-tap-payment-transaction-contactless-phone-iphone.jpg`,
    restaurants: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/photography/industry/restaurants/industry-restaurants-photography-food-takeout.jpg`,
    logistics: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/photography/industry/logistics/industry-logistics-photography-street-taxi.jpg`,
    personLaptop: `${BRAND_ASSETS}/telnyx-assets/Photography/Stock_Unsplash (Free)/01_People+Device/christin-hume-Hcfwew744z4-unsplash (1).jpg`,
    personLaptop2: `${BRAND_ASSETS}/telnyx-assets/Photography/Stock_Unsplash (Free)/01_People+Device/tim-gouw-1K9T5YiZ2WU-unsplash.jpg`,
  },
  composed: {
    financeChat: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/industry/use-cases/finances/industry-usecases-finance-multilingual.png`,
    warmTransfers: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Features/01_Voice-AI-Agent/Voice-AI-Agent_Feature_Warm transfers/Voice-AI-Agent_Feature_Warm transfers900x620.png`,
    retailHero: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/industry/hero/industry_retail_ecommerce_hero.png`,
    aiAgent: `${BRAND_ASSETS}/telnyx-assets/Product_Visuals/Voice_AI/Static/With background/AI agent.png`,
    restaurantReorder: `${BRAND_ASSETS}/telnyx-assets/Industry_Visuals/Social_Assets/Restaurants/Industry_Restaurants_Reorder.png`,
  },
  icons3d: {
    aiStar: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/00_AI/AI00050.png`,
    voiceAi: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/01_Voice-AI-Agent/Voice ai_00033.png`,
  },
};

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

async function renderAndSave(html: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
  } finally {
    await browser.close();
  }
}

// ─── Template 1: Infrastructure Dark with 3D Icon ───────────────────────────

function infrastructureDarkTemplate(
  config: {
    headline: string;
    highlightWords: string[];
    cta: string;
    pills: Array<{ icon: string; label: string; primary?: boolean }>;
  },
  logoBase64: string,
  icon3dBase64: string,
  fontBase64: string
): string {
  let processedHeadline = config.headline;
  config.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="hl">$1</span>'
    );
  });

  const pillsHTML = config.pills.map((pill, i) => {
    const isLast = i === config.pills.length - 1;
    return `
      <div class="pill ${pill.primary ? 'pill-primary' : ''}">
        <span class="pill-icon">${pill.icon}</span>
        <span class="pill-label">${pill.label}</span>
      </div>
      ${!isLast ? '<div class="connector"></div>' : ''}
    `;
  }).join('');

  return `<!DOCTYPE html>
<html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  ${getFontFaceCSS(fontBase64)}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    background: #0A0A0A;
    font-family: 'Inter', sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
  }

  /* 3D Icon - large, centered */
  .icon-3d {
    position: absolute;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    width: 320px;
    height: 320px;
    object-fit: contain;
  }

  /* Glow behind icon */
  .icon-glow {
    position: absolute;
    top: 120px;
    left: 50%;
    transform: translateX(-50%);
    width: 400px;
    height: 300px;
    background: radial-gradient(ellipse, rgba(0, 220, 200, 0.25) 0%, transparent 70%);
  }

  .logo {
    position: absolute;
    top: 40px;
    left: 50%;
    transform: translateX(-50%);
    height: 32px;
  }

  /* Pills row - horizontal under icon */
  .pills-row {
    position: absolute;
    top: 420px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .pill {
    background: rgba(200, 240, 235, 0.95);
    color: #1A1A1A;
    padding: 14px 28px;
    border-radius: 50px;
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .pill-primary {
    background: linear-gradient(135deg, #7EEEE0 0%, #5DE0D0 100%);
    padding: 16px 32px;
    font-size: 20px;
    box-shadow: 0 0 60px rgba(0, 220, 200, 0.4);
  }
  .connector {
    width: 30px;
    height: 2px;
    background: rgba(255, 255, 255, 0.3);
  }

  /* Stats row */
  .stats-row {
    position: absolute;
    top: 520px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 50px;
  }
  .stat-item {
    text-align: center;
  }
  .stat-value {
    font-size: 32px;
    font-weight: 700;
    color: #00E5CC;
  }
  .stat-label {
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  /* Headline */
  .headline-container {
    position: absolute;
    bottom: 140px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    width: 90%;
  }
  .headline {
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-size: 44px;
    font-weight: bold;
    line-height: 1.1;
    letter-spacing: -1px;
  }
  .headline .hl { color: #00E5CC; }

  .cta {
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: #00D4CC;
    color: #0A0A0A;
    padding: 18px 40px;
    border-radius: 50px;
    font-size: 16px;
    font-weight: 600;
  }
</style>
</head><body>
  <div class="icon-glow"></div>
  <img src="${logoBase64}" class="logo" />
  <img src="${icon3dBase64}" class="icon-3d" />
  <div class="pills-row">${pillsHTML}</div>
  <div class="stats-row">
    <div class="stat-item">
      <div class="stat-value">50+</div>
      <div class="stat-label">Countries</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">5B+</div>
      <div class="stat-label">API Calls</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">200+</div>
      <div class="stat-label">Carriers</div>
    </div>
  </div>
  <div class="headline-container"><div class="headline">${processedHeadline}</div></div>
  <div class="cta">${config.cta} &gt;</div>
</body></html>`;
}

// ─── Template 2: Light Mode with Composed Visual ────────────────────────────

function lightModeTemplate(
  config: {
    headline: string;
    highlightWords: string[];
    subtext?: string;
    cta?: string;
  },
  logoBase64: string,
  visualBase64: string,
  fontBase64: string
): string {
  let processedHeadline = config.headline;
  config.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="hl">$1</span>'
    );
  });

  return `<!DOCTYPE html>
<html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  ${getFontFaceCSS(fontBase64)}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    background: linear-gradient(160deg, #F8FAF9 0%, #E6F3F0 100%);
    font-family: 'Inter', sans-serif;
    color: #1A1A1A;
    position: relative;
    overflow: hidden;
  }

  .logo {
    position: absolute;
    top: 48px;
    left: 48px;
    height: 32px;
    z-index: 10;
  }

  /* Large composed visual - fills right side */
  .visual {
    position: absolute;
    top: 0;
    right: -100px;
    width: 750px;
    height: 100%;
    object-fit: contain;
    object-position: center right;
  }

  /* Gradient fade on left edge of visual */
  .visual-fade {
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg,
      rgba(248,250,249,1) 0%,
      rgba(248,250,249,0.95) 25%,
      rgba(248,250,249,0.6) 40%,
      transparent 55%
    );
  }

  /* Small accent stars */
  .star {
    position: absolute;
    background: linear-gradient(180deg, #00E8FF 0%, #00D4AA 100%);
    clip-path: polygon(50% 0%, 61% 35%, 100% 50%, 61% 65%, 50% 100%, 39% 65%, 0% 50%, 39% 35%);
  }
  .star-1 { width: 80px; height: 80px; left: 380px; top: 120px; opacity: 0.6; }
  .star-2 { width: 50px; height: 50px; left: 280px; bottom: 180px; opacity: 0.4; }
  .star-3 { width: 35px; height: 35px; left: 450px; bottom: 300px; opacity: 0.3; }

  /* Content on left */
  .content {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    left: 48px;
    max-width: 420px;
    z-index: 5;
  }

  .headline {
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-size: 48px;
    font-weight: bold;
    line-height: 1.08;
    letter-spacing: -1px;
    margin-bottom: 20px;
  }
  .headline .hl { color: #00C9D4; }

  .subtext {
    font-size: 18px;
    color: #555;
    line-height: 1.5;
    margin-bottom: 28px;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: 16px;
    font-weight: 600;
    padding: 18px 32px;
    border-radius: 50px;
  }

  /* Stats bar at bottom */
  .stats-bar {
    position: absolute;
    bottom: 48px;
    left: 48px;
    display: flex;
    gap: 40px;
  }
  .stat {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .stat-num {
    font-size: 24px;
    font-weight: 700;
    color: #00C9D4;
  }
  .stat-text {
    font-size: 13px;
    color: #666;
  }
</style>
</head><body>
  <img src="${logoBase64}" class="logo" />
  <img src="${visualBase64}" class="visual" />
  <div class="visual-fade"></div>

  <div class="star star-1"></div>
  <div class="star star-2"></div>
  <div class="star star-3"></div>

  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${config.subtext ? `<div class="subtext">${config.subtext}</div>` : ''}
    ${config.cta ? `<div class="cta">${config.cta} &gt;</div>` : ''}
  </div>

  <div class="stats-bar">
    <div class="stat">
      <span class="stat-num">99.99%</span>
      <span class="stat-text">Uptime</span>
    </div>
    <div class="stat">
      <span class="stat-num">&lt;200ms</span>
      <span class="stat-text">Latency</span>
    </div>
  </div>
</body></html>`;
}

// ─── Template 3: Photo Overlay ──────────────────────────────────────────────

function photoOverlayTemplate(
  config: {
    headline: string;
    highlightWords: string[];
    subtext?: string;
    cta?: string;
  },
  logoBase64: string,
  photoBase64: string,
  fontBase64: string
): string {
  let processedHeadline = config.headline;
  config.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="hl">$1</span>'
    );
  });

  return `<!DOCTYPE html>
<html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  ${getFontFaceCSS(fontBase64)}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    font-family: 'Inter', sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
  }

  .photo {
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: grayscale(100%) brightness(0.5);
  }

  /* Gradient overlay - darker at bottom for text */
  .overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(
      180deg,
      rgba(0,0,0,0.2) 0%,
      rgba(0,0,0,0.3) 40%,
      rgba(0,0,0,0.7) 100%
    );
  }

  .logo {
    position: absolute;
    top: 48px;
    left: 50%;
    transform: translateX(-50%);
    height: 34px;
    z-index: 10;
  }

  .content {
    position: absolute;
    bottom: 80px;
    left: 60px;
    right: 60px;
    text-align: center;
    z-index: 10;
  }

  .headline {
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-size: 50px;
    font-weight: bold;
    line-height: 1.12;
    letter-spacing: -1px;
    margin-bottom: 20px;
  }
  .headline .hl { color: #00E5CC; }

  .subtext {
    font-size: 20px;
    color: rgba(255,255,255,0.85);
    line-height: 1.4;
    margin-bottom: 28px;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #00D4CC;
    color: #0A0A0A;
    font-size: 16px;
    font-weight: 600;
    padding: 16px 32px;
    border-radius: 50px;
  }
</style>
</head><body>
  <img src="${photoBase64}" class="photo" />
  <div class="overlay"></div>
  <img src="${logoBase64}" class="logo" />
  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${config.subtext ? `<div class="subtext">${config.subtext}</div>` : ''}
    ${config.cta ? `<div class="cta">${config.cta} &gt;</div>` : ''}
  </div>
</body></html>`;
}

// ─── Template 4: Full Bleed Composed Visual ─────────────────────────────────

function composedVisualTemplate(
  config: {
    headline: string;
    highlightWords: string[];
    cta?: string;
  },
  logoBase64: string,
  visualBase64: string,
  fontBase64: string
): string {
  let processedHeadline = config.headline;
  config.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="hl">$1</span>'
    );
  });

  return `<!DOCTYPE html>
<html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  ${getFontFaceCSS(fontBase64)}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    font-family: 'Inter', sans-serif;
    color: #1A1A1A;
    position: relative;
    overflow: hidden;
    background: linear-gradient(160deg, #E8F5F2 0%, #D4EFEB 100%);
  }

  .logo {
    position: absolute;
    top: 40px;
    left: 40px;
    height: 30px;
    z-index: 10;
  }

  /* Visual fills most of canvas */
  .visual {
    position: absolute;
    top: 40px;
    left: 50%;
    transform: translateX(-50%);
    width: 105%;
    height: 70%;
    object-fit: contain;
  }

  /* Gradient overlay at bottom */
  .bottom-gradient {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 350px;
    background: linear-gradient(180deg, transparent 0%, rgba(228, 243, 240, 0.9) 30%, rgba(220, 240, 236, 1) 100%);
  }

  .content {
    position: absolute;
    bottom: 40px;
    left: 40px;
    right: 40px;
    text-align: center;
    z-index: 5;
  }

  .headline {
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-size: 48px;
    font-weight: bold;
    line-height: 1.08;
    letter-spacing: -1px;
    margin-bottom: 24px;
  }
  .headline .hl { color: #00C9D4; }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: 16px;
    font-weight: 600;
    padding: 18px 40px;
    border-radius: 50px;
  }

  /* Accent elements */
  .accent-star {
    position: absolute;
    background: linear-gradient(180deg, #00E8FF 0%, #00D4AA 100%);
    clip-path: polygon(50% 0%, 61% 35%, 100% 50%, 61% 65%, 50% 100%, 39% 65%, 0% 50%, 39% 35%);
  }
  .accent-star-1 { width: 60px; height: 60px; bottom: 180px; left: 60px; opacity: 0.5; }
  .accent-star-2 { width: 40px; height: 40px; bottom: 220px; right: 80px; opacity: 0.4; }
</style>
</head><body>
  <img src="${logoBase64}" class="logo" />
  <img src="${visualBase64}" class="visual" />
  <div class="bottom-gradient"></div>
  <div class="accent-star accent-star-1"></div>
  <div class="accent-star accent-star-2"></div>
  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${config.cta ? `<div class="cta">${config.cta} &gt;</div>` : ''}
  </div>
</body></html>`;
}

// ─── Template 5: Dark Full Bleed with Composed Visual ───────────────────────

function darkComposedTemplate(
  config: {
    headline: string;
    highlightWords: string[];
    subtext?: string;
    cta?: string;
  },
  logoBase64: string,
  visualBase64: string,
  fontBase64: string
): string {
  let processedHeadline = config.headline;
  config.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="hl">$1</span>'
    );
  });

  return `<!DOCTYPE html>
<html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  ${getFontFaceCSS(fontBase64)}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    font-family: 'Inter', sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
    background: #0A0A0A;
  }

  /* Gradient glow */
  .glow-bg {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    height: 70%;
    background: radial-gradient(ellipse at center top, rgba(0, 200, 200, 0.2) 0%, transparent 60%);
  }

  .logo {
    position: absolute;
    top: 40px;
    left: 40px;
    height: 30px;
    z-index: 10;
  }

  /* Visual - full width, upper 70% */
  .visual {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: 110%;
    height: 72%;
    object-fit: contain;
  }

  /* Dark gradient at bottom */
  .bottom-gradient {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 380px;
    background: linear-gradient(180deg, transparent 0%, rgba(10,10,10,0.8) 30%, #0A0A0A 60%);
  }

  /* Content at bottom */
  .content {
    position: absolute;
    bottom: 40px;
    left: 40px;
    right: 40px;
    text-align: center;
    z-index: 5;
  }

  .headline {
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-size: 44px;
    font-weight: bold;
    line-height: 1.08;
    letter-spacing: -1px;
    margin-bottom: 12px;
  }
  .headline .hl { color: #00E5CC; }

  .subtext {
    font-size: 16px;
    color: rgba(255,255,255,0.6);
    margin-bottom: 20px;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #00D4CC;
    color: #0A0A0A;
    font-size: 16px;
    font-weight: 600;
    padding: 18px 40px;
    border-radius: 50px;
  }
</style>
</head><body>
  <div class="glow-bg"></div>
  <img src="${logoBase64}" class="logo" />
  <img src="${visualBase64}" class="visual" />
  <div class="bottom-gradient"></div>
  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${config.subtext ? `<div class="subtext">${config.subtext}</div>` : ''}
    ${config.cta ? `<div class="cta">${config.cta} &gt;</div>` : ''}
  </div>
</body></html>`;
}

// ─── Template 6: Split Layout (Photo + Content) ─────────────────────────────

function splitLayoutTemplate(
  config: {
    headline: string;
    highlightWords: string[];
    subtext?: string;
    cta?: string;
    bullets?: string[];
  },
  logoBase64: string,
  photoBase64: string,
  fontBase64: string
): string {
  let processedHeadline = config.headline;
  config.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="hl">$1</span>'
    );
  });

  const bulletsHTML = config.bullets?.map(b => `<div class="bullet"><span class="bullet-check">✓</span>${b}</div>`).join('') || '';

  return `<!DOCTYPE html>
<html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  ${getFontFaceCSS(fontBase64)}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    font-family: 'Inter', sans-serif;
    color: #1A1A1A;
    position: relative;
    overflow: hidden;
    background: #FAFAFA;
  }

  .logo {
    position: absolute;
    top: 48px;
    left: 48px;
    height: 32px;
    z-index: 10;
  }

  /* Photo takes right portion - with softer blend */
  .photo-container {
    position: absolute;
    top: 0;
    right: 0;
    width: 55%;
    height: 100%;
    overflow: hidden;
  }
  .photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .photo-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(90deg,
      rgba(250,250,250,1) 0%,
      rgba(250,250,250,0.95) 15%,
      rgba(250,250,250,0.4) 40%,
      transparent 70%
    );
  }

  /* Content on left */
  .content {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    left: 56px;
    max-width: 460px;
  }

  .headline {
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-size: 40px;
    font-weight: bold;
    line-height: 1.12;
    letter-spacing: -0.5px;
    margin-bottom: 16px;
  }
  .headline .hl { color: #00C9D4; }

  .subtext {
    font-size: 17px;
    color: #555;
    line-height: 1.5;
    margin-bottom: 20px;
  }

  .bullets {
    margin-bottom: 24px;
  }
  .bullet {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    color: #333;
    margin-bottom: 10px;
  }
  .bullet-check {
    color: #00C9D4;
    font-weight: 700;
    font-size: 16px;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: 15px;
    font-weight: 600;
    padding: 16px 30px;
    border-radius: 50px;
  }

  /* Accent line */
  .accent-line {
    position: absolute;
    top: 56px;
    left: 56px;
    width: 60px;
    height: 4px;
    background: linear-gradient(90deg, #00E8FF, #00D4AA);
    border-radius: 2px;
  }
</style>
</head><body>
  <div class="accent-line"></div>
  <img src="${logoBase64}" class="logo" />

  <div class="photo-container">
    <img src="${photoBase64}" class="photo" />
    <div class="photo-overlay"></div>
  </div>

  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${config.subtext ? `<div class="subtext">${config.subtext}</div>` : ''}
    ${config.bullets ? `<div class="bullets">${bulletsHTML}</div>` : ''}
    ${config.cta ? `<div class="cta">${config.cta} &gt;</div>` : ''}
  </div>
</body></html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎯 Square 1080x1080 - All Templates\n');

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `square-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Load assets
  const whiteLogoPath = await selectLogo('#000000');
  const blackLogoPath = await selectLogo('#FFFFFF');
  const whiteLogo = await imageToBase64(path.join(process.cwd(), whiteLogoPath));
  const blackLogo = await imageToBase64(path.join(process.cwd(), blackLogoPath));

  // Photos
  const financePhoto = await imageToBase64(ASSETS.photos.finance);
  const personPhoto = await imageToBase64(ASSETS.photos.personLaptop);

  // Composed visuals
  const financeChat = await imageToBase64(ASSETS.composed.financeChat);
  const warmTransfers = await imageToBase64(ASSETS.composed.warmTransfers);
  const restaurantReorder = await imageToBase64(ASSETS.composed.restaurantReorder);
  const aiAgent = await imageToBase64(ASSETS.composed.aiAgent);

  // 3D Icons (for dark backgrounds only)
  const aiStarIcon = await imageToBase64(ASSETS.icons3d.aiStar);
  const voiceAiIcon = await imageToBase64(ASSETS.icons3d.voiceAi);

  // Load PP Formula font
  const ppFormulaFont = await loadFontBase64(PP_FORMULA_FONT);

  console.log('   Logos:', whiteLogo ? '✓' : '✗', blackLogo ? '✓' : '✗');
  console.log('   Font:', ppFormulaFont ? '✓ PP Formula' : '✗');
  console.log('   Photos:', financePhoto ? '✓' : '✗', personPhoto ? '✓' : '✗');
  console.log('   Composed:', financeChat ? '✓' : '✗', warmTransfers ? '✓' : '✗', restaurantReorder ? '✓' : '✗');
  console.log('   3D Icons:', aiStarIcon ? '✓' : '✗', voiceAiIcon ? '✓' : '✗');
  console.log('');

  // 1. Infrastructure Dark with 3D Icon
  const infra = infrastructureDarkTemplate(
    {
      headline: 'Reliable Voice AI starts with unified infrastructure',
      highlightWords: ['Voice AI'],
      cta: 'Learn more',
      pills: [
        { icon: '✦', label: 'Ai', primary: true },
        { icon: '🌐', label: 'Network' },
        { icon: '📞', label: 'Numbers' },
      ],
    },
    whiteLogo,
    voiceAiIcon,
    ppFormulaFont
  );
  await renderAndSave(infra, path.join(outputDir, '01-infrastructure-dark.png'));
  console.log('   ✓ 01-infrastructure-dark.png');

  // 2. Light Mode with Composed Visual
  const light = lightModeTemplate(
    {
      headline: 'Voice AI built for fintech stacks',
      highlightWords: ['Voice AI'],
      subtext: 'From prototype to production on one platform.',
      cta: 'Try Telnyx Free',
    },
    blackLogo,
    aiAgent,
    ppFormulaFont
  );
  await renderAndSave(light, path.join(outputDir, '02-light-fintech.png'));
  console.log('   ✓ 02-light-fintech.png');

  // 3. Photo Overlay - Finance
  const photo = photoOverlayTemplate(
    {
      headline: 'Voice AI for regulated fintech flows',
      highlightWords: ['Voice AI'],
      subtext: 'Secure, compliant, production-ready.',
      cta: 'See How It Works',
    },
    whiteLogo,
    financePhoto,
    ppFormulaFont
  );
  await renderAndSave(photo, path.join(outputDir, '03-photo-fintech.png'));
  console.log('   ✓ 03-photo-fintech.png');

  // 4. Composed Visual - Multilingual
  const composed = composedVisualTemplate(
    {
      headline: 'AI agents that speak any language',
      highlightWords: ['AI agents'],
      cta: 'See Multilingual Demo',
    },
    blackLogo,
    financeChat,
    ppFormulaFont
  );
  await renderAndSave(composed, path.join(outputDir, '04-composed-multilingual.png'));
  console.log('   ✓ 04-composed-multilingual.png');

  // 5. Dark Composed - Warm Transfers
  const darkComposed = darkComposedTemplate(
    {
      headline: 'Warm transfers that feel seamless',
      highlightWords: ['Warm transfers'],
      subtext: 'AI-powered handoffs to live agents in seconds.',
      cta: 'See Live Demo',
    },
    whiteLogo,
    warmTransfers,
    ppFormulaFont
  );
  await renderAndSave(darkComposed, path.join(outputDir, '05-dark-warm-transfers.png'));
  console.log('   ✓ 05-dark-warm-transfers.png');

  // 6. Split Layout - Business
  const split = splitLayoutTemplate(
    {
      headline: 'Automate customer calls at scale',
      highlightWords: ['Automate'],
      subtext: 'Deploy AI voice agents that handle orders, returns, and support.',
      bullets: [
        '24/7 availability',
        'Sub-second response times',
        'Seamless CRM integration',
      ],
      cta: 'Start Building',
    },
    blackLogo,
    personPhoto
  );
  await renderAndSave(split, path.join(outputDir, '06-split-business.png'));
  console.log('   ✓ 06-split-business.png');

  console.log(`\n✅ Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
