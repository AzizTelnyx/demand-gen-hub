#!/usr/bin/env ts-node
/**
 * Dynamic Banner Generator
 *
 * Takes a brief and generates banners using actual brand assets.
 * Adapts layout to any format (horizontal, vertical, square).
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { selectLogo } from '../src/lib/logo-selector';

// ─── Asset Paths ────────────────────────────────────────────────────────────

const BRAND_ASSETS = '/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/brand-assets';
const TELNYX_ASSETS = `${BRAND_ASSETS}/telnyx-assets`;

const ASSET_CATALOG = {
  icons: {
    ai: `${TELNYX_ASSETS}/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/00_AI/AI00050.png`,
    voiceAI: `${TELNYX_ASSETS}/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/01_Voice-AI-Agent/Voice ai_00033.png`,
    voiceAPI: `${TELNYX_ASSETS}/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/02_Voice-API/voiceAPI_00063.png`,
  },
  photos: {
    finance: `${TELNYX_ASSETS}/_NEW_AdGen_Library/photography/industry/finance/industry-finance-photography-tap-payment-transaction-contactless-phone-iphone.jpg`,
    logistics: `${TELNYX_ASSETS}/_NEW_AdGen_Library/photography/industry/logistics/industry-logistics-photography-street-taxi.jpg`,
    restaurants: `${TELNYX_ASSETS}/_NEW_AdGen_Library/photography/industry/restaurants/industry-restaurants-photography-food-takeout.jpg`,
  },
  backgrounds: {
    gradient: `${TELNYX_ASSETS}/_NEW_AdGen_Library/backgrounds/rcs/gradient_rcs-4.png`,
  },
  features: {
    warmTransfer: `${TELNYX_ASSETS}/_NEW_Collection_Product-Features/01_Voice-AI-Agent/Voice-AI-Agent_Feature_Warm transfers/Voice-AI-Agent_Feature_Warm transfers900x620.png`,
  }
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface BannerBrief {
  headline: string;
  highlightWords: string[];
  subtext?: string;
  cta?: string;
  theme: 'light' | 'dark' | 'photo';
  assets?: {
    icon?: keyof typeof ASSET_CATALOG.icons;
    photo?: keyof typeof ASSET_CATALOG.photos;
  };
  format: {
    width: number;
    height: number;
  };
}

type AspectRatio = 'horizontal' | 'vertical' | 'square';

// ─── Utilities ──────────────────────────────────────────────────────────────

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const imageBuffer = await fs.readFile(imagePath);
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

function getAspectRatio(width: number, height: number): AspectRatio {
  const ratio = width / height;
  if (ratio > 1.2) return 'horizontal';
  if (ratio < 0.8) return 'vertical';
  return 'square';
}

function processHeadline(headline: string, highlightWords: string[]): string {
  let processed = headline;
  highlightWords.forEach(word => {
    processed = processed.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  });
  return processed;
}

// ─── Dynamic Layout Generator ───────────────────────────────────────────────

function generateBanner(
  brief: BannerBrief,
  assets: {
    logoBase64: string;
    iconBase64?: string;
    photoBase64?: string;
  }
): string {
  const { width, height } = brief.format;
  const aspectRatio = getAspectRatio(width, height);
  const processedHeadline = processHeadline(brief.headline, brief.highlightWords);

  // Scale factors based on canvas size
  const scale = Math.min(width, height) / 627;
  const headlineSize = Math.round(48 * scale);
  const subtextSize = Math.round(18 * scale);
  const ctaSize = Math.round(16 * scale);
  const padding = Math.round(48 * scale);
  const logoHeight = Math.round(28 * scale);

  // Layout configuration based on aspect ratio
  const layout = getLayoutConfig(aspectRatio, brief.theme);

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
    ${getBackgroundStyles(brief.theme, assets.photoBase64)}
  }

  /* Logo */
  .logo {
    position: absolute;
    ${layout.logo}
    height: ${logoHeight}px;
    z-index: 100;
  }

  /* 3D Icon asset */
  .icon-3d {
    position: absolute;
    ${layout.icon}
    object-fit: contain;
    z-index: 50;
  }

  /* Gradient decorative elements */
  .gradient-shape {
    position: absolute;
    background: linear-gradient(135deg, #00F0FF 0%, #00E3AA 50%, #00D49A 100%);
    opacity: 0.9;
    z-index: 10;
  }

  /* 4-point star */
  .star {
    clip-path: polygon(50% 0%, 61% 35%, 100% 50%, 61% 65%, 50% 100%, 39% 65%, 0% 50%, 39% 35%);
  }
  ${layout.stars}

  /* Gradient arches for dark mode */
  .arch {
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(0, 80, 80, 0.5) 0%, transparent 100%);
  }
  ${layout.arches}

  /* Content container */
  .content {
    position: absolute;
    ${layout.content}
    z-index: 80;
    display: flex;
    flex-direction: column;
    ${layout.contentAlign}
  }

  .headline {
    font-size: ${headlineSize}px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -1px;
    margin-bottom: ${Math.round(16 * scale)}px;
    color: ${brief.theme === 'light' ? '#1A1A1A' : '#FFFFFF'};
  }
  .headline .highlight {
    color: #00D4CC;
  }

  .subtext {
    font-size: ${subtextSize}px;
    font-weight: 400;
    line-height: 1.4;
    color: ${brief.theme === 'light' ? '#555' : 'rgba(255,255,255,0.8)'};
    margin-bottom: ${Math.round(24 * scale)}px;
    max-width: ${aspectRatio === 'vertical' ? '100%' : '80%'};
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: ${brief.theme === 'light' ? '#FFFFFF' : '#00D4CC'};
    color: ${brief.theme === 'light' ? '#1A1A1A' : '#0A0A0A'};
    font-size: ${ctaSize}px;
    font-weight: 600;
    padding: ${Math.round(14 * scale)}px ${Math.round(24 * scale)}px;
    border-radius: 40px;
    box-shadow: 0 4px 20px ${brief.theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(0,200,180,0.3)'};
  }
  .cta::after {
    content: '>';
  }

  /* UI Elements */
  .ui-card {
    position: absolute;
    background: ${brief.theme === 'light' ? 'rgba(230,240,250,0.95)' : 'rgba(40,50,55,0.9)'};
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    z-index: 60;
    ${layout.uiCard}
  }
  .ui-card-header {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }
  .ui-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${brief.theme === 'light' ? '#CBD5E0' : '#4A5568'};
  }
  .ui-lines {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ui-line {
    height: 8px;
    background: ${brief.theme === 'light' ? '#CBD5E0' : '#4A5568'};
    border-radius: 4px;
  }
  .ui-line:nth-child(1) { width: 100%; }
  .ui-line:nth-child(2) { width: 75%; }

  /* Chat bubble */
  .chat-bubble {
    position: absolute;
    background: linear-gradient(135deg, #00E5FF 0%, #00D4AA 100%);
    color: #1A1A1A;
    padding: 12px 18px;
    border-radius: 16px;
    font-size: ${Math.round(14 * scale)}px;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(0,200,180,0.3);
    z-index: 70;
  }
  ${layout.chatBubbles}

  /* Photo overlay */
  .photo-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: grayscale(100%) brightness(0.4);
    z-index: 1;
  }
  .photo-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%);
    z-index: 2;
  }

</style></head><body>
  ${brief.theme === 'photo' && assets.photoBase64 ? `
    <img src="${assets.photoBase64}" class="photo-bg" />
    <div class="photo-overlay"></div>
  ` : ''}

  <!-- Gradient shapes -->
  ${brief.theme !== 'photo' ? generateGradientElements(aspectRatio, brief.theme) : ''}

  <!-- Logo -->
  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />

  <!-- 3D Icon -->
  ${assets.iconBase64 ? `<img src="${assets.iconBase64}" class="icon-3d" />` : ''}

  <!-- UI Elements -->
  ${generateUIElements(aspectRatio, brief.theme, scale)}

  <!-- Content -->
  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${brief.subtext ? `<div class="subtext">${brief.subtext}</div>` : ''}
    ${brief.cta ? `<div class="cta">${brief.cta}</div>` : ''}
  </div>
</body></html>`;
}

function getBackgroundStyles(theme: string, photoBase64?: string): string {
  if (theme === 'photo') {
    return 'background: #0A0A0A;';
  }
  if (theme === 'dark') {
    return 'background: #0A0A0A; color: #FFFFFF;';
  }
  return 'background: linear-gradient(135deg, #F5F5F0 0%, #E8F5F2 50%, #E0F0EE 100%); color: #1A1A1A;';
}

function getLayoutConfig(aspectRatio: AspectRatio, theme: string) {
  // Horizontal layout (e.g., 1200x627)
  if (aspectRatio === 'horizontal') {
    return {
      logo: 'top: 40px; left: 48px;',
      icon: theme === 'light'
        ? 'right: 8%; top: 50%; transform: translateY(-50%); width: 32%; max-width: 380px;'
        : 'right: 10%; top: 50%; transform: translateY(-50%); width: 28%; max-width: 320px;',
      content: 'left: 48px; top: 50%; transform: translateY(-50%); max-width: 48%;',
      contentAlign: 'align-items: flex-start;',
      stars: `
        .star-1 { width: 220px; height: 220px; left: 3%; bottom: 5%; }
        .star-2 { width: 80px; height: 80px; right: 42%; top: 12%; }
      `,
      arches: `
        .arch-1 { width: 80px; height: 300px; right: 2%; top: 10%; }
        .arch-2 { width: 60px; height: 260px; right: 100px; top: 15%; }
        .arch-3 { width: 60px; height: 260px; left: 2%; top: 15%; }
      `,
      uiCard: 'right: 48px; bottom: 60px; width: 200px;',
      chatBubbles: `
        .chat-1 { right: 22%; top: 25%; }
        .chat-2 { right: 32%; bottom: 30%; }
      `,
    };
  }

  // Vertical layout (e.g., 1080x1920)
  if (aspectRatio === 'vertical') {
    return {
      logo: 'top: 60px; left: 50%; transform: translateX(-50%);',
      icon: 'left: 50%; top: 10%; transform: translateX(-50%); width: 50%; max-width: 320px;',
      content: 'left: 48px; right: 48px; bottom: 12%; text-align: center;',
      contentAlign: 'align-items: center;',
      stars: `
        .star-1 { width: 160px; height: 160px; left: 5%; top: 38%; }
        .star-2 { width: 120px; height: 120px; right: 5%; top: 50%; }
        .star-3 { width: 80px; height: 80px; left: 15%; bottom: 35%; }
      `,
      arches: `
        .arch-1 { width: 50px; height: 200px; right: 5%; top: 25%; }
        .arch-2 { width: 40px; height: 180px; left: 5%; top: 30%; }
        .arch-3 { width: 35px; height: 160px; right: 60px; top: 35%; }
      `,
      uiCard: 'left: 50%; transform: translateX(-50%); top: 55%; width: 240px;',
      chatBubbles: `
        .chat-1 { left: 12%; top: 42%; }
        .chat-2 { right: 12%; top: 52%; }
      `,
    };
  }

  // Square layout (e.g., 1080x1080)
  return {
    logo: 'top: 40px; left: 40px;',
    icon: 'right: 5%; top: 8%; width: 42%; max-width: 380px;',
    content: 'left: 40px; bottom: 50px; max-width: 65%;',
    contentAlign: 'align-items: flex-start;',
    stars: `
      .star-1 { width: 180px; height: 180px; left: 3%; top: 40%; }
      .star-2 { width: 100px; height: 100px; right: 48%; bottom: 35%; }
    `,
    arches: `
      .arch-1 { width: 60px; height: 250px; right: 3%; top: 18%; }
      .arch-2 { width: 50px; height: 220px; left: 3%; top: 22%; }
    `,
    uiCard: 'right: 40px; top: 55%; width: 180px;',
    chatBubbles: `
      .chat-1 { right: 18%; top: 38%; }
    `,
  };
}

function generateGradientElements(aspectRatio: AspectRatio, theme: string): string {
  if (theme === 'dark') {
    return `
      <div class="gradient-shape arch arch-1"></div>
      <div class="gradient-shape arch arch-2"></div>
      <div class="gradient-shape arch arch-3"></div>
    `;
  }

  // Light mode - gradient stars
  const stars = aspectRatio === 'vertical'
    ? `
      <div class="gradient-shape star star-1"></div>
      <div class="gradient-shape star star-2"></div>
      <div class="gradient-shape star star-3"></div>
    `
    : `
      <div class="gradient-shape star star-1"></div>
      <div class="gradient-shape star star-2"></div>
    `;

  return stars;
}

function generateUIElements(aspectRatio: AspectRatio, theme: string, scale: number): string {
  if (theme === 'photo') return ''; // No UI cards on photo backgrounds

  return `
    <div class="ui-card">
      <div class="ui-card-header">
        <div class="ui-dot"></div>
        <div class="ui-dot"></div>
        <div class="ui-dot"></div>
      </div>
      <div class="ui-lines">
        <div class="ui-line"></div>
        <div class="ui-line"></div>
      </div>
    </div>
  `;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎨 Dynamic Banner Generator\n');

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `dynamic-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Load logos
  const whiteLogoPath = await selectLogo('#000000');
  const blackLogoPath = await selectLogo('#FFFFFF');
  const whiteLogo = await imageToBase64(path.join(process.cwd(), whiteLogoPath));
  const blackLogo = await imageToBase64(path.join(process.cwd(), blackLogoPath));

  // Load 3D icons
  const aiIcon = await imageToBase64(ASSET_CATALOG.icons.ai);
  const voiceAIIcon = await imageToBase64(ASSET_CATALOG.icons.voiceAI);

  // Load photos
  const financePhoto = await imageToBase64(ASSET_CATALOG.photos.finance);

  console.log('   Assets loaded:');
  console.log(`   - Logos: ${whiteLogo ? '✓' : '✗'} white, ${blackLogo ? '✓' : '✗'} black`);
  console.log(`   - Icons: ${aiIcon ? '✓' : '✗'} AI, ${voiceAIIcon ? '✓' : '✗'} Voice AI`);
  console.log(`   - Photos: ${financePhoto ? '✓' : '✗'} Finance\n`);

  // ─── Test Different Formats ───────────────────────────────────────────────

  const briefs: Array<{ name: string; brief: BannerBrief; assets: any }> = [
    // Horizontal - LinkedIn
    {
      name: 'linkedin-horizontal-light',
      brief: {
        headline: 'Voice AI built for fintech stacks',
        highlightWords: ['Voice AI'],
        subtext: 'From prototype to production on one platform.',
        cta: 'Try Telnyx Free',
        theme: 'light',
        format: { width: 1200, height: 627 },
      },
      assets: { logoBase64: blackLogo, iconBase64: aiIcon },
    },
    {
      name: 'linkedin-horizontal-dark',
      brief: {
        headline: 'Build AI agents that sound local everywhere',
        highlightWords: ['AI agents', 'everywhere'],
        subtext: 'Global voice infrastructure with local presence.',
        cta: 'Learn more',
        theme: 'dark',
        format: { width: 1200, height: 627 },
      },
      assets: { logoBase64: whiteLogo, iconBase64: voiceAIIcon },
    },

    // Vertical - Story/Reels format
    {
      name: 'story-vertical-light',
      brief: {
        headline: 'Ship voice AI agents faster',
        highlightWords: ['voice AI agents'],
        subtext: 'One platform. No multi-vendor latency.',
        cta: 'Start Building',
        theme: 'light',
        format: { width: 1080, height: 1920 },
      },
      assets: { logoBase64: blackLogo, iconBase64: aiIcon },
    },
    {
      name: 'story-vertical-dark',
      brief: {
        headline: 'Your voice AI demo works. Production won\'t.',
        highlightWords: ['Production won\'t.'],
        subtext: 'Multi-vendor stacks add latency that breaks conversations.',
        cta: 'Fix It Now',
        theme: 'dark',
        format: { width: 1080, height: 1920 },
      },
      assets: { logoBase64: whiteLogo, iconBase64: voiceAIIcon },
    },

    // Square - Instagram/Facebook
    {
      name: 'square-light',
      brief: {
        headline: 'Migrate from Vapi in one click',
        highlightWords: ['one click'],
        subtext: 'Import agents, voice flows, and settings instantly.',
        cta: 'Start Migration',
        theme: 'light',
        format: { width: 1080, height: 1080 },
      },
      assets: { logoBase64: blackLogo, iconBase64: aiIcon },
    },
    {
      name: 'square-dark',
      brief: {
        headline: 'AI agents for regulated industries',
        highlightWords: ['AI agents'],
        subtext: 'HIPAA, SOC2, PCI compliant out of the box.',
        cta: 'See Compliance',
        theme: 'dark',
        format: { width: 1080, height: 1080 },
      },
      assets: { logoBase64: whiteLogo, iconBase64: voiceAIIcon },
    },

    // Photo background
    {
      name: 'linkedin-photo-fintech',
      brief: {
        headline: 'Voice AI for regulated fintech flows',
        highlightWords: ['Voice AI'],
        subtext: 'Secure, compliant, production-ready.',
        cta: 'Learn More',
        theme: 'photo',
        format: { width: 1200, height: 627 },
      },
      assets: { logoBase64: whiteLogo, photoBase64: financePhoto },
    },
  ];

  for (const { name, brief, assets } of briefs) {
    const html = generateBanner(brief, assets);
    const outputPath = path.join(outputDir, `${name}.png`);
    await convertHTMLtoPNG(html, outputPath, brief.format.width, brief.format.height);
    console.log(`   ✓ ${name}.png (${brief.format.width}x${brief.format.height})`);
  }

  console.log(`\n✅ Done! Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
