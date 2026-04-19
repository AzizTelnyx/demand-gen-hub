#!/usr/bin/env ts-node
/**
 * LinkedIn 1200x627 V2 - Matches actual Telnyx samples
 *
 * Uses real assets:
 * - 3D gradient icons from brand library
 * - Stock photos with grayscale treatment
 * - Gradient 4-point stars
 * - Chat bubble UI elements
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { selectLogo } from '../src/lib/logo-selector';

const ASSETS_ROOT = '/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/brand-assets';
const STOCK_PHOTOS = '/Users/azizalsinafi/Documents/Asset_Library';

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

// ─── Light Mode with Gradient Stars & UI Elements ───────────────────────────
// Based on: banner_36, banner_1

function lightModeTemplate(
  content: {
    headline: string;
    highlightWords: string[];
    cta?: string;
  },
  assets: {
    logoBase64: string;
    iconBase64?: string; // Optional 3D icon
  }
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
    width: 1200px;
    height: 627px;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
    background: linear-gradient(135deg, #F5F5F0 0%, #E8F5F0 50%, #E0F2F0 100%);
    color: #1A1A1A;
  }

  /* Logo */
  .logo {
    position: absolute;
    top: 48px;
    left: 56px;
    height: 32px;
  }

  /* Main content - left side */
  .content {
    position: absolute;
    top: 140px;
    left: 56px;
    max-width: 480px;
  }

  .headline {
    font-size: 56px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -1.5px;
    margin-bottom: 32px;
  }
  .headline .highlight {
    color: #00C9D4;
  }

  /* CTA Button */
  .cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #FFFFFF;
    color: #1A1A1A;
    font-size: 16px;
    font-weight: 600;
    padding: 16px 28px;
    border-radius: 40px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  }
  .cta::after {
    content: '>';
    font-size: 14px;
  }

  /* 4-point gradient stars - like banner_36 */
  .star {
    position: absolute;
    background: linear-gradient(180deg, #00E5FF 0%, #00D4AA 100%);
    clip-path: polygon(50% 0%, 61% 35%, 100% 50%, 61% 65%, 50% 100%, 39% 65%, 0% 50%, 39% 35%);
  }
  .star-large {
    width: 320px;
    height: 320px;
    left: 80px;
    bottom: -60px;
    opacity: 0.95;
  }
  .star-medium {
    width: 140px;
    height: 140px;
    right: 320px;
    top: 100px;
    opacity: 0.9;
  }

  /* Dashed connection lines */
  .dashed-path {
    position: absolute;
    border: 2px dashed rgba(0,0,0,0.12);
    border-radius: 20px;
  }
  .dashed-1 {
    top: 60px;
    right: 300px;
    width: 100px;
    height: 60px;
    border-left: none;
    border-bottom: none;
  }
  .dashed-2 {
    right: 200px;
    bottom: 180px;
    width: 80px;
    height: 120px;
    border-top: none;
    border-right: none;
  }

  /* Sound wave icon card */
  .wave-card {
    position: absolute;
    top: 60px;
    right: 80px;
    background: rgba(220, 235, 245, 0.9);
    border-radius: 16px;
    padding: 20px 24px;
    display: flex;
    gap: 5px;
    align-items: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
  }
  .wave-bar {
    width: 6px;
    background: #1A1A1A;
    border-radius: 3px;
  }
  .wave-bar:nth-child(1) { height: 18px; }
  .wave-bar:nth-child(2) { height: 32px; }
  .wave-bar:nth-child(3) { height: 24px; }
  .wave-bar:nth-child(4) { height: 36px; }
  .wave-bar:nth-child(5) { height: 20px; }

  /* Browser mockup card */
  .browser-card {
    position: absolute;
    right: 60px;
    bottom: 100px;
    background: rgba(230, 240, 250, 0.95);
    border-radius: 12px;
    padding: 0;
    width: 280px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.08);
  }
  .browser-header {
    background: rgba(200, 215, 230, 0.8);
    padding: 10px 14px;
    display: flex;
    gap: 6px;
  }
  .browser-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #CBD5E0;
  }
  .browser-content {
    padding: 16px 20px;
  }
  .browser-line {
    height: 10px;
    background: #CBD5E0;
    border-radius: 5px;
    margin-bottom: 10px;
  }
  .browser-line:nth-child(1) { width: 90%; }
  .browser-line:nth-child(2) { width: 70%; }
  .browser-line:nth-child(3) { width: 50%; margin-bottom: 0; }

  /* AI icon badge */
  .ai-badge {
    position: absolute;
    right: 40px;
    bottom: 280px;
    width: 48px;
    height: 48px;
    background: #1A1A1A;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  }
  .ai-badge svg {
    width: 28px;
    height: 28px;
  }

</style></head><body>
  <!-- Logo -->
  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />

  <!-- Gradient Stars -->
  <div class="star star-large"></div>
  <div class="star star-medium"></div>

  <!-- Dashed connection lines -->
  <div class="dashed-path dashed-1"></div>
  <div class="dashed-path dashed-2"></div>

  <!-- Sound wave card -->
  <div class="wave-card">
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
  </div>

  <!-- AI Badge -->
  <div class="ai-badge">
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 3L14.5 8.5L20 9L16 13L17.5 19L12 16L6.5 19L8 13L4 9L9.5 8.5L12 3Z" fill="#00D4AA"/>
    </svg>
  </div>

  <!-- Browser mockup -->
  <div class="browser-card">
    <div class="browser-header">
      <div class="browser-dot"></div>
      <div class="browser-dot"></div>
      <div class="browser-dot"></div>
    </div>
    <div class="browser-content">
      <div class="browser-line"></div>
      <div class="browser-line"></div>
      <div class="browser-line"></div>
    </div>
  </div>

  <!-- Main content -->
  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${content.cta ? `<div class="cta">${content.cta}</div>` : ''}
  </div>
</body></html>`;
}

// ─── Dark Mode with UI Pills & Gradient Arches ──────────────────────────────
// Based on: banner_2_v2

function darkModeUITemplate(
  content: {
    headline: string;
    highlightWords: string[];
    cta?: string;
    uiPills: Array<{ icon: string; label: string; primary?: boolean }>;
  },
  assets: { logoBase64: string }
): string {
  let processedHeadline = content.headline;
  content.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  });

  const pillsHTML = content.uiPills.map(pill => `
    <div class="pill ${pill.primary ? 'pill-primary' : ''}">
      <span class="pill-icon">${pill.icon}</span>
      <span class="pill-label">${pill.label}</span>
    </div>
    <div class="connector"></div>
  `).join('').slice(0, -32); // Remove last connector

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1200px;
    height: 627px;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
    background: #0A0A0A;
    color: #FFFFFF;
  }

  /* Gradient arch decorations - like banner_2_v2 */
  .arch {
    position: absolute;
    border-radius: 999px;
  }
  .arch-1 {
    width: 120px;
    height: 400px;
    background: linear-gradient(180deg, #0D4A4A 0%, transparent 100%);
    right: -20px;
    top: 80px;
    opacity: 0.6;
  }
  .arch-2 {
    width: 100px;
    height: 380px;
    background: linear-gradient(180deg, #0D4A4A 0%, transparent 100%);
    right: 140px;
    top: 60px;
    opacity: 0.5;
  }
  .arch-3 {
    width: 80px;
    height: 350px;
    background: linear-gradient(180deg, #0D4A4A 0%, transparent 100%);
    right: 280px;
    top: 100px;
    opacity: 0.4;
  }
  .arch-4 {
    width: 100px;
    height: 380px;
    background: linear-gradient(180deg, #0D4A4A 0%, transparent 100%);
    left: -20px;
    top: 80px;
    opacity: 0.5;
  }
  .arch-5 {
    width: 80px;
    height: 350px;
    background: linear-gradient(180deg, #0D4A4A 0%, transparent 100%);
    left: 120px;
    top: 100px;
    opacity: 0.4;
  }

  /* Logo centered */
  .logo {
    position: absolute;
    top: 40px;
    left: 50%;
    transform: translateX(-50%);
    height: 32px;
  }

  /* UI Pills stack - centered */
  .pills-stack {
    position: absolute;
    top: 120px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .pill {
    background: rgba(200, 230, 225, 0.9);
    color: #1A1A1A;
    padding: 14px 32px;
    border-radius: 40px;
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 4px 20px rgba(0, 200, 180, 0.2);
  }
  .pill-primary {
    background: linear-gradient(135deg, #80F0E0 0%, #60E0D0 100%);
    padding: 18px 40px;
    font-size: 22px;
    box-shadow: 0 0 40px rgba(0, 220, 200, 0.3);
  }
  .pill-icon {
    font-size: 1.1em;
  }

  .connector {
    width: 2px;
    height: 20px;
    background: rgba(255,255,255,0.3);
    margin: 8px 0;
  }

  /* Headline at bottom */
  .content {
    position: absolute;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    max-width: 900px;
  }

  .headline {
    font-size: 48px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -1px;
    margin-bottom: 24px;
  }
  .headline .highlight {
    color: #00E3CC;
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
  }

</style></head><body>
  <!-- Gradient arches -->
  <div class="arch arch-1"></div>
  <div class="arch arch-2"></div>
  <div class="arch arch-3"></div>
  <div class="arch arch-4"></div>
  <div class="arch arch-5"></div>

  <!-- Logo -->
  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />

  <!-- UI Pills -->
  <div class="pills-stack">
    ${pillsHTML}
  </div>

  <!-- Content -->
  <div class="content">
    <div class="headline">${processedHeadline}</div>
    ${content.cta ? `<div class="cta">${content.cta}</div>` : ''}
  </div>
</body></html>`;
}

// ─── Dark Mode with Globe & Chat Bubbles ────────────────────────────────────
// Based on: banner_33

function darkModeGlobeTemplate(
  content: {
    headline: string;
    highlightWords: string[];
    chatBubbles: Array<{ label: string; x: number; y: number }>;
  },
  assets: { logoBase64: string }
): string {
  let processedHeadline = content.headline;
  content.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  });

  const bubblesHTML = content.chatBubbles.map(bubble => `
    <div class="chat-bubble" style="left: ${bubble.x}%; top: ${bubble.y}%;">
      <span class="sparkle">✦</span>
      <span class="bubble-text">${bubble.label}</span>
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1200px;
    height: 627px;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
    background: #0A0A0A;
    color: #FFFFFF;
  }

  /* Logo centered */
  .logo {
    position: absolute;
    top: 40px;
    left: 50%;
    transform: translateX(-50%);
    height: 32px;
  }

  /* Headline - centered upper */
  .headline {
    position: absolute;
    top: 100px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    font-size: 56px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -1px;
    max-width: 800px;
  }
  .headline .highlight {
    color: #00C9E8;
  }

  /* Globe illustration - grayscale */
  .globe {
    position: absolute;
    bottom: -100px;
    left: 50%;
    transform: translateX(-50%);
    width: 900px;
    height: 500px;
    background: radial-gradient(ellipse at center, #1A1A1A 0%, #0A0A0A 70%);
    border-radius: 50%;
    overflow: hidden;
  }
  .globe::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background:
      radial-gradient(circle at 30% 40%, rgba(40,40,40,0.8) 0%, transparent 30%),
      radial-gradient(circle at 70% 50%, rgba(50,50,50,0.6) 0%, transparent 25%),
      radial-gradient(circle at 50% 60%, rgba(35,35,35,0.7) 0%, transparent 35%);
  }

  /* Chat bubbles with gradient */
  .chat-bubble {
    position: absolute;
    background: linear-gradient(135deg, #00E5FF 0%, #00D4AA 100%);
    color: #1A1A1A;
    padding: 12px 20px;
    border-radius: 20px;
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 20px rgba(0, 200, 220, 0.3);
  }
  .chat-bubble::after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 20px;
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 10px solid #00D4AA;
  }
  .sparkle {
    color: #FFFFFF;
    font-size: 12px;
  }

  /* Floating chat icons */
  .chat-icon {
    position: absolute;
    width: 48px;
    height: 36px;
    background: linear-gradient(135deg, #60E0FF 0%, #40D0CC 100%);
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
  }
  .chat-icon::before {
    content: '';
    width: 24px;
    height: 8px;
    background: rgba(255,255,255,0.5);
    border-radius: 4px;
  }
  .chat-icon-1 { left: 8%; top: 55%; }
  .chat-icon-2 { right: 10%; top: 48%; }
  .chat-icon-3 { left: 25%; bottom: 25%; }
  .chat-icon-4 { right: 20%; bottom: 30%; }

</style></head><body>
  <!-- Logo -->
  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />

  <!-- Headline -->
  <div class="headline">${processedHeadline}</div>

  <!-- Globe -->
  <div class="globe"></div>

  <!-- Chat bubbles -->
  ${bubblesHTML}

  <!-- Floating chat icons -->
  <div class="chat-icon chat-icon-1"></div>
  <div class="chat-icon chat-icon-2"></div>
  <div class="chat-icon chat-icon-3"></div>
  <div class="chat-icon chat-icon-4"></div>
</body></html>`;
}

// ─── Photo Background with Chat UI ──────────────────────────────────────────
// Based on: banner_14

function photoOverlayTemplate(
  content: {
    headline: string;
    highlightWords: string[];
    chatMessages: Array<{ text: string; isAI: boolean }>;
  },
  assets: {
    logoBase64: string;
    photoBase64: string;
  }
): string {
  let processedHeadline = content.headline;
  content.highlightWords.forEach(word => {
    processedHeadline = processedHeadline.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  });

  const chatHTML = content.chatMessages.map(msg => `
    <div class="chat-msg ${msg.isAI ? 'ai' : 'user'}">
      <div class="chat-avatar">${msg.isAI ? '✦' : 'P'}</div>
      <div class="chat-text">${msg.text}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1200px;
    height: 627px;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
    background: #0A0A0A;
    color: #FFFFFF;
  }

  /* Background photo - grayscale */
  .bg-photo {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: grayscale(100%) brightness(0.4);
  }

  /* Gradient overlay */
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%);
  }

  /* Logo */
  .logo {
    position: absolute;
    top: 40px;
    left: 50%;
    transform: translateX(-50%);
    height: 32px;
    z-index: 10;
  }

  /* Semi-transparent icon */
  .bg-icon {
    position: absolute;
    top: 80px;
    left: 60px;
    width: 200px;
    height: 200px;
    opacity: 0.15;
    z-index: 5;
  }
  .bg-icon svg {
    width: 100%;
    height: 100%;
  }

  /* Chat conversation */
  .chat-container {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    gap: 16px;
    z-index: 10;
  }

  .chat-msg {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .chat-msg.user {
    flex-direction: row-reverse;
  }

  .chat-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
  }
  .ai .chat-avatar {
    background: linear-gradient(135deg, #60E0FF 0%, #40D0CC 100%);
    color: #1A1A1A;
  }
  .user .chat-avatar {
    background: #1A1A1A;
    color: #FFFFFF;
  }

  .chat-text {
    padding: 14px 20px;
    border-radius: 20px;
    font-size: 16px;
    max-width: 340px;
  }
  .ai .chat-text {
    background: #FFFFFF;
    color: #1A1A1A;
  }
  .user .chat-text {
    background: #2A2A2A;
    color: #FFFFFF;
  }

  /* Headline at bottom */
  .headline {
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    font-size: 48px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -1px;
    z-index: 10;
    max-width: 900px;
  }
  .headline .highlight {
    color: #00C9E8;
  }

</style></head><body>
  <!-- Background photo -->
  <img src="${assets.photoBase64}" class="bg-photo" alt="" />
  <div class="overlay"></div>

  <!-- Semi-transparent bank icon -->
  <div class="bg-icon">
    <svg viewBox="0 0 100 100" fill="none" stroke="white" stroke-width="1.5">
      <path d="M50 10L10 35V40H90V35L50 10Z"/>
      <rect x="15" y="45" width="10" height="35"/>
      <rect x="35" y="45" width="10" height="35"/>
      <rect x="55" y="45" width="10" height="35"/>
      <rect x="75" y="45" width="10" height="35"/>
      <rect x="10" y="82" width="80" height="8"/>
    </svg>
  </div>

  <!-- Logo -->
  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />

  <!-- Chat -->
  <div class="chat-container">
    ${chatHTML}
  </div>

  <!-- Headline -->
  <div class="headline">${processedHeadline}</div>
</body></html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎨 LinkedIn V2 - Real Asset Styles\n');

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `linkedin-v2-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Load logos
  const whiteLogoPath = await selectLogo('#000000');
  const blackLogoPath = await selectLogo('#FFFFFF');
  const whiteLogo = await imageToBase64(path.join(process.cwd(), whiteLogoPath));
  const blackLogo = await imageToBase64(path.join(process.cwd(), blackLogoPath));

  // Load a stock photo for the photo overlay template
  const stockPhotoPath = `${ASSETS_ROOT}/telnyx-assets/_NEW_AdGen_Library/photography/industry/finance/industry-finance-photography-tap-payment-transaction-contactless-phone-iphone.jpg`;
  const stockPhoto = await imageToBase64(stockPhotoPath);

  console.log(`   White logo: ${whiteLogo ? '✓' : '✗'}`);
  console.log(`   Black logo: ${blackLogo ? '✓' : '✗'}`);
  console.log(`   Stock photo: ${stockPhoto ? '✓' : '✗'}`);

  // ─── 1. Light Mode - Fintech ──────────────────────────────────────────────
  const lightFintech = lightModeTemplate(
    {
      headline: 'Voice AI built for fintech stacks',
      highlightWords: ['Voice AI'],
      cta: 'Try Telnyx Free',
    },
    { logoBase64: blackLogo }
  );
  await convertHTMLtoPNG(lightFintech, path.join(outputDir, '01-light-fintech.png'), 1200, 627);
  console.log('   ✓ 01-light-fintech.png');

  // ─── 2. Dark Mode - Infrastructure Pills ──────────────────────────────────
  const darkInfra = darkModeUITemplate(
    {
      headline: 'Reliable Voice AI starts with a unified infrastructure',
      highlightWords: ['Voice AI'],
      cta: 'Learn more',
      uiPills: [
        { icon: '✦', label: 'Ai', primary: true },
        { icon: '🌐', label: 'Network' },
        { icon: '📞', label: 'Numbers' },
      ],
    },
    { logoBase64: whiteLogo }
  );
  await convertHTMLtoPNG(darkInfra, path.join(outputDir, '02-dark-infrastructure.png'), 1200, 627);
  console.log('   ✓ 02-dark-infrastructure.png');

  // ─── 3. Dark Mode - Global Agents ─────────────────────────────────────────
  const darkGlobal = darkModeGlobeTemplate(
    {
      headline: 'Agents that sound local everywhere',
      highlightWords: ['everywhere'],
      chatBubbles: [
        { label: 'Ticketing...', x: 25, y: 52 },
        { label: 'Reception...', x: 65, y: 48 },
        { label: 'Support...', x: 40, y: 62 },
      ],
    },
    { logoBase64: whiteLogo }
  );
  await convertHTMLtoPNG(darkGlobal, path.join(outputDir, '03-dark-global-agents.png'), 1200, 627);
  console.log('   ✓ 03-dark-global-agents.png');

  // ─── 4. Photo Overlay - Fintech Flows ─────────────────────────────────────
  const photoFintech = photoOverlayTemplate(
    {
      headline: 'Voice AI for regulated fintech flows',
      highlightWords: ['Voice AI'],
      chatMessages: [
        { text: "Great, you're all set! Your card is ready to use", isAI: true },
        { text: "That's awesome, thank you", isAI: false },
      ],
    },
    {
      logoBase64: whiteLogo,
      photoBase64: stockPhoto,
    }
  );
  await convertHTMLtoPNG(photoFintech, path.join(outputDir, '04-photo-fintech.png'), 1200, 627);
  console.log('   ✓ 04-photo-fintech.png');

  console.log(`\n✅ Done! Output: ${outputDir}\n`);

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
