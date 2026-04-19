'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Search, AlertTriangle, EyeOff, TrendingDown, Layers,
  RefreshCw, Filter, ChevronDown, ExternalLink,
  CircleDollarSign, MousePointerClick, Users, Target,
} from 'lucide-react';

interface CampaignSegment {
  id: string;
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  campaignBudget: number | null;
  platform: string;
  parsedProduct: string | null;
  parsedVariant: string | null;
  parsedIntent: string | null;
  segmentId: string;
  segmentName: string | null;
  segmentType: string | null;
  segmentSize: number | null;
  segmentSource: string | null;
  segmentWritable: boolean;
  impressions30d: number;
  clicks30d: number;
  spend30d: number;
  conversions30d: number;
  ctr30d: number | null;
  cpc30d: number | null;
  cpm30d: number | null;
  healthFlags: string[];
  lastSyncedAt: string | null;
}

interface Summary {
  totalSegments: number;
  totalCampaigns: number;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  byPlatform: Record<string, { count: number; spend: number; impressions: number }>;
  flags: Record<string, number>;
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  stackadapt: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  google_ads: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const FLAG_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  undersized: { icon: <Users size={12} />, color: 'text-yellow-500' },
  zero_impressions: { icon: <EyeOff size={12} />, color: 'text-red-500' },
  low_ctr: { icon: <TrendingDown size={12} />, color: 'text-orange-500' },
  stale: { icon: <RefreshCw size={12} />, color: 'text-gray-500' },
  overlapping: { icon: <Layers size={12} />, color: 'text-purple-500' },
};

export default function ABMActivePage() {
  const [segments, setSegments] = useState<CampaignSegment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [flagFilter, setFlagFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`/api/abm/active?platform=${platformFilter !== 'all' ? platformFilter : ''}&product=${productFilter !== 'all' ? productFilter : ''}${flagFilter ? `&flag=${flagFilter}` : ''}`)
      .then(r => r.json())
      .then(data => {
        setSegments(data.segments || []);
        setSummary(data.summary || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [platformFilter, productFilter, flagFilter]);

  const products = useMemo(() => {
    const set = new Set(segments.map(s => s.parsedProduct).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [segments]);

  const filteredSegments = useMemo(() => {
    let result = segments;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.campaignName?.toLowerCase().includes(q) ||
        s.segmentName?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [segments, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-[var(--text-muted)]" size={24} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">ABM Campaign Segments</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Active segments across all platforms, tied to campaigns with performance data
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)]">Segments</div>
            <div className="text-lg font-semibold">{summary.totalSegments}</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)]">Campaigns</div>
            <div className="text-lg font-semibold">{summary.totalCampaigns}</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)]">30d Spend</div>
            <div className="text-lg font-semibold">${(summary.totalSpend / 1000).toFixed(1)}K</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)]">Impressions</div>
            <div className="text-lg font-semibold">{(summary.totalImpressions / 1000).toFixed(0)}K</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)]">Conversions</div>
            <div className="text-lg font-semibold">{summary.totalConversions}</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)]">Avg CTR</div>
            <div className="text-lg font-semibold">
              {summary.totalImpressions > 0
                ? ((summary.totalClicks / summary.totalImpressions) * 100).toFixed(2)
                : 0}%
            </div>
          </div>
        </div>
      )}

      {/* Flags Summary */}
      {summary && Object.keys(summary.flags).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(summary.flags).map(([flag, count]) => (
            <button
              key={flag}
              onClick={() => setFlagFilter(flagFilter === flag ? '' : flag)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors
                ${flagFilter === flag ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)]'}`}
            >
              {FLAG_ICONS[flag]?.icon}
              <span className={FLAG_ICONS[flag]?.color}>{flag.replace(/_/g, ' ')}</span>
              <span className="text-[var(--text-muted)]">({count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search campaigns or segments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md text-sm"
          />
        </div>
        <select
          value={platformFilter}
          onChange={e => setPlatformFilter(e.target.value)}
          className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md px-3 py-2 text-sm"
        >
          <option value="all">All Platforms</option>
          <option value="linkedin">LinkedIn</option>
          <option value="stackadapt">StackAdapt</option>
          <option value="google_ads">Google Ads</option>
        </select>
        <select
          value={productFilter}
          onChange={e => setProductFilter(e.target.value)}
          className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md px-3 py-2 text-sm"
        >
          <option value="all">All Products</option>
          {products.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-[var(--border-primary)] rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-primary)]">
              <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">Campaign</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">Segment</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">Platform</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--text-muted)]">Size</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--text-muted)]">Impr</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--text-muted)]">CTR</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--text-muted)]">Spend</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--text-muted)]">Conv</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">Flags</th>
            </tr>
          </thead>
          <tbody>
            {filteredSegments.map(seg => (
              <tr key={seg.id} className="border-b border-[var(--border-primary)] hover:bg-[var(--bg-primary)]/50">
                <td className="px-3 py-2 max-w-[250px] truncate">
                  <div className="font-medium truncate">{seg.campaignName}</div>
                  {seg.parsedProduct && (
                    <div className="text-xs text-[var(--text-muted)]">
                      {seg.parsedProduct}
                      {seg.parsedVariant ? ` / ${seg.parsedVariant}` : ''}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 max-w-[200px] truncate">
                  <div className="truncate">{seg.segmentName || seg.segmentId}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {seg.segmentSource === 'ares-built' && '⚔️ '}
                    {seg.segmentType?.replace(/_/g, ' ')}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs border ${PLATFORM_COLORS[seg.platform] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                    {seg.platform === 'google_ads' ? 'Google' : seg.platform.charAt(0).toUpperCase() + seg.platform.slice(1)}
                  </span>
                </td>
                <td className="text-right px-3 py-2 tabular-nums">
                  {seg.segmentSize ? seg.segmentSize.toLocaleString() : '—'}
                </td>
                <td className="text-right px-3 py-2 tabular-nums">
                  {seg.impressions30d > 0 ? (seg.impressions30d / 1000).toFixed(1) + 'K' : '0'}
                </td>
                <td className="text-right px-3 py-2 tabular-nums">
                  {seg.ctr30d !== null ? seg.ctr30d.toFixed(2) + '%' : '—'}
                </td>
                <td className="text-right px-3 py-2 tabular-nums">
                  ${seg.spend30d > 0 ? seg.spend30d.toFixed(0) : '0'}
                </td>
                <td className="text-right px-3 py-2 tabular-nums">
                  {seg.conversions30d || 0}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 flex-wrap">
                    {(seg.healthFlags as string[])?.map(flag => (
                      <span key={flag} className={`flex items-center gap-0.5 text-xs ${FLAG_ICONS[flag]?.color || 'text-gray-400'}`}>
                        {FLAG_ICONS[flag]?.icon}
                        {flag.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Platform Breakdown */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(summary.byPlatform).map(([platform, data]) => (
            <div key={platform} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded text-xs border ${PLATFORM_COLORS[platform] || ''}`}>
                  {platform === 'google_ads' ? 'Google Ads' : platform.charAt(0).toUpperCase() + platform.slice(1)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-[var(--text-muted)] text-xs">Segments</div>
                  <div className="font-medium">{data.count}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] text-xs">Spend</div>
                  <div className="font-medium">${(data.spend / 1000).toFixed(1)}K</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] text-xs">Impressions</div>
                  <div className="font-medium">{(data.impressions / 1000).toFixed(0)}K</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
