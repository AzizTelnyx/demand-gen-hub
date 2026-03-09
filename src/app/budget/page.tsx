'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  DollarSign, TrendingUp, BarChart3, PieChart as PieIcon,
  Filter, ArrowUpRight, ArrowDownRight, Minus,
  Globe, Layers, Target, Package, Zap, Users,
} from 'lucide-react';
import { parseCampaignName } from '@/lib/parseCampaignName';
import PlatformIcon from "@/components/PlatformIcon";
import DateRangePicker, { DateRange, getDefaultRange } from '@/components/DateRangePicker';

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  channel: string | null;
  budget: number | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}

interface ParsedCampaign extends Campaign {
  funnel: string | null;
  product: string | null;
  region: string | null;
  adChannel: string | null;
}

type Dimension = 'platform' | 'funnel' | 'product' | 'region' | 'channel';

const dimensionConfig: Record<Dimension, { label: string; icon: any }> = {
  platform: { label: 'Platform', icon: Zap },
  funnel: { label: 'Funnel Stage', icon: Layers },
  product: { label: 'Product', icon: Package },
  region: { label: 'Region', icon: Globe },
  channel: { label: 'Ad Channel', icon: Target },
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

export default function BudgetPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dimension, setDimension] = useState<Dimension>('platform');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'google_ads' | 'stackadapt' | 'linkedin' | 'reddit'>('all');
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const now = new Date();
    const from = new Date(now); from.setDate(from.getDate() - 30);
    return { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0], label: 'Last 30 days' };
  });

  useEffect(() => {
    fetch('/api/campaigns')
      .then(r => r.json())
      .then(data => {
        setCampaigns(data.campaigns || data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const parsed: ParsedCampaign[] = useMemo(() => {
    return campaigns
      .filter(c => ['enabled', 'live', 'active'].includes(c.status?.toLowerCase()))
      .filter(c => platformFilter === 'all' || c.platform === platformFilter)
      .map(c => {
        const p = parseCampaignName(c.name);
        return {
          ...c,
          funnel: p.funnelStage || 'Other',
          product: p.product || 'Other',
          region: p.region || 'Other',
          adChannel: p.channel || c.channel || 'Other',
        };
      });
  }, [campaigns, platformFilter]);

  // Totals
  const totals = useMemo(() => {
    const spend = parsed.reduce((s, c) => s + (c.spend || 0), 0);
    const budget = parsed.reduce((s, c) => s + (c.budget || 0), 0);
    const impressions = parsed.reduce((s, c) => s + (c.impressions || 0), 0);
    const clicks = parsed.reduce((s, c) => s + (c.clicks || 0), 0);
    const conversions = parsed.reduce((s, c) => s + (c.conversions || 0), 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpa = conversions > 0 ? spend / conversions : 0;
    return { spend, budget, impressions, clicks, conversions, ctr, cpc, cpa, count: parsed.length };
  }, [parsed]);

  // Group by dimension
  const grouped = useMemo(() => {
    const groups: Record<string, { spend: number; budget: number; impressions: number; clicks: number; conversions: number; count: number }> = {};
    parsed.forEach(c => {
      const key = dimension === 'platform' ? (c.platform === 'google_ads' ? 'Google Ads' : c.platform === 'stackadapt' ? 'StackAdapt' : c.platform === 'linkedin' ? 'LinkedIn' : c.platform === 'reddit' ? 'Reddit' : c.platform)
        : dimension === 'funnel' ? (c.funnel || 'Other')
        : dimension === 'product' ? (c.product || 'Other')
        : dimension === 'region' ? (c.region || 'Other')
        : (c.adChannel || 'Other');

      if (!groups[key]) groups[key] = { spend: 0, budget: 0, impressions: 0, clicks: 0, conversions: 0, count: 0 };
      groups[key].spend += c.spend || 0;
      groups[key].budget += c.budget || 0;
      groups[key].impressions += c.impressions || 0;
      groups[key].clicks += c.clicks || 0;
      groups[key].conversions += c.conversions || 0;
      groups[key].count += 1;
    });
    return Object.entries(groups)
      .map(([name, data]) => ({ name, ...data, pct: totals.spend > 0 ? (data.spend / totals.spend) * 100 : 0 }))
      .sort((a, b) => b.spend - a.spend);
  }, [parsed, dimension, totals]);

  // Top campaigns by spend
  const topCampaigns = useMemo(() => {
    return [...parsed].sort((a, b) => (b.spend || 0) - (a.spend || 0)).slice(0, 15);
  }, [parsed]);

  if (loading) return <div className="p-8 text-[var(--text-muted)] text-sm animate-pulse">Loading budget data...</div>;

  return (
    <div className="p-8 max-w-[1400px] space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">Budget & Spend</h1>
          <p className="text-[var(--text-muted)] text-sm mt-0.5">Where the money goes — 30-day rolling window from campaign sync</p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg p-0.5">
            {([['all', 'All Platforms'], ['google_ads', 'Google Ads'], ['linkedin', 'LinkedIn'], ['stackadapt', 'StackAdapt'], ['reddit', 'Reddit']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setPlatformFilter(val as any)}
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
          { label: '30d Spend', value: formatMoney(totals.spend), sub: `${totals.count} campaigns` },
          { label: 'Daily Budget', value: formatMoney(totals.budget), sub: `${formatMoney(totals.budget * 30)}/mo est.` },
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

      {/* Dimension Picker */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Break down by</span>
        {(Object.entries(dimensionConfig) as [Dimension, { label: string; icon: any }][]).map(([key, conf]) => {
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
        {/* Bar breakdown */}
        <div className="xl:col-span-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-4">Spend by {dimensionConfig[dimension].label}</h3>
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
                {/* Detail row on hover */}
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
        </div>

        {/* Split visual */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-4">Share of Spend</h3>
          {/* Simple visual pie-like representation */}
          <div className="space-y-2">
            {grouped.map((g, i) => (
              <div key={g.name} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">{g.name}</span>
                <span className="text-xs font-medium text-[var(--text-primary)]">{g.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          {/* Stacked bar */}
          <div className="flex h-6 rounded-lg overflow-hidden mt-4">
            {grouped.map((g, i) => (
              <div key={g.name} className="h-full transition-all" title={`${g.name}: ${formatMoney(g.spend)}`}
                style={{ width: `${g.pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
            ))}
          </div>
        </div>
      </div>

      {/* Top Campaigns Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-primary)]">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Top Campaigns by Spend</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">Campaign</th>
                <th className="text-left px-3 py-3 font-medium">Platform</th>
                <th className="text-left px-3 py-3 font-medium">Funnel</th>
                <th className="text-left px-3 py-3 font-medium">Product</th>
                <th className="text-right px-3 py-3 font-medium">30d Spend</th>
                <th className="text-right px-3 py-3 font-medium">Daily Budget</th>
                <th className="text-right px-3 py-3 font-medium">Impressions</th>
                <th className="text-right px-3 py-3 font-medium">Clicks</th>
                <th className="text-right px-3 py-3 font-medium">CTR</th>
                <th className="text-right px-5 py-3 font-medium">CPC</th>
              </tr>
            </thead>
            <tbody>
              {topCampaigns.map((c, i) => {
                const ctr = (c.impressions || 0) > 0 ? ((c.clicks || 0) / (c.impressions || 1)) * 100 : 0;
                const cpc = (c.clicks || 0) > 0 ? (c.spend || 0) / (c.clicks || 1) : 0;
                return (
                  <tr key={c.id} className="border-t border-[var(--border-primary)]/30 hover:bg-[var(--bg-primary)]/50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-[var(--text-secondary)] text-xs">{c.name}</span>
                    </td>
                    <td className="px-3 py-3">
                      <PlatformIcon platform={c.platform} size={14} showLabel />
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-[10px] text-[var(--text-muted)]">{c.funnel}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-[10px] text-[var(--text-muted)]">{c.product}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-primary)] font-medium">{formatMoney(c.spend || 0)}</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">{formatMoney(c.budget || 0)}</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">{formatNum(c.impressions || 0)}</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">{formatNum(c.clicks || 0)}</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">{ctr.toFixed(2)}%</td>
                    <td className="px-5 py-3 text-right text-xs text-[var(--text-secondary)]">${cpc.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
