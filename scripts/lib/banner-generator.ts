/**
 * Dynamic Banner Generator v2
 * Dense, impactful layouts matching reference banners
 */

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { selectLogo } from '../../src/lib/logo-selector';
import { selectAsset, CHAT_MESSAGES } from './asset-index';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BannerBrief {
  campaign: string;
  industry: 'voice-ai' | 'fintech' | 'logistics' | 'restaurants' | 'retail' | 'enterprise' | 'healthcare' | 'travel' | 'insurance' | 'general';
  headline: string;
  highlightWords?: string[];
  subtext?: string;
  cta?: string;
  style?: 'dark' | 'light' | 'photo' | 'auto';
  template?: 'globe-chat' | 'layered-arches' | 'photo-overlay' | 'feature-cards' | 'split-visual' | 'auto';
  colorScheme?: 'teal' | 'purple' | 'pink' | 'warm' | 'neutral';
  format?: 'square' | 'linkedin';
  size?: { width: number; height: number };
}

export interface GeneratedBanner {
  path: string;
  brief: BannerBrief;
  template: string;
  assets: string[];
}

// ─── Config ─────────────────────────────────────────────────────────────────

const BRAND_ASSETS = '/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/brand-assets';
const PP_FORMULA_FONT = `${BRAND_ASSETS}/fonts/PP Formula - Extrabold v2.0/PPFormula-Extrabold.ttf`;

let fontBase64Cache: string | null = null;
let whiteLogoCache: string | null = null;
let blackLogoCache: string | null = null;

// ─── Color Schemes ──────────────────────────────────────────────────────────

const COLOR_SCHEMES = {
  teal: {
    bg: '#0A0A0A',
    bgLight: '#F5F5F0',
    accent: '#5DE8DC',
    accentDark: '#00B4A8',
    accentGradient: 'linear-gradient(180deg, #00E8FF 0%, #00D4AA 100%)',
    archColor: 'rgba(0, 100, 100, 0.8)',
    archColorLight: 'rgba(93, 232, 220, 0.9)',
    text: '#FFFFFF',
    textDark: '#1A1A1A',
  },
  purple: {
    bg: '#0A0A0A',
    bgLight: '#F8F5FF',
    accent: '#A78BFA',
    accentDark: '#7C3AED',
    accentGradient: 'linear-gradient(180deg, #C4B5FD 0%, #8B5CF6 100%)',
    archColor: 'rgba(124, 58, 237, 0.7)',
    archColorLight: 'rgba(167, 139, 250, 0.9)',
    text: '#FFFFFF',
    textDark: '#1A1A1A',
  },
  pink: {
    bg: '#0A0A0A',
    bgLight: '#FFF5F7',
    accent: '#F472B6',
    accentDark: '#DB2777',
    accentGradient: 'linear-gradient(180deg, #FBCFE8 0%, #EC4899 100%)',
    archColor: 'rgba(219, 39, 119, 0.7)',
    archColorLight: 'rgba(244, 114, 182, 0.9)',
    text: '#FFFFFF',
    textDark: '#1A1A1A',
  },
  warm: {
    bg: '#0F0A05',
    bgLight: '#FFFBF5',
    accent: '#FBBF24',
    accentDark: '#D97706',
    accentGradient: 'linear-gradient(180deg, #FDE68A 0%, #F59E0B 100%)',
    archColor: 'rgba(217, 119, 6, 0.7)',
    archColorLight: 'rgba(251, 191, 36, 0.9)',
    text: '#FFFFFF',
    textDark: '#1A1A1A',
  },
  neutral: {
    bg: '#0A0A0A',
    bgLight: '#F5F5F5',
    accent: '#5DE8DC',
    accentDark: '#00B4A8',
    accentGradient: 'linear-gradient(180deg, #00E8FF 0%, #00D4AA 100%)',
    archColor: 'rgba(0, 100, 100, 0.8)',
    archColorLight: 'rgba(93, 232, 220, 0.9)',
    text: '#FFFFFF',
    textDark: '#1A1A1A',
  },
};

const INDUSTRY_COLORS: Record<string, keyof typeof COLOR_SCHEMES> = {
  'voice-ai': 'teal',
  'fintech': 'teal',
  'healthcare': 'teal',
  'restaurants': 'warm',
  'travel': 'warm',
  'retail': 'purple',
  'insurance': 'neutral',
  'logistics': 'neutral',
  'enterprise': 'purple',
  'general': 'teal',
};

// ─── Utilities ──────────────────────────────────────────────────────────────

async function loadFontBase64(): Promise<string> {
  if (fontBase64Cache) return fontBase64Cache;
  const fontBuffer = await fs.readFile(PP_FORMULA_FONT);
  fontBase64Cache = fontBuffer.toString('base64');
  return fontBase64Cache;
}

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext;
    return `data:image/${mimeType};base64,${base64}`;
  } catch {
    console.error(`Failed to load: ${imagePath}`);
    return '';
  }
}

async function getLogo(background: 'dark' | 'light'): Promise<string> {
  if (background === 'dark') {
    if (whiteLogoCache) return whiteLogoCache;
    const logoPath = await selectLogo('#000000');
    whiteLogoCache = await imageToBase64(path.join(process.cwd(), logoPath));
    return whiteLogoCache;
  } else {
    if (blackLogoCache) return blackLogoCache;
    const logoPath = await selectLogo('#FFFFFF');
    blackLogoCache = await imageToBase64(path.join(process.cwd(), logoPath));
    return blackLogoCache;
  }
}

function processHeadline(headline: string, highlightWords?: string[]): string {
  if (!highlightWords?.length) return headline;
  let processed = headline;
  highlightWords.forEach(word => {
    processed = processed.replace(
      new RegExp(`(${word})`, 'gi'),
      '<span class="hl">$1</span>'
    );
  });
  return processed;
}

function getIndustryLabels(industry: string): string[] {
  const labels: Record<string, string[]> = {
    'voice-ai': ['Support...', 'Sales...', 'Booking...'],
    'healthcare': ['Appointments...', 'Prescriptions...', 'Lab Results...'],
    'restaurants': ['Reservations...', 'Orders...', 'Waitlist...'],
    'travel': ['Bookings...', 'Concierge...', 'Itinerary...'],
    'fintech': ['Transfers...', 'Support...', 'Verification...'],
    'retail': ['Returns...', 'Orders...', 'Support...'],
    'insurance': ['Claims...', 'Policy...', 'Roadside...'],
    'logistics': ['Tracking...', 'Dispatch...', 'Updates...'],
    'enterprise': ['Ticketing...', 'Reception...', 'Support...'],
  };
  return labels[industry] || labels['voice-ai'];
}

// ─── Template 1: Globe with Chat Bubbles (like banner_33) ───────────────────

function globeChatHTML(
  brief: BannerBrief,
  fontBase64: string,
  logoBase64: string,
  colors: typeof COLOR_SCHEMES.teal,
  size: { width: number; height: number }
): string {
  const headline = processHeadline(brief.headline, brief.highlightWords);
  const labels = getIndustryLabels(brief.industry);
  const isSquare = size.width === size.height;

  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${size.width}px;
    height: ${size.height}px;
    background: ${colors.bg};
    font-family: 'PP Formula', sans-serif;
    color: ${colors.text};
    position: relative;
    overflow: hidden;
  }
  .logo { position: absolute; top: ${isSquare ? 50 : 40}px; left: 50%; transform: translateX(-50%); height: ${isSquare ? 56 : 48}px; }

  .headline {
    position: absolute;
    top: ${isSquare ? 140 : 100}px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    font-size: ${isSquare ? 72 : 56}px;
    font-weight: bold;
    line-height: 1.0;
    width: 90%;
  }
  .hl { color: ${colors.accent}; }

  /* Globe */
  .globe {
    position: absolute;
    bottom: ${isSquare ? -150 : -100}px;
    left: 50%;
    transform: translateX(-50%);
    width: ${isSquare ? 900 : 1100}px;
    height: ${isSquare ? 600 : 500}px;
    border-radius: 50%;
    background: radial-gradient(ellipse at center, #2A2A2A 0%, #1A1A1A 50%, transparent 70%);
  }
  .globe::before {
    content: '';
    position: absolute;
    top: 10%;
    left: 10%;
    right: 10%;
    bottom: 30%;
    background:
      linear-gradient(90deg, transparent 48%, rgba(255,255,255,0.1) 50%, transparent 52%),
      linear-gradient(0deg, transparent 48%, rgba(255,255,255,0.1) 50%, transparent 52%);
    background-size: 80px 80px;
    border-radius: 50%;
    opacity: 0.5;
  }

  /* Chat bubbles scattered on globe */
  .chat-bubble {
    position: absolute;
    background: ${colors.accentGradient};
    color: ${colors.textDark};
    padding: ${isSquare ? '14px 24px' : '12px 20px'};
    border-radius: 20px;
    font-size: ${isSquare ? 20 : 16}px;
    font-family: system-ui, sans-serif;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chat-bubble::before {
    content: '✦';
    font-size: ${isSquare ? 16 : 14}px;
  }
  .bubble-1 { bottom: ${isSquare ? 380 : 280}px; left: ${isSquare ? 15 : 10}%; }
  .bubble-2 { bottom: ${isSquare ? 280 : 200}px; right: ${isSquare ? 20 : 15}%; }
  .bubble-3 { bottom: ${isSquare ? 200 : 150}px; left: ${isSquare ? 30 : 25}%; }

  /* Icon bubbles */
  .icon-bubble {
    position: absolute;
    width: ${isSquare ? 70 : 56}px;
    height: ${isSquare ? 70 : 56}px;
    background: ${colors.accentGradient};
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  }
  .icon-bubble svg {
    width: 60%;
    height: 60%;
    fill: ${colors.textDark};
  }
  .icon-1 { bottom: ${isSquare ? 320 : 240}px; left: ${isSquare ? 5 : 3}%; }
  .icon-2 { bottom: ${isSquare ? 150 : 120}px; right: ${isSquare ? 8 : 5}%; }
  .icon-3 { bottom: ${isSquare ? 250 : 180}px; right: ${isSquare ? 35 : 30}%; }

  .cta {
    position: absolute;
    bottom: ${isSquare ? 50 : 40}px;
    left: 50%;
    transform: translateX(-50%);
    font-size: ${isSquare ? 22 : 18}px;
    font-family: system-ui, sans-serif;
  }
</style>
</head><body>
  <img src="${logoBase64}" class="logo" />
  <div class="headline">${headline}</div>

  <div class="globe"></div>

  <div class="chat-bubble bubble-1">${labels[0]}</div>
  <div class="chat-bubble bubble-2">${labels[1]}</div>
  <div class="chat-bubble bubble-3">${labels[2]}</div>

  <div class="icon-bubble icon-1">
    <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
  </div>
  <div class="icon-bubble icon-2">
    <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
  </div>
  <div class="icon-bubble icon-3">
    <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
  </div>

  <div class="cta">${brief.cta || 'Learn more'} ></div>
</body></html>`;
}

// ─── Template 2: Layered Arches with Stars (like banner_16) ─────────────────

function layeredArchesHTML(
  brief: BannerBrief,
  fontBase64: string,
  logoBase64: string,
  colors: typeof COLOR_SCHEMES.teal,
  size: { width: number; height: number }
): string {
  const headline = processHeadline(brief.headline, brief.highlightWords);
  const isSquare = size.width === size.height;

  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${size.width}px;
    height: ${size.height}px;
    background: ${colors.bg};
    font-family: 'PP Formula', sans-serif;
    color: ${colors.text};
    position: relative;
    overflow: hidden;
  }
  .logo { position: absolute; top: ${isSquare ? 50 : 40}px; left: ${isSquare ? 50 : 60}px; height: ${isSquare ? 56 : 48}px; }

  /* Arches - multiple layers */
  .arch {
    position: absolute;
    border-radius: 999px;
  }
  .arch-dark { background: ${colors.archColor}; }
  .arch-light { background: ${colors.archColorLight}; }

  /* Back layer - dark arches */
  .arch-1 { right: ${isSquare ? -30 : 100}px; top: ${isSquare ? 80 : 60}px; width: ${isSquare ? 100 : 80}px; height: ${isSquare ? 700 : 450}px; }
  .arch-2 { right: ${isSquare ? 60 : 170}px; top: ${isSquare ? 120 : 80}px; width: ${isSquare ? 80 : 70}px; height: ${isSquare ? 600 : 400}px; opacity: 0.8; }
  .arch-3 { right: ${isSquare ? 130 : 230}px; top: ${isSquare ? 160 : 100}px; width: ${isSquare ? 70 : 60}px; height: ${isSquare ? 520 : 360}px; opacity: 0.6; }
  .arch-4 { right: ${isSquare ? 190 : 280}px; top: ${isSquare ? 200 : 120}px; width: ${isSquare ? 60 : 50}px; height: ${isSquare ? 440 : 320}px; opacity: 0.4; }

  /* Front layer - bright arches */
  .arch-5 { right: ${isSquare ? 250 : 340}px; top: ${isSquare ? 300 : 180}px; width: ${isSquare ? 120 : 100}px; height: ${isSquare ? 500 : 380}px; }
  .arch-6 { right: ${isSquare ? 360 : 430}px; top: ${isSquare ? 350 : 220}px; width: ${isSquare ? 100 : 80}px; height: ${isSquare ? 450 : 340}px; opacity: 0.9; }

  /* Stars */
  .star {
    position: absolute;
    background: ${colors.accentGradient};
    clip-path: polygon(50% 0%, 61% 35%, 100% 50%, 61% 65%, 50% 100%, 39% 65%, 0% 50%, 39% 35%);
  }
  .star-1 { width: ${isSquare ? 200 : 160}px; height: ${isSquare ? 200 : 160}px; right: ${isSquare ? 280 : 350}px; top: ${isSquare ? 220 : 140}px; }
  .star-2 { width: ${isSquare ? 120 : 100}px; height: ${isSquare ? 120 : 100}px; right: ${isSquare ? 150 : 200}px; top: ${isSquare ? 400 : 260}px; opacity: 0.8; }

  /* Content */
  .content {
    position: absolute;
    top: ${isSquare ? 160 : 110}px;
    left: ${isSquare ? 50 : 60}px;
    max-width: ${isSquare ? 600 : 500}px;
  }
  .headline {
    font-size: ${isSquare ? 68 : 52}px;
    font-weight: bold;
    line-height: 1.0;
    margin-bottom: ${isSquare ? 30 : 20}px;
  }
  .hl { color: ${colors.accent}; }
  .subtext {
    font-size: ${isSquare ? 22 : 18}px;
    font-family: system-ui, sans-serif;
    color: rgba(255,255,255,0.7);
    margin-bottom: ${isSquare ? 30 : 20}px;
    line-height: 1.4;
  }

  /* Code card */
  .code-card {
    position: absolute;
    bottom: ${isSquare ? 200 : 120}px;
    right: ${isSquare ? 80 : 100}px;
    background: rgba(255,255,255,0.95);
    border-radius: 16px;
    padding: 16px 20px;
    max-width: ${isSquare ? 320 : 280}px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  }
  .code-dots {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }
  .code-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #DDD;
  }
  .code-text {
    font-family: monospace;
    font-size: ${isSquare ? 13 : 11}px;
    color: #333;
    line-height: 1.5;
  }

  /* Waveform badge */
  .waveform-badge {
    position: absolute;
    bottom: ${isSquare ? 420 : 280}px;
    left: ${isSquare ? 60 : 80}px;
    background: #1A1A1A;
    border-radius: 16px;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  }
  .wave-bar {
    width: 6px;
    background: ${colors.text};
    border-radius: 3px;
  }
  .wave-bar:nth-child(1) { height: 16px; }
  .wave-bar:nth-child(2) { height: 28px; }
  .wave-bar:nth-child(3) { height: 20px; }
  .wave-bar:nth-child(4) { height: 32px; }
  .wave-bar:nth-child(5) { height: 18px; }

  /* Dashed connector */
  .dashed-line {
    position: absolute;
    border: 2px dashed rgba(255,255,255,0.3);
    border-radius: 20px;
  }
  .dashed-1 {
    bottom: ${isSquare ? 250 : 160}px;
    right: ${isSquare ? 380 : 380}px;
    width: 80px;
    height: 120px;
    border-right: none;
    border-top: none;
  }

  .cta {
    position: absolute;
    bottom: ${isSquare ? 50 : 40}px;
    left: ${isSquare ? 50 : 60}px;
    font-size: ${isSquare ? 22 : 18}px;
    font-family: system-ui, sans-serif;
  }
</style>
</head><body>
  <img src="${logoBase64}" class="logo" />

  <div class="arch arch-dark arch-1"></div>
  <div class="arch arch-dark arch-2"></div>
  <div class="arch arch-dark arch-3"></div>
  <div class="arch arch-dark arch-4"></div>
  <div class="arch arch-light arch-5"></div>
  <div class="arch arch-light arch-6"></div>

  <div class="star star-1"></div>
  <div class="star star-2"></div>

  <div class="content">
    <div class="headline">${headline}</div>
    ${brief.subtext ? `<div class="subtext">${brief.subtext}</div>` : ''}
  </div>

  <div class="waveform-badge">
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
    <div class="wave-bar"></div>
  </div>

  <div class="dashed-line dashed-1"></div>

  <div class="code-card">
    <div class="code-dots"><div class="code-dot"></div><div class="code-dot"></div><div class="code-dot"></div></div>
    <div class="code-text">curl -L 'https://api.telnyx.com/<br/>v2/calls/CALL_CONTROL_ID/<br/>actions/ai_assistant_start'</div>
  </div>

  <div class="cta">${brief.cta || 'Try Telnyx free'} ></div>
</body></html>`;
}

// ─── Template 3: Photo Overlay with Chat (like banner_14) ───────────────────

function photoOverlayHTML(
  brief: BannerBrief,
  fontBase64: string,
  logoBase64: string,
  photoBase64: string,
  colors: typeof COLOR_SCHEMES.teal,
  size: { width: number; height: number }
): string {
  const headline = processHeadline(brief.headline, brief.highlightWords);
  const isSquare = size.width === size.height;
  const messages = CHAT_MESSAGES[brief.industry] || CHAT_MESSAGES['voice-ai'];
  const msg = messages[0];

  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${size.width}px;
    height: ${size.height}px;
    font-family: 'PP Formula', sans-serif;
    color: ${colors.text};
    position: relative;
    overflow: hidden;
  }
  .photo {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: grayscale(100%) brightness(0.45);
  }
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%);
  }
  .logo { position: absolute; top: ${isSquare ? 50 : 40}px; left: 50%; transform: translateX(-50%); height: ${isSquare ? 56 : 48}px; z-index: 10; }

  /* Industry icon (e.g., bank for fintech) */
  .industry-icon {
    position: absolute;
    top: ${isSquare ? 120 : 90}px;
    left: ${isSquare ? 60 : 80}px;
    width: ${isSquare ? 120 : 100}px;
    height: ${isSquare ? 120 : 100}px;
    opacity: 0.4;
    z-index: 5;
  }
  .industry-icon svg {
    width: 100%;
    height: 100%;
    stroke: ${colors.text};
    stroke-width: 1;
    fill: none;
  }

  /* Chat bubbles */
  .chat-container {
    position: absolute;
    ${isSquare ? 'left: 50%; top: 50%; transform: translate(-50%, -50%);' : 'left: 60px; top: 200px;'}
    display: flex;
    flex-direction: column;
    gap: 16px;
    z-index: 10;
  }
  .chat-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .chat-icon {
    width: ${isSquare ? 56 : 48}px;
    height: ${isSquare ? 56 : 48}px;
    background: ${colors.accentGradient};
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${isSquare ? 24 : 20}px;
    flex-shrink: 0;
  }
  .chat-bubble {
    background: rgba(255,255,255,0.95);
    color: #1A1A1A;
    padding: ${isSquare ? '18px 26px' : '14px 22px'};
    border-radius: 24px;
    font-size: ${isSquare ? 20 : 16}px;
    font-family: system-ui, sans-serif;
    line-height: 1.4;
    max-width: ${isSquare ? 400 : 340}px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  }
  .chat-bubble-user {
    background: #1A1A1A;
    color: ${colors.text};
    align-self: flex-end;
    margin-left: auto;
  }
  .user-avatar {
    width: ${isSquare ? 48 : 40}px;
    height: ${isSquare ? 48 : 40}px;
    background: #333;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${isSquare ? 20 : 16}px;
    font-weight: bold;
  }

  /* Headline at bottom */
  .content {
    position: absolute;
    bottom: ${isSquare ? 80 : 60}px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    width: 90%;
    z-index: 10;
  }
  .headline {
    font-size: ${isSquare ? 64 : 48}px;
    font-weight: bold;
    line-height: 1.0;
  }
  .hl { color: ${colors.accent}; }
</style>
</head><body>
  <img src="${photoBase64}" class="photo" />
  <div class="overlay"></div>
  <img src="${logoBase64}" class="logo" />

  <div class="industry-icon">
    <svg viewBox="0 0 100 100">
      <path d="M50 10 L90 35 L90 90 L10 90 L10 35 Z M50 10 L50 35 M10 35 L90 35 M30 90 L30 55 L45 55 L45 90 M55 90 L55 55 L70 55 L70 90 M20 50 L20 80 M80 50 L80 80"/>
    </svg>
  </div>

  <div class="chat-container">
    <div class="chat-row">
      <div class="chat-icon">✦</div>
      <div class="chat-bubble">${msg.ai}</div>
    </div>
    ${msg.user ? `
    <div class="chat-row" style="flex-direction: row-reverse;">
      <div class="user-avatar">P</div>
      <div class="chat-bubble chat-bubble-user">${msg.user}</div>
    </div>
    ` : ''}
  </div>

  <div class="content">
    <div class="headline">${headline}</div>
  </div>
</body></html>`;
}

// ─── Template 4: Feature Cards (multiple floating cards) ────────────────────

function featureCardsHTML(
  brief: BannerBrief,
  fontBase64: string,
  logoBase64: string,
  colors: typeof COLOR_SCHEMES.teal,
  size: { width: number; height: number }
): string {
  const headline = processHeadline(brief.headline, brief.highlightWords);
  const isSquare = size.width === size.height;
  const labels = getIndustryLabels(brief.industry);

  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${size.width}px;
    height: ${size.height}px;
    background: ${colors.bgLight};
    font-family: 'PP Formula', sans-serif;
    color: ${colors.textDark};
    position: relative;
    overflow: hidden;
  }
  .logo { position: absolute; top: ${isSquare ? 50 : 40}px; left: ${isSquare ? 50 : 60}px; height: ${isSquare ? 56 : 48}px; }

  /* Large star in background */
  .bg-star {
    position: absolute;
    background: ${colors.accentGradient};
    clip-path: polygon(50% 0%, 61% 35%, 100% 50%, 61% 65%, 50% 100%, 39% 65%, 0% 50%, 39% 35%);
    opacity: 0.15;
    width: ${isSquare ? 800 : 700}px;
    height: ${isSquare ? 800 : 700}px;
    right: ${isSquare ? -200 : -150}px;
    bottom: ${isSquare ? -200 : -200}px;
  }

  .content {
    position: absolute;
    top: ${isSquare ? 160 : 110}px;
    left: ${isSquare ? 50 : 60}px;
    max-width: ${isSquare ? 550 : 480}px;
  }
  .headline {
    font-size: ${isSquare ? 68 : 52}px;
    font-weight: bold;
    line-height: 1.0;
    margin-bottom: ${isSquare ? 24 : 16}px;
  }
  .hl { color: ${colors.accentDark}; }
  .subtext {
    font-size: ${isSquare ? 22 : 18}px;
    font-family: system-ui, sans-serif;
    color: #555;
    line-height: 1.4;
  }

  /* Feature cards */
  .card {
    position: absolute;
    background: rgba(255,255,255,0.95);
    border-radius: 20px;
    padding: ${isSquare ? '20px 28px' : '16px 24px'};
    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .card-icon {
    width: ${isSquare ? 48 : 40}px;
    height: ${isSquare ? 48 : 40}px;
    background: ${colors.accentGradient};
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${isSquare ? 22 : 18}px;
    flex-shrink: 0;
  }
  .card-text {
    font-size: ${isSquare ? 18 : 15}px;
    font-family: system-ui, sans-serif;
    font-weight: 600;
    color: #1A1A1A;
  }
  .card-1 { right: ${isSquare ? 60 : 80}px; top: ${isSquare ? 180 : 120}px; }
  .card-2 { right: ${isSquare ? 120 : 140}px; top: ${isSquare ? 320 : 220}px; }
  .card-3 { right: ${isSquare ? 60 : 80}px; top: ${isSquare ? 460 : 320}px; }

  /* Dashed connectors */
  .dashed {
    position: absolute;
    border: 2px dashed rgba(0,0,0,0.15);
  }
  .dashed-1 {
    right: ${isSquare ? 200 : 220}px;
    top: ${isSquare ? 240 : 160}px;
    width: 60px;
    height: 80px;
    border-radius: 0 0 20px 0;
    border-left: none;
    border-top: none;
  }
  .dashed-2 {
    right: ${isSquare ? 200 : 220}px;
    top: ${isSquare ? 380 : 260}px;
    width: 60px;
    height: 80px;
    border-radius: 0 20px 0 0;
    border-left: none;
    border-bottom: none;
  }

  /* AI badge */
  .ai-badge {
    position: absolute;
    right: ${isSquare ? 280 : 300}px;
    top: ${isSquare ? 320 : 220}px;
    width: ${isSquare ? 64 : 52}px;
    height: ${isSquare ? 64 : 52}px;
    background: #1A1A1A;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.accent};
    font-size: ${isSquare ? 28 : 22}px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  }

  .cta {
    position: absolute;
    bottom: ${isSquare ? 60 : 50}px;
    left: ${isSquare ? 50 : 60}px;
    background: #1A1A1A;
    color: #FFF;
    padding: ${isSquare ? '18px 36px' : '14px 28px'};
    border-radius: 50px;
    font-size: ${isSquare ? 20 : 16}px;
    font-family: system-ui, sans-serif;
    font-weight: 600;
  }
</style>
</head><body>
  <div class="bg-star"></div>
  <img src="${logoBase64}" class="logo" />

  <div class="content">
    <div class="headline">${headline}</div>
    ${brief.subtext ? `<div class="subtext">${brief.subtext}</div>` : ''}
  </div>

  <div class="card card-1">
    <div class="card-icon">📞</div>
    <div class="card-text">${labels[0]}</div>
  </div>
  <div class="card card-2">
    <div class="card-icon">💬</div>
    <div class="card-text">${labels[1]}</div>
  </div>
  <div class="card card-3">
    <div class="card-icon">✉️</div>
    <div class="card-text">${labels[2]}</div>
  </div>

  <div class="dashed dashed-1"></div>
  <div class="dashed dashed-2"></div>
  <div class="ai-badge">✦</div>

  ${brief.cta ? `<div class="cta">${brief.cta} ></div>` : ''}
</body></html>`;
}

// ─── Template 5: Split Visual (composed visual takes half) ──────────────────

function splitVisualHTML(
  brief: BannerBrief,
  fontBase64: string,
  logoBase64: string,
  visualBase64: string,
  colors: typeof COLOR_SCHEMES.teal,
  size: { width: number; height: number }
): string {
  const headline = processHeadline(brief.headline, brief.highlightWords);
  const isSquare = size.width === size.height;

  return `<!DOCTYPE html>
<html><head>
<style>
  @font-face {
    font-family: 'PP Formula';
    src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${size.width}px;
    height: ${size.height}px;
    background: ${colors.bgLight};
    font-family: 'PP Formula', sans-serif;
    color: ${colors.textDark};
    position: relative;
    overflow: hidden;
  }
  .logo { position: absolute; top: ${isSquare ? 50 : 40}px; left: ${isSquare ? 50 : 60}px; height: ${isSquare ? 56 : 48}px; z-index: 10; }

  .visual {
    position: absolute;
    right: 0;
    top: 0;
    height: 100%;
    width: ${isSquare ? '55%' : '50%'};
    object-fit: cover;
    object-position: left center;
  }

  /* Gradient overlay on visual edge */
  .visual-fade {
    position: absolute;
    right: ${isSquare ? '45%' : '50%'};
    top: 0;
    height: 100%;
    width: 100px;
    background: linear-gradient(90deg, ${colors.bgLight} 0%, transparent 100%);
  }

  .content {
    position: absolute;
    top: ${isSquare ? 180 : 130}px;
    left: ${isSquare ? 50 : 60}px;
    max-width: ${isSquare ? '42%' : '45%'};
    z-index: 5;
  }
  .headline {
    font-size: ${isSquare ? 60 : 46}px;
    font-weight: bold;
    line-height: 1.0;
    margin-bottom: ${isSquare ? 24 : 18}px;
  }
  .hl { color: ${colors.accentDark}; }
  .subtext {
    font-size: ${isSquare ? 20 : 17}px;
    font-family: system-ui, sans-serif;
    color: #555;
    line-height: 1.4;
    margin-bottom: ${isSquare ? 32 : 24}px;
  }
  .cta {
    display: inline-block;
    background: #1A1A1A;
    color: #FFF;
    padding: ${isSquare ? '18px 36px' : '14px 28px'};
    border-radius: 50px;
    font-size: ${isSquare ? 18 : 15}px;
    font-family: system-ui, sans-serif;
    font-weight: 600;
  }
</style>
</head><body>
  <img src="${logoBase64}" class="logo" />
  <img src="${visualBase64}" class="visual" />
  <div class="visual-fade"></div>

  <div class="content">
    <div class="headline">${headline}</div>
    ${brief.subtext ? `<div class="subtext">${brief.subtext}</div>` : ''}
    ${brief.cta ? `<div class="cta">${brief.cta} ></div>` : ''}
  </div>
</body></html>`;
}

// ─── Template Selection ─────────────────────────────────────────────────────

function selectTemplate(brief: BannerBrief): { template: string; background: 'dark' | 'light'; colorScheme: keyof typeof COLOR_SCHEMES } {
  const colorScheme = brief.colorScheme || INDUSTRY_COLORS[brief.industry] || 'teal';

  if (brief.template && brief.template !== 'auto') {
    const bg = ['globe-chat', 'layered-arches', 'photo-overlay'].includes(brief.template) ? 'dark' : 'light';
    return { template: brief.template, background: bg as 'dark' | 'light', colorScheme };
  }

  const templates = [
    { template: 'globe-chat', background: 'dark' as const, weight: 2 },
    { template: 'layered-arches', background: 'dark' as const, weight: 2 },
    { template: 'photo-overlay', background: 'dark' as const, weight: 2 },
    { template: 'feature-cards', background: 'light' as const, weight: 2 },
    { template: 'split-visual', background: 'light' as const, weight: 2 },
  ];

  // Boost based on industry
  if (['healthcare', 'restaurants', 'travel', 'retail'].includes(brief.industry)) {
    templates.find(t => t.template === 'split-visual')!.weight += 2;
    templates.find(t => t.template === 'photo-overlay')!.weight += 1;
  }
  if (['voice-ai', 'enterprise'].includes(brief.industry)) {
    templates.find(t => t.template === 'globe-chat')!.weight += 2;
    templates.find(t => t.template === 'layered-arches')!.weight += 2;
  }
  if (['fintech', 'insurance'].includes(brief.industry)) {
    templates.find(t => t.template === 'photo-overlay')!.weight += 2;
  }

  const totalWeight = templates.reduce((sum, t) => sum + t.weight, 0);
  let random = Math.random() * totalWeight;
  for (const t of templates) {
    random -= t.weight;
    if (random <= 0) return { template: t.template, background: t.background, colorScheme };
  }

  return { template: 'globe-chat', background: 'dark', colorScheme };
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export async function generateBanner(brief: BannerBrief, outputDir: string): Promise<GeneratedBanner> {
  const format = brief.format || 'square';
  const size = brief.size || (format === 'linkedin' ? { width: 1200, height: 627 } : { width: 1080, height: 1080 });

  const { template, background, colorScheme } = selectTemplate(brief);
  const colors = COLOR_SCHEMES[colorScheme];

  const fontBase64 = await loadFontBase64();
  const logoBase64 = await getLogo(background);

  let html: string;
  const usedAssets: string[] = [];

  switch (template) {
    case 'globe-chat':
      html = globeChatHTML(brief, fontBase64, logoBase64, colors, size);
      break;

    case 'layered-arches':
      html = layeredArchesHTML(brief, fontBase64, logoBase64, colors, size);
      break;

    case 'photo-overlay': {
      const photo = selectAsset({ useCase: brief.industry, category: 'stock_photo' });
      if (!photo) {
        html = globeChatHTML(brief, fontBase64, logoBase64, colors, size);
        break;
      }
      const photoBase64 = await imageToBase64(photo.path);
      usedAssets.push(photo.id);
      html = photoOverlayHTML(brief, fontBase64, logoBase64, photoBase64, colors, size);
      break;
    }

    case 'feature-cards':
      html = featureCardsHTML(brief, fontBase64, logoBase64, colors, size);
      break;

    case 'split-visual': {
      const visual = selectAsset({ useCase: brief.industry, category: 'composed_visual' })
        || selectAsset({ useCase: brief.industry, category: 'feature_visual' });
      if (!visual) {
        html = featureCardsHTML(brief, fontBase64, logoBase64, colors, size);
        break;
      }
      const visualBase64 = await imageToBase64(visual.path);
      usedAssets.push(visual.id);
      html = splitVisualHTML(brief, fontBase64, logoBase64, visualBase64, colors, size);
      break;
    }

    default:
      html = globeChatHTML(brief, fontBase64, logoBase64, colors, size);
  }

  const formatSuffix = format === 'linkedin' ? '-linkedin' : '-square';
  const filename = `${brief.campaign.toLowerCase().replace(/\s+/g, '-')}-${template}-${colorScheme}${formatSuffix}.png`;
  const outputPath = path.join(outputDir, filename);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await browser.close();
  }

  return {
    path: outputPath,
    brief,
    template: `${template}-${colorScheme}`,
    assets: usedAssets,
  };
}

// ─── Batch Generators ───────────────────────────────────────────────────────

export async function generateBannerSet(brief: BannerBrief, outputDir: string): Promise<GeneratedBanner[]> {
  const results: GeneratedBanner[] = [];
  const colorScheme = brief.colorScheme || INDUSTRY_COLORS[brief.industry] || 'teal';

  const variations: Partial<BannerBrief>[] = [
    { template: 'globe-chat' as const, colorScheme },
    { template: 'layered-arches' as const, colorScheme },
    { template: 'photo-overlay' as const, colorScheme },
    { template: 'feature-cards' as const, colorScheme },
    { template: 'split-visual' as const, colorScheme },
  ];

  for (const variation of variations) {
    try {
      const result = await generateBanner({ ...brief, ...variation }, outputDir);
      results.push(result);
      console.log(`   ✓ ${path.basename(result.path)}`);
    } catch (e) {
      console.error(`   ✗ Failed: ${variation.template}`);
    }
  }

  return results;
}

export async function generateAllFormats(brief: BannerBrief, outputDir: string): Promise<GeneratedBanner[]> {
  const results: GeneratedBanner[] = [];

  console.log('   Square (1080x1080):');
  const squareResults = await generateBannerSet({ ...brief, format: 'square' }, outputDir);
  results.push(...squareResults);

  console.log('   LinkedIn (1200x627):');
  const linkedinResults = await generateBannerSet({ ...brief, format: 'linkedin' }, outputDir);
  results.push(...linkedinResults);

  return results;
}
