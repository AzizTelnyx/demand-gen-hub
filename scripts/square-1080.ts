#!/usr/bin/env ts-node
/**
 * Square 1080x1080 Banner Generator - Matching Reference Designs
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

const ASSETS = {
  photos: {
    finance: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/photography/industry/finance/industry-finance-photography-tap-payment-transaction-contactless-phone-iphone.jpg`,
    personLaptop: `${BRAND_ASSETS}/telnyx-assets/Photography/Stock_Unsplash (Free)/01_People+Device/christin-hume-Hcfwew744z4-unsplash (1).jpg`,
  },
  composed: {
    financeChat: `${BRAND_ASSETS}/telnyx-assets/_NEW_AdGen_Library/industry/use-cases/finances/industry-usecases-finance-multilingual.png`,
    warmTransfers: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Features/01_Voice-AI-Agent/Voice-AI-Agent_Feature_Warm transfers/Voice-AI-Agent_Feature_Warm transfers900x620.png`,
  },
};

async function loadFontBase64(fontPath: string): Promise<string> {
  const fontBuffer = await fs.readFile(fontPath);
  return fontBuffer.toString('base64');
}

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext;
    return `data:image/${mimeType};base64,${base64}`;
  } catch {
    console.error(`Failed to load: ${imagePath}`);
    return '';
  }
}

async function renderAndSave(html: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await browser.close();
  }
}

// ─── Template 1: Dark Pills (matching banner_2_v2) ──────────────────────────

function darkPillsTemplate(fontBase64: string, logoBase64: string): string {
  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    background: #0A0A0A;
    font-family: 'PP Formula', sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
  }

  /* Large arches filling sides */
  .arch {
    position: absolute;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(0, 80, 80, 0.7) 0%, rgba(0, 60, 60, 0.3) 60%, transparent 100%);
  }
  .arch-l1 { left: -60px; top: 40px; width: 140px; height: 600px; }
  .arch-l2 { left: 60px; top: 100px; width: 100px; height: 500px; opacity: 0.7; }
  .arch-r1 { right: -60px; top: 20px; width: 140px; height: 620px; }
  .arch-r2 { right: 60px; top: 80px; width: 100px; height: 520px; opacity: 0.7; }
  .arch-r3 { right: 160px; top: 140px; width: 80px; height: 440px; opacity: 0.5; }
  .arch-c1 { left: 50%; transform: translateX(-50%); top: 200px; width: 60px; height: 400px; opacity: 0.3; }
  .arch-c2 { left: 46%; top: 240px; width: 50px; height: 360px; opacity: 0.25; }
  .arch-c3 { right: 46%; top: 260px; width: 50px; height: 340px; opacity: 0.25; }

  .logo {
    position: absolute;
    top: 50px;
    left: 50%;
    transform: translateX(-50%);
    height: 56px;
  }

  /* Glow behind pills */
  .glow {
    position: absolute;
    top: 140px;
    left: 50%;
    transform: translateX(-50%);
    width: 400px;
    height: 300px;
    background: radial-gradient(ellipse, rgba(0, 200, 200, 0.25) 0%, transparent 70%);
  }

  /* Pills stack - centered, vertical */
  .pills {
    position: absolute;
    top: 160px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .pill {
    background: rgba(200, 240, 235, 0.95);
    color: #1A1A1A;
    padding: 18px 44px;
    border-radius: 60px;
    font-size: 28px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 14px;
    font-family: system-ui, sans-serif;
  }
  .pill-primary {
    background: linear-gradient(135deg, #7EEEE0 0%, #4DD8CC 100%);
    padding: 26px 56px;
    font-size: 36px;
    box-shadow: 0 0 120px rgba(0, 220, 200, 0.6);
  }
  .connector {
    width: 3px;
    height: 35px;
    background: rgba(255, 255, 255, 0.5);
  }

  .headline {
    position: absolute;
    bottom: 140px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    width: 90%;
    font-size: 58px;
    font-weight: bold;
    line-height: 1.05;
  }
  .hl { color: #5DE8DC; }

  .cta {
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 22px;
    font-family: system-ui, sans-serif;
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

  <div class="pills">
    <div class="pill pill-primary">✦ Ai</div>
    <div class="connector"></div>
    <div class="pill">🌐 Network</div>
    <div class="connector"></div>
    <div class="pill">📞 Numbers</div>
    <div class="connector"></div>
  </div>

  <div class="headline">Reliable <span class="hl">Voice AI</span> starts with a unified infrastructure</div>
  <div class="cta">Learn more ></div>
</body></html>`;
}

// ─── Template 2: Light Stars (matching banner_36) ───────────────────────────

function lightStarsTemplate(fontBase64: string, logoBase64: string): string {
  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    background: linear-gradient(160deg, #F5F5F0 0%, #E8F4F2 100%);
    font-family: 'PP Formula', sans-serif;
    color: #1A1A1A;
    position: relative;
    overflow: hidden;
  }

  .logo {
    position: absolute;
    top: 50px;
    left: 50px;
    height: 56px;
  }

  /* Large gradient stars */
  .star {
    position: absolute;
    background: linear-gradient(180deg, #00E8FF 0%, #00D4AA 100%);
    clip-path: polygon(50% 0%, 61% 35%, 100% 50%, 61% 65%, 50% 100%, 39% 65%, 0% 50%, 39% 35%);
  }
  .star-1 { width: 500px; height: 500px; left: -80px; bottom: 100px; }
  .star-2 { width: 220px; height: 220px; right: 200px; top: 180px; }
  .star-3 { width: 120px; height: 120px; right: 120px; bottom: 380px; opacity: 0.7; }

  /* Sound wave card */
  .wave-card {
    position: absolute;
    top: 60px;
    right: 60px;
    background: rgba(220, 235, 250, 0.95);
    border-radius: 20px;
    padding: 24px 30px;
    display: flex;
    gap: 8px;
    align-items: center;
    box-shadow: 0 8px 30px rgba(0,0,0,0.08);
  }
  .wave-bar {
    width: 8px;
    background: #1A1A1A;
    border-radius: 4px;
  }
  .wave-bar:nth-child(1) { height: 24px; }
  .wave-bar:nth-child(2) { height: 40px; }
  .wave-bar:nth-child(3) { height: 30px; }
  .wave-bar:nth-child(4) { height: 48px; }
  .wave-bar:nth-child(5) { height: 28px; }

  /* Dashed connection lines */
  .dashed-v {
    position: absolute;
    right: 220px;
    top: 180px;
    width: 3px;
    height: 400px;
    border-right: 3px dashed rgba(0,0,0,0.15);
  }
  .dashed-h {
    position: absolute;
    right: 60px;
    bottom: 280px;
    width: 160px;
    height: 3px;
    border-top: 3px dashed rgba(0,0,0,0.15);
  }
  .dashed-corner {
    position: absolute;
    right: 220px;
    top: 120px;
    width: 140px;
    height: 60px;
    border-right: 3px dashed rgba(0,0,0,0.15);
    border-top: 3px dashed rgba(0,0,0,0.15);
    border-radius: 0 20px 0 0;
  }

  /* Browser card */
  .browser-card {
    position: absolute;
    right: 60px;
    bottom: 100px;
    background: rgba(230, 240, 250, 0.98);
    border-radius: 16px;
    width: 300px;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0,0,0,0.1);
  }
  .browser-header {
    background: rgba(200, 215, 235, 0.95);
    padding: 14px 18px;
    display: flex;
    gap: 8px;
  }
  .browser-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #B0C0D0;
  }
  .browser-content {
    padding: 20px;
  }
  .browser-line {
    height: 12px;
    background: #C8D4E0;
    border-radius: 6px;
    margin-bottom: 12px;
  }
  .browser-line:last-child { width: 60%; margin-bottom: 0; }

  /* AI badge */
  .ai-badge {
    position: absolute;
    right: 40px;
    bottom: 420px;
    width: 70px;
    height: 70px;
    background: #1A1A1A;
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    color: #5DE8DC;
    font-size: 32px;
  }

  .headline {
    position: absolute;
    top: 180px;
    left: 50px;
    max-width: 520px;
    font-size: 64px;
    font-weight: bold;
    line-height: 1.0;
  }
  .hl { color: #00C9D4; }
</style>
</head><body>
  <img src="${logoBase64}" class="logo" />

  <div class="star star-1"></div>
  <div class="star star-2"></div>
  <div class="star star-3"></div>

  <div class="dashed-corner"></div>
  <div class="dashed-v"></div>
  <div class="dashed-h"></div>

  <div class="wave-card">
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
  </div>

  <div class="ai-badge">✦</div>

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

  <div class="headline"><span class="hl">Voice AI</span> built for fintech stacks</div>
</body></html>`;
}

// ─── Template 3: Dark Phone Mockup (matching banner_43) ─────────────────────

function darkPhoneTemplate(fontBase64: string, logoBase64: string): string {
  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    background: #0A0A0A;
    font-family: 'PP Formula', sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
  }

  .logo {
    position: absolute;
    top: 50px;
    left: 50%;
    transform: translateX(-50%);
    height: 56px;
  }

  .headline {
    position: absolute;
    top: 140px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    width: 90%;
    font-size: 54px;
    font-weight: bold;
    line-height: 1.05;
  }
  .hl { color: #5DE8DC; }

  /* Phone mockup */
  .phone {
    position: absolute;
    bottom: -60px;
    left: 50%;
    transform: translateX(-50%);
    width: 420px;
    height: 640px;
    background: #1A1A1A;
    border-radius: 50px;
    padding: 12px;
    box-shadow: 0 20px 80px rgba(0, 200, 200, 0.15);
  }
  .phone-screen {
    width: 100%;
    height: 100%;
    background: linear-gradient(180deg, #2A2A2A 0%, #1A1A1A 100%);
    border-radius: 40px;
    padding: 20px;
    display: flex;
    flex-direction: column;
  }
  .phone-status {
    display: flex;
    justify-content: space-between;
    font-size: 16px;
    font-family: system-ui, sans-serif;
    color: #888;
    margin-bottom: 20px;
  }
  .phone-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 40px;
  }
  .phone-back {
    width: 50px;
    height: 50px;
    background: #333;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: #888;
  }
  .phone-edit {
    background: #333;
    padding: 12px 24px;
    border-radius: 14px;
    font-size: 18px;
    font-family: system-ui, sans-serif;
    color: #FFF;
  }
  .phone-avatar {
    width: 140px;
    height: 140px;
    background: linear-gradient(135deg, #5DE8DC 0%, #00B4A8 100%);
    border-radius: 50%;
    margin: 0 auto 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 60px;
    color: #1A1A1A;
  }
  .phone-name {
    text-align: center;
    font-size: 32px;
    font-family: system-ui, sans-serif;
    font-weight: 600;
    margin-bottom: 30px;
  }
  .phone-actions {
    display: flex;
    justify-content: center;
    gap: 24px;
    margin-top: auto;
    padding-bottom: 20px;
  }
  .phone-action {
    width: 70px;
    height: 70px;
    background: #333;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
  }
</style>
</head><body>
  <img src="${logoBase64}" class="logo" />

  <div class="headline"><span class="hl">AI voice</span> agents built to scale fintech support</div>

  <div class="phone">
    <div class="phone-screen">
      <div class="phone-status">
        <span>9:41</span>
        <span>📶 🔋</span>
      </div>
      <div class="phone-nav">
        <div class="phone-back"><</div>
        <div class="phone-edit">Edit</div>
      </div>
      <div class="phone-avatar">✦</div>
      <div class="phone-name">Fintech AI</div>
      <div class="phone-actions">
        <div class="phone-action">💬</div>
        <div class="phone-action">📞</div>
        <div class="phone-action">📹</div>
        <div class="phone-action">✉️</div>
      </div>
    </div>
  </div>
</body></html>`;
}

// ─── Template 4: Light with Visual (matching banner_1) ──────────────────────

function lightVisualTemplate(fontBase64: string, logoBase64: string, visualBase64: string): string {
  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    background: linear-gradient(160deg, #D8F0EE 0%, #B8E8E4 100%);
    font-family: 'PP Formula', sans-serif;
    color: #1A1A1A;
    position: relative;
    overflow: hidden;
  }

  .logo {
    position: absolute;
    top: 50px;
    left: 50px;
    height: 56px;
  }

  .headline {
    position: absolute;
    top: 160px;
    left: 50px;
    max-width: 600px;
    font-size: 64px;
    font-weight: bold;
    line-height: 1.0;
  }

  .subtext {
    position: absolute;
    top: 400px;
    left: 50px;
    max-width: 500px;
    font-size: 24px;
    font-family: system-ui, sans-serif;
    line-height: 1.5;
    color: #333;
  }

  .cta {
    position: absolute;
    top: 540px;
    left: 50px;
    background: #FFFFFF;
    color: #1A1A1A;
    padding: 20px 36px;
    border-radius: 50px;
    font-size: 20px;
    font-family: system-ui, sans-serif;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0,0,0,0.1);
  }

  /* Visual fills bottom right */
  .visual {
    position: absolute;
    bottom: -50px;
    right: -50px;
    width: 700px;
    height: 600px;
    object-fit: contain;
  }
</style>
</head><body>
  <img src="${logoBase64}" class="logo" />

  <div class="headline">AI agents that speak any language</div>
  <div class="subtext">Deploy multilingual voice AI in minutes. Support customers in 30+ languages with natural conversations.</div>
  <div class="cta">Try Telnyx Free ></div>

  <img src="${visualBase64}" class="visual" />
</body></html>`;
}

// ─── Template 5: Dark Composed Visual ────────────────────────────────────────

function darkVisualTemplate(fontBase64: string, logoBase64: string, visualBase64: string): string {
  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    background: #0A0A0A;
    font-family: 'PP Formula', sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
  }

  .logo {
    position: absolute;
    top: 50px;
    left: 50px;
    height: 56px;
    z-index: 10;
  }

  /* Glow */
  .glow {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    height: 80%;
    background: radial-gradient(ellipse at center 30%, rgba(0, 200, 200, 0.2) 0%, transparent 60%);
  }

  /* Visual fills most of canvas */
  .visual {
    position: absolute;
    top: 50px;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    height: 65%;
    object-fit: contain;
  }

  /* Dark gradient at bottom */
  .bottom-fade {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 400px;
    background: linear-gradient(180deg, transparent 0%, #0A0A0A 50%);
  }

  .headline {
    position: absolute;
    bottom: 130px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    width: 90%;
    font-size: 52px;
    font-weight: bold;
    line-height: 1.05;
    z-index: 5;
  }
  .hl { color: #5DE8DC; }

  .subtext {
    position: absolute;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 20px;
    font-family: system-ui, sans-serif;
    color: rgba(255,255,255,0.7);
    z-index: 5;
  }
</style>
</head><body>
  <div class="glow"></div>
  <img src="${logoBase64}" class="logo" />
  <img src="${visualBase64}" class="visual" />
  <div class="bottom-fade"></div>
  <div class="headline"><span class="hl">Warm transfers</span> that feel seamless</div>
  <div class="subtext">AI-powered handoffs to live agents in seconds</div>
</body></html>`;
}

// ─── Template 6: Photo Background ────────────────────────────────────────────

function photoTemplate(fontBase64: string, logoBase64: string, photoBase64: string): string {
  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE}px;
    height: ${SIZE}px;
    font-family: 'PP Formula', sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
  }

  .photo {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: grayscale(100%) brightness(0.4);
  }

  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%);
  }

  .logo {
    position: absolute;
    top: 50px;
    left: 50%;
    transform: translateX(-50%);
    height: 56px;
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
    font-size: 56px;
    font-weight: bold;
    line-height: 1.05;
    margin-bottom: 24px;
  }
  .hl { color: #5DE8DC; }

  .subtext {
    font-size: 22px;
    font-family: system-ui, sans-serif;
    color: rgba(255,255,255,0.85);
    margin-bottom: 32px;
  }

  .cta {
    display: inline-block;
    background: #00D4CC;
    color: #0A0A0A;
    padding: 20px 44px;
    border-radius: 50px;
    font-size: 20px;
    font-family: system-ui, sans-serif;
    font-weight: 600;
  }
</style>
</head><body>
  <img src="${photoBase64}" class="photo" />
  <div class="overlay"></div>
  <img src="${logoBase64}" class="logo" />
  <div class="content">
    <div class="headline"><span class="hl">Voice AI</span> for regulated fintech flows</div>
    <div class="subtext">Secure, compliant, production-ready.</div>
    <div class="cta">See How It Works ></div>
  </div>
</body></html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎯 Square 1080x1080 - Matching Reference Designs\n');

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `square-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Load assets
  const ppFont = await loadFontBase64(PP_FORMULA_FONT);
  const whiteLogo = await imageToBase64(path.join(process.cwd(), await selectLogo('#000000')));
  const blackLogo = await imageToBase64(path.join(process.cwd(), await selectLogo('#FFFFFF')));
  const financeChat = await imageToBase64(ASSETS.composed.financeChat);
  const warmTransfers = await imageToBase64(ASSETS.composed.warmTransfers);
  const financePhoto = await imageToBase64(ASSETS.photos.finance);

  console.log('   Font:', ppFont ? '✓' : '✗');
  console.log('   Logos:', whiteLogo ? '✓' : '✗', blackLogo ? '✓' : '✗');
  console.log('   Assets:', financeChat ? '✓' : '✗', warmTransfers ? '✓' : '✗');
  console.log('');

  // Generate all templates
  await renderAndSave(darkPillsTemplate(ppFont, whiteLogo), path.join(outputDir, '01-dark-pills.png'));
  console.log('   ✓ 01-dark-pills.png');

  await renderAndSave(lightStarsTemplate(ppFont, blackLogo), path.join(outputDir, '02-light-stars.png'));
  console.log('   ✓ 02-light-stars.png');

  await renderAndSave(darkPhoneTemplate(ppFont, whiteLogo), path.join(outputDir, '03-dark-phone.png'));
  console.log('   ✓ 03-dark-phone.png');

  await renderAndSave(lightVisualTemplate(ppFont, blackLogo, financeChat), path.join(outputDir, '04-light-visual.png'));
  console.log('   ✓ 04-light-visual.png');

  await renderAndSave(darkVisualTemplate(ppFont, whiteLogo, warmTransfers), path.join(outputDir, '05-dark-visual.png'));
  console.log('   ✓ 05-dark-visual.png');

  await renderAndSave(photoTemplate(ppFont, whiteLogo, financePhoto), path.join(outputDir, '06-photo.png'));
  console.log('   ✓ 06-photo.png');

  console.log(`\n✅ Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
