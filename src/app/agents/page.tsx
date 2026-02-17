"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

interface AgentStatus {
  id: string;
  name: string;
  status: "active" | "on-demand" | "coming-soon";
  schedule: string;
  lastRun: string | null;
  nextRun: string | null;
  description: string;
}

interface ActivityEntry {
  timestamp: string;
  agent: string;
  action: string;
  status: string;
  summary: string;
  report?: string;
  structured?: Record<string, any>;
  details?: Record<string, any>;
  findings?: any[];
  steps?: any[];
  metrics?: {
    time_saved_hours?: number;
    budget_optimized?: number;
    campaigns_created?: number;
  };
}

const statusColors = {
  active: "bg-emerald-500",
  "on-demand": "bg-blue-500",
  "coming-soon": "bg-gray-500",
};

const agentColors: Record<string, string> = {
  "Campaign Optimizer": "border-blue-500 bg-blue-500/10",
  "Campaign Deep Dive": "border-orange-500 bg-orange-500/10",
};

const agentBadgeColors: Record<string, string> = {
  "Campaign Optimizer": "bg-blue-500/20 text-blue-300",
  "Campaign Deep Dive": "bg-orange-500/20 text-orange-300",
};

function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return "Never";
  
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [expandedActivity, setExpandedActivity] = useState<number | null>(null);

  // Deep Dive modal state
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [deepDiveCampaign, setDeepDiveCampaign] = useState("");
  const [deepDiveDryRun, setDeepDiveDryRun] = useState(true);
  const [deepDiveRunning, setDeepDiveRunning] = useState(false);
  const [deepDiveStatus, setDeepDiveStatus] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, activityRes] = await Promise.all([
        fetch("/api/agents/status"),
        fetch("/api/agents/activity"),
      ]);

      const statusData = await statusRes.json();
      const activityData = await activityRes.json();

      setAgents(statusData.agents || []);
      setActivities(activityData.activities || []);
    } catch (error) {
      console.error("Failed to fetch agent data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  // Poll deep dive running status
  useEffect(() => {
    if (!deepDiveRunning) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/agents/deep-dive");
        const data = await res.json();
        if (!data.running) {
          setDeepDiveRunning(false);
          setDeepDiveStatus("✅ Deep dive completed!");
          fetchData(); // Refresh activity feed
          setTimeout(() => setDeepDiveStatus(null), 5000);
        }
      } catch { /* ignore polling errors */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [deepDiveRunning, fetchData]);

  const handleRunDeepDive = async () => {
    if (!deepDiveCampaign.trim()) return;
    setDeepDiveRunning(true);
    setDeepDiveStatus("🔍 Deep dive started...");
    try {
      const res = await fetch("/api/agents/deep-dive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign: deepDiveCampaign.trim(),
          dryRun: deepDiveDryRun,
        }),
      });
      const data = await res.json();
      if (data.status === "started") {
        setDeepDiveOpen(false);
        setDeepDiveCampaign("");
      } else {
        setDeepDiveRunning(false);
        setDeepDiveStatus("❌ Failed to start deep dive");
        setTimeout(() => setDeepDiveStatus(null), 5000);
      }
    } catch {
      setDeepDiveRunning(false);
      setDeepDiveStatus("❌ Failed to start deep dive");
      setTimeout(() => setDeepDiveStatus(null), 5000);
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekActivities = activities.filter(
      (a) => new Date(a.timestamp) >= weekAgo
    );

    const totalRuns = weekActivities.length;
    const timesSaved = weekActivities.reduce(
      (sum, a) => sum + (a.metrics?.time_saved_hours || 0),
      0
    );
    const budgetOptimized = weekActivities.reduce(
      (sum, a) => sum + (a.metrics?.budget_optimized || 0),
      0
    );

    let actionsTaken = 0;
    weekActivities.forEach((a) => {
      if (a.findings) actionsTaken += a.findings.length;
      if (a.metrics?.campaigns_created) actionsTaken += a.metrics.campaigns_created;
    });

    return {
      totalRuns,
      actionsTaken,
      timesSaved,
      budgetOptimized,
    };
  }, [activities]);

  const filteredActivities = useMemo(() => {
    if (selectedAgent === "all") return activities;
    return activities.filter((a) => a.agent === selectedAgent);
  }, [activities, selectedAgent]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading agent activity...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Activity</h1>
          <p className="text-gray-400 text-sm mt-1">
            Autonomous agents managing your demand gen operations
          </p>
        </div>
        <button
          onClick={() => setDeepDiveOpen(true)}
          disabled={deepDiveRunning}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            deepDiveRunning
              ? "bg-orange-500/20 text-orange-300 cursor-not-allowed"
              : "bg-orange-500 hover:bg-orange-600 text-white"
          }`}
        >
          {deepDiveRunning ? (
            <>
              <span className="animate-spin">⏳</span> Running Deep Dive...
            </>
          ) : (
            <>🔍 Run Deep Dive</>
          )}
        </button>
      </div>

      {/* Deep Dive Status Toast */}
      {deepDiveStatus && (
        <div className="bg-gray-800 border border-orange-500/30 rounded-lg px-4 py-3 text-sm text-orange-300 animate-fade-in">
          {deepDiveStatus}
        </div>
      )}

      {/* Deep Dive Modal */}
      {deepDiveOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDeepDiveOpen(false)}>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-1">🔍 Run Campaign Deep Dive</h3>
            <p className="text-gray-400 text-sm mb-4">
              Investigate a campaign: search terms, ad groups, ad copy, geo/device, landing pages, and bidding.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={deepDiveCampaign}
                  onChange={(e) => setDeepDiveCampaign(e.target.value)}
                  placeholder="e.g., 202602 BOFU AI Agent LiveKit SA GLOBAL"
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-500"
                  onKeyDown={(e) => { if (e.key === "Enter") handleRunDeepDive(); }}
                  autoFocus
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deepDiveDryRun}
                  onChange={(e) => setDeepDiveDryRun(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-300">Dry run</span>
                <span className="text-xs text-gray-500">(analyze only, no changes)</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDeepDiveOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRunDeepDive}
                  disabled={!deepDiveCampaign.trim()}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    deepDiveCampaign.trim()
                      ? "bg-orange-500 hover:bg-orange-600 text-white"
                      : "bg-gray-700 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  🚀 Start Investigation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-sm">Runs This Week</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.totalRuns}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-sm">Actions Taken</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.actionsTaken}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-sm">Time Saved</div>
          <div className="text-2xl font-bold text-white mt-1">
            {stats.timesSaved.toFixed(1)}h
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-gray-400 text-sm">Budget Optimized</div>
          <div className="text-2xl font-bold text-white mt-1">
            ${stats.budgetOptimized.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Agent Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`bg-gray-800 rounded-lg p-4 border-l-4 ${
              agentColors[agent.name as keyof typeof agentColors]
            } transition-all hover:shadow-lg`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-white">{agent.name}</h3>
                <p className="text-xs text-gray-400 mt-1">{agent.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {agent.status === "active" && (
                  <div className="relative">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <div className="absolute inset-0 w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
                  </div>
                )}
                <span
                  className={`px-2 py-1 rounded text-xs font-medium text-white ${
                    statusColors[agent.status]
                  }`}
                >
                  {agent.status === "active"
                    ? "Active"
                    : agent.status === "on-demand"
                    ? "On Demand"
                    : "Coming Soon"}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Schedule:</span>
                <span className="text-gray-300">{agent.schedule}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Last Run:</span>
                <span className="text-gray-300">{formatTimeAgo(agent.lastRun)}</span>
              </div>
              {agent.nextRun && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Next Run:</span>
                  <span className="text-gray-300">{formatTimeAgo(agent.nextRun)}</span>
                </div>
              )}
            </div>

            {/* Deep Dive trigger button on its card */}
            {agent.id === "campaign-deep-dive" && (
              <button
                onClick={() => setDeepDiveOpen(true)}
                disabled={deepDiveRunning}
                className={`mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  deepDiveRunning
                    ? "bg-orange-500/20 text-orange-300 cursor-not-allowed"
                    : "bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30"
                }`}
              >
                {deepDiveRunning ? (
                  <><span className="animate-spin">⏳</span> Running...</>
                ) : (
                  <>🔍 Run Deep Dive</>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Activity Feed */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Activity Feed</h2>
            <div className="flex items-center gap-3">
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="bg-gray-700 text-white text-sm rounded px-3 py-1.5 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Agents</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.name}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-700">
          {filteredActivities.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No activity found for the selected filters
            </div>
          ) : (
            filteredActivities.map((activity, index) => (
              <div
                key={index}
                className={`p-4 hover:bg-gray-750 transition-colors cursor-pointer ${
                  expandedActivity === index ? "bg-gray-750" : ""
                }`}
                onClick={() =>
                  setExpandedActivity(expandedActivity === index ? null : index)
                }
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        agentBadgeColors[activity.agent as keyof typeof agentBadgeColors]
                      }`}
                    >
                      {activity.agent}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-white font-medium">{activity.summary}</p>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                          <span>{formatDateTime(activity.timestamp)}</span>
                          <span>•</span>
                          <span className="capitalize">{activity.action.replace(/_/g, " ")}</span>
                          {activity.details && (
                            <>
                              <span>•</span>
                              <span>
                                {Object.entries(activity.details)
                                  .filter(([key]) => 
                                    ["campaigns_checked", "campaigns_created", "keywords_added"].includes(key)
                                  )
                                  .map(([key, value]) => `${value} ${key.replace(/_/g, " ")}`)
                                  .join(", ")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {activity.metrics && (
                        <div className="flex gap-4 text-sm flex-shrink-0">
                          {activity.metrics.time_saved_hours && (
                            <div className="text-right">
                              <div className="text-gray-400">Time Saved</div>
                              <div className="text-blue-400 font-medium">
                                {activity.metrics.time_saved_hours}h
                              </div>
                            </div>
                          )}
                          {activity.metrics.budget_optimized && activity.metrics.budget_optimized > 0 && (
                            <div className="text-right">
                              <div className="text-gray-400">Budget Impact</div>
                              <div className="text-emerald-400 font-medium">
                                ${activity.metrics.budget_optimized}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expanded Details */}
                    {expandedActivity === index && (
                      <div className="mt-4 pt-4 border-t border-gray-700 space-y-4 animate-fade-in">
                        
                        {/* Quick Stats Grid */}
                        {activity.details && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {activity.details.healthy !== undefined && (
                              <div className="bg-gray-900 rounded p-3">
                                <div className="text-xs text-gray-400">🟢 Healthy</div>
                                <div className="text-lg font-bold text-emerald-400">{activity.details.healthy}</div>
                              </div>
                            )}
                            {activity.details.watch !== undefined && (
                              <div className="bg-gray-900 rounded p-3">
                                <div className="text-xs text-gray-400">🟡 Watch</div>
                                <div className="text-lg font-bold text-amber-400">{activity.details.watch}</div>
                              </div>
                            )}
                            {activity.details.action_needed !== undefined && (
                              <div className="bg-gray-900 rounded p-3">
                                <div className="text-xs text-gray-400">🔴 Action Needed</div>
                                <div className="text-lg font-bold text-red-400">{activity.details.action_needed}</div>
                              </div>
                            )}
                            {activity.details.contact_sales !== undefined && (
                              <div className="bg-gray-900 rounded p-3">
                                <div className="text-xs text-gray-400">🎯 Contact Sales</div>
                                <div className="text-lg font-bold text-blue-400">{activity.details.contact_sales}</div>
                              </div>
                            )}
                            {activity.details.signups !== undefined && activity.details.signups > 0 && (
                              <div className="bg-gray-900 rounded p-3">
                                <div className="text-xs text-gray-400">📝 Signups</div>
                                <div className="text-lg font-bold text-indigo-400">{Math.round(activity.details.signups)}</div>
                              </div>
                            )}
                            {activity.details.terms_analyzed !== undefined && activity.details.terms_analyzed > 0 && (
                              <div className="bg-gray-900 rounded p-3">
                                <div className="text-xs text-gray-400">🔍 Terms Analyzed</div>
                                <div className="text-lg font-bold text-white">{activity.details.terms_analyzed.toLocaleString()}</div>
                              </div>
                            )}
                            {activity.details.negatives_added !== undefined && activity.details.negatives_added > 0 && (
                              <div className="bg-gray-900 rounded p-3">
                                <div className="text-xs text-gray-400">🚫 Negatives Added</div>
                                <div className="text-lg font-bold text-red-400">{activity.details.negatives_added}</div>
                              </div>
                            )}
                            {activity.details.flagged_for_review !== undefined && activity.details.flagged_for_review > 0 && (
                              <div className="bg-gray-900 rounded p-3">
                                <div className="text-xs text-gray-400">🔎 Flagged for Review</div>
                                <div className="text-lg font-bold text-amber-400">{activity.details.flagged_for_review}</div>
                              </div>
                            )}
                            {activity.details.recommended_actions !== undefined && activity.details.recommended_actions > 0 && (
                              <div className="bg-gray-900 rounded p-3">
                                <div className="text-xs text-gray-400">📋 Recommendations</div>
                                <div className="text-lg font-bold text-orange-400">{activity.details.recommended_actions}</div>
                              </div>
                            )}
                            {activity.details.campaign !== undefined && (
                              <div className="bg-gray-900 rounded p-3 col-span-2">
                                <div className="text-xs text-gray-400">🎯 Campaign</div>
                                <div className="text-sm font-bold text-white truncate">{activity.details.campaign}</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Deep Dive Modules Overview */}
                        {activity.structured?.deep_dive_modules && (
                          <div>
                            <h4 className="text-sm font-medium text-orange-400 mb-3">
                              🔍 Investigation Modules
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                              {activity.structured.deep_dive_modules.search_terms && (
                                <div className="bg-gray-900 rounded p-3 border border-gray-700">
                                  <div className="text-xs text-gray-400 mb-1">Search Terms</div>
                                  <div className="text-lg font-bold text-white">{activity.structured.deep_dive_modules.search_terms.total}</div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {activity.structured.deep_dive_modules.search_terms.classifications?.relevant || 0} relevant · {activity.structured.deep_dive_modules.search_terms.classifications?.competitor || 0} competitor
                                  </div>
                                </div>
                              )}
                              {activity.structured.deep_dive_modules.ad_groups && (
                                <div className="bg-gray-900 rounded p-3 border border-gray-700">
                                  <div className="text-xs text-gray-400 mb-1">Ad Groups</div>
                                  <div className="text-lg font-bold text-white">{activity.structured.deep_dive_modules.ad_groups.count}</div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    ${activity.structured.deep_dive_modules.ad_groups.total_spend?.toFixed(0) || 0} spend
                                  </div>
                                </div>
                              )}
                              {activity.structured.deep_dive_modules.geo_device && (
                                <div className="bg-gray-900 rounded p-3 border border-gray-700">
                                  <div className="text-xs text-gray-400 mb-1">Geo/Device</div>
                                  <div className="text-lg font-bold text-white">{activity.structured.deep_dive_modules.geo_device.recommendations}</div>
                                  <div className="text-xs text-gray-500 mt-1">recommendations</div>
                                </div>
                              )}
                              {activity.structured.deep_dive_modules.bidding && (
                                <div className="bg-gray-900 rounded p-3 border border-gray-700">
                                  <div className="text-xs text-gray-400 mb-1">Bidding</div>
                                  <div className="text-sm font-bold text-white">{
                                    typeof activity.structured.deep_dive_modules.bidding.current_strategy === "string"
                                      ? activity.structured.deep_dive_modules.bidding.current_strategy
                                      : typeof activity.structured.deep_dive_modules.bidding.current_strategy === "object" && activity.structured.deep_dive_modules.bidding.current_strategy?.bidding_strategy
                                        ? (activity.structured.deep_dive_modules.bidding.current_strategy.bidding_strategy as string).replace(/_/g, " ")
                                        : activity.structured.deep_dive_modules.bidding.bidding_strategy
                                          ? (activity.structured.deep_dive_modules.bidding.bidding_strategy as string).replace(/_/g, " ")
                                          : "—"
                                  }</div>
                                  <div className="text-xs text-gray-500 mt-1">current strategy</div>
                                  {activity.structured.deep_dive_modules.bidding.recommendation && (
                                    <div className="text-xs text-blue-400 mt-1 truncate">{
                                      typeof activity.structured.deep_dive_modules.bidding.recommendation === "string"
                                        ? activity.structured.deep_dive_modules.bidding.recommendation
                                        : activity.structured.deep_dive_modules.bidding.recommendation?.action || ""
                                    }</div>
                                  )}
                                </div>
                              )}
                              {activity.structured.deep_dive_modules.landing_pages && (
                                <div className="bg-gray-900 rounded p-3 border border-gray-700">
                                  <div className="text-xs text-gray-400 mb-1">Landing Pages</div>
                                  <div className="text-lg font-bold text-white">{activity.structured.deep_dive_modules.landing_pages.count}</div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {activity.structured.deep_dive_modules.landing_pages.recommendations} suggestions
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Root Cause (Deep Dive) */}
                        {activity.structured?.root_cause && (
                          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                            <div className="text-xs text-orange-400 font-medium mb-1">🎯 Root Cause</div>
                            <div className="text-sm text-gray-300">{activity.structured.root_cause}</div>
                          </div>
                        )}

                        {/* Action Items — What to do next */}
                        {activity.structured?.action_items && activity.structured.action_items.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-white mb-3">
                              📋 Action Items
                            </h4>
                            <div className="space-y-2">
                              {activity.structured.action_items.map((item: any, iIndex: number) => (
                                <div
                                  key={iIndex}
                                  className={`bg-gray-900 rounded p-3 border-l-2 ${
                                    item.priority === 'high' ? 'border-red-500' : item.priority === 'medium' ? 'border-amber-500' : 'border-blue-500'
                                  }`}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="font-medium text-white text-sm">
                                        {item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🔵'} {item.campaign}
                                      </div>
                                      <div className="text-sm text-blue-400 mt-1">→ {item.action}</div>
                                      <div className="text-xs text-gray-500 mt-1">{item.reason}</div>
                                      {item.impact && <div className="text-xs text-emerald-500 mt-1">💡 {item.impact}</div>}
                                    </div>
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                      item.priority === 'high' ? 'bg-red-500/20 text-red-300' : item.priority === 'medium' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'
                                    }`}>{item.priority}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Changes Made — Negatives added */}
                        {activity.structured?.changes_made && activity.structured.changes_made.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-emerald-400 mb-2">
                              ✅ Changes Made This Run
                            </h4>
                            <div className="bg-gray-900 rounded border border-gray-700 overflow-hidden">
                              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-800/50 text-xs text-gray-400 font-medium">
                                <div className="col-span-3">Term Blocked</div>
                                <div className="col-span-4">Campaign</div>
                                <div className="col-span-2">Reason</div>
                                <div className="col-span-1 text-right">Clicks</div>
                                <div className="col-span-2 text-right">Spend Saved</div>
                              </div>
                              {activity.structured.changes_made.map((change: any, cIndex: number) => (
                                <div key={cIndex} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-gray-800 text-sm">
                                  <div className="col-span-3 text-white font-mono text-xs">{change.term}</div>
                                  <div className="col-span-4 text-gray-300 text-xs truncate">{change.campaign}</div>
                                  <div className="col-span-2 text-gray-400 text-xs">{change.reason}</div>
                                  <div className="col-span-1 text-right text-gray-300">{change.clicks_blocked}</div>
                                  <div className="col-span-2 text-right text-emerald-400 font-medium">${change.spend_saved}</div>
                                </div>
                              ))}
                              <div className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-gray-700 bg-gray-800/50 text-sm font-medium">
                                <div className="col-span-8 text-gray-300">Total Saved</div>
                                <div className="col-span-1 text-right text-white">
                                  {activity.structured.changes_made.reduce((s: number, c: any) => s + c.clicks_blocked, 0)}
                                </div>
                                <div className="col-span-3 text-right text-emerald-400">
                                  ${activity.structured.changes_made.reduce((s: number, c: any) => s + c.spend_saved, 0).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Flagged for Review */}
                        {activity.structured?.flagged_for_review && activity.structured.flagged_for_review.length > 0 && (
                          <details onClick={(e) => e.stopPropagation()}>
                            <summary className="text-sm font-medium text-amber-400 cursor-pointer hover:text-amber-300 transition">
                              🔎 {activity.structured.flagged_for_review.length} Search Terms Flagged for Review
                            </summary>
                            <div className="mt-2 space-y-1">
                              {activity.structured.flagged_for_review.map((term: any, tIndex: number) => (
                                <div key={tIndex} className="bg-gray-900 rounded px-3 py-2 flex items-center justify-between text-sm">
                                  <span className="text-white font-mono text-xs">&quot;{term.term}&quot;</span>
                                  <div className="flex gap-4 text-xs">
                                    <span className="text-gray-400 truncate max-w-48">{term.campaign}</span>
                                    <span className="text-gray-400">{term.clicks} clicks</span>
                                    <span className="text-amber-400">${term.spend}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {/* Converting Terms to Add */}
                        {activity.structured?.converting_terms_to_add && activity.structured.converting_terms_to_add.length > 0 && (
                          <details onClick={(e) => e.stopPropagation()}>
                            <summary className="text-sm font-medium text-emerald-400 cursor-pointer hover:text-emerald-300 transition">
                              💡 {activity.structured.converting_terms_to_add.length} Converting Terms to Add as Keywords
                            </summary>
                            <div className="mt-2 space-y-1">
                              {activity.structured.converting_terms_to_add.map((term: any, tIndex: number) => (
                                <div key={tIndex} className="bg-gray-900 rounded px-3 py-2 flex items-center justify-between text-sm">
                                  <span className="text-white font-mono text-xs">&quot;{term.term}&quot;</span>
                                  <div className="flex gap-3 text-xs">
                                    <span className="text-gray-400 truncate max-w-48">{term.campaign}</span>
                                    <span className="text-emerald-400">{term.conversions} conversions</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {/* Optimization Opportunities */}
                        {(activity.structured?.optimization_opportunities || activity.structured?.zero_conversion_campaigns) && (activity.structured?.optimization_opportunities || activity.structured?.zero_conversion_campaigns).length > 0 && (
                          <details onClick={(e) => e.stopPropagation()}>
                            <summary className="text-sm font-medium text-amber-400 cursor-pointer hover:text-amber-300 transition">
                              💡 {(activity.structured.optimization_opportunities || activity.structured.zero_conversion_campaigns).length} Campaigns to Improve Conversion Rate
                            </summary>
                            <div className="mt-2 space-y-2">
                              {(activity.structured.optimization_opportunities || activity.structured.zero_conversion_campaigns).map((camp: any, cIndex: number) => (
                                <div key={cIndex} className="bg-gray-900 rounded p-3 border border-amber-900/30">
                                  <div className="flex items-center justify-between">
                                    <span className="text-white text-sm font-medium">{camp.name}</span>
                                    <div className="flex gap-4 text-sm">
                                      <span className="text-gray-400">{camp.clicks} clicks</span>
                                      <span className="text-amber-400 font-medium">${camp.spend?.toLocaleString()}</span>
                                    </div>
                                  </div>
                                  {camp.diagnosis && (
                                    <div className="text-sm text-blue-400 mt-2">→ {camp.diagnosis}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {/* Full Report (collapsible) */}
                        {activity.report && (
                          <details className="group" onClick={(e) => e.stopPropagation()}>
                            <summary className="text-sm font-medium text-gray-400 cursor-pointer hover:text-gray-200 transition">
                              📄 View Full Report
                            </summary>
                            <pre className="mt-3 bg-gray-900 rounded p-4 text-sm text-gray-300 whitespace-pre-wrap overflow-x-auto border border-gray-700 max-h-96 overflow-y-auto leading-relaxed">
{activity.report}
                            </pre>
                          </details>
                        )}

                        {/* Run metadata */}
                        <div className="flex flex-wrap gap-4 text-xs text-gray-500 pt-2 border-t border-gray-700/50">
                          {activity.details?.duration_seconds && (
                            <span>⏱ {activity.details.duration_seconds}s</span>
                          )}
                          {activity.details?.dry_run && (
                            <span className="text-amber-500">🧪 Dry Run</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
