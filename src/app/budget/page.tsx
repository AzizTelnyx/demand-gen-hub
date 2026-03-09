'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DollarSign, TrendingUp, BarChart3, PieChart as PieIcon,
  Filter, ArrowUpRight, ArrowDownRight, Minus,
  Globe, Layers, Target, Package, Zap, Users, RefreshCw, AlertCircle,
} from 'lucide-react';
import PlatformIcon from "@/components/PlatformIcon";
import DateRangePicker, { DateRange } from '@/components/DateRangePicker';

interface BudgetData {
  dateFrom: string;
  dateTo: string;
  daysInRange: number;
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    dailyRate: number;
    ctr: number;
    cpc: number;
    cpa: number;
    campaignCount: number;
  };
  pacing: {
    totalPlanned: number;
    totalSpend: number;
    utilization: number;
    dailyRate: number;
    projectedMonthly: number;
  };
  byPlatform: GroupedItem[];
  byProduct: GroupedItem[];
  byFunnel: GroupedItem[];
  byRegion: GroupedItem[];
  topCampaigns: CampaignItem[];
  budgetPlans: any[];
  recentChanges: any[];
}

interface GroupedItem {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  count: number;
}

interface CampaignItem {
  name: string;
  campaignId: string;
  platform: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  avgCpc: number;
}

type Dimension = 'platform' | 'funnel' | 'product' | 'region';

const dimensionConfig: Record<Dimension, { label: string; icon: any; dataKey: keyof Pick<BudgetData, 'byPlatform' | 'byFunnel' | 'byProduct' | 'byRegion'> }> = {
  platform: { label: 'Platform', icon: Zap, dataKey: 'byPlatform' },
  funnel: { label: 'Funnel Stage', icon: Layers, dataKey: 'byFunnel' },
  product: { label: 'Product', icon: Package, dataKey: 'byProduct' },
  region: { label: 'Region', icon: Globe, dataKey: 'byRegion' },
};

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#a855f7', '#d946ef',
];

function formatMoney(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}

const PLATFORMS = ['google_ads', 'linkedin', 'stackadapt', 'reddit'] as const;
const PLATFORM_LABELS: Record<string, string> = { google_ads: 'Google Ads', linkedin: 'LinkedIn', stackadapt: 'StackAdapt', reddit: 'Reddit' };

function PacingSection({ pacing, data, dateRange, onRefresh }: { pacing: BudgetData['pacing']; data: BudgetData; dateRange: DateRange; onRefresh: () => void }) {
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Record<string, string>>({});

  // Derive current month from date range
  const fromDate = new Date(dateRange.from);
  const month = fromDate.getMonth() + 1;
  const year = fromDate.getFullYear();

  // Load existing plans into form
  useEffect(() => {
    const p: Record<string, string> = {};
    for (const bp of data.budgetPlans || []) {
      p[bp.channel] = String(bp.planned);
    }
    setPlans(p);
  }, [data.budgetPlans]);

  const savePlans = async () => {
    setSaving(true);
    try {
      for (const platform of PLATFORMS) {
        const val = parseFloat(plans[platform] || '0');
        if (val > 0) {
          await fetch('/api/budget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, month, channel: platform, planned: val }),
          });
        }
      }
      setShowPlanEditor(false);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const totalPlanned = pacing.totalPlanned;
  const hasPlan = totalPlanned > 0;

  // Per-platform pacing from data
  const platformPacing = (data.byPlatform || []).map(p => {
    const plan = (data.budgetPlans || []).find((bp: any) => bp.channel === (p as any).platform);
    const planned = plan?.planned || 0;
    return {
      name: (p as any).platform || p.name,
      label: PLATFORM_LABELS[(p as any).platform || p.name] || p.name,
      spend: p.spend,
      planned,
      pct: planned > 0 ? (p.spend / planned) * 100 : 0,
    };
  });

  // Projected end-of-month
  const today = new Date();
  const daysLeft = Math.max(1, new Date(year, month, 0).getDate() - today.getDate() + 1);
  const projectedTotal = pacing.totalSpend + pacing.dailyRate * daysLeft;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[var(--accent)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Budget Pacing</h3>
        </div>
        <div className="flex items-center gap-2">
          {hasPlan && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              pacing.utilization > 110 ? 'severity-critical' :
              pacing.utilization > 90 ? 'status-done' :
              pacing.utilization > 70 ? 'severity-high' :
              'severity-medium'
            }`}>
              {pacing.utilization.toFixed(1)}% of plan
            </span>
          )}
          <button onClick={() => setShowPlanEditor(!showPlanEditor)}
            className="text-[10px] px-2 py-1 rounded-lg border border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent-border)] transition-colors">
            {hasPlan ? 'Edit Plan' : '+ Set Budget Plan'}
          </button>
        </div>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--bg-primary)] rounded-lg p-3">
          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Spent</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">{formatMoney(pacing.totalSpend)}</p>
        </div>
        <div className="bg-[var(--bg-primary)] rounded-lg p-3">
          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Daily Rate</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">{formatMoney(pacing.dailyRate)}/d</p>
        </div>
        <div className="bg-[var(--bg-primary)] rounded-lg p-3">
          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">EOM Projection</p>
          <p className={`text-lg font-bold ${hasPlan && projectedTotal > totalPlanned * 1.05 ? 'text-accent-red' : 'text-[var(--text-primary)]'}`}>
            {formatMoney(projectedTotal)}
          </p>
        </div>
        <div className="bg-[var(--bg-primary)] rounded-lg p-3">
          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{hasPlan ? 'Budget Plan' : 'Days Left'}</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">{hasPlan ? formatMoney(totalPlanned) : daysLeft}</p>
        </div>
      </div>

      {/* Overall pacing bar */}
      {hasPlan && (
        <div>
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1">
            <span>{formatMoney(pacing.totalSpend)} spent</span>
            <span>{formatMoney(totalPlanned)} planned</span>
          </div>
          <div className="w-full bg-[var(--bg-primary)] rounded-full h-3">
            <div className="h-3 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(pacing.utilization, 100)}%`,
                backgroundColor: pacing.utilization > 110 ? 'var(--text-accent-red, #ef4444)' : pacing.utilization > 90 ? '#22c55e' : '#eab308',
              }} />
          </div>
        </div>
      )}

      {/* Per-platform pacing bars */}
      {hasPlan && platformPacing.some(p => p.planned > 0) && (
        <div className="space-y-2 pt-2 border-t border-[var(--border-primary)]">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Platform Pacing</p>
          {platformPacing.filter(p => p.planned > 0).map(p => (
            <div key={p.name} className="flex items-center gap-3">
              <span className="text-[11px] text-[var(--text-secondary)] w-20 shrink-0">{p.label}</span>
              <div className="flex-1 bg-[var(--bg-primary)] rounded-full h-2">
                <div className="h-2 rounded-full transition-all" style={{
                  width: `${Math.min(p.pct, 100)}%`,
                  backgroundColor: p.pct > 110 ? '#ef4444' : p.pct > 90 ? '#22c55e' : '#eab308',
                }} />
              </div>
              <span className="text-[10px] text-[var(--text-muted)] w-28 text-right">
                {formatMoney(p.spend)} / {formatMoney(p.planned)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Budget Plan Editor */}
      {showPlanEditor && (
        <div className="border-t border-[var(--border-primary)] pt-4 space-y-3">
          <p className="text-xs font-medium text-[var(--text-primary)]">Monthly Budget Plan — {year}/{String(month).padStart(2, '0')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PLATFORMS.map(p => (
              <div key={p}>
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{PLATFORM_LABELS[p]}</label>
                <div className="relative mt-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs">$</span>
                  <input type="number" value={plans[p] || ''} onChange={e => setPlans({ ...plans, [p]: e.target.value })}
                    placeholder="0" className="w-full pl-6 pr-3 py-2 text-sm bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={savePlans} disabled={saving}
              className="px-4 py-2 text-xs font-medium rounded-lg btn-accent-emerald transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Plan'}
            </button>
            <button onClick={() => setShowPlanEditor(false)} className="px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              Cancel
            </button>
            <span className="text-[10px] text-[var(--text-muted)] ml-2">
              Total: {formatMoney(PLATFORMS.reduce((s, p) => s + (parseFloat(plans[p] || '0') || 0), 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BudgetPage() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimension, setDimension] = useState<Dimension>('platform');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const now = new Date();
    const from = new Date(now); from.setDate(from.getDate() - 30);
    return { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0], label: 'Last 30 days' };
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to });
      if (platformFilter !== 'all') params.set('platform', platformFilter);
      const res = await fetch(`/api/budget?${params}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Failed to load budget data');
    } finally {
      setLoading(false);
    }
  }, [dateRange, platformFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const items = data[dimensionConfig[dimension].dataKey] || [];
    const totalSpend = items.reduce((s: number, g: GroupedItem) => s + g.spend, 0);
    return items.map((g: GroupedItem) => ({
      ...g,
      pct: totalSpend > 0 ? (g.spend / totalSpend) * 100 : 0,
    }));
  }, [data, dimension]);

  if (loading && !data) {
    return (
      <div className="p-8 text-[var(--text-muted)] text-sm flex items-center gap-2">
        <RefreshCw size={14} className="animate-spin" />
        Loading live metrics from ad platforms...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-400 font-medium">Failed to load budget data</p>
            <p className="text-xs text-red-400/70 mt-1">{error}</p>
            <button onClick={fetchData} className="mt-2 px-3 py-1 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { totals, pacing, topCampaigns, recentChanges } = data;

  return (
    <div className="p-8 max-w-[1400px] space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">Budget & Spend</h1>
          <p className="text-[var(--text-muted)] text-sm mt-0.5">
            Live metrics · {dateRange.from} → {dateRange.to} ({data.daysInRange} days)
            {loading && <span className="ml-2 text-indigo-400 animate-pulse">Updating...</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg p-0.5">
            {([['all', 'All'], ['google_ads', 'Google'], ['linkedin', 'LinkedIn'], ['stackadapt', 'StackAdapt'], ['reddit', 'Reddit']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setPlatformFilter(val)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors ${platformFilter === val ? 'bg-indigo-600/20 text-indigo-400' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {[
          { label: 'Total Spend', value: formatMoney(totals.spend), sub: `${totals.campaignCount} campaigns` },
          { label: 'Daily Rate', value: formatMoney(totals.dailyRate), sub: `${formatMoney(pacing.projectedMonthly)}/mo proj.` },
          { label: 'Impressions', value: formatNum(totals.impressions), sub: '' },
          { label: 'Clicks', value: formatNum(totals.clicks), sub: `${totals.ctr.toFixed(2)}% CTR` },
          { label: 'Avg CPC', value: `$${totals.cpc.toFixed(2)}`, sub: '' },
          { label: 'Conversions', value: formatNum(totals.conversions), sub: totals.cpa > 0 ? `$${totals.cpa.toFixed(0)} CPA` : '' },
        ].map((card, i) => (
          <div key={i} className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-4">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{card.label}</p>
            <p className="text-xl font-semibold text-[var(--text-primary)] mt-1">{card.value}</p>
            {card.sub && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* Pacing Card — always show */}
      <PacingSection pacing={pacing} data={data} dateRange={dateRange} onRefresh={fetchData} />

      {/* Dimension Picker */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Break down by</span>
        {(Object.entries(dimensionConfig) as [Dimension, typeof dimensionConfig[Dimension]][]).map(([key, conf]) => {
          const Icon = conf.icon;
          return (
            <button key={key} onClick={() => setDimension(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                dimension === key ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/40' : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-primary)] hover:text-[var(--text-secondary)]'
              }`}>
              <Icon size={12} />
              {conf.label}
            </button>
          );
        })}
      </div>

      {/* Allocation Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-4">Spend by {dimensionConfig[dimension].label}</h3>
          {grouped.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-8 text-center">No data for this date range</p>
          ) : (
            <div className="space-y-3">
              {grouped.map((g, i) => (
                <div key={g.name} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm text-[var(--text-secondary)]">{g.name}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{g.count} campaigns</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{formatMoney(g.spend)}</span>
                      <span className="text-[10px] text-[var(--text-muted)] w-10 text-right">{g.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-[var(--bg-primary)] rounded-full h-2">
                    <div className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${g.pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                  </div>
                  <div className="hidden group-hover:flex items-center gap-4 mt-1 text-[10px] text-[var(--text-muted)]">
                    <span>{formatNum(g.impressions)} impr</span>
                    <span>{formatNum(g.clicks)} clicks</span>
                    <span>{g.impressions > 0 ? ((g.clicks / g.impressions) * 100).toFixed(2) : '0'}% CTR</span>
                    <span>{g.clicks > 0 ? `$${(g.spend / g.clicks).toFixed(2)} CPC` : ''}</span>
                    <span>{formatNum(g.conversions)} conv</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-4">Share of Spend</h3>
          {grouped.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-8 text-center">No data</p>
          ) : (
            <>
              <div className="space-y-2">
                {grouped.map((g, i) => (
                  <div key={g.name} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">{g.name}</span>
                    <span className="text-xs font-medium text-[var(--text-primary)]">{g.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <div className="flex h-6 rounded-lg overflow-hidden mt-4">
                {grouped.map((g, i) => (
                  <div key={g.name} className="h-full transition-all" title={`${g.name}: ${formatMoney(g.spend)}`}
                    style={{ width: `${g.pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top Campaigns Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-primary)]">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Top Campaigns by Spend</h3>
        </div>
        {topCampaigns.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-8 text-center">No campaign data for this date range</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">Campaign</th>
                  <th className="text-left px-3 py-3 font-medium">Platform</th>
                  <th className="text-right px-3 py-3 font-medium">Spend</th>
                  <th className="text-right px-3 py-3 font-medium">Impressions</th>
                  <th className="text-right px-3 py-3 font-medium">Clicks</th>
                  <th className="text-right px-3 py-3 font-medium">CTR</th>
                  <th className="text-right px-3 py-3 font-medium">CPC</th>
                  <th className="text-right px-5 py-3 font-medium">Conv</th>
                </tr>
              </thead>
              <tbody>
                {topCampaigns.map((c, i) => (
                  <tr key={`${c.campaignId}-${i}`} className="border-t border-[var(--border-primary)]/30 hover:bg-[var(--bg-primary)]/50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-[var(--text-secondary)] text-xs">{c.name}</span>
                    </td>
                    <td className="px-3 py-3">
                      <PlatformIcon platform={c.platform} size={14} showLabel />
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-primary)] font-medium">{formatMoney(c.spend)}</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">{formatNum(c.impressions)}</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">{formatNum(c.clicks)}</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">{c.ctr.toFixed(2)}%</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">${c.avgCpc.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right text-xs text-[var(--text-secondary)]">{formatNum(c.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Budget Changes */}
      {recentChanges.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-primary)]">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Budget Changes in Period</h3>
          </div>
          <div className="divide-y divide-[var(--border-primary)]/30">
            {recentChanges.map((ch: any) => (
              <div key={ch.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">{ch.description}</p>
                  {ch.reason && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{ch.reason}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${ch.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {ch.amount > 0 ? '+' : ''}{formatMoney(ch.amount)}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    ch.status === 'applied' ? 'bg-green-500/20 text-green-400' :
                    ch.status === 'proposed' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>{ch.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
