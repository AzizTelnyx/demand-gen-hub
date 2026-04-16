#!/usr/bin/env tsx
/**
 * Professional Creative Generator - Uses high-quality templates
 */

import { promises as fs } from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { TEMPLATES, CreativeData, TemplateAssets } from "./professional-creative-templates";

const BRAND_ASSETS = {
  logo: "brand-assets/assets/logo/green/telnyx-logo-wordmark-green.png",
};

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const fullPath = path.join(process.cwd(), imagePath);
    const imageBuffer = await fs.readFile(fullPath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1);
    return `data:image/${ext};base64,${base64}`;
  } catch (error) {
    console.warn(`⚠️  Could not load image: ${imagePath}`);
    return '';
  }
}

async function convertHTMLtoPNG(
  html: string,
  outputPath: string,
  width: number,
  height: number
): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.screenshot({
      path: outputPath,
      type: 'png',
      fullPage: false,
    });
  } finally {
    await browser.close();
  }
}

async function generateProfessionalCreative() {
  console.log("\n🎨 Professional Creative Generator\n");
  console.log("━".repeat(60));

  // Test creative data
  const creativeData: CreativeData = {
    headline: "Your voice AI demo works.<br><em>Production won't.</em>",
    description: "Multi-vendor stacks add latency that breaks real conversations. We own the network, the telephony, and the GPUs.",
    dataPoint: "Response latency: <500ms",
    cta: "Get Started",
    pillar: "physics",
    audience: "Voice AI Agents",
    platform: "linkedin",
  };

  console.log(`\n📋 Creative:`);
  console.log(`   Headline: "${creativeData.headline.replace(/<[^>]*>/g, '')}"`);
  console.log(`   Pillar: ${creativeData.pillar}`);
  console.log(`   Audience: ${creativeData.audience}`);

  const sizes = [
    { width: 1200, height: 627, label: "1200x627" },
    { width: 1200, height: 1200, label: "1200x1200" },
    { width: 628, height: 1200, label: "628x1200" },
  ];

  const outputDir = path.join(
    process.cwd(),
    "output",
    "creatives",
    `professional-${creativeData.pillar}-${Date.now()}`
  );

  await fs.mkdir(outputDir, { recursive: true });

  // Load assets
  const assets: TemplateAssets = {
    logoBase64: await imageToBase64(BRAND_ASSETS.logo),
  };

  console.log(`\n🖼️  Generating professional creatives...\n`);

  // Generate with metric comparison template
  const template = TEMPLATES['metric-comparison'];

  for (const size of sizes) {
    const html = template(creativeData, assets, size.width, size.height);
    const htmlPath = path.join(outputDir, `${size.label}.html`);
    const pngPath = path.join(outputDir, `${size.label}.png`);

    await fs.writeFile(htmlPath, html);
    console.log(`   ✓ ${size.label}.html`);

    await convertHTMLtoPNG(html, pngPath, size.width, size.height);
    console.log(`   ✓ ${size.label}.png`);
  }

  // Save copy
  const copyPath = path.join(outputDir, "copy.json");
  await fs.writeFile(
    copyPath,
    JSON.stringify({ ...creativeData, generatedAt: new Date().toISOString() }, null, 2)
  );

  console.log(`\n✅ Professional creative generated!`);
  console.log(`📁 Output: ${outputDir.replace(process.cwd(), ".")}`);
  console.log(`\n💡 Open PNG files to see high-quality, production-ready ads\n`);
  console.log("━".repeat(60) + "\n");
}

generateProfessionalCreative().catch(console.error);
