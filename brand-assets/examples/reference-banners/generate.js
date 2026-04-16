const fs = require('fs');

// Telnyx brand: green #00C08B, dark bg #0D1117 or #111827
const TELNYX_GREEN = '#00C08B';
const BG = '#0D1117';

const commonStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  body {
    width: 1200px; height: 627px;
    background: ${BG};
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
    padding: 50px 60px; align-items: center; gap: 0;
  }
  .left { flex: 0 0 540px; }
  .right { flex: 1; display: flex; flex-direction: column; align-items: stretch; justify-content: center; padding-left: 20px; }
  .logo {
    font-size: 22px; font-weight: 800; letter-spacing: -0.5px;
    color: ${TELNYX_GREEN}; margin-bottom: 24px;
  }
  .logo span { color: white; }
  .tag {
    position: absolute; top: 44px; right: 54px;
    background: rgba(0,192,139,0.1); border: 1px solid rgba(0,192,139,0.25);
    color: ${TELNYX_GREEN}; font-size: 12px; font-weight: 600;
    padding: 5px 14px; border-radius: 20px; letter-spacing: 0.5px; z-index: 2;
  }
  .category {
    font-size: 13px; font-weight: 600; color: ${TELNYX_GREEN}; letter-spacing: 1.5px;
    text-transform: uppercase; margin-bottom: 14px;
  }
  .headline { font-size: 46px; font-weight: 800; line-height: 1.08; letter-spacing: -1.5px; margin-bottom: 16px; }
  .headline em { font-style: normal; color: ${TELNYX_GREEN}; }
  .sub { font-size: 18px; color: #8892a6; line-height: 1.5; }
  .divider { width: 1px; background: rgba(255,255,255,0.06); height: 300px; flex-shrink: 0; margin: 0 24px; align-self: center; }
  .logo-bottom { position: absolute; bottom: 40px; left: 60px; z-index: 2; font-size: 20px; font-weight: 800; color: ${TELNYX_GREEN}; letter-spacing: -0.5px; }
`;

const logoBottom = `<div class="logo-bottom">telnyx</div>`;

// Banner 1 — Latency (core differentiator)
fs.writeFileSync('banner-1.html', `<!DOCTYPE html><html><head><style>${commonStyles}
  .metric-cards { display: flex; flex-direction: column; gap: 12px; }
  .metric-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; }
  .metric-card.highlight { background: rgba(0,192,139,0.06); border-color: rgba(0,192,139,0.2); }
  .mc-label { font-size: 14px; color: #8892a6; }
  .mc-value { font-size: 22px; font-weight: 800; color: white; }
  .mc-value.green { color: ${TELNYX_GREEN}; }
  .mc-sub { font-size: 11px; color: #5a6478; margin-top: 2px; }
</style></head><body>
  <div class="bg-grid"></div>
  <div class="tag">VOICE AI INFRASTRUCTURE</div>
  <div class="content">
    <div class="left">
      <div class="category">Voice AI Agents</div>
      <div class="headline">Your voice AI<br>demo works.<br><em>Production won't.</em></div>
      <div class="sub">Multi-vendor stacks add latency that<br>breaks real conversations. We own the<br>network, the telephony, and the GPUs.</div>
    </div>
    <div class="divider"></div>
    <div class="right">
      <div class="metric-cards">
        <div class="metric-card highlight">
          <div><div class="mc-label">Response latency</div><div class="mc-sub">Telnyx Voice AI</div></div>
          <div class="mc-value green">&lt;500ms</div>
        </div>
        <div class="metric-card">
          <div><div class="mc-label">Typical multi-vendor stack</div><div class="mc-sub">Twilio + ElevenLabs + STT</div></div>
          <div class="mc-value" style="color:#e74c3c;">1.5-3s</div>
        </div>
        <div class="metric-card">
          <div><div class="mc-label">Infrastructure</div><div class="mc-sub">Network → Telephony → GPUs</div></div>
          <div class="mc-value green">Full stack</div>
        </div>
        <div class="metric-card">
          <div><div class="mc-label">Global PoPs</div><div class="mc-sub">Co-located with edge GPUs</div></div>
          <div class="mc-value">30+</div>
        </div>
      </div>
    </div>
  </div>
  ${logoBottom}
</body></html>`);

// Banner 2 — Full stack vs stitched (competitive)
fs.writeFileSync('banner-2.html', `<!DOCTYPE html><html><head><style>${commonStyles}
  .stack-compare { width: 100%; }
  .stack-box { padding: 16px 18px; border-radius: 10px; margin-bottom: 10px; }
  .stack-box.bad { background: rgba(231,76,60,0.05); border: 1px solid rgba(231,76,60,0.15); }
  .stack-box.good { background: rgba(0,192,139,0.06); border: 1px solid rgba(0,192,139,0.2); }
  .stack-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
  .stack-title.bad { color: #e74c3c; }
  .stack-title.good { color: ${TELNYX_GREEN}; }
  .stack-item { font-size: 13px; color: #8892a6; line-height: 1.8; padding-left: 20px; position: relative; }
  .stack-item::before { content: '→'; position: absolute; left: 0; }
  .stack-box.bad .stack-item::before { content: '✕'; color: #e74c3c; }
  .stack-box.good .stack-item::before { content: '✓'; color: ${TELNYX_GREEN}; }
</style></head><body>
  <div class="bg-grid"></div>
  <div class="tag">OWN THE STACK</div>
  <div class="content">
    <div class="left">
      <div class="category">Voice AI Agents</div>
      <div class="headline">Stop stitching.<br><em>Start shipping.</em></div>
      <div class="sub">Twilio for SIP. ElevenLabs for TTS.<br>Third-party STT. Four dashboards.<br>One platform replaces all of it.</div>
    </div>
    <div class="divider"></div>
    <div class="right">
      <div class="stack-compare">
        <div class="stack-box bad">
          <div class="stack-title bad">Multi-vendor stack</div>
          <div class="stack-item">SIP provider + STT vendor + TTS vendor</div>
          <div class="stack-item">3-5 carrier hops per call</div>
          <div class="stack-item">4 dashboards to debug one failed call</div>
          <div class="stack-item">Surprise bills from 4 vendors</div>
        </div>
        <div class="stack-box good">
          <div class="stack-title good">Telnyx Voice AI</div>
          <div class="stack-item">One platform: network + telephony + AI</div>
          <div class="stack-item">Sub-second latency, one hop</div>
          <div class="stack-item">End-to-end call traces in one dashboard</div>
          <div class="stack-item">One predictable bill</div>
        </div>
      </div>
    </div>
  </div>
  ${logoBottom}
</body></html>`);

// Banner 3 — Migration (competitor takeout)
fs.writeFileSync('banner-3.html', `<!DOCTYPE html><html><head><style>${commonStyles}
  .migrate-list { width: 100%; }
  .migrate-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 18px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
  .migrate-from { font-size: 15px; color: #6b7486; text-decoration: line-through; }
  .migrate-arrow { font-size: 18px; color: ${TELNYX_GREEN}; margin: 0 12px; }
  .migrate-to { font-size: 14px; font-weight: 700; color: ${TELNYX_GREEN}; }
  .migrate-badge { font-size: 11px; background: rgba(0,192,139,0.1); color: ${TELNYX_GREEN}; padding: 3px 8px; border-radius: 8px; font-weight: 600; }
  .migrate-cta { margin-top: 12px; text-align: center; font-size: 13px; color: #5a6478; }
</style></head><body>
  <div class="bg-grid"></div>
  <div class="tag">ONE-CLICK MIGRATION</div>
  <div class="content">
    <div class="left">
      <div class="category">Voice AI Agents</div>
      <div class="headline">Migrate from<br>Vapi or ElevenLabs<br><em>in one click.</em></div>
      <div class="sub">Import your agents, voice flows,<br>and settings. No rebuilding.<br>Lower latency from day one.</div>
    </div>
    <div class="divider"></div>
    <div class="right">
      <div class="migrate-list">
        <div class="migrate-card">
          <span class="migrate-from">Vapi</span>
          <span class="migrate-arrow">→</span>
          <span class="migrate-to">Telnyx Voice AI</span>
          <span class="migrate-badge">1-click</span>
        </div>
        <div class="migrate-card">
          <span class="migrate-from">ElevenLabs</span>
          <span class="migrate-arrow">→</span>
          <span class="migrate-to">Telnyx Voice AI</span>
          <span class="migrate-badge">1-click</span>
        </div>
        <div class="migrate-card">
          <span class="migrate-from">Retell AI</span>
          <span class="migrate-arrow">→</span>
          <span class="migrate-to">Telnyx Voice AI</span>
          <span class="migrate-badge">1-click</span>
        </div>
        <div class="migrate-card">
          <span class="migrate-from">Any platform</span>
          <span class="migrate-arrow">→</span>
          <span class="migrate-to">Telnyx Voice AI</span>
          <span class="migrate-badge">API import</span>
        </div>
      </div>
      <div class="migrate-cta">Reuse voice flows, scripts, and settings</div>
    </div>
  </div>
  ${logoBottom}
</body></html>`);

// Banner 4 — Build in minutes (no-code + API)
fs.writeFileSync('banner-4.html', `<!DOCTYPE html><html><head><style>${commonStyles}
  .build-steps { width: 100%; }
  .step { display: flex; align-items: flex-start; margin-bottom: 18px; position: relative; }
  .step-num {
    width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; margin-right: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 800; background: rgba(0,192,139,0.12); color: ${TELNYX_GREEN};
    border: 1.5px solid rgba(0,192,139,0.3);
  }
  .step-content {}
  .step-title { font-size: 16px; font-weight: 700; color: white; }
  .step-desc { font-size: 13px; color: #8892a6; margin-top: 2px; }
  .step:not(:last-child)::after {
    content: ''; position: absolute; left: 16px; top: 34px; width: 2px; height: 18px;
    background: rgba(0,192,139,0.15);
  }
  .build-tags { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .build-tag { font-size: 11px; color: #8892a6; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 4px 10px; border-radius: 6px; }
</style></head><body>
  <div class="bg-grid"></div>
  <div class="tag">NO-CODE + API</div>
  <div class="content">
    <div class="left">
      <div class="category">Voice AI Agents</div>
      <div class="headline">Build voice AI<br>agents in<br><em>minutes.</em></div>
      <div class="sub">No-code builder for fast prototyping.<br>Full APIs for production scale.<br>Your models or ours. Zero lock-in.</div>
    </div>
    <div class="divider"></div>
    <div class="right">
      <div class="build-steps">
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-content">
            <div class="step-title">Build your agent</div>
            <div class="step-desc">No-code UI or API — your choice</div>
          </div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-content">
            <div class="step-title">Pick your model</div>
            <div class="step-desc">Open source LLMs or bring your own keys</div>
          </div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-content">
            <div class="step-title">Connect telephony</div>
            <div class="step-desc">One-click PSTN integration, global numbers</div>
          </div>
        </div>
        <div class="step">
          <div class="step-num">4</div>
          <div class="step-content">
            <div class="step-title">Test & launch</div>
            <div class="step-desc">Automated multi-path testing, then go live</div>
          </div>
        </div>
      </div>
      <div class="build-tags">
        <div class="build-tag">30+ languages</div>
        <div class="build-tag">Multi-agent handoffs</div>
        <div class="build-tag">MCP support</div>
        <div class="build-tag">Tool calling</div>
      </div>
    </div>
  </div>
  ${logoBottom}
</body></html>`);

// Banner 5 — Enterprise trust / compliance
fs.writeFileSync('banner-5.html', `<!DOCTYPE html><html><head><style>${commonStyles}
  .trust-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .trust-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; text-align: center; }
  .trust-card.highlight { background: rgba(0,192,139,0.05); border-color: rgba(0,192,139,0.15); }
  .tc-value { font-size: 24px; font-weight: 800; color: white; }
  .tc-value.green { color: ${TELNYX_GREEN}; }
  .tc-label { font-size: 11px; color: #5a6478; margin-top: 3px; line-height: 1.3; }
  .badges { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; justify-content: center; }
  .badge { font-size: 11px; color: ${TELNYX_GREEN}; background: rgba(0,192,139,0.08); border: 1px solid rgba(0,192,139,0.15); padding: 4px 10px; border-radius: 6px; font-weight: 600; }
</style></head><body>
  <div class="bg-grid"></div>
  <div class="tag">ENTERPRISE-READY</div>
  <div class="content">
    <div class="left">
      <div class="category">Voice AI Agents</div>
      <div class="headline">Voice AI your<br>compliance team<br><em>will approve.</em></div>
      <div class="sub">HIPAA-ready. SOC 2 certified.<br>Licensed carrier in 30+ countries.<br>Enterprise security, not startup promises.</div>
    </div>
    <div class="divider"></div>
    <div class="right">
      <div class="trust-grid">
        <div class="trust-card highlight">
          <div class="tc-value green">30+</div>
          <div class="tc-label">Countries licensed</div>
        </div>
        <div class="trust-card">
          <div class="tc-value">100+</div>
          <div class="tc-label">Markets with local numbers</div>
        </div>
        <div class="trust-card">
          <div class="tc-value">70+</div>
          <div class="tc-label">Languages supported</div>
        </div>
        <div class="trust-card">
          <div class="tc-value green">24/7</div>
          <div class="tc-label">Engineering support</div>
        </div>
      </div>
      <div class="badges">
        <div class="badge">HIPAA</div>
        <div class="badge">SOC 2 Type II</div>
        <div class="badge">GDPR</div>
        <div class="badge">PCI-DSS</div>
        <div class="badge">STIR/SHAKEN</div>
      </div>
    </div>
  </div>
  ${logoBottom}
</body></html>`);

console.log('All 5 Telnyx Voice AI banners generated');
