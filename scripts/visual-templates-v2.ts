/**
 * Visual Templates V2 - With Product Colors & Proper Typography
 * Fixes: Logo size, CTA styling, product colors, font loading
 */

export interface VisualCreativeData {
  headline: string;
  description: string;
  cta: string;
  pillar: 'trust' | 'infrastructure' | 'physics';
  audience?: string;
  platform: string;
  product?: 'voice-ai' | 'voice-api' | 'sms' | 'messaging' | 'rcs' | 'esim';
  industry?: 'healthcare' | 'finance' | 'retail' | 'travel' | 'insurance' | 'logistics';
}

export interface VisualAssets {
  logoBase64: string;
  backgroundImage?: string;
  productScreenshot?: string;
  industryPhoto?: string;
}

// Product-specific color schemes (from brand-colors.json)
const PRODUCT_COLORS = {
  'voice-ai': {
    primary: '#E57EFF',     // Voice AI Agent Pink
    background: '#FAE5FF',  // Pink Tint
    accent: '#E57EFF',
  },
  'voice-api': {
    primary: '#8850F9',     // Voice API Purple
    background: '#E7DCFE',  // Purple Tint
    accent: '#8850F9',
  },
  'ai': {
    primary: '#FF7442',     // AI Orange
    background: '#FFE3D9',  // AI Tint
    accent: '#FF7442',
  },
  'rcs': {
    primary: '#3434EF',     // RCS Blue
    background: '#D6EFFC',  // Blue Tint
    accent: '#3434EF',
  },
  'esim': {
    primary: '#D3FFA6',     // eSIM Citron
    background: '#EDFFDB',  // Citron Tint
    accent: '#D3FFA6',
  },
  'default': {
    primary: '#00E3AA',     // Telnyx Green
    background: '#CCF9EE',  // Green Tint
    accent: '#00E3AA',
  }
};

const BRAND = {
  colors: {
    cream: '#FEFDF5',
    black: '#000000',
    tan: '#E6E3D3',
    white: '#FFFFFF',
    gray: '#8892a6',
  }
};

/**
 * Get product color scheme
 */
function getProductColors(product?: string) {
  if (product && product in PRODUCT_COLORS) {
    return PRODUCT_COLORS[product as keyof typeof PRODUCT_COLORS];
  }
  return PRODUCT_COLORS.default;
}

/**
 * Voice AI Product Template - Uses product colors, backgrounds, and screenshots
 */
export function generateVoiceAIProductTemplate(
  data: VisualCreativeData,
  assets: VisualAssets,
  width: number,
  height: number
): string {
  const padding = 60;
  const isWide = width > height;
  const productColors = getProductColors(data.product);

  return `<!DOCTYPE html><html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  /* PP Formula Extrabold fallback to Inter Black */
  @font-face {
    font-family: 'PP Formula';
    font-weight: 800;
    font-style: normal;
    src: local('Inter Black'), local('Inter-Black');
  }

  body {
    width: ${width}px;
    height: ${height}px;
    background: linear-gradient(135deg, ${BRAND.colors.black} 0%, #1a0a1f 100%);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: white;
    overflow: hidden;
    position: relative;
  }

  /* Pink tint overlay for Voice AI */
  .color-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg,
      ${productColors.background}15 0%,
      ${productColors.primary}08 50%,
      transparent 100%);
    z-index: 0;
  }

  /* Background pattern */
  .bg-pattern {
    position: absolute;
    top: 0;
    right: 0;
    width: 60%;
    height: 100%;
    opacity: 0.05;
    z-index: 1;
  }

  /* Content layout */
  .content {
    position: relative;
    z-index: 2;
    display: flex;
    height: 100%;
    padding: ${padding}px;
    align-items: center;
    gap: ${padding}px;
  }

  .left {
    flex: ${isWide ? '0 0 50%' : '1'};
    display: flex;
    flex-direction: column;
    gap: ${Math.floor(padding * 0.5)}px;
    padding-bottom: ${Math.floor(padding * 1.2)}px;
  }

  .right {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    ${!isWide ? 'display: none;' : ''}
  }

  /* Pillar badge */
  .pillar-badge {
    display: inline-block;
    background: ${productColors.primary}20;
    border: 1.5px solid ${productColors.primary};
    color: ${productColors.primary};
    font-size: 10px;
    font-weight: 800;
    padding: 8px 18px;
    border-radius: 20px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    align-self: flex-start;
  }

  /* Headline - PP Formula Extrabold */
  .headline {
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-size: ${isWide ? '48px' : '36px'};
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: -1.5px;
    color: ${BRAND.colors.white};
    margin-top: ${Math.floor(padding * 0.3)}px;
  }

  /* Description */
  .description {
    font-size: ${isWide ? '17px' : '15px'};
    line-height: 1.6;
    color: ${BRAND.colors.gray};
    max-width: 90%;
    font-weight: 400;
  }

  /* CTA Button - ALL CAPS with headline font */
  .cta-button {
    display: inline-block;
    background: ${productColors.primary};
    color: ${BRAND.colors.black};
    padding: 16px 32px;
    border-radius: 8px;
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-weight: 900;
    font-size: 14px;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-top: ${Math.floor(padding * 0.4)}px;
    margin-bottom: ${Math.floor(padding * 1.5)}px;
    align-self: flex-start;
    box-shadow: 0 4px 20px ${productColors.primary}40;
  }

  /* Product screenshot */
  .product-visual {
    max-width: 100%;
    max-height: ${height * 0.65}px;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
  }

  /* Logo - LARGER SIZE */
  .logo-bottom {
    position: absolute;
    bottom: ${padding}px;
    left: ${padding}px;
    height: 28px;
    opacity: 0.95;
    z-index: 10;
  }
</style></head><body>
  <div class="color-overlay"></div>
  ${assets.backgroundImage ? `<img src="${assets.backgroundImage}" class="bg-pattern" alt="" />` : ''}

  <div class="content">
    <div class="left">
      <div class="pillar-badge">${data.product ? data.product.replace('-', ' ') : data.pillar}</div>
      <div class="headline">${data.headline}</div>
      <div class="description">${data.description}</div>
      <div class="cta-button">${data.cta}</div>
    </div>

    ${isWide && assets.productScreenshot ? `
    <div class="right">
      <img src="${assets.productScreenshot}" class="product-visual" alt="Product" />
    </div>
    ` : ''}
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo-bottom" alt="Telnyx" />` : ''}
</body></html>`;
}

/**
 * Industry ABM Template - For industry-specific campaigns
 */
export function generateIndustryABMTemplate(
  data: VisualCreativeData,
  assets: VisualAssets,
  width: number,
  height: number
): string {
  const padding = 60;
  const productColors = getProductColors(data.product);

  return `<!DOCTYPE html><html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  @font-face {
    font-family: 'PP Formula';
    font-weight: 800;
    font-style: normal;
    src: local('Inter Black'), local('Inter-Black');
  }

  body {
    width: ${width}px;
    height: ${height}px;
    background: ${BRAND.colors.black};
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: white;
    overflow: hidden;
    position: relative;
  }

  /* Split layout */
  .split-container {
    display: flex;
    height: 100%;
    width: 100%;
  }

  .image-side {
    flex: 0 0 50%;
    position: relative;
    overflow: hidden;
  }

  .industry-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .image-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, ${BRAND.colors.black} 0%, transparent 50%);
  }

  .text-side {
    flex: 1;
    background: ${BRAND.colors.black};
    padding: ${padding}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${Math.floor(padding * 0.5)}px;
  }

  .pillar-badge {
    display: inline-block;
    background: ${productColors.primary}20;
    border: 1.5px solid ${productColors.primary};
    color: ${productColors.primary};
    font-size: 10px;
    font-weight: 800;
    padding: 8px 18px;
    border-radius: 20px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    align-self: flex-start;
  }

  .headline {
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-size: 42px;
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: -1.5px;
    color: ${BRAND.colors.white};
  }

  .description {
    font-size: 16px;
    line-height: 1.6;
    color: ${BRAND.colors.gray};
    font-weight: 400;
  }

  .cta-button {
    display: inline-block;
    background: ${productColors.primary};
    color: ${BRAND.colors.black};
    padding: 16px 32px;
    border-radius: 8px;
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-weight: 900;
    font-size: 14px;
    letter-spacing: 1px;
    text-transform: uppercase;
    align-self: flex-start;
    box-shadow: 0 4px 20px ${productColors.primary}40;
  }

  .logo-bottom {
    position: absolute;
    bottom: ${padding}px;
    left: ${padding}px;
    height: 28px;
    opacity: 0.95;
    z-index: 10;
  }
</style></head><body>
  <div class="split-container">
    <div class="image-side">
      ${assets.industryPhoto ? `<img src="${assets.industryPhoto}" class="industry-photo" alt="" />` : ''}
      <div class="image-overlay"></div>
    </div>

    <div class="text-side">
      <div class="pillar-badge">${data.product ? data.product.replace('-', ' ') : data.pillar}</div>
      <div class="headline">${data.headline}</div>
      <div class="description">${data.description}</div>
      <div class="cta-button">${data.cta}</div>
    </div>
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo-bottom" alt="Telnyx" />` : ''}
</body></html>`;
}

export const VISUAL_TEMPLATES_V2 = {
  'voice-ai-product': generateVoiceAIProductTemplate,
  'industry-abm': generateIndustryABMTemplate,
};
