#!/usr/bin/env ts-node
/**
 * LinkedIn 1200x627 Light Mode - Clean, structured layout
 *
 * Structure matches dark references:
 * - Left: Logo, category tag, headline, subtext
 * - Right: Purposeful UI elements (stats, flows, or product UI)
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

// ─── Campaign Types ─────────────────────────────────────────────────────────

type CampaignType = 'stats' | 'migration' | 'product' | 'simple';

interface CampaignContent {
  category: string;           // e.g., "VOICE AI AGENTS"
  headline: string;           // Main headline
  highlightWords: string[];   // Words to highlight in teal
  subtext?: string;           // Supporting text
  campaignType: CampaignType;
  // For stats campaigns
  stats?: Array<{ label: string; value: string; sublabel?: string }>;
  // For migration campaigns
  migrations?: Array<{ from: string; to: string; tag: string }>;
}

// ─── Stats UI Component ─────────────────────────────────────────────────────

function statsUI(stats: Array<{ label: string; value: string; sublabel?: string }>): string {
  return `
    <div class="ui-panel">
      ${stats.map(stat => `
        <div class="stat-row">
          <div class="stat-left">
            <div class="stat-label">${stat.label}</div>
            ${stat.sublabel ? `<div class="stat-sublabel">${stat.sublabel}</div>` : ''}
          </div>
          <div class="stat-value">${stat.value}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── Migration UI Component ─────────────────────────────────────────────────

function migrationUI(migrations: Array<{ from: string; to: string; tag: string }>): string {
  return `
    <div class="ui-panel migration-panel">
      ${migrations.map(m => `
        <div class="migration-row">
          <span class="migration-from">${m.from}</span>
          <span class="migration-arrow">→</span>
          <span class="migration-to">${m.to}</span>
          <span class="migration-tag">${m.tag}</span>
        </div>
      `).join('')}
      <div class="migration-footer">Reuse voice flows, scripts, and settings</div>
    </div>
  `;
}

// ─── Product UI Component ─────────────────────────────────────────────────

function productUI(): string {
  return `
    <div class="ui-panel product-panel">
      <div class="product-header">
        <div class="product-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="product-content">
        <div class="product-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#00D4AA" stroke-width="2"/>
            <path d="M2 17L12 22L22 17" stroke="#00D4AA" stroke-width="2"/>
            <path d="M2 12L12 17L22 12" stroke="#00D4AA" stroke-width="2"/>
          </svg>
        </div>
        <div class="product-bars">
          <div class="bar bar-1"></div>
          <div class="bar bar-2"></div>
          <div class="bar bar-3"></div>
        </div>
      </div>
    </div>
  `;
}

// ─── Main Template ──────────────────────────────────────────────────────────

function lightTemplate(
  content: CampaignContent,
  assets: { logoBase64: string },
  width: number = 1200,
  height: number = 627
): string {
  // Process headline - wrap highlighted words
  let processedHeadline = content.headline;
  content.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  });

  // Generate right-side UI based on campaign type
  let rightUI = '';
  switch (content.campaignType) {
    case 'stats':
      rightUI = statsUI(content.stats || []);
      break;
    case 'migration':
      rightUI = migrationUI(content.migrations || []);
      break;
    case 'product':
      rightUI = productUI();
      break;
    case 'simple':
      rightUI = '';
      break;
  }

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
    background: #F8F8F6;
    color: #1A1A1A;
  }

  /* Layout: two columns */
  .container {
    display: flex;
    height: 100%;
    padding: 48px 64px;
  }

  .left {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    max-width: 55%;
  }

  .right {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  /* Logo */
  .logo {
    height: 28px;
    width: auto;
  }

  /* Category tag */
  .category {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1px;
    color: #666;
    margin-bottom: 16px;
  }

  /* Headline */
  .headline {
    font-size: 48px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -1px;
    margin-bottom: 20px;
  }
  .headline .highlight {
    color: #00D4AA;
  }

  /* Subtext */
  .subtext {
    font-size: 18px;
    font-weight: 400;
    color: #555;
    line-height: 1.5;
    max-width: 90%;
  }

  /* Right panel - shared styles */
  .ui-panel {
    background: #FFFFFF;
    border-radius: 12px;
    padding: 24px 32px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.06);
    min-width: 380px;
  }

  /* Stats panel */
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0;
    border-bottom: 1px solid #F0F0F0;
  }
  .stat-row:last-child {
    border-bottom: none;
  }
  .stat-label {
    font-size: 15px;
    font-weight: 500;
    color: #1A1A1A;
  }
  .stat-sublabel {
    font-size: 12px;
    color: #888;
    margin-top: 2px;
  }
  .stat-value {
    font-size: 16px;
    font-weight: 600;
    color: #00D4AA;
  }

  /* Migration panel */
  .migration-panel {
    padding: 20px 28px;
  }
  .migration-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #F0F0F0;
  }
  .migration-row:last-of-type {
    border-bottom: none;
  }
  .migration-from {
    font-size: 14px;
    color: #888;
    text-decoration: line-through;
    min-width: 100px;
  }
  .migration-arrow {
    color: #00D4AA;
    font-weight: 600;
  }
  .migration-to {
    font-size: 14px;
    font-weight: 600;
    color: #00D4AA;
    flex: 1;
  }
  .migration-tag {
    font-size: 11px;
    font-weight: 500;
    color: #00D4AA;
    background: rgba(0, 212, 170, 0.1);
    padding: 4px 10px;
    border-radius: 4px;
  }
  .migration-footer {
    font-size: 12px;
    color: #888;
    margin-top: 16px;
    text-align: center;
  }

  /* Product panel */
  .product-panel {
    padding: 0;
    overflow: hidden;
  }
  .product-header {
    background: #F5F5F5;
    padding: 12px 16px;
    border-bottom: 1px solid #EEE;
  }
  .product-dots {
    display: flex;
    gap: 6px;
  }
  .product-dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #DDD;
  }
  .product-content {
    padding: 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }
  .product-icon {
    width: 64px;
    height: 64px;
    background: rgba(0, 212, 170, 0.1);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .product-bars {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    height: 60px;
  }
  .bar {
    width: 40px;
    background: linear-gradient(180deg, #00D4AA 0%, #00A88A 100%);
    border-radius: 4px 4px 0 0;
  }
  .bar-1 { height: 30px; }
  .bar-2 { height: 50px; }
  .bar-3 { height: 40px; }

</style></head><body>
  <div class="container">
    <div class="left">
      <div>
        <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
      </div>
      <div class="content">
        <div class="category">${content.category}</div>
        <div class="headline">${processedHeadline}</div>
        ${content.subtext ? `<div class="subtext">${content.subtext}</div>` : ''}
      </div>
      <div></div>
    </div>
    <div class="right">
      ${rightUI}
    </div>
  </div>
</body></html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎨 LinkedIn Light Mode - 1200x627\n');

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `linkedin-light-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Load black logo for light background
  const blackLogoPath = await selectLogo('#FFFFFF');
  const blackLogo = await imageToBase64(path.join(process.cwd(), blackLogoPath));
  console.log(`   Logo: ${blackLogo ? '✓' : '✗'}`);

  // ─── Example 1: Stats Campaign (Performance) ──────────────────────────────
  const statsAd = lightTemplate(
    {
      category: 'VOICE AI INFRASTRUCTURE',
      headline: 'Your voice AI demo works. Production won\'t.',
      highlightWords: ['Production won\'t.'],
      subtext: 'Multi-vendor stacks add latency that breaks real conversations.',
      campaignType: 'stats',
      stats: [
        { label: 'Response latency', sublabel: 'Telnyx Voice AI', value: '<500ms' },
        { label: 'Typical multi-vendor stack', sublabel: 'Twilio + ElevenLabs + STT', value: '1.5-3s' },
        { label: 'Infrastructure', sublabel: 'Network + Telephony + GPUs', value: 'Full stack' },
      ],
    },
    { logoBase64: blackLogo }
  );
  await convertHTMLtoPNG(statsAd, path.join(outputDir, '01-stats-performance.png'), 1200, 627);
  console.log('   ✓ 01-stats-performance.png');

  // ─── Example 2: Migration Campaign ────────────────────────────────────────
  const migrationAd = lightTemplate(
    {
      category: 'VOICE AI AGENTS',
      headline: 'Migrate from Vapi or ElevenLabs in one click.',
      highlightWords: ['in one click.'],
      subtext: 'Import your agents, voice flows, and settings. No rebuilding.',
      campaignType: 'migration',
      migrations: [
        { from: 'Vapi', to: 'Telnyx Voice AI', tag: '1-click' },
        { from: 'ElevenLabs', to: 'Telnyx Voice AI', tag: '1-click' },
        { from: 'Retell AI', to: 'Telnyx Voice AI', tag: '1-click' },
      ],
    },
    { logoBase64: blackLogo }
  );
  await convertHTMLtoPNG(migrationAd, path.join(outputDir, '02-migration.png'), 1200, 627);
  console.log('   ✓ 02-migration.png');

  // ─── Example 3: Product/Builder Campaign ──────────────────────────────────
  const productAd = lightTemplate(
    {
      category: 'VOICE AI AGENTS',
      headline: 'Build voice AI agents that scale.',
      highlightWords: ['voice AI agents'],
      subtext: 'From prototype to production on one platform.',
      campaignType: 'product',
    },
    { logoBase64: blackLogo }
  );
  await convertHTMLtoPNG(productAd, path.join(outputDir, '03-product-builder.png'), 1200, 627);
  console.log('   ✓ 03-product-builder.png');

  // ─── Example 4: Simple/Brand Campaign ─────────────────────────────────────
  const simpleAd = lightTemplate(
    {
      category: 'VOICE AI',
      headline: 'Reliable Voice AI starts with unified infrastructure.',
      highlightWords: ['Voice AI'],
      subtext: 'Own the network. Own the latency. Own the experience.',
      campaignType: 'simple',
    },
    { logoBase64: blackLogo }
  );
  await convertHTMLtoPNG(simpleAd, path.join(outputDir, '04-simple-brand.png'), 1200, 627);
  console.log('   ✓ 04-simple-brand.png');

  console.log(`\n✅ Done! Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
