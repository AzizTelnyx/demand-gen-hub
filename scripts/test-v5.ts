#!/usr/bin/env ts-node
/**
 * Quick V5 Test - Proper 3D Icon Positioning
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

import { getTypography } from '../src/lib/typography';
import { selectLogo } from '../src/lib/logo-selector';
import { loadProductAssetsAsBase64 } from '../src/lib/product-assets';
import { TEMPLATES_V5 } from './templates-v5';

async function imageToBase64(imagePath: string): Promise<string> {
  const fullPath = path.join(process.cwd(), imagePath);
  const imageBuffer = await fs.readFile(fullPath);
  const base64 = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).slice(1);
  return `data:image/${ext};base64,${base64}`;
}

async function convertHTMLtoPNG(html: string, outputPath: string, width: number, height: number): Promise<void> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 500));
    await fs.writeFile(outputPath.replace('.png', '.html'), html);
    await page.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('\n🎨 V5 Test - Proper Icon Positioning\n');

  // Load assets
  const logoPath = await selectLogo('#0D1117');
  const logoBase64 = await imageToBase64(logoPath);
  const productAssets = await loadProductAssetsAsBase64('voice-ai', 'landscape');

  const assets = {
    logoBase64,
    productIconBase64: productAssets.iconBase64 || undefined,
  };

  console.log(`   Logo: ${logoBase64 ? '✓' : '✗'}`);
  console.log(`   Product Icon: ${assets.productIconBase64 ? '✓' : '✗'}`);

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `v5-test-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Test metrics template
  const typography = getTypography(1200, 627);
  const html = TEMPLATES_V5.metricsWithIcon(
    {
      headline: 'Your voice AI demo works.\nProduction won\'t.',
      greenWords: ["Production won't."],
      description: 'Multi-vendor stacks add latency that breaks real conversations. We own the network, the telephony, and the GPUs.',
      cta: 'Own The Stack',
      label: 'VOICE AI AGENTS',
      ctaLabel: 'VOICE AI INFRASTRUCTURE',
    },
    [
      { value: '<500ms', label: 'Response latency', sublabel: 'Telnyx Voice AI', isHighlight: true },
      { value: '1.5-3s', label: 'Typical multi-vendor stack', sublabel: 'Twilio + ElevenLabs + STT', isNegative: true },
      { value: 'Full stack', label: 'Infrastructure', sublabel: 'Network → Telephony → GPUs', isHighlight: true },
      { value: '30+', label: 'Global PoPs', sublabel: 'Co-located with edge GPUs' },
    ],
    assets,
    1200,
    627,
    typography
  );

  const outputPath = path.join(outputDir, '1200x627.png');
  await convertHTMLtoPNG(html, outputPath, 1200, 627);

  // Test comparison template
  const compHtml = TEMPLATES_V5.comparisonWithIcon(
    {
      headline: 'Stop stitching.\nStart shipping.',
      greenWords: ['Start shipping.'],
      description: 'Twilio for SIP. ElevenLabs for TTS. Third-party STT. Four dashboards. One platform replaces all of it.',
      cta: 'Own The Stack',
      label: 'VOICE AI AGENTS',
      ctaLabel: 'OWN THE STACK',
    },
    {
      badItems: [
        'SIP provider + STT vendor + TTS vendor',
        '3-5 carrier hops per call',
        '4 dashboards to debug one failed call',
        'Surprise bills from 4 vendors',
      ],
      goodItems: [
        'One platform',
        'Sub-second latency, one hop',
        'End-to-end call traces in one dashboard',
        'One predictable bill',
      ],
    },
    assets,
    1200,
    627,
    typography
  );

  const compPath = path.join(outputDir, 'comparison-1200x627.png');
  await convertHTMLtoPNG(compHtml, compPath, 1200, 627);

  // Test stats grid
  const statsHtml = TEMPLATES_V5.statsGridWithIcon(
    {
      headline: 'Voice AI your compliance team\nwill approve.',
      greenWords: ['will approve.'],
      description: 'HIPAA-ready. SOC 2 certified. Licensed carrier in 30+ countries. Enterprise security, not startup promises.',
      cta: 'Learn More',
      label: 'VOICE AI AGENTS',
      ctaLabel: 'ENTERPRISE-READY',
    },
    [
      { value: '30+', label: 'Countries licensed' },
      { value: '100+', label: 'Markets with local numbers' },
      { value: '70+', label: 'Languages supported' },
      { value: '24/7', label: 'Engineering support' },
    ],
    ['HIPAA', 'SOC 2 Type II', 'GDPR', 'PCI-DSS', 'STIR/SHAKEN'],
    assets,
    1200,
    627,
    typography
  );

  const statsPath = path.join(outputDir, 'stats-1200x627.png');
  await convertHTMLtoPNG(statsHtml, statsPath, 1200, 627);

  console.log(`\n✅ Done! Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
