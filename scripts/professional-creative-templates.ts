/**
 * Professional Creative Templates
 * High-quality, production-ready ad templates matching Telnyx brand standards
 */

export interface CreativeData {
  headline: string;
  description: string;
  dataPoint: string;
  cta: string;
  pillar: 'trust' | 'infrastructure' | 'physics';
  audience?: string;
  platform: string;
}

export interface TemplateAssets {
  logoBase64: string;
  backgroundImage?: string;
}

const BRAND = {
  colors: {
    darkBg: '#0D1117',
    brandGreen: '#00C08B',
    white: '#FFFFFF',
    gray: '#8892a6',
    subtleGray: '#5a6478',
    red: '#e74c3c',
  }
};

/**
 * Template 1: Metric Comparison
 * Shows Telnyx vs competitors with data cards
 */
export function generateMetricComparisonTemplate(
  data: CreativeData,
  assets: TemplateAssets,
  width: number,
  height: number
): string {
  const padding = 60;

  // Pillar-specific metrics
  const metrics = {
    trust: [
      { label: 'Compliance', telnyxValue: 'HIPAA/SOC2/PCI', competitorValue: 'SOC2 only', highlight: true },
      { label: 'Uptime SLA', telnyxValue: '99.999%', competitorValue: '99.9%', highlight: false },
      { label: 'Data residency', telnyxValue: '140+ countries', competitorValue: 'US/EU only', highlight: false },
      { label: 'Security audits', telnyxValue: 'Continuous', competitorValue: 'Annual', highlight: false },
    ],
    infrastructure: [
      { label: 'Network ownership', telnyxValue: 'Owned', competitorValue: 'Rented', highlight: true },
      { label: 'Vendor stack', telnyxValue: '1 platform', competitorValue: '5+ vendors', highlight: false },
      { label: 'Global PoPs', telnyxValue: '30+', competitorValue: '10-15', highlight: false },
      { label: 'Network hops', telnyxValue: 'Zero extra', competitorValue: '3-5 hops', highlight: false },
    ],
    physics: [
      { label: 'Response latency', telnyxValue: '<500ms', competitorValue: '1.5-3s', highlight: true },
      { label: 'Infrastructure', telnyxValue: 'Full stack', competitorValue: 'Multi-vendor', highlight: false },
      { label: 'GPU co-location', telnyxValue: 'Edge PoPs', competitorValue: 'Centralized', highlight: false },
      { label: 'Inference speed', telnyxValue: 'Sub-200ms', competitorValue: '500ms+', highlight: false },
    ],
  };

  const pillarMetrics = metrics[data.pillar] || metrics.physics;

  return `<!DOCTYPE html><html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  body {
    width: ${width}px; height: ${height}px;
    background: ${BRAND.colors.darkBg};
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: white; overflow: hidden; position: relative;
  }
  .bg-grid {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(circle at 80% 20%, rgba(0,192,139,0.06) 0%, transparent 50%),
      radial-gradient(circle at 20% 80%, rgba(0,192,139,0.04) 0%, transparent 50%);
    z-index: 0;
  }
  .content {
    position: relative; z-index: 1; display: flex; height: 100%;
    padding: ${padding}px; align-items: center; gap: 0;
  }
  .left { flex: 0 0 540px; }
  .right { flex: 1; display: flex; flex-direction: column; align-items: stretch; justify-content: center; padding-left: 20px; }
  .tag {
    position: absolute; top: 44px; right: 54px;
    background: rgba(0,192,139,0.1); border: 1px solid rgba(0,192,139,0.25);
    color: ${BRAND.colors.brandGreen}; font-size: 12px; font-weight: 600;
    padding: 5px 14px; border-radius: 20px; letter-spacing: 0.5px; z-index: 2;
  }
  .category {
    font-size: 13px; font-weight: 600; color: ${BRAND.colors.brandGreen}; letter-spacing: 1.5px;
    text-transform: uppercase; margin-bottom: 14px;
  }
  .headline { font-size: 46px; font-weight: 800; line-height: 1.08; letter-spacing: -1.5px; margin-bottom: 16px; }
  .headline em { font-style: normal; color: ${BRAND.colors.brandGreen}; }
  .sub { font-size: 18px; color: ${BRAND.colors.gray}; line-height: 1.5; }
  .divider { width: 1px; background: rgba(255,255,255,0.06); height: 300px; flex-shrink: 0; margin: 0 24px; align-self: center; }
  .logo-bottom {
    position: absolute; bottom: 40px; left: ${padding}px; z-index: 2;
    height: 20px; opacity: 0.9;
  }
  .metric-cards { display: flex; flex-direction: column; gap: 12px; }
  .metric-card {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;
  }
  .metric-card.highlight { background: rgba(0,192,139,0.06); border-color: rgba(0,192,139,0.2); }
  .mc-label { font-size: 14px; color: ${BRAND.colors.gray}; }
  .mc-value { font-size: 22px; font-weight: 800; color: white; }
  .mc-value.green { color: ${BRAND.colors.brandGreen}; }
  .mc-value.red { color: ${BRAND.colors.red}; }
  .mc-sub { font-size: 11px; color: ${BRAND.colors.subtleGray}; margin-top: 2px; }
</style></head><body>
  <div class="bg-grid"></div>
  <div class="tag">${data.pillar.toUpperCase()}</div>
  <div class="content">
    <div class="left">
      <div class="category">${data.audience || 'Voice AI Infrastructure'}</div>
      <div class="headline">${data.headline}</div>
      <div class="sub">${data.description}</div>
    </div>
    <div class="divider"></div>
    <div class="right">
      <div class="metric-cards">
        ${pillarMetrics.map(m => `
        <div class="metric-card ${m.highlight ? 'highlight' : ''}">
          <div><div class="mc-label">${m.label}</div><div class="mc-sub">Telnyx</div></div>
          <div class="mc-value green">${m.telnyxValue}</div>
        </div>
        `).join('')}
      </div>
    </div>
  </div>
  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo-bottom" alt="Telnyx" />` : ''}
</body></html>`;
}

/**
 * Template 2: Feature Showcase
 * Highlights key features with icons/visuals
 */
export function generateFeatureShowcaseTemplate(
  data: CreativeData,
  assets: TemplateAssets,
  width: number,
  height: number
): string {
  const padding = 60;

  const features = {
    trust: [
      { icon: '🔒', title: 'HIPAA Ready', desc: 'Built for healthcare' },
      { icon: '✓', title: 'SOC 2 Type II', desc: 'Continuous compliance' },
      { icon: '🌐', title: '140+ Countries', desc: 'Global data residency' },
      { icon: '⚡', title: '99.999% Uptime', desc: 'Enterprise SLA' },
    ],
    infrastructure: [
      { icon: '🏗️', title: 'Owned Network', desc: 'Not a reseller' },
      { icon: '📱', title: 'One Platform', desc: 'No vendor stack' },
      { icon: '🌍', title: '30+ Global PoPs', desc: 'Edge computing' },
      { icon: '⚙️', title: 'Zero Extra Hops', desc: 'Direct routing' },
    ],
    physics: [
      { icon: '⚡', title: '<500ms Latency', desc: 'Real-time voice' },
      { icon: '🚀', title: 'Co-located GPUs', desc: 'Edge inference' },
      { icon: '📊', title: 'Full Stack', desc: 'Network + Telephony + AI' },
      { icon: '🎯', title: 'Sub-200ms', desc: 'Inference speed' },
    ],
  };

  const pillarFeatures = features[data.pillar] || features.physics;

  return `<!DOCTYPE html><html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  body {
    width: ${width}px; height: ${height}px;
    background: ${BRAND.colors.darkBg};
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: white; overflow: hidden; position: relative;
  }
  .bg-grid {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(circle at 50% 50%, rgba(0,192,139,0.04) 0%, transparent 70%);
    z-index: 0;
  }
  .content {
    position: relative; z-index: 1;
    padding: ${padding}px; height: 100%;
    display: flex; flex-direction: column;
  }
  .header { margin-bottom: 40px; }
  .category {
    font-size: 13px; font-weight: 600; color: ${BRAND.colors.brandGreen};
    letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px;
  }
  .headline {
    font-size: 52px; font-weight: 800; line-height: 1.1;
    letter-spacing: -2px; margin-bottom: 16px; max-width: 800px;
  }
  .headline em { font-style: normal; color: ${BRAND.colors.brandGreen}; }
  .sub { font-size: 20px; color: ${BRAND.colors.gray}; max-width: 700px; }
  .features-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;
    flex: 1;
  }
  .feature-card {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px; padding: 24px; display: flex; flex-direction: column;
  }
  .feature-icon { font-size: 32px; margin-bottom: 12px; }
  .feature-title { font-size: 18px; font-weight: 700; margin-bottom: 6px; }
  .feature-desc { font-size: 14px; color: ${BRAND.colors.gray}; }
  .logo-bottom {
    position: absolute; bottom: 40px; right: ${padding}px; z-index: 2;
    height: 20px; opacity: 0.9;
  }
</style></head><body>
  <div class="bg-grid"></div>
  <div class="content">
    <div class="header">
      <div class="category">${data.audience || 'Voice AI Platform'}</div>
      <div class="headline">${data.headline}</div>
      <div class="sub">${data.description}</div>
    </div>
    <div class="features-grid">
      ${pillarFeatures.map(f => `
      <div class="feature-card">
        <div class="feature-icon">${f.icon}</div>
        <div class="feature-title">${f.title}</div>
        <div class="feature-desc">${f.desc}</div>
      </div>
      `).join('')}
    </div>
  </div>
  ${assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo-bottom" alt="Telnyx" />` : ''}
</body></html>`;
}

export const TEMPLATES = {
  'metric-comparison': generateMetricComparisonTemplate,
  'feature-showcase': generateFeatureShowcaseTemplate,
};
