/**
 * Templates V4 - Clean Telnyx Style
 *
 * Based on actual Telnyx reference banners:
 * - Clean dark backgrounds (no overlapping assets)
 * - Data visualizations ARE the visual element
 * - Clear 50/50 split: text left, data viz right
 * - Green accent words in headlines
 * - Feature badges at bottom
 */

import { Typography } from '../src/lib/typography';

export interface TemplateData {
  headline: string;
  greenWords?: string[];
  description: string;
  cta: string;
  label: string;
  ctaLabel?: string;  // Tag in top-right (e.g., "VOICE AI INFRASTRUCTURE")
}

export interface TemplateAssets {
  logoBase64: string;
}

export interface MetricCard {
  value: string;
  label: string;
  sublabel?: string;
  isHighlight?: boolean;  // Green value vs white
  isNegative?: boolean;   // Red value (for comparison)
}

export interface ComparisonSection {
  header: string;
  isGood: boolean;
  items: string[];
}

export interface StepItem {
  number: number;
  title: string;
  description: string;
}

/* ─── Helper: Highlight Green Words ─────────────────────────────────────────── */

function highlightGreenWords(headline: string, greenWords: string[] = []): string {
  let result = headline;
  for (const word of greenWords) {
    const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    result = result.replace(regex, '<span class="green">$1</span>');
  }
  return result;
}

/* ─── Base Styles (shared across templates) ─────────────────────────────────── */

function getBaseStyles(width: number, height: number, padding: number, typography: Typography): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      width: ${width}px;
      height: ${height}px;
      background: linear-gradient(135deg, #0D1117 0%, #0D1117 100%);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
      position: relative;
      color: #FFFFFF;
    }

    /* Subtle glow in top-right */
    .glow {
      position: absolute;
      top: -20%;
      right: -10%;
      width: 50%;
      height: 70%;
      background: radial-gradient(ellipse, rgba(0,192,139,0.08) 0%, transparent 70%);
      pointer-events: none;
    }

    .container {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: row;
      height: 100%;
      padding: ${padding}px;
      gap: ${padding * 0.8}px;
    }

    .text-zone {
      flex: 0 0 50%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding-right: ${padding * 0.5}px;
    }

    .viz-zone {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-end;
    }

    .label {
      font-size: ${typography.label}px;
      font-weight: 600;
      color: #00C08B;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .headline {
      font-size: ${typography.headline}px;
      font-weight: 800;
      line-height: 1.08;
      letter-spacing: -1px;
      margin-bottom: 16px;
    }

    .headline .green {
      color: #00C08B;
    }

    .description {
      font-size: ${typography.body}px;
      color: #8892A6;
      line-height: 1.5;
      max-width: 90%;
    }

    .cta-tag {
      position: absolute;
      top: ${padding}px;
      right: ${padding}px;
      background: rgba(0,192,139,0.1);
      border: 1px solid rgba(0,192,139,0.25);
      color: #00C08B;
      font-size: ${Math.max(10, typography.label * 0.85)}px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 20px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .logo {
      position: absolute;
      bottom: ${padding * 0.6}px;
      left: ${padding}px;
      height: ${Math.max(18, padding * 0.45)}px;
    }
  `;
}

/* ─── Template 1: Metric Cards (like banner-1) ──────────────────────────────── */

export function metricsTemplate(
  data: TemplateData,
  metrics: MetricCard[],
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography
): string {
  const padding = Math.round(width * 0.05);
  const headlineHTML = highlightGreenWords(data.headline, data.greenWords);

  // Card sizing
  const cardWidth = Math.round(width * 0.38);
  const cardHeight = Math.round((height - padding * 2.5) / metrics.length - 8);
  const valueSize = Math.round(Math.min(typography.dataPoint * 0.55, cardHeight * 0.4));
  const labelSize = Math.round(Math.min(typography.body * 0.85, cardHeight * 0.2));
  const sublabelSize = Math.round(labelSize * 0.75);

  const metricsHTML = metrics.map((m, i) => `
    <div class="metric-card ${m.isHighlight !== false ? 'highlight' : ''}" style="
      width: ${cardWidth}px;
      height: ${cardHeight}px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      ${m.isHighlight !== false ? 'background: rgba(0,192,139,0.06); border-color: rgba(0,192,139,0.2);' : ''}
    ">
      <div>
        <div style="font-size: ${labelSize}px; color: #8892A6;">${m.label}</div>
        ${m.sublabel ? `<div style="font-size: ${sublabelSize}px; color: #5A6478; margin-top: 2px;">${m.sublabel}</div>` : ''}
      </div>
      <div style="
        font-size: ${valueSize}px;
        font-weight: 800;
        color: ${m.isNegative ? '#E74C3C' : m.isHighlight !== false ? '#00C08B' : '#FFFFFF'};
      ">${m.value}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${getBaseStyles(width, height, padding, typography)}
</style></head><body>
  <div class="glow"></div>
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

/* ─── Template 2: Two-Column Comparison (like banner-2) ────────────────────── */

export function comparisonTemplate(
  data: TemplateData,
  badSection: ComparisonSection,
  goodSection: ComparisonSection,
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography
): string {
  const padding = Math.round(width * 0.05);
  const headlineHTML = highlightGreenWords(data.headline, data.greenWords);

  const cardWidth = Math.round(width * 0.4);
  const itemSize = Math.round(typography.body * 0.85);
  const headerSize = Math.round(typography.label);

  const renderSection = (section: ComparisonSection) => `
    <div style="
      width: ${Math.round(cardWidth * 0.48)}px;
      background: ${section.isGood ? 'rgba(0,192,139,0.05)' : 'rgba(255,255,255,0.02)'};
      border: 1px solid ${section.isGood ? 'rgba(0,192,139,0.2)' : 'rgba(255,255,255,0.06)'};
      border-radius: 10px;
      padding: 16px;
    ">
      <div style="
        font-size: ${headerSize}px;
        font-weight: 600;
        color: ${section.isGood ? '#00C08B' : 'rgba(255,255,255,0.5)'};
        margin-bottom: 14px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">${section.header}</div>
      ${section.items.map(item => `
        <div style="
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 12px;
          font-size: ${itemSize}px;
          color: ${section.isGood ? '#FFFFFF' : 'rgba(255,255,255,0.5)'};
          line-height: 1.4;
        ">
          <span style="color: ${section.isGood ? '#00C08B' : '#E74C3C'}; font-weight: 600; flex-shrink: 0;">
            ${section.isGood ? '✓' : '✗'}
          </span>
          <span>${item}</span>
        </div>
      `).join('')}
    </div>
  `;

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${getBaseStyles(width, height, padding, typography)}
</style></head><body>
  <div class="glow"></div>
  ${data.ctaLabel ? `<div class="cta-tag">${data.ctaLabel}</div>` : ''}

  <div class="container">
    <div class="text-zone">
      <div class="label">${data.label}</div>
      <div class="headline">${headlineHTML}</div>
      <div class="description">${data.description}</div>
    </div>

    <div class="viz-zone">
      <div style="display: flex; gap: 12px;">
        ${renderSection(badSection)}
        ${renderSection(goodSection)}
      </div>
    </div>
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Template 3: Migration Table (like banner-3) ──────────────────────────── */

export function migrationTemplate(
  data: TemplateData,
  migrations: { from: string; to: string; method: string }[],
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography
): string {
  const padding = Math.round(width * 0.05);
  const headlineHTML = highlightGreenWords(data.headline, data.greenWords);

  const tableWidth = Math.round(width * 0.42);
  const rowHeight = Math.round((height - padding * 3) / (migrations.length + 1.5));
  const fontSize = Math.round(Math.min(typography.body * 0.85, rowHeight * 0.3));

  const migrationsHTML = migrations.map(m => `
    <div style="
      display: flex;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      font-size: ${fontSize}px;
    ">
      <div style="flex: 1; color: rgba(255,255,255,0.5); text-decoration: line-through;">${m.from}</div>
      <div style="color: #00C08B; padding: 0 16px;">→</div>
      <div style="flex: 1; color: #00C08B; font-weight: 500;">${m.to}</div>
      <div style="
        background: rgba(0,192,139,0.1);
        border: 1px solid rgba(0,192,139,0.2);
        padding: 4px 10px;
        border-radius: 4px;
        font-size: ${fontSize * 0.85}px;
        color: #00C08B;
      ">${m.method}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${getBaseStyles(width, height, padding, typography)}
</style></head><body>
  <div class="glow"></div>
  ${data.ctaLabel ? `<div class="cta-tag">${data.ctaLabel}</div>` : ''}

  <div class="container">
    <div class="text-zone">
      <div class="label">${data.label}</div>
      <div class="headline">${headlineHTML}</div>
      <div class="description">${data.description}</div>
    </div>

    <div class="viz-zone">
      <div style="
        width: ${tableWidth}px;
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        padding: 16px 20px;
      ">
        ${migrationsHTML}
        <div style="
          font-size: ${fontSize * 0.8}px;
          color: rgba(255,255,255,0.4);
          text-align: center;
          margin-top: 12px;
        ">Reuse voice flows, scripts, and settings</div>
      </div>
    </div>
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Template 4: Numbered Steps (like banner-4) ────────────────────────────── */

export function stepsTemplate(
  data: TemplateData,
  steps: StepItem[],
  badges: string[],
  assets: TemplateAssets,
  width: number,
  height: number,
  typography: Typography
): string {
  const padding = Math.round(width * 0.05);
  const headlineHTML = highlightGreenWords(data.headline, data.greenWords);

  const stepAreaHeight = height - padding * 3;
  const stepHeight = Math.round(stepAreaHeight / (steps.length + 1));
  const numberSize = Math.round(Math.min(28, stepHeight * 0.35));
  const titleSize = Math.round(Math.min(typography.body, stepHeight * 0.25));
  const descSize = Math.round(titleSize * 0.8);

  const stepsHTML = steps.map(step => `
    <div style="display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px;">
      <div style="
        width: ${numberSize + 4}px;
        height: ${numberSize + 4}px;
        border: 2px solid #00C08B;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${numberSize * 0.55}px;
        font-weight: 600;
        color: #00C08B;
        flex-shrink: 0;
      ">${step.number}</div>
      <div>
        <div style="font-size: ${titleSize}px; font-weight: 600; color: #FFFFFF; margin-bottom: 4px;">${step.title}</div>
        <div style="font-size: ${descSize}px; color: #8892A6; line-height: 1.4;">${step.description}</div>
      </div>
    </div>
  `).join('');

  const badgesHTML = badges.length > 0 ? `
    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08);">
      ${badges.map(badge => `
        <span style="
          padding: 6px 14px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          font-size: ${typography.label * 0.85}px;
          color: rgba(255,255,255,0.6);
        ">${badge}</span>
      `).join('')}
    </div>
  ` : '';

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${getBaseStyles(width, height, padding, typography)}
</style></head><body>
  <div class="glow"></div>
  ${data.ctaLabel ? `<div class="cta-tag">${data.ctaLabel}</div>` : ''}

  <div class="container">
    <div class="text-zone">
      <div class="label">${data.label}</div>
      <div class="headline">${headlineHTML}</div>
      <div class="description">${data.description}</div>
    </div>

    <div class="viz-zone">
      <div>
        ${stepsHTML}
        ${badgesHTML}
      </div>
    </div>
  </div>

  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="Telnyx" />` : ''}
</body></html>`;
}

/* ─── Template 5: Stats Grid (like banner-5) ────────────────────────────────── */

export function statsGridTemplate(
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

  const gridWidth = Math.round(width * 0.38);
  const cardSize = Math.round((gridWidth - 12) / 2);
  const valueSize = Math.round(Math.min(typography.dataPoint * 0.45, cardSize * 0.35));
  const labelSize = Math.round(Math.min(typography.label, cardSize * 0.13));

  const statsHTML = stats.slice(0, 4).map(stat => `
    <div style="
      width: ${cardSize}px;
      height: ${cardSize}px;
      background: rgba(0,192,139,0.05);
      border: 1px solid rgba(0,192,139,0.2);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    ">
      <div style="font-size: ${valueSize}px; font-weight: 700; color: #00C08B;">${stat.value}</div>
      <div style="font-size: ${labelSize}px; color: rgba(255,255,255,0.6); margin-top: 6px; line-height: 1.3;">${stat.label}</div>
    </div>
  `).join('');

  const badgesHTML = badges.length > 0 ? `
    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; justify-content: center;">
      ${badges.map(badge => `
        <span style="
          padding: 6px 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.12);
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
${getBaseStyles(width, height, padding, typography)}
</style></head><body>
  <div class="glow"></div>
  ${data.ctaLabel ? `<div class="cta-tag">${data.ctaLabel}</div>` : ''}

  <div class="container">
    <div class="text-zone">
      <div class="label">${data.label}</div>
      <div class="headline">${headlineHTML}</div>
      <div class="description">${data.description}</div>
    </div>

    <div class="viz-zone">
      <div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
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

export const TEMPLATES_V4 = {
  metrics: metricsTemplate,
  comparison: comparisonTemplate,
  migration: migrationTemplate,
  steps: stepsTemplate,
  statsGrid: statsGridTemplate,
};
