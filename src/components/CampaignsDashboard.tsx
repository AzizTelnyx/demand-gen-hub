"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { parseCampaignName, getFunnelStageColor, ParsedCampaign } from "@/lib/parseCampaignName";
import PlatformIcon from "@/components/PlatformIcon";
import {
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";

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
  startDate: string | null;
  endDate: string | null;
  lastSyncedAt: string | null;
}

interface EnrichedCampaign extends Campaign {
  parsed: ParsedCampaign;
  ctr: number;
  cpc: number;
  pacing: number;
  health: "healthy" | "watch" | "action";
  healthReasons: string[];
}

interface SyncState {
  lastSyncedAt: string | null;
  status: string;
}

type SortField = "name" | "spend" | "pacing" | "ctr" | "clicks" | "health";
type SortDirection = "asc" | "desc";

const statusConfig: Record<string, { label: string; color: string }> = {
  enabled: { label: "Live", color: "bg-emerald-500" },
  active: { label: "Live", color: "bg-emerald-500" },
  live: { label: "Live", color: "bg-emerald-500" },
  paused: { label: "Paused", color: "bg-amber-500" },
  ended: { label: "Ended", color: "bg-gray-500" },
  removed: { label: "Removed", color: "bg-red-500" },
};

function getHealth(c: { ctr: number; pacing: number; impressions: number | null; clicks: number | null; spend: number | null; budget: number | null; status: string }): { health: "healthy" | "watch" | "action"; reasons: string[] } {
  const reasons: string[] = [];
  const isLive = ["live", "active", "enabled"].includes(c.status);

  if (isLive && c.impressions === 0) { reasons.push("Zero impressions"); }
  if (c.pacing > 120) { reasons.push(`Overpacing (${c.pacing.toFixed(0)}%)`); }
  if (isLive && c.pacing < 30 && (c.budget || 0) > 0) { reasons.push(`Underpacing (${c.pacing.toFixed(0)}%)`); }
  if (c.ctr > 0 && c.ctr < 0.3) { reasons.push(`Low CTR (${c.ctr.toFixed(2)}%)`); }
  if ((c.clicks || 0) > 50 && (c.spend || 0) > 0 && (c.spend! / c.clicks!) > 20) { reasons.push(`High CPC ($${(c.spend! / c.clicks!).toFixed(2)})`); }

  if (reasons.length >= 2) return { health: "action", reasons };
  if (reasons.length === 1) return { health: "watch", reasons };
  return { health: "healthy", reasons: ["On track"] };
}

export default function CampaignsDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [funnelFilter, setFunnelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("live");
  const [healthFilter, setHealthFilter] = useState<string>("all");

  const [sortField, setSortField] = useState<SortField>("spend");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deepDiveResult, setDeepDiveResult] = useState<string | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
      setSyncStates(data.syncStates || {});
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCampaigns(); }, []);

  const enrichedCampaigns: EnrichedCampaign[] = useMemo(() => {
    return campaigns.map(c => {
      const parsed = parseCampaignName(c.name);
      const clicks = c.clicks || 0;
      const impressions = c.impressions || 0;
      const spend = c.spend || 0;
      const budget = c.budget || 0;
      const monthlyBudget = c.platform === "google_ads" ? budget * 30 : budget;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const pacing = monthlyBudget > 0 ? (spend / monthlyBudget) * 100 : 0;
      const { health, reasons } = getHealth({ ctr, pacing, impressions: c.impressions, clicks: c.clicks, spend: c.spend, budget: c.budget, status: c.status });

      return { ...c, parsed, ctr, cpc, pacing, health, healthReasons: reasons };
    });
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    let result = enrichedCampaigns.filter(c => {
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (platformFilter !== "all" && c.platform !== platformFilter) return false;
      if (funnelFilter !== "all" && c.parsed.funnelStage !== funnelFilter) return false;
      if (statusFilter === "live" && !["live", "active", "enabled"].includes(c.status)) return false;
      if (statusFilter === "paused" && c.status !== "paused") return false;
      if (statusFilter === "ended" && !["ended", "removed"].includes(c.status)) return false;
      if (healthFilter !== "all" && c.health !== healthFilter) return false;
      return true;
    });

    const healthOrder = { action: 0, watch: 1, healthy: 2 };
    result.sort((a, b) => {
      let aVal: number | string = 0, bVal: number | string = 0;
      switch (sortField) {
        case "name": aVal = a.name; bVal = b.name; break;
        case "spend": aVal = a.spend || 0; bVal = b.spend || 0; break;
        case "pacing": aVal = a.pacing; bVal = b.pacing; break;
        case "ctr": aVal = a.ctr; bVal = b.ctr; break;
        case "clicks": aVal = a.clicks || 0; bVal = b.clicks || 0; break;
        case "health": aVal = healthOrder[a.health]; bVal = healthOrder[b.health]; break;
      }
      if (typeof aVal === "string") return sortDirection === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDirection === "asc" ? aVal - (bVal as number) : (bVal as number) - aVal;
    });
    return result;
  }, [enrichedCampaigns, searchQuery, platformFilter, funnelFilter, statusFilter, healthFilter, sortField, sortDirection]);

  const stats = useMemo(() => ({
    count: filteredCampaigns.length,
    spend: filteredCampaigns.reduce((a, c) => a + (c.spend || 0), 0),
    clicks: filteredCampaigns.reduce((a, c) => a + (c.clicks || 0), 0),
    actionCount: filteredCampaigns.filter(c => c.health === "action").length,
    watchCount: filteredCampaigns.filter(c => c.health === "watch").length,
  }), [filteredCampaigns]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      setTimeout(() => { fetchCampaigns(); setSyncing(false); }, 5000);
    } catch { setSyncing(false); }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDirection(field === "health" ? "asc" : "desc"); }
  };

  const handleDeepDive = useCallback(async (campaignName: string) => {
    setDeepDiveLoading(true);
    setDeepDiveResult(null);
    try {
      const res = await fetch("/api/agents/deep-dive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign: campaignName }),
      });
      const data = await res.json();
      setDeepDiveResult(data.analysis || data.error || "No analysis available");
    } catch { setDeepDiveResult("Failed to run analysis"); }
    setDeepDiveLoading(false);
  }, []);

  const fmt = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : n.toLocaleString();
  const fmtCur = (n: number) => n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;

  const SortIcon = ({ field }: { field: SortField }) => sortField === field ? (sortDirection === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-gray-500 text-sm">Loading campaigns...</div></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-3xl font-bold text-white">{stats.count}</span>
            <span className="text-gray-500 ml-2 text-sm">campaigns</span>
          </div>
          <div className="h-8 w-px bg-gray-800" />
          <div>
            <span className="text-2xl font-semibold text-white">{fmtCur(stats.spend)}</span>
            <span className="text-gray-500 ml-2 text-sm">spend</span>
          </div>
          <div className="h-8 w-px bg-gray-800" />
          <div>
            <span className="text-2xl font-semibold text-white">{fmt(stats.clicks)}</span>
            <span className="text-gray-500 ml-2 text-sm">clicks</span>
          </div>
          {stats.actionCount > 0 && (
            <>
              <div className="h-8 w-px bg-gray-800" />
              <button onClick={() => setHealthFilter(healthFilter === "action" ? "all" : "action")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${healthFilter === "action" ? "bg-red-900/40 text-red-300 border border-red-800/40" : "bg-red-900/20 text-red-400 hover:bg-red-900/30"}`}>
                <AlertTriangle size={12} />
                {stats.actionCount} need attention
              </button>
            </>
          )}
        </div>

        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing..." : "Sync"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-gray-900/50 border border-gray-800/50 rounded-xl p-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
          <input type="text" placeholder="Search campaigns..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors" />
        </div>

        <div className="h-6 w-px bg-gray-800" />

        <div className="flex bg-gray-950 rounded-lg p-0.5 border border-gray-800">
          {[{ value: "live", label: "Live" }, { value: "paused", label: "Paused" }, { value: "all", label: "All" }].map(opt => (
            <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-md transition font-medium ${statusFilter === opt.value ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"}`}>
              {opt.label}
            </button>
          ))}
        </div>

        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-indigo-500">
          <option value="all">All Platforms</option>
          <option value="google_ads">Google Ads</option>
          <option value="stackadapt">StackAdapt</option>
          <option value="reddit">Reddit</option>
        </select>

        <select value={funnelFilter} onChange={(e) => setFunnelFilter(e.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-indigo-500">
          <option value="all">All Funnel</option>
          <option value="TOFU">TOFU</option>
          <option value="MOFU">MOFU</option>
          <option value="BOFU">BOFU</option>
        </select>

        <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-indigo-500">
          <option value="all">All Health</option>
          <option value="action">⚠ Action Needed</option>
          <option value="watch">👀 Watch</option>
          <option value="healthy">✓ Healthy</option>
        </select>
      </div>

      {/* Campaign Table */}
      <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl overflow-hidden">
        {filteredCampaigns.length === 0 ? (
          <div className="p-12 text-center text-gray-600">
            <p className="text-sm">No campaigns match your filters</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800/50">
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Campaign</th>
                <th className="text-center px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-widest w-20 cursor-pointer hover:text-gray-300" onClick={() => handleSort("health")}>
                  <span className="inline-flex items-center gap-1">Health <SortIcon field="health" /></span>
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-widest cursor-pointer hover:text-gray-300 w-28" onClick={() => handleSort("spend")}>
                  <span className="inline-flex items-center gap-1 justify-end">Spend <SortIcon field="spend" /></span>
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-widest cursor-pointer hover:text-gray-300 w-28" onClick={() => handleSort("pacing")}>
                  <span className="inline-flex items-center gap-1 justify-end">Pacing <SortIcon field="pacing" /></span>
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-widest cursor-pointer hover:text-gray-300 w-24" onClick={() => handleSort("clicks")}>
                  <span className="inline-flex items-center gap-1 justify-end">Clicks <SortIcon field="clicks" /></span>
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-widest cursor-pointer hover:text-gray-300 w-20" onClick={() => handleSort("ctr")}>
                  <span className="inline-flex items-center gap-1 justify-end">CTR <SortIcon field="ctr" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {filteredCampaigns.map((campaign) => {
                const status = statusConfig[campaign.status] || { label: campaign.status, color: "bg-gray-500" };
                const isExpanded = expandedId === campaign.id;
                const healthColor = campaign.health === "action" ? "text-red-400" : campaign.health === "watch" ? "text-amber-400" : "text-emerald-400";
                const healthBg = campaign.health === "action" ? "bg-red-900/20" : campaign.health === "watch" ? "bg-amber-900/20" : "bg-emerald-900/20";

                return (
                  <tr key={campaign.id} className="group">
                    <td colSpan={6} className="p-0">
                      {/* Main Row */}
                      <div className={`flex items-center cursor-pointer transition-colors hover:bg-gray-800/30 ${isExpanded ? "bg-gray-800/20" : ""}`}
                        onClick={() => { setExpandedId(isExpanded ? null : campaign.id); setDeepDiveResult(null); }}>
                        <div className="flex-1 px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${status.color}`} title={status.label} />
                            <PlatformIcon platform={campaign.platform} size={14} />
                            <span className="font-medium text-white text-sm truncate">{campaign.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 ml-6">
                            {campaign.parsed.funnelStage && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getFunnelStageColor(campaign.parsed.funnelStage)}`}>
                                {campaign.parsed.funnelStage}
                              </span>
                            )}
                            {campaign.parsed.product && <span className="text-[11px] text-gray-600">{campaign.parsed.product}</span>}
                            {campaign.parsed.isCompetitor && <span className="text-[11px] text-orange-400/80">vs {campaign.parsed.competitorName}</span>}
                          </div>
                        </div>

                        {/* Health */}
                        <div className="w-20 px-3 py-3 flex justify-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${healthBg} ${healthColor}`} title={campaign.healthReasons.join(", ")}>
                            {campaign.health === "action" ? <AlertTriangle size={10} /> : campaign.health === "watch" ? <ArrowDownRight size={10} /> : <CheckCircle2 size={10} />}
                            {campaign.health === "action" ? "Action" : campaign.health === "watch" ? "Watch" : "OK"}
                          </span>
                        </div>

                        {/* Spend */}
                        <div className="w-28 px-4 py-3 text-right">
                          <span className="font-medium text-white text-sm">{campaign.spend ? fmtCur(campaign.spend) : "—"}</span>
                          {campaign.budget ? <span className="text-[11px] text-gray-600 ml-1">/ {fmtCur(campaign.budget)}</span> : null}
                        </div>

                        {/* Pacing */}
                        <div className="w-28 px-4 py-3 text-right">
                          {campaign.budget ? (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-14 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${campaign.pacing > 90 ? "bg-red-500" : campaign.pacing > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                                  style={{ width: `${Math.min(campaign.pacing, 100)}%` }} />
                              </div>
                              <span className="text-xs text-gray-400 w-8 text-right">{campaign.pacing.toFixed(0)}%</span>
                            </div>
                          ) : <span className="text-gray-700 text-xs">—</span>}
                        </div>

                        {/* Clicks */}
                        <div className="w-24 px-4 py-3 text-right">
                          <span className="font-medium text-white text-sm">{fmt(campaign.clicks || 0)}</span>
                        </div>

                        {/* CTR */}
                        <div className="w-20 px-4 py-3 text-right">
                          <span className="text-sm text-gray-300">{campaign.ctr > 0 ? `${campaign.ctr.toFixed(2)}%` : "—"}</span>
                        </div>
                      </div>

                      {/* Expanded Deep Dive Panel */}
                      {isExpanded && (
                        <div className="px-4 pb-4 animate-fade-in">
                          <div className="bg-gray-950 border border-gray-800/50 rounded-xl p-5 ml-6">
                            {/* Quick Stats Row */}
                            <div className="grid grid-cols-6 gap-4 mb-4">
                              {[
                                { label: "Impressions", value: fmt(campaign.impressions || 0) },
                                { label: "Clicks", value: fmt(campaign.clicks || 0) },
                                { label: "CTR", value: `${campaign.ctr.toFixed(2)}%` },
                                { label: "CPC", value: campaign.clicks ? `$${campaign.cpc.toFixed(2)}` : "—" },
                                { label: "Conversions", value: String(campaign.conversions || 0) },
                                { label: "Pacing", value: campaign.budget ? `${campaign.pacing.toFixed(0)}%` : "—" },
                              ].map((s, i) => (
                                <div key={i}>
                                  <span className="text-[10px] text-gray-600 uppercase tracking-wider block">{s.label}</span>
                                  <span className="text-sm font-medium text-gray-300">{s.value}</span>
                                </div>
                              ))}
                            </div>

                            {/* Health Signals */}
                            <div className="flex items-center gap-2 mb-4">
                              {campaign.healthReasons.map((r, i) => (
                                <span key={i} className={`px-2 py-1 rounded-lg text-[11px] font-medium ${healthBg} ${healthColor}`}>{r}</span>
                              ))}
                            </div>

                            {/* AI Deep Dive */}
                            {deepDiveResult ? (
                              <div className="border-t border-gray-800/50 pt-4 mt-2">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <Sparkles size={12} className="text-indigo-400" /> AI Analysis
                                  </span>
                                  <button onClick={(e) => { e.stopPropagation(); setDeepDiveResult(null); }} className="text-gray-600 hover:text-gray-400">
                                    <X size={14} />
                                  </button>
                                </div>
                                <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{deepDiveResult}</div>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeepDive(campaign.name); }}
                                disabled={deepDiveLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600/15 border border-indigo-500/20 text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-600/25 transition-colors disabled:opacity-50">
                                {deepDiveLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                {deepDiveLoading ? "Analyzing..." : "Run AI Deep Dive"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-[11px] text-gray-600 text-right">
        Showing {filteredCampaigns.length} of {enrichedCampaigns.length} campaigns · Last 30 days
      </div>
    </div>
  );
}
