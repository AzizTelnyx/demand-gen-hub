'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Bot, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Loader2, Clock, Shield, ThumbsUp, ThumbsDown,
  AlertCircle, Sparkles, Copy, Hash, Eye, EyeOff, Type,
  Activity, ArrowRight,
} from 'lucide-react';

/* ── helpers shared across agent components ── */

export function timeAgo(date: string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'status-running',
    done: 'status-done',
    completed: 'status-done',
    failed: 'status-failed',
    cancelled: 'status-cancelled',
    error: 'status-failed',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors[status] || 'status-cancelled'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'severity-critical',
    high: 'severity-high',
    medium: 'severity-medium',
    low: 'severity-low',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${colors[severity] || colors.low}`}>
      {severity}
    </span>
  );
}

export function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, 3000); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in slide-in-from-bottom-4 ${
      type === 'success' ? 'toast-success' : 'toast-error'
    }`}>
      {type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      {message}
    </div>
  );
}

const PLATFORM_BADGES: Record<string, { label: string; cls: string }> = {
  google_ads: { label: 'Google Ads', cls: 'bg-blue-900/30 text-blue-400' },
  linkedin: { label: 'LinkedIn', cls: 'bg-sky-900/30 text-sky-400' },
  stackadapt: { label: 'StackAdapt', cls: 'bg-violet-900/30 text-violet-400' },
  reddit: { label: 'Reddit', cls: 'bg-orange-900/30 text-orange-400' },
  all: { label: 'All Platforms', cls: 'bg-emerald-900/30 text-emerald-400' },
};

interface AgentInfo {
  slug: string;
  name: string;
  description?: string;
  model?: string;
  enabled: boolean;
  status: string;
  totalRuns: number;
  recentRuns: number;
  lastRun?: string;
  lastRunFindings?: number;
  lastRunRecs?: number;
  lastRunSummary?: string;
}

interface ScheduleInfo {
  slug: string;
  schedule: string | null;
  platform: string | null;
}

interface AgentFleetProps {
  agents: AgentInfo[];
  schedules: ScheduleInfo[];
}

export default function AgentFleet({ agents, schedules }: AgentFleetProps) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const getSchedule = (slug: string) => schedules.find(s => s.slug === slug);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
        <Bot size={18} className="text-[var(--accent)]" />
        Agent Fleet
        <span className="text-xs text-[var(--text-muted)] font-normal ml-2">
          {agents.length} agents · {agents.filter(a => a.enabled).length} active
        </span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents.map((agent) => {
          const sched = getSchedule(agent.slug);
          const platform = sched?.platform || 'all';
          const badge = PLATFORM_BADGES[platform] || PLATFORM_BADGES.all;
          const dotColor = agent.status === 'done' ? 'bg-emerald-400'
            : agent.status === 'running' ? 'bg-blue-400 animate-pulse'
            : agent.status === 'failed' ? 'bg-red-400'
            : 'bg-gray-600';
          const isExpanded = expandedAgent === agent.slug;

          return (
            <div key={agent.slug}
              className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden hover:border-[var(--accent)]/30 transition-colors cursor-pointer"
              onClick={() => setExpandedAgent(isExpanded ? null : agent.slug)}>
              <div className="p-4 space-y-3">
                {/* Name + platform */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                      <Bot size={16} className="text-[var(--accent)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{agent.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.cls}`}>{badge.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                    <span className={`text-[10px] ${agent.enabled ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                      {agent.enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </div>

                {/* Schedule + last run */}
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {sched?.schedule || 'No schedule'}
                  </span>
                  {agent.lastRun && <span>{timeAgo(agent.lastRun)}</span>}
                </div>

                {/* Last run summary */}
                {agent.lastRunSummary && (
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">{agent.lastRunSummary}</p>
                )}

                {/* Stats */}
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>{agent.totalRuns} runs{agent.recentRuns > 0 ? ` · ${agent.recentRuns} this week` : ''}</span>
                  <div className="flex items-center gap-3">
                    {(agent.lastRunFindings || agent.lastRunRecs) && (
                      <span className="text-[var(--text-secondary)]">
                        {agent.lastRunFindings || 0}f / {agent.lastRunRecs || 0}r
                      </span>
                    )}
                    <Link href={`/agents/${agent.slug}`} onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 text-[var(--accent)] hover:underline">
                      Details <ArrowRight size={10} />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <AgentDetailPanel agent={agent} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgentDetailPanel({ agent }: { agent: AgentInfo }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/agents/activity?agent=${agent.slug}&limit=5`)
      .then(r => r.json())
      .then(data => { setRuns(data.runs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [agent.slug]);

  return (
    <div className="border-t border-[var(--border-primary)]/30 bg-[var(--bg-primary)]/30 px-4 py-4 space-y-3"
      onClick={e => e.stopPropagation()}>
      {agent.description && (
        <p className="text-xs text-[var(--text-muted)]">{agent.description}</p>
      )}

      <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Recent Runs</div>
      {loading ? (
        <div className="text-xs text-[var(--text-muted)] animate-pulse">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)]">No runs yet</div>
      ) : (
        <div className="space-y-1.5">
          {runs.map(run => (
            <div key={run.id} className="flex items-center gap-3 text-xs bg-[var(--bg-card)] rounded-lg px-3 py-2">
              <StatusBadge status={run.status} />
              <span className="text-[var(--text-secondary)] truncate flex-1">{run.summary || run.task || '—'}</span>
              <span className="text-[var(--text-muted)] shrink-0">{run.startedAt ? timeAgo(run.startedAt) : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
