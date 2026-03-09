'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, Trophy, XCircle, Eye, EyeOff,
  ArrowUpRight, ChevronDown, ChevronUp, Sparkles, MousePointer,
  Filter, X, Info, BarChart3, Layers,
} from 'lucide-react';
import DateRangePicker, { DateRange, getDefaultRange } from '@/components/DateRangePicker';

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        className="text-[var(--text-muted)] hover:text-[var(--text-tertiary)] transition ml-1">
        <Info size={13} />
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 shadow-xl text-xs text-gray-200 leading-relaxed">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 bg-gray-900 border-r border-b border-gray-700 rotate-45" />
        </div>
      )}
    </span>
  );
}

function fmt(n: number) { return n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(0)}`; }
function fmtNum(n: number) { return n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : n.toFixed(0); }

const stageOrder = ['1: Discovery & Scoping', 'Discovery', '2: Proposal and Quoting', '3: Testing and Negotiation', '4: Customer Ramp Up', 'Product Blocked'];
const stageColors: Record<string, string> = {
  '1: Discovery & Scoping': 'bg-blue-500', 'Discovery': 'bg-blue-500',
  '2: Proposal and Quoting': 'bg-indigo-500', '3: Testing and Negotiation': 'bg-violet-500',
  '4: Customer Ramp Up': 'bg-emerald-500', 'Product Blocked': 'bg-amber-500',
};
const platformLabels: Record<string, string> = { linkedin: 'LinkedIn', stackadapt: 'StackAdapt', reddit: 'Reddit' };
const platformColors: Record<string, string> = { linkedin: 'bg-sky-400', stackadapt: 'bg-violet-400', reddit: 'bg-orange-400' };

import PlatformIcon from "@/components/PlatformIcon";

type Filters = { platform: string | null; funnel: string | null; product: string | null; region: string | null };

function FilterPill({ label, active, onClick, onClear }: { label: string; active: boolean; onClick: () => void; onClear?: () => void }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
      active ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300' : 'bg-[var(--bg-secondary)] border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-secondary)]'
    }`}>
      {label}
      {active && onClear && <X size={12} className="ml-0.5 hover:text-white" onClick={e => { e.stopPropagation(); onClear(); }} />}
    </button>
  );
}

function FilterDropdown({ label, options, value, onChange }: { label: string; options: string[]; value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <FilterPill label={value || label} active={!!value} onClick={() => setOpen(!open)} onClear={value ? () => onChange(null) : undefined} />
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg shadow-xl py-1 min-w-[140px]">
          <button onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)] ${!value ? 'text-indigo-400 font-medium' : 'text-[var(--text-secondary)]'}`}>
            All
          </button>
          {options.map(o => (
            <button key={o} onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)] ${value === o ? 'text-indigo-400 font-medium' : 'text-[var(--text-secondary)]'}`}>
              {platformLabels[o] || o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PipelinePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [attribution, setAttribution] = useState<'impressions' | 'clicks'>('impressions');
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedDeal, setExpandedDeal] = useState<number | null>(null);
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange());
  const [filters, setFilters] = useState<Filters>({ platform: null, funnel: null, product: null, region: null });
  const [filterOptions, setFilterOptions] = useState<any>(null);
  const [breakdownView, setBreakdownView] = useState<'stage' | 'product' | 'funnel' | 'source'>('stage');

  const fetchData = useCallback((range: DateRange, attr?: string, f?: Filters, showSpinner?: boolean) => {
    if (showSpinner) setLoading(true);
    const a = attr || attribution;
    const ff = f || filters;
    const params = new URLSearchParams({ from: range.from, to: range.to, attribution: a });
    if (ff.platform) params.set('platform', ff.platform);
    if (ff.funnel) params.set('funnel', ff.funnel);
    if (ff.product) params.set('product', ff.product);
    if (ff.region) params.set('region', ff.region);
    fetch(`/api/pipeline?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setFilterOptions(d.filters); setLoading(false); })
      .catch(() => setLoading(false));
  }, [attribution, filters]);

  useEffect(() => { fetchData(dateRange, undefined, undefined, true); }, []);

  const handleDateChange = (range: DateRange) => { setDateRange(range); fetchData(range, undefined, undefined, true); };
  const handleAttrChange = (mode: 'impressions' | 'clicks') => { setAttribution(mode); fetchData(dateRange, mode, undefined, false); };
  const handleFilterChange = (key: keyof Filters, value: string | null) => {
    const newF = { ...filters, [key as string]: value };
    setFilters(newF as Filters);
    fetchData(dateRange, undefined, newF as Filters, false);
  };

  const activeFilterCount = [filters.platform, filters.funnel, filters.product, filters.region].filter(Boolean).length;

  if (loading && !data) return <div className="p-8 text-[var(--text-muted)] text-sm animate-pulse">Loading pipeline data...</div>;
  if (!data) return <div className="p-8 text-[var(--text-muted)]">Failed to load</div>;

  const { summary, stages, attribution: attrData, campaignInfluence, openExposedDeals } = data;
  const attr = attrData || { total: 0, exposed: { count: 0, pipeline: 0, avgDeal: 0, winRate: 0, wonCount: 0 }, unexposed: { count: 0, pipeline: 0, avgDeal: 0, winRate: 0, wonCount: 0 }, lift: { dealSizeLift: 0, winRateLift: 0 }, bySource: [], byStage: [], byProduct: [], byFunnel: [] };

  const sortedStages = [...stages].sort((a: any, b: any) => {
    const ai = stageOrder.indexOf(a.stage); const bi = stageOrder.indexOf(b.stage);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const totalPipeline = sortedStages.reduce((s: number, st: any) => s + st.amount, 0);

  return (
    <div className={`p-8 max-w-[1400px] space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
            Pipeline {loading && <span className="text-sm text-[var(--text-muted)] ml-2 font-normal">updating...</span>}
          </h1>
          <p className="text-[var(--text-tertiary)] text-sm mt-1">Ad attribution · 90-day lookback · {attr.total} deals</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <DateRangePicker value={dateRange} onChange={handleDateChange} />
          <div className="flex gap-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-0.5">
            <button onClick={() => handleAttrChange('impressions')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition flex items-center gap-1.5 ${attribution === 'impressions' ? 'bg-indigo-600/20 text-indigo-400' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <Eye size={11} />Impressions
            </button>
            <button onClick={() => handleAttrChange('clicks')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition flex items-center gap-1.5 ${attribution === 'clicks' ? 'bg-indigo-600/20 text-indigo-400' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <MousePointer size={11} />Clicks
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-[var(--text-muted)]" />
        <div className="w-px h-5 bg-[var(--border-primary)]" />
        {filterOptions && (
          <>
            <FilterDropdown label="Platform" options={filterOptions.platforms || []} value={filters.platform} onChange={v => handleFilterChange('platform', v)} />
            <FilterDropdown label="Funnel" options={filterOptions.funnels || []} value={filters.funnel} onChange={v => handleFilterChange('funnel', v)} />
            <FilterDropdown label="Product" options={filterOptions.products || []} value={filters.product} onChange={v => handleFilterChange('product', v)} />
            <FilterDropdown label="Region" options={filterOptions.regions || []} value={filters.region} onChange={v => handleFilterChange('region', v)} />
          </>
        )}
        {activeFilterCount > 0 && (
          <button onClick={() => { const empty = { platform: null, funnel: null, product: null, region: null }; setFilters(empty); fetchData(dateRange, undefined, empty, false); }}
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
            <X size={12} /> Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Open Pipeline', value: fmt(summary.openPipeline.amount), sub: `${summary.openPipeline.count} opps`, icon: DollarSign, color: 'text-indigo-400' },
          { label: 'Ad-Influenced', value: fmt(summary.adInfluencedPipeline?.amount || 0), sub: `${summary.adInfluencedPipeline?.count || 0} opps`, icon: Sparkles, color: 'text-amber-400' },
          { label: 'Won', value: fmt(summary.won?.amount || 0), sub: `${summary.won?.count || 0} deals`, icon: Trophy, color: 'text-emerald-400' },
          { label: 'Lost', value: fmt(summary.lost?.amount || 0), sub: `${summary.lost?.count || 0} deals`, icon: XCircle, color: 'text-red-400' },
          { label: 'Win Rate', value: `${(summary.winRate || 0).toFixed(1)}%`, sub: 'closed deals', icon: TrendingUp, color: 'text-cyan-400' },
        ].map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={15} className={c.color} />
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">{c.label}</span>
              </div>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">{c.sub}</p>
              {c.label === 'Ad-Influenced' && data.platformTotals && Object.keys(data.platformTotals).length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border-primary)] space-y-1.5">
                  {Object.entries(data.platformTotals).map(([p, s]: [string, any]) => (
                    <div key={p} className="flex items-center justify-between">
                      <PlatformIcon platform={p} size={14} showLabel />
                      <span className="text-xs text-[var(--text-tertiary)]">{s.dealCount} deals · {fmtNum(s.impressions)} imps</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Attribution Impact */}
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-attribution)', border: '1px solid var(--border-attribution)' }}>
        <div className="flex items-center gap-3 mb-5">
          <Sparkles size={18} className="text-indigo-400" />
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Ad Exposure Impact</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{attr.total} deals · 90-day lookback{activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active` : ''}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Exposed */}
          <div className="rounded-xl p-5" style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-primary)" }}>
            <div className="flex items-center gap-2 mb-4">
              <Eye size={14} className="text-indigo-400" />
              <span className="text-xs font-semibold text-indigo-300">Ad-Exposed</span>
            </div>
            <p className="text-3xl font-bold text-[var(--text-primary)]">{attr.exposed.count} <span className="text-base font-normal text-[var(--text-tertiary)]">deals</span></p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">Pipeline</span><span className="font-semibold text-[var(--text-primary)]">{fmt(attr.exposed.pipeline)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">Avg Deal</span><span className="font-semibold text-[var(--text-primary)]">{fmt(attr.exposed.avgDeal)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">Win Rate</span><span className="font-semibold text-emerald-400">{attr.exposed.winRate.toFixed(1)}%</span></div>
            </div>
          </div>

          {/* Non-Exposed */}
          <div className="rounded-xl p-5" style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-primary)" }}>
            <div className="flex items-center gap-2 mb-4">
              <EyeOff size={14} className="text-[var(--text-muted)]" />
              <span className="text-xs font-semibold text-[var(--text-tertiary)]">Not Exposed</span>
            </div>
            <p className="text-3xl font-bold text-[var(--text-primary)]">{attr.unexposed.count} <span className="text-base font-normal text-[var(--text-tertiary)]">deals</span></p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">Pipeline</span><span className="text-[var(--text-secondary)]">{fmt(attr.unexposed.pipeline)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">Avg Deal</span><span className="text-[var(--text-secondary)]">{fmt(attr.unexposed.avgDeal)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">Win Rate</span><span className="text-[var(--text-secondary)]">{attr.unexposed.winRate.toFixed(1)}%</span></div>
            </div>
          </div>

          {/* Lift */}
          <div className="rounded-xl p-5" style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-primary)" }}>
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpRight size={14} className="text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-300">Lift</span>
            </div>
            <div className="space-y-5 mt-2">
              <div>
                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-medium">Deal Size</p>
                <p className={`text-3xl font-bold mt-1 ${attr.lift.dealSizeLift > 0 ? 'text-emerald-400' : attr.lift.dealSizeLift < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                  {attr.exposed.count === 0 ? 'N/A' : `${attr.lift.dealSizeLift > 0 ? '+' : ''}${attr.lift.dealSizeLift.toFixed(0)}%`}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-medium">Win Rate</p>
                <p className={`text-3xl font-bold mt-1 ${attr.lift.winRateLift > 0 ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                  {(attr.exposed.wonCount || 0) === 0 ? 'No wins yet' : `${attr.lift.winRateLift > 0 ? '+' : ''}${attr.lift.winRateLift.toFixed(0)}%`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Tabs */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6">
        <div className="flex items-center gap-1 mb-5 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-0.5 w-fit">
          {([['stage', 'Stage', Layers], ['product', 'Product', BarChart3], ['funnel', 'Funnel', TrendingUp], ['source', 'Source', Eye]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setBreakdownView(key as any)}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition flex items-center gap-1.5 ${breakdownView === key ? 'bg-indigo-600/20 text-indigo-400' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              <Icon size={12} />{label}
            </button>
          ))}
        </div>

        {breakdownView === 'stage' && (
          <div className="space-y-4">
            {sortedStages.map((s: any) => {
              const pct = totalPipeline > 0 ? (s.amount / totalPipeline) * 100 : 0;
              const color = stageColors[s.stage] || 'bg-gray-600';
              const exposed = attr.byStage?.find((es: any) => es.stage === s.stage);
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-3 h-3 rounded-full ${color}`} />
                      <span className="text-sm text-[var(--text-primary)] font-medium">{s.stage}</span>
                      <span className="text-xs text-[var(--text-muted)]">{s.count} opps</span>
                      {exposed && <span className="text-xs text-indigo-400 flex items-center gap-1"><Eye size={10} /> {exposed.count} exposed</span>}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{fmt(s.amount)}</span>
                      <span className="text-xs text-[var(--text-muted)] w-12 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="w-full rounded-full h-2.5" style={{ background: 'var(--bg-bar-track)' }}>
                    <div className={`h-2.5 rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {breakdownView === 'product' && (
          <div className="space-y-4">
            {(attr.byProduct || []).map((p: any) => {
              const maxPipe = Math.max(...(attr.byProduct || []).map((x: any) => x.pipeline), 1);
              const pct = (p.pipeline / maxPipe) * 100;
              return (
                <div key={p.product}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm text-[var(--text-primary)] font-medium">{p.product}</span>
                      <span className="text-xs text-[var(--text-muted)]">{p.count} touchpoints · {fmtNum(p.impressions)} impr</span>
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{fmt(p.pipeline)}</span>
                  </div>
                  <div className="w-full rounded-full h-2.5" style={{ background: 'var(--bg-bar-track)' }}>
                    <div className="h-2.5 rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {(!attr.byProduct || attr.byProduct.length === 0) && (
              <p className="text-sm text-[var(--text-muted)]">No product breakdown available for current filters</p>
            )}
          </div>
        )}

        {breakdownView === 'funnel' && (
          <div className="space-y-4">
            {(attr.byFunnel || []).map((f: any) => {
              const maxPipe = Math.max(...(attr.byFunnel || []).map((x: any) => x.pipeline), 1);
              const pct = (f.pipeline / maxPipe) * 100;
              const funnelColors: Record<string, string> = { TOFU: 'bg-blue-500', MOFU: 'bg-indigo-500', BOFU: 'bg-emerald-500', BRAND: 'bg-amber-500', OTHER: 'bg-gray-500' };
              return (
                <div key={f.funnel}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-3 h-3 rounded-full ${funnelColors[f.funnel] || 'bg-gray-500'}`} />
                      <span className="text-sm text-[var(--text-primary)] font-medium">{f.funnel}</span>
                      <span className="text-xs text-[var(--text-muted)]">{f.count} touchpoints · {fmtNum(f.impressions)} impr</span>
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{fmt(f.pipeline)}</span>
                  </div>
                  <div className="w-full rounded-full h-2.5" style={{ background: 'var(--bg-bar-track)' }}>
                    <div className={`h-2.5 rounded-full ${funnelColors[f.funnel] || 'bg-gray-500'} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {breakdownView === 'source' && attr.bySource?.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {attr.bySource.map((s: any) => {
              const total = s.exposed + s.unexposed;
              const exposedPct = total > 0 ? (s.exposed / total) * 100 : 0;
              return (
                <div key={s.source} className="rounded-lg p-4" style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-primary)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-[var(--text-primary)] font-medium">{s.source || 'Unknown'}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{total} deals</p>
                  </div>
                  <div className="w-full rounded-full h-3 flex overflow-hidden" style={{ background: 'var(--bg-bar-track)' }}>
                    <div className="h-3 bg-indigo-500/70 transition-all" style={{ width: `${exposedPct}%` }} />
                  </div>
                  <div className="flex justify-between mt-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-indigo-500" />
                      <span className="text-xs text-[var(--text-secondary)]">{s.exposed} exposed ({fmt(s.exposedPipeline)})</span>
                    </div>
                    <span className="text-xs text-[var(--text-tertiary)]">{s.unexposed} not ({fmt(s.unexposedPipeline)})</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Campaign Influence */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--border-primary)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Campaign → Deal Influence</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Which campaigns touched pipeline deals. Click to expand.</p>
        </div>
        <div className="divide-y divide-[var(--border-primary)]">
          {(campaignInfluence || []).map((c: any) => {
            const isExpanded = expandedCampaign === c.name;
            return (
              <div key={c.name}>
                <button onClick={() => setExpandedCampaign(isExpanded ? null : c.name)}
                  className="w-full px-6 py-4 flex items-center gap-4 hover:bg-[var(--bg-hover)] transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={c.platform} size={14} showLabel />
                      {c.funnel && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-[var(--text-muted)]">{c.funnel}</span>}
                      {c.product && c.product !== 'Other' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-[var(--text-muted)]">{c.product}</span>}
                    </div>
                    <p className="text-sm text-[var(--text-primary)] font-medium truncate mt-1">{c.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-[var(--text-muted)]">{fmtNum(c.impressions)} impr</span>
                      {c.wonCount > 0 && <span className="text-xs text-emerald-400 font-medium">{c.wonCount} won ({fmt(c.wonAmount)})</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-[var(--text-primary)]">{fmt(c.pipeline)}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{c.dealCount} deals</p>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-[var(--text-muted)]" /> : <ChevronDown size={16} className="text-[var(--text-muted)]" />}
                </button>
                {isExpanded && (
                  <div className="bg-[var(--bg-tertiary)] px-6 py-4 border-t border-[var(--border-primary)]">
                    <table className="w-full">
                      <thead>
                        <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                          <th className="text-left py-2 font-medium">Account</th>
                          <th className="text-left py-2 font-medium">Source</th>
                          <th className="text-left py-2 font-medium">Stage</th>
                          <th className="text-right py-2 font-medium">Impr</th>
                          <th className="text-right py-2 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.deals.map((d: any, i: number) => (
                          <tr key={i} className="border-t border-[var(--border-primary)]">
                            <td className="py-2.5 text-sm text-[var(--text-primary)] max-w-[180px] truncate font-medium">{d.accountName}</td>
                            <td className="py-2.5">
                              <span className={`text-xs font-medium ${d.oppSource === 'Inbound' ? 'text-emerald-400' : d.oppSource === 'Outbound' ? 'text-blue-400' : 'text-[var(--text-muted)]'}`}>{d.oppSource || '—'}</span>
                            </td>
                            <td className="py-2.5 text-xs text-[var(--text-tertiary)]">{d.stage}</td>
                            <td className="py-2.5 text-xs text-[var(--text-secondary)] text-right">{fmtNum(d.impressions)}</td>
                            <td className="py-2.5 text-right">
                              <span className={`text-sm font-semibold ${d.isWon ? 'text-emerald-400' : 'text-[var(--text-primary)]'}`}>{fmt(d.amount)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Open Exposed Deals */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--border-primary)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Open Deals with Ad Exposure</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Click to see which campaigns reached the account.</p>
        </div>
        {(openExposedDeals || []).length === 0 ? (
          <div className="px-6 py-10 text-center">
            <EyeOff size={24} className="mx-auto text-[var(--text-muted)] mb-2" />
            <p className="text-sm text-[var(--text-tertiary)]">No open deals with ad exposure in this date range</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-primary)] max-h-[700px] overflow-y-auto">
            {(showAllDeals ? openExposedDeals : (openExposedDeals || []).slice(0, 10)).map((d: any, i: number) => {
              const isOpen = expandedDeal === i;
              return (
                <div key={i}>
                  <button onClick={() => setExpandedDeal(isOpen ? null : i)}
                    className="w-full px-6 py-4 hover:bg-[var(--bg-hover)] transition-colors text-left">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-[var(--text-primary)] font-semibold truncate">{d.accountName}</p>
                          {d.oppSource && <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium ${d.oppSource === 'Inbound' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-blue-900/30 text-blue-400'}`}>{d.oppSource}</span>}
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)] truncate mt-1">{d.name}</p>
                      </div>
                      <div className="shrink-0 text-center">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase font-medium">Stage</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-medium">{d.stageName}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-bold text-[var(--text-primary)]">{fmt(d.amount)}</p>
                        <div className="flex items-center gap-2 mt-1 justify-end">
                          <span className="text-xs text-indigo-400 flex items-center gap-1"><Eye size={10} /> {fmtNum(d.adImpressions)}</span>
                          <span className="text-xs text-[var(--text-muted)]">{d.campaignCount} camp{d.campaignCount !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      {isOpen ? <ChevronUp size={16} className="text-[var(--text-muted)] mt-1" /> : <ChevronDown size={16} className="text-[var(--text-muted)] mt-1" />}
                    </div>
                  </button>
                  {isOpen && d.adCampaigns?.length > 0 && (
                    <div className="bg-[var(--bg-tertiary)] px-6 py-4 border-t border-[var(--border-primary)]">
                      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-3">Campaigns that reached {d.accountName}</p>
                      <div className="space-y-3">
                        {d.adCampaigns.map((c: any, j: number) => {
                          const pct = d.adImpressions > 0 ? (c.impressions / d.adImpressions) * 100 : 0;
                          return (
                            <div key={j} className="flex items-center gap-3">
                              <PlatformIcon platform={c.platform} size={14} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-[var(--text-secondary)] truncate">{c.name}</p>
                                <div className="w-full rounded-full h-2 mt-1.5" style={{ background: 'var(--bg-bar-track)' }}>
                                  <div className={`h-2 rounded-full ${c.platform === 'linkedin' ? 'bg-sky-500/70' : 'bg-indigo-500/70'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                              </div>
                              <div className="shrink-0 text-right w-28">
                                <p className="text-sm text-indigo-400 font-semibold">{fmtNum(c.impressions)} impr</p>
                              </div>
                              <span className="text-xs text-[var(--text-muted)] w-12 text-right">{pct.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {(openExposedDeals || []).length > 10 && (
              <div className="px-6 py-3 border-t border-[var(--border-primary)]">
                <button onClick={() => setShowAllDeals(!showAllDeals)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium">
                  {showAllDeals ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {showAllDeals ? 'Show less' : `Show all ${openExposedDeals.length}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
