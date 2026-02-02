"use client";

import { useState, useEffect } from "react";

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  channel: string;
  budget: number;
  spend: number;
  startDate: string;
  endDate: string;
}

// Mock data for now - will be replaced with API calls
const mockCampaigns: Campaign[] = [
  {
    id: "1",
    name: "202510 TOFU AI Agent DA Global",
    platform: "stackadapt",
    status: "live",
    channel: "Display",
    budget: 500,
    spend: 320,
    startDate: "2026-01-05",
    endDate: "2026-02-06",
  },
  {
    id: "2",
    name: "202602 BOFU AI Agent LiveKit SA GLOBAL",
    platform: "google_ads",
    status: "live",
    channel: "Search",
    budget: 3000,
    spend: 150,
    startDate: "2026-02-02",
    endDate: "2026-03-02",
  },
  {
    id: "3",
    name: "202511 MOFU AI Agent DA Global",
    platform: "stackadapt",
    status: "live",
    channel: "Display",
    budget: 2000,
    spend: 1450,
    startDate: "2025-11-12",
    endDate: "2026-02-28",
  },
  {
    id: "4",
    name: "202501 TOFU AI Agent Fintech DA GLOBAL",
    platform: "stackadapt",
    status: "live",
    channel: "Display",
    budget: 1000,
    spend: 280,
    startDate: "2026-01-16",
    endDate: "2026-03-16",
  },
];

const statusColors: Record<string, string> = {
  live: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  ended: "bg-gray-100 text-gray-800",
  draft: "bg-blue-100 text-blue-800",
};

const platformIcons: Record<string, string> = {
  google_ads: "🔍",
  stackadapt: "📺",
  linkedin: "💼",
};

export default function CampaignsDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(mockCampaigns);
  const [filter, setFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const filteredCampaigns = campaigns.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    if (platformFilter !== "all" && c.platform !== platformFilter) return false;
    return true;
  });

  const stats = {
    total: campaigns.length,
    live: campaigns.filter((c) => c.status === "live").length,
    totalBudget: campaigns.reduce((acc, c) => acc + c.budget, 0),
    totalSpend: campaigns.reduce((acc, c) => acc + c.spend, 0),
  };

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

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="live">Live</option>
          <option value="paused">Paused</option>
          <option value="ended">Ended</option>
          <option value="draft">Draft</option>
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
        <button className="ml-auto bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition">
          🔄 Sync Now
        </button>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
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
              const pacing = campaign.budget > 0 ? (campaign.spend / campaign.budget) * 100 : 0;
              const pacingColor = pacing > 90 ? "text-red-600" : pacing > 70 ? "text-yellow-600" : "text-green-600";

              return (
                <tr key={campaign.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{campaign.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-lg" title={campaign.platform}>
                      {platformIcons[campaign.platform] || "📊"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[campaign.status]}`}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{campaign.channel}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">${campaign.budget.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">${campaign.spend.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-sm font-medium text-right ${pacingColor}`}>{pacing.toFixed(0)}%</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {campaign.startDate} → {campaign.endDate}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
