#!/usr/bin/env tsx
/**
 * Nail ONE template - banner_16 style using ACTUAL illustrated assets
 * NOT drawing shapes with CSS - using real brand assets
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const BRAND_ASSETS = '/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/brand-assets';
const ASSET_LIBRARY = '/Users/azizalsinafi/Documents/Asset_Library';

async function loadFontAsBase64(fontPath: string): Promise<string> {
  const buffer = await fs.readFile(fontPath);
  return buffer.toString('base64');
}

async function loadImageAsBase64(imagePath: string): Promise<string> {
  const buffer = await fs.readFile(imagePath);
  const ext = path.extname(imagePath).slice(1).toLowerCase();
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext;
  return `data:image/${mimeType};base64,${buffer.toString('base64')}`;
}

function generateHTML(
  ppFormulaBase64: string,
  interBase64: string,
  logoBase64: string,
  archesAssetBase64: string
): string {
  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${ppFormulaBase64}) format('truetype');
    font-weight: 800;
  }
  @font-face {
    font-family: 'Inter';
    src: url(data:font/truetype;base64,${interBase64}) format('truetype');
    font-weight: 400;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1080px;
    height: 1080px;
    background: #0A0A0A;
    font-family: 'Inter', system-ui, sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
  }

  /* === ILLUSTRATED ASSET (arches + star) === */
  .arches-asset {
    position: absolute;
    right: -50px;
    top: 100px;
    width: 700px;
    height: auto;
    opacity: 1;
  }

  /* === LOGO (top left) === */
  .logo {
    position: absolute;
    top: 48px;
    left: 56px;
    height: 40px;
  }

  /* === HEADLINE (left side) === */
  .headline-container {
    position: absolute;
    top: 180px;
    left: 56px;
    max-width: 550px;
  }

  .headline {
    font-family: 'PP Formula', sans-serif;
    font-size: 64px;
    font-weight: 800;
    line-height: 1.0;
    color: #FFFFFF;
  }
  .headline .highlight {
    color: #5DE8DC;
    font-style: italic;
  }

  /* === WAVEFORM BADGE === */
  .waveform-badge {
    position: absolute;
    left: 56px;
    bottom: 340px;
    background: #1A1A1A;
    border-radius: 16px;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  }
  .wave-bar {
    width: 6px;
    background: #FFFFFF;
    border-radius: 3px;
  }
  .wave-bar:nth-child(1) { height: 14px; }
  .wave-bar:nth-child(2) { height: 26px; }
  .wave-bar:nth-child(3) { height: 18px; }
  .wave-bar:nth-child(4) { height: 30px; }
  .wave-bar:nth-child(5) { height: 16px; }

  /* === CODE CARD === */
  .code-card {
    position: absolute;
    right: 120px;
    bottom: 200px;
    background: #FFFFFF;
    border-radius: 14px;
    padding: 16px 20px;
    width: 300px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
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
    background: #DDD;
  }
  .code-text {
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    font-size: 13px;
    color: #333;
    line-height: 1.5;
  }

  /* === ASTERISK BADGE (using brand turbine icon style) === */
  .asterisk-badge {
    position: absolute;
    right: 80px;
    bottom: 360px;
    width: 52px;
    height: 52px;
    background: #1A1A1A;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  }
  .asterisk-badge svg {
    width: 26px;
    height: 26px;
    fill: #FFFFFF;
  }

  /* === DASHED CONNECTORS === */
  .dashed-h {
    position: absolute;
    left: 180px;
    bottom: 280px;
    width: 200px;
    border-bottom: 2px dashed rgba(255,255,255,0.25);
  }
  .dashed-v {
    position: absolute;
    right: 104px;
    bottom: 420px;
    height: 60px;
    border-right: 2px dashed rgba(255,255,255,0.25);
  }

  /* === CTA === */
  .cta {
    position: absolute;
    bottom: 56px;
    left: 56px;
    font-family: 'PP Formula', sans-serif;
    font-size: 20px;
    font-weight: 600;
    color: #FFFFFF;
  }

</style>
</head>
<body>
  <!-- Logo -->
  <img src="${logoBase64}" class="logo" />

  <!-- Headline -->
  <div class="headline-container">
    <div class="headline">
      Get <span class="highlight">predictable<br>real-time</span> AI<br>performance<br>at enterprise<br>scale
    </div>
  </div>

  <!-- ACTUAL illustrated asset (arches + star) -->
  <img src="${archesAssetBase64}" class="arches-asset" />

  <!-- Waveform badge -->
  <div class="waveform-badge">
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
  </div>

  <!-- Dashed connectors -->
  <div class="dashed-h"></div>
  <div class="dashed-v"></div>

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

  <!-- Asterisk badge (turbine style) -->
  <div class="asterisk-badge">
    <svg viewBox="0 0 24 24">
      <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>
    </svg>
  </div>

  <!-- CTA -->
  <div class="cta">Try Telnyx free ></div>
</body>
</html>`;
}

async function main() {
  console.log('\n🎯 Generating banner (using actual illustrated assets)...\n');

  // Load fonts
  const ppFormulaPath = path.join(BRAND_ASSETS, 'fonts/PP Formula - Extrabold v2.0/PPFormula-Extrabold.ttf');
  const interPath = path.join(BRAND_ASSETS, 'fonts/static/Inter-Regular.ttf');
  const ppFormulaBase64 = await loadFontAsBase64(ppFormulaPath);
  const interBase64 = await loadFontAsBase64(interPath);

  // Load logo (green for dark bg)
  const logoPath = path.join(ASSET_LIBRARY, '_NEW_AdGen_Library/logo/green/telnyx-logo-wordmark-green.png');
  const logoBase64 = await loadImageAsBase64(logoPath);

  // Load the ACTUAL illustrated arches asset
  const archesPath = path.join(ASSET_LIBRARY, '_NEW_AdGen_Library/backgrounds/voice-ai/background_voice-ai-agent-6.png');
  const archesBase64 = await loadImageAsBase64(archesPath);

  // Generate HTML
  const html = generateHTML(ppFormulaBase64, interBase64, logoBase64, archesBase64);

  // Create output directory
  const outputDir = path.join(process.cwd(), 'output', 'creatives', `nail-v3-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Save HTML
  const htmlPath = path.join(outputDir, 'banner.html');
  await fs.writeFile(htmlPath, html);

  // Render with Puppeteer
  const outputPath = path.join(outputDir, 'banner-with-asset.png');

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

  console.log(`✅ Generated: ${outputPath}`);
  console.log(`📄 HTML: ${htmlPath}\n`);

  // Open folder
  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
