'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Bot, Clock, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronRight, ThumbsUp, ThumbsDown,
  Activity, Settings, FileText, Eye, Shield, Zap, AlertTriangle,
  Play, Save, Code, Workflow, BookOpen, Check, X, ArrowRight,
} from 'lucide-react';
import { getActionType, getBeforeAfter } from '@/lib/recommendation-types';
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
  const [section, setSection] = useState<'general' | 'thresholds' | 'notifications' | 'soul' | 'skills' | 'runnow'>('general');

  // SOUL.md state
  const [soulContent, setSoulContent] = useState('');
  const [soulLoading, setSoulLoading] = useState(false);
  const [soulDirty, setSoulDirty] = useState(false);

  // Skills state
  const [skills, setSkills] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [skillsLoaded, setSkillsLoaded] = useState(false);

  // Run now state
  const [runMessage, setRunMessage] = useState('');
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Load SOUL.md when soul tab selected
  useEffect(() => {
    if (section === 'soul' && !soulLoading && !soulContent) {
      setSoulLoading(true);
      fetch(`/api/agents/${slug}/soul`).then(r => r.json()).then(d => {
        setSoulContent(d.content || '');
        setSoulLoading(false);
      }).catch(() => setSoulLoading(false));
    }
  }, [section, slug, soulLoading, soulContent]);

  // Load skills/workflows when skills tab selected
  useEffect(() => {
    if (section === 'skills' && !skillsLoaded) {
      setSkillsLoaded(true);
      Promise.all([
        fetch(`/api/agents/${slug}/skills`).then(r => r.json()),
        fetch(`/api/agents/${slug}/workflows`).then(r => r.json()),
      ]).then(([s, w]) => {
        setSkills(s.skills || []);
        setWorkflows(w.workflows || []);
      }).catch(() => {});
    }
  }, [section, slug, skillsLoaded]);

  const saveSoul = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${slug}/soul`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: soulContent }),
      });
      if (res.ok) {
        setSoulDirty(false);
        onToast({ message: 'SOUL.md saved', type: 'success' });
      } else {
        onToast({ message: 'Failed to save SOUL.md', type: 'error' });
      }
    } catch { onToast({ message: 'Failed to save SOUL.md', type: 'error' }); }
    setSaving(false);
  };

  const triggerRun = async () => {
    if (!runMessage.trim()) return;
    setRunning(true);
    setRunStatus(null);
    try {
      const res = await fetch(`/api/agents/${slug}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: runMessage }),
      });
      const data = await res.json();
      setRunStatus(res.ok ? `✓ Triggered: ${JSON.stringify(data).slice(0, 200)}` : `✗ Error: ${data.error || res.status}`);
      if (res.ok) setRunMessage('');
    } catch (e: any) { setRunStatus(`✗ Error: ${e.message}`); }
    setRunning(false);
  };

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
    { key: 'thresholds', label: 'Guardrails', icon: Shield },
    { key: 'notifications', label: 'Notifications', icon: Zap },
    { key: 'soul', label: 'SOUL.md', icon: BookOpen },
    { key: 'skills', label: 'Skills & Workflows', icon: Code },
    { key: 'runnow', label: 'Run Now', icon: Play },
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
        <GlobalGuardrailsReadOnly />
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

      {/* SOUL.md Editor */}
      {section === 'soul' && (
        <div className="space-y-3">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border-primary)]/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-[var(--accent)]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">SOUL.md</span>
                {soulDirty && <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">Unsaved</span>}
              </div>
              <button onClick={saveSoul} disabled={saving || !soulDirty}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium btn-accent-violet disabled:opacity-40">
                <Save size={12} /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
            {soulLoading ? (
              <div className="p-8 text-center text-sm text-[var(--text-muted)] animate-pulse">Loading SOUL.md...</div>
            ) : (
              <textarea
                value={soulContent}
                onChange={e => { setSoulContent(e.target.value); setSoulDirty(true); }}
                rows={24}
                spellCheck={false}
                className="w-full bg-[var(--bg-primary)] text-[var(--text-secondary)] text-sm font-mono p-4 focus:outline-none resize-none leading-relaxed"
                placeholder="# Agent SOUL.md — define this agent's identity and behavior..."
              />
            )}
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            The SOUL.md defines the agent&apos;s identity, goals, and behavioral rules. Changes take effect on the next run.
          </p>
        </div>
      )}

      {/* Skills & Workflows */}
      {section === 'skills' && (
        <div className="space-y-4">
          {/* Skills */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border-primary)]/30 flex items-center gap-2">
              <Code size={14} className="text-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">Skills</span>
              <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-primary)] px-1.5 py-0.5 rounded">{skills.length}</span>
            </div>
            {skills.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--text-muted)]">No skills found in workspace.</div>
            ) : (
              <div className="divide-y divide-[var(--border-primary)]/30">
                {skills.map(skill => (
                  <div key={skill.name} className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{skill.name}</span>
                      {skill.hasSkillMd && <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">SKILL.md</span>}
                    </div>
                    {skill.description && <p className="text-xs text-[var(--text-muted)] mt-1">{skill.description}</p>}
                    {skill.scripts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {skill.scripts.map((s: string) => (
                          <span key={s} className="text-[10px] font-mono bg-[var(--bg-primary)] text-[var(--text-secondary)] px-2 py-0.5 rounded">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workflows */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border-primary)]/30 flex items-center gap-2">
              <Workflow size={14} className="text-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">Lobster Workflows</span>
              <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-primary)] px-1.5 py-0.5 rounded">{workflows.length}</span>
            </div>
            {workflows.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--text-muted)]">No workflows found.</div>
            ) : (
              <div className="divide-y divide-[var(--border-primary)]/30">
                {workflows.map(wf => (
                  <div key={wf.filename} className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{wf.name}</span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">{wf.filename}</span>
                    </div>
                    {wf.description && <p className="text-xs text-[var(--text-muted)] mt-1">{wf.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Run Now */}
      {section === 'runnow' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Play size={14} className="text-[var(--accent)]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">Trigger On-Demand Run</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Send a task message to this agent via OpenClaw hooks. The agent will execute immediately.</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={runMessage}
              onChange={e => setRunMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && triggerRun()}
              placeholder="e.g. Run full analysis for last 7 days"
              className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button onClick={triggerRun} disabled={running || !runMessage.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium btn-accent-violet disabled:opacity-40 shrink-0">
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {running ? 'Running...' : 'Run Now'}
            </button>
          </div>
          {runStatus && (
            <div className={`text-xs px-3 py-2 rounded-lg font-mono ${
              runStatus.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {runStatus}
            </div>
          )}
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

/* ── Read-only global guardrails display for per-agent config ── */

function GlobalGuardrailsReadOnly() {
  const [guardrails, setGuardrails] = useState<{ key: string; value: string; label: string; category: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agents/guardrails');
        const data = await res.json();
        setGuardrails(data.guardrails || []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-sm text-[var(--text-muted)] animate-pulse p-4">Loading guardrails...</div>;

  const categories = [...new Set(guardrails.map(g => g.category))];
  const CATEGORY_LABELS: Record<string, string> = {
    budget: 'Budget Rules', campaigns: 'Campaign Rules', creative: 'Creative Rules', confidence: 'Confidence',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
        <Shield size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-blue-400/80">
            These guardrails are set globally and apply to all agents. Values shown are read-only.
          </p>
          <Link href="/agents/config" className="text-xs text-[var(--accent)] hover:underline mt-1 inline-block">
            Edit in Global Configuration →
          </Link>
        </div>
      </div>

      {categories.map(cat => {
        const items = guardrails.filter(g => g.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="space-y-2">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-1">
              {CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)}
            </p>
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl divide-y divide-[var(--border-primary)]/30">
              {items.map(g => (
                <div key={g.key} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[var(--text-primary)]">{g.label}</span>
                  </div>
                  <span className="text-sm font-medium text-[var(--text-secondary)] shrink-0">
                    {g.value === 'true' ? '✓ Enabled' : g.value === 'false' ? '✗ Disabled' : g.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
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

            // WHAT — humanize action
            const humanizeAction = (action: string, type?: string): string => {
              const a = (action || '').toLowerCase();
              if (a === 'add-negative' || a === 'add_negative') return 'Block search term';
              if (a === 'fix_url') return 'Fix URL issue';
              if (a === 'reduce_budget') return 'Reduce budget';
              if (a === 'pause_keyword') return 'Pause keyword';
              if (a.startsWith('monitor')) return 'Monitor search term';
              if (a === 'budget_rebalance_needed' || type === 'budget_rebalance_needed') return 'Rebalance budget';
              return action.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            };

            const whatLabel = humanizeAction(rec.action, rec.type);
            const searchTerm = m.search_term || '';
            const whatFull = searchTerm ? `${whatLabel} "${searchTerm}"` : whatLabel;

            // WHERE — campaign + platform
            const platform = m.platform || m.source || '';
            const platformLabel = platform ? (PLATFORM_BADGES[platform]?.label || platform) : '';

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
                      {/* Badges row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <SeverityBadge severity={rec.severity} />
                        <StatusBadge status={rec.status} />
                        {m.confidence && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            m.confidence >= 80 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {m.confidence}% confidence
                          </span>
                        )}
                      </div>
                      {/* WHAT */}
                      <p className="text-sm font-medium text-[var(--text-primary)]">{whatFull}</p>
                      {/* WHERE */}
                      {(rec.target || platformLabel) && (
                        <p className="text-xs text-[var(--text-muted)]">
                          {rec.target && <><span className="text-[var(--text-secondary)]">Campaign:</span> {rec.target}</>}
                          {rec.target && platformLabel && <span className="mx-1.5 text-[var(--border-primary)]">|</span>}
                          {platformLabel && <span className="text-[var(--text-secondary)]">{platformLabel}</span>}
                        </p>
                      )}
                      {/* WHY */}
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{rec.rationale}</p>
                    </div>
                    {isPending && (() => {
                      const at = rec.actionType || getActionType(rec.type || rec.action || '');
                      if (at === 'executable') return (
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
                      );
                      if (at === 'informational') return (
                        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleAction(rec.id, 'approve')} disabled={acting === rec.id}
                            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)] rounded-lg text-xs font-medium disabled:opacity-50">
                            {acting === rec.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Acknowledge
                          </button>
                        </div>
                      );
                      return (
                        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleAction(rec.id, 'approve')} disabled={acting === rec.id}
                            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-primary)] rounded-lg text-xs font-medium disabled:opacity-50">
                            {acting === rec.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Dismiss
                          </button>
                        </div>
                      );
                    })()}
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

                    {/* Before/After preview for executable types */}
                    {isPending && (() => {
                      const at = rec.actionType || getActionType(rec.type || rec.action || '');
                      if (at !== 'executable') return null;
                      const ba = getBeforeAfter({ type: rec.type || rec.action, metadata: m });
                      if (!ba) return null;
                      return (
                        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-4 py-3 flex items-center gap-3">
                          <div className="flex-1">
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Before</p>
                            <p className="text-xs text-[var(--text-secondary)] font-medium">{ba.before}</p>
                          </div>
                          <ArrowRight size={14} className="text-[var(--text-muted)] shrink-0" />
                          <div className="flex-1">
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">After</p>
                            <p className="text-xs text-emerald-400 font-medium">{ba.after}</p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* What will happen */}
                    {isPending && (
                      <div className="bg-[var(--bg-card)] rounded-lg p-4 space-y-2">
                        <p className="text-xs font-medium text-[var(--text-primary)] uppercase tracking-wider">What will happen if approved</p>
                        {(rec.type === 'add-negative' || rec.action === 'add-negative' || rec.action === 'add_negative') && m.search_term ? (
                          <div className="space-y-1">
                            <p className="text-sm text-[var(--text-secondary)]">
                              The search term <span className="font-mono bg-[var(--bg-primary)] px-1.5 py-0.5 rounded text-red-400">&quot;{m.search_term}&quot;</span> will be added as a{' '}
                              <span className="font-medium">{m.match_type || 'exact'}</span> negative keyword to campaign{' '}
                              <span className="font-medium">{rec.target}</span>.
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              This will prevent your ads from showing for this search term, saving an estimated ${m.spend?.toFixed(2) || '0'}/month.
                            </p>
                          </div>
                        ) : rec.action === 'pause_keyword' ? (
                          <p className="text-sm text-[var(--text-secondary)]">
                            The keyword will be paused in campaign <span className="font-medium">{rec.target}</span>. It can be re-enabled later.
                          </p>
                        ) : rec.action === 'reduce_budget' ? (
                          <p className="text-sm text-[var(--text-secondary)]">
                            The daily budget for <span className="font-medium">{rec.target}</span> will be reduced. {m.spend ? `Current wasted spend: $${m.spend.toFixed(2)}.` : ''}
                          </p>
                        ) : rec.action === 'fix_url' ? (
                          <p className="text-sm text-[var(--text-secondary)]">
                            The landing page URL issue in <span className="font-medium">{rec.target}</span> will be flagged for correction.
                          </p>
                        ) : rec.type === 'budget_rebalance_needed' ? (
                          <p className="text-sm text-[var(--text-secondary)]">
                            Budget will be rebalanced across platforms/campaigns based on performance data. {rec.rationale}
                          </p>
                        ) : (
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
