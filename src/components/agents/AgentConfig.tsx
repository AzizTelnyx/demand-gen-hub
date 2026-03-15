'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, DollarSign, ShieldCheck, Activity, Hash, AlertTriangle,
} from 'lucide-react';
import { Toast } from '@/components/agents/AgentFleet';

/* ── Types ── */

export type GuardrailTab = string;

interface Guardrail { id: string; key: string; value: string; label: string; category: string; }
interface RegPriority { id: string; quarter: string; region: string; product: string; priority: string; protected: boolean; }
interface Allocation { platform: string; planned: number; actual: number; notes: string; }

/* ── Constants ── */

const REGIONS = ['GLOBAL', 'AMER', 'EMEA', 'APAC', 'MENA'];
const PRODUCTS = ['AI Agent', 'Voice API', 'SIP', 'SMS', 'Numbers', 'IoT SIM'];
const QUARTERS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'];
const PRIORITY_COLORS: Record<string, string> = {
  high: 'prio-high', medium: 'prio-medium', low: 'prio-low', none: 'prio-none',
};
const PLATFORMS = ['google_ads', 'linkedin', 'stackadapt', 'reddit'];
const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads', linkedin: 'LinkedIn', stackadapt: 'StackAdapt', reddit: 'Reddit',
};

const BASE_TABS: { key: string; label: string; icon: any }[] = [
  { key: 'budget', label: 'Budget Rules', icon: DollarSign },
  { key: 'campaigns', label: 'Campaign Rules', icon: ShieldCheck },
  { key: 'regional', label: 'Regional Priorities', icon: Activity },
  { key: 'allocation', label: 'Platform Budgets', icon: Hash },
];

const CATEGORY_ICONS: Record<string, any> = {
  budget: DollarSign, campaigns: ShieldCheck, regional: Activity, allocation: Hash,
  creative: Shield, confidence: Activity,
};

const CATEGORY_LABELS: Record<string, string> = {
  budget: 'Budget Rules', campaigns: 'Campaign Rules', regional: 'Regional Priorities',
  allocation: 'Platform Budgets', creative: 'Creative Rules', confidence: 'Confidence',
};

export function buildGuardrailTabs(guardrails: Guardrail[]): { key: string; label: string; icon: any }[] {
  const baseKeys = new Set(BASE_TABS.map(t => t.key));
  const extraCategories = [...new Set(guardrails.map(g => g.category))].filter(c => !baseKeys.has(c));
  const extraTabs = extraCategories.map(c => ({
    key: c,
    label: CATEGORY_LABELS[c] || (c.charAt(0).toUpperCase() + c.slice(1)),
    icon: CATEGORY_ICONS[c] || Shield,
  }));
  return [...BASE_TABS, ...extraTabs];
}

export const GUARDRAIL_TABS = BASE_TABS;

/* ── Sub-components ── */

export function GuardrailNumberField({ label, desc, suffix, gKey, value, saving, onSave }: {
  label: string; desc?: string; suffix: string; gKey: string; value: string; saving: string | null; onSave: (key: string, value: string) => void;
}) {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => { setLocalVal(value); }, [value]);
  const changed = localVal !== value;
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
          {desc && <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{desc}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {suffix === '$' && <span className="text-xs text-[var(--text-muted)]">$</span>}
          <input type="number" value={localVal} onChange={e => setLocalVal(e.target.value)}
            className="w-20 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]" />
          {suffix !== '$' && <span className="text-xs text-[var(--text-muted)]">{suffix}</span>}
          <button onClick={() => onSave(gKey, localVal)} disabled={!changed || saving === gKey}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${changed ? 'btn-accent-violet' : 'bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-muted)] opacity-50 cursor-default'}`}>
            {saving === gKey ? '...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GuardrailToggleField({ label, desc, gKey, value, saving, onSave }: {
  label: string; desc?: string; gKey: string; value: boolean; saving: string | null; onSave: (key: string, value: boolean) => void;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
          {desc && <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{desc}</p>}
        </div>
        <button onClick={() => onSave(gKey, !value)} disabled={saving === gKey}
          className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${value ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>
    </div>
  );
}

/* ── AllocationTab ── */

export function AllocationTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [allocations, setAllocations] = useState<Allocation[]>(
    PLATFORMS.map(p => ({ platform: p, planned: 0, actual: 0, notes: '' }))
  );
  const [cap, setCap] = useState(140000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadAllocations = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/budget-allocations?year=${y}&month=${m}`);
      const data = await res.json();
      setCap(data.cap || 140000);
      const loaded = PLATFORMS.map(p => {
        const found = data.allocations?.find((a: Allocation) => a.platform === p);
        return { platform: p, planned: found?.planned || 0, actual: found?.actual || 0, notes: found?.notes || '' };
      });
      setAllocations(loaded);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadAllocations(year, month); }, [year, month, loadAllocations]);

  const totalPlanned = allocations.reduce((s, a) => s + a.planned, 0);
  const totalActual = allocations.reduce((s, a) => s + a.actual, 0);
  const mismatch = Math.abs(totalPlanned - cap) > 1;

  const updateAlloc = (platform: string, field: 'planned' | 'notes', value: string | number) => {
    setAllocations(prev => prev.map(a => a.platform === platform ? { ...a, [field]: value } : a));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget-allocations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations: allocations.map(a => ({ platform: a.platform, year, month, planned: a.planned, notes: a.notes })) }),
      });
      const data = await res.json();
      if (!res.ok) setToast({ message: data.error || 'Failed to save', type: 'error' });
      else setToast({ message: 'Allocations saved', type: 'success' });
    } catch { setToast({ message: 'Failed to save', type: 'error' }); }
    setSaving(false);
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="space-y-3">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)] px-1">Set per-platform budget targets for each month.</p>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
            className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none">
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--text-muted)] animate-pulse p-4">Loading allocations...</div>
      ) : (
        <>
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-primary)]/30">
                  <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">Platform</th>
                  <th className="px-4 py-3 text-right text-[var(--text-muted)] font-medium">Planned</th>
                  <th className="px-4 py-3 text-right text-[var(--text-muted)] font-medium">Actual MTD</th>
                  <th className="px-4 py-3 text-right text-[var(--text-muted)] font-medium">Variance</th>
                  <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map(a => {
                  const variance = a.planned > 0 ? ((a.actual - a.planned) / a.planned) * 100 : 0;
                  const varColor = variance > 5 ? 'text-red-400' : variance < -5 ? 'text-amber-400' : 'text-green-400';
                  return (
                    <tr key={a.platform} className="border-b border-[var(--border-primary)]/20 last:border-0">
                      <td className="px-4 py-3 text-sm font-medium text-[var(--text-primary)]">{PLATFORM_LABELS[a.platform] || a.platform}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-[var(--text-muted)]">$</span>
                          <input type="number" value={a.planned} onChange={e => updateAlloc(a.platform, 'planned', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--accent)]" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-[var(--text-secondary)]">${a.actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className={`px-4 py-3 text-right text-sm font-medium ${varColor}`}>
                        {a.planned > 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <input type="text" value={a.notes} onChange={e => updateAlloc(a.platform, 'notes', e.target.value)} placeholder="Notes..."
                          className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]" />
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-[var(--bg-primary)]/50">
                  <td className="px-4 py-3 text-sm font-bold text-[var(--text-primary)]">Total</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-[var(--text-primary)]">${totalPlanned.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-[var(--text-secondary)]">${totalActual.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-[var(--text-muted)]">Cap: ${cap.toLocaleString()}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {mismatch && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-400">
              <AlertTriangle size={14} />
              Total planned (${totalPlanned.toLocaleString()}) doesn&apos;t match cap (${cap.toLocaleString()}). Remaining: ${(cap - totalPlanned).toLocaleString()}
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-medium btn-accent-violet disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Allocations'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Full Guardrails Panel (used on /agents/config page) ── */

function detectSuffix(label: string): string {
  if (label.includes('(%)') || label.includes('percent')) return '%';
  if (label.includes('($)') || label.includes('dollar')) return '$';
  if (label.includes('(days)') || label.toLowerCase().includes('days')) return 'days';
  return '';
}

function isBoolean(value: string): boolean {
  return value === 'true' || value === 'false';
}

export function GuardrailsPanel({ initialTab }: { initialTab?: GuardrailTab }) {
  const [tab, setTab] = useState<GuardrailTab>(initialTab || 'budget');
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [priorities, setPriorities] = useState<RegPriority[]>([]);
  const [quarter, setQuarter] = useState('2026-Q1');
  const [loading, setLoading] = useState(true);
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

  useEffect(() => { load(); }, [load]);

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
    <div className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {(() => { const tabs = buildGuardrailTabs(guardrails); return (
      <div className="flex items-center gap-1 p-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>); })()}

      {loading ? (
        <div className="text-sm text-[var(--text-muted)] animate-pulse p-4">Loading guardrails...</div>
      ) : tab === 'regional' ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)] px-1">Set which products to prioritize per region each quarter.</p>
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
                    <td className="px-3 py-3 text-[var(--text-primary)] font-semibold text-sm">{region}</td>
                    {PRODUCTS.map(product => {
                      const p = priorities.find(x => x.region === region && x.product === product);
                      const prio = p?.priority || 'none';
                      const isProtected = p?.protected || false;
                      const cycle = () => {
                        const order = ['none', 'low', 'medium', 'high'];
                        const next = order[(order.indexOf(prio) + 1) % order.length];
                        savePriority(region, product, 'priority', next);
                      };
                      const PRIO_LABELS: Record<string, string> = { high: 'HIGH', medium: 'MED', low: 'LOW', none: '' };
                      return (
                        <td key={product} className="px-1.5 py-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={cycle} title={`Click to cycle priority (current: ${prio})`}
                              className={`w-16 h-8 rounded-lg text-[11px] font-bold tracking-wide transition-all hover:scale-105 ${PRIORITY_COLORS[prio]}`}>
                              {PRIO_LABELS[prio] || '—'}
                            </button>
                            <button onClick={() => savePriority(region, product, 'protected', !isProtected)}
                              title={isProtected ? 'Protected' : 'Unprotected — click to lock'}
                              className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${isProtected ? 'prio-protected' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                              {isProtected ? '🔒' : '·'}
                            </button>
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
      ) : tab === 'allocation' ? (
        <AllocationTab />
      ) : (
        /* Dynamic guardrail category tab */
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)] px-1">
            {tab === 'budget' ? 'Controls how optimizer agents handle budget changes across campaigns.' :
             tab === 'campaigns' ? 'Controls how agents treat campaigns based on age, type, and confidence.' :
             `${(CATEGORY_LABELS[tab] || tab)} settings for agent behavior.`}
          </p>
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl divide-y divide-[var(--border-primary)]/30">
            {guardrails.filter(g => g.category === tab).map(g => {
              if (isBoolean(g.value)) {
                return <GuardrailToggleField key={g.key} label={g.label} gKey={g.key} value={g.value === 'true'} saving={saving} onSave={(k, v) => saveGuardrail(k, v ? 'true' : 'false')} />;
              }
              return <GuardrailNumberField key={g.key} label={g.label} suffix={detectSuffix(g.label)} gKey={g.key} value={g.value} saving={saving} onSave={saveGuardrail} />;
            })}
            {guardrails.filter(g => g.category === tab).length === 0 && (
              <div className="px-5 py-4 text-sm text-[var(--text-muted)]">No guardrails configured for this category.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
