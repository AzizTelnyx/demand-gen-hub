"use client";

import { useState, useEffect, useMemo } from "react";
import { parseCampaignName, getFunnelStageColor, ParsedCampaign } from "@/lib/parseCampaignName";

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
}

interface SyncState {
  lastSyncedAt: string | null;
  status: string;
}

type SortField = "name" | "spend" | "budget" | "pacing" | "ctr" | "clicks" | "impressions";
type SortDirection = "asc" | "desc";

const statusColors: Record<string, string> = {
  live: "bg-green-100 text-green-800",
  active: "bg-green-100 text-green-800",
  enabled: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  ended: "bg-gray-100 text-gray-800",
  removed: "bg-red-100 text-red-800",
  draft: "bg-blue-100 text-blue-800",
};

const platformConfig: Record<string, { icon: string; name: string; color: string }> = {
  google_ads: { icon: "🔍", name: "Google Ads", color: "text-blue-600" },
  stackadapt: { icon: "📺", name: "StackAdapt", color: "text-purple-600" },
  linkedin: { icon: "💼", name: "LinkedIn", color: "text-blue-800" },
};

export default function CampaignsDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [funnelFilter, setFunnelFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>("spend");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`/api/campaigns`);
      const data = await res.json();
      setCampaigns(data.campaigns || []);
      setSyncStates(data.syncStates || {});
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Enrich campaigns with parsed data
  const enrichedCampaigns: EnrichedCampaign[] = useMemo(() => {
    return campaigns.map(c => {
      const parsed = parseCampaignName(c.name);
      const clicks = c.clicks || 0;
      const impressions = c.impressions || 0;
      const spend = c.spend || 0;
      const budget = c.budget || 0;
      
      return {
        ...c,
        parsed,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        pacing: budget > 0 ? (spend / budget) * 100 : 0,
      };
    });
  }, [campaigns]);

  // Get unique values for filters
  const products = useMemo(() => {
    const set = new Set<string>();
    enrichedCampaigns.forEach(c => {
      if (c.parsed.product) set.add(c.parsed.product);
    });
    return Array.from(set).sort();
  }, [enrichedCampaigns]);

  // Filter and sort campaigns
  const filteredCampaigns = useMemo(() => {
    let result = enrichedCampaigns.filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (platformFilter !== "all" && c.platform !== platformFilter) return false;
      if (funnelFilter !== "all" && c.parsed.funnelStage !== funnelFilter) return false;
      if (productFilter !== "all" && c.parsed.product !== productFilter) return false;
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    // Sort
    result.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case "name": aVal = a.name; bVal = b.name; break;
        case "spend": aVal = a.spend || 0; bVal = b.spend || 0; break;
        case "budget": aVal = a.budget || 0; bVal = b.budget || 0; break;
        case "pacing": aVal = a.pacing; bVal = b.pacing; break;
        case "ctr": aVal = a.ctr; bVal = b.ctr; break;
        case "clicks": aVal = a.clicks || 0; bVal = b.clicks || 0; break;
        case "impressions": aVal = a.impressions || 0; bVal = b.impressions || 0; break;
      }

      if (typeof aVal === "string") {
        return sortDirection === "asc" 
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      }
      return sortDirection === "asc" ? aVal - (bVal as number) : (bVal as number) - aVal;
    });

    return result;
  }, [enrichedCampaigns, statusFilter, platformFilter, funnelFilter, productFilter, searchQuery, sortField, sortDirection]);

  // Stats
  const stats = useMemo(() => {
    const live = filteredCampaigns.filter(c => ["live", "active", "enabled"].includes(c.status));
    return {
      total: filteredCampaigns.length,
      live: live.length,
      totalBudget: filteredCampaigns.reduce((acc, c) => acc + (c.budget || 0), 0),
      totalSpend: filteredCampaigns.reduce((acc, c) => acc + (c.spend || 0), 0),
      totalClicks: filteredCampaigns.reduce((acc, c) => acc + (c.clicks || 0), 0),
      totalImpressions: filteredCampaigns.reduce((acc, c) => acc + (c.impressions || 0), 0),
    };
  }, [filteredCampaigns]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      setTimeout(() => {
        fetchCampaigns();
        setSyncing(false);
      }, 5000);
    } catch (error) {
      console.error("Error syncing:", error);
      setSyncing(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300">↕</span>;
    return <span>{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading campaigns...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats Cards */}
      <div className="grid grid-cols-6 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Campaigns</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Live</p>
          <p className="text-2xl font-bold text-green-600">{stats.live}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Budget</p>
          <p className="text-2xl font-bold">${stats.totalBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Spend</p>
          <p className="text-2xl font-bold">${stats.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Clicks</p>
          <p className="text-2xl font-bold">{stats.totalClicks.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Impressions</p>
          <p className="text-2xl font-bold">{(stats.totalImpressions / 1000).toFixed(1)}K</p>
        </div>
      </div>

      {/* Sync Status */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-6">
            {Object.entries(syncStates).map(([platform, state]) => (
              <div key={platform} className="flex items-center gap-2 text-sm">
                <span>{platformConfig[platform]?.icon}</span>
                <span className={platformConfig[platform]?.color}>{platformConfig[platform]?.name}:</span>
                <span className="text-gray-500">{formatLastSync(state.lastSyncedAt)}</span>
                {state.status === "error" && <span className="text-red-500 text-xs">⚠️</span>}
              </div>
            ))}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {syncing ? "⏳ Syncing..." : "🔄 Sync Now"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="flex-1 min-w-64">
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="enabled">Enabled</option>
            <option value="paused">Paused</option>
            <option value="removed">Removed</option>
          </select>

          {/* Platform */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Platforms</option>
            <option value="google_ads">🔍 Google Ads</option>
            <option value="stackadapt">📺 StackAdapt</option>
            <option value="linkedin">💼 LinkedIn</option>
          </select>

          {/* Funnel Stage */}
          <select
            value={funnelFilter}
            onChange={(e) => setFunnelFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Funnel</option>
            <option value="TOFU">🔵 TOFU</option>
            <option value="MOFU">🟣 MOFU</option>
            <option value="BOFU">🟢 BOFU</option>
          </select>

          {/* Product */}
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Products</option>
            {products.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredCampaigns.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="mb-2">No campaigns found</p>
            <p className="text-sm">Try adjusting your filters or sync data from your ad platforms</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">
                    <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-gray-700">
                      Campaign <SortIcon field="name" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Platform</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Funnel</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                    <button onClick={() => handleSort("budget")} className="flex items-center gap-1 hover:text-gray-700 ml-auto">
                      Budget <SortIcon field="budget" />
                    </button>
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                    <button onClick={() => handleSort("spend")} className="flex items-center gap-1 hover:text-gray-700 ml-auto">
                      Spend <SortIcon field="spend" />
                    </button>
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                    <button onClick={() => handleSort("pacing")} className="flex items-center gap-1 hover:text-gray-700 ml-auto">
                      Pacing <SortIcon field="pacing" />
                    </button>
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                    <button onClick={() => handleSort("clicks")} className="flex items-center gap-1 hover:text-gray-700 ml-auto">
                      Clicks <SortIcon field="clicks" />
                    </button>
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                    <button onClick={() => handleSort("ctr")} className="flex items-center gap-1 hover:text-gray-700 ml-auto">
                      CTR <SortIcon field="ctr" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCampaigns.map((campaign) => {
                  const pacingColor = campaign.pacing > 90 ? "text-red-600" : campaign.pacing > 70 ? "text-yellow-600" : "text-green-600";
                  const platform = platformConfig[campaign.platform] || { icon: "📊", name: campaign.platform, color: "text-gray-600" };

                  return (
                    <tr key={campaign.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 text-sm">{campaign.name}</p>
                        <div className="flex gap-2 mt-1">
                          {campaign.parsed.product && (
                            <span className="text-xs text-gray-500">{campaign.parsed.product}</span>
                          )}
                          {campaign.parsed.region && (
                            <span className="text-xs text-gray-400">• {campaign.parsed.region}</span>
                          )}
                          {campaign.parsed.isCompetitor && (
                            <span className="text-xs text-orange-600">• vs {campaign.parsed.competitorName}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${platform.color}`} title={platform.name}>
                          {platform.icon} {platform.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[campaign.status] || "bg-gray-100 text-gray-800"}`}>
                          {campaign.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {campaign.parsed.funnelStage ? (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getFunnelStageColor(campaign.parsed.funnelStage)}`}>
                            {campaign.parsed.funnelStage}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {campaign.budget ? `$${campaign.budget.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                        {campaign.spend ? `$${campaign.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium text-right ${pacingColor}`}>
                        {campaign.budget ? `${campaign.pacing.toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {(campaign.clicks || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {campaign.ctr > 0 ? `${campaign.ctr.toFixed(2)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="mt-4 text-sm text-gray-500 text-right">
        Showing {filteredCampaigns.length} of {enrichedCampaigns.length} campaigns
      </div>
    </div>
  );
}
