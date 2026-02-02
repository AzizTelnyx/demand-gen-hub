"use client";

import { useState, useEffect } from "react";

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
  startDate: string | null;
  endDate: string | null;
  lastSyncedAt: string | null;
}

interface SyncState {
  lastSyncedAt: string | null;
  status: string;
}

const statusColors: Record<string, string> = {
  live: "bg-green-100 text-green-800",
  active: "bg-green-100 text-green-800",
  enabled: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  ended: "bg-gray-100 text-gray-800",
  draft: "bg-blue-100 text-blue-800",
};

const platformIcons: Record<string, string> = {
  google_ads: "🔍",
  stackadapt: "📺",
  linkedin: "💼",
};

const platformNames: Record<string, string> = {
  google_ads: "Google Ads",
  stackadapt: "StackAdapt",
  linkedin: "LinkedIn",
};

export default function CampaignsDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`/api/campaigns?platform=${platformFilter}&status=${filter}`);
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
  }, [filter, platformFilter]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      // Wait a bit for sync to complete
      setTimeout(() => {
        fetchCampaigns();
        setSyncing(false);
      }, 5000);
    } catch (error) {
      console.error("Error syncing:", error);
      setSyncing(false);
    }
  };

  const filteredCampaigns = campaigns.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    if (platformFilter !== "all" && c.platform !== platformFilter) return false;
    return true;
  });

  const stats = {
    total: campaigns.length,
    live: campaigns.filter((c) => ["live", "active", "enabled"].includes(c.status)).length,
    totalBudget: campaigns.reduce((acc, c) => acc + (c.budget || 0), 0),
    totalSpend: campaigns.reduce((acc, c) => acc + (c.spend || 0), 0),
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
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
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Total Campaigns</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Live</p>
          <p className="text-2xl font-bold text-green-600">{stats.live}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Total Budget</p>
          <p className="text-2xl font-bold">${stats.totalBudget.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-500 text-sm">Total Spend</p>
          <p className="text-2xl font-bold">${stats.totalSpend.toLocaleString()}</p>
        </div>
      </div>

      {/* Sync Status */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-6">
            {Object.entries(syncStates).map(([platform, state]) => (
              <div key={platform} className="flex items-center gap-2 text-sm">
                <span>{platformIcons[platform]}</span>
                <span className="text-gray-600">{platformNames[platform]}:</span>
                <span className="text-gray-500">{formatLastSync(state.lastSyncedAt)}</span>
                {state.status === "error" && (
                  <span className="text-red-500 text-xs">⚠️ Error</span>
                )}
              </div>
            ))}
            {Object.keys(syncStates).length === 0 && (
              <span className="text-gray-400 text-sm">No sync history yet</span>
            )}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition disabled:opacity-50"
          >
            {syncing ? "⏳ Syncing..." : "🔄 Sync Now"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="live">Live</option>
          <option value="active">Active</option>
          <option value="enabled">Enabled</option>
          <option value="paused">Paused</option>
          <option value="ended">Ended</option>
        </select>
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm"
        >
          <option value="all">All Platforms</option>
          <option value="google_ads">Google Ads</option>
          <option value="stackadapt">StackAdapt</option>
          <option value="linkedin">LinkedIn</option>
        </select>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredCampaigns.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="mb-2">No campaigns found</p>
            <p className="text-sm">Click "Sync Now" to pull campaigns from your ad platforms</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Campaign</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Platform</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Channel</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Budget</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Spend</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Pacing</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Dates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCampaigns.map((campaign) => {
                const budget = campaign.budget || 0;
                const spend = campaign.spend || 0;
                const pacing = budget > 0 ? (spend / budget) * 100 : 0;
                const pacingColor = pacing > 90 ? "text-red-600" : pacing > 70 ? "text-yellow-600" : "text-green-600";

                return (
                  <tr key={campaign.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{campaign.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-lg" title={platformNames[campaign.platform]}>
                        {platformIcons[campaign.platform] || "📊"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[campaign.status] || "bg-gray-100 text-gray-800"}`}>
                        {campaign.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{campaign.channel || "-"}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {budget > 0 ? `$${budget.toLocaleString()}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {spend > 0 ? `$${spend.toLocaleString()}` : "-"}
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium text-right ${pacingColor}`}>
                      {budget > 0 ? `${pacing.toFixed(0)}%` : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(campaign.startDate)} → {formatDate(campaign.endDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
