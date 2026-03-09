'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, Bot, CheckCircle2, XCircle, ThumbsUp, ThumbsDown,
  Clock, Filter, ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';
import { StatusBadge, SeverityBadge, Toast, timeAgo } from '@/components/agents/AgentFleet';

type ViewMode = 'all' | 'approvals' | 'runs' | 'changes';

interface TimelineItem {
  id: string;
  kind: 'run' | 'approval' | 'change';
  timestamp: string;
  agentName: string;
  agentSlug: string;
  // Run fields
  status?: string;
  summary?: string;
  findingsCount?: number;
  recsCount?: number;
  // Recommendation fields
  action?: string;
  rationale?: string;
  severity?: string;
  target?: string;
  recStatus?: string;
  confidence?: number;
  spend?: number;
  appliedAt?: string;
  platform?: string;
  campaignName?: string;
  searchTerm?: string;
  matchType?: string;
  clicks?: number;
  conversions?: number;
  intentType?: string;
  oldValue?: any;
  newValue?: any;
}

export default function ActivityPage() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('all');
  const [agentFilter, setAgentFilter] = useState('');
  const [agents, setAgents] = useState<{ slug: string; name: string }[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (view !== 'all') params.set('kind', view);
      if (agentFilter) params.set('agent', agentFilter);
      const res = await fetch(`/api/activity?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      if (data.agents) setAgents(data.agents);
    } catch {}
    setLoading(false);
  }, [view, agentFilter]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActing(id);
    try {
      const res = await fetch('/api/agents/recommendations/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (data.ok || data.status === 'applied' || data.status === 'rejected') {
        setToast({ message: action === 'approve' ? 'Approved & applied' : 'Rejected', type: 'success' });
        load();
      } else {
        setToast({ message: data.error || 'Failed', type: 'error' });
      }
    } catch (e: any) {
      setToast({ message: e.message || 'Failed', type: 'error' });
    }
    setActing(null);
  };

  const views: { key: ViewMode; label: string }[] = [
    { key: 'all', label: 'All Activity' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'runs', label: 'Agent Runs' },
    { key: 'changes', label: 'Applied Changes' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
          <Activity size={24} className="text-[var(--accent)]" />
          Activity Log
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          All agent actions, approvals, and changes in one place
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl">
          {views.map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                view === v.key
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}>
              {v.label}
            </button>
          ))}
        </div>

        {agents.length > 0 && (
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
            className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none">
            <option value="">All Agents</option>
            {agents.map(a => (
              <option key={a.slug} value={a.slug}>{a.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-12 text-center">
          <Loader2 size={24} className="mx-auto animate-spin text-[var(--text-muted)]" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-12 text-center">
          <Activity size={32} className="mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No activity found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <TimelineCard key={item.id} item={item} acting={acting} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineCard({ item, acting, onAction }: {
  item: TimelineItem;
  acting: string | null;
  onAction: (id: string, action: 'approve' | 'reject') => void;
}) {
  if (item.kind === 'run') {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl px-5 py-4 flex items-center gap-4">
        <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
          <Bot size={14} className="text-[var(--accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">{item.agentName}</span>
            <StatusBadge status={item.status || 'done'} />
          </div>
          {item.summary && (
            <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{item.summary}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-[var(--text-muted)]">{timeAgo(item.timestamp)}</p>
          {(item.findingsCount || item.recsCount) ? (
            <p className="text-[10px] text-[var(--text-muted)]">{item.findingsCount}f / {item.recsCount}r</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (item.kind === 'approval') {
    const isPending = item.recStatus === 'pending';
    const platformLabel = item.platform ? item.platform.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
    return (
      <div className={`bg-[var(--bg-card)] border rounded-xl px-5 py-4 ${
        isPending ? 'border-amber-500/30' : 'border-[var(--border-primary)]'
      }`}>
        <div className="flex items-start gap-4">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isPending ? 'bg-amber-500/10' : item.recStatus === 'applied' ? 'bg-emerald-500/10' : 'bg-red-500/10'
          }`}>
            {isPending ? <Clock size={14} className="text-amber-400" /> :
              item.recStatus === 'applied' ? <CheckCircle2 size={14} className="text-emerald-400" /> :
                <XCircle size={14} className="text-red-400" />}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            {/* Header: What's happening */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {item.severity && <SeverityBadge severity={item.severity} />}
                {platformLabel && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-500/10 text-blue-400">
                    {platformLabel}
                  </span>
                )}
                {!isPending && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    item.recStatus === 'applied' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {item.recStatus}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{item.action}</p>
            </div>

            {/* Campaign context */}
            {(item.campaignName || item.target) && (
              <p className="text-xs text-[var(--text-muted)]">
                <span className="text-[var(--text-secondary)] font-medium">Campaign:</span>{' '}
                {item.campaignName || item.target}
              </p>
            )}

            {/* Why — the rationale */}
            {item.rationale && (
              <div className="bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                <p className="text-[10px] font-medium text-[var(--text-muted)] mb-0.5">Why</p>
                <p className="text-xs text-[var(--text-secondary)]">{item.rationale}</p>
              </div>
            )}

            {/* Impact metrics — only show if we have real data */}
            {(item.spend || item.clicks !== undefined || item.searchTerm) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {item.spend != null && item.spend > 0 && (
                  <div className="bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-[var(--text-muted)]">Wasted Spend</p>
                    <p className="text-sm font-semibold text-amber-400">${item.spend.toFixed(2)}</p>
                  </div>
                )}
                {item.clicks != null && (
                  <div className="bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-[var(--text-muted)]">Clicks</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{item.clicks}</p>
                  </div>
                )}
                {item.conversions != null && (
                  <div className="bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-[var(--text-muted)]">Conversions</p>
                    <p className={`text-sm font-semibold ${item.conversions === 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {item.conversions}
                    </p>
                  </div>
                )}
                {item.confidence != null && (
                  <div className="bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-[var(--text-muted)]">Confidence</p>
                    <p className={`text-sm font-semibold ${item.confidence >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {item.confidence}%
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Search term detail (for negative keyword recs) */}
            {item.searchTerm && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[var(--text-muted)]">Search term:</span>
                <code className="bg-[var(--bg-primary)] px-2 py-0.5 rounded text-[var(--text-secondary)] font-mono text-[11px]">
                  {item.searchTerm}
                </code>
                {item.matchType && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-medium">
                    {item.matchType}
                  </span>
                )}
              </div>
            )}

            {/* What happens if approved (for pending items) */}
            {isPending && (
              <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                <p className="text-[10px] font-medium text-amber-400 mb-0.5">If approved</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {item.searchTerm
                    ? `Will add "${item.searchTerm}" as a ${item.matchType || 'negative'} keyword to block this search term from triggering ads.`
                    : item.action?.toLowerCase().includes('budget')
                      ? `Will adjust campaign budget as recommended.`
                      : item.action?.toLowerCase().includes('pause')
                        ? `Will pause the targeted campaign or keyword.`
                        : `Will apply the recommended change to the campaign.`
                  }
                </p>
              </div>
            )}

            {/* Footer: agent + time */}
            <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <Bot size={10} className="text-indigo-400" /> {item.agentName}
              </span>
              {item.intentType && (
                <span className="text-[var(--text-muted)]">{item.intentType.replace('_', ' ')}</span>
              )}
              <span>{timeAgo(item.timestamp)}</span>
              {item.appliedAt && <span>Applied {timeAgo(item.appliedAt)}</span>}
            </div>
          </div>
          {isPending && (
            <div className="flex flex-col items-center gap-2 shrink-0">
              <button onClick={() => onAction(item.id, 'approve')} disabled={acting === item.id}
                className="flex items-center gap-1.5 px-4 py-2.5 btn-accent-emerald rounded-lg text-xs font-medium disabled:opacity-50 w-full justify-center">
                {acting === item.id ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />} Approve
              </button>
              <button onClick={() => onAction(item.id, 'reject')} disabled={acting === item.id}
                className="flex items-center gap-1.5 px-4 py-2.5 btn-accent-red rounded-lg text-xs font-medium disabled:opacity-50 w-full justify-center">
                <ThumbsDown size={12} /> Reject
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Change (applied)
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl px-5 py-4 flex items-center gap-4">
      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
        <CheckCircle2 size={14} className="text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">{item.action}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-500/10 text-emerald-400">applied</span>
        </div>
        {item.target && <p className="text-xs text-[var(--text-muted)] mt-1">{item.target}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-[var(--text-muted)]">{item.appliedAt ? timeAgo(item.appliedAt) : timeAgo(item.timestamp)}</p>
        <p className="text-[10px] text-indigo-400">{item.agentName}</p>
      </div>
    </div>
  );
}
