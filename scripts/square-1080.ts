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

// Asset paths
const ASSETS = {
  photos: {
    finance: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/photography/industry/finance/industry-finance-photography-tap-payment-transaction-contactless-phone-iphone.jpg`,
    restaurants: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/photography/industry/restaurants/industry-restaurants-photography-food-takeout.jpg`,
    logistics: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/photography/industry/logistics/industry-logistics-photography-street-taxi.jpg`,
    personLaptop: `${BRAND_ASSETS}/telnyx-assets/Photography/Stock_Unsplash (Free)/01_People+Device/christin-hume-Hcfwew744z4-unsplash (1).jpg`,
  },
  composed: {
    financeChat: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/industry/use-cases/finances/industry-usecases-finance-multilingual.png`,
    warmTransfers: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Features/01_Voice-AI-Agent/Voice-AI-Agent_Feature_Warm transfers/Voice-AI-Agent_Feature_Warm transfers900x620.png`,
    retailHero: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/industry/hero/industry_retail_ecommerce_hero.png`,
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

// ─── Template 1: Infrastructure Dark (pills stack) ──────────────────────────

function infrastructureDarkTemplate(
  config: {
    headline: string;
    highlightWords: string[];
    cta: string;
    pills: Array<{ icon: string; label: string; primary?: boolean }>;
  },
  logoBase64: string
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
      ${!isLast ? '<div class="connector"></div>' : '<div class="connector connector-fade"></div>'}
    `;
  }).join('');

  return `<!DOCTYPE html>
<html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
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

  /* Arches - taller, more spread */
  .arch {
    position: absolute;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(13, 74, 74, 0.6) 0%, transparent 100%);
  }
  .arch-l1 { left: -30px; top: 80px; height: 500px; width: 100px; }
  .arch-l2 { left: 60px; top: 140px; height: 450px; width: 80px; opacity: 0.6; }
  .arch-r1 { right: -30px; top: 60px; height: 520px; width: 100px; }
  .arch-r2 { right: 70px; top: 120px; height: 480px; width: 80px; opacity: 0.6; }
  .arch-r3 { right: 150px; top: 180px; height: 400px; width: 60px; opacity: 0.4; }
  .arch-c1 { left: 50%; transform: translateX(-50%); top: 250px; height: 350px; width: 50px; opacity: 0.3; }
  .arch-c2 { left: 45%; top: 280px; height: 300px; width: 45px; opacity: 0.25; }
  .arch-c3 { left: 55%; top: 300px; height: 280px; width: 45px; opacity: 0.25; }

  /* Glow */
  .glow {
    position: absolute;
    left: 50%;
    top: 160px;
    transform: translateX(-50%);
    width: 350px;
    height: 200px;
    background: radial-gradient(ellipse, rgba(0, 200, 200, 0.2) 0%, transparent 70%);
  }

  .logo {
    position: absolute;
    top: 40px;
    left: 50%;
    transform: translateX(-50%);
    height: 34px;
  }

  /* Pills - positioned in upper-middle */
  .pills-container {
    position: absolute;
    top: 120px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .pill {
    background: rgba(200, 240, 235, 0.95);
    color: #1A1A1A;
    padding: 16px 36px;
    border-radius: 50px;
    font-size: 22px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .pill-primary {
    background: linear-gradient(135deg, #7EEEE0 0%, #5DE0D0 100%);
    padding: 24px 52px;
    font-size: 30px;
    box-shadow: 0 0 100px rgba(0, 220, 200, 0.6);
  }
  .connector {
    width: 2px;
    height: 28px;
    background: rgba(255, 255, 255, 0.4);
  }
  .connector-fade {
    height: 80px;
    background: linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%);
  }

  /* Floating UI elements in middle area */
  .float-card {
    position: absolute;
    background: rgba(30, 40, 45, 0.9);
    border: 1px solid rgba(0, 220, 200, 0.2);
    border-radius: 12px;
    padding: 14px 20px;
    font-size: 13px;
    color: rgba(255,255,255,0.7);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .float-card-left {
    left: 60px;
    top: 420px;
  }
  .float-card-right {
    right: 60px;
    top: 520px;
  }
  .float-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #00D4CC 0%, #00A89F 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }
  .float-text span {
    color: #00E5CC;
    font-weight: 600;
  }

  /* Stats indicator */
  .stats-row {
    position: absolute;
    top: 580px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 40px;
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
    font-size: 12px;
    color: rgba(255,255,255,0.5);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  /* Headline - positioned to fill space */
  .headline-container {
    position: absolute;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    width: 88%;
  }
  .headline {
    font-size: 48px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -1px;
  }
  .headline .hl { color: #00E5CC; }

  .cta {
    position: absolute;
    bottom: 55px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 18px;
    font-weight: 500;
  }
</style>
</head><body>
  <div class="arch arch-l1"></div>
  <div class="arch arch-l2"></div>
  <div class="arch arch-r1"></div>
  <div class="arch arch-r2"></div>
  <div class="arch arch-r3"></div>
  <div class="arch arch-c1"></div>
  <div class="arch arch-c2"></div>
  <div class="arch arch-c3"></div>
  <div class="glow"></div>
  <img src="${logoBase64}" class="logo" />
  <div class="pills-container">${pillsHTML}</div>

  <div class="float-card float-card-left">
    <div class="float-icon">🔊</div>
    <div class="float-text">Latency: <span>~200ms</span></div>
  </div>
  <div class="float-card float-card-right">
    <div class="float-icon">📊</div>
    <div class="float-text">Uptime: <span>99.99%</span></div>
  </div>

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

// ─── Template 2: Light Mode with Stars & UI ─────────────────────────────────

function lightModeTemplate(
  config: {
    headline: string;
    highlightWords: string[];
    subtext?: string;
    cta?: string;
  },
  logoBase64: string
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
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    background: linear-gradient(145deg, #F5F5F0 0%, #E8F4F2 50%, #E0F0EE 100%);
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
  }

  /* Gradient stars - bigger, more prominent */
  .star {
    position: absolute;
    background: linear-gradient(180deg, #00E8FF 0%, #00D4AA 100%);
    clip-path: polygon(50% 0%, 61% 35%, 100% 50%, 61% 65%, 50% 100%, 39% 65%, 0% 50%, 39% 35%);
  }
  .star-1 { width: 400px; height: 400px; left: -80px; bottom: 80px; }
  .star-2 { width: 200px; height: 200px; right: 320px; top: 80px; }
  .star-3 { width: 140px; height: 140px; right: 140px; bottom: 380px; opacity: 0.8; }
  .star-4 { width: 80px; height: 80px; left: 280px; top: 400px; opacity: 0.6; }
  .star-5 { width: 60px; height: 60px; right: 60px; top: 280px; opacity: 0.5; }

  /* Dashed lines */
  .dashed {
    position: absolute;
    border: 2px dashed rgba(0,0,0,0.12);
  }
  .dashed-1 {
    top: 100px;
    right: 180px;
    width: 120px;
    height: 80px;
    border-radius: 0 20px 0 0;
    border-left: none;
    border-bottom: none;
  }
  .dashed-2 {
    right: 180px;
    top: 180px;
    width: 2px;
    height: 300px;
    border: none;
    border-right: 2px dashed rgba(0,0,0,0.12);
  }
  .dashed-3 {
    right: 60px;
    top: 480px;
    width: 120px;
    height: 2px;
    border: none;
    border-top: 2px dashed rgba(0,0,0,0.12);
  }

  /* Sound wave card */
  .wave-card {
    position: absolute;
    top: 80px;
    right: 60px;
    background: rgba(220, 235, 245, 0.95);
    border-radius: 16px;
    padding: 20px 24px;
    display: flex;
    gap: 5px;
    align-items: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
  }
  .wave-bar {
    width: 6px;
    background: #1A1A1A;
    border-radius: 3px;
  }
  .wave-bar:nth-child(1) { height: 18px; }
  .wave-bar:nth-child(2) { height: 32px; }
  .wave-bar:nth-child(3) { height: 24px; }
  .wave-bar:nth-child(4) { height: 36px; }
  .wave-bar:nth-child(5) { height: 20px; }

  /* Browser card - larger, more prominent */
  .browser-card {
    position: absolute;
    right: 40px;
    bottom: 140px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 16px;
    width: 320px;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0,0,0,0.12);
  }
  .browser-header {
    background: rgba(240, 245, 250, 0.95);
    padding: 14px 18px;
    display: flex;
    gap: 8px;
  }
  .browser-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #CBD5E0;
  }
  .browser-content {
    padding: 24px;
  }
  .browser-line {
    height: 12px;
    background: #E8EDF2;
    border-radius: 6px;
    margin-bottom: 12px;
  }
  .browser-line:nth-child(1) { width: 100%; }
  .browser-line:nth-child(2) { width: 80%; }
  .browser-line:nth-child(3) { width: 60%; margin-bottom: 0; }

  /* AI badge - bigger */
  .ai-badge {
    position: absolute;
    right: 60px;
    bottom: 500px;
    width: 64px;
    height: 64px;
    background: #1A1A1A;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    color: #00D4AA;
    font-size: 28px;
  }

  /* Chat bubble */
  .chat-bubble {
    position: absolute;
    right: 200px;
    bottom: 300px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 16px 16px 4px 16px;
    padding: 16px 20px;
    font-size: 14px;
    color: #333;
    box-shadow: 0 6px 20px rgba(0,0,0,0.08);
    max-width: 180px;
  }
  .chat-bubble::after {
    content: '✦';
    position: absolute;
    right: -30px;
    bottom: 8px;
    color: #00D4CC;
    font-size: 20px;
  }

  /* Floating metric */
  .metric-badge {
    position: absolute;
    left: 400px;
    bottom: 100px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 12px;
    padding: 14px 20px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .metric-badge .num {
    font-size: 24px;
    font-weight: 700;
    color: #00C9D4;
  }
  .metric-badge .label {
    font-size: 12px;
    color: #666;
  }

  /* Content */
  .content {
    position: absolute;
    top: 160px;
    left: 48px;
    max-width: 500px;
  }
  .headline {
    font-size: 52px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -1.5px;
    margin-bottom: 20px;
  }
  .headline .hl { color: #00C9D4; }
  .subtext {
    font-size: 20px;
    color: #555;
    line-height: 1.4;
    margin-bottom: 28px;
  }
  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #FFFFFF;
    color: #1A1A1A;
    font-size: 16px;
    font-weight: 600;
    padding: 16px 28px;
    border-radius: 50px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  }
</style>
</head><body>
  <img src="${logoBase64}" class="logo" />

  <div class="star star-1"></div>
  <div class="star star-2"></div>
  <div class="star star-3"></div>
  <div class="star star-4"></div>
  <div class="star star-5"></div>

  <div class="dashed dashed-1"></div>
  <div class="dashed dashed-2"></div>
  <div class="dashed dashed-3"></div>

  <div class="wave-card">
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
  </div>

  <div class="ai-badge">✦</div>

  <div class="chat-bubble">How can I help you today?</div>

  <div class="browser-card">
    <div class="browser-header">
      <div class="browser-dot"></div>
      <div class="browser-dot"></div>
      <div class="browser-dot"></div>
    </div>
    <div class="browser-content">
      <div class="browser-line"></div>
      <div class="browser-line"></div>
      <div class="browser-line"></div>
    </div>
  </div>

  <div class="metric-badge">
    <div class="num">99.99%</div>
    <div class="label">Uptime</div>
  </div>

  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${config.subtext ? `<div class="subtext">${config.subtext}</div>` : ''}
    ${config.cta ? `<div class="cta">${config.cta} &gt;</div>` : ''}
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
  photoBase64: string
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
    font-size: 50px;
    font-weight: 700;
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

// ─── Template 4: Composed Visual ────────────────────────────────────────────

function composedVisualTemplate(
  config: {
    headline: string;
    highlightWords: string[];
    cta?: string;
  },
  logoBase64: string,
  visualBase64: string
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
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    font-family: 'Inter', sans-serif;
    color: #1A1A1A;
    position: relative;
    overflow: hidden;
    background: linear-gradient(145deg, #E8F5F2 0%, #D8F0EE 100%);
  }

  .logo {
    position: absolute;
    top: 48px;
    left: 48px;
    height: 32px;
    z-index: 10;
  }

  /* Visual takes top portion */
  .visual {
    position: absolute;
    top: 100px;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    height: 55%;
    object-fit: contain;
    border-radius: 16px;
  }

  .content {
    position: absolute;
    bottom: 70px;
    left: 50px;
    right: 50px;
    text-align: center;
  }

  .headline {
    font-size: 44px;
    font-weight: 700;
    line-height: 1.12;
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
    padding: 16px 32px;
    border-radius: 50px;
  }
</style>
</head><body>
  <img src="${logoBase64}" class="logo" />
  <img src="${visualBase64}" class="visual" />
  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${config.cta ? `<div class="cta">${config.cta} &gt;</div>` : ''}
  </div>
</body></html>`;
}

// ─── Template 5: Dark with Composed Visual ──────────────────────────────────

function darkComposedTemplate(
  config: {
    headline: string;
    highlightWords: string[];
    subtext?: string;
    cta?: string;
  },
  logoBase64: string,
  visualBase64: string
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

  /* Gradient glow behind visual */
  .glow-bg {
    position: absolute;
    top: 50px;
    left: 50%;
    transform: translateX(-50%);
    width: 700px;
    height: 500px;
    background: radial-gradient(ellipse, rgba(0, 180, 180, 0.15) 0%, transparent 70%);
  }

  .logo {
    position: absolute;
    top: 48px;
    left: 48px;
    height: 32px;
    z-index: 10;
  }

  /* Visual fills upper-middle */
  .visual {
    position: absolute;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    width: 95%;
    height: 58%;
    object-fit: contain;
  }

  /* Content at bottom */
  .content {
    position: absolute;
    bottom: 60px;
    left: 50px;
    right: 50px;
    text-align: center;
  }

  .headline {
    font-size: 44px;
    font-weight: 700;
    line-height: 1.12;
    letter-spacing: -1px;
    margin-bottom: 16px;
  }
  .headline .hl { color: #00E5CC; }

  .subtext {
    font-size: 18px;
    color: rgba(255,255,255,0.7);
    margin-bottom: 24px;
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

  /* Decorative elements */
  .corner-accent {
    position: absolute;
    width: 100px;
    height: 100px;
    border: 2px solid rgba(0, 220, 200, 0.3);
    border-radius: 50%;
  }
  .corner-accent-1 { top: 40px; right: 40px; }
  .corner-accent-2 { bottom: 250px; left: 30px; width: 60px; height: 60px; opacity: 0.5; }
</style>
</head><body>
  <div class="glow-bg"></div>
  <div class="corner-accent corner-accent-1"></div>
  <div class="corner-accent corner-accent-2"></div>
  <img src="${logoBase64}" class="logo" />
  <img src="${visualBase64}" class="visual" />
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
  photoBase64: string
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

  /* Photo takes right half */
  .photo-container {
    position: absolute;
    top: 0;
    right: 0;
    width: 50%;
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
    background: linear-gradient(90deg, rgba(250,250,250,1) 0%, rgba(250,250,250,0.3) 30%, transparent 100%);
  }

  /* Content on left */
  .content {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    left: 48px;
    max-width: 480px;
  }

  .headline {
    font-size: 42px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -1px;
    margin-bottom: 20px;
  }
  .headline .hl { color: #00C9D4; }

  .subtext {
    font-size: 18px;
    color: #555;
    line-height: 1.5;
    margin-bottom: 24px;
  }

  .bullets {
    margin-bottom: 28px;
  }
  .bullet {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 16px;
    color: #333;
    margin-bottom: 12px;
  }
  .bullet-check {
    color: #00C9D4;
    font-weight: 700;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: 16px;
    font-weight: 600;
    padding: 16px 32px;
    border-radius: 50px;
  }

  /* Accent shapes */
  .accent-line {
    position: absolute;
    bottom: 48px;
    left: 48px;
    width: 80px;
    height: 4px;
    background: linear-gradient(90deg, #00E8FF, #00D4AA);
    border-radius: 2px;
  }
</style>
</head><body>
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

  <div class="accent-line"></div>
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

  const financePhoto = await imageToBase64(ASSETS.photos.finance);
  const restaurantPhoto = await imageToBase64(ASSETS.photos.restaurants);
  const personPhoto = await imageToBase64(ASSETS.photos.personLaptop);
  const financeChat = await imageToBase64(ASSETS.composed.financeChat);
  const warmTransfers = await imageToBase64(ASSETS.composed.warmTransfers);
  const retailHero = await imageToBase64(ASSETS.composed.retailHero);

  console.log('   Logos:', whiteLogo ? '✓' : '✗', blackLogo ? '✓' : '✗');
  console.log('   Photos:', financePhoto ? '✓' : '✗', restaurantPhoto ? '✓' : '✗', personPhoto ? '✓' : '✗');
  console.log('   Composed:', financeChat ? '✓' : '✗', warmTransfers ? '✓' : '✗', retailHero ? '✓' : '✗');
  console.log('');

  // 1. Infrastructure Dark
  const infra = infrastructureDarkTemplate(
    {
      headline: 'Reliable Voice AI starts with a unified infrastructure',
      highlightWords: ['Voice AI'],
      cta: 'Learn more',
      pills: [
        { icon: '✦', label: 'Ai', primary: true },
        { icon: '🌐', label: 'Network' },
        { icon: '📞', label: 'Numbers' },
      ],
    },
    whiteLogo
  );
  await renderAndSave(infra, path.join(outputDir, '01-infrastructure-dark.png'));
  console.log('   ✓ 01-infrastructure-dark.png');

  // 2. Light Mode
  const light = lightModeTemplate(
    {
      headline: 'Voice AI built for fintech stacks',
      highlightWords: ['Voice AI'],
      subtext: 'From prototype to production on one platform.',
      cta: 'Try Telnyx Free',
    },
    blackLogo
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
    financePhoto
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
    financeChat
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
    warmTransfers
  );
  await renderAndSave(darkComposed, path.join(outputDir, '05-dark-warm-transfers.png'));
  console.log('   ✓ 05-dark-warm-transfers.png');

  // 6. Split Layout - Retail
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
  await renderAndSave(split, path.join(outputDir, '06-split-retail.png'));
  console.log('   ✓ 06-split-retail.png');

  console.log(`\n✅ Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
