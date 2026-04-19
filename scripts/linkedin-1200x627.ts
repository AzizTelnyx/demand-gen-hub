#!/usr/bin/env ts-node
/**
 * LinkedIn 1200x627 Banner Generator
 *
 * Matches actual Telnyx LinkedIn ad patterns exactly.
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { selectLogo } from '../src/lib/logo-selector';

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const fullPath = imagePath.startsWith('/') ? imagePath : path.join(process.cwd(), imagePath);
    const imageBuffer = await fs.readFile(fullPath);
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

/* ─── Dark Mode Template ─────────────────────────────────────────────────────
 * Based on: banner_2_v2, banner_33, Unfiltered
 *
 * - Black background
 * - White Telnyx logo TOP LEFT
 * - Large headline with "Voice AI" in TEAL (#00E3AA)
 * - Subtext in white/gray
 * - Text CTA at bottom "Learn more >"
 * - Decorative: teal gradient shapes, UI pills, or 3D elements
 */

function darkModeTemplate(
  content: {
    headline: string;        // Full headline text
    highlightWords: string[]; // Words to highlight in teal
    subtext?: string;
    cta?: string;
  },
  assets: { logoBase64: string },
  width: number = 1200,
  height: number = 627
): string {
  // Process headline - wrap highlighted words in span
  let processedHeadline = content.headline;
  content.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  });

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
    background: #000000;
    color: #FFFFFF;
  }

  /* Decorative gradient shapes - subtle teal arches like banner_2_v2 */
  .deco-arch {
    position: absolute;
    border-radius: 999px;
    opacity: 0.4;
  }
  .deco-arch-1 {
    right: -50px;
    top: 80px;
    width: 180px;
    height: 350px;
    background: linear-gradient(180deg, #0D4A4A 0%, transparent 100%);
  }
  .deco-arch-2 {
    right: 80px;
    top: 60px;
    width: 160px;
    height: 380px;
    background: linear-gradient(180deg, #0D4A4A 0%, transparent 100%);
  }
  .deco-arch-3 {
    right: 200px;
    top: 100px;
    width: 140px;
    height: 320px;
    background: linear-gradient(180deg, #0D4A4A 0%, transparent 100%);
  }

  /* Logo - top left */
  .logo {
    position: absolute;
    top: 48px;
    left: 64px;
    height: 32px;
  }

  /* Main content */
  .content {
    position: absolute;
    top: 50%;
    left: 64px;
    transform: translateY(-50%);
    max-width: 65%;
    z-index: 2;
  }

  .headline {
    font-size: 64px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -1px;
    margin-bottom: 24px;
  }
  .headline .highlight {
    color: #00E3AA;
  }

  .subtext {
    font-size: 22px;
    font-weight: 400;
    color: rgba(255,255,255,0.8);
    line-height: 1.5;
    margin-bottom: 32px;
    max-width: 80%;
  }

  .cta {
    font-size: 18px;
    font-weight: 500;
    color: #FFFFFF;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .cta::after {
    content: '>';
    font-size: 16px;
  }

  /* UI Pills - stacked vertically like banner_2_v2 */
  .ui-stack {
    position: absolute;
    right: 120px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    z-index: 2;
  }

  .ui-pill {
    background: linear-gradient(135deg, #C8F7E8 0%, #A8E6D8 100%);
    color: #1A1A1A;
    padding: 16px 32px;
    border-radius: 40px;
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 4px 20px rgba(0, 227, 170, 0.3);
  }
  .ui-pill.primary {
    background: linear-gradient(135deg, #00E3AA 0%, #00C9A7 100%);
    padding: 20px 40px;
    font-size: 24px;
  }
  .ui-pill .icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Connector line */
  .connector {
    width: 2px;
    height: 24px;
    background: rgba(255,255,255,0.3);
  }
</style></head><body>
  <!-- Decorative arches -->
  <div class="deco-arch deco-arch-1"></div>
  <div class="deco-arch deco-arch-2"></div>
  <div class="deco-arch deco-arch-3"></div>

  <!-- Logo -->
  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />

  <!-- Main content -->
  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${content.subtext ? `<div class="subtext">${content.subtext}</div>` : ''}
    ${content.cta ? `<div class="cta">${content.cta}</div>` : ''}
  </div>

  <!-- UI Stack visualization -->
  <div class="ui-stack">
    <div class="ui-pill primary">
      <span class="icon">✦</span>
      <span>Ai</span>
    </div>
    <div class="connector"></div>
    <div class="ui-pill">
      <span class="icon">🌐</span>
      <span>Network</span>
    </div>
    <div class="connector"></div>
    <div class="ui-pill">
      <span class="icon">📞</span>
      <span>Numbers</span>
    </div>
  </div>
</body></html>`;
}

/* ─── Light Mode Template ────────────────────────────────────────────────────
 * Based on: banner_1, banner_36
 *
 * - Light cream/mint background
 * - Black Telnyx logo TOP LEFT
 * - Large headline with "Voice AI" in TEAL
 * - Decorative 4-point stars (teal gradient)
 * - UI cards, dashed connection lines
 * - White pill CTA
 */

function lightModeTemplate(
  content: {
    headline: string;
    highlightWords: string[];
    subtext?: string;
    cta?: string;
  },
  assets: { logoBase64: string },
  width: number = 1200,
  height: number = 627
): string {
  let processedHeadline = content.headline;
  content.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  });

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
    background: #F5F5F0;
    color: #1A1A1A;
  }

  /* 4-point star decoration */
  .star {
    position: absolute;
    width: 200px;
    height: 200px;
    background: linear-gradient(135deg, #00E3AA 0%, #00C9D4 100%);
    clip-path: polygon(50% 0%, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0% 50%, 40% 40%);
  }
  .star-1 {
    left: 60px;
    bottom: 40px;
    width: 280px;
    height: 280px;
    opacity: 0.9;
  }
  .star-2 {
    right: 180px;
    top: 80px;
    width: 120px;
    height: 120px;
    opacity: 0.8;
  }

  /* Logo */
  .logo {
    position: absolute;
    top: 48px;
    left: 64px;
    height: 32px;
  }

  /* Content */
  .content {
    position: absolute;
    top: 140px;
    left: 64px;
    max-width: 50%;
    z-index: 2;
  }

  .headline {
    font-size: 56px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -1px;
    margin-bottom: 0;
  }
  .headline .highlight {
    color: #00D4AA;
  }

  /* UI Card */
  .ui-card {
    position: absolute;
    right: 80px;
    bottom: 100px;
    background: rgba(220, 235, 245, 0.8);
    border-radius: 12px;
    padding: 20px 28px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  }
  .ui-card-dots {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }
  .ui-card-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #CBD5E0;
  }
  .ui-card-lines {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ui-card-line {
    height: 8px;
    background: #CBD5E0;
    border-radius: 4px;
  }
  .ui-card-line:nth-child(1) { width: 180px; }
  .ui-card-line:nth-child(2) { width: 140px; }

  /* Sound wave icon */
  .wave-icon {
    position: absolute;
    right: 80px;
    top: 60px;
    background: rgba(220, 235, 245, 0.9);
    border-radius: 12px;
    padding: 16px 20px;
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .wave-bar {
    width: 6px;
    background: #1A1A1A;
    border-radius: 3px;
  }
  .wave-bar:nth-child(1) { height: 16px; }
  .wave-bar:nth-child(2) { height: 28px; }
  .wave-bar:nth-child(3) { height: 20px; }
  .wave-bar:nth-child(4) { height: 32px; }
  .wave-bar:nth-child(5) { height: 24px; }

  /* Dashed connection line */
  .dashed-line {
    position: absolute;
    border: 2px dashed rgba(0,0,0,0.15);
    border-radius: 20px;
  }
  .dashed-line-1 {
    top: 100px;
    right: 200px;
    width: 120px;
    height: 80px;
    border-left: none;
    border-bottom: none;
  }

  /* CTA */
  .cta {
    position: absolute;
    left: 64px;
    bottom: 60px;
    background: #FFFFFF;
    color: #1A1A1A;
    font-size: 16px;
    font-weight: 600;
    padding: 14px 28px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .cta::after {
    content: '>';
  }
</style></head><body>
  <!-- Stars -->
  <div class="star star-1"></div>
  <div class="star star-2"></div>

  <!-- Dashed lines -->
  <div class="dashed-line dashed-line-1"></div>

  <!-- Logo -->
  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />

  <!-- Wave icon -->
  <div class="wave-icon">
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
  </div>

  <!-- UI Card -->
  <div class="ui-card">
    <div class="ui-card-dots">
      <div class="ui-card-dot"></div>
      <div class="ui-card-dot"></div>
      <div class="ui-card-dot"></div>
    </div>
    <div class="ui-card-lines">
      <div class="ui-card-line"></div>
      <div class="ui-card-line"></div>
    </div>
  </div>

  <!-- Content -->
  <div class="content">
    <div class="headline">${processedHeadline}</div>
  </div>

  <!-- CTA -->
  ${content.cta ? `<div class="cta">${content.cta}</div>` : ''}
</body></html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎨 LinkedIn 1200x627 Banner Generator\n');

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `linkedin-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Load logos
  const whiteLogoPath = await selectLogo('#000000'); // White logo for dark bg
  const blackLogoPath = await selectLogo('#FFFFFF'); // Black logo for light bg
  const whiteLogo = await imageToBase64(path.join(process.cwd(), whiteLogoPath));
  const blackLogo = await imageToBase64(path.join(process.cwd(), blackLogoPath));

  console.log(`   White logo: ${whiteLogo ? '✓' : '✗'}`);
  console.log(`   Black logo: ${blackLogo ? '✓' : '✗'}`);

  // Generate Dark Mode - Builder focused
  const darkBuilder = darkModeTemplate(
    {
      headline: 'Reliable Voice AI starts with a unified infrastructure',
      highlightWords: ['Voice AI'],
      cta: 'Learn more',
    },
    { logoBase64: whiteLogo }
  );
  await convertHTMLtoPNG(darkBuilder, path.join(outputDir, 'dark-builder.png'), 1200, 627);
  console.log('   ✓ dark-builder.png');

  // Generate Light Mode - Fintech focused
  const lightFintech = lightModeTemplate(
    {
      headline: 'Voice AI built for fintech stacks',
      highlightWords: ['Voice AI'],
      cta: 'Try Telnyx Free',
    },
    { logoBase64: blackLogo }
  );
  await convertHTMLtoPNG(lightFintech, path.join(outputDir, 'light-fintech.png'), 1200, 627);
  console.log('   ✓ light-fintech.png');

  console.log(`\n✅ Done! Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
