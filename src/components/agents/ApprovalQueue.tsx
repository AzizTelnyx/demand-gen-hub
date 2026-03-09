'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, ThumbsUp, ThumbsDown, Loader2, Bot, CheckCircle2,
} from 'lucide-react';
import { SeverityBadge, Toast, timeAgo } from './AgentFleet';

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
  agentName?: string;
  agentSlug?: string;
}

export default function ApprovalQueue() {
  const [pending, setPending] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/recommendations?status=pending');
      const data = await res.json();
      setPending(data.recommendations || []);
    } catch {}
    setLoading(false);
  }, []);

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

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <ShieldCheck size={18} className="text-accent-amber" />
          Approval Queue
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

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <ShieldCheck size={18} className="text-accent-amber" />
          Approval Queue
          {pending.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold badge-amber">{pending.length}</span>
          )}
        </h2>
      </div>

      {pending.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-8 text-center">
          <CheckCircle2 size={24} className="mx-auto text-accent-emerald mb-2" />
          <p className="text-sm text-[var(--text-muted)]">No pending approvals — all clear ✅</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden divide-y divide-[var(--border-primary)]/30">
          {pending.map(rec => {
            const isActing = acting === rec.id;
            const m = rec.metadata || {};
            return (
              <div key={rec.id} className="px-5 py-4 hover:bg-[var(--bg-primary)]/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SeverityBadge severity={rec.severity} />
                      <span className="text-sm font-medium text-[var(--text-primary)]">{rec.action}</span>
                    </div>
                    {rec.target && (
                      <p className="text-xs text-[var(--text-muted)] truncate">Target: {rec.target}</p>
                    )}
                    <p className="text-xs text-[var(--text-secondary)]">{rec.rationale}</p>
                    <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                      {rec.agentName && (
                        <span className="flex items-center gap-1 text-indigo-400">
                          <Bot size={10} />{rec.agentName}
                        </span>
                      )}
                      <span>{timeAgo(rec.createdAt)}</span>
                      {m.spend && <span className="text-accent-amber">${m.spend.toFixed(2)} wasted</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleAction(rec.id, 'approve')} disabled={isActing}
                      className="flex items-center gap-1.5 px-3 py-2 btn-accent-emerald rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                      {isActing ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />} Approve
                    </button>
                    <button onClick={() => handleAction(rec.id, 'reject')} disabled={isActing}
                      className="flex items-center gap-1.5 px-2.5 py-2 btn-accent-red rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                      <ThumbsDown size={12} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
