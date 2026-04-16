#!/usr/bin/env tsx
/**
 * Test Both Templates - Generate same content with both templates
 */

import { VISUAL_TEMPLATES_FINAL, VisualCreativeData, VisualAssets } from './visual-templates-final.js';
import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

async function htmlToPng(html: string, outputPath: string, width: number, height: number) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();
}

async function generateBothTemplates() {
  const logoPath = path.join(process.cwd(), 'brand-assets/assets/logo/White:Black/Telnyx_Media-Kit_Logo-Black (1).png');
  const logoBuffer = await fs.readFile(logoPath);
  const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  const travelPhotoPath = path.join(process.cwd(), 'brand-assets/assets/photography/industry/travel/industry-travel-photography-holiday-landscape.jpg');
  const productScreenshotPath = path.join(process.cwd(), 'brand-assets/assets/features/voice-ai/voice-ai-features-voice-playground-language.png');

  // Convert images to base64
  const travelPhotoBuffer = await fs.readFile(travelPhotoPath);
  const travelPhotoBase64 = `data:image/jpeg;base64,${travelPhotoBuffer.toString('base64')}`;

  const productScreenshotBuffer = await fs.readFile(productScreenshotPath);
  const productScreenshotBase64 = `data:image/png;base64,${productScreenshotBuffer.toString('base64')}`;

  const data: VisualCreativeData = {
    headline: 'Telnyx Voice AI Cuts Concierge Response Time to Under 200ms',
    description: 'Telnyx Voice AI leverages its owned network and co-located inference to deliver sub-200ms latency voice interactions in over 140 countries.',
    cta: 'Learn More',
    pillar: 'infrastructure',
    audience: 'hotels and travel companies',
    platform: 'linkedin',
    product: 'voice-ai',
    industry: 'travel',
  };

  const assets: VisualAssets = {
    logoBase64,
    productScreenshot: productScreenshotBase64,
    industryPhoto: travelPhotoBase64,
  };

  const width = 1200;
  const height = 627;

  console.log('\n🎨 Generating both templates...\n');

  // Generate Voice AI Product Template
  console.log('📱 Generating Voice AI Product template...');
  const productHtml = VISUAL_TEMPLATES_FINAL['voice-ai-product'](data, assets, width, height);
  const productPng = path.join(process.cwd(), 'test-product-template.png');
  await htmlToPng(productHtml, productPng, width, height);
  console.log(`   ✓ Saved: ${productPng}`);

  // Generate Industry ABM Template
  console.log('🏢 Generating Industry ABM template...');
  const industryHtml = VISUAL_TEMPLATES_FINAL['industry-abm'](data, assets, width, height);
  const industryPng = path.join(process.cwd(), 'test-industry-template.png');
  await htmlToPng(industryHtml, industryPng, width, height);
  console.log(`   ✓ Saved: ${industryPng}`);

  console.log('\n✅ Done! Compare the two PNGs:\n');
  console.log(`   - test-product-template.png (shows product UI)`);
  console.log(`   - test-industry-template.png (shows travel photo)\n`);
}

generateBothTemplates().catch(console.error);
