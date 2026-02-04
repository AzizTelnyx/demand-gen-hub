"use client";

import { useState, useEffect, useMemo } from "react";
import { parseCampaignName, ParsedCampaign } from "@/lib/parseCampaignName";
import { 
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer 
} from "recharts";

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

const COLORS = {
  funnel: {
    TOFU: "#3B82F6",
    MOFU: "#8B5CF6", 
    BOFU: "#10B981",
    ABM: "#F59E0B",
    UPSELL: "#EC4899",
    PARTNERSHIP: "#6366F1",
    Unknown: "#6B7280",
  },
  platform: {
    google_ads: "#4285F4",
    stackadapt: "#8B5CF6",
    linkedin: "#0A66C2",
    reddit: "#FF4500",
  },
};

const platformLabels: Record<string, string> = {
  google_ads: "Google Ads",
  stackadapt: "StackAdapt",
  linkedin: "LinkedIn",
  reddit: "Reddit",
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-white text-sm font-medium">{payload[0].name}</p>
        <p className="text-gray-300 text-sm">${payload[0].value?.toLocaleString()}</p>
      </div>
    );
  }
  return null;
};

export default function BudgetOverview() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [plannerInput, setPlannerInput] = useState("");

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

  // Enrich campaigns with parsed data (only live campaigns)
  const enrichedCampaigns: EnrichedCampaign[] = useMemo(() => {
    return campaigns
      .filter(c => ["live", "active", "enabled"].includes(c.status))
      .map(c => ({
        ...c,
        parsed: parseCampaignName(c.name),
      }));
  }, [campaigns]);

  // Calculate totals
  const totals = useMemo(() => {
    const spend = enrichedCampaigns.reduce((acc, c) => acc + (c.spend || 0), 0);
    const impressions = enrichedCampaigns.reduce((acc, c) => acc + (c.impressions || 0), 0);
    const clicks = enrichedCampaigns.reduce((acc, c) => acc + (c.clicks || 0), 0);
    
    return {
      spend,
      impressions,
      clicks,
      campaigns: enrichedCampaigns.length,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    };
  }, [enrichedCampaigns]);

  // Generate breakdown by dimension
  const getBreakdown = (dimension: Dimension) => {
    const groups: Record<string, { spend: number; clicks: number; impressions: number; campaigns: number }> = {};

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
        groups[key] = { spend: 0, clicks: 0, impressions: 0, campaigns: 0 };
      }
      groups[key].spend += c.spend || 0;
      groups[key].clicks += c.clicks || 0;
      groups[key].impressions += c.impressions || 0;
      groups[key].campaigns += 1;
    });

    return Object.entries(groups)
      .map(([key, data]) => ({
        name: dimension === "platform" ? (platformLabels[key] || key) : key,
        key,
        ...data,
        percentage: totals.spend > 0 ? (data.spend / totals.spend) * 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  };

  const funnelData = getBreakdown("funnel");
  const platformData = getBreakdown("platform");
  const regionData = getBreakdown("region");
  const channelData = getBreakdown("channel");

  const formatCurrency = (n: number) => {
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
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
      {/* Header Info */}
      <div className="bg-indigo-900/30 border border-indigo-700/50 rounded-xl p-4">
        <div className="flex items-center gap-2 text-indigo-300">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">Data Explanation</span>
        </div>
        <p className="text-sm text-indigo-200/70 mt-1">
          <strong>Spend:</strong> Actual spend over the last 30 days across all live campaigns. 
          <strong className="ml-2">Budget:</strong> Google Ads = daily budgets × 30, StackAdapt = flight lifetime budgets.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-5 border border-gray-700/50">
          <div className="text-sm text-gray-400 mb-1">Live Campaigns</div>
          <div className="text-2xl font-bold text-white">{totals.campaigns}</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-5 border border-gray-700/50">
          <div className="text-sm text-gray-400 mb-1">30-Day Spend</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(totals.spend)}</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-5 border border-gray-700/50">
          <div className="text-sm text-gray-400 mb-1">Impressions</div>
          <div className="text-2xl font-bold text-white">{formatNumber(totals.impressions)}</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-5 border border-gray-700/50">
          <div className="text-sm text-gray-400 mb-1">Clicks</div>
          <div className="text-2xl font-bold text-white">{formatNumber(totals.clicks)}</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-5 border border-gray-700/50">
          <div className="text-sm text-gray-400 mb-1">Avg CPC</div>
          <div className="text-2xl font-bold text-white">${totals.cpc.toFixed(2)}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Funnel Pie Chart */}
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          <h3 className="font-semibold text-white mb-4">Spend by Funnel Stage</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={funnelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="spend"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {funnelData.map((entry) => (
                    <Cell 
                      key={entry.key} 
                      fill={COLORS.funnel[entry.key as keyof typeof COLORS.funnel] || COLORS.funnel.Unknown} 
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
            {funnelData.map(item => (
              <div key={item.key} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0" 
                  style={{ backgroundColor: COLORS.funnel[item.key as keyof typeof COLORS.funnel] || COLORS.funnel.Unknown }}
                />
                <span className="text-gray-300 truncate">{item.name}: {formatCurrency(item.spend)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Platform Pie Chart */}
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          <h3 className="font-semibold text-white mb-4">Spend by Platform</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="spend"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {platformData.map((entry) => (
                    <Cell 
                      key={entry.key} 
                      fill={COLORS.platform[entry.key as keyof typeof COLORS.platform] || "#6B7280"} 
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex justify-center gap-6 text-sm">
            {platformData.map(item => (
              <div key={item.key} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0" 
                  style={{ backgroundColor: COLORS.platform[item.key as keyof typeof COLORS.platform] || "#6B7280" }}
                />
                <span className="text-gray-300">{item.name}: {formatCurrency(item.spend)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bar Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Region Bar Chart */}
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          <h3 className="font-semibold text-white mb-4">Spend by Region</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionData} layout="vertical">
                <XAxis 
                  type="number" 
                  tickFormatter={(v) => formatCurrency(v)} 
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#374151' }}
                  tickLine={{ stroke: '#374151' }}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={80} 
                  tick={{ fill: '#D1D5DB', fontSize: 12 }}
                  axisLine={{ stroke: '#374151' }}
                  tickLine={{ stroke: '#374151' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="spend" fill="#6366F1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Channel Bar Chart */}
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          <h3 className="font-semibold text-white mb-4">Spend by Channel</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData} layout="vertical">
                <XAxis 
                  type="number" 
                  tickFormatter={(v) => formatCurrency(v)} 
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  axisLine={{ stroke: '#374151' }}
                  tickLine={{ stroke: '#374151' }}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={80} 
                  tick={{ fill: '#D1D5DB', fontSize: 12 }}
                  axisLine={{ stroke: '#374151' }}
                  tickLine={{ stroke: '#374151' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="spend" fill="#10B981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Budget Planner Section */}
      <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xl">💡</span>
          <h3 className="font-semibold text-white">Budget Planner</h3>
          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">Coming Soon</span>
        </div>
        
        <p className="text-gray-400 text-sm mb-4">
          Describe how you want to reallocate budget. I&apos;ll show you the exact changes and projected impact before you approve.
        </p>
        
        <div className="bg-gray-900/50 rounded-lg p-4 mb-4 border border-gray-700/30">
          <p className="text-sm text-gray-500 mb-2">Example commands:</p>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• &quot;Shift $5K from TOFU to BOFU&quot;</li>
            <li>• &quot;Increase Voice AI budget by 20%&quot;</li>
            <li>• &quot;Move $3K from StackAdapt to Google Ads&quot;</li>
            <li>• &quot;Reduce APAC spend by $2K and add to AMER&quot;</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Describe your budget change..."
            value={plannerInput}
            onChange={(e) => setPlannerInput(e.target.value)}
            className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button 
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition"
            onClick={() => alert("Budget planning coming soon! For now, tell me in the main chat what changes you want.")}
          >
            Plan Change
          </button>
        </div>
      </div>
    </div>
  );
}
