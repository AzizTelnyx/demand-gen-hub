"use client";

import { useState, useEffect, useMemo } from "react";
import { parseCampaignName, ParsedCampaign } from "@/lib/parseCampaignName";

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

interface EnrichedCampaign extends Campaign {
  parsed: ParsedCampaign;
}

type Dimension = "platform" | "region" | "channel" | "product" | "funnel";

interface BreakdownItem {
  key: string;
  label: string;
  budget: number;
  spend: number;
  campaigns: number;
  pacing: number;
}

const dimensionConfig: Record<Dimension, { label: string; icon: string }> = {
  platform: { label: "Platform", icon: "🔌" },
  region: { label: "Region", icon: "🌍" },
  channel: { label: "Channel", icon: "📺" },
  product: { label: "Product", icon: "📦" },
  funnel: { label: "Funnel Stage", icon: "🎯" },
};

const platformLabels: Record<string, string> = {
  google_ads: "Google Ads",
  stackadapt: "StackAdapt",
  linkedin: "LinkedIn",
  reddit: "Reddit",
};

const channelLabels: Record<string, string> = {
  search: "Search",
  display: "Display",
  native: "Native",
  video: "Video",
  dooh: "DOOH",
  ctv: "CTV",
  social: "Social",
};

export default function BudgetOverview() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "live">("live");
  const [expandedDimension, setExpandedDimension] = useState<Dimension | null>(null);

  useEffect(() => {
    fetch("/api/campaigns")
      .then(res => res.json())
      .then(data => {
        setCampaigns(data.campaigns || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching campaigns:", err);
        setLoading(false);
      });
  }, []);

  // Enrich campaigns with parsed data
  const enrichedCampaigns: EnrichedCampaign[] = useMemo(() => {
    return campaigns
      .filter(c => statusFilter === "all" || ["live", "active", "enabled"].includes(c.status))
      .map(c => ({
        ...c,
        parsed: parseCampaignName(c.name),
      }));
  }, [campaigns, statusFilter]);

  // Calculate totals
  const totals = useMemo(() => {
    const budget = enrichedCampaigns.reduce((acc, c) => acc + (c.budget || 0), 0);
    const spend = enrichedCampaigns.reduce((acc, c) => acc + (c.spend || 0), 0);
    const impressions = enrichedCampaigns.reduce((acc, c) => acc + (c.impressions || 0), 0);
    const clicks = enrichedCampaigns.reduce((acc, c) => acc + (c.clicks || 0), 0);
    
    return {
      budget,
      spend,
      pacing: budget > 0 ? (spend / budget) * 100 : 0,
      impressions,
      clicks,
      campaigns: enrichedCampaigns.length,
    };
  }, [enrichedCampaigns]);

  // Generate breakdown by dimension
  const getBreakdown = (dimension: Dimension): BreakdownItem[] => {
    const groups: Record<string, { budget: number; spend: number; campaigns: number }> = {};

    enrichedCampaigns.forEach(c => {
      let key: string;
      
      switch (dimension) {
        case "platform":
          key = c.platform;
          break;
        case "region":
          key = c.parsed.region || "Unknown";
          break;
        case "channel":
          key = c.channel || c.parsed.channel || "Unknown";
          break;
        case "product":
          key = c.parsed.product || "Unknown";
          break;
        case "funnel":
          key = c.parsed.funnelStage || "Unknown";
          break;
        default:
          key = "Unknown";
      }

      if (!groups[key]) {
        groups[key] = { budget: 0, spend: 0, campaigns: 0 };
      }
      groups[key].budget += c.budget || 0;
      groups[key].spend += c.spend || 0;
      groups[key].campaigns += 1;
    });

    return Object.entries(groups)
      .map(([key, data]) => ({
        key,
        label: dimension === "platform" ? (platformLabels[key] || key) :
               dimension === "channel" ? (channelLabels[key] || key) :
               key,
        ...data,
        pacing: data.budget > 0 ? (data.spend / data.budget) * 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  };

  const formatCurrency = (n: number, short = false) => {
    if (short) {
      if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
      return `$${n.toFixed(0)}`;
    }
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const getPacingColor = (pacing: number) => {
    if (pacing > 95) return "text-red-600";
    if (pacing > 80) return "text-yellow-600";
    return "text-green-600";
  };

  const getBarColor = (dimension: Dimension, key: string) => {
    if (dimension === "funnel") {
      if (key === "TOFU") return "bg-blue-500";
      if (key === "MOFU") return "bg-purple-500";
      if (key === "BOFU") return "bg-green-500";
      if (key === "ABM") return "bg-orange-500";
      return "bg-gray-400";
    }
    if (dimension === "platform") {
      if (key === "google_ads") return "bg-blue-500";
      if (key === "stackadapt") return "bg-purple-500";
      if (key === "linkedin") return "bg-sky-500";
      if (key === "reddit") return "bg-orange-500";
      return "bg-gray-400";
    }
    return "bg-indigo-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400">Loading budget data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {[
            { value: "live", label: "Live Campaigns" },
            { value: "all", label: "All Campaigns" },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value as "live" | "all")}
              className={`px-4 py-2 text-sm rounded-md transition ${
                statusFilter === opt.value
                  ? "bg-white shadow text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="text-sm text-gray-500">
          Data period: <span className="font-medium">Last 30 days</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Total Budget</div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(totals.budget)}</div>
          <div className="text-xs text-gray-400 mt-1">{totals.campaigns} campaigns</div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Total Spend</div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(totals.spend)}</div>
          <div className={`text-xs mt-1 ${getPacingColor(totals.pacing)}`}>
            {totals.pacing.toFixed(0)}% of budget
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Impressions</div>
          <div className="text-2xl font-bold text-gray-900">{formatNumber(totals.impressions)}</div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Clicks</div>
          <div className="text-2xl font-bold text-gray-900">{formatNumber(totals.clicks)}</div>
          <div className="text-xs text-gray-400 mt-1">
            {totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : 0}% CTR
          </div>
        </div>
      </div>

      {/* Dimension Breakdowns */}
      <div className="grid grid-cols-2 gap-4">
        {(["platform", "funnel", "region", "channel", "product"] as Dimension[]).map(dim => {
          const breakdown = getBreakdown(dim);
          const config = dimensionConfig[dim];
          const isExpanded = expandedDimension === dim;
          const maxSpend = Math.max(...breakdown.map(b => b.spend), 1);

          return (
            <div 
              key={dim} 
              className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${
                isExpanded ? "col-span-2" : ""
              }`}
            >
              <div 
                className="px-5 py-4 border-b border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedDimension(isExpanded ? null : dim)}
              >
                <div className="flex items-center gap-2">
                  <span>{config.icon}</span>
                  <span className="font-medium text-gray-900">{config.label}</span>
                  <span className="text-xs text-gray-400">({breakdown.length})</span>
                </div>
                <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
              </div>
              
              <div className={`p-4 ${isExpanded ? "" : "max-h-64 overflow-y-auto"}`}>
                {breakdown.length === 0 ? (
                  <div className="text-gray-400 text-sm text-center py-4">No data</div>
                ) : (
                  <div className="space-y-3">
                    {breakdown.map(item => (
                      <div key={item.key} className="group">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900">{item.label}</span>
                            <span className="text-xs text-gray-400">({item.campaigns})</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-gray-900 font-medium">{formatCurrency(item.spend, true)}</span>
                            {item.budget > 0 && (
                              <span className={`text-xs ${getPacingColor(item.pacing)}`}>
                                {item.pacing.toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${getBarColor(dim, item.key)}`}
                            style={{ width: `${(item.spend / maxSpend) * 100}%` }}
                          />
                        </div>
                        {isExpanded && (
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                            <span>Budget: {formatCurrency(item.budget, true)}</span>
                            <span>Spend: {formatCurrency(item.spend, true)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Budget Planning Section (Placeholder) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xl">💡</span>
          <h3 className="font-medium text-gray-900">Budget Planner</h3>
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Coming Soon</span>
        </div>
        <p className="text-gray-500 text-sm mb-4">
          Plan budget changes with natural language. Example: &quot;Shift $5K from TOFU to BOFU&quot; or &quot;Increase Voice AI budget by 20%&quot;
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Describe your budget change..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
            disabled
          />
          <button 
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed"
            disabled
          >
            Plan Change
          </button>
        </div>
      </div>
    </div>
  );
}
