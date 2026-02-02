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

type SortField = "name" | "spend" | "pacing" | "ctr" | "clicks";
type SortDirection = "asc" | "desc";

const statusConfig: Record<string, { label: string; color: string }> = {
  enabled: { label: "Live", color: "bg-green-500" },
  active: { label: "Live", color: "bg-green-500" },
  live: { label: "Live", color: "bg-green-500" },
  paused: { label: "Paused", color: "bg-yellow-500" },
  ended: { label: "Ended", color: "bg-gray-400" },
  removed: { label: "Removed", color: "bg-red-400" },
};

const platformConfig: Record<string, { icon: string; name: string }> = {
  google_ads: { icon: "🔍", name: "Google Ads" },
  stackadapt: { icon: "📺", name: "StackAdapt" },
  linkedin: { icon: "💼", name: "LinkedIn" },
};

export default function CampaignsDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [funnelFilter, setFunnelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("live"); // Default to live
  const [dateRange, setDateRange] = useState<string>("all");
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>("spend");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  // Date range helper
  const isInDateRange = (campaign: EnrichedCampaign): boolean => {
    if (dateRange === "all") return true;
    
    const now = new Date();
    const startDate = campaign.startDate ? new Date(campaign.startDate) : null;
    const endDate = campaign.endDate ? new Date(campaign.endDate) : null;
    
    switch (dateRange) {
      case "active":
        // Currently running (started and not ended)
        return (!startDate || startDate <= now) && (!endDate || endDate >= now);
      case "last30":
        // Started in last 30 days
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return startDate ? startDate >= thirtyDaysAgo : false;
      case "last90":
        // Started in last 90 days
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        return startDate ? startDate >= ninetyDaysAgo : false;
      case "thisMonth":
        // Started this month
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return startDate ? startDate >= monthStart : false;
      case "lastMonth":
        // Started last month
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        return startDate ? startDate >= lastMonthStart && startDate <= lastMonthEnd : false;
      default:
        return true;
    }
  };

  // Filter and sort campaigns
  const filteredCampaigns = useMemo(() => {
    let result = enrichedCampaigns.filter(c => {
      // Search
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      // Platform
      if (platformFilter !== "all" && c.platform !== platformFilter) return false;
      
      // Funnel
      if (funnelFilter !== "all" && c.parsed.funnelStage !== funnelFilter) return false;
      
      // Status
      if (statusFilter === "live" && !["live", "active", "enabled"].includes(c.status)) return false;
      if (statusFilter === "paused" && c.status !== "paused") return false;
      if (statusFilter === "ended" && !["ended", "removed"].includes(c.status)) return false;
      
      // Date range
      if (!isInDateRange(c)) return false;
      
      return true;
    });

    // Sort
    result.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case "name": aVal = a.name; bVal = b.name; break;
        case "spend": aVal = a.spend || 0; bVal = b.spend || 0; break;
        case "pacing": aVal = a.pacing; bVal = b.pacing; break;
        case "ctr": aVal = a.ctr; bVal = b.ctr; break;
        case "clicks": aVal = a.clicks || 0; bVal = b.clicks || 0; break;
      }

      if (typeof aVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortDirection === "asc" ? aVal - (bVal as number) : (bVal as number) - aVal;
    });

    return result;
  }, [enrichedCampaigns, searchQuery, platformFilter, funnelFilter, statusFilter, dateRange, sortField, sortDirection]);

  // Stats for filtered campaigns
  const stats = useMemo(() => {
    return {
      count: filteredCampaigns.length,
      spend: filteredCampaigns.reduce((acc, c) => acc + (c.spend || 0), 0),
      clicks: filteredCampaigns.reduce((acc, c) => acc + (c.clicks || 0), 0),
      impressions: filteredCampaigns.reduce((acc, c) => acc + (c.impressions || 0), 0),
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

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const formatCurrency = (n: number) => {
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400">Loading campaigns...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-3xl font-bold">{stats.count}</span>
            <span className="text-gray-500 ml-2">campaigns</span>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <span className="text-2xl font-semibold">{formatCurrency(stats.spend)}</span>
            <span className="text-gray-500 ml-2">spend</span>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <span className="text-2xl font-semibold">{formatNumber(stats.clicks)}</span>
            <span className="text-gray-500 ml-2">clicks</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {Object.entries(syncStates).map(([platform, state]) => (
            <span key={platform} className="text-xs text-gray-400">
              {platformConfig[platform]?.icon} {formatLastSync(state.lastSyncedAt)}
            </span>
          ))}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {syncing ? "Syncing..." : "Sync"}
          </button>
        </div>
      </div>

      {/* Filters - Single Row */}
      <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-gray-100">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <span className="absolute left-3 top-2.5 text-gray-400">🔎</span>
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Status Toggle */}
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {[
            { value: "live", label: "Live" },
            { value: "paused", label: "Paused" },
            { value: "ended", label: "Ended" },
            { value: "all", label: "All" },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                statusFilter === opt.value 
                  ? "bg-white shadow text-gray-900 font-medium" 
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Platform */}
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Platforms</option>
          <option value="google_ads">🔍 Google Ads</option>
          <option value="stackadapt">📺 StackAdapt</option>
        </select>

        {/* Funnel */}
        <select
          value={funnelFilter}
          onChange={(e) => setFunnelFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Funnel</option>
          <option value="TOFU">🔵 TOFU</option>
          <option value="MOFU">🟣 MOFU</option>
          <option value="BOFU">🟢 BOFU</option>
        </select>

        {/* Date Range */}
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Time</option>
          <option value="active">Currently Active</option>
          <option value="thisMonth">This Month</option>
          <option value="lastMonth">Last Month</option>
          <option value="last30">Last 30 Days</option>
          <option value="last90">Last 90 Days</option>
        </select>
      </div>

      {/* Campaign List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredCampaigns.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-lg">No campaigns match your filters</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Campaign
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider w-20">
                  Status
                </th>
                <th 
                  className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 w-28"
                  onClick={() => handleSort("spend")}
                >
                  Spend {sortField === "spend" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th 
                  className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 w-24"
                  onClick={() => handleSort("pacing")}
                >
                  Pacing {sortField === "pacing" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th 
                  className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 w-24"
                  onClick={() => handleSort("clicks")}
                >
                  Clicks {sortField === "clicks" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th 
                  className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 w-20"
                  onClick={() => handleSort("ctr")}
                >
                  CTR {sortField === "ctr" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredCampaigns.map((campaign) => {
                const platform = platformConfig[campaign.platform] || { icon: "📊", name: campaign.platform };
                const status = statusConfig[campaign.status] || { label: campaign.status, color: "bg-gray-400" };
                const isExpanded = expandedId === campaign.id;

                return (
                  <tr 
                    key={campaign.id} 
                    className="hover:bg-gray-50 cursor-pointer transition"
                    onClick={() => setExpandedId(isExpanded ? null : campaign.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="text-lg mt-0.5" title={platform.name}>{platform.icon}</span>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{campaign.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {campaign.parsed.funnelStage && (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getFunnelStageColor(campaign.parsed.funnelStage)}`}>
                                {campaign.parsed.funnelStage}
                              </span>
                            )}
                            {campaign.parsed.product && (
                              <span className="text-xs text-gray-400">{campaign.parsed.product}</span>
                            )}
                            {campaign.parsed.isCompetitor && (
                              <span className="text-xs text-orange-500">vs {campaign.parsed.competitorName}</span>
                            )}
                            {campaign.channel && (
                              <span className="text-xs text-gray-300">• {campaign.channel}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${status.color}`} title={status.label} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium text-gray-900">
                        {campaign.spend ? formatCurrency(campaign.spend) : "—"}
                      </span>
                      {campaign.budget && (
                        <span className="text-xs text-gray-400 ml-1">
                          / {formatCurrency(campaign.budget)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {campaign.budget ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                campaign.pacing > 90 ? "bg-red-500" : 
                                campaign.pacing > 70 ? "bg-yellow-500" : "bg-green-500"
                              }`}
                              style={{ width: `${Math.min(campaign.pacing, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-8">{campaign.pacing.toFixed(0)}%</span>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatNumber(campaign.clicks || 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {campaign.ctr > 0 ? `${campaign.ctr.toFixed(2)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-400 text-right">
        Showing {filteredCampaigns.length} of {enrichedCampaigns.length} campaigns
      </div>
    </div>
  );
}
