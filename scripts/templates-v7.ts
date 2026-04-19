/**
 * Templates V7 - Matching ACTUAL Telnyx StackAdapt Ads
 *
 * Based on real ad samples:
 * - Soft gradient backgrounds (teal/blue/pink)
 * - LARGE bold headlines
 * - Photography + device mockups
 * - Pill-shaped CTA buttons (black or teal)
 * - Full-bleed visuals
 */

import { Typography } from '../src/lib/typography';

export interface TemplateAssets {
  logoBase64: string;
  photoBase64?: string;      // Industry photo
  mockupBase64?: string;     // Device/UI mockup
  productIconBase64?: string; // 3D accent icon
}

export interface AdContent {
  headline: string;
  description: string;
  cta: string;
}

/* ─── Healthcare Style (300x250) with Photo + Mockup ─────────────────────────── */

export function healthcareAdTemplate(
  content: AdContent,
  assets: TemplateAssets,
  width: number,
  height: number
): string {
  // Scale factors based on 300x250 reference
  const scale = Math.min(width / 300, height / 250);

  const headlineSize = Math.round(18 * scale);
  const bodySize = Math.round(12 * scale);
  const ctaSize = Math.round(11 * scale);
  const padding = Math.round(16 * scale);
  const logoHeight = Math.round(14 * scale);

  const hasPhoto = !!assets.photoBase64;
  const hasMockup = !!assets.mockupBase64;

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
  }

  /* Gradient background */
  .bg-gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg,
      #E8F5F2 0%,
      #F0E8F5 30%,
      #E5F0F8 60%,
      #F5F3EE 100%
    );
  }

  /* Colorful accent gradient on left */
  .accent-gradient {
    position: absolute;
    left: 0;
    top: 0;
    width: 45%;
    height: 100%;
    background: linear-gradient(160deg,
      rgba(0, 210, 180, 0.5) 0%,
      rgba(180, 100, 220, 0.4) 50%,
      rgba(100, 180, 255, 0.3) 100%
    );
    filter: blur(${30 * scale}px);
  }

  /* Photo area */
  ${hasPhoto ? `
  .photo {
    position: absolute;
    left: ${5 * scale}px;
    bottom: ${35 * scale}px;
    width: ${90 * scale}px;
    height: ${90 * scale}px;
    border-radius: ${8 * scale}px;
    overflow: hidden;
    box-shadow: 0 ${4 * scale}px ${15 * scale}px rgba(0,0,0,0.1);
  }
  .photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  ` : ''}

  /* Mockup card */
  ${hasMockup ? `
  .mockup {
    position: absolute;
    right: ${padding}px;
    bottom: ${35 * scale}px;
    width: ${110 * scale}px;
    background: #FFFFFF;
    border-radius: ${8 * scale}px;
    padding: ${8 * scale}px;
    box-shadow: 0 ${4 * scale}px ${20 * scale}px rgba(0,0,0,0.08);
  }
  .mockup-title {
    font-size: ${9 * scale}px;
    font-weight: 600;
    color: #1A1A1A;
    margin-bottom: ${4 * scale}px;
  }
  .mockup-text {
    font-size: ${7 * scale}px;
    color: #666;
    line-height: 1.3;
  }
  ` : ''}

  .content {
    position: relative;
    z-index: 2;
    padding: ${padding}px;
    padding-right: ${padding + 10 * scale}px;
  }

  .headline {
    font-size: ${headlineSize}px;
    font-weight: 700;
    color: #1A1A1A;
    line-height: 1.2;
    margin-bottom: ${8 * scale}px;
    max-width: ${hasMockup ? '65%' : '90%'};
  }

  .description {
    font-size: ${bodySize}px;
    font-weight: 400;
    color: #4A4A4A;
    line-height: 1.4;
    margin-bottom: ${12 * scale}px;
    max-width: ${hasMockup ? '60%' : '85%'};
  }

  .cta {
    display: inline-block;
    background: #00BFA5;
    color: #FFFFFF;
    font-size: ${ctaSize}px;
    font-weight: 600;
    padding: ${8 * scale}px ${18 * scale}px;
    border-radius: ${20 * scale}px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .logo {
    position: absolute;
    bottom: ${10 * scale}px;
    left: ${padding}px;
    height: ${logoHeight}px;
  }
</style></head><body>
  <div class="bg-gradient"></div>
  <div class="accent-gradient"></div>

  ${hasPhoto ? `
  <div class="photo">
    <img src="${assets.photoBase64}" alt="" />
  </div>
  ` : ''}

  ${hasMockup ? `
  <div class="mockup">
    <div class="mockup-title">Your lab results are ready.</div>
    <div class="mockup-text">Please check your patient portal or call for more detailed information.</div>
  </div>
  ` : ''}

  <div class="content">
    <div class="headline">${content.headline}</div>
    <div class="description">${content.description}</div>
    <div class="cta">${content.cta}</div>
  </div>

  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
</body></html>`;
}

/* ─── Voice AI Global Style (300x350) with Multiple Photos ───────────────────── */

export function voiceAIGlobalTemplate(
  content: AdContent,
  assets: TemplateAssets,
  width: number,
  height: number
): string {
  const scale = Math.min(width / 300, height / 350);

  const headlineSize = Math.round(22 * scale);
  const bodySize = Math.round(12 * scale);
  const ctaSize = Math.round(11 * scale);
  const padding = Math.round(16 * scale);
  const logoHeight = Math.round(14 * scale);

  const hasPhoto = !!assets.photoBase64;

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
  }

  /* Multi-color gradient background */
  .bg-gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(150deg,
      #B8E6E0 0%,
      #D4C4E8 35%,
      #C8D8F0 65%,
      #E8D8E0 100%
    );
  }

  /* Photo collage area on right */
  ${hasPhoto ? `
  .photo-collage {
    position: absolute;
    right: 0;
    top: ${50 * scale}px;
    width: ${160 * scale}px;
    height: ${200 * scale}px;
  }
  .photo-main {
    position: absolute;
    right: ${10 * scale}px;
    top: 0;
    width: ${100 * scale}px;
    height: ${130 * scale}px;
    border-radius: ${12 * scale}px;
    overflow: hidden;
    box-shadow: 0 ${6 * scale}px ${25 * scale}px rgba(0,0,0,0.15);
  }
  .photo-main img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .phone-mockup {
    position: absolute;
    left: 0;
    bottom: 0;
    width: ${70 * scale}px;
    height: ${120 * scale}px;
    background: #FFFFFF;
    border-radius: ${12 * scale}px;
    box-shadow: 0 ${4 * scale}px ${20 * scale}px rgba(0,0,0,0.12);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .phone-icon {
    width: ${30 * scale}px;
    height: ${30 * scale}px;
    background: #00BFA5;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .phone-icon::after {
    content: '';
    width: ${12 * scale}px;
    height: ${12 * scale}px;
    border: ${2 * scale}px solid white;
    border-radius: 50%;
  }
  ` : ''}

  .content {
    position: relative;
    z-index: 2;
    padding: ${padding}px;
    max-width: 55%;
  }

  .headline {
    font-size: ${headlineSize}px;
    font-weight: 700;
    color: #1A1A1A;
    line-height: 1.15;
    margin-bottom: ${12 * scale}px;
  }

  .description {
    font-size: ${bodySize}px;
    font-weight: 400;
    color: #3A3A3A;
    line-height: 1.45;
    margin-bottom: ${16 * scale}px;
  }

  .cta {
    display: inline-block;
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: ${ctaSize}px;
    font-weight: 600;
    padding: ${10 * scale}px ${22 * scale}px;
    border-radius: ${25 * scale}px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .logo {
    position: absolute;
    bottom: ${12 * scale}px;
    left: 50%;
    transform: translateX(-50%);
    height: ${logoHeight}px;
  }
</style></head><body>
  <div class="bg-gradient"></div>

  ${hasPhoto ? `
  <div class="photo-collage">
    <div class="photo-main">
      <img src="${assets.photoBase64}" alt="" />
    </div>
    <div class="phone-mockup">
      <div class="phone-icon"></div>
    </div>
  </div>
  ` : ''}

  <div class="content">
    <div class="headline">${content.headline}</div>
    <div class="description">${content.description}</div>
    <div class="cta">${content.cta}</div>
  </div>

  <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
</body></html>`;
}

/* ─── Native Banner Style (728x90) ───────────────────────────────────────────── */

export function nativeBannerTemplate(
  content: AdContent,
  assets: TemplateAssets,
  width: number,
  height: number
): string {
  const scale = Math.min(width / 728, height / 90);

  const headlineSize = Math.round(20 * scale);
  const ctaSize = Math.round(12 * scale);
  const padding = Math.round(20 * scale);
  const logoHeight = Math.round(16 * scale);

  const hasIcon = !!assets.productIconBase64;

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
  }

  /* Horizontal gradient */
  .bg-gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg,
      #A8E6E0 0%,
      #C0D8F0 50%,
      #D8C8E8 100%
    );
  }

  .container {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
    padding: 0 ${padding}px;
  }

  .headline {
    font-size: ${headlineSize}px;
    font-weight: 700;
    color: #1A1A1A;
    line-height: 1.2;
    flex: 1;
  }

  /* Center icon area */
  ${hasIcon ? `
  .icon-area {
    width: ${60 * scale}px;
    height: ${60 * scale}px;
    margin: 0 ${30 * scale}px;
  }
  .icon-area img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  ` : ''}

  .right-section {
    display: flex;
    align-items: center;
    gap: ${20 * scale}px;
  }

  .cta {
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: ${ctaSize}px;
    font-weight: 600;
    padding: ${10 * scale}px ${24 * scale}px;
    border-radius: ${25 * scale}px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }

  .logo {
    height: ${logoHeight}px;
  }
</style></head><body>
  <div class="bg-gradient"></div>

  <div class="container">
    <div class="headline">${content.headline}</div>

    ${hasIcon ? `
    <div class="icon-area">
      <img src="${assets.productIconBase64}" alt="" />
    </div>
    ` : ''}

    <div class="right-section">
      <div class="cta">${content.cta}</div>
      <img src="${assets.logoBase64}" class="logo" alt="Telnyx" />
    </div>
  </div>
</body></html>`;
}

/* ─── Export ────────────────────────────────────────────────────────────────── */

export const TEMPLATES_V7 = {
  healthcare: healthcareAdTemplate,
  voiceAIGlobal: voiceAIGlobalTemplate,
  nativeBanner: nativeBannerTemplate,
};
