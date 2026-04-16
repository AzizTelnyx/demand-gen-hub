/**
 * Visual-Heavy Templates Using Real Brand Assets
 * NOT just text - actually uses backgrounds, product screenshots, photography
 */

export interface VisualCreativeData {
  headline: string;
  description: string;
  cta: string;
  pillar: 'trust' | 'infrastructure' | 'physics';
  audience?: string;
  platform: string;
  product?: 'voice-ai' | 'voice-api' | 'sms' | 'messaging';
  industry?: 'healthcare' | 'finance' | 'retail' | 'travel' | 'insurance' | 'logistics';
}

export interface VisualAssets {
  logoBase64: string;
  backgroundImage?: string; // base64 of voice-ai background
  productScreenshot?: string; // base64 of feature screenshot
  industryPhoto?: string; // base64 of industry photo
}

// Official Telnyx Brand Colors (from brand-colors.json)
const BRAND = {
  colors: {
    // Neutrals
    cream: '#FEFDF5',
    black: '#000000',
    tan: '#E6E3D3',
    bright30: '#F0EEE5',

    // Brand Primary
    brandGreen: '#00E3AA',
    greenTint: '#CCF9EE',

    // Text
    textOnLight: '#000000',
    textOnDark: '#FFFFFF',
    gray: '#8892a6',
    subtleGray: '#5a6478',

    // Legacy (for backwards compatibility)
    darkBg: '#000000', // Changed to pure black per brand guidelines
    white: '#FFFFFF',
  }
};

/**
 * Visual Template: Product Screenshot + Text
 * Uses actual Voice AI screenshots/features
 */
export function generateVisualProductTemplate(
  data: VisualCreativeData,
  assets: VisualAssets,
  width: number,
  height: number
): string {
  const padding = 60;
  const isWide = width > height;

  return `<!DOCTYPE html><html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');

  body {
    width: ${width}px;
    height: ${height}px;
    background: ${BRAND.colors.darkBg};
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: white;
    overflow: hidden;
    position: relative;
  }

  /* Background with gradient overlay */
  .bg-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
  }

  .bg-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.4;
  }

  .bg-gradient {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, ${BRAND.colors.darkBg} 0%, transparent 60%);
  }

  /* Content layout */
  .content {
    position: relative;
    z-index: 1;
    display: flex;
    height: 100%;
    padding: ${padding}px;
    align-items: center;
    gap: ${padding * 0.8}px;
  }

  .left {
    flex: ${isWide ? '0 0 45%' : '1'};
    display: flex;
    flex-direction: column;
    gap: ${padding * 0.4}px;
  }

  .right {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    ${!isWide ? 'display: none;' : ''}
  }

  /* Tag badge */
  .tag {
    position: absolute;
    top: ${padding * 0.7}px;
    right: ${padding * 0.9}px;
    background: rgba(0,192,139,0.12);
    border: 1px solid rgba(0,192,139,0.3);
    color: ${BRAND.colors.brandGreen};
    font-size: 11px;
    font-weight: 700;
    padding: 6px 16px;
    border-radius: 20px;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    z-index: 2;
  }

  /* Typography */
  .category {
    font-size: 12px;
    font-weight: 700;
    color: ${BRAND.colors.brandGreen};
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .headline {
    font-size: ${isWide ? '42px' : '32px'};
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: -1.5px;
    color: white;
  }

  .headline em {
    font-style: normal;
    color: ${BRAND.colors.brandGreen};
  }

  .description {
    font-size: ${isWide ? '16px' : '14px'};
    line-height: 1.6;
    color: ${BRAND.colors.gray};
    max-width: ${isWide ? '85%' : '100%'};
  }

  .cta-button {
    display: inline-block;
    background: ${BRAND.colors.brandGreen};
    color: ${BRAND.colors.darkBg};
    padding: 14px 28px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 14px;
    margin-top: ${padding * 0.3}px;
  }

  /* Product screenshot */
  .product-visual {
    max-width: 100%;
    max-height: ${height * 0.7}px;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }

  /* Logo */
  .logo-bottom {
    position: absolute;
    bottom: ${padding * 0.7}px;
    left: ${padding}px;
    height: 18px;
    opacity: 0.95;
    z-index: 2;
  }
</style></head><body>
  <div class="bg-layer">
    ${assets.backgroundImage ? `<img src="${assets.backgroundImage}" class="bg-image" alt="" />` : ''}
    <div class="bg-gradient"></div>
  </div>

  <div class="tag">${data.pillar.toUpperCase()}</div>

  <div class="content">
    <div class="left">
      <div class="category">${data.audience || 'Voice AI'}</div>
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
 * Visual Template: Industry Photography + Text
 * Uses real photography for healthcare, finance, etc.
 */
export function generateVisualIndustryTemplate(
  data: VisualCreativeData,
  assets: VisualAssets,
  width: number,
  height: number
): string {
  const padding = 60;

  return `<!DOCTYPE html><html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');

  body {
    width: ${width}px;
    height: ${height}px;
    background: ${BRAND.colors.darkBg};
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: white;
    overflow: hidden;
    position: relative;
  }

  /* Split layout with image */
  .split-container {
    display: flex;
    height: 100%;
    width: 100%;
  }

  .image-side {
    flex: 0 0 55%;
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
    background: linear-gradient(90deg, ${BRAND.colors.darkBg} 0%, transparent 40%, transparent 100%);
  }

  .text-side {
    flex: 1;
    background: ${BRAND.colors.darkBg};
    padding: ${padding}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${padding * 0.5}px;
  }

  .tag {
    position: absolute;
    top: ${padding * 0.7}px;
    right: ${padding * 0.9}px;
    background: rgba(0,192,139,0.12);
    border: 1px solid rgba(0,192,139,0.3);
    color: ${BRAND.colors.brandGreen};
    font-size: 11px;
    font-weight: 700;
    padding: 6px 16px;
    border-radius: 20px;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    z-index: 2;
  }

  .category {
    font-size: 12px;
    font-weight: 700;
    color: ${BRAND.colors.brandGreen};
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .headline {
    font-size: 38px;
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: -1.5px;
    color: white;
  }

  .headline em {
    font-style: normal;
    color: ${BRAND.colors.brandGreen};
  }

  .description {
    font-size: 15px;
    line-height: 1.6;
    color: ${BRAND.colors.gray};
  }

  .cta-button {
    display: inline-block;
    background: ${BRAND.colors.brandGreen};
    color: ${BRAND.colors.darkBg};
    padding: 14px 28px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 14px;
    align-self: flex-start;
  }

  .logo-bottom {
    position: absolute;
    bottom: ${padding * 0.7}px;
    left: ${padding}px;
    height: 18px;
    opacity: 0.95;
    z-index: 2;
  }
</style></head><body>
  <div class="tag">${data.pillar.toUpperCase()}</div>

  <div class="split-container">
    <div class="image-side">
      ${assets.industryPhoto ? `<img src="${assets.industryPhoto}" class="industry-photo" alt="" />` : ''}
      <div class="image-overlay"></div>
    </div>

    <div class="text-side">
      <div class="category">${data.audience || data.industry || 'Voice AI'}</div>
      <div class="headline">${data.headline}</div>
      <div class="description">${data.description}</div>
      <div class="cta-button">${data.cta}</div>
    </div>
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo-bottom" alt="Telnyx" />` : ''}
</body></html>`;
}

export const VISUAL_TEMPLATES = {
  'product-visual': generateVisualProductTemplate,
  'industry-photo': generateVisualIndustryTemplate,
};
