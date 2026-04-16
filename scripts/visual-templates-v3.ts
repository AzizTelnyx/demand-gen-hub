/**
 * Visual Templates V3 - LIGHT compositions with cream/beige + product tints
 * Following brand guidelines: "beige and light combinations on black and tinted pink"
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

// Product colors from brand-colors.json
const PRODUCT_COLORS = {
  'voice-ai': {
    primary: '#E57EFF',
    tint: '#FAE5FF',
    name: 'VOICE AI',
  },
  'voice-api': {
    primary: '#8850F9',
    tint: '#E7DCFE',
    name: 'VOICE API',
  },
  'ai': {
    primary: '#FF7442',
    tint: '#FFE3D9',
    name: 'AI',
  },
  'rcs': {
    primary: '#3434EF',
    tint: '#D6EFFC',
    name: 'RCS',
  },
  'esim': {
    primary: '#D3FFA6',
    tint: '#EDFFDB',
    name: 'eSIM',
  },
  'default': {
    primary: '#00E3AA',
    tint: '#CCF9EE',
    name: 'PLATFORM',
  }
};

const NEUTRALS = {
  cream: '#FEFDF5',
  tan: '#E6E3D3',
  bright30: '#F0EEE5',
  black: '#000000',
  gray: '#666666',
};

function getProductColors(product?: string) {
  if (product && product in PRODUCT_COLORS) {
    return PRODUCT_COLORS[product as keyof typeof PRODUCT_COLORS];
  }
  return PRODUCT_COLORS.default;
}

/**
 * Voice AI Product Template - LIGHT VERSION
 * Cream/tan background with pink tint overlay
 */
export function generateVoiceAIProductTemplate(
  data: VisualCreativeData,
  assets: VisualAssets,
  width: number,
  height: number
): string {
  const padding = 70;
  const isWide = width > height;
  const colors = getProductColors(data.product);

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
    background: linear-gradient(135deg, ${colors.tint} 0%, ${NEUTRALS.cream} 40%, ${NEUTRALS.bright30} 100%);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: ${NEUTRALS.black};
    overflow: hidden;
    position: relative;
  }

  /* Subtle pattern overlay */
  .pattern-overlay {
    position: absolute;
    top: 0;
    right: 0;
    width: 50%;
    height: 100%;
    background: radial-gradient(circle at top right, ${colors.primary}08 0%, transparent 70%);
    z-index: 0;
  }

  /* Main content */
  .content {
    position: relative;
    z-index: 2;
    display: flex;
    height: 100%;
    padding: ${padding}px;
    padding-bottom: ${padding + 50}px;
    align-items: center;
    gap: ${padding}px;
  }

  .left {
    flex: ${isWide ? '0 0 52%' : '1'};
    display: flex;
    flex-direction: column;
    gap: ${Math.floor(padding * 0.45)}px;
  }

  .right {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    ${!isWide ? 'display: none;' : ''}
  }

  /* Product badge */
  .product-badge {
    display: inline-block;
    background: ${colors.primary};
    color: ${NEUTRALS.cream};
    font-size: 11px;
    font-weight: 900;
    padding: 10px 22px;
    border-radius: 24px;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    align-self: flex-start;
    box-shadow: 0 4px 12px ${colors.primary}30;
  }

  /* Headline - PP Formula Extrabold */
  .headline {
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-size: ${isWide ? '52px' : '38px'};
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: -2px;
    color: ${NEUTRALS.black};
    margin-top: ${Math.floor(padding * 0.2)}px;
  }

  /* Description */
  .description {
    font-size: ${isWide ? '17px' : '15px'};
    line-height: 1.65;
    color: ${NEUTRALS.gray};
    max-width: 92%;
    font-weight: 500;
  }

  /* CTA Button - ALL CAPS */
  .cta-button {
    display: inline-block;
    background: ${colors.primary};
    color: ${NEUTRALS.cream};
    padding: 18px 36px;
    border-radius: 10px;
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-weight: 900;
    font-size: 15px;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    margin-top: ${Math.floor(padding * 0.3)}px;
    align-self: flex-start;
    box-shadow: 0 6px 24px ${colors.primary}35;
  }

  /* Product screenshot with pink glow */
  .product-visual {
    max-width: 90%;
    max-height: ${height * 0.60}px;
    border-radius: 16px;
    box-shadow: 0 24px 64px ${colors.primary}20, 0 8px 24px rgba(0,0,0,0.12);
    border: 1px solid ${colors.primary}15;
  }

  /* Logo - LARGER, better positioned */
  .logo-bottom {
    position: absolute;
    bottom: ${padding - 10}px;
    left: ${padding}px;
    height: 32px;
    opacity: 1;
    z-index: 10;
  }
</style></head><body>
  <div class="pattern-overlay"></div>

  <div class="content">
    <div class="left">
      <div class="product-badge">${colors.name}</div>
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
 * Industry ABM Template - LIGHT VERSION
 */
export function generateIndustryABMTemplate(
  data: VisualCreativeData,
  assets: VisualAssets,
  width: number,
  height: number
): string {
  const padding = 70;
  const colors = getProductColors(data.product);

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
    background: ${NEUTRALS.cream};
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: ${NEUTRALS.black};
    overflow: hidden;
    position: relative;
  }

  .split-container {
    display: flex;
    height: 100%;
    width: 100%;
  }

  .image-side {
    flex: 0 0 48%;
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
    background: linear-gradient(90deg, ${NEUTRALS.cream} 0%, transparent 60%);
  }

  .text-side {
    flex: 1;
    background: linear-gradient(135deg, ${colors.tint} 0%, ${NEUTRALS.cream} 100%);
    padding: ${padding}px;
    padding-bottom: ${padding + 50}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${Math.floor(padding * 0.45)}px;
  }

  .product-badge {
    display: inline-block;
    background: ${colors.primary};
    color: ${NEUTRALS.cream};
    font-size: 11px;
    font-weight: 900;
    padding: 10px 22px;
    border-radius: 24px;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    align-self: flex-start;
    box-shadow: 0 4px 12px ${colors.primary}30;
  }

  .headline {
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-size: 46px;
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: -2px;
    color: ${NEUTRALS.black};
  }

  .description {
    font-size: 16px;
    line-height: 1.65;
    color: ${NEUTRALS.gray};
    font-weight: 500;
  }

  .cta-button {
    display: inline-block;
    background: ${colors.primary};
    color: ${NEUTRALS.cream};
    padding: 18px 36px;
    border-radius: 10px;
    font-family: 'PP Formula', 'Inter', sans-serif;
    font-weight: 900;
    font-size: 15px;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    align-self: flex-start;
    box-shadow: 0 6px 24px ${colors.primary}35;
  }

  .logo-bottom {
    position: absolute;
    bottom: ${padding - 10}px;
    left: ${padding}px;
    height: 32px;
    opacity: 1;
    z-index: 10;
  }
</style></head><body>
  <div class="split-container">
    <div class="image-side">
      ${assets.industryPhoto ? `<img src="${assets.industryPhoto}" class="industry-photo" alt="" />` : ''}
      <div class="image-overlay"></div>
    </div>

    <div class="text-side">
      <div class="product-badge">${colors.name}</div>
      <div class="headline">${data.headline}</div>
      <div class="description">${data.description}</div>
      <div class="cta-button">${data.cta}</div>
    </div>
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo-bottom" alt="Telnyx" />` : ''}
</body></html>`;
}

export const VISUAL_TEMPLATES_V3 = {
  'voice-ai-product': generateVoiceAIProductTemplate,
  'industry-abm': generateIndustryABMTemplate,
};
