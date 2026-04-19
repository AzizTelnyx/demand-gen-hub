/**
 * Templates V6 - Light Mode with Colorful Patterns
 *
 * Based on actual Telnyx StackAdapt ads:
 * - Light cream/beige background
 * - Colorful gradient pattern on LEFT side (3D icons blend here)
 * - Industry photography or product mockups
 * - Dark text on light background
 * - Teal CTA button
 */

import { Typography } from '../src/lib/typography';

export interface TemplateData {
  headline: string;
  description: string;
  cta: string;
}

export interface TemplateAssets {
  logoBase64: string;
  productIconBase64?: string;  // 3D colorful icon for left pattern
  industryPhotoBase64?: string; // Industry photo (optional)
}

/* ─── Light Template with Pattern + Photo ────────────────────────────────────── */

export function lightPatternTemplate(
  data: TemplateData,
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography
): string {
  const padding = Math.round(width * 0.06);
  const hasIcon = !!assets.productIconBase64;
  const hasPhoto = !!assets.industryPhotoBase64;

  // Responsive font sizes
  const headlineSize = Math.round(Math.min(typography.headline * 0.7, height * 0.09));
  const bodySize = Math.round(Math.min(typography.body * 0.85, height * 0.045));
  const ctaSize = Math.round(Math.min(typography.cta, height * 0.04));

  // Pattern/icon area (left ~30%)
  const patternWidth = Math.round(width * 0.3);
  const iconSize = Math.round(Math.min(patternWidth * 1.5, height * 1.2));

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    background: #F5F3EE;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
    color: #1A1A1A;
  }

  /* Colorful gradient pattern area on left */
  .pattern-area {
    position: absolute;
    left: 0;
    top: 0;
    width: ${patternWidth}px;
    height: 100%;
    overflow: hidden;
  }

  /* 3D product icon as the colorful pattern */
  ${hasIcon ? `
  .product-icon {
    position: absolute;
    left: ${-iconSize * 0.35}px;
    top: 50%;
    transform: translateY(-50%);
    width: ${iconSize}px;
    height: ${iconSize}px;
    object-fit: contain;
    opacity: 0.85;
  }
  ` : `
  /* Fallback gradient if no icon */
  .pattern-area::before {
    content: '';
    position: absolute;
    left: -50%;
    top: -20%;
    width: 150%;
    height: 140%;
    background: linear-gradient(135deg,
      rgba(0,227,170,0.4) 0%,
      rgba(229,126,255,0.3) 40%,
      rgba(136,80,249,0.3) 70%,
      rgba(0,227,170,0.2) 100%
    );
    filter: blur(40px);
  }
  `}

  .content {
    position: relative;
    z-index: 2;
    height: 100%;
    padding: ${padding}px;
    padding-left: ${patternWidth * 0.5 + padding}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .headline {
    font-size: ${headlineSize}px;
    font-weight: 700;
    line-height: 1.15;
    color: #1A1A1A;
    margin-bottom: ${padding * 0.4}px;
    max-width: 90%;
  }

  .description {
    font-size: ${bodySize}px;
    color: #4A4A4A;
    line-height: 1.45;
    margin-bottom: ${padding * 0.5}px;
    max-width: 85%;
  }

  .cta-button {
    display: inline-block;
    background: #00C08B;
    color: #FFFFFF;
    font-size: ${ctaSize}px;
    font-weight: 600;
    padding: ${ctaSize * 0.6}px ${ctaSize * 1.4}px;
    border-radius: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .logo {
    position: absolute;
    bottom: ${padding * 0.5}px;
    left: ${patternWidth * 0.5 + padding}px;
    height: ${Math.max(16, padding * 0.45)}px;
    z-index: 10;
  }

  /* Optional: Photo area on right */
  ${hasPhoto ? `
  .photo-area {
    position: absolute;
    right: ${padding}px;
    bottom: ${padding}px;
    width: ${Math.round(width * 0.35)}px;
    height: ${Math.round(height * 0.5)}px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  }

  .photo-area img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  ` : ''}
</style></head><body>
  <div class="pattern-area">
    ${hasIcon ? `<img src="${assets.productIconBase64}" class="product-icon" alt="" />` : ''}
  </div>

  <div class="content">
    <div class="headline">${data.headline}</div>
    <div class="description">${data.description}</div>
    <div class="cta-button">${data.cta}</div>
  </div>

  ${hasPhoto ? `
  <div class="photo-area">
    <img src="${assets.industryPhotoBase64}" alt="" />
  </div>
  ` : ''}

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Light Template with Product Mockup ─────────────────────────────────────── */

export function lightMockupTemplate(
  data: TemplateData,
  mockupContent: { title: string; message: string },
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography
): string {
  const padding = Math.round(width * 0.06);
  const hasIcon = !!assets.productIconBase64;

  const headlineSize = Math.round(Math.min(typography.headline * 0.65, height * 0.085));
  const bodySize = Math.round(Math.min(typography.body * 0.8, height * 0.04));
  const ctaSize = Math.round(Math.min(typography.cta * 0.9, height * 0.038));

  const patternWidth = Math.round(width * 0.28);
  const iconSize = Math.round(Math.min(patternWidth * 1.4, height * 1.1));

  // Mockup card sizing
  const mockupWidth = Math.round(width * 0.38);
  const mockupHeight = Math.round(height * 0.4);

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    background: #F5F3EE;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
    color: #1A1A1A;
  }

  .pattern-area {
    position: absolute;
    left: 0;
    top: 0;
    width: ${patternWidth}px;
    height: 100%;
    overflow: hidden;
  }

  ${hasIcon ? `
  .product-icon {
    position: absolute;
    left: ${-iconSize * 0.4}px;
    top: 50%;
    transform: translateY(-50%);
    width: ${iconSize}px;
    height: ${iconSize}px;
    object-fit: contain;
    opacity: 0.9;
  }
  ` : `
  .pattern-area::before {
    content: '';
    position: absolute;
    left: -50%;
    top: -20%;
    width: 150%;
    height: 140%;
    background: linear-gradient(135deg,
      rgba(0,227,170,0.4) 0%,
      rgba(229,126,255,0.35) 45%,
      rgba(136,80,249,0.3) 100%
    );
    filter: blur(35px);
  }
  `}

  .content {
    position: relative;
    z-index: 2;
    height: 100%;
    padding: ${padding}px;
    padding-left: ${patternWidth * 0.4 + padding}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .headline {
    font-size: ${headlineSize}px;
    font-weight: 700;
    line-height: 1.15;
    color: #1A1A1A;
    margin-bottom: ${padding * 0.35}px;
    max-width: 55%;
  }

  .description {
    font-size: ${bodySize}px;
    color: #4A4A4A;
    line-height: 1.4;
    margin-bottom: ${padding * 0.45}px;
    max-width: 50%;
  }

  .cta-button {
    display: inline-block;
    background: #00C08B;
    color: #FFFFFF;
    font-size: ${ctaSize}px;
    font-weight: 600;
    padding: ${ctaSize * 0.55}px ${ctaSize * 1.3}px;
    border-radius: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .logo {
    position: absolute;
    bottom: ${padding * 0.5}px;
    left: ${patternWidth * 0.4 + padding}px;
    height: ${Math.max(14, padding * 0.4)}px;
    z-index: 10;
  }

  /* Product mockup card */
  .mockup-card {
    position: absolute;
    right: ${padding}px;
    bottom: ${padding * 1.2}px;
    width: ${mockupWidth}px;
    background: #FFFFFF;
    border-radius: 10px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    padding: ${mockupHeight * 0.12}px;
    z-index: 5;
  }

  .mockup-header {
    font-size: ${bodySize * 0.75}px;
    font-weight: 600;
    color: #1A1A1A;
    margin-bottom: ${mockupHeight * 0.06}px;
  }

  .mockup-message {
    font-size: ${bodySize * 0.7}px;
    color: #666666;
    line-height: 1.4;
  }
</style></head><body>
  <div class="pattern-area">
    ${hasIcon ? `<img src="${assets.productIconBase64}" class="product-icon" alt="" />` : ''}
  </div>

  <div class="content">
    <div class="headline">${data.headline}</div>
    <div class="description">${data.description}</div>
    <div class="cta-button">${data.cta}</div>
  </div>

  <div class="mockup-card">
    <div class="mockup-header">${mockupContent.title}</div>
    <div class="mockup-message">${mockupContent.message}</div>
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Export ────────────────────────────────────────────────────────────────── */

export const TEMPLATES_V6 = {
  lightPattern: lightPatternTemplate,
  lightMockup: lightMockupTemplate,
};
