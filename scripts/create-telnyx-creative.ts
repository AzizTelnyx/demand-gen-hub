#!/usr/bin/env tsx
/**
 * Telnyx Creative Generator - Matches actual brand style
 * Based on reference banners from brand-assets/examples/reference-banners/
 */

import { promises as fs } from "fs";
import path from "path";
import puppeteer from "puppeteer";

const BRAND = {
  colors: {
    darkBg: "#0D1117",
    brandGreen: "#00C08B",
    white: "#FFFFFF",
    gray: "#8892a6",
    subtleGray: "#5a6478",
  },
};

interface Creative {
  category: string;
  headline: string;
  subheadline: string;
  tag: string;
  cta?: string;
  metrics: Array<{
    label: string;
    sublabel: string;
    value: string;
    highlight?: boolean;
    valueColor?: string;
  }>;
}

const TEST_CREATIVE: Creative = {
  category: "HEALTHCARE COMPLIANCE",
  headline: "HIPAA-ready<br>Voice AI.<br><em>Zero shortcuts.</em>",
  subheadline: "Secure patient communication that puts<br>compliance first. SOC 2 Type II certified<br>infrastructure built for healthcare.",
  tag: "VOICE AI INFRASTRUCTURE",
  cta: "See the platform",
  metrics: [
    {
      label: "Compliance",
      sublabel: "HIPAA + SOC 2 Type II",
      value: "✓ Certified",
      highlight: true,
      valueColor: "#00C08B",
    },
    {
      label: "Voice AI latency",
      sublabel: "Telnyx full stack",
      value: "<500ms",
      valueColor: "#00C08B",
    },
    {
      label: "Data residency",
      sublabel: "Configurable by region",
      value: "US-only",
    },
    {
      label: "Uptime SLA",
      sublabel: "Carrier-grade reliability",
      value: "99.999%",
    },
  ],
};

async function loadLogoBase64(): Promise<string> {
  const logoPath = path.join(process.cwd(), "public", "telnyx-logo-light.png");
  const logoBuffer = await fs.readFile(logoPath);
  return `data:image/png;base64,${logoBuffer.toString('base64')}`;
}

function generateHTML(creative: Creative, width: number, height: number, logoBase64: string): string {
  const isWide = width > height;

  return `<!DOCTYPE html><html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  body {
    width: ${width}px; height: ${height}px;
    background: ${BRAND.colors.darkBg};
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: white; overflow: hidden; position: relative;
  }
  .bg-grid {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(circle at 80% 20%, rgba(0,192,139,0.06) 0%, transparent 50%),
      radial-gradient(circle at 20% 80%, rgba(0,192,139,0.04) 0%, transparent 50%);
    z-index: 0;
  }
  .content {
    position: relative; z-index: 1; display: flex; height: 100%;
    padding: ${isWide ? '50px 60px' : '40px 30px'}; align-items: center; gap: 0;
    ${!isWide ? 'flex-direction: column; justify-content: space-between;' : ''}
  }
  .left { ${isWide ? 'flex: 0 0 540px;' : 'width: 100%;'} }
  .right {
    ${isWide ? 'flex: 1; display: flex; flex-direction: column; align-items: stretch; justify-content: center; padding-left: 20px;' : 'width: 100%; margin-top: 20px;'}
  }
  .logo {
    font-size: 22px; font-weight: 800; letter-spacing: -0.5px;
    color: ${BRAND.colors.brandGreen}; margin-bottom: 24px;
  }
  .logo span { color: white; }
  .tag {
    position: absolute; top: 44px; right: 54px;
    background: rgba(0,192,139,0.1); border: 1px solid rgba(0,192,139,0.25);
    color: ${BRAND.colors.brandGreen}; font-size: 12px; font-weight: 600;
    padding: 5px 14px; border-radius: 20px; letter-spacing: 0.5px; z-index: 2;
  }
  .category {
    font-size: 13px; font-weight: 600; color: ${BRAND.colors.brandGreen}; letter-spacing: 1.5px;
    text-transform: uppercase; margin-bottom: 14px;
  }
  .headline {
    font-size: ${isWide ? '46px' : '32px'}; font-weight: 800; line-height: 1.08; letter-spacing: -1.5px; margin-bottom: 16px;
  }
  .headline em { font-style: normal; color: ${BRAND.colors.brandGreen}; }
  .sub { font-size: ${isWide ? '18px' : '14px'}; color: ${BRAND.colors.gray}; line-height: 1.5; }
  .divider {
    ${isWide ? 'width: 1px; background: rgba(255,255,255,0.06); height: 300px; flex-shrink: 0; margin: 0 24px; align-self: center;' : 'display: none;'}
  }
  .logo-bottom {
    position: absolute; bottom: 40px; left: 60px; z-index: 2;
    height: 24px;
  }
  .logo-bottom img {
    height: 100%;
    width: auto;
  }

  .cta-bottom {
    position: absolute; bottom: 40px; right: 60px; z-index: 2;
    font-size: 14px; font-weight: 600; color: ${BRAND.colors.brandGreen};
    text-decoration: none; padding: 10px 20px;
    border: 1px solid rgba(0,192,139,0.3);
    border-radius: 6px;
    background: rgba(0,192,139,0.05);
    transition: all 0.2s;
    letter-spacing: 0.3px;
  }
  .cta-bottom:hover {
    background: rgba(0,192,139,0.1);
    border-color: rgba(0,192,139,0.5);
  }

  .metric-cards { display: flex; flex-direction: column; gap: 12px; }
  .metric-card {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;
  }
  .metric-card.highlight { background: rgba(0,192,139,0.06); border-color: rgba(0,192,139,0.2); }
  .mc-label { font-size: 14px; color: ${BRAND.colors.gray}; }
  .mc-value { font-size: 22px; font-weight: 800; color: white; }
  .mc-value.green { color: ${BRAND.colors.brandGreen}; }
  .mc-sub { font-size: 11px; color: ${BRAND.colors.subtleGray}; margin-top: 2px; }
</style></head><body>
  <div class="bg-grid"></div>
  <div class="tag">${creative.tag}</div>
  <div class="content">
    <div class="left">
      <div class="category">${creative.category}</div>
      <div class="headline">${creative.headline}</div>
      <div class="sub">${creative.subheadline}</div>
    </div>
    <div class="divider"></div>
    <div class="right">
      <div class="metric-cards">
        ${creative.metrics.map(m => `
        <div class="metric-card${m.highlight ? ' highlight' : ''}">
          <div><div class="mc-label">${m.label}</div><div class="mc-sub">${m.sublabel}</div></div>
          <div class="mc-value" ${m.valueColor ? `style="color:${m.valueColor};"` : ''}>${m.value}</div>
        </div>
        `).join('')}
      </div>
    </div>
  </div>
  <div class="logo-bottom"><img src="${logoBase64}" alt="Telnyx"></div>
  ${creative.cta ? `<a href="#" class="cta-bottom">${creative.cta}</a>` : ''}
</body></html>`;
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
  console.log("\n🎨 Telnyx Creative Generator (Actual Brand Style)\n");
  console.log("━".repeat(60));
  console.log("\n📋 Test Creative:");
  console.log(`   Category: "${TEST_CREATIVE.category}"`);
  console.log(`   Tag: "${TEST_CREATIVE.tag}"`);

  const sizes = [
    { width: 1200, height: 627, label: "1200x627" },
    { width: 1200, height: 1200, label: "1200x1200" },
    { width: 628, height: 1200, label: "628x1200" },
  ];

  const outputDir = path.join(
    process.cwd(),
    "output",
    "creatives",
    `telnyx-healthcare-hipaa-${Date.now()}`
  );

  await fs.mkdir(outputDir, { recursive: true });

  // Load logo as base64
  console.log(`\n📷 Loading Telnyx logo...`);
  const logoBase64 = await loadLogoBase64();
  console.log(`   ✓ Logo loaded\n`);

  console.log(`🖼️  Generating creatives for ${sizes.length} sizes...\n`);

  for (const size of sizes) {
    const html = generateHTML(TEST_CREATIVE, size.width, size.height, logoBase64);
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

  console.log(`\n✅ Telnyx-branded creative generated successfully!`);
  console.log(`📁 Output: ${outputDir.replace(process.cwd(), ".")}`);
  console.log(`\n📋 Generated Files:`);
  console.log(`   - ${sizes.length} HTML files (for preview)`);
  console.log(`   - ${sizes.length} PNG files (production-ready)`);
  console.log(`   - copy.json (metadata)`);
  console.log(`\n💡 Style:`);
  console.log(`   - Telnyx dark blue-gray (#0D1117)`);
  console.log(`   - Teal green accent (#00C08B)`);
  console.log(`   - Data-driven metric cards`);
  console.log(`   - Two-column layout (landscape)`);
  console.log(`   - Actual Telnyx logo (from public/telnyx-logo-light.png)`);
  console.log(`   - CTA button: "${TEST_CREATIVE.cta}"`);
  console.log("\n" + "━".repeat(60) + "\n");
}

generateTestCreative().catch(console.error);
