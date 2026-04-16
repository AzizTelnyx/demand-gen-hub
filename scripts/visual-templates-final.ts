/**
 * Visual Templates FINAL - Matching actual Telnyx ad style
 * Based on real LinkedIn ads: Inter Bold (700), clean CTA, professional
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

// Product colors
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
  'default': {
    primary: '#00E3AA',
    tint: '#CCF9EE',
    name: 'PLATFORM',
  }
};

const NEUTRALS = {
  cream: '#FEFDF5',
  tan: '#E6E3D3',
  black: '#000000',
  white: '#FFFFFF',
  gray: '#666666',
};

function getProductColors(product?: string) {
  if (product && product in PRODUCT_COLORS) {
    return PRODUCT_COLORS[product as keyof typeof PRODUCT_COLORS];
  }
  return PRODUCT_COLORS.default;
}

/**
 * Voice AI Product Template - Matches real Telnyx ads
 * LIGHT version with proper Inter Bold font
 */
export function generateVoiceAIProductTemplate(
  data: VisualCreativeData,
  assets: VisualAssets,
  width: number,
  height: number
): string {
  const padding = 70;
  const isWide = width > height;
  const isPortrait = height > width;
  const colors = getProductColors(data.product);

  return `<!DOCTYPE html><html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    background: linear-gradient(135deg, ${colors.tint} 0%, ${NEUTRALS.cream} 40%, ${NEUTRALS.tan} 100%);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: ${NEUTRALS.black};
    overflow: hidden;
    position: relative;
  }

  /* Subtle accent overlay */
  .accent-overlay {
    position: absolute;
    top: 0;
    right: 0;
    width: 50%;
    height: 100%;
    background: radial-gradient(circle at top right, ${colors.primary}06 0%, transparent 70%);
    z-index: 0;
  }

  .content {
    position: relative;
    z-index: 2;
    display: flex;
    height: 100%;
    padding: ${isPortrait ? padding * 0.7 : padding}px;
    padding-bottom: ${padding + 80}px;
    align-items: center;
    gap: ${isPortrait ? padding * 0.4 : padding}px;
  }

  .left {
    flex: ${isWide ? '0 0 52%' : '1'};
    display: flex;
    flex-direction: column;
    gap: ${Math.floor(padding * (isPortrait ? 0.35 : 0.5))}px;
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
    color: ${NEUTRALS.white};
    font-size: 11px;
    font-weight: 700;
    padding: 8px 20px;
    border-radius: 20px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    align-self: flex-start;
  }

  /* Headline - Inter Bold (700) like real ads */
  .headline {
    font-family: 'Inter', sans-serif;
    font-size: ${isWide ? '48px' : (isPortrait ? '28px' : '36px')};
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.5px;
    color: ${NEUTRALS.black};
    margin-top: ${Math.floor(padding * 0.15)}px;
  }

  /* Description */
  .description {
    font-size: ${isWide ? '16px' : (isPortrait ? '12px' : '14px')};
    line-height: 1.6;
    color: ${NEUTRALS.gray};
    max-width: 90%;
    font-weight: 400;
  }

  /* CTA Button - Matches Telnyx website styling */
  .cta-button {
    display: inline-block;
    background: ${NEUTRALS.white};
    color: ${NEUTRALS.black};
    padding: 12px 24px;
    border-radius: 16px;
    border: 2px solid ${NEUTRALS.black};
    font-family: 'Inter', sans-serif;
    font-weight: 400;
    font-size: 16px;
    letter-spacing: -0.01em;
    text-transform: uppercase;
    margin-top: ${Math.floor(padding * 0.4)}px;
    align-self: flex-start;
    text-align: center;
  }

  /* Product screenshot */
  .product-visual {
    max-width: 88%;
    max-height: ${height * 0.58}px;
    border-radius: 12px;
    box-shadow: 0 20px 50px ${colors.primary}18, 0 8px 20px rgba(0,0,0,0.08);
    border: 1px solid ${colors.primary}12;
  }

  /* Logo - BIGGER */
  .logo-bottom {
    position: absolute;
    bottom: ${padding - 8}px;
    left: ${padding}px;
    height: 42px;
    opacity: 1;
    z-index: 10;
  }
</style></head><body>
  <div class="accent-overlay"></div>

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
 * Industry ABM Template - Matches real Telnyx ad style
 */
export function generateIndustryABMTemplate(
  data: VisualCreativeData,
  assets: VisualAssets,
  width: number,
  height: number
): string {
  const padding = 70;
  const colors = getProductColors(data.product);
  const isPortrait = height > width;
  const isSquare = Math.abs(width - height) < 100;

  return `<!DOCTYPE html><html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    background: ${NEUTRALS.cream};
    font-family: 'Inter', sans-serif;
    color: ${NEUTRALS.black};
    overflow: hidden;
    position: relative;
  }

  .split-container {
    display: flex;
    height: 100%;
    width: 100%;
    flex-direction: ${isPortrait ? 'column-reverse' : 'row-reverse'}; /* Adapt to orientation */
  }

  .image-side {
    flex: ${isPortrait ? '0 0 45%' : '0 0 46%'};
    position: relative;
    overflow: hidden;
  }

  .industry-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: ${isPortrait ? 'center top' : 'center center'};
  }

  /* Removed white overlay gradient - images should be clean */

  .text-side {
    flex: 1;
    background: linear-gradient(135deg, ${colors.tint} 0%, ${NEUTRALS.cream} 100%);
    padding: ${isPortrait ? padding * 0.8 : padding}px;
    padding-bottom: ${padding + 80}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${Math.floor(padding * (isPortrait ? 0.35 : 0.5))}px;
  }

  .product-badge {
    display: inline-block;
    background: ${colors.primary};
    color: ${NEUTRALS.white};
    font-size: 11px;
    font-weight: 700;
    padding: 8px 20px;
    border-radius: 20px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    align-self: flex-start;
  }

  .headline {
    font-family: 'Inter', sans-serif;
    font-size: ${isPortrait ? '32px' : '44px'};
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.5px;
    color: ${NEUTRALS.black};
  }

  .description {
    font-size: ${isPortrait ? '13px' : '15px'};
    line-height: 1.6;
    color: ${NEUTRALS.gray};
    font-weight: 400;
  }

  .cta-button {
    display: inline-block;
    background: ${NEUTRALS.white};
    color: ${NEUTRALS.black};
    padding: 12px 24px;
    border-radius: 16px;
    border: 2px solid ${NEUTRALS.black};
    font-family: 'Inter', sans-serif;
    font-weight: 400;
    font-size: 16px;
    letter-spacing: -0.01em;
    text-transform: uppercase;
    align-self: flex-start;
    text-align: center;
  }

  .logo-bottom {
    position: absolute;
    bottom: ${padding - 8}px;
    left: ${padding}px;
    height: 42px;
    opacity: 1;
    z-index: 10;
  }
</style></head><body>
  <div class="split-container">
    <div class="image-side">
      ${assets.industryPhoto ? `<img src="${assets.industryPhoto}" class="industry-photo" alt="" />` : ''}
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

export const VISUAL_TEMPLATES_FINAL = {
  'voice-ai-product': generateVoiceAIProductTemplate,
  'industry-abm': generateIndustryABMTemplate,
};
