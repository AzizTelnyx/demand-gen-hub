/**
 * Templates V3 - Matching Real Telnyx Ad Style
 *
 * Based on actual Telnyx ads with:
 * - Dark gradient backgrounds with teal/cyan hints
 * - Green accent words in headlines
 * - Glowing metric cards with subtle borders
 * - Feature badges row
 * - Better visual density
 */

import { Typography } from '../src/lib/typography';
import { PatternPalette, getProductColor, NEUTRALS } from '../src/lib/brand-colors';

export interface TemplateData {
  headline: string;
  greenWords?: string[];  // Words to highlight in green
  description: string;
  cta: string;
  label: string;
  pillar: 'trust' | 'infrastructure' | 'physics';
  product?: string;
}

export interface TemplateAssets {
  logoBase64: string;
  productIcon?: string;
  backgroundPattern?: string;
}

export interface MetricCard {
  value: string;
  label: string;
  sublabel?: string;
  highlight?: boolean;
}

export interface ComparisonItem {
  bad: string;
  good: string;
}

export interface FeatureBadge {
  text: string;
}

/* ─── Helper Functions ──────────────────────────────────────────────────────── */

function highlightGreenWords(headline: string, greenWords: string[] = []): string {
  let result = headline;
  for (const word of greenWords) {
    const regex = new RegExp(`(${word})`, 'gi');
    result = result.replace(regex, '<span class="green-accent">$1</span>');
  }
  return result;
}

function extractGreenWords(headline: string): { text: string; greenWords: string[] } {
  // Auto-detect words that should be green based on common patterns
  const patterns = [
    /\d+[+%]?\s*\w+/g,  // Numbers like "30+ countries"
    /<?\d+m?s/gi,       // Latency like "<500ms"
    /one click|in minutes|full stack|own network/gi,
    /hipaa|soc\s*2|pci|gdpr/gi,
  ];

  const greenWords: string[] = [];
  for (const pattern of patterns) {
    const matches = headline.match(pattern);
    if (matches) {
      greenWords.push(...matches);
    }
  }

  return { text: headline, greenWords };
}

/* ─── Dark Mode Template (Matching Real Telnyx Ads) ─────────────────────────── */

export function generateDarkModeTemplateV3(
  data: TemplateData,
  metrics: MetricCard[],
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography,
  featureBadges: FeatureBadge[] = []
): string {
  const padding = Math.max(40, Math.min(70, width * 0.05));
  const isLandscape = width > height;
  const isPortrait = height > width * 1.2;
  const productColors = getProductColor(data.product);

  // Process headline for green words
  const headlineHTML = highlightGreenWords(data.headline, data.greenWords);

  // Calculate card dimensions
  const cardAreaWidth = isLandscape ? Math.floor(width * 0.42) : width - padding * 2;
  const cardAreaHeight = isLandscape ? height - padding * 2 - 80 : Math.floor(height * 0.35);
  const cardCols = metrics.length > 2 ? 2 : 1;
  const cardRows = Math.ceil(metrics.length / cardCols);
  const cardGap = 12;
  const cardWidth = Math.floor((cardAreaWidth - cardGap * (cardCols - 1)) / cardCols);
  const cardHeight = Math.floor((cardAreaHeight - cardGap * (cardRows - 1)) / cardRows);

  const valueSize = Math.min(typography.dataPoint * 0.6, cardHeight * 0.35);
  const labelSize = Math.min(typography.dataLabel, cardHeight * 0.14);
  const sublabelSize = Math.min(typography.label * 0.9, cardHeight * 0.1);

  const metricsHTML = metrics.map((metric, i) => `
    <div class="metric-card" style="
      width: ${cardWidth}px;
      height: ${cardHeight}px;
      background: linear-gradient(135deg, rgba(0,227,170,0.05) 0%, rgba(0,0,0,0) 100%);
      border: 1px solid rgba(0,227,170,0.2);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      padding: ${cardHeight * 0.15}px ${cardWidth * 0.1}px;
      gap: 4px;
    ">
      <div style="
        font-size: ${valueSize}px;
        font-weight: 700;
        color: ${metric.highlight !== false ? '#00E3AA' : '#FFFFFF'};
        line-height: 1.1;
        letter-spacing: -0.5px;
      ">${metric.value}</div>
      <div style="
        font-size: ${labelSize}px;
        font-weight: 500;
        color: #FFFFFF;
        line-height: 1.2;
      ">${metric.label}</div>
      ${metric.sublabel ? `
        <div style="
          font-size: ${sublabelSize}px;
          font-weight: 400;
          color: rgba(255,255,255,0.5);
          line-height: 1.2;
        ">${metric.sublabel}</div>
      ` : ''}
    </div>
  `).join('');

  const badgesHTML = featureBadges.length > 0 ? `
    <div class="feature-badges" style="
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: ${padding * 0.5}px;
    ">
      ${featureBadges.map(badge => `
        <span style="
          display: inline-block;
          padding: 6px 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          font-size: ${typography.label}px;
          color: rgba(255,255,255,0.7);
          font-weight: 500;
        ">${badge.text}</span>
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
    background: linear-gradient(135deg, #0a1a1a 0%, #0d0d0d 50%, #0a0f14 100%);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
    position: relative;
  }

  /* Subtle glow effect */
  .glow-overlay {
    position: absolute;
    top: 0;
    right: 0;
    width: 60%;
    height: 100%;
    background: radial-gradient(ellipse at 80% 30%, rgba(0,227,170,0.08) 0%, transparent 50%);
    pointer-events: none;
  }

  .content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: ${isLandscape ? 'row' : 'column'};
    height: 100%;
    padding: ${padding}px;
    padding-bottom: ${padding + 50}px;
    gap: ${padding}px;
  }

  .text-section {
    flex: ${isLandscape ? '0 0 52%' : '1'};
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${padding * 0.3}px;
    ${isPortrait ? 'order: 1;' : ''}
  }

  .metrics-section {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    justify-content: ${isLandscape ? 'flex-end' : 'center'};
    gap: ${cardGap}px;
    ${isPortrait ? 'order: 0;' : ''}
  }

  .label {
    font-size: ${typography.label}px;
    font-weight: 500;
    color: rgba(255,255,255,0.6);
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .headline {
    font-size: ${typography.headline}px;
    font-weight: 700;
    color: #FFFFFF;
    line-height: 1.1;
    letter-spacing: -0.5px;
  }

  .headline .green-accent {
    color: #00E3AA;
  }

  .description {
    font-size: ${typography.body}px;
    font-weight: 400;
    color: rgba(255,255,255,0.6);
    line-height: 1.5;
    max-width: 95%;
  }

  .cta-button {
    position: absolute;
    top: ${padding}px;
    right: ${padding}px;
    background: #00E3AA;
    color: #000000;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: ${typography.cta}px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .logo {
    position: absolute;
    bottom: ${padding * 0.6}px;
    left: ${padding}px;
    height: ${Math.round(padding * 0.5)}px;
  }
</style></head><body>
  <div class="glow-overlay"></div>

  <div class="content">
    <div class="text-section">
      <div class="label">${data.label}</div>
      <div class="headline">${headlineHTML}</div>
      <div class="description">${data.description}</div>
      ${badgesHTML}
    </div>

    <div class="metrics-section">
      ${metricsHTML}
    </div>
  </div>

  <div class="cta-button">${data.cta}</div>
  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Comparison Template (Like Banner 2 & 3) ───────────────────────────────── */

export function generateComparisonTemplateV3(
  data: TemplateData,
  comparison: { badHeader: string; goodHeader: string; items: ComparisonItem[] },
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography
): string {
  const padding = Math.max(40, Math.min(70, width * 0.05));
  const isLandscape = width > height;

  const headlineHTML = highlightGreenWords(data.headline, data.greenWords);

  const compAreaWidth = isLandscape ? Math.floor(width * 0.42) : width - padding * 2;
  const rowHeight = Math.floor((height - padding * 3) / (comparison.items.length + 1.5));
  const fontSize = Math.min(typography.body * 0.9, rowHeight * 0.35);

  const comparisonHTML = `
    <div class="comparison-container" style="
      width: ${compAreaWidth}px;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(0,227,170,0.15);
      border-radius: 12px;
      overflow: hidden;
    ">
      <div class="comparison-headers" style="
        display: flex;
        border-bottom: 1px solid rgba(0,227,170,0.15);
      ">
        <div style="
          flex: 1;
          padding: 12px 16px;
          font-size: ${typography.label}px;
          font-weight: 600;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        ">${comparison.badHeader}</div>
        <div style="
          flex: 1;
          padding: 12px 16px;
          font-size: ${typography.label}px;
          font-weight: 600;
          color: #00E3AA;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        ">${comparison.goodHeader}</div>
      </div>
      ${comparison.items.map((item, i) => `
        <div style="
          display: flex;
          ${i < comparison.items.length - 1 ? 'border-bottom: 1px solid rgba(255,255,255,0.05);' : ''}
        ">
          <div style="
            flex: 1;
            padding: 14px 16px;
            display: flex;
            align-items: center;
            gap: 10px;
            color: rgba(255,255,255,0.5);
          ">
            <span style="color: #FF6B6B; font-size: ${fontSize * 1.1}px;">✗</span>
            <span style="font-size: ${fontSize}px;">${item.bad}</span>
          </div>
          <div style="
            flex: 1;
            padding: 14px 16px;
            display: flex;
            align-items: center;
            gap: 10px;
            color: #FFFFFF;
          ">
            <span style="color: #00E3AA; font-size: ${fontSize * 1.1}px; font-weight: 600;">✓</span>
            <span style="font-size: ${fontSize}px; font-weight: 500;">${item.good}</span>
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
    background: linear-gradient(135deg, #0a1a1a 0%, #0d0d0d 50%, #0a0f14 100%);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
    position: relative;
  }

  .glow-overlay {
    position: absolute;
    top: 0;
    right: 0;
    width: 60%;
    height: 100%;
    background: radial-gradient(ellipse at 80% 30%, rgba(0,227,170,0.06) 0%, transparent 50%);
  }

  .content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: ${isLandscape ? 'row' : 'column'};
    height: 100%;
    padding: ${padding}px;
    padding-bottom: ${padding + 50}px;
    gap: ${padding}px;
    align-items: center;
  }

  .text-section {
    flex: ${isLandscape ? '0 0 50%' : '1'};
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${padding * 0.3}px;
  }

  .comparison-section {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: ${isLandscape ? 'flex-end' : 'center'};
  }

  .label {
    font-size: ${typography.label}px;
    font-weight: 500;
    color: rgba(255,255,255,0.6);
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .headline {
    font-size: ${typography.headline}px;
    font-weight: 700;
    color: #FFFFFF;
    line-height: 1.1;
    letter-spacing: -0.5px;
  }

  .headline .green-accent {
    color: #00E3AA;
  }

  .description {
    font-size: ${typography.body}px;
    font-weight: 400;
    color: rgba(255,255,255,0.6);
    line-height: 1.5;
  }

  .cta-button {
    position: absolute;
    top: ${padding}px;
    right: ${padding}px;
    background: #00E3AA;
    color: #000000;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: ${typography.cta}px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .logo {
    position: absolute;
    bottom: ${padding * 0.6}px;
    left: ${padding}px;
    height: ${Math.round(padding * 0.5)}px;
  }
</style></head><body>
  <div class="glow-overlay"></div>

  <div class="content">
    <div class="text-section">
      <div class="label">${data.label}</div>
      <div class="headline">${headlineHTML}</div>
      <div class="description">${data.description}</div>
    </div>

    <div class="comparison-section">
      ${comparisonHTML}
    </div>
  </div>

  <div class="cta-button">${data.cta}</div>
  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Steps Template (Like Banner 4) ────────────────────────────────────────── */

export function generateStepsTemplateV3(
  data: TemplateData,
  steps: { title: string; description: string }[],
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography,
  featureBadges: FeatureBadge[] = []
): string {
  const padding = Math.max(40, Math.min(70, width * 0.05));
  const isLandscape = width > height;

  const headlineHTML = highlightGreenWords(data.headline, data.greenWords);

  const stepAreaWidth = isLandscape ? Math.floor(width * 0.42) : width - padding * 2;
  const stepHeight = Math.floor((height - padding * 3) / (steps.length + 1));
  const numberSize = Math.min(24, stepHeight * 0.4);
  const titleSize = Math.min(typography.body, stepHeight * 0.28);
  const descSize = Math.min(typography.label, stepHeight * 0.22);

  const stepsHTML = steps.map((step, i) => `
    <div style="
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 8px 0;
    ">
      <div style="
        width: ${numberSize + 8}px;
        height: ${numberSize + 8}px;
        border-radius: 50%;
        border: 2px solid #00E3AA;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${numberSize * 0.6}px;
        font-weight: 600;
        color: #00E3AA;
        flex-shrink: 0;
      ">${i + 1}</div>
      <div style="flex: 1;">
        <div style="
          font-size: ${titleSize}px;
          font-weight: 600;
          color: #FFFFFF;
          margin-bottom: 4px;
        ">${step.title}</div>
        <div style="
          font-size: ${descSize}px;
          color: rgba(255,255,255,0.5);
          line-height: 1.4;
        ">${step.description}</div>
      </div>
    </div>
  `).join('');

  const badgesHTML = featureBadges.length > 0 ? `
    <div style="
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(255,255,255,0.1);
    ">
      ${featureBadges.map(badge => `
        <span style="
          padding: 6px 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          font-size: ${typography.label * 0.9}px;
          color: rgba(255,255,255,0.7);
        ">${badge.text}</span>
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
    background: linear-gradient(135deg, #0a1a1a 0%, #0d0d0d 50%, #0a0f14 100%);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
    position: relative;
  }

  .glow-overlay {
    position: absolute;
    top: 0;
    right: 0;
    width: 60%;
    height: 100%;
    background: radial-gradient(ellipse at 80% 30%, rgba(0,227,170,0.06) 0%, transparent 50%);
  }

  .content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: ${isLandscape ? 'row' : 'column'};
    height: 100%;
    padding: ${padding}px;
    padding-bottom: ${padding + 50}px;
    gap: ${padding}px;
  }

  .text-section {
    flex: ${isLandscape ? '0 0 50%' : '1'};
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${padding * 0.3}px;
  }

  .steps-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .label {
    font-size: ${typography.label}px;
    font-weight: 500;
    color: rgba(255,255,255,0.6);
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .headline {
    font-size: ${typography.headline}px;
    font-weight: 700;
    color: #FFFFFF;
    line-height: 1.1;
  }

  .headline .green-accent {
    color: #00E3AA;
  }

  .description {
    font-size: ${typography.body}px;
    color: rgba(255,255,255,0.6);
    line-height: 1.5;
  }

  .cta-button {
    position: absolute;
    top: ${padding}px;
    right: ${padding}px;
    background: #00E3AA;
    color: #000000;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: ${typography.cta}px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .logo {
    position: absolute;
    bottom: ${padding * 0.6}px;
    left: ${padding}px;
    height: ${Math.round(padding * 0.5)}px;
  }
</style></head><body>
  <div class="glow-overlay"></div>

  <div class="content">
    <div class="text-section">
      <div class="label">${data.label}</div>
      <div class="headline">${headlineHTML}</div>
      <div class="description">${data.description}</div>
    </div>

    <div class="steps-section">
      ${stepsHTML}
      ${badgesHTML}
    </div>
  </div>

  <div class="cta-button">${data.cta}</div>
  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Stats Grid Template (Like Banner 5) ───────────────────────────────────── */

export function generateStatsGridTemplateV3(
  data: TemplateData,
  stats: MetricCard[],
  complianceBadges: string[],
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography
): string {
  const padding = Math.max(40, Math.min(70, width * 0.05));
  const isLandscape = width > height;

  const headlineHTML = highlightGreenWords(data.headline, data.greenWords);

  const gridWidth = isLandscape ? Math.floor(width * 0.4) : width - padding * 2;
  const gridHeight = isLandscape ? Math.floor(height * 0.5) : Math.floor(height * 0.35);
  const cardWidth = Math.floor((gridWidth - 12) / 2);
  const cardHeight = Math.floor((gridHeight - 12) / 2);
  const valueSize = Math.min(typography.dataPoint * 0.5, cardHeight * 0.4);
  const labelSize = Math.min(typography.label, cardHeight * 0.18);

  const statsHTML = stats.slice(0, 4).map(stat => `
    <div style="
      width: ${cardWidth}px;
      height: ${cardHeight}px;
      background: linear-gradient(135deg, rgba(0,227,170,0.08) 0%, rgba(0,0,0,0) 100%);
      border: 1px solid rgba(0,227,170,0.2);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 12px;
    ">
      <div style="
        font-size: ${valueSize}px;
        font-weight: 700;
        color: #00E3AA;
        line-height: 1;
      ">${stat.value}</div>
      <div style="
        font-size: ${labelSize}px;
        color: rgba(255,255,255,0.7);
        margin-top: 6px;
        line-height: 1.3;
      ">${stat.label}</div>
    </div>
  `).join('');

  const badgesHTML = complianceBadges.length > 0 ? `
    <div style="
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
      justify-content: center;
    ">
      ${complianceBadges.map(badge => `
        <span style="
          padding: 6px 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 6px;
          font-size: ${typography.label * 0.85}px;
          color: rgba(255,255,255,0.8);
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
    background: linear-gradient(135deg, #0a1a1a 0%, #0d0d0d 50%, #0a0f14 100%);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
    position: relative;
  }

  .glow-overlay {
    position: absolute;
    top: 0;
    right: 0;
    width: 60%;
    height: 100%;
    background: radial-gradient(ellipse at 80% 30%, rgba(0,227,170,0.06) 0%, transparent 50%);
  }

  .content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: ${isLandscape ? 'row' : 'column'};
    height: 100%;
    padding: ${padding}px;
    padding-bottom: ${padding + 50}px;
    gap: ${padding}px;
    align-items: center;
  }

  .text-section {
    flex: ${isLandscape ? '0 0 52%' : '1'};
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${padding * 0.3}px;
  }

  .stats-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: ${isLandscape ? 'flex-end' : 'center'};
    justify-content: center;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .label {
    font-size: ${typography.label}px;
    font-weight: 500;
    color: rgba(255,255,255,0.6);
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .headline {
    font-size: ${typography.headline}px;
    font-weight: 700;
    color: #FFFFFF;
    line-height: 1.1;
  }

  .headline .green-accent {
    color: #00E3AA;
  }

  .description {
    font-size: ${typography.body}px;
    color: rgba(255,255,255,0.6);
    line-height: 1.5;
  }

  .cta-button {
    position: absolute;
    top: ${padding}px;
    right: ${padding}px;
    background: #00E3AA;
    color: #000000;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: ${typography.cta}px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .logo {
    position: absolute;
    bottom: ${padding * 0.6}px;
    left: ${padding}px;
    height: ${Math.round(padding * 0.5)}px;
  }
</style></head><body>
  <div class="glow-overlay"></div>

  <div class="content">
    <div class="text-section">
      <div class="label">${data.label}</div>
      <div class="headline">${headlineHTML}</div>
      <div class="description">${data.description}</div>
    </div>

    <div class="stats-section">
      <div class="stats-grid">
        ${statsHTML}
      </div>
      ${badgesHTML}
    </div>
  </div>

  <div class="cta-button">${data.cta}</div>
  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Export all templates ──────────────────────────────────────────────────── */

export const TEMPLATES_V3 = {
  darkModeMetrics: generateDarkModeTemplateV3,
  comparison: generateComparisonTemplateV3,
  steps: generateStepsTemplateV3,
  statsGrid: generateStatsGridTemplateV3,
};
