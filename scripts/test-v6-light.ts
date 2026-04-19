#!/usr/bin/env ts-node
/**
 * V6 Light Mode Test - Matches actual Telnyx StackAdapt ads
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

import { getTypography } from '../src/lib/typography';
import { selectLogo } from '../src/lib/logo-selector';
import { loadProductAssetsAsBase64 } from '../src/lib/product-assets';
import { TEMPLATES_V6 } from './templates-v6-light';

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
  console.log('\n🎨 V6 Light Mode Test - Matching StackAdapt Style\n');

  // Load assets - use BLACK logo for light background
  const logoPath = await selectLogo('#F5F3EE'); // Light background
  const logoBase64 = await imageToBase64(logoPath);
  const productAssets = await loadProductAssetsAsBase64('voice-ai', 'landscape');

  const assets = {
    logoBase64,
    productIconBase64: productAssets.iconBase64 || undefined,
  };

  console.log(`   Logo: ${logoBase64 ? '✓' : '✗'}`);
  console.log(`   Product Icon: ${assets.productIconBase64 ? '✓' : '✗'}`);

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `v6-light-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Test sizes matching the ad (300x250, plus larger sizes)
  const sizes = [
    { width: 300, height: 250, label: '300x250' },
    { width: 600, height: 500, label: '600x500' },
    { width: 1200, height: 627, label: '1200x627' },
  ];

  for (const size of sizes) {
    const typography = getTypography(size.width, size.height);

    // Light Pattern template
    const html = TEMPLATES_V6.lightPattern(
      {
        headline: 'Multilingual always on patient support',
        description: 'Deploy 24/7 AI voice agents to reduce wait times and language barriers across your patient journey.',
        cta: 'Learn More',
      },
      assets,
      size.width,
      size.height,
      typography
    );

    const outputPath = path.join(outputDir, `pattern-${size.label}.png`);
    await convertHTMLtoPNG(html, outputPath, size.width, size.height);
    console.log(`   ✓ ${size.label} pattern`);

    // Light Mockup template
    const mockupHtml = TEMPLATES_V6.lightMockup(
      {
        headline: 'Multilingual always on patient support',
        description: 'Deploy 24/7 AI voice agents to reduce wait times and language barriers.',
        cta: 'Learn More',
      },
      {
        title: 'Your lab results are ready.',
        message: 'Please check your patient portal or call for more detailed information.',
      },
      assets,
      size.width,
      size.height,
      typography
    );

    const mockupPath = path.join(outputDir, `mockup-${size.label}.png`);
    await convertHTMLtoPNG(mockupHtml, mockupPath, size.width, size.height);
    console.log(`   ✓ ${size.label} mockup`);
  }

  console.log(`\n✅ Done! Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
