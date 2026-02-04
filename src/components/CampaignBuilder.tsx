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
}

type BuilderMode = "select" | "create" | "modify";
type ModifyAction = "geo" | "split" | "merge" | "duplicate";

const REGIONS = [
  { id: "GLOBAL", label: "Global", countries: "All countries" },
  { id: "AMER", label: "Americas", countries: "US, CA, MX, BR, AR" },
  { id: "EMEA", label: "EMEA", countries: "UK, DE, FR, NL, ES, IT, AE, SA" },
  { id: "APAC", label: "APAC", countries: "AU, SG, JP, IN, HK" },
  { id: "MENA", label: "MENA", countries: "AE, SA, EG, IL" },
];

export default function CampaignBuilder() {
  const [mode, setMode] = useState<BuilderMode>("select");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [modifyAction, setModifyAction] = useState<ModifyAction | null>(null);
  
  // Split options
  const [splitRegions, setSplitRegions] = useState<string[]>([]);
  const [splitBudgetMode, setSplitBudgetMode] = useState<"equal" | "custom">("equal");

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

  const liveCampaigns = campaigns.filter(c => ["live", "active", "enabled"].includes(c.status));

  const resetBuilder = () => {
    setMode("select");
    setSelectedCampaign(null);
    setModifyAction(null);
    setSplitRegions([]);
  };

  const formatCurrency = (n: number | null) => {
    if (!n) return "—";
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  const toggleSplitRegion = (regionId: string) => {
    setSplitRegions(prev => 
      prev.includes(regionId) 
        ? prev.filter(r => r !== regionId)
        : [...prev, regionId]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400">Loading campaigns...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode Selection */}
      {mode === "select" && (
        <div className="grid grid-cols-2 gap-6">
          {/* Create New */}
          <div 
            className="bg-gray-800/50 backdrop-blur rounded-xl border-2 border-gray-700/50 p-8 hover:border-indigo-500/50 cursor-pointer transition group"
            onClick={() => setMode("create")}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center group-hover:bg-indigo-500/30 transition">
                <span className="text-2xl">➕</span>
              </div>
              <div>
                <h3 className="font-semibold text-white text-lg">Create New Campaign</h3>
                <p className="text-gray-400 text-sm">Build a new campaign from scratch</p>
              </div>
            </div>
            <ul className="text-sm text-gray-400 space-y-1 ml-16">
              <li>• Define targeting & budget</li>
              <li>• Generate ad copy</li>
              <li>• Launch to platform</li>
            </ul>
          </div>

          {/* Modify Existing */}
          <div 
            className="bg-gray-800/50 backdrop-blur rounded-xl border-2 border-gray-700/50 p-8 hover:border-emerald-500/50 cursor-pointer transition group"
            onClick={() => setMode("modify")}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center group-hover:bg-emerald-500/30 transition">
                <span className="text-2xl">✏️</span>
              </div>
              <div>
                <h3 className="font-semibold text-white text-lg">Modify Existing</h3>
                <p className="text-gray-400 text-sm">Change geo, split, merge campaigns</p>
              </div>
            </div>
            <ul className="text-sm text-gray-400 space-y-1 ml-16">
              <li>• Add/remove countries</li>
              <li>• Split GLOBAL → Regional</li>
              <li>• Merge Regional → GLOBAL</li>
              <li>• Duplicate campaign</li>
            </ul>
          </div>
        </div>
      )}

      {/* Create New Campaign */}
      {mode === "create" && (
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={resetBuilder} className="text-gray-400 hover:text-gray-200">
                ← Back
              </button>
              <h2 className="font-semibold text-white text-lg">Create New Campaign</h2>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 text-amber-400">
              <span>🚧</span>
              <span className="font-medium">Coming Soon</span>
            </div>
            <p className="text-sm text-amber-300/70 mt-1">
              Full campaign creation workflow is being built. For now, describe what you need in the chat and I&apos;ll help you create it.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Campaign Brief</label>
              <textarea 
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={4}
                placeholder="Describe your campaign: target audience, product, goal, regions, budget..."
              />
            </div>
            <button className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-500 transition">
              Generate Campaign Plan
            </button>
          </div>
        </div>
      )}

      {/* Modify Existing - Step 1: Select Campaign */}
      {mode === "modify" && !selectedCampaign && (
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={resetBuilder} className="text-gray-400 hover:text-gray-200">
                ← Back
              </button>
              <h2 className="font-semibold text-white text-lg">Select Campaign to Modify</h2>
            </div>
          </div>

          <div className="mb-4">
            <input 
              type="text" 
              placeholder="Search campaigns..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {liveCampaigns.map(campaign => (
              <div 
                key={campaign.id}
                className="flex items-center justify-between p-4 bg-gray-900/50 border border-gray-700/50 rounded-lg hover:bg-gray-700/50 cursor-pointer transition"
                onClick={() => setSelectedCampaign(campaign)}
              >
                <div>
                  <p className="font-medium text-white">{campaign.name}</p>
                  <p className="text-sm text-gray-400">
                    {campaign.platform === "google_ads" ? "Google Ads" : "StackAdapt"} • {campaign.channel || "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-white">{formatCurrency(campaign.spend)}</p>
                  <p className="text-xs text-gray-500">30-day spend</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modify Existing - Step 2: Select Action */}
      {mode === "modify" && selectedCampaign && !modifyAction && (
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedCampaign(null)} className="text-gray-400 hover:text-gray-200">
                ← Back
              </button>
              <div>
                <h2 className="font-semibold text-white text-lg">Modify Campaign</h2>
                <p className="text-sm text-gray-400">{selectedCampaign.name}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div 
              className="p-4 bg-gray-900/50 border-2 border-gray-700/50 rounded-lg hover:border-blue-500/50 cursor-pointer transition"
              onClick={() => setModifyAction("geo")}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">🌍</span>
                <span className="font-medium text-white">Change Geo Targeting</span>
              </div>
              <p className="text-sm text-gray-400">Add or remove countries from this campaign</p>
            </div>

            <div 
              className="p-4 bg-gray-900/50 border-2 border-gray-700/50 rounded-lg hover:border-emerald-500/50 cursor-pointer transition"
              onClick={() => setModifyAction("split")}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">✂️</span>
                <span className="font-medium text-white">Split by Region</span>
              </div>
              <p className="text-sm text-gray-400">Split GLOBAL into AMER, EMEA, APAC</p>
            </div>

            <div 
              className="p-4 bg-gray-900/50 border-2 border-gray-700/50 rounded-lg hover:border-purple-500/50 cursor-pointer transition"
              onClick={() => setModifyAction("merge")}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">🔗</span>
                <span className="font-medium text-white">Merge Campaigns</span>
              </div>
              <p className="text-sm text-gray-400">Combine regional campaigns into GLOBAL</p>
            </div>

            <div 
              className="p-4 bg-gray-900/50 border-2 border-gray-700/50 rounded-lg hover:border-amber-500/50 cursor-pointer transition"
              onClick={() => setModifyAction("duplicate")}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">📋</span>
                <span className="font-medium text-white">Duplicate Campaign</span>
              </div>
              <p className="text-sm text-gray-400">Copy with different targeting or product</p>
            </div>
          </div>
        </div>
      )}

      {/* Split by Region */}
      {mode === "modify" && selectedCampaign && modifyAction === "split" && (
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setModifyAction(null)} className="text-gray-400 hover:text-gray-200">
                ← Back
              </button>
              <div>
                <h2 className="font-semibold text-white text-lg">Split by Region</h2>
                <p className="text-sm text-gray-400">{selectedCampaign.name}</p>
              </div>
            </div>
          </div>

          {/* Current State */}
          <div className="bg-gray-900/50 rounded-lg p-4 mb-6 border border-gray-700/30">
            <h3 className="font-medium text-white mb-2">Current Campaign</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Budget:</span>
                <span className="ml-2 font-medium text-white">{formatCurrency(selectedCampaign.budget)}</span>
              </div>
              <div>
                <span className="text-gray-400">30-Day Spend:</span>
                <span className="ml-2 font-medium text-white">{formatCurrency(selectedCampaign.spend)}</span>
              </div>
              <div>
                <span className="text-gray-400">Platform:</span>
                <span className="ml-2 font-medium text-white">
                  {selectedCampaign.platform === "google_ads" ? "Google Ads" : "StackAdapt"}
                </span>
              </div>
            </div>
          </div>

          {/* Select Regions */}
          <div className="mb-6">
            <h3 className="font-medium text-white mb-3">Select Regions to Create</h3>
            <div className="grid grid-cols-3 gap-3">
              {REGIONS.filter(r => r.id !== "GLOBAL").map(region => (
                <div 
                  key={region.id}
                  className={`p-3 border-2 rounded-lg cursor-pointer transition ${
                    splitRegions.includes(region.id) 
                      ? "border-indigo-500 bg-indigo-500/10" 
                      : "border-gray-700 hover:border-gray-600 bg-gray-900/50"
                  }`}
                  onClick={() => toggleSplitRegion(region.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white">{region.label}</span>
                    {splitRegions.includes(region.id) && (
                      <span className="text-indigo-400">✓</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{region.countries}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Budget Split */}
          {splitRegions.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-white mb-3">Budget Allocation</h3>
              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={splitBudgetMode === "equal"} 
                    onChange={() => setSplitBudgetMode("equal")}
                    className="text-indigo-600"
                  />
                  <span className="text-sm text-gray-300">Split equally</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={splitBudgetMode === "custom"} 
                    onChange={() => setSplitBudgetMode("custom")}
                    className="text-indigo-600"
                  />
                  <span className="text-sm text-gray-300">Custom allocation</span>
                </label>
              </div>

              {/* Preview */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                <h4 className="font-medium text-emerald-400 mb-3">New Campaigns Preview</h4>
                <div className="space-y-2">
                  {splitRegions.map(regionId => {
                    const budgetPer = selectedCampaign.budget 
                      ? selectedCampaign.budget / splitRegions.length 
                      : 0;
                    const newName = selectedCampaign.name.replace(/GLOBAL/i, regionId);
                    
                    return (
                      <div key={regionId} className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">{newName}</span>
                        <span className="font-medium text-emerald-400">{formatCurrency(budgetPer)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-3 border-t border-emerald-500/20 flex justify-between text-sm">
                  <span className="text-gray-400">Original campaign will be paused</span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button 
              className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={splitRegions.length === 0}
              onClick={() => alert("Split workflow coming soon! For now, tell me in the chat which regions you want.")}
            >
              Create {splitRegions.length} Regional Campaigns
            </button>
            <button 
              className="px-6 py-3 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-700/50 transition"
              onClick={() => setModifyAction(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Geo Targeting */}
      {mode === "modify" && selectedCampaign && modifyAction === "geo" && (
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setModifyAction(null)} className="text-gray-400 hover:text-gray-200">
                ← Back
              </button>
              <div>
                <h2 className="font-semibold text-white text-lg">Change Geo Targeting</h2>
                <p className="text-sm text-gray-400">{selectedCampaign.name}</p>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-400">
              <span>🚧</span>
              <span className="font-medium">Coming Soon</span>
            </div>
            <p className="text-sm text-amber-300/70 mt-1">
              Geo targeting modification is being built. For now, tell me in the chat which countries you want to add or remove.
            </p>
          </div>
        </div>
      )}

      {/* Duplicate */}
      {mode === "modify" && selectedCampaign && modifyAction === "duplicate" && (
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setModifyAction(null)} className="text-gray-400 hover:text-gray-200">
                ← Back
              </button>
              <div>
                <h2 className="font-semibold text-white text-lg">Duplicate Campaign</h2>
                <p className="text-sm text-gray-400">{selectedCampaign.name}</p>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-400">
              <span>🚧</span>
              <span className="font-medium">Coming Soon</span>
            </div>
            <p className="text-sm text-amber-300/70 mt-1">
              Campaign duplication is being built. For now, tell me in the chat what you want to duplicate and with what changes.
            </p>
          </div>
        </div>
      )}

      {/* Merge */}
      {mode === "modify" && selectedCampaign && modifyAction === "merge" && (
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setModifyAction(null)} className="text-gray-400 hover:text-gray-200">
                ← Back
              </button>
              <div>
                <h2 className="font-semibold text-white text-lg">Merge Campaigns</h2>
                <p className="text-sm text-gray-400">{selectedCampaign.name}</p>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-400">
              <span>🚧</span>
              <span className="font-medium">Coming Soon</span>
            </div>
            <p className="text-sm text-amber-300/70 mt-1">
              Campaign merging is being built. For now, tell me in the chat which campaigns you want to merge into a GLOBAL campaign.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
