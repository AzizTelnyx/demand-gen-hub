'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, Bot, CheckCircle2, XCircle, ThumbsUp, ThumbsDown,
  Clock, Loader2, AlertTriangle, Eye, Check, X, ArrowRight,
} from 'lucide-react';
import { getActionType, getBeforeAfter } from '@/lib/recommendation-types';
import { StatusBadge, SeverityBadge, Toast, timeAgo } from '@/components/agents/AgentFleet';

type ViewMode = 'all' | 'approvals' | 'runs' | 'changes';

interface TimelineItem {
  id: string;
  kind: 'run' | 'approval' | 'change';
  timestamp: string;
  agentName: string;
  agentSlug: string;
  status?: string;
  summary?: string;
  findingsCount?: number;
  recsCount?: number;
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
  type?: string;
  actionType?: 'executable' | 'informational' | 'alert';
  metadata?: any;
  autoApplied?: boolean;
}

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  google_ads: { label: 'Google Ads', color: 'bg-blue-500/10 text-blue-400' },
  linkedin: { label: 'LinkedIn', color: 'bg-sky-500/10 text-sky-400' },
  stackadapt: { label: 'StackAdapt', color: 'bg-purple-500/10 text-purple-400' },
  reddit: { label: 'Reddit', color: 'bg-orange-500/10 text-orange-400' },
};

function humanizeAction(action: string, searchTerm?: string, target?: string): string {
  const a = action.toLowerCase();
  if (a === 'fix_url' || a === 'fix url') return 'Fix URL tracking issue';
  if (a.includes('add_negative') || a.includes('add-negative')) return searchTerm ? `Block "${searchTerm}"` : 'Block search term';
  if (a.includes('pause_keyword') || a.includes('pause keyword')) return searchTerm ? `Pause "${searchTerm}"` : target ? `Pause keyword in ${target}` : 'Pause underperforming keyword';
  if (a.includes('reduce_budget') || a.includes('reduce budget')) return 'Reduce budget — overspend risk';
  if (a.includes('budget_rebalance') || a.includes('rebalance')) return 'Rebalance budget across platforms';
  if (a.includes('reduce_google_increase')) return 'Rebalance: shift budget from Google to other platforms';
  if (a.startsWith('monitor ') || a.startsWith('monitor_')) {
    const term = action.replace(/^monitor[_ ]/i, '').replace(/ for performance$/i, '');
    return `Monitor search term "${term}"`;
  }
  if (a.includes('pause_campaign') || a.includes('pause campaign')) return 'Pause campaign';
  if (a.includes('increase_budget') || a.includes('budget_increase')) return 'Increase campaign budget';
  if (a.includes('frequency') || a.includes('freq_cap')) return 'Adjust frequency cap';
  if (a.includes('bid')) return 'Adjust bid modifier';
  if (a.includes('domain') || a.includes('publisher')) return 'Block underperforming domain/publisher';
  // Fallback: humanize underscores
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getIfApprovedText(item: TimelineItem): string {
  if (item.searchTerm) {
    return `Will block "${item.searchTerm}" as a ${item.matchType || 'negative'} keyword in Google Ads — this search term will no longer trigger your ads.`;
  }
  const act = (item.action || '').toLowerCase();
  if (act.includes('community') || act.includes('subreddit')) {
    return 'Will remove this subreddit community from Reddit ad targeting on next agent run.';
  }
  if (act.includes('frequency') || act.includes('freq cap')) {
    return 'Will adjust the frequency cap on this campaign to reduce ad fatigue.';
  }
  if (act.includes('pause')) {
    return 'Will pause this keyword or campaign to stop spend on underperforming traffic.';
  }
  if (act.includes('budget')) {
    return 'Will adjust the campaign daily budget as recommended.';
  }
  if (act.includes('bid')) {
    return 'Will adjust bid modifiers for this device or geography.';
  }
  if (act.includes('review') || act.includes('audit')) {
    return 'This is a review recommendation — approving marks it as acknowledged. No automated change will be made.';
  }
  return 'Will apply this change via the platform API. The agent will execute on next run if not immediate.';
}

export default function ActivityPage() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('all');
  const [agentFilter, setAgentFilter] = useState('');
  const [agents, setAgents] = useState<{ slug: string; name: string }[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ id: string; message: string; type: 'success' | 'error' } | null>(null);
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
    setActionResult(null);
    try {
      const res = await fetch('/api/agents/recommendations/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (data.ok) {
        setActionResult({ id, message: data.message || (action === 'approve' ? 'Approved' : 'Rejected'), type: 'success' });
        // Refresh after short delay so user sees the result
        setTimeout(load, 1500);
      } else {
        setActionResult({ id, message: data.error || 'Failed', type: 'error' });
      }
    } catch (e: any) {
      setActionResult({ id, message: e.message || 'Failed', type: 'error' });
    }
    setActing(null);
  };

  const pendingItems = items.filter(i => i.kind === 'approval' && i.recStatus === 'pending');
  const appliedItems = items.filter(i => i.recStatus === 'applied' || i.recStatus === 'acknowledged');

  const views: { key: ViewMode; label: string; count?: number }[] = [
    { key: 'all', label: 'All Activity' },
    { key: 'approvals', label: 'Approvals', count: pendingItems.length },
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

      {/* Summary Banner */}
      {pendingItems.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-5 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {pendingItems.length} recommendation{pendingItems.length !== 1 ? 's' : ''} waiting for your review
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {pendingItems.filter(i => i.spend && i.spend > 0).length > 0
                ? `$${pendingItems.reduce((sum, i) => sum + (i.spend || 0), 0).toFixed(0)} total wasted spend flagged`
                : 'Review and approve or reject each recommendation below'
              }
            </p>
          </div>
          <button
            onClick={() => setView('approvals')}
            className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg text-xs font-medium transition-colors"
          >
            View pending
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl">
          {views.map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                view === v.key
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}>
              {v.label}
              {v.count != null && v.count > 0 && (
                <span className="bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {v.count}
                </span>
              )}
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
            <TimelineCard
              key={item.id}
              item={item}
              acting={acting}
              actionResult={actionResult}
              onAction={handleAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineCard({ item, acting, actionResult, onAction }: {
  item: TimelineItem;
  acting: string | null;
  actionResult: { id: string; message: string; type: 'success' | 'error' } | null;
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
            <p className="text-[10px] text-[var(--text-muted)]">{item.findingsCount} findings / {item.recsCount} recs</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (item.kind === 'approval') {
    const isPending = item.recStatus === 'pending';
    const isApplied = item.recStatus === 'applied' || item.recStatus === 'acknowledged';
    const isRejected = item.recStatus === 'rejected' || item.recStatus === 'dismissed';
    const platformInfo = item.platform ? PLATFORM_LABELS[item.platform] : null;
    const showResult = actionResult && actionResult.id === item.id;

    return (
      <div className={`bg-[var(--bg-card)] border rounded-xl px-5 py-4 ${
        isPending ? 'border-amber-500/30 shadow-sm shadow-amber-500/5' : 'border-[var(--border-primary)]'
      }`}>
        {/* Action result feedback */}
        {showResult && (
          <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium ${
            actionResult.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {actionResult.type === 'success' ? '✓' : '✗'} {actionResult.message}
          </div>
        )}

        <div className="flex items-start gap-4">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isPending ? 'bg-amber-500/10' : isApplied ? 'bg-emerald-500/10' : 'bg-red-500/10'
          }`}>
            {isPending ? <Clock size={14} className="text-amber-400" /> :
              isApplied ? <CheckCircle2 size={14} className="text-emerald-400" /> :
                <XCircle size={14} className="text-red-400" />}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            {/* Header: badges */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {isPending && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-500/15 text-amber-400 uppercase tracking-wide">
                    Needs Review
                  </span>
                )}
                {!isPending && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    isApplied ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {item.autoApplied ? '⚡ auto-applied' : item.recStatus}
                  </span>
                )}
                {item.severity && <SeverityBadge severity={item.severity} />}
                {item.confidence != null && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    item.confidence >= 80 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                  }`}>
                    {item.confidence}% confidence
                  </span>
                )}
                {platformInfo && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${platformInfo.color}`}>
                    {platformInfo.label}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{humanizeAction(item.action || '', item.searchTerm, item.target)}</p>
            </div>

            {/* Where: Campaign + Platform */}
            {(item.campaignName || item.target) && (
              <p className="text-xs text-[var(--text-muted)]">
                <span className="text-[var(--text-secondary)] font-medium">Campaign:</span>{' '}
                {item.campaignName || item.target}
              </p>
            )}

            {/* Why */}
            {item.rationale && (
              <div className="bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                <p className="text-[10px] font-medium text-[var(--text-muted)] mb-0.5">Why</p>
                <p className="text-xs text-[var(--text-secondary)]">{item.rationale}</p>
              </div>
            )}

            {/* Impact metrics */}
            {(item.spend != null || item.clicks != null || item.conversions != null || item.confidence != null) && (
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

            {/* Search term detail */}
            {item.searchTerm && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
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

            {/* Before/After preview for executable types */}
            {isPending && (() => {
              const at = item.actionType || getActionType(item.type || item.action || '');
              if (at === 'executable') {
                const ba = getBeforeAfter({ type: item.type || item.action, metadata: item.metadata || { search_term: item.searchTerm, match_type: item.matchType } });
                if (ba) return (
                  <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-4 py-3 flex items-center gap-3">
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
              }
              return null;
            })()}

            {/* If approved — only for pending executable */}
            {isPending && (item.actionType || getActionType(item.type || item.action || '')) === 'executable' && (
              <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                <p className="text-[10px] font-medium text-amber-400 mb-0.5">If you approve</p>
                <p className="text-xs text-[var(--text-secondary)]">{getIfApprovedText(item)}</p>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <Bot size={10} className="text-indigo-400" /> {item.agentName}
              </span>
              {item.intentType && (
                <span>{item.intentType.replace(/_/g, ' ')}</span>
              )}
              <span>{timeAgo(item.timestamp)}</span>
              {item.appliedAt && <span>Applied {timeAgo(item.appliedAt)}</span>}
            </div>
          </div>

          {/* Action buttons — vary by action type */}
          {isPending && (() => {
            const at = item.actionType || getActionType(item.type || item.action || '');
            if (at === 'executable') return (
              <div className="flex flex-col items-stretch gap-2 shrink-0 min-w-[100px]">
                <button onClick={() => onAction(item.id, 'approve')} disabled={acting === item.id}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-medium disabled:opacity-50 justify-center transition-colors">
                  {acting === item.id ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />} Approve
                </button>
                <button onClick={() => onAction(item.id, 'reject')} disabled={acting === item.id}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-red-500/5 hover:bg-red-500/10 text-red-400 border border-red-500/15 rounded-lg text-xs font-medium disabled:opacity-50 justify-center transition-colors">
                  <ThumbsDown size={12} /> Reject
                </button>
              </div>
            );
            if (at === 'informational') return (
              <div className="flex flex-col items-stretch gap-2 shrink-0 min-w-[100px]">
                <button onClick={() => onAction(item.id, 'approve')} disabled={acting === item.id}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)] rounded-lg text-xs font-medium disabled:opacity-50 justify-center transition-colors">
                  {acting === item.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Acknowledge
                </button>
              </div>
            );
            // alert
            return (
              <div className="flex flex-col items-stretch gap-2 shrink-0 min-w-[100px]">
                <button onClick={() => onAction(item.id, 'approve')} disabled={acting === item.id}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-primary)] rounded-lg text-xs font-medium disabled:opacity-50 justify-center transition-colors">
                  {acting === item.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Dismiss
                </button>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // Change (applied)
  const platformInfo2 = item.platform ? PLATFORM_LABELS[item.platform] : null;
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl px-5 py-4">
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
          <CheckCircle2 size={14} className="text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          {/* Header badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
              item.autoApplied ? 'bg-violet-500/15 text-violet-400' : 'bg-emerald-500/10 text-emerald-400'
            }`}>
              {item.autoApplied ? '⚡ auto-applied' : 'applied'}
            </span>
            {item.confidence != null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                item.confidence >= 80 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
              }`}>
                {item.confidence}% confidence
              </span>
            )}
            {platformInfo2 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${platformInfo2.color}`}>
                {platformInfo2.label}
              </span>
            )}
          </div>

          {/* Title — show keyword/search term prominently */}
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {humanizeAction(item.action || '', item.searchTerm, item.target)}
          </p>

          {/* Campaign */}
          {(item.campaignName || item.target) && (
            <p className="text-xs text-[var(--text-muted)]">
              <span className="text-[var(--text-secondary)] font-medium">Campaign:</span>{' '}
              {item.campaignName || item.target}
            </p>
          )}

          {/* Why */}
          {item.rationale && (
            <div className="bg-[var(--bg-primary)] rounded-lg px-3 py-2">
              <p className="text-[10px] font-medium text-[var(--text-muted)] mb-0.5">Why</p>
              <p className="text-xs text-[var(--text-secondary)]">{item.rationale}</p>
            </div>
          )}

          {/* Metrics */}
          {(item.spend != null || item.clicks != null || item.conversions != null) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {item.spend != null && item.spend > 0 && (
                <div className="bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                  <p className="text-[10px] text-[var(--text-muted)]">Spend Saved</p>
                  <p className="text-sm font-semibold text-emerald-400">${item.spend.toFixed(0)}</p>
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
            </div>
          )}

          {/* Search term detail */}
          {item.searchTerm && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-[var(--text-muted)]">Keyword:</span>
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

          {/* Footer */}
          <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              <Bot size={10} className="text-indigo-400" /> {item.agentName}
            </span>
            <span>{item.appliedAt ? timeAgo(item.appliedAt) : timeAgo(item.timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
