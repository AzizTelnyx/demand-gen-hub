#!/usr/bin/env tsx
/**
 * Nail ONE template - Match banner-1 (metric cards) style exactly
 * This is achievable with HTML/CSS because it's typography + UI cards
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const BRAND_ASSETS = '/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/brand-assets';

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

interface BannerConfig {
  // Content
  tagline: string;
  headline: string;
  highlightWords: string[];
  subtext: string;
  cta: string;
  badge: string;

  // Metrics (4 cards)
  metrics: Array<{
    label: string;
    sublabel: string;
    value: string;
  }>;
}

function generateHTML(
  ppFormulaBase64: string,
  interBase64: string,
  logoBase64: string,
  config: BannerConfig
): string {
  // Highlight words in headline
  let headlineHTML = config.headline;
  for (const word of config.highlightWords) {
    headlineHTML = headlineHTML.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  }

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
    background: #0D1117;
    font-family: 'Inter', system-ui, sans-serif;
    color: #FFFFFF;
    position: relative;
    overflow: hidden;
  }

  /* Subtle radial glow (like reference) */
  body::before {
    content: '';
    position: absolute;
    top: 50%;
    right: 15%;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(0,227,170,0.08) 0%, transparent 70%);
    transform: translateY(-50%);
    pointer-events: none;
  }

  /* === BADGE (top right) === */
  .badge {
    position: absolute;
    top: 48px;
    right: 48px;
    background: transparent;
    border: 1px solid #00E3AA;
    border-radius: 24px;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.5px;
    color: #00E3AA;
  }

  /* === LEFT COLUMN (text) === */
  .left-column {
    position: absolute;
    left: 56px;
    top: 120px;
    width: 480px;
  }

  .tagline {
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 1.5px;
    color: #FFFFFF;
    margin-bottom: 24px;
    text-transform: uppercase;
  }

  .headline {
    font-family: 'PP Formula', sans-serif;
    font-size: 56px;
    font-weight: 800;
    line-height: 1.05;
    color: #FFFFFF;
    margin-bottom: 28px;
  }
  .headline .highlight {
    color: #00E3AA;
  }

  .subtext {
    font-size: 18px;
    line-height: 1.6;
    color: rgba(255,255,255,0.75);
    max-width: 400px;
  }

  /* === LOGO (bottom left) === */
  .logo {
    position: absolute;
    bottom: 48px;
    left: 56px;
    height: 36px;
  }

  /* === RIGHT COLUMN (metric cards) === */
  .right-column {
    position: absolute;
    right: 48px;
    top: 120px;
    width: 420px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .metric-card {
    background: linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(0,227,170,0.05) 100%);
    border: 1px solid rgba(0,227,170,0.15);
    border-right: 2px solid rgba(0,227,170,0.4);
    border-radius: 12px;
    padding: 20px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
  }

  /* Subtle glow on right edge */
  .metric-card::after {
    content: '';
    position: absolute;
    right: 0;
    top: 10%;
    height: 80%;
    width: 3px;
    background: linear-gradient(180deg, transparent, rgba(0,227,170,0.6), transparent);
    border-radius: 2px;
  }

  .metric-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .metric-label {
    font-size: 15px;
    font-weight: 500;
    color: #FFFFFF;
  }

  .metric-sublabel {
    font-size: 13px;
    color: rgba(255,255,255,0.5);
  }

  .metric-value {
    font-family: 'PP Formula', sans-serif;
    font-size: 28px;
    font-weight: 800;
    color: #00E3AA;
  }

  /* === CTA (bottom left, above logo) === */
  .cta {
    position: absolute;
    bottom: 110px;
    left: 56px;
    font-family: 'PP Formula', sans-serif;
    font-size: 18px;
    font-weight: 600;
    color: #FFFFFF;
  }

</style>
</head>
<body>
  <!-- Badge -->
  <div class="badge">${config.badge}</div>

  <!-- Left column -->
  <div class="left-column">
    <div class="tagline">${config.tagline}</div>
    <div class="headline">${headlineHTML}</div>
    <div class="subtext">${config.subtext}</div>
  </div>

  <!-- Right column - metric cards -->
  <div class="right-column">
    ${config.metrics.map(m => `
    <div class="metric-card">
      <div class="metric-left">
        <div class="metric-label">${m.label}</div>
        <div class="metric-sublabel">${m.sublabel}</div>
      </div>
      <div class="metric-value">${m.value}</div>
    </div>
    `).join('')}
  </div>

  <!-- CTA -->
  <div class="cta">${config.cta}</div>

  <!-- Logo -->
  <img src="${logoBase64}" class="logo" />
</body>
</html>`;
}

async function main() {
  console.log('\n🎯 Generating banner (metric-cards style)...\n');

  // Load fonts
  const ppFormulaPath = path.join(BRAND_ASSETS, 'fonts/PP Formula - Extrabold v2.0/PPFormula-Extrabold.ttf');
  const interPath = path.join(BRAND_ASSETS, 'fonts/static/Inter-Regular.ttf');
  const ppFormulaBase64 = await loadFontAsBase64(ppFormulaPath);
  const interBase64 = await loadFontAsBase64(interPath);

  // Load logo (green for dark bg)
  const logoPath = '/Users/azizalsinafi/Documents/Asset_Library/_NEW_AdGen_Library/logo/green/telnyx-logo-wordmark-green.png';
  const logoBase64 = await loadImageAsBase64(logoPath);

  // Config matching banner-1 style (Voice AI infrastructure)
  const config: BannerConfig = {
    tagline: 'VOICE AI AGENTS',
    headline: 'Your voice AI demo works. Production won\'t.',
    highlightWords: ['Production won\'t.'],
    subtext: 'Multi-vendor stacks add latency that breaks real conversations. We own the network, the telephony, and the GPUs.',
    cta: 'Try Telnyx free >',
    badge: 'VOICE AI INFRASTRUCTURE',
    metrics: [
      { label: 'Response latency', sublabel: 'Telnyx Voice AI', value: '<500ms' },
      { label: 'Typical multi-vendor stack', sublabel: 'Twilio + ElevenLabs + STT', value: '1.5-3s' },
      { label: 'Infrastructure', sublabel: 'Network + Telephony + GPUs', value: 'Full stack' },
      { label: 'Global PoPs', sublabel: 'Co-located with edge GPUs', value: '30+' },
    ],
  };

  // Generate HTML
  const html = generateHTML(ppFormulaBase64, interBase64, logoBase64, config);

  // Create output directory
  const outputDir = path.join(process.cwd(), 'output', 'creatives', `nail-v2-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Save HTML for debugging
  const htmlPath = path.join(outputDir, 'banner.html');
  await fs.writeFile(htmlPath, html);

  // Render with Puppeteer
  const outputPath = path.join(outputDir, 'banner-metric-cards.png');

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
