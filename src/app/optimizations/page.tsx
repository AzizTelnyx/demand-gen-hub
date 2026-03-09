'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  History, Filter, DollarSign, Pause, Play, Target,
  Pencil, Rocket, XCircle, Settings, Search, ChevronDown,
  ArrowRight, Bot, User, Zap, Globe,
} from 'lucide-react';

interface CampaignChange {
  id: string;
  campaignName: string;
  platform: string;
  changeType: string;
  description: string;
  oldValue: string | null;
  newValue: string | null;
  source: string;
  actor: string | null;
  timestamp: string;
}

const changeTypeConfig: Record<string, { icon: any; color: string; label: string }> = {
  budget: { icon: DollarSign, color: "text-emerald-400", label: "Budget" },
  status: { icon: Play, color: "text-blue-400", label: "Status" },
  pause: { icon: Pause, color: "text-amber-400", label: "Paused" },
  launch: { icon: Rocket, color: "text-indigo-400", label: "Launch" },
  end: { icon: XCircle, color: "text-red-400", label: "Ended" },
  "bid-strategy": { icon: Settings, color: "text-cyan-400", label: "Bid Strategy" },
  targeting: { icon: Target, color: "text-violet-400", label: "Targeting" },
  copy: { icon: Pencil, color: "text-pink-400", label: "Ad Copy" },
  "negative-keyword": { icon: XCircle, color: "text-orange-400", label: "Neg. Keyword" },
  audience: { icon: Target, color: "text-violet-400", label: "Audience" },
  geo: { icon: Globe, color: "text-teal-400", label: "Geo" },
  other: { icon: Settings, color: "text-[var(--text-muted)]", label: "Other" },
};

const sourceConfig: Record<string, { icon: any; label: string; color: string }> = {
  "google-ads-api": { icon: Zap, label: "Google Ads", color: "text-blue-400" },
  "stackadapt-api": { icon: Zap, label: "StackAdapt", color: "text-violet-400" },
  "reddit-api": { icon: Zap, label: "Reddit", color: "text-orange-400" },
  ares: { icon: Bot, label: "Ares", color: "text-indigo-400" },
  manual: { icon: User, label: "Manual", color: "text-[var(--text-muted)]" },
  hub: { icon: Settings, label: "Hub", color: "text-cyan-400" },
};

const platformColors: Record<string, string> = {
  google_ads: "bg-blue-900/30 text-blue-400",
  stackadapt: "bg-violet-900/30 text-violet-400",
  reddit: "bg-orange-900/30 text-orange-400",
  linkedin: "bg-sky-900/30 text-sky-400",
};

import PlatformIcon from "@/components/PlatformIcon";

export default function OptimizationsPage() {
  const [changes, setChanges] = useState<CampaignChange[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filters, setFilters] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const [platformFilter, setPlatformFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [daysFilter, setDaysFilter] = useState('30');

  const fetchData = async () => {
    const params = new URLSearchParams();
    if (platformFilter !== 'all') params.set('platform', platformFilter);
    if (typeFilter !== 'all') params.set('changeType', typeFilter);
    if (searchQuery) params.set('campaign', searchQuery);
    params.set('days', daysFilter);

    try {
      const res = await fetch(`/api/optimizations?${params}`);
      const data = await res.json();
      setChanges(data.changes || []);
      setStats(data.stats || {});
      setFilters(data.filters || {});
      setLoading(false);
    } catch { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [platformFilter, typeFilter, daysFilter]);

  // Group by date
  const grouped = useMemo(() => {
    const filtered = searchQuery
      ? changes.filter(c => c.campaignName.toLowerCase().includes(searchQuery.toLowerCase()) || c.description.toLowerCase().includes(searchQuery.toLowerCase()))
      : changes;

    const groups: Record<string, CampaignChange[]> = {};
    filtered.forEach(c => {
      const date = new Date(c.timestamp).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!groups[date]) groups[date] = [];
      groups[date].push(c);
    });
    return groups;
  }, [changes, searchQuery]);

  if (loading) return <div className="p-8 text-[var(--text-muted)] text-sm animate-pulse">Loading optimization history...</div>;

  return (
    <div className="p-8 max-w-[1400px] space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">Optimizations</h1>
        <p className="text-[var(--text-muted)] text-sm mt-0.5">Every campaign change across all platforms</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-2">
            <History size={14} className="text-[var(--text-muted)]" />
            <span className="text-lg font-semibold text-[var(--text-primary)]">{stats.total}</span>
            <span className="text-xs text-[var(--text-muted)]">changes ({daysFilter}d)</span>
          </div>
          {Object.entries(stats.byType || {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 6).map(([type, count]) => {
            const config = changeTypeConfig[type] || changeTypeConfig.other;
            return (
              <button key={type} onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  typeFilter === type ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20' : 'bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}>
                {config.label}: {count as number}
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-2.5 text-[var(--text-muted)]" />
          <input type="text" placeholder="Search campaigns..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-indigo-500 transition-colors" />
        </div>

        <div className="h-6 w-px bg-[var(--border-primary)]" />

        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-indigo-500">
          <option value="all">All Platforms</option>
          {(filters.platforms || []).map((p: string) => (
            <option key={p} value={p}>{p === 'google_ads' ? 'Google Ads' : p === 'stackadapt' ? 'StackAdapt' : p === 'reddit' ? 'Reddit' : p}</option>
          ))}
        </select>

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-indigo-500">
          <option value="all">All Types</option>
          {(filters.changeTypes || []).map((t: string) => (
            <option key={t} value={t}>{changeTypeConfig[t]?.label || t}</option>
          ))}
        </select>

        <div className="flex bg-[var(--bg-card)] rounded-lg p-0.5 border border-[var(--border-primary)]">
          {['7', '30', '90'].map(d => (
            <button key={d} onClick={() => setDaysFilter(d)}
              className={`px-3 py-1.5 text-xs rounded-md transition font-medium ${daysFilter === d ? 'bg-[var(--bg-primary)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-12 text-center">
          <History size={24} className="text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No optimization history yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Changes from Google Ads, StackAdapt, Reddit, and manual edits will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dayChanges]) => (
            <div key={date}>
              {/* Date Header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">{date}</span>
                <div className="flex-1 h-px bg-[var(--bg-primary)]" />
                <span className="text-[10px] text-[var(--text-muted)]">{dayChanges.length} changes</span>
              </div>

              {/* Changes */}
              <div className="space-y-1.5">
                {dayChanges.map(change => {
                  const typeConf = changeTypeConfig[change.changeType] || changeTypeConfig.other;
                  const srcConf = sourceConfig[change.source] || sourceConfig.manual;
                  const TypeIcon = typeConf.icon;
                  const SrcIcon = srcConf.icon;

                  return (
                    <div key={change.id} className="flex items-start gap-3 px-4 py-3 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl hover:bg-[var(--bg-primary)]/50 transition-colors group">
                      {/* Icon */}
                      <div className={`w-8 h-8 rounded-lg bg-[var(--bg-primary)] flex items-center justify-center shrink-0 ${typeConf.color}`}>
                        <TypeIcon size={14} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-[var(--text-primary)] font-medium">{change.description}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <PlatformIcon platform={change.platform} size={14} showLabel />
                          <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[350px]">{change.campaignName}</span>
                          {change.oldValue && change.newValue && (
                            <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                              <span className="text-[var(--text-muted)]">{change.oldValue}</span>
                              <ArrowRight size={9} className="text-[var(--text-muted)]" />
                              <span className="text-[var(--text-secondary)]">{change.newValue}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <SrcIcon size={11} className={srcConf.color} />
                          <span className="text-[10px] text-[var(--text-muted)]">{change.actor || srcConf.label}</span>
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {new Date(change.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
