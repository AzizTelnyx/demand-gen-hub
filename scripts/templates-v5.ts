/**
 * Templates V5 - Proper 3D Icon Integration
 *
 * Key fixes:
 * - 3D product icons positioned on RIGHT side only
 * - NO overlap with text (text on left, icon on right)
 * - Proper opacity/blending with glow effects
 * - Clean separation between content zones
 */

import { Typography } from '../src/lib/typography';

export interface TemplateData {
  headline: string;
  greenWords?: string[];
  description: string;
  cta: string;
  label: string;
  ctaLabel?: string;
}

export interface TemplateAssets {
  logoBase64: string;
  productIconBase64?: string;
}

export interface MetricCard {
  value: string;
  label: string;
  sublabel?: string;
  isHighlight?: boolean;
  isNegative?: boolean;
}

/* ─── Helper ─────────────────────────────────────────────────────────────────── */

function highlightGreenWords(headline: string, greenWords: string[] = []): string {
  let result = headline;
  for (const word of greenWords) {
    const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    result = result.replace(regex, '<span class="green">$1</span>');
  }
  return result;
}

/* ─── Metrics Template with 3D Icon ──────────────────────────────────────────── */

export function metricsWithIconTemplate(
  data: TemplateData,
  metrics: MetricCard[],
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography
): string {
  const padding = Math.round(width * 0.05);
  const headlineHTML = highlightGreenWords(data.headline, data.greenWords);
  const hasIcon = !!assets.productIconBase64;

  // Layout: 45% text | 55% right side (icon behind, metrics in front)
  const textWidth = Math.round(width * 0.45);
  const rightWidth = width - textWidth - padding * 2;

  // Icon sizing - larger, positioned behind metrics
  const iconSize = Math.round(Math.min(rightWidth * 0.9, height * 0.85));

  // Metric card sizing
  const cardWidth = Math.round(rightWidth * 0.75);
  const cardHeight = Math.round((height - padding * 3) / metrics.length - 8);
  const valueSize = Math.round(Math.min(typography.dataPoint * 0.5, cardHeight * 0.38));
  const labelSize = Math.round(Math.min(typography.body * 0.8, cardHeight * 0.2));

  const metricsHTML = metrics.map(m => `
    <div style="
      width: ${cardWidth}px;
      height: ${cardHeight}px;
      background: rgba(13, 17, 23, 0.85);
      border: 1px solid ${m.isHighlight !== false ? 'rgba(0,192,139,0.3)' : 'rgba(255,255,255,0.1)'};
      border-radius: 10px;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      backdrop-filter: blur(8px);
      ${m.isHighlight !== false ? 'box-shadow: 0 0 20px rgba(0,192,139,0.1);' : ''}
    ">
      <div>
        <div style="font-size: ${labelSize}px; color: #8892A6; font-weight: 500;">${m.label}</div>
        ${m.sublabel ? `<div style="font-size: ${labelSize * 0.75}px; color: #5A6478; margin-top: 2px;">${m.sublabel}</div>` : ''}
      </div>
      <div style="
        font-size: ${valueSize}px;
        font-weight: 800;
        color: ${m.isNegative ? '#E74C3C' : m.isHighlight !== false ? '#00C08B' : '#FFFFFF'};
        letter-spacing: -0.5px;
      ">${m.value}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    background: #0D1117;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
    color: #FFFFFF;
  }

  /* Subtle ambient glow */
  .ambient-glow {
    position: absolute;
    top: 0;
    right: 0;
    width: 70%;
    height: 100%;
    background: radial-gradient(ellipse at 70% 40%, rgba(0,192,139,0.06) 0%, transparent 60%);
    pointer-events: none;
  }

  /* 3D Product Icon - positioned on right, behind metrics */
  ${hasIcon ? `
  .product-icon {
    position: absolute;
    right: ${padding * 0.5}px;
    top: 50%;
    transform: translateY(-50%);
    width: ${iconSize}px;
    height: ${iconSize}px;
    object-fit: contain;
    opacity: 0.6;
    filter: blur(0.5px);
    z-index: 1;
  }
  ` : ''}

  .container {
    position: relative;
    z-index: 2;
    display: flex;
    height: 100%;
    padding: ${padding}px;
  }

  .text-zone {
    width: ${textWidth}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-right: ${padding}px;
  }

  .viz-zone {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-end;
    z-index: 3;
  }

  .label {
    font-size: ${typography.label}px;
    font-weight: 600;
    color: #00C08B;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .headline {
    font-size: ${typography.headline}px;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -1px;
    margin-bottom: 18px;
  }

  .headline .green { color: #00C08B; }

  .description {
    font-size: ${typography.body}px;
    color: #8892A6;
    line-height: 1.5;
    max-width: 95%;
  }

  .cta-tag {
    position: absolute;
    top: ${padding}px;
    right: ${padding}px;
    background: rgba(0,192,139,0.12);
    border: 1px solid rgba(0,192,139,0.3);
    color: #00C08B;
    font-size: ${Math.max(10, typography.label * 0.85)}px;
    font-weight: 600;
    padding: 7px 16px;
    border-radius: 20px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    z-index: 10;
  }

  .logo {
    position: absolute;
    bottom: ${padding * 0.6}px;
    left: ${padding}px;
    height: ${Math.max(20, padding * 0.5)}px;
    z-index: 10;
  }
</style></head><body>
  <div class="ambient-glow"></div>
  ${hasIcon ? `<img src="${assets.productIconBase64}" class="product-icon" alt="" />` : ''}
  ${data.ctaLabel ? `<div class="cta-tag">${data.ctaLabel}</div>` : ''}

  <div class="container">
    <div class="text-zone">
      <div class="label">${data.label}</div>
      <div class="headline">${headlineHTML}</div>
      <div class="description">${data.description}</div>
    </div>

    <div class="viz-zone">
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${metricsHTML}
      </div>
    </div>
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Comparison Template with 3D Icon ───────────────────────────────────────── */

export function comparisonWithIconTemplate(
  data: TemplateData,
  comparison: { badItems: string[]; goodItems: string[] },
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography
): string {
  const padding = Math.round(width * 0.05);
  const headlineHTML = highlightGreenWords(data.headline, data.greenWords);
  const hasIcon = !!assets.productIconBase64;

  const textWidth = Math.round(width * 0.42);
  const iconSize = Math.round(Math.min(width * 0.35, height * 0.7));
  const tableWidth = Math.round(width * 0.48);
  const itemSize = Math.round(typography.body * 0.8);

  const comparisonHTML = `
    <div style="
      width: ${tableWidth}px;
      background: rgba(13, 17, 23, 0.9);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      overflow: hidden;
      backdrop-filter: blur(8px);
    ">
      <!-- Headers -->
      <div style="display: flex; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div style="flex: 1; padding: 14px 16px; font-size: ${typography.label}px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px;">Multi-vendor stack</div>
        <div style="flex: 1; padding: 14px 16px; font-size: ${typography.label}px; font-weight: 600; color: #00C08B; text-transform: uppercase; letter-spacing: 0.5px;">Telnyx Voice AI</div>
      </div>
      <!-- Rows -->
      ${comparison.badItems.map((bad, i) => `
        <div style="display: flex; ${i < comparison.badItems.length - 1 ? 'border-bottom: 1px solid rgba(255,255,255,0.05);' : ''}">
          <div style="flex: 1; padding: 12px 16px; display: flex; align-items: center; gap: 10px; color: rgba(255,255,255,0.4); font-size: ${itemSize}px;">
            <span style="color: #E74C3C; font-weight: 600;">✗</span>
            <span>${bad}</span>
          </div>
          <div style="flex: 1; padding: 12px 16px; display: flex; align-items: center; gap: 10px; color: #FFFFFF; font-size: ${itemSize}px;">
            <span style="color: #00C08B; font-weight: 600;">✓</span>
            <span style="font-weight: 500;">${comparison.goodItems[i] || ''}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    background: #0D1117;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
    color: #FFFFFF;
  }

  .ambient-glow {
    position: absolute;
    top: 0;
    left: 0;
    width: 60%;
    height: 100%;
    background: radial-gradient(ellipse at 30% 50%, rgba(0,192,139,0.05) 0%, transparent 60%);
    pointer-events: none;
  }

  ${hasIcon ? `
  .product-icon {
    position: absolute;
    left: ${padding}px;
    bottom: ${padding * 1.5}px;
    width: ${iconSize * 0.6}px;
    height: ${iconSize * 0.6}px;
    object-fit: contain;
    opacity: 0.5;
    z-index: 1;
  }
  ` : ''}

  .container {
    position: relative;
    z-index: 2;
    display: flex;
    height: 100%;
    padding: ${padding}px;
    align-items: center;
  }

  .text-zone {
    width: ${textWidth}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-right: ${padding * 0.5}px;
  }

  .viz-zone {
    flex: 1;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    z-index: 3;
  }

  .label {
    font-size: ${typography.label}px;
    font-weight: 600;
    color: #00C08B;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .headline {
    font-size: ${typography.headline}px;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -1px;
    margin-bottom: 18px;
  }

  .headline .green { color: #00C08B; }

  .description {
    font-size: ${typography.body}px;
    color: #8892A6;
    line-height: 1.5;
  }

  .cta-tag {
    position: absolute;
    top: ${padding}px;
    right: ${padding}px;
    background: rgba(0,192,139,0.12);
    border: 1px solid rgba(0,192,139,0.3);
    color: #00C08B;
    font-size: ${Math.max(10, typography.label * 0.85)}px;
    font-weight: 600;
    padding: 7px 16px;
    border-radius: 20px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    z-index: 10;
  }

  .logo {
    position: absolute;
    bottom: ${padding * 0.6}px;
    left: ${padding}px;
    height: ${Math.max(20, padding * 0.5)}px;
    z-index: 10;
  }
</style></head><body>
  <div class="ambient-glow"></div>
  ${hasIcon ? `<img src="${assets.productIconBase64}" class="product-icon" alt="" />` : ''}
  ${data.ctaLabel ? `<div class="cta-tag">${data.ctaLabel}</div>` : ''}

  <div class="container">
    <div class="text-zone">
      <div class="label">${data.label}</div>
      <div class="headline">${headlineHTML}</div>
      <div class="description">${data.description}</div>
    </div>

    <div class="viz-zone">
      ${comparisonHTML}
    </div>
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Stats Grid with Icon Background ────────────────────────────────────────── */

export function statsGridWithIconTemplate(
  data: TemplateData,
  stats: { value: string; label: string }[],
  badges: string[],
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography
): string {
  const padding = Math.round(width * 0.05);
  const headlineHTML = highlightGreenWords(data.headline, data.greenWords);
  const hasIcon = !!assets.productIconBase64;

  const textWidth = Math.round(width * 0.48);
  const gridWidth = Math.round(width * 0.4);
  const cardSize = Math.round((gridWidth - 14) / 2);
  const valueSize = Math.round(Math.min(typography.dataPoint * 0.45, cardSize * 0.35));
  const labelSize = Math.round(Math.min(typography.label, cardSize * 0.14));
  const iconSize = Math.round(Math.min(width * 0.5, height * 0.8));

  const statsHTML = stats.slice(0, 4).map(stat => `
    <div style="
      width: ${cardSize}px;
      height: ${cardSize}px;
      background: rgba(0,192,139,0.08);
      border: 1px solid rgba(0,192,139,0.25);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      backdrop-filter: blur(4px);
    ">
      <div style="font-size: ${valueSize}px; font-weight: 700; color: #00C08B;">${stat.value}</div>
      <div style="font-size: ${labelSize}px; color: rgba(255,255,255,0.65); margin-top: 6px; line-height: 1.25; padding: 0 8px;">${stat.label}</div>
    </div>
  `).join('');

  const badgesHTML = badges.length > 0 ? `
    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; justify-content: center;">
      ${badges.map(badge => `
        <span style="
          padding: 6px 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 6px;
          font-size: ${typography.label * 0.8}px;
          color: rgba(255,255,255,0.7);
          font-weight: 500;
        ">${badge}</span>
      `).join('')}
    </div>
  ` : '';

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${width}px;
    height: ${height}px;
    background: #0D1117;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
    color: #FFFFFF;
  }

  .ambient-glow {
    position: absolute;
    top: 0;
    right: 0;
    width: 60%;
    height: 100%;
    background: radial-gradient(ellipse at 70% 40%, rgba(0,192,139,0.06) 0%, transparent 55%);
    pointer-events: none;
  }

  ${hasIcon ? `
  .product-icon {
    position: absolute;
    right: ${-iconSize * 0.15}px;
    top: 50%;
    transform: translateY(-50%);
    width: ${iconSize}px;
    height: ${iconSize}px;
    object-fit: contain;
    opacity: 0.25;
    z-index: 1;
  }
  ` : ''}

  .container {
    position: relative;
    z-index: 2;
    display: flex;
    height: 100%;
    padding: ${padding}px;
    align-items: center;
  }

  .text-zone {
    width: ${textWidth}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-right: ${padding}px;
  }

  .viz-zone {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    z-index: 3;
  }

  .label {
    font-size: ${typography.label}px;
    font-weight: 600;
    color: #00C08B;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .headline {
    font-size: ${typography.headline}px;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -1px;
    margin-bottom: 18px;
  }

  .headline .green { color: #00C08B; }

  .description {
    font-size: ${typography.body}px;
    color: #8892A6;
    line-height: 1.5;
  }

  .cta-tag {
    position: absolute;
    top: ${padding}px;
    right: ${padding}px;
    background: rgba(0,192,139,0.12);
    border: 1px solid rgba(0,192,139,0.3);
    color: #00C08B;
    font-size: ${Math.max(10, typography.label * 0.85)}px;
    font-weight: 600;
    padding: 7px 16px;
    border-radius: 20px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    z-index: 10;
  }

  .logo {
    position: absolute;
    bottom: ${padding * 0.6}px;
    left: ${padding}px;
    height: ${Math.max(20, padding * 0.5)}px;
    z-index: 10;
  }
</style></head><body>
  <div class="ambient-glow"></div>
  ${hasIcon ? `<img src="${assets.productIconBase64}" class="product-icon" alt="" />` : ''}
  ${data.ctaLabel ? `<div class="cta-tag">${data.ctaLabel}</div>` : ''}

  <div class="container">
    <div class="text-zone">
      <div class="label">${data.label}</div>
      <div class="headline">${headlineHTML}</div>
      <div class="description">${data.description}</div>
    </div>

    <div class="viz-zone">
      <div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;">
          ${statsHTML}
        </div>
        ${badgesHTML}
      </div>
    </div>
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Export ────────────────────────────────────────────────────────────────── */

export const TEMPLATES_V5 = {
  metricsWithIcon: metricsWithIconTemplate,
  comparisonWithIcon: comparisonWithIconTemplate,
  statsGridWithIcon: statsGridWithIconTemplate,
};
