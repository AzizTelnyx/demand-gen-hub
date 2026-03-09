'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Bot, Clock, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronRight, ThumbsUp, ThumbsDown,
  Activity, Settings, FileText, Eye, Shield, Zap, AlertTriangle,
} from 'lucide-react';
import { StatusBadge, SeverityBadge, Toast, timeAgo } from '@/components/agents/AgentFleet';

const PLATFORM_BADGES: Record<string, { label: string; cls: string }> = {
  google_ads: { label: 'Google Ads', cls: 'bg-blue-900/30 text-blue-400' },
  linkedin: { label: 'LinkedIn', cls: 'bg-sky-900/30 text-sky-400' },
  stackadapt: { label: 'StackAdapt', cls: 'bg-violet-900/30 text-violet-400' },
  reddit: { label: 'Reddit', cls: 'bg-orange-900/30 text-orange-400' },
  all: { label: 'All Platforms', cls: 'bg-emerald-900/30 text-emerald-400' },
};

type Tab = 'overview' | 'activity' | 'config' | 'findings';

export default function AgentDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [agent, setAgent] = useState<any>(null);
  const [schedule, setSchedule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/agents/status').then(r => r.json()),
      fetch('/api/agents/schedule').then(r => r.json()),
    ]).then(([statusData, schedData]) => {
      const a = (statusData.agents || []).find((a: any) => a.slug === slug);
      const s = (schedData.agents || []).find((s: any) => s.slug === slug);
      setAgent(a || null);
      setSchedule(s || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-[var(--bg-card)] rounded w-48" />
          <div className="h-40 bg-[var(--bg-card)] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center space-y-4">
        <p className="text-[var(--text-muted)]">Agent &quot;{slug}&quot; not found.</p>
        <Link href="/agents" className="text-[var(--accent)] hover:underline text-sm">← Back to Agents</Link>
      </div>
    );
  }

  const platform = schedule?.platform || 'all';
  const badge = PLATFORM_BADGES[platform] || PLATFORM_BADGES.all;

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', icon: Eye },
    { key: 'activity', label: 'Activity', icon: Activity },
    { key: 'config', label: 'Configuration', icon: Settings },
    { key: 'findings', label: 'Findings & Recs', icon: FileText },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <Link href="/agents" className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
        <ArrowLeft size={16} /> Back to Agents
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
          <Bot size={24} className="text-[var(--accent)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{agent.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${badge.cls}`}>{badge.label}</span>
            <span className="text-xs text-[var(--text-muted)]">{agent.model || 'No model'}</span>
            <span className={`text-xs ${agent.enabled ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
              {agent.enabled ? '● Enabled' : '○ Disabled'}
            </span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab agent={agent} schedule={schedule} slug={slug} />}
      {tab === 'activity' && <ActivityTab slug={slug} />}
      {tab === 'config' && <ConfigTab agent={agent} slug={slug} onUpdate={setAgent} onToast={setToast} />}
      {tab === 'findings' && <FindingsTab slug={slug} />}
    </div>
  );
}

/* ── Overview Tab ── */

function OverviewTab({ agent, schedule, slug }: { agent: any; schedule: any; slug: string }) {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/agents/activity?agent=${slug}&limit=100`)
      .then(r => r.json())
      .then(data => {
        const runs = data.runs || [];
        const now = new Date();
        const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const recentRuns = runs.filter((r: any) => new Date(r.startedAt) > week);
        const successRuns = runs.filter((r: any) => r.status === 'done' || r.status === 'completed');
        const findings7d = recentRuns.reduce((s: number, r: any) => s + (r.findingsCount || 0), 0);
        const recs7d = recentRuns.reduce((s: number, r: any) => s + (r.recsCount || 0), 0);
        setStats({
          totalRuns: runs.length,
          successRate: runs.length > 0 ? Math.round((successRuns.length / runs.length) * 100) : 0,
          findings7d,
          recs7d,
          recentRuns: recentRuns.length,
        });
      }).catch(() => {});
  }, [slug]);

  return (
    <div className="space-y-4">
      {agent.description && (
        <p className="text-sm text-[var(--text-secondary)]">{agent.description}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Runs', value: agent.totalRuns || stats?.totalRuns || 0 },
          { label: 'Success Rate', value: stats ? `${stats.successRate}%` : '—' },
          { label: 'Schedule', value: schedule?.schedule || 'None' },
          { label: 'Last Run', value: agent.lastRun ? timeAgo(agent.lastRun) : 'Never' },
        ].map(s => (
          <div key={s.label} className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-4">
            <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
            <p className="text-lg font-semibold text-[var(--text-primary)] mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Findings (7d)', value: stats.findings7d },
            { label: 'Recommendations (7d)', value: stats.recs7d },
            { label: 'Runs (7d)', value: stats.recentRuns },
          ].map(s => (
            <div key={s.label} className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-4">
              <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
              <p className="text-lg font-semibold text-[var(--text-primary)] mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {agent.lastRunSummary && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-muted)] mb-2">Last Run Summary</p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{agent.lastRunSummary}</p>
        </div>
      )}
    </div>
  );
}

/* ── Activity Tab ── */

function ActivityTab({ slug }: { slug: string }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/agents/activity?agent=${slug}&limit=25`)
      .then(r => r.json())
      .then(data => { setRuns(data.runs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  const loadDetail = async (runId: string) => {
    if (expandedRun === runId) { setExpandedRun(null); setRunDetail(null); return; }
    try {
      const res = await fetch(`/api/agents/activity?runId=${runId}`);
      const data = await res.json();
      setRunDetail(data.run);
      setExpandedRun(runId);
    } catch {}
  };

  if (loading) return <div className="text-sm text-[var(--text-muted)] animate-pulse p-4">Loading activity...</div>;
  if (runs.length === 0) return <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-10 text-center text-[var(--text-muted)] text-sm">No runs yet.</div>;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden divide-y divide-[var(--border-primary)]/30">
      {runs.map(run => {
        const isExpanded = expandedRun === run.id;
        const dotColor = run.status === 'done' || run.status === 'completed' ? 'text-emerald-400'
          : run.status === 'running' ? 'text-blue-400' : 'text-red-400';
        const Icon = run.status === 'done' || run.status === 'completed' ? CheckCircle2
          : run.status === 'running' ? Loader2 : XCircle;

        return (
          <div key={run.id}>
            <div className="px-5 py-4 hover:bg-[var(--bg-primary)]/50 transition-colors cursor-pointer flex items-center gap-4"
              onClick={() => loadDetail(run.id)}>
              {isExpanded ? <ChevronDown size={14} className="text-[var(--text-muted)]" /> : <ChevronRight size={14} className="text-[var(--text-muted)]" />}
              <Icon size={14} className={`${dotColor} shrink-0 ${run.status === 'running' ? 'animate-spin' : ''}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text-primary)]">{run.task || run.summary || '—'}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-xs text-[var(--text-muted)]">
                {(run.findingsCount > 0 || run.recsCount > 0) && <span>{run.findingsCount}f / {run.recsCount}r</span>}
                <StatusBadge status={run.status} />
                <span>{run.completedAt ? timeAgo(run.completedAt) : run.startedAt ? timeAgo(run.startedAt) : ''}</span>
              </div>
            </div>
            {isExpanded && runDetail && (
              <div className="px-5 py-4 bg-[var(--bg-primary)]/50 border-t border-[var(--border-primary)]/30 space-y-3 ml-8 mr-4">
                {runDetail.output?.summary && <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{runDetail.output.summary}</p>}
                {runDetail.output?.findings?.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Findings ({runDetail.output.findings.length})</span>
                    {runDetail.output.findings.slice(0, 10).map((f: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 bg-[var(--bg-card)] rounded-lg px-4 py-3">
                        <SeverityBadge severity={f.severity} />
                        <div>
                          <p className="text-sm text-[var(--text-secondary)]">{f.title}</p>
                          {f.detail && <p className="text-xs text-[var(--text-muted)] mt-1">{f.detail}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Configuration Tab (Enhanced) ── */

interface AgentConfig {
  confidenceThreshold: number;
  maxActionsPerRun: number;
  maxBudgetChange: number;
  learningPeriodDays: number;
  autoApprove: boolean;
  notifyOnRun: boolean;
  notifyOnFinding: boolean;
}

const DEFAULT_CONFIG: AgentConfig = {
  confidenceThreshold: 80,
  maxActionsPerRun: 50,
  maxBudgetChange: 500,
  learningPeriodDays: 14,
  autoApprove: false,
  notifyOnRun: true,
  notifyOnFinding: true,
};

function ConfigTab({ agent, slug, onUpdate, onToast }: {
  agent: any; slug: string;
  onUpdate: (a: any) => void;
  onToast: (t: { message: string; type: 'success' | 'error' }) => void;
}) {
  const [enabled, setEnabled] = useState(agent.enabled);
  const [model, setModel] = useState(agent.model || '');
  const [description, setDescription] = useState(agent.description || '');
  const [schedule, setSchedule] = useState(agent.schedule || '');
  const [config, setConfig] = useState<AgentConfig>(() => {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(agent.config || '{}') };
    } catch { return DEFAULT_CONFIG; }
  });
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<'general' | 'thresholds' | 'notifications'>('general');

  const updateConfig = (key: keyof AgentConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, model, description, schedule, config: JSON.stringify(config) }),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdate({ ...agent, enabled, model, description, schedule, config: JSON.stringify(config) });
        onToast({ message: 'Agent configuration saved', type: 'success' });
      } else {
        onToast({ message: data.error || 'Failed to save', type: 'error' });
      }
    } catch { onToast({ message: 'Failed to save', type: 'error' }); }
    setSaving(false);
  };

  const sections: { key: typeof section; label: string; icon: any }[] = [
    { key: 'general', label: 'General', icon: Settings },
    { key: 'thresholds', label: 'Guardrails & Thresholds', icon: Shield },
    { key: 'notifications', label: 'Notifications', icon: Zap },
  ];

  return (
    <div className="space-y-4">
      {/* Config section tabs */}
      <div className="flex items-center gap-2">
        {sections.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              section === s.key
                ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
                : 'bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}>
            <s.icon size={12} /> {s.label}
          </button>
        ))}
      </div>

      {/* General Section */}
      {section === 'general' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl divide-y divide-[var(--border-primary)]/30">
          {/* Enabled toggle */}
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Enabled</p>
              <p className="text-[11px] text-[var(--text-muted)]">Whether this agent runs on schedule</p>
            </div>
            <button onClick={() => setEnabled(!enabled)}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${enabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Schedule */}
          <div className="px-5 py-4">
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Schedule</p>
            <p className="text-[11px] text-[var(--text-muted)] mb-2">When this agent runs (cron expression or human-readable)</p>
            <input type="text" value={schedule} onChange={e => setSchedule(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="e.g. Daily 2 AM PST or 0 2 * * *" />
          </div>

          {/* Model */}
          <div className="px-5 py-4">
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">AI Model</p>
            <p className="text-[11px] text-[var(--text-muted)] mb-2">Model used for analysis and decisions</p>
            <input type="text" value={model} onChange={e => setModel(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="e.g. anthropic/claude-sonnet-4-20250514" />
          </div>

          {/* Description */}
          <div className="px-5 py-4">
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Description</p>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none" />
          </div>
        </div>
      )}

      {/* Thresholds Section */}
      {section === 'thresholds' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl divide-y divide-[var(--border-primary)]/30">
            {/* Confidence threshold */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">Confidence Threshold</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Minimum confidence score to take action. Below this → recommend only.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input type="number" min={0} max={100} value={config.confidenceThreshold}
                    onChange={e => updateConfig('confidenceThreshold', parseInt(e.target.value) || 80)}
                    className="w-16 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]" />
                  <span className="text-xs text-[var(--text-muted)]">%</span>
                </div>
              </div>
              {/* Visual confidence bar */}
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${config.confidenceThreshold}%`,
                      backgroundColor: config.confidenceThreshold >= 80 ? 'rgb(52,211,153)' : config.confidenceThreshold >= 60 ? 'rgb(251,191,36)' : 'rgb(248,113,113)',
                    }} />
                </div>
                <span className={`text-[10px] font-medium ${
                  config.confidenceThreshold >= 80 ? 'text-emerald-400' : config.confidenceThreshold >= 60 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {config.confidenceThreshold >= 80 ? 'Strict' : config.confidenceThreshold >= 60 ? 'Moderate' : 'Aggressive'}
                </span>
              </div>
            </div>

            {/* Max actions per run */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">Max Actions Per Run</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Maximum number of changes this agent can make in a single run
                  </p>
                </div>
                <input type="number" min={1} max={500} value={config.maxActionsPerRun}
                  onChange={e => updateConfig('maxActionsPerRun', parseInt(e.target.value) || 50)}
                  className="w-20 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]" />
              </div>
            </div>

            {/* Max budget change */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">Max Budget Change</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Maximum dollar amount this agent can adjust per campaign without approval
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-[var(--text-muted)]">$</span>
                  <input type="number" min={0} max={10000} value={config.maxBudgetChange}
                    onChange={e => updateConfig('maxBudgetChange', parseInt(e.target.value) || 500)}
                    className="w-24 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]" />
                </div>
              </div>
            </div>

            {/* Learning period */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">Learning Period</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    New campaigns are protected from pause/budget cuts for this many days
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input type="number" min={0} max={90} value={config.learningPeriodDays}
                    onChange={e => updateConfig('learningPeriodDays', parseInt(e.target.value) || 14)}
                    className="w-16 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]" />
                  <span className="text-xs text-[var(--text-muted)]">days</span>
                </div>
              </div>
            </div>

            {/* Auto-approve toggle */}
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Auto-Approve High Confidence</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Automatically apply recommendations above the confidence threshold
                </p>
              </div>
              <button onClick={() => updateConfig('autoApprove', !config.autoApprove)}
                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${config.autoApprove ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.autoApprove ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
          </div>

          {config.autoApprove && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400/80">
                Auto-approve is ON. Recommendations with ≥{config.confidenceThreshold}% confidence will be applied automatically without human review.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Notifications Section */}
      {section === 'notifications' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl divide-y divide-[var(--border-primary)]/30">
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Notify on Run Complete</p>
              <p className="text-[11px] text-[var(--text-muted)]">Send a Telegram notification when this agent finishes a run</p>
            </div>
            <button onClick={() => updateConfig('notifyOnRun', !config.notifyOnRun)}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${config.notifyOnRun ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.notifyOnRun ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Notify on High-Severity Finding</p>
              <p className="text-[11px] text-[var(--text-muted)]">Alert when agent finds critical or high-severity issues</p>
            </div>
            <button onClick={() => updateConfig('notifyOnFinding', !config.notifyOnFinding)}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${config.notifyOnFinding ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.notifyOnFinding ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[var(--text-muted)]">Changes are saved to the agent&apos;s configuration and take effect on the next run.</p>
        <button onClick={save} disabled={saving}
          className="px-5 py-2 rounded-xl text-sm font-medium btn-accent-violet disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {/* Link to global config */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--text-secondary)]">Global guardrails apply to all agents</p>
          <p className="text-[11px] text-[var(--text-muted)]">Budget caps, regional priorities, platform allocations</p>
        </div>
        <Link href="/agents/config" className="text-sm text-[var(--accent)] hover:underline">
          Global Config →
        </Link>
      </div>
    </div>
  );
}

/* ── Findings & Recommendations Tab (Enhanced) ── */

function FindingsTab({ slug }: { slug: string }) {
  const [recs, setRecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ agent: slug, limit: '100' });
    if (filter) params.set('status', filter);
    try {
      const res = await fetch(`/api/agents/recommendations?${params}`);
      const data = await res.json();
      setRecs(data.recommendations || []);
    } catch {}
    setLoading(false);
  }, [slug, filter]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActing(id);
    try {
      const res = await fetch('/api/agents/recommendations/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (data.ok || data.status === 'applied' || data.status === 'rejected') {
        setToast({ message: action === 'approve' ? 'Approved & applied' : 'Rejected', type: 'success' });
        load();
      } else {
        setToast({ message: data.error || 'Failed', type: 'error' });
      }
    } catch { setToast({ message: 'Failed', type: 'error' }); }
    setActing(null);
  };

  // Summary stats
  const pendingCount = recs.filter(r => r.status === 'pending').length;
  const appliedCount = recs.filter(r => r.status === 'applied').length;
  const rejectedCount = recs.filter(r => r.status === 'rejected').length;
  const totalSpendSaved = recs.filter(r => r.status === 'applied')
    .reduce((sum, r) => sum + (r.metadata?.spend || 0), 0);

  if (loading) return <div className="text-sm text-[var(--text-muted)] animate-pulse p-4">Loading recommendations...</div>;

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-3">
          <p className="text-xs text-[var(--text-muted)]">Pending</p>
          <p className="text-lg font-semibold text-amber-400">{pendingCount}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-3">
          <p className="text-xs text-[var(--text-muted)]">Applied</p>
          <p className="text-lg font-semibold text-emerald-400">{appliedCount}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-3">
          <p className="text-xs text-[var(--text-muted)]">Rejected</p>
          <p className="text-lg font-semibold text-red-400">{rejectedCount}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-3">
          <p className="text-xs text-[var(--text-muted)]">Spend Saved</p>
          <p className="text-lg font-semibold text-[var(--text-primary)]">${totalSpendSaved.toFixed(0)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {['', 'pending', 'applied', 'rejected'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30' : 'bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-muted)]'
            }`}>
            {f || 'All'}
          </button>
        ))}
        <span className="text-xs text-[var(--text-muted)] ml-2">{recs.length} results</span>
      </div>

      {recs.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-10 text-center text-[var(--text-muted)] text-sm">
          No recommendations found.
        </div>
      ) : (
        <div className="space-y-2">
          {recs.map(rec => {
            const m = rec.metadata || {};
            const isExpanded = expanded === rec.id;
            const isPending = rec.status === 'pending';

            return (
              <div key={rec.id}
                className={`bg-[var(--bg-card)] border rounded-xl overflow-hidden transition-colors ${
                  isPending ? 'border-amber-500/20' : 'border-[var(--border-primary)]'
                }`}>
                {/* Main row */}
                <div className="px-5 py-4 cursor-pointer hover:bg-[var(--bg-primary)]/50"
                  onClick={() => setExpanded(isExpanded ? null : rec.id)}>
                  <div className="flex items-start gap-4">
                    <div className="flex items-center pt-0.5">
                      {isExpanded ? <ChevronDown size={14} className="text-[var(--text-muted)]" /> : <ChevronRight size={14} className="text-[var(--text-muted)]" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <SeverityBadge severity={rec.severity} />
                        <span className="text-sm font-medium text-[var(--text-primary)]">{rec.action}</span>
                        <StatusBadge status={rec.status} />
                        {m.confidence && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            m.confidence >= 80 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {m.confidence}% confidence
                          </span>
                        )}
                      </div>
                      {rec.target && (
                        <p className="text-xs text-[var(--text-muted)]">
                          <span className="text-[var(--text-secondary)]">Campaign:</span> {rec.target}
                        </p>
                      )}
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{rec.rationale}</p>
                    </div>
                    {isPending && (
                      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleAction(rec.id, 'approve')} disabled={acting === rec.id}
                          className="flex items-center gap-1.5 px-3 py-2 btn-accent-emerald rounded-lg text-xs font-medium disabled:opacity-50">
                          {acting === rec.id ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />} Approve
                        </button>
                        <button onClick={() => handleAction(rec.id, 'reject')} disabled={acting === rec.id}
                          className="flex items-center gap-1.5 px-2.5 py-2 btn-accent-red rounded-lg text-xs font-medium disabled:opacity-50">
                          <ThumbsDown size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 py-4 border-t border-[var(--border-primary)]/30 bg-[var(--bg-primary)]/30 space-y-3">
                    {/* Impact details grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {m.spend != null && (
                        <div className="bg-[var(--bg-card)] rounded-lg p-3">
                          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Wasted Spend</p>
                          <p className="text-sm font-semibold text-amber-400">${m.spend.toFixed(2)}</p>
                        </div>
                      )}
                      {m.clicks != null && (
                        <div className="bg-[var(--bg-card)] rounded-lg p-3">
                          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Clicks</p>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{m.clicks}</p>
                        </div>
                      )}
                      {m.conversions != null && (
                        <div className="bg-[var(--bg-card)] rounded-lg p-3">
                          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Conversions</p>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{m.conversions}</p>
                        </div>
                      )}
                      {m.confidence != null && (
                        <div className="bg-[var(--bg-card)] rounded-lg p-3">
                          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Confidence</p>
                          <p className={`text-sm font-semibold ${m.confidence >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {m.confidence}%
                          </p>
                        </div>
                      )}
                    </div>

                    {/* What will happen */}
                    {isPending && (
                      <div className="bg-[var(--bg-card)] rounded-lg p-4 space-y-2">
                        <p className="text-xs font-medium text-[var(--text-primary)] uppercase tracking-wider">What will happen if approved</p>
                        {rec.type === 'add-negative' && m.search_term && (
                          <div className="space-y-1">
                            <p className="text-sm text-[var(--text-secondary)]">
                              The search term <span className="font-mono bg-[var(--bg-primary)] px-1.5 py-0.5 rounded text-red-400">&quot;{m.search_term}&quot;</span> will be added as a{' '}
                              <span className="font-medium">{m.match_type}</span> negative keyword to campaign{' '}
                              <span className="font-medium">{rec.target}</span>.
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              This will prevent your ads from showing for this search term, saving an estimated ${m.spend?.toFixed(2) || '0'}/month.
                            </p>
                          </div>
                        )}
                        {rec.type !== 'add-negative' && (
                          <p className="text-sm text-[var(--text-secondary)]">{rec.rationale}</p>
                        )}
                      </div>
                    )}

                    {/* Applied info */}
                    {rec.status === 'applied' && rec.appliedAt && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400">
                        <CheckCircle2 size={12} />
                        Applied {timeAgo(rec.appliedAt)}
                        {m.resource_name && (
                          <span className="text-[var(--text-muted)] font-mono text-[10px]">{m.resource_name}</span>
                        )}
                      </div>
                    )}

                    {rec.status === 'rejected' && (
                      <div className="flex items-center gap-2 text-xs text-red-400">
                        <XCircle size={12} />
                        Rejected
                      </div>
                    )}

                    {/* Agent & timing info */}
                    <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
                      {m.intent_type && <span>Intent: {m.intent_type.replace(/_/g, ' ')}</span>}
                      {m.match_type && <span>Match: {m.match_type}</span>}
                      {rec.agentName && <span>Agent: {rec.agentName}</span>}
                      <span>Created {timeAgo(rec.createdAt)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
