"use client";

import { useState } from "react";
import {
  Crosshair, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronRight, Bot, Workflow, Database,
  ArrowRight, Shield, Zap, Clock, Target, Layers,
  BarChart3, Plug, RefreshCw, Trash2, Plus, Search,
  ExternalLink,
} from "lucide-react";

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: { label: string; color: "green" | "yellow" | "red" | "blue" } | null;
}

function Section({ title, icon, children, defaultOpen = false, badge }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const badgeColors = {
    green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    yellow: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    red: "bg-red-500/15 text-red-400 border-red-500/20",
    blue: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  };

  return (
    <div className="border border-[var(--border-primary)] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors text-left"
      >
        <span className="text-[var(--text-muted)]">{icon}</span>
        <span className="text-[14px] font-medium text-[var(--text-primary)] flex-1">{title}</span>
        {badge && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${badgeColors[badge.color]}`}>
            {badge.label}
          </span>
        )}
        {open ? <ChevronDown size={16} className="text-[var(--text-muted)]" /> : <ChevronRight size={16} className="text-[var(--text-muted)]" />}
      </button>
      {open && <div className="px-5 py-4 space-y-4 text-[13px] text-[var(--text-secondary)] leading-relaxed">{children}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: "done" | "partial" | "blocked" | "planned" }) {
  const config = {
    done: { icon: <CheckCircle2 size={12} />, label: "Live", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
    partial: { icon: <AlertTriangle size={12} />, label: "Partial", cls: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
    blocked: { icon: <XCircle size={12} />, label: "Blocked", cls: "bg-red-500/15 text-red-400 border-red-500/20" },
    planned: { icon: <Clock size={12} />, label: "Planned", cls: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${c.cls}`}>
      {c.icon} {c.label}
    </span>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg p-3 border border-[var(--border-primary)]">
      <div className="text-[20px] font-semibold text-[var(--text-primary)]">{value}</div>
      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ABMDocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/20 flex items-center justify-center">
            <Crosshair size={20} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">ABM Lifecycle Engine</h1>
            <p className="text-[13px] text-[var(--text-muted)]">Technical documentation · Last updated April 20, 2026</p>
          </div>
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] max-w-2xl">
          Closed-loop account-based marketing: automatically grow, clean, and optimize target account lists across ad platforms. The system detects waste, finds new qualified accounts, pushes changes to platforms, and measures pipeline impact — all with human approval gates.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Total Accounts" value="2,555" sub="1,669 need product fit" />
        <Metric label="SF-Linked Accounts" value="122" sub="41 in active pipeline" />
        <Metric label="Exclusions" value="3,810" sub="across 5 products" />
        <Metric label="Campaign Segments" value="287" sub="with 30d performance" />
        <Metric label="SA Exclusion Audiences" value="5" sub="13 campaigns attached" />
      </div>

      {/* 1. System Architecture */}
      <Section title="System Architecture" icon={<Layers size={16} />} defaultOpen={true}>
        <p>The ABM system is a hybrid of deterministic pipelines (Lobster workflows) and AI-powered analysis. Every agent shares the same database, knowledge base, and platform connectors.</p>
        <div className="bg-[var(--bg-secondary)] rounded-lg p-4 font-mono text-[11px] text-[var(--text-muted)] overflow-x-auto border border-[var(--border-primary)]">
          <pre>{`GLOBAL LAYER (cross-platform)
├── Budget & Pacing Agent ✅
├── Creative QA (compliance) ✅
├── Attribution 🆕
└── Hub Doctor ✅

PLATFORM FLEETS
├── Google Ads
│   ├── Negative Keyword Agent ✅
│   ├── Keyword Bid Optimizer ✅
│   └── Creative Specialist ✅
├── StackAdapt
│   └── StackAdapt Ops ✅ (exclusion push live)
├── LinkedIn
│   └── LinkedIn Ops 🔴 (API blocked)
└── Reddit
    └── Reddit Ops ✅

ABM LIFECYCLE (product-agnostic)
├── Sync Agent ✅ (daily 6 AM)
├── Auditor Agent ✅ (weekly Mon)
├── Expander Agent ✅ (weekly Tue, AI research)
├── Pruner Agent ✅ (biweekly Sun)
└── Negative Builder ✅ (monthly 1st Sun)`}</pre>
        </div>
        <p className="text-[12px] text-[var(--text-muted)]">Design principle: Keep platform specialists SEPARATE (focused context, isolated failures). No orchestrator — the hub + DB + budget-pacing coordinate agents.</p>
      </Section>

      {/* 2. Data Model */}
      <Section title="Data Model" icon={<Database size={16} />} defaultOpen={true}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--border-primary)]">
                <th className="text-left py-2 pr-4 text-[var(--text-muted)] font-medium">Table</th>
                <th className="text-left py-2 pr-4 text-[var(--text-muted)] font-medium">Count</th>
                <th className="text-left py-2 text-[var(--text-muted)] font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border-primary)]/50">
                <td className="py-2 pr-4 font-mono text-[11px]">ABMAccount</td>
                <td className="py-2 pr-4">2,555</td>
                <td className="py-2">Target accounts with Clearbit enrichment, product fit scoring, SF pipeline status</td>
              </tr>
              <tr className="border-b border-[var(--border-primary)]/50">
                <td className="py-2 pr-4 font-mono text-[11px]">ABMExclusion</td>
                <td className="py-2 pr-4">3,810</td>
                <td className="py-2">Excluded domains by product (competitors, ISPs, hospitals, irrelevant verticals)</td>
              </tr>
              <tr className="border-b border-[var(--border-primary)]/50">
                <td className="py-2 pr-4 font-mono text-[11px]">ABMCampaignSegment</td>
                <td className="py-2 pr-4">287</td>
                <td className="py-2">Campaign-segment relationships with 30d performance + health flags</td>
              </tr>
              <tr className="border-b border-[var(--border-primary)]/50">
                <td className="py-2 pr-4 font-mono text-[11px]">ABMListRule</td>
                <td className="py-2 pr-4">8</td>
                <td className="py-2">Scoring rules per product (5 AI Agent variants + Voice/SMS/SIP/IoT)</td>
              </tr>
              <tr className="border-b border-[var(--border-primary)]/50">
                <td className="py-2 pr-4 font-mono text-[11px]">ABMList</td>
                <td className="py-2 pr-4">435</td>
                <td className="py-2">Platform segment references (262 LinkedIn, 37 StackAdapt)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-[11px]">AdImpression</td>
                <td className="py-2 pr-4">32,591</td>
                <td className="py-2">Impression data — SA has domain-level, LinkedIn is li_org: blocked</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. Product Fit Scoring */}
      <Section title="Product Fit Scoring" icon={<Target size={16} />} defaultOpen={true} badge={{ label: "Fixed Apr 20", color: "green" }}>
        <p>Each account is scored against all 5 products (AI Agent, Voice API, SMS, SIP, IoT SIM) based on company data. The highest-scoring product becomes the account&apos;s <code className="px-1 py-0.5 bg-[var(--bg-secondary)] rounded text-[11px]">productFit</code>.</p>

        <div className="space-y-3">
          <div className="bg-[var(--bg-secondary)] rounded-lg p-3 border border-[var(--border-primary)]">
            <h4 className="text-[12px] font-medium text-[var(--text-primary)] mb-2">Scoring Weights</h4>
            <div className="space-y-1 text-[12px]">
              <div className="flex justify-between"><span>Description keywords (core + secondary)</span><span className="text-[var(--text-muted)]">40% + 15%</span></div>
              <div className="flex justify-between"><span>Industry classification</span><span className="text-[var(--text-muted)]">30%</span></div>
              <div className="flex justify-between"><span>Clearbit tags</span><span className="text-[var(--text-muted)]">15%</span></div>
              <div className="flex justify-between"><span>Tech stack</span><span className="text-[var(--text-muted)]">15%</span></div>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <h4 className="text-[12px] font-medium text-amber-400 mb-1">⚠️ Bug Fixed (Apr 20)</h4>
            <p className="text-[12px]">Previously, 78% of accounts (1,990/2,555) were labeled &quot;AI Agent&quot; because productFit was derived from which campaign served impressions — not from the company&apos;s actual business. AI Agent keyword list also included generic telecom terms (&quot;voice&quot;, &quot;sms&quot;, &quot;phone&quot;) that matched everything.</p>
            <p className="text-[12px] mt-2">New scorer uses strict product-specific keywords only. Result: AI Agent dropped from 1,990 → 488, 1,669 accounts now correctly have null productFit (no strong signal).</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border-primary)]">
                  <th className="text-left py-2 pr-4 text-[var(--text-muted)] font-medium">Product</th>
                  <th className="text-left py-2 pr-4 text-[var(--text-muted)] font-medium">Before</th>
                  <th className="text-left py-2 text-[var(--text-muted)] font-medium">After</th>
                </tr>
              </thead>
              <tbody className="text-[var(--text-secondary)]">
                <tr className="border-b border-[var(--border-primary)]/50">
                  <td className="py-2 pr-4">AI Agent</td>
                  <td className="py-2 pr-4 text-red-400">1,990 (78%)</td>
                  <td className="py-2 text-emerald-400">488 (19%)</td>
                </tr>
                <tr className="border-b border-[var(--border-primary)]/50">
                  <td className="py-2 pr-4">IoT SIM</td>
                  <td className="py-2 pr-4">233</td>
                  <td className="py-2">176</td>
                </tr>
                <tr className="border-b border-[var(--border-primary)]/50">
                  <td className="py-2 pr-4">Voice API</td>
                  <td className="py-2 pr-4">22</td>
                  <td className="py-2">133</td>
                </tr>
                <tr className="border-b border-[var(--border-primary)]/50">
                  <td className="py-2 pr-4">SMS</td>
                  <td className="py-2 pr-4">0</td>
                  <td className="py-2">65</td>
                </tr>
                <tr className="border-b border-[var(--border-primary)]/50">
                  <td className="py-2 pr-4">SIP</td>
                  <td className="py-2 pr-4">29</td>
                  <td className="py-2">24</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">null (no signal)</td>
                  <td className="py-2 pr-4">281</td>
                  <td className="py-2 text-amber-400">1,669 (65%)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* 4. Agent Details */}
      <Section title="Agent Details & Schedules" icon={<Bot size={16} />} defaultOpen={true}>
        <div className="space-y-4">
          {[
            {
              name: "ABM Sync",
              schedule: "Daily 6 AM PST",
              workflow: "abm-sync (rebuilt)",
              llm: false,
              desc: "Syncs campaign segments, impressions, and account data from all platforms. Updates ABMCampaignSegment with 30d performance metrics. Pure deterministic — no LLM steps.",
              status: "done" as const,
            },
            {
              name: "ABM Auditor",
              schedule: "Weekly Monday 5 AM PST",
              workflow: "abm-auditor",
              llm: false,
              desc: "Checks data health: stale accounts, missing enrichment, orphaned segments, exclusion conflicts. Outputs a health report. No write operations — diagnostic only.",
              status: "done" as const,
            },
            {
              name: "ABM Expander",
              schedule: "Weekly Tuesday 5 AM PST",
              workflow: "abm-expander.lobster",
              llm: true,
              desc: "AI-powered account discovery. Takes existing high-performing segments, researches similar companies using Clearbit + AI analysis, proposes new accounts with relevance scoring. Human approval gate before adding to DB.",
              status: "done" as const,
            },
            {
              name: "ABM Pruner",
              schedule: "Biweekly Sunday 5 AM PST",
              workflow: "abm-pruner.lobster",
              llm: false,
              desc: "Removes accounts that are consistently irrelevant across all products. Checks: relevance < 0.2 for ALL products, no SF pipeline activity, not added in last 14 days. Safety: never prunes pipeline accounts.",
              status: "done" as const,
            },
            {
              name: "ABM Negative Builder",
              schedule: "Monthly 1st Sunday 5 AM PST",
              workflow: "abm-negative-builder.lobster",
              llm: false,
              desc: "Scans all accounts for irrelevance. Auto-excludes domains with relevance < 0.15, flags 0.15-0.4 for review. Pushes exclusions to StackAdapt via connector. Never touches SF pipeline accounts.",
              status: "done" as const,
            },
          ].map((agent) => (
            <div key={agent.name} className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-primary)]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[13px] font-medium text-[var(--text-primary)]">{agent.name}</span>
                <StatusBadge status={agent.status} />
                {agent.llm && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/20 font-medium">LLM</span>
                )}
              </div>
              <p className="text-[12px] text-[var(--text-secondary)] mb-2">{agent.desc}</p>
              <div className="flex gap-4 text-[11px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1"><Clock size={11} /> {agent.schedule}</span>
                <span className="flex items-center gap-1"><Workflow size={11} /> {agent.workflow}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 5. Platform Connectors */}
      <Section title="Platform Connectors" icon={<Plug size={16} />} defaultOpen={true}>
        <div className="space-y-3">
          <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-primary)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium text-[var(--text-primary)]">StackAdapt</span>
              <StatusBadge status="done" />
            </div>
            <ul className="text-[12px] text-[var(--text-secondary)] space-y-1">
              <li>✅ Exclusion audiences created: SMS (2502446), SIP (2502447), IoT SIM (2502448), Voice API (2502449), AI Agent (2502450)</li>
              <li>✅ Domain push working — 1,348 excluded domains pushed</li>
              <li>✅ 13 campaigns have exclusion audiences attached</li>
              <li>✅ Connector methods built: <code className="px-1 py-0.5 bg-[var(--bg-primary)] rounded text-[11px]">createAbmAudience</code>, <code className="px-1 py-0.5 bg-[var(--bg-primary)] rounded text-[11px]">updateAbmAudienceWithDomainsList</code>, <code className="px-1 py-0.5 bg-[var(--bg-primary)] rounded text-[11px]">attachSegmentToCampaign</code></li>
              <li>✅ Domain push working — 1,348 excluded domains pushed</li>
              <li>✅ 13 campaigns have exclusion audiences attached</li>
              <li>⚠️ Expander/Pruner auto-push needs end-to-end live validation</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-primary)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium text-[var(--text-primary)]">LinkedIn</span>
              <StatusBadge status="blocked" />
            </div>
            <ul className="text-[12px] text-[var(--text-secondary)] space-y-1">
              <li>🔴 Community Management API — approval stalled since March 12</li>
              <li>🔴 97.2% of impressions are <code className="px-1 py-0.5 bg-[var(--bg-primary)] rounded text-[11px]">li_org:XXXX</code> — can&apos;t match to SF domains</li>
              <li>743,101 impressions with unresolvable org IDs vs 21,469 with domains (2.8%)</li>
              <li>Solution path: Community Management API → Organization Lookup → company name + website → match to SF</li>
              <li>Separate app created as LinkedIn required (legal/security), approval pending</li>
            </ul>
          </div>

          <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-primary)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium text-[var(--text-primary)]">Google Ads</span>
              <StatusBadge status="planned" />
            </div>
            <ul className="text-[12px] text-[var(--text-secondary)] space-y-1">
              <li>Customer Match for domain-based targeting deferred — zero code written</li>
              <li>Low ROI until LinkedIn + StackAdapt are fully automated</li>
              <li>Negative keyword agent handles Google-specific optimization</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* 6. Approval System */}
      <Section title="Approval System & Guardrails" icon={<Shield size={16} />} defaultOpen={false}>
        <p>All agents operate under confidence-based approval gates:</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[var(--bg-secondary)] rounded-lg p-3 border border-[var(--border-primary)]">
            <div className="text-[12px] font-medium text-emerald-400 mb-1">Auto-Execute</div>
            <p className="text-[11px] text-[var(--text-muted)]">Confidence ≥ 80% + change &lt; $500. Budget floor $10/day maintained.</p>
          </div>
          <div className="bg-[var(--bg-secondary)] rounded-lg p-3 border border-[var(--border-primary)]">
            <div className="text-[12px] font-medium text-amber-400 mb-1">Human Review</div>
            <p className="text-[11px] text-[var(--text-muted)]">Confidence &lt; 80% or change &gt; $500. Telegram inline buttons (✅ / ❌) for approval.</p>
          </div>
          <div className="bg-[var(--bg-secondary)] rounded-lg p-3 border border-[var(--border-primary)]">
            <div className="text-[12px] font-medium text-red-400 mb-1">Kill Switch</div>
            <p className="text-[11px] text-[var(--text-muted)]">50% CPA spike → halt all activity. Cross-product reallocation = always human approval.</p>
          </div>
          <div className="bg-[var(--bg-secondary)] rounded-lg p-3 border border-[var(--border-primary)]">
            <div className="text-[12px] font-medium text-blue-400 mb-1">Safety Windows</div>
            <p className="text-[11px] text-[var(--text-muted)]">14-day learning period for new campaigns. Never prune SF pipeline accounts.</p>
          </div>
        </div>
      </Section>

      {/* 7. Gaps & Next Steps */}
      <Section title="Gaps & Next Steps" icon={<Zap size={16} />} defaultOpen={true} badge={{ label: "Priority", color: "red" }}>
        <div className="space-y-3">
          {[
            {
              title: "1,617 accounts with null productFit",
              severity: "high" as const,
              desc: "63% of accounts have no product fit signal. These were previously miscategorized as AI Agent. Most are genuinely irrelevant (pharmacies, food companies, fashion) — they got impressions on broad campaigns. 122 now linked to Salesforce. 41 have active pipeline opps worth $14.2M.",
              action: "Options: (1) Exclude null-productFit domains from product-specific campaigns, (2) Use SF industry data for coarser classification, (3) Accept that ~60% are low-relevance and let the Pruner handle them.",
            },
            {
              title: "SA connector: Expander/Pruner not auto-pushing",
              severity: "medium" as const,
              desc: "SA connector has createAbmAudience, updateAbmAudienceWithDomainsList, attachSegmentToCampaign methods built. The abm_push_to_stackadapt.py bridge script exists and is called by Lobster workflows. But the auto-push hasn't been tested end-to-end after agent runs — needs a live validation.",
              action: "Run a live Expander cycle and verify domains push to SA correctly. Test Pruner push flow too.",
            },
            {
              title: "LinkedIn API blocked",
              severity: "high" as const,
              desc: "Community Management API approval stalled since March 12. 97.2% of LinkedIn impressions are invisible (li_org: prefix). Can't match to Salesforce. Currently attributing ~$580K pipeline from only 36 deals (tiny fraction).",
              action: "Escalate with LinkedIn support. Follow up on pending approval. Consider alternative: LI Marketing API for impression data.",
            },
            {
              title: "Salesforce data not linked to ABM accounts",
              severity: "medium" as const,
              desc: "SF Account, Opportunity, and Campaign data exists in the DB but wasn't connected to ABMAccount. 122 accounts now linked (sfAccountId), 41 marked as inPipeline ($14.2M active). But sfAccountId, switchSignal, currentProvider, and opp data isn't surfaced in the Hub UI — domains slideout shows stale/empty fields.",
              action: "Wire DomainSlideOut.tsx to pull from SFAccount + SFOpportunity tables. Show pipeline status, opp stage, amount, and switchSignal.",
            },
            {
              title: "Attribution engine",
              severity: "medium" as const,
              desc: "No closed-loop attribution yet. Can't measure which ABM accounts convert to SQOs and pipeline. Campaign performance data exists in DB but no touchpoint-to-revenue mapping.",
              action: "Build attribution query linking AdImpression → ABMAccount → Salesforce. Start with last-touch, add multi-touch later.",
            },
            {
              title: "Hub UI: Expander/Pruner not visible",
              severity: "medium" as const,
              desc: "Aziz flagged that the Expander and Pruner agents aren't accessible from the Hub UI. Agent Activity page shows logs but no way to trigger or review agent output.",
              action: "Add agent control panel to /abm/agents page. Show recent runs, pending approvals, and manual trigger buttons.",
            },
            {
              title: "Segment Engine (dynamic list building)",
              severity: "low" as const,
              desc: "Currently ABMListRule has 8 static rules. No dynamic list building based on real-time signals (intent, engagement, firmographic changes).",
              action: "Build segment engine that evaluates rules against live data and auto-updates platform segments.",
            },
          ].map((gap) => (
            <div key={gap.title} className={`rounded-lg p-4 border ${
              gap.severity === "high" ? "bg-red-500/5 border-red-500/20" :
              gap.severity === "medium" ? "bg-amber-500/5 border-amber-500/20" :
              "bg-blue-500/5 border-blue-500/20"
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] font-medium text-[var(--text-primary)]">{gap.title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                  gap.severity === "high" ? "bg-red-500/15 text-red-400" :
                  gap.severity === "medium" ? "bg-amber-500/15 text-amber-400" :
                  "bg-blue-500/15 text-blue-400"
                }`}>{gap.severity}</span>
              </div>
              <p className="text-[12px] text-[var(--text-secondary)] mb-2">{gap.desc}</p>
              <div className="flex items-start gap-2 text-[12px]">
                <ArrowRight size={12} className="text-[var(--text-muted)] mt-0.5 shrink-0" />
                <span className="text-[var(--text-muted)]">{gap.action}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 8. Relevance Scoring Detail */}
      <Section title="Relevance Scoring Algorithm" icon={<BarChart3 size={16} />} defaultOpen={false}>
        <p>The Negative Builder and Pruner both use the same relevance scoring to determine if an account is relevant to a product.</p>
        <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-primary)] space-y-3">
          <div>
            <h4 className="text-[12px] font-medium text-[var(--text-primary)] mb-1">Input Signals (weighted)</h4>
            <ul className="text-[12px] text-[var(--text-secondary)] space-y-1">
              <li><strong>Description keywords</strong> (55%) — core matches (40%) + secondary matches (15%). Core keywords are product-specific signals; secondary are weaker but still relevant.</li>
              <li><strong>Industry</strong> (30%) — Clearbit industry classification matched to known product-relevant industries.</li>
              <li><strong>Clearbit tags</strong> (10%) — Supplementary category signals.</li>
              <li><strong>Tech stack</strong> (5%) — Technologies the company uses (weakest signal).</li>
            </ul>
          </div>
          <div>
            <h4 className="text-[12px] font-medium text-[var(--text-primary)] mb-1">Thresholds</h4>
            <ul className="text-[12px] text-[var(--text-secondary)] space-y-1">
              <li>Score &lt; 0.15 → auto-exclude (very low relevance)</li>
              <li>Score 0.15–0.40 → flag for human review</li>
              <li>Score ≥ 0.40 → keep (relevant)</li>
              <li>Score ≥ 0.80 → high confidence, auto-execute allowed</li>
            </ul>
          </div>
          <div>
            <h4 className="text-[12px] font-medium text-[var(--text-primary)] mb-1">Overrides</h4>
            <ul className="text-[12px] text-[var(--text-secondary)] space-y-1">
              <li><strong>Telecom provider override</strong>: If a company IS a telecom provider (cell towers, ISPs, carriers), they score for SIP/Voice API, NOT AI Agent. Score floored to 0.5 for infrastructure products.</li>
              <li><strong>Waste industry penalty</strong>: Companies in e-commerce, retail, fashion, hospitality, etc. get a 70% score reduction unless description has specific telecom/IoT signals.</li>
              <li><strong>SF pipeline protection</strong>: Accounts in active SF pipeline are never pruned or excluded, regardless of score.</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* 9. Build Log */}
      <Section title="Build Timeline" icon={<RefreshCw size={16} />} defaultOpen={false}>
        <div className="space-y-2">
          {[
            { date: "Apr 13", event: "Build standards enforced — BaseAgent, Lobster, DB logging, PAID-FLEET.md" },
            { date: "Apr 15", event: "ABM Expander agent live — AI research with Clearbit enrichment" },
            { date: "Apr 16", event: "ABM Pruner agent live — relevance-based account removal" },
            { date: "Apr 17", event: "SA exclusion audiences created (5 products, 1,348 domains pushed)" },
            { date: "Apr 18", event: "ABMCampaignSegment table built — campaign-segment relationship with health flags" },
            { date: "Apr 19", event: "All agents migrated to Lobster workflows. ABM Exclusion push to SA live. Hub UI wired to DB." },
            { date: "Apr 20", event: "ProductFit scoring bug fixed — 1,925 accounts reclassified. Exclusion API routes wired (add/restore/push)." },
          ].map((e) => (
            <div key={e.date + e.event} className="flex gap-3 text-[12px]">
              <span className="text-[var(--text-muted)] font-mono shrink-0">{e.date}</span>
              <span className="text-[var(--text-secondary)]">{e.event}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Footer */}
      <div className="pt-4 border-t border-[var(--border-primary)] flex items-center justify-between">
        <p className="text-[11px] text-[var(--text-muted)]">
          Source: <a href="https://github.com/AzizTelnyx/demand-gen-hub" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline inline-flex items-center gap-1">github.com/AzizTelnyx/demand-gen-hub <ExternalLink size={10} /></a>
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">Design doc: <code className="px-1 py-0.5 bg-[var(--bg-secondary)] rounded text-[10px]">docs/abm-lifecycle-engine-v2.md</code></p>
      </div>
    </div>
  );
}
