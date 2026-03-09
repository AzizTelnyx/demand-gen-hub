'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Filter, Download, FileText, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Loader2, Clock, X, AlertTriangle,
  Bot, Activity, Shield, ShieldAlert, ShieldCheck,
  ThumbsUp, ThumbsDown, DollarSign, Search,
  Eye, EyeOff, Type, Copy, AlertCircle, Sparkles,
  ExternalLink, Hash,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */

const statusColors: Record<string, { bg: string; text: string; icon: any }> = {
  running: { bg: 'bg-blue-900/30', text: 'text-blue-400', icon: Loader2 },
  done: { bg: 'bg-emerald-900/30', text: 'text-emerald-400', icon: CheckCircle2 },
  completed: { bg: 'bg-emerald-900/30', text: 'text-emerald-400', icon: CheckCircle2 },
  failed: { bg: 'bg-red-900/30', text: 'text-red-400', icon: XCircle },
  cancelled: { bg: 'bg-gray-800', text: 'text-gray-500', icon: X },
  error: { bg: 'bg-red-900/30', text: 'text-red-400', icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusColors[status] || { bg: 'bg-gray-800', text: 'text-gray-400' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.bg} ${s.text}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'text-red-400 bg-red-900/30',
    high: 'text-amber-400 bg-amber-900/30',
    medium: 'text-blue-400 bg-blue-900/30',
    low: 'text-gray-400 bg-gray-800',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${colors[severity] || colors.low}`}>
      {severity}
    </span>
  );
}

function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, 3000); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in slide-in-from-bottom-4 ${
      type === 'success' ? 'bg-emerald-900/90 border-emerald-700/50 text-emerald-200' : 'bg-red-900/90 border-red-700/50 text-red-200'
    }`}>
      {type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      {message}
    </div>
  );
}

function timeAgo(date: string) {
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

/* ═══════════════════════════════════════════════════════
   SECTION: AGENT GUARDRAILS
   ═══════════════════════════════════════════════════════ */

type GuardrailTab = 'budget' | 'campaigns' | 'regional';

interface Guardrail { id: string; key: string; value: string; label: string; category: string; }
interface RegPriority { id: string; quarter: string; region: string; product: string; priority: string; protected: boolean; }

const REGIONS = ['GLOBAL', 'AMER', 'EMEA', 'APAC', 'MENA'];
const PRODUCTS = ['AI Agent', 'Voice API', 'SIP', 'SMS', 'Numbers', 'IoT SIM'];
const QUARTERS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'];
const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40',
  medium: 'bg-amber-900/40 text-amber-400 border-amber-700/40',
  low: 'bg-gray-800/60 text-gray-400 border-gray-700/40',
  none: 'bg-transparent text-gray-600 border-gray-800/30',
};

function AgentGuardrailsSection() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<GuardrailTab>('budget');
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [priorities, setPriorities] = useState<RegPriority[]>([]);
  const [quarter, setQuarter] = useState('2026-Q1');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const debounceRef = React.useRef<Record<string, NodeJS.Timeout>>({});

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/guardrails?quarter=${q || quarter}`);
      const data = await res.json();
      setGuardrails(data.guardrails || []);
      setPriorities(data.priorities || []);
    } catch {}
    setLoading(false);
  }, [quarter]);

  useEffect(() => { if (open && guardrails.length === 0) load(); }, [open, load, guardrails.length]);

  const saveGuardrail = async (key: string, value: string) => {
    setSaving(key);
    try {
      await fetch('/api/agents/guardrails', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      setGuardrails(prev => prev.map(g => g.key === key ? { ...g, value } : g));
      setToast({ message: 'Saved', type: 'success' });
    } catch { setToast({ message: 'Failed to save', type: 'error' }); }
    setSaving(null);
  };

  const savePriority = (region: string, product: string, field: string, value: string | boolean) => {
    const dKey = `${region}-${product}-${field}`;
    if (debounceRef.current[dKey]) clearTimeout(debounceRef.current[dKey]);
    // Optimistic update
    setPriorities(prev => {
      const idx = prev.findIndex(p => p.region === region && p.product === product);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], [field]: value };
        return updated;
      }
      return [...prev, { id: '', quarter, region, product, priority: field === 'priority' ? value as string : 'none', protected: field === 'protected' ? value as boolean : false }];
    });
    debounceRef.current[dKey] = setTimeout(async () => {
      const existing = priorities.find(p => p.region === region && p.product === product);
      await fetch('/api/agents/guardrails', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quarter, region, product,
          priority: field === 'priority' ? value : (existing?.priority || 'none'),
          protected: field === 'protected' ? value : (existing?.protected || false),
        }),
      });
    }, 500);
  };

  const getVal = (key: string) => guardrails.find(g => g.key === key)?.value || '';

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-left group">
        {open ? <ChevronDown size={14} className="text-[var(--text-muted)]" /> : <ChevronRight size={14} className="text-[var(--text-muted)]" />}
        <Shield size={18} className="text-violet-400" />
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Agent Guardrails</h2>
        <span className="text-xs text-[var(--text-muted)] font-normal">Configuration</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl">
            {([
              { key: 'budget' as GuardrailTab, label: 'Budget Rules', icon: DollarSign },
              { key: 'campaigns' as GuardrailTab, label: 'Campaign Rules', icon: ShieldCheck },
              { key: 'regional' as GuardrailTab, label: 'Regional Priorities', icon: Activity },
            ]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t.key ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-sm text-[var(--text-muted)] animate-pulse p-4">Loading guardrails...</div>
          ) : tab === 'budget' ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl divide-y divide-[var(--border-primary)]/30">
              <GuardrailNumberField label="Min Daily Budget" suffix="$" gKey="budget_floor_min" value={getVal('budget_floor_min')} saving={saving} onSave={saveGuardrail} />
              <GuardrailNumberField label="Max Budget Change Without Approval" suffix="$" gKey="budget_change_max_no_approval" value={getVal('budget_change_max_no_approval')} saving={saving} onSave={saveGuardrail} />
              <GuardrailToggleField label="Allow Cross-Product Reallocation" gKey="cross_product_realloc" value={getVal('cross_product_realloc') === 'true'} saving={saving} onSave={(k, v) => saveGuardrail(k, v ? 'true' : 'false')} />
            </div>
          ) : tab === 'campaigns' ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl divide-y divide-[var(--border-primary)]/30">
              <GuardrailNumberField label="Learning Period" suffix="days" gKey="learning_period_days" value={getVal('learning_period_days')} saving={saving} onSave={saveGuardrail} />
              <GuardrailToggleField label="Auto-Protect Non-Conquest Campaigns" gKey="protect_non_conquest" value={getVal('protect_non_conquest') === 'true'} saving={saving} onSave={(k, v) => saveGuardrail(k, v ? 'true' : 'false')} />
              <GuardrailNumberField label="Min Confidence to Execute" suffix="%" gKey="confidence_threshold" value={getVal('confidence_threshold')} saving={saving} onSave={saveGuardrail} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <select value={quarter} onChange={e => { setQuarter(e.target.value); load(e.target.value); }}
                  className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none">
                  {QUARTERS.map(q => <option key={q} value={q}>{q.replace('-', ' ')}</option>)}
                </select>
              </div>
              <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-primary)]/30">
                      <th className="px-3 py-2.5 text-left text-[var(--text-muted)] font-medium">Region</th>
                      {PRODUCTS.map(p => <th key={p} className="px-2 py-2.5 text-center text-[var(--text-muted)] font-medium whitespace-nowrap">{p}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {REGIONS.map(region => (
                      <tr key={region} className="border-b border-[var(--border-primary)]/20 last:border-0">
                        <td className="px-3 py-2 text-[var(--text-primary)] font-medium">{region}</td>
                        {PRODUCTS.map(product => {
                          const p = priorities.find(x => x.region === region && x.product === product);
                          return (
                            <td key={product} className="px-1 py-1.5 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <select value={p?.priority || 'none'} onChange={e => savePriority(region, product, 'priority', e.target.value)}
                                  className={`w-20 text-center px-1.5 py-1 rounded text-[10px] font-semibold border cursor-pointer focus:outline-none ${PRIORITY_COLORS[p?.priority || 'none']}`}>
                                  <option value="none">—</option>
                                  <option value="high">High</option>
                                  <option value="medium">Med</option>
                                  <option value="low">Low</option>
                                </select>
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input type="checkbox" checked={p?.protected || false} onChange={e => savePriority(region, product, 'protected', e.target.checked)}
                                    className="w-3 h-3 rounded border-gray-600 bg-transparent accent-violet-500" />
                                  <span className="text-[9px] text-[var(--text-muted)]">lock</span>
                                </label>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GuardrailNumberField({ label, suffix, gKey, value, saving, onSave }: {
  label: string; suffix: string; gKey: string; value: string; saving: string | null; onSave: (key: string, value: string) => void;
}) {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => { setLocalVal(value); }, [value]);
  const changed = localVal !== value;
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-4">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">
        {suffix === '$' && <span className="text-xs text-[var(--text-muted)]">$</span>}
        <input type="number" value={localVal} onChange={e => setLocalVal(e.target.value)}
          className="w-20 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]" />
        {suffix !== '$' && <span className="text-xs text-[var(--text-muted)]">{suffix}</span>}
        <button onClick={() => onSave(gKey, localVal)} disabled={!changed || saving === gKey}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${changed ? 'bg-violet-900/30 border border-violet-700/40 text-violet-400 hover:bg-violet-900/50' : 'bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-muted)] opacity-50 cursor-default'}`}>
          {saving === gKey ? '...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function GuardrailToggleField({ label, gKey, value, saving, onSave }: {
  label: string; gKey: string; value: boolean; saving: string | null; onSave: (key: string, value: boolean) => void;
}) {
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-4">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <button onClick={() => onSave(gKey, !value)} disabled={saving === gKey}
        className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-violet-600' : 'bg-gray-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SECTION A: NEGATIVE KEYWORDS
   ═══════════════════════════════════════════════════════ */

type NKTab = 'pending' | 'applied' | 'rejected';

interface NKRec {
  id: string;
  type: string;
  severity: string;
  target: string;
  targetId: string;
  action: string;
  rationale: string;
  status: string;
  metadata: any;
  createdAt: string;
}

function NegativeKeywordsSection() {
  const [pending, setPending] = useState<NKRec[]>([]);
  const [applied, setApplied] = useState<NKRec[]>([]);
  const [rejected, setRejected] = useState<NKRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [tab, setTab] = useState<NKTab>('pending');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [pRes, aRes, rRes] = await Promise.all([
        fetch('/api/agents/recommendations?status=pending&type=add-negative'),
        fetch('/api/agents/recommendations?status=applied&type=add-negative&limit=100'),
        fetch('/api/agents/recommendations?status=rejected&type=add-negative&limit=100'),
      ]);
      const [pData, aData, rData] = await Promise.all([pRes.json(), aRes.json(), rRes.json()]);
      setPending(pData.recommendations || []);
      setApplied(aData.recommendations || []);
      setRejected(rData.recommendations || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

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
        setToast({ message: action === 'approve' ? 'Negative keyword added to Google Ads' : 'Dismissed', type: 'success' });
        loadAll();
      } else {
        setToast({ message: data.error || 'Failed', type: 'error' });
      }
    } catch (e: any) {
      setToast({ message: e.message || 'Failed', type: 'error' });
    }
    setActing(null);
  };

  const handleBulkApprove = async () => {
    for (const rec of pending) {
      await handleAction(rec.id, 'approve');
    }
  };

  if (loading) return <SectionSkeleton title="Negative Keywords" />;

  const totalWaste = pending.reduce((s, r) => s + (r.metadata?.spend || 0), 0);
  const totalSaved = applied.reduce((s, r) => s + (r.metadata?.spend || 0), 0);
  const current = tab === 'pending' ? pending : tab === 'applied' ? applied : rejected;

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Shield size={18} className="text-amber-400" />
          Negative Keywords
          {pending.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-900/30 text-amber-400">{pending.length}</span>
          )}
        </h2>
        {tab === 'pending' && pending.length > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={handleBulkApprove} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/20 border border-emerald-800/30 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-900/30 transition-colors">
              <ThumbsUp size={12} /> Approve All ({pending.length})
            </button>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">Pending Review</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{pending.length}</p>
          {totalWaste > 0 && <p className="text-xs text-[var(--text-muted)] mt-0.5">${totalWaste.toFixed(2)} wasted</p>}
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">Auto-Applied + Approved</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{applied.length}</p>
          {totalSaved > 0 && <p className="text-xs text-emerald-500/70 mt-0.5">${totalSaved.toFixed(2)} blocked</p>}
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">Rejected</p>
          <p className="text-xl font-bold text-[var(--text-secondary)] mt-1">{rejected.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl">
        {([
          { key: 'pending' as NKTab, label: 'Needs Review', count: pending.length, color: 'text-amber-400' },
          { key: 'applied' as NKTab, label: 'Applied', count: applied.length, color: 'text-emerald-400' },
          { key: 'rejected' as NKTab, label: 'Rejected', count: rejected.length, color: 'text-red-400' },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}>
            {t.label}
            {t.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${tab === t.key ? t.color.replace('text-', 'bg-').replace('400', '900/30') + ' ' + t.color : 'bg-[var(--bg-primary)] text-[var(--text-muted)]'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* List */}
      {current.length > 0 ? (
        <div className={`bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden divide-y divide-[var(--border-primary)]/30 ${tab === 'rejected' ? 'opacity-60' : ''}`}>
          {current.map((rec) => (
            <NKCard key={rec.id} rec={rec} acting={acting} onAction={handleAction} isPending={tab === 'pending'} />
          ))}
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-8 text-center">
          <ShieldCheck size={24} className="mx-auto text-emerald-400 mb-2" />
          <p className="text-sm text-[var(--text-muted)]">
            {tab === 'pending' ? 'No pending reviews. All clear.' : tab === 'applied' ? 'No applied keywords yet.' : 'No rejected items.'}
          </p>
        </div>
      )}
    </div>
  );
}

function NKCard({ rec, acting, onAction, isPending }: { rec: NKRec; acting: string | null; onAction: (id: string, a: 'approve' | 'reject') => void; isPending: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isActing = acting === rec.id;
  const m = rec.metadata || {};

  return (
    <div className="group">
      <div className="px-5 py-4 flex items-center gap-4 hover:bg-[var(--bg-primary)]/50 transition-colors cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <button className="text-[var(--text-muted)]">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-primary)] px-2 py-0.5 rounded">{m.search_term || rec.action}</code>
            <SeverityBadge severity={rec.severity} />
            {m.confidence && <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-muted)]">{m.confidence}%</span>}
          </div>
          <p className="text-xs text-[var(--text-muted)] truncate mt-1">{rec.target}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {m.spend > 0 && <span className="text-sm font-semibold text-amber-400">${m.spend.toFixed(2)}</span>}
          <span className="text-xs text-[var(--text-muted)]">{timeAgo(rec.createdAt)}</span>
          {isPending && (
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={(e) => { e.stopPropagation(); onAction(rec.id, 'approve'); }} disabled={isActing}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-900/20 border border-emerald-800/30 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-900/40 transition-colors disabled:opacity-50">
                {isActing ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />} Apply
              </button>
              <button onClick={(e) => { e.stopPropagation(); onAction(rec.id, 'reject'); }} disabled={isActing}
                className="flex items-center gap-1.5 px-2.5 py-2 bg-red-900/20 border border-red-800/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-900/40 transition-colors disabled:opacity-50">
                <ThumbsDown size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-4 pl-14 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {m.match_type && <Stat label="Match Type" value={m.match_type} />}
            {m.clicks !== undefined && <Stat label="Clicks" value={`${m.clicks} · 0 conv`} />}
            {m.impressions !== undefined && <Stat label="Impressions" value={String(m.impressions)} />}
            {m.spend !== undefined && <Stat label="Spend" value={`$${m.spend.toFixed(2)}`} />}
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">AI Reasoning</span>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{rec.rationale}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-primary)] rounded-lg px-4 py-3">
      <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">{label}</span>
      <p className="text-sm text-[var(--text-primary)] mt-1">{value}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SECTION B: AD COPY HEALTH (read-only findings)
   ═══════════════════════════════════════════════════════ */

type CopyCategory = 'char_limit' | 'filler_word' | 'duplicate' | 'suggestion';

interface CopyFinding {
  id: string;
  category: CopyCategory;
  action: string;
  rationale: string;
  metadata: any;
  target: string;
  createdAt: string;
  count: number; // grouped count
  children: { id: string; target: string; metadata: any }[];
}

function AdCopyHealthSection() {
  const [findings, setFindings] = useState<CopyFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CopyCategory | 'all'>('all');

  useEffect(() => {
    fetch('/api/agents/recommendations?status=pending&type=ad-copy&limit=2000')
      .then(r => r.json())
      .then(data => {
        const recs = data.recommendations || [];
        // Group by action text (deduplication key)
        const groups = new Map<string, CopyFinding>();
        for (const rec of recs) {
          const cat = categorize(rec.action);
          const key = cat === 'duplicate' ? extractDupeKey(rec.action)
            : cat === 'filler_word' ? extractFillerKey(rec.action)
            : cat === 'char_limit' ? extractCharKey(rec.action)
            : rec.action.slice(0, 80);

          if (groups.has(key)) {
            const g = groups.get(key)!;
            g.count++;
            g.children.push({ id: rec.id, target: rec.target, metadata: rec.metadata });
          } else {
            groups.set(key, {
              id: rec.id,
              category: cat,
              action: rec.action,
              rationale: rec.rationale,
              metadata: rec.metadata,
              target: rec.target,
              createdAt: rec.createdAt,
              count: 1,
              children: [{ id: rec.id, target: rec.target, metadata: rec.metadata }],
            });
          }
        }
        // Sort: char_limit first (actionable), then filler, then duplicates
        const order: Record<string, number> = { char_limit: 0, filler_word: 1, duplicate: 2, suggestion: 3 };
        const sorted = Array.from(groups.values()).sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9));
        setFindings(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <SectionSkeleton title="Ad Copy Health" />;

  const categoryCounts = findings.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalRawCount = findings.reduce((s, f) => s + f.count, 0);
  const filtered = activeCategory === 'all' ? findings : findings.filter(f => f.category === activeCategory);

  const categoryInfo: { key: CopyCategory | 'all'; label: string; icon: any; color: string }[] = [
    { key: 'all', label: `All (${findings.length})`, icon: Type, color: 'text-[var(--text-secondary)]' },
    { key: 'char_limit', label: `Over Limit (${categoryCounts.char_limit || 0})`, icon: AlertCircle, color: 'text-red-400' },
    { key: 'filler_word', label: `Filler Words (${categoryCounts.filler_word || 0})`, icon: Sparkles, color: 'text-amber-400' },
    { key: 'duplicate', label: `Duplicates (${categoryCounts.duplicate || 0})`, icon: Copy, color: 'text-blue-400' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Type size={18} className="text-blue-400" />
          Ad Copy Health
          <span className="text-xs text-[var(--text-muted)] font-normal ml-2">{findings.length} unique issues across {totalRawCount} ads</span>
        </h2>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2">
        {categoryInfo.map(c => {
          const Icon = c.icon;
          const isActive = activeCategory === c.key;
          return (
            <button key={c.key} onClick={() => setActiveCategory(c.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                isActive ? 'bg-[var(--bg-primary)] border-[var(--accent)]/30 text-[var(--text-primary)]' : 'bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}>
              <Icon size={12} className={isActive ? c.color : ''} />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Findings */}
      {filtered.length > 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden divide-y divide-[var(--border-primary)]/30">
          {filtered.slice(0, 50).map((f) => (
            <CopyFindingRow key={f.id} finding={f} />
          ))}
          {filtered.length > 50 && (
            <div className="px-5 py-3 text-center text-xs text-[var(--text-muted)]">
              Showing 50 of {filtered.length} issues
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-8 text-center">
          <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2" />
          <p className="text-sm text-[var(--text-muted)]">No issues in this category</p>
        </div>
      )}
    </div>
  );
}

function categorize(action: string): CopyCategory {
  if (action.startsWith('Fix char')) return 'char_limit';
  if (action.startsWith('Remove filler')) return 'filler_word';
  if (action.startsWith('Deduplicate')) return 'duplicate';
  return 'suggestion';
}
function extractDupeKey(action: string) {
  const m = action.match(/"([^"]+)"/);
  return m ? `dupe:${m[1].toLowerCase()}` : action;
}
function extractFillerKey(action: string) {
  const m = action.match(/"(\w+)"/);
  return m ? `filler:${m[1].toLowerCase()}` : action;
}
function extractCharKey(action: string) {
  const m = action.match(/"([^"]+)"/);
  return m ? `char:${m[1].toLowerCase()}` : action;
}

function CopyFindingRow({ finding }: { finding: CopyFinding }) {
  const [expanded, setExpanded] = useState(false);
  const m = finding.metadata || {};

  const icon = finding.category === 'char_limit' ? <AlertCircle size={14} className="text-red-400 shrink-0" />
    : finding.category === 'filler_word' ? <Sparkles size={14} className="text-amber-400 shrink-0" />
    : finding.category === 'duplicate' ? <Copy size={14} className="text-blue-400 shrink-0" />
    : <Type size={14} className="text-[var(--text-muted)] shrink-0" />;

  // Extract display text
  let displayText = '';
  let detail = '';
  if (finding.category === 'char_limit' && m.text) {
    displayText = `"${m.text}"`;
    detail = `${m.length}/${m.limit} chars (${m.field || ''})`;
  } else if (finding.category === 'filler_word') {
    const word = finding.action.match(/"(\w+)"/)?.[1] || '';
    displayText = `Filler word: "${word}"`;
    detail = `Found in ${finding.count} ad${finding.count > 1 ? 's' : ''}`;
  } else if (finding.category === 'duplicate') {
    const headline = finding.action.match(/"([^"]+)"/)?.[1] || '';
    displayText = `"${headline}"`;
    const groupMatch = finding.action.match(/found in (\d+ ad group)/);
    detail = groupMatch ? `Shared across ${groupMatch[1]}s · ${finding.count} ads` : `${finding.count} ads`;
  } else {
    displayText = finding.action.slice(0, 100);
  }

  return (
    <div>
      <div className="px-5 py-3.5 flex items-center gap-3 hover:bg-[var(--bg-primary)]/50 transition-colors cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {finding.count > 1 ? (
          <button className="text-[var(--text-muted)]">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        ) : <div className="w-[14px]" />}
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--text-primary)] truncate">{displayText}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{detail}</p>
        </div>
        {finding.count > 1 && (
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-muted)] shrink-0">
            {finding.count} ads
          </span>
        )}
      </div>
      {expanded && finding.count > 1 && (
        <div className="px-5 pb-3 pl-16">
          <div className="space-y-1.5">
            {finding.children.slice(0, 10).map((c, i) => (
              <div key={c.id} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <Hash size={10} className="shrink-0" />
                <span className="truncate">{c.target}</span>
              </div>
            ))}
            {finding.children.length > 10 && (
              <p className="text-xs text-[var(--text-muted)]">+ {finding.children.length - 10} more</p>
            )}
          </div>
          {finding.rationale && (
            <div className="mt-3 bg-[var(--bg-primary)] rounded-lg px-4 py-3">
              <p className="text-xs text-[var(--text-secondary)]">{finding.rationale}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SECTION C: AGENT CARDS
   ═══════════════════════════════════════════════════════ */

function AgentSummaryCards({ agents }: { agents: any[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {agents.map((agent) => {
        const dotColor = agent.status === 'done' ? 'bg-emerald-400' : agent.status === 'running' ? 'bg-blue-400' : agent.status === 'failed' ? 'bg-red-400' : 'bg-gray-600';
        const statusColor = agent.status === 'done' ? 'text-emerald-400' : agent.status === 'running' ? 'text-blue-400' : agent.status === 'failed' ? 'text-red-400' : 'text-[var(--text-muted)]';
        const statusLabel = agent.status === 'done' ? 'Last run OK' : agent.status === 'running' ? 'Running...' : agent.status === 'failed' ? 'Last run failed' : 'No runs';
        return (
          <div key={agent.slug} className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                <Bot size={16} className="text-[var(--accent)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{agent.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${agent.status === 'running' ? 'animate-pulse' : ''}`} />
                  <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>{agent.totalRuns ?? 0} runs{agent.recentRuns > 0 ? ` · ${agent.recentRuns} this week` : ''}</span>
              {agent.lastRun && <span>{new Date(agent.lastRun).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>}
            </div>
            {agent.lastRunSummary && (
              <p className="text-[10px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">{agent.lastRunSummary}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SECTION D: ACTIVITY LOG
   ═══════════════════════════════════════════════════════ */

function ActivityLog() {
  const [agents, setAgents] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filterAgent, setFilterAgent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [reportContent, setReportContent] = useState<string | null>(null);

  // Load agent slugs for dynamic filter dropdown
  useEffect(() => {
    fetch('/api/agents/status')
      .then(r => r.json())
      .then(data => {
        const a = data.agents || [];
        setAgents(a.filter((ag: any) => ag.totalRuns > 0));
      })
      .catch(() => {});
  }, []);

  const loadRuns = useCallback((reset = false) => {
    const p = reset ? 1 : page;
    const params = new URLSearchParams({ limit: '25', offset: String((p - 1) * 25) });
    if (filterAgent) params.set('agent', filterAgent);
    if (filterStatus) params.set('status', filterStatus);
    if (showAll) params.set('all', 'true');

    fetch(`/api/agents/activity?${params}`)
      .then(r => r.json())
      .then(data => {
        const newRuns = data.runs || [];
        if (reset) setRuns(newRuns);
        else setRuns(prev => [...prev, ...newRuns]);
        setHasMore(newRuns.length === 25);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, filterAgent, filterStatus, showAll]);

  useEffect(() => { setPage(1); loadRuns(true); }, [filterAgent, filterStatus, showAll]);

  const loadDetail = async (runId: string) => {
    if (expandedRun === runId) { setExpandedRun(null); setRunDetail(null); setReportContent(null); return; }
    try {
      const res = await fetch(`/api/agents/activity?runId=${runId}`);
      const data = await res.json();
      setRunDetail(data.run);
      setExpandedRun(runId);
      setReportContent(null);
    } catch {}
  };

  const handleExport = async (runId: string, format: string) => {
    setExporting(`${runId}-${format}`);
    try {
      if (format === 'csv') {
        const res = await fetch('/api/agents/export', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, format: 'csv' }),
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `agent-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
      } else if (format === 'report') {
        const res = await fetch('/api/agents/export', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, format: 'report' }),
        });
        const data = await res.json();
        setReportContent(data.report);
      }
    } catch {}
    setExporting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Activity size={18} className="text-[var(--accent)]" />
          Activity Log
        </h2>
        <div className="flex items-center gap-3">
          <select value={filterAgent} onChange={e => { setFilterAgent(e.target.value); }}
            className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none">
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); }}
            className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none">
            <option value="">All Statuses</option>
            <option value="done">Done</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
          </select>
          <button onClick={() => setShowAll(!showAll)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showAll ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]' : 'bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-muted)]'
            }`}>
            {showAll ? <Eye size={12} /> : <EyeOff size={12} />}
            {showAll ? 'All runs' : 'Key only'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-[var(--text-muted)] text-sm animate-pulse p-4">Loading activity...</div>
      ) : runs.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-10 text-center text-[var(--text-muted)] text-sm">
          No agent activity yet.
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden divide-y divide-[var(--border-primary)]/30">
          {runs.map(run => (
            <RunRow key={run.id} run={run} expandedRun={expandedRun} onToggle={loadDetail}
              runDetail={expandedRun === run.id ? runDetail : null}
              reportContent={expandedRun === run.id ? reportContent : null}
              exporting={exporting} onExport={handleExport} />
          ))}
        </div>
      )}

      {hasMore && runs.length > 0 && (
        <div className="text-center">
          <button onClick={() => { setPage(p => p + 1); loadRuns(); }}
            className="px-5 py-2.5 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent)] text-[var(--text-secondary)] rounded-lg text-sm font-medium transition-colors">
            Load More
          </button>
        </div>
      )}
    </div>
  );
}

function RunRow({ run, expandedRun, onToggle, runDetail, reportContent, exporting, onExport }: {
  run: any; expandedRun: string | null; onToggle: (id: string) => void; runDetail: any;
  reportContent: string | null; exporting: string | null; onExport: (id: string, format: string) => void;
}) {
  const s = statusColors[run.status] || statusColors.done;
  const Icon = s?.icon || CheckCircle2;
  const isExpanded = expandedRun === run.id;

  return (
    <div>
      <div className="px-5 py-4 hover:bg-[var(--bg-primary)]/50 transition-colors cursor-pointer flex items-center gap-4" onClick={() => onToggle(run.id)}>
        {isExpanded ? <ChevronDown size={14} className="text-[var(--text-muted)]" /> : <ChevronRight size={14} className="text-[var(--text-muted)]" />}
        <Icon size={14} className={`${s.text} shrink-0 ${run.status === 'running' ? 'animate-spin' : ''}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--text-primary)]">{run.agentName}</span>
            {run.autonomous && <span className="text-xs px-2 py-0.5 rounded bg-violet-900/30 text-violet-400">auto</span>}
          </div>
          <p className="text-xs text-[var(--text-muted)] truncate mt-1">{run.task}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-xs text-[var(--text-muted)]">
          {(run.findingsCount > 0 || run.recsCount > 0) && <span>{run.findingsCount}f / {run.recsCount}r</span>}
          <span>{run.completedAt ? timeAgo(run.completedAt) : 'running...'}</span>
        </div>
      </div>
      {isExpanded && runDetail && (
        <div className="px-5 py-5 bg-[var(--bg-primary)]/50 border-t border-[var(--border-primary)]/30 space-y-4 ml-8 mr-4">
          {runDetail.output?.summary && <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{runDetail.output.summary}</p>}
          {runDetail.output?.findings?.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Findings ({runDetail.output.findings.length})</span>
              {runDetail.output.findings.slice(0, 5).map((f: any, i: number) => (
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
          {reportContent && (
            <div className="bg-[var(--bg-card)] rounded-lg p-4 border border-[var(--border-primary)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Report</span>
                <button onClick={() => navigator.clipboard.writeText(reportContent)} className="text-xs text-[var(--accent)] hover:underline">Copy</button>
              </div>
              <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">{reportContent}</div>
            </div>
          )}
          <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-primary)]/30">
            <button onClick={e => { e.stopPropagation(); onExport(run.id, 'csv'); }} disabled={exporting === `${run.id}-csv`}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent)] text-[var(--text-secondary)] rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
              <Download size={12} /> {exporting === `${run.id}-csv` ? 'Exporting...' : 'Export CSV'}
            </button>
            <button onClick={e => { e.stopPropagation(); onExport(run.id, 'report'); }} disabled={exporting === `${run.id}-report`}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent)] text-[var(--text-secondary)] rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
              <FileText size={12} /> {exporting === `${run.id}-report` ? 'Generating...' : 'Report'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SKELETON
   ═══════════════════════════════════════════════════════ */

function SectionSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-8 animate-pulse">
        <div className="h-4 bg-[var(--bg-primary)] rounded w-1/3 mb-3" />
        <div className="h-3 bg-[var(--bg-primary)] rounded w-2/3" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/agents/status')
      .then(r => r.json())
      .then(data => setAgents(data.agents || []))
      .catch(() => {});
  }, []);

  return (
    <div className="p-6 space-y-10 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Agents</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Monitor autonomous agents, review actions, track ad copy health</p>
      </div>

      {/* Agent Cards */}
      {agents.length > 0 && <AgentSummaryCards agents={agents} />}

      {/* Agent Guardrails */}
      <AgentGuardrailsSection />

      {/* Negative Keywords — actionable approve/reject */}
      <NegativeKeywordsSection />

      {/* Activity Log */}
      <ActivityLog />
    </div>
  );
}
