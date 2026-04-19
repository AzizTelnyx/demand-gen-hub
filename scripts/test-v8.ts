#!/usr/bin/env ts-node
/**
 * V8 Test - EXACT match to Telnyx StackAdapt reference ads
 *
 * Key insights from references:
 * - Visuals are SMALL floating elements in corners, not full zones
 * - Photo + mockup are SEPARATE overlapping elements
 * - Gradient spans entire background, not just left side
 * - CTA can be BLACK or teal depending on template
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

import { selectLogo } from '../src/lib/logo-selector';

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
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
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width, height } });
  } finally {
    await browser.close();
  }
}

/* ─── Healthcare Template (300x250 reference) ─────────────────────────────────
 * - Full gradient background (teal → purple → pink blend)
 * - Strong colorful gradient blur on LEFT
 * - Text LEFT aligned
 * - TEAL CTA pill
 * - Small photo in BOTTOM RIGHT corner (~30-35% width)
 * - Mockup card floating and slightly overlapping photo
 * - Logo BOTTOM LEFT
 */

function createHealthcareTemplate(
  content: { headline: string; description: string; cta: string },
  assets: { logoBase64: string; photoBase64: string },
  width: number,
  height: number
): string {
  const scale = Math.sqrt((width * height) / (300 * 250));

  // Photo is small - about 30-35% of width, positioned in bottom right
  const photoSize = Math.round(Math.min(width * 0.35, height * 0.45));
  const mockupWidth = Math.round(photoSize * 0.9);
  const mockupHeight = Math.round(photoSize * 0.35);

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
    background: linear-gradient(135deg, #E8F4F2 0%, #F0E8F4 40%, #E8EEF8 70%, #F5F3EE 100%);
  }

  /* Strong colorful gradient blur on left side */
  .gradient-blur {
    position: absolute;
    left: -15%;
    top: -20%;
    width: 70%;
    height: 140%;
    background: linear-gradient(160deg,
      rgba(0, 220, 180, 0.6) 0%,
      rgba(180, 100, 220, 0.5) 40%,
      rgba(100, 180, 255, 0.4) 80%
    );
    filter: blur(${Math.round(40 * scale)}px);
    z-index: 1;
  }

  /* Text content - left side, doesn't need to avoid a huge visual zone */
  .content {
    position: relative;
    z-index: 3;
    padding: ${Math.round(16 * scale)}px;
    max-width: 70%;
  }

  .headline {
    font-size: ${Math.round(20 * scale)}px;
    font-weight: 700;
    color: #1A1A1A;
    line-height: 1.15;
    margin-bottom: ${Math.round(8 * scale)}px;
    letter-spacing: -0.3px;
  }

  .description {
    font-size: ${Math.round(11 * scale)}px;
    font-weight: 400;
    color: #3A3A3A;
    line-height: 1.4;
    margin-bottom: ${Math.round(12 * scale)}px;
  }

  .cta {
    display: inline-block;
    background: #00C9A7;
    color: #FFFFFF;
    font-size: ${Math.round(10 * scale)}px;
    font-weight: 600;
    padding: ${Math.round(8 * scale)}px ${Math.round(18 * scale)}px;
    border-radius: ${Math.round(4 * scale)}px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Small photo in bottom right corner */
  .photo {
    position: absolute;
    right: ${Math.round(8 * scale)}px;
    bottom: ${Math.round(28 * scale)}px;
    width: ${photoSize}px;
    height: ${photoSize}px;
    z-index: 2;
  }
  .photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: ${Math.round(6 * scale)}px;
  }

  /* Mockup card floating over photo */
  .mockup-card {
    position: absolute;
    right: ${Math.round(5 * scale)}px;
    bottom: ${Math.round(30 * scale)}px;
    width: ${mockupWidth}px;
    background: #FFFFFF;
    border-radius: ${Math.round(6 * scale)}px;
    padding: ${Math.round(8 * scale)}px;
    box-shadow: 0 ${Math.round(3 * scale)}px ${Math.round(12 * scale)}px rgba(0,0,0,0.1);
    z-index: 4;
  }
  .mockup-title {
    font-size: ${Math.round(8 * scale)}px;
    font-weight: 600;
    color: #1A1A1A;
    margin-bottom: ${Math.round(3 * scale)}px;
  }
  .mockup-text {
    font-size: ${Math.round(6.5 * scale)}px;
    color: #666;
    line-height: 1.3;
  }

  .logo {
    position: absolute;
    bottom: ${Math.round(10 * scale)}px;
    left: ${Math.round(16 * scale)}px;
    height: ${Math.round(16 * scale)}px;
    z-index: 5;
  }
</style></head><body>
  <div class="gradient-blur"></div>

  <div class="content">
    <div class="headline">${content.headline}</div>
    <div class="description">${content.description}</div>
    <div class="cta">${content.cta}</div>
  </div>

  <div class="photo">
    <img src="${assets.photoBase64}" alt="" />
  </div>

  <div class="mockup-card">
    <div class="mockup-title">Your lab results are ready.</div>
    <div class="mockup-text">Please check your patient portal for more detailed information.</div>
  </div>

  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
</body></html>`;
}

/* ─── Voice AI Global Template (300x350 reference) ───────────────────────────
 * - Full gradient background across entire canvas
 * - Text at TOP
 * - BLACK CTA pill
 * - Multiple floating photos/devices at bottom
 * - Logo CENTERED at bottom
 */

function createVoiceAITemplate(
  content: { headline: string; description: string; cta: string },
  assets: { logoBase64: string; photoBase64: string; phoneMockupBase64?: string },
  width: number,
  height: number
): string {
  const scale = Math.sqrt((width * height) / (300 * 350));

  const photoWidth = Math.round(width * 0.4);
  const photoHeight = Math.round(height * 0.35);
  const phoneWidth = Math.round(width * 0.25);
  const phoneHeight = Math.round(height * 0.32);

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
    background: linear-gradient(135deg,
      #A8E6E0 0%,
      #C8D4F0 35%,
      #E0C8E8 65%,
      #F0D8E0 100%
    );
  }

  .content {
    position: relative;
    z-index: 3;
    padding: ${Math.round(16 * scale)}px;
    padding-bottom: 0;
  }

  .headline {
    font-size: ${Math.round(22 * scale)}px;
    font-weight: 700;
    color: #1A1A1A;
    line-height: 1.12;
    margin-bottom: ${Math.round(10 * scale)}px;
    letter-spacing: -0.3px;
  }

  .description {
    font-size: ${Math.round(11 * scale)}px;
    font-weight: 400;
    color: #3A3A3A;
    line-height: 1.4;
    margin-bottom: ${Math.round(14 * scale)}px;
    max-width: 85%;
  }

  .cta {
    display: inline-block;
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: ${Math.round(10 * scale)}px;
    font-weight: 600;
    padding: ${Math.round(9 * scale)}px ${Math.round(20 * scale)}px;
    border-radius: ${Math.round(4 * scale)}px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Photo collage at bottom */
  .photo-collage {
    position: absolute;
    bottom: ${Math.round(35 * scale)}px;
    left: 0;
    right: 0;
    height: ${Math.round(height * 0.4)}px;
    display: flex;
    justify-content: center;
    gap: ${Math.round(8 * scale)}px;
    padding: 0 ${Math.round(12 * scale)}px;
    z-index: 2;
  }

  .phone-mockup {
    width: ${phoneWidth}px;
    height: ${phoneHeight}px;
    background: #FFFFFF;
    border-radius: ${Math.round(12 * scale)}px;
    box-shadow: 0 ${Math.round(4 * scale)}px ${Math.round(16 * scale)}px rgba(0,0,0,0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    padding: ${Math.round(10 * scale)}px;
  }
  .phone-icon {
    width: ${Math.round(28 * scale)}px;
    height: ${Math.round(28 * scale)}px;
    background: #00C9A7;
    border-radius: 50%;
    margin-bottom: ${Math.round(6 * scale)}px;
  }
  .phone-label {
    font-size: ${Math.round(7 * scale)}px;
    color: #666;
  }

  .person-photo {
    width: ${photoWidth}px;
    height: ${photoHeight}px;
    border-radius: ${Math.round(10 * scale)}px;
    overflow: hidden;
    box-shadow: 0 ${Math.round(4 * scale)}px ${Math.round(16 * scale)}px rgba(0,0,0,0.12);
  }
  .person-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .logo {
    position: absolute;
    bottom: ${Math.round(10 * scale)}px;
    left: 50%;
    transform: translateX(-50%);
    height: ${Math.round(14 * scale)}px;
    z-index: 5;
  }
</style></head><body>
  <div class="content">
    <div class="headline">${content.headline}</div>
    <div class="description">${content.description}</div>
    <div class="cta">${content.cta}</div>
  </div>

  <div class="photo-collage">
    <div class="phone-mockup">
      <div class="phone-icon"></div>
      <div class="phone-label">Incoming call</div>
    </div>
    <div class="person-photo">
      <img src="${assets.photoBase64}" alt="" />
    </div>
  </div>

  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
</body></html>`;
}

/* ─── Native Banner Template (728x90 reference) ──────────────────────────────
 * - Horizontal gradient (teal → blue → purple)
 * - Headline LEFT
 * - Stylized icon in CENTER (app-icon style, not 3D)
 * - BLACK CTA pill on RIGHT
 * - Logo FAR RIGHT
 */

function createNativeBannerTemplate(
  content: { headline: string; cta: string },
  assets: { logoBase64: string },
  width: number,
  height: number
): string {
  const scale = Math.min(width / 728, height / 90);
  const iconSize = Math.round(50 * scale);

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
    background: linear-gradient(90deg, #9BE8E0 0%, #B8D8F0 50%, #D8C8E8 100%);
  }

  .container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
    padding: 0 ${Math.round(24 * scale)}px;
  }

  .headline {
    font-size: ${Math.round(18 * scale)}px;
    font-weight: 700;
    color: #1A1A1A;
    line-height: 1.2;
    flex: 1;
  }

  /* Stylized app icon in center */
  .icon-container {
    width: ${iconSize}px;
    height: ${iconSize}px;
    background: #FFFFFF;
    border-radius: ${Math.round(12 * scale)}px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 ${Math.round(30 * scale)}px;
    box-shadow: 0 ${Math.round(2 * scale)}px ${Math.round(8 * scale)}px rgba(0,0,0,0.08);
  }
  .icon-waves {
    display: flex;
    gap: ${Math.round(3 * scale)}px;
  }
  .wave {
    width: ${Math.round(4 * scale)}px;
    height: ${Math.round(20 * scale)}px;
    background: #1A1A1A;
    border-radius: ${Math.round(2 * scale)}px;
  }
  .wave:nth-child(2) { height: ${Math.round(28 * scale)}px; }
  .wave:nth-child(3) { height: ${Math.round(16 * scale)}px; }
  .wave:nth-child(4) { height: ${Math.round(24 * scale)}px; }

  .right-section {
    display: flex;
    align-items: center;
    gap: ${Math.round(20 * scale)}px;
  }

  .cta {
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: ${Math.round(11 * scale)}px;
    font-weight: 600;
    padding: ${Math.round(10 * scale)}px ${Math.round(22 * scale)}px;
    border-radius: ${Math.round(4 * scale)}px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }

  .logo {
    height: ${Math.round(14 * scale)}px;
  }
</style></head><body>
  <div class="container">
    <div class="headline">${content.headline}</div>

    <div class="icon-container">
      <div class="icon-waves">
        <div class="wave"></div>
        <div class="wave"></div>
        <div class="wave"></div>
        <div class="wave"></div>
      </div>
    </div>

    <div class="right-section">
      <div class="cta">${content.cta}</div>
      <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
    </div>
  </div>
</body></html>`;
}

async function main() {
  console.log('\n🎨 V8 Test - EXACT Match to Reference Ads\n');

  // Load assets
  const logoPath = await selectLogo('#F5F3EE');
  const logoBase64 = await imageToBase64(path.join(process.cwd(), logoPath));

  // Load healthcare photo (just the photo, not pre-composited)
  const healthcarePhoto = await imageToBase64(
    '/Users/azizalsinafi/Documents/Asset_Library/Industry_Visuals/Social_Assets/Healthcare/Industry_Healthcare_Lab-Results@2x.png'
  );

  console.log(`   Logo: ${logoBase64 ? '✓' : '✗'}`);
  console.log(`   Healthcare photo: ${healthcarePhoto ? '✓' : '✗'}`);

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `v8-exact-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Generate EXACT sizes from references

  // 1. Healthcare 300x250 - matching the reference exactly
  const healthcare300x250 = createHealthcareTemplate(
    {
      headline: 'Multilingual always on patient support',
      description: 'Deploy 24/7 AI voice agents to reduce wait times and language barriers across your patient journey.',
      cta: 'Learn More',
    },
    { logoBase64, photoBase64: healthcarePhoto },
    300, 250
  );
  await convertHTMLtoPNG(healthcare300x250, path.join(outputDir, 'healthcare-300x250.png'), 300, 250);
  console.log('   ✓ healthcare-300x250');

  // 2. Voice AI 300x350 - matching the reference exactly
  const voiceAI300x350 = createVoiceAITemplate(
    {
      headline: "Voice AI that's built to scale globally",
      description: 'Support 30+ languages, comply with data requirements, and handle millions of concurrent calls.',
      cta: 'Learn More',
    },
    { logoBase64, photoBase64: healthcarePhoto },
    300, 350
  );
  await convertHTMLtoPNG(voiceAI300x350, path.join(outputDir, 'voiceai-300x350.png'), 300, 350);
  console.log('   ✓ voiceai-300x350');

  // 3. Native Banner 728x90 - matching the reference exactly
  const banner728x90 = createNativeBannerTemplate(
    {
      headline: 'Build AI Voice Agents with Telnyx engineers',
      cta: 'Get Started',
    },
    { logoBase64 },
    728, 90
  );
  await convertHTMLtoPNG(banner728x90, path.join(outputDir, 'banner-728x90.png'), 728, 90);
  console.log('   ✓ banner-728x90');

  console.log(`\n✅ Done! Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
