'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, ThumbsUp, ThumbsDown, Loader2, Bot, CheckCircle2,
  XCircle, ChevronDown, ChevronRight, AlertTriangle, DollarSign,
  Target, Zap, Clock, ArrowRight,
} from 'lucide-react';
import { SeverityBadge, StatusBadge, Toast, timeAgo } from './AgentFleet';

interface Recommendation {
  id: string;
  type: string;
  severity: string;
  target: string;
  targetId: string;
  action: string;
  rationale: string;
  status: string;
  metadata?: any;
  createdAt: string;
  appliedAt?: string;
  agentName?: string;
  agentSlug?: string;
}

export default function ApprovalQueue() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState<'pending' | 'recent'>('pending');

  const load = useCallback(async () => {
    try {
      const status = view === 'pending' ? 'pending' : '';
      const params = new URLSearchParams({ limit: '50' });
      if (status) params.set('status', status);
      const res = await fetch(`/api/agents/recommendations?${params}`);
      const data = await res.json();
      setRecs(data.recommendations || []);
    } catch {}
    setLoading(false);
  }, [view]);

  useEffect(() => { setLoading(true); load(); }, [load]);

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
        setToast({ message: action === 'approve' ? 'Approved & applied ✅' : 'Rejected', type: 'success' });
        load();
      } else {
        setToast({ message: data.error || 'Failed', type: 'error' });
      }
    } catch (e: any) {
      setToast({ message: e.message || 'Failed', type: 'error' });
    }
    setActing(null);
  };

  const pending = recs.filter(r => r.status === 'pending');
  const applied = recs.filter(r => r.status === 'applied');
  const rejected = recs.filter(r => r.status === 'rejected');
  const displayRecs = view === 'pending' ? pending : recs;
  const totalSpendAtRisk = pending.reduce((s, r) => s + (r.metadata?.spend || 0), 0);

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <ShieldCheck size={18} className="text-accent-amber" />
          Approvals & Recommendations
        </h2>
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-8 animate-pulse">
          <div className="h-4 bg-[var(--bg-primary)] rounded w-1/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {/* Header + view toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <ShieldCheck size={18} className="text-accent-amber" />
          Approvals & Recommendations
          {pending.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold badge-amber">{pending.length} pending</span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setView('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              view === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-muted)]'
            }`}>
            Pending ({pending.length})
          </button>
          <button onClick={() => setView('recent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              view === 'recent' ? 'bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30' : 'bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-muted)]'
            }`}>
            All Recent
          </button>
        </div>
      </div>

      {/* Summary stats when there are pending items */}
      {view === 'pending' && pending.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 flex items-center gap-3">
            <Clock size={16} className="text-amber-400 shrink-0" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Awaiting Review</p>
              <p className="text-lg font-semibold text-amber-400">{pending.length}</p>
            </div>
          </div>
          <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3 flex items-center gap-3">
            <DollarSign size={16} className="text-red-400 shrink-0" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Spend at Risk</p>
              <p className="text-lg font-semibold text-red-400">${totalSpendAtRisk.toFixed(0)}</p>
            </div>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 flex items-center gap-3">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Applied (total)</p>
              <p className="text-lg font-semibold text-emerald-400">{applied.length}</p>
            </div>
          </div>
        </div>
      )}

      {displayRecs.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-8 text-center">
          <CheckCircle2 size={24} className="mx-auto text-accent-emerald mb-2" />
          <p className="text-sm text-[var(--text-muted)]">
            {view === 'pending' ? 'No pending approvals — all clear ✅' : 'No recommendations yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayRecs.map(rec => (
            <RecommendationCard
              key={rec.id}
              rec={rec}
              expanded={expanded === rec.id}
              onToggle={() => setExpanded(expanded === rec.id ? null : rec.id)}
              acting={acting}
              onAction={handleAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RecommendationCard({ rec, expanded, onToggle, acting, onAction }: {
  rec: Recommendation;
  expanded: boolean;
  onToggle: () => void;
  acting: string | null;
  onAction: (id: string, action: 'approve' | 'reject') => void;
}) {
  const m = rec.metadata || {};
  const isPending = rec.status === 'pending';
  const isApplied = rec.status === 'applied';
  const isRejected = rec.status === 'rejected';

  const borderClass = isPending
    ? 'border-amber-500/20 hover:border-amber-500/40'
    : isApplied
      ? 'border-emerald-500/10'
      : isRejected
        ? 'border-red-500/10'
        : 'border-[var(--border-primary)]';

  return (
    <div className={`bg-[var(--bg-card)] border rounded-xl overflow-hidden transition-colors ${borderClass}`}>
      {/* Main row */}
      <div className="px-5 py-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start gap-3">
          {/* Status indicator */}
          <div className="pt-0.5">
            {expanded
              ? <ChevronDown size={14} className="text-[var(--text-muted)]" />
              : <ChevronRight size={14} className="text-[var(--text-muted)]" />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Top line: severity + action + status + confidence */}
            <div className="flex items-center gap-2 flex-wrap">
              <SeverityBadge severity={rec.severity} />
              <span className="text-sm font-medium text-[var(--text-primary)]">{rec.action}</span>
              {!isPending && <StatusBadge status={rec.status} />}
              {m.confidence && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  m.confidence >= 80 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {m.confidence}% confidence
                </span>
              )}
            </div>

            {/* Campaign target */}
            {rec.target && (
              <p className="text-xs text-[var(--text-secondary)]">
                <span className="text-[var(--text-muted)]">Campaign:</span> {rec.target}
              </p>
            )}

            {/* Quick impact metrics inline */}
            <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] flex-wrap">
              {rec.agentName && (
                <span className="flex items-center gap-1 text-indigo-400">
                  <Bot size={10} />{rec.agentName}
                </span>
              )}
              {m.spend != null && m.spend > 0 && (
                <span className="flex items-center gap-1 text-amber-400">
                  <DollarSign size={10} />${m.spend.toFixed(2)} wasted
                </span>
              )}
              {m.clicks != null && (
                <span>{m.clicks} clicks · {m.conversions || 0} conversions</span>
              )}
              {m.intent_type && (
                <span className="text-[var(--text-muted)]">
                  Intent: {m.intent_type.replace(/_/g, ' ').toLowerCase()}
                </span>
              )}
              <span>{timeAgo(rec.createdAt)}</span>
              {rec.appliedAt && (
                <span className="text-emerald-400">Applied {timeAgo(rec.appliedAt)}</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {isPending && (
            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={() => onAction(rec.id, 'approve')} disabled={acting === rec.id}
                className="flex items-center gap-1.5 px-3 py-2 btn-accent-emerald rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                {acting === rec.id ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />} Approve
              </button>
              <button onClick={() => onAction(rec.id, 'reject')} disabled={acting === rec.id}
                className="flex items-center gap-1.5 px-2.5 py-2 btn-accent-red rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                <ThumbsDown size={12} /> Reject
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 py-4 border-t border-[var(--border-primary)]/30 bg-[var(--bg-primary)]/30 space-y-4 ml-5">
          {/* Why this was flagged */}
          <div>
            <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider mb-1.5">Why this was flagged</p>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{rec.rationale}</p>
          </div>

          {/* Impact metrics */}
          {(m.spend != null || m.clicks != null || m.confidence != null) && (
            <div>
              <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Impact Analysis</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {m.spend != null && (
                  <div className="bg-[var(--bg-card)] rounded-lg p-3">
                    <p className="text-[10px] text-[var(--text-muted)]">Wasted Spend</p>
                    <p className="text-base font-semibold text-amber-400">${m.spend.toFixed(2)}</p>
                  </div>
                )}
                {m.clicks != null && (
                  <div className="bg-[var(--bg-card)] rounded-lg p-3">
                    <p className="text-[10px] text-[var(--text-muted)]">Irrelevant Clicks</p>
                    <p className="text-base font-semibold text-[var(--text-primary)]">{m.clicks}</p>
                  </div>
                )}
                {m.conversions != null && (
                  <div className="bg-[var(--bg-card)] rounded-lg p-3">
                    <p className="text-[10px] text-[var(--text-muted)]">Conversions</p>
                    <p className={`text-base font-semibold ${m.conversions > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {m.conversions}
                    </p>
                  </div>
                )}
                {m.confidence != null && (
                  <div className="bg-[var(--bg-card)] rounded-lg p-3">
                    <p className="text-[10px] text-[var(--text-muted)]">Confidence</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-base font-semibold ${m.confidence >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {m.confidence}%
                      </p>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${m.confidence}%`,
                            backgroundColor: m.confidence >= 80 ? 'rgb(52,211,153)' : 'rgb(251,191,36)',
                          }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* What will happen */}
          {isPending && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg p-4">
              <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Zap size={10} className="text-amber-400" />
                What happens if approved
              </p>
              {rec.type === 'add-negative' && m.search_term ? (
                <div className="space-y-2">
                  <p className="text-sm text-[var(--text-secondary)]">
                    The search term{' '}
                    <span className="font-mono bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">&quot;{m.search_term}&quot;</span>
                    {' '}will be added as a <span className="font-medium">{m.match_type}</span> negative keyword.
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Your ads will stop showing for this term. Estimated monthly savings: <span className="text-emerald-400 font-medium">${m.spend?.toFixed(2) || '0'}</span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">{rec.action} — {rec.rationale}</p>
              )}
            </div>
          )}

          {/* Applied confirmation */}
          {isApplied && (
            <div className="flex items-center gap-2 text-xs bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-4 py-3">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span className="text-emerald-400">
                Applied {rec.appliedAt ? timeAgo(rec.appliedAt) : ''}
              </span>
              {m.resource_name && (
                <span className="text-[var(--text-muted)] font-mono text-[10px] ml-2 truncate">{m.resource_name}</span>
              )}
            </div>
          )}

          {/* Rejected info */}
          {isRejected && (
            <div className="flex items-center gap-2 text-xs bg-red-500/5 border border-red-500/15 rounded-lg px-4 py-3">
              <XCircle size={14} className="text-red-400" />
              <span className="text-red-400">Rejected — no action taken</span>
            </div>
          )}

          {/* Technical details */}
          <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] flex-wrap pt-2 border-t border-[var(--border-primary)]/30">
            {m.search_term && <span>Term: &quot;{m.search_term}&quot;</span>}
            {m.match_type && <span>Match: {m.match_type}</span>}
            {m.campaign_id && <span>Campaign ID: {m.campaign_id}</span>}
            {m.intent_type && <span>Intent: {m.intent_type}</span>}
            <span>Type: {rec.type}</span>
          </div>
        </div>
      )}
    </div>
  );
}
