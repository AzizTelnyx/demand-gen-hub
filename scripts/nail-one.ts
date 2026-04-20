#!/usr/bin/env ts-node
/**
 * Nail ONE template - exact replica of banner_16png reference
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { selectLogo } from '../src/lib/logo-selector';

const BRAND_ASSETS = '/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/brand-assets';
const PP_FORMULA_FONT = `${BRAND_ASSETS}/fonts/PP Formula - Extrabold v2.0/PPFormula-Extrabold.ttf`;

async function imageToBase64(imagePath: string): Promise<string> {
  const imageBuffer = await fs.readFile(imagePath);
  const ext = path.extname(imagePath).slice(1).toLowerCase();
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext;
  return `data:image/${mimeType};base64,${imageBuffer.toString('base64')}`;
}

function generateHTML(fontBase64: string, logoBase64: string): string {
  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1080px;
    height: 1080px;
    background: #0A0A0A;
    font-family: 'PP Formula', sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
  }

  /* Logo - top left */
  .logo {
    position: absolute;
    top: 50px;
    left: 50px;
    height: 56px;
  }

  /* Headline - left side, large */
  .headline {
    position: absolute;
    top: 160px;
    left: 50px;
    font-size: 68px;
    font-weight: bold;
    line-height: 1.0;
    max-width: 580px;
  }
  .hl {
    color: #5DE8DC;
    font-style: italic;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ARCHES - 6 layered rounded rectangles from right side
     Back layer (dark teal) to front layer (bright cyan)
     ═══════════════════════════════════════════════════════════════════════════ */
  .arch {
    position: absolute;
    border-radius: 999px;
  }

  /* Back arches - dark teal */
  .arch-1 {
    right: -30px;
    top: 60px;
    width: 100px;
    height: 720px;
    background: linear-gradient(180deg, #0D4A4A 0%, #0A3D3D 100%);
  }
  .arch-2 {
    right: 60px;
    top: 100px;
    width: 90px;
    height: 660px;
    background: linear-gradient(180deg, #0D5555 0%, #0A4545 100%);
  }
  .arch-3 {
    right: 140px;
    top: 140px;
    width: 80px;
    height: 600px;
    background: linear-gradient(180deg, #0E6060 0%, #0B5050 100%);
  }
  .arch-4 {
    right: 210px;
    top: 180px;
    width: 75px;
    height: 540px;
    background: linear-gradient(180deg, #106A6A 0%, #0D5858 100%);
  }

  /* Front arches - bright cyan */
  .arch-5 {
    right: 280px;
    top: 280px;
    width: 110px;
    height: 580px;
    background: linear-gradient(180deg, #00E5E0 0%, #00C4BE 100%);
  }
  .arch-6 {
    right: 380px;
    top: 340px;
    width: 100px;
    height: 520px;
    background: linear-gradient(180deg, #00D8D4 0%, #00B8B4 100%);
    opacity: 0.9;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     STARS - 4-pointed, gradient filled
     ═══════════════════════════════════════════════════════════════════════════ */
  .star {
    position: absolute;
    background: linear-gradient(180deg, #00F0F0 0%, #00D4CC 100%);
    clip-path: polygon(50% 0%, 61% 35%, 100% 50%, 61% 65%, 50% 100%, 39% 65%, 0% 50%, 39% 35%);
  }
  .star-large {
    width: 220px;
    height: 220px;
    right: 320px;
    top: 260px;
  }
  .star-small {
    width: 110px;
    height: 110px;
    right: 180px;
    top: 480px;
    opacity: 0.85;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     WAVEFORM BADGE - left side, black rounded rectangle with white bars
     ═══════════════════════════════════════════════════════════════════════════ */
  .waveform-badge {
    position: absolute;
    left: 60px;
    bottom: 320px;
    background: #1A1A1A;
    border-radius: 18px;
    padding: 18px 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  }
  .wave-bar {
    width: 8px;
    background: #FFFFFF;
    border-radius: 4px;
  }
  .wave-bar:nth-child(1) { height: 18px; }
  .wave-bar:nth-child(2) { height: 32px; }
  .wave-bar:nth-child(3) { height: 24px; }
  .wave-bar:nth-child(4) { height: 38px; }
  .wave-bar:nth-child(5) { height: 20px; }

  /* ═══════════════════════════════════════════════════════════════════════════
     CODE CARD - white rounded card with code snippet
     ═══════════════════════════════════════════════════════════════════════════ */
  .code-card {
    position: absolute;
    right: 100px;
    bottom: 180px;
    background: #FFFFFF;
    border-radius: 16px;
    padding: 18px 22px;
    width: 320px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  }
  .code-dots {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }
  .code-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #DDD;
  }
  .code-text {
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    font-size: 14px;
    color: #333;
    line-height: 1.6;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ASTERISK BADGE - black rounded square with white asterisk icon
     ═══════════════════════════════════════════════════════════════════════════ */
  .asterisk-badge {
    position: absolute;
    right: 60px;
    bottom: 340px;
    width: 56px;
    height: 56px;
    background: #1A1A1A;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  }
  .asterisk-badge svg {
    width: 28px;
    height: 28px;
    fill: #FFFFFF;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     DASHED CONNECTOR LINE
     ═══════════════════════════════════════════════════════════════════════════ */
  .dashed-line {
    position: absolute;
    left: 180px;
    bottom: 220px;
    width: 280px;
    height: 140px;
    border: 2px dashed rgba(255,255,255,0.3);
    border-radius: 0 0 30px 0;
    border-top: none;
    border-left: none;
  }
  .dashed-line-v {
    position: absolute;
    right: 86px;
    bottom: 400px;
    width: 2px;
    height: 80px;
    border-right: 2px dashed rgba(255,255,255,0.3);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CTA - bottom left
     ═══════════════════════════════════════════════════════════════════════════ */
  .cta {
    position: absolute;
    bottom: 50px;
    left: 50px;
    font-size: 22px;
    font-family: system-ui, -apple-system, sans-serif;
  }
</style>
</head>
<body>
  <!-- Logo -->
  <img src="${logoBase64}" class="logo" />

  <!-- Headline -->
  <div class="headline">
    Get <span class="hl">predictable<br>real-time</span> AI<br>performance<br>at enterprise<br>scale
  </div>

  <!-- Arches - back to front -->
  <div class="arch arch-1"></div>
  <div class="arch arch-2"></div>
  <div class="arch arch-3"></div>
  <div class="arch arch-4"></div>
  <div class="arch arch-5"></div>
  <div class="arch arch-6"></div>

  <!-- Stars -->
  <div class="star star-large"></div>
  <div class="star star-small"></div>

  <!-- Waveform badge -->
  <div class="waveform-badge">
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
  </div>

  <!-- Dashed connector -->
  <div class="dashed-line"></div>
  <div class="dashed-line-v"></div>

  <!-- Code card -->
  <div class="code-card">
    <div class="code-dots">
      <div class="code-dot"></div>
      <div class="code-dot"></div>
      <div class="code-dot"></div>
    </div>
    <div class="code-text">
      curl -L 'https://api.telnyx.com/<br>
      v2/calls/CALL_CONTROL_ID/<br>
      actions/ai_assistant_start' \\
    </div>
  </div>

  <!-- Asterisk badge -->
  <div class="asterisk-badge">
    <svg viewBox="0 0 24 24">
      <path d="M12 2C13.1 2 14 2.9 14 4V9.5L18.5 6.8C19.5 6.2 20.7 6.5 21.3 7.5C21.9 8.5 21.6 9.7 20.6 10.3L16 13L20.6 15.7C21.6 16.3 21.9 17.5 21.3 18.5C20.7 19.5 19.5 19.8 18.5 19.2L14 16.5V22C14 23.1 13.1 24 12 24C10.9 24 10 23.1 10 22V16.5L5.5 19.2C4.5 19.8 3.3 19.5 2.7 18.5C2.1 17.5 2.4 16.3 3.4 15.7L8 13L3.4 10.3C2.4 9.7 2.1 8.5 2.7 7.5C3.3 6.5 4.5 6.2 5.5 6.8L10 9.5V4C10 2.9 10.9 2 12 2Z"/>
    </svg>
  </div>

  <!-- CTA -->
  <div class="cta">Try Telnyx free ></div>
</body>
</html>`;
}

async function main() {
  console.log('\n🎯 Nailing ONE template...\n');

  // Load font
  const fontBuffer = await fs.readFile(PP_FORMULA_FONT);
  const fontBase64 = fontBuffer.toString('base64');

  // Load logo
  const logoPath = await selectLogo('#000000');
  const logoBase64 = await imageToBase64(path.join(process.cwd(), logoPath));

  // Generate HTML
  const html = generateHTML(fontBase64, logoBase64);

  // Create output directory
  const outputDir = path.join(process.cwd(), 'output', 'creatives', `nail-one-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Render
  const outputPath = path.join(outputDir, 'banner-reference-match.png');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await browser.close();
  }

  console.log(`✅ Generated: ${outputPath}\n`);

  // Open folder
  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
