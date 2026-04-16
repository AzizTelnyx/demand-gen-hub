#!/usr/bin/env tsx
/**
 * Manual Creative Generator - Creates a test creative without AI
 * Demonstrates brand assets working (fonts, colors, layout)
 * Now with PNG export via Puppeteer + real logo/visual assets
 */

import { promises as fs } from "fs";
import path from "path";
import puppeteer from "puppeteer";

const BRAND = {
  colors: {
    darkBg: "#0A0A0A",
    brandGreen: "#00CE9C",
    white: "#FFFFFF",
  },
  fonts: {
    headline: "brand-assets/fonts/PP Formula - Extrabold v2.0/PPFormula-Extrabold.ttf",
    body: "brand-assets/fonts/Inter-VariableFont_slnt,wght.ttf",
  },
  assets: {
    logo: "brand-assets/assets/logo/green/telnyx-logo-wordmark-green.png",
    background: "brand-assets/assets/backgrounds/voice-ai/background_voice-ai-agent-6.png",
  },
};

// Helper to convert image to base64
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

interface Creative {
  headline: string;
  description: string;
  cta: string;
  dataPoint: string;
}

const TEST_CREATIVE: Creative = {
  headline: "HIPAA-ready Voice AI for Healthcare",
  description: "Secure patient communication that puts compliance first. Build with the only platform designed for healthcare's toughest requirements.",
  cta: "Get Started",
  dataPoint: "SOC 2 Type II Certified",
};

async function generateHTML(creative: Creative, width: number, height: number): Promise<string> {
  const isWide = width > height;
  const padding = Math.min(width, height) * 0.08;
  const headlineSize = isWide ? Math.floor(height * 0.12) : Math.floor(width * 0.08);
  const descSize = Math.floor(headlineSize * 0.35);
  const dataSize = Math.floor(headlineSize * 0.4);

  // Load logo as base64
  const logoBase64 = await imageToBase64(BRAND.assets.logo);
  const logoWidth = Math.floor(width * 0.15); // Logo takes 15% of width

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;900&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      width: ${width}px;
      height: ${height}px;
      background: linear-gradient(135deg, ${BRAND.colors.darkBg} 0%, #1a1a1a 100%);
      color: ${BRAND.colors.white};
      font-family: 'Inter', sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: ${padding}px;
      position: relative;
      overflow: hidden;
    }

    /* Gradient accent */
    body::before {
      content: "";
      position: absolute;
      top: -50%;
      right: -20%;
      width: 80%;
      height: 150%;
      background: radial-gradient(circle, ${BRAND.colors.brandGreen}15 0%, transparent 70%);
      pointer-events: none;
    }

    .content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: ${padding * 0.6}px;
    }

    .data-point {
      display: inline-block;
      font-size: ${dataSize}px;
      font-weight: 900;
      color: ${BRAND.colors.brandGreen};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: ${padding * 0.3}px;
    }

    h1 {
      font-size: ${headlineSize}px;
      font-weight: 900;
      line-height: 1.1;
      color: ${BRAND.colors.white};
      letter-spacing: -0.02em;
      max-width: 85%;
    }

    .description {
      font-size: ${descSize}px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.8);
      font-weight: 400;
      max-width: 75%;
      margin-top: ${padding * 0.2}px;
    }

    .footer {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .cta {
      font-size: ${dataSize}px;
      font-weight: 700;
      color: ${BRAND.colors.brandGreen};
      text-decoration: none;
      padding: ${padding * 0.35}px ${padding * 0.6}px;
      border: 2px solid ${BRAND.colors.brandGreen};
      border-radius: 4px;
      display: inline-block;
    }

    .logo {
      height: ${dataSize * 2}px;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="content">
    <div class="data-point">${creative.dataPoint}</div>
    <h1>${creative.headline}</h1>
    <p class="description">${creative.description}</p>
  </div>

  <div class="footer">
    <a href="#" class="cta">${creative.cta}</a>
    ${logoBase64 ? `<img src="${logoBase64}" alt="Telnyx" class="logo" />` : '<div class="logo">TELNYX</div>'}
  </div>
</body>
</html>`;
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

async function generateTestCreative() {
  console.log("\n🎨 Manual Creative Generator (Test)\n");
  console.log("━".repeat(60));
  console.log("\n📋 Test Creative:");
  console.log(`   Headline: "${TEST_CREATIVE.headline}"`);
  console.log(`   Data Point: "${TEST_CREATIVE.dataPoint}"`);

  const sizes = [
    { width: 1200, height: 627, label: "1200x627" },
    { width: 1200, height: 1200, label: "1200x1200" },
    { width: 628, height: 1200, label: "628x1200" },
  ];

  const outputDir = path.join(
    process.cwd(),
    "output",
    "creatives",
    `test-healthcare-hipaa-${Date.now()}`
  );

  await fs.mkdir(outputDir, { recursive: true });

  console.log(`\n🖼️  Generating creatives for ${sizes.length} sizes...\n`);

  for (const size of sizes) {
    const html = await generateHTML(TEST_CREATIVE, size.width, size.height);
    const htmlPath = path.join(outputDir, `${size.label}.html`);
    const pngPath = path.join(outputDir, `${size.label}.png`);

    // Save HTML
    await fs.writeFile(htmlPath, html);
    console.log(`   ✓ ${size.label}.html`);

    // Convert to PNG
    await convertHTMLtoPNG(html, pngPath, size.width, size.height);
    console.log(`   ✓ ${size.label}.png`);
  }

  // Save copy as JSON
  const copyPath = path.join(outputDir, "copy.json");
  await fs.writeFile(
    copyPath,
    JSON.stringify(
      {
        ...TEST_CREATIVE,
        platform: "linkedin",
        pillar: "trust",
        audience: "healthcare",
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`\n✅ Test creative generated successfully!`);
  console.log(`📁 Output: ${outputDir.replace(process.cwd(), ".")}`);
  console.log(`\n📋 Generated Files:`);
  console.log(`   - ${sizes.length} HTML files (for preview)`);
  console.log(`   - ${sizes.length} PNG files (production-ready)`);
  console.log(`   - copy.json (metadata)`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Open PNG files to preview final creatives`);
  console.log(`   2. Upload PNGs to LinkedIn/StackAdapt/etc.`);
  console.log(`   3. Review copy in copy.json`);
  console.log("\n" + "━".repeat(60) + "\n");
}

generateTestCreative().catch(console.error);
