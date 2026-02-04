"use client";

import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend, ReferenceLine,
} from "recharts";

interface BudgetPlan {
  id: string;
  year: number;
  month: number;
  channel: string;
  region: string | null;
  funnelStage: string | null;
  planned: number;
  actual: number;
  expectedPace: number;
  paceVariance: number;
  pacePercentage: number;
  daysElapsed: number;
  daysInMonth: number;
  utilization: number;
}

interface BudgetChange {
  id: string;
  description: string;
  amount: number;
  status: string;
  createdAt: string;
}

interface ReallocationProposal {
  summary: string;
  changes: Array<{
    type: "increase" | "decrease";
    channel: string;
    region: string | null;
    amount: number;
    reason: string;
  }>;
  projectedImpact: string;
  warnings: string[];
  netChange: number;
}

const CHANNELS = ["google_ads", "stackadapt", "linkedin", "reddit"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const channelLabels: Record<string, string> = {
  google_ads: "Google Ads",
  stackadapt: "StackAdapt",
  linkedin: "LinkedIn",
  reddit: "Reddit",
};

const channelColors: Record<string, string> = {
  google_ads: "#4285F4",
  stackadapt: "#8B5CF6",
  linkedin: "#0A66C2",
  reddit: "#FF4500",
};

const formatCurrency = (n: number) => {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export default function BudgetPlanner() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [plans, setPlans] = useState<BudgetPlan[]>([]);
  const [totals, setTotals] = useState({ planned: 0, actual: 0, utilization: 0 });
  const [actualByChannel, setActualByChannel] = useState<Record<string, number>>({});
  const [recentChanges, setRecentChanges] = useState<BudgetChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "allocate" | "reallocate">("overview");
  
  // Allocation form state
  const [editingPlan, setEditingPlan] = useState<{ month: number; channel: string; planned: number } | null>(null);
  
  // Reallocation state
  const [reallocationInput, setReallocationInput] = useState("");
  const [reallocationLoading, setReallocationLoading] = useState(false);
  const [proposal, setProposal] = useState<ReallocationProposal | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);

  const fetchBudgetData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/budget?year=${year}`);
      const data = await res.json();
      setPlans(data.plans || []);
      setTotals(data.totals || { planned: 0, actual: 0, utilization: 0 });
      setActualByChannel(data.actualByChannel || {});
      setRecentChanges(data.recentChanges || []);
    } catch (err) {
      console.error("Error fetching budget:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBudgetData();
  }, [year]);

  const handleSavePlan = async () => {
    if (!editingPlan) return;
    
    try {
      await fetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month: editingPlan.month,
          channel: editingPlan.channel,
          planned: editingPlan.planned,
        }),
      });
      setEditingPlan(null);
      fetchBudgetData();
    } catch (err) {
      console.error("Error saving plan:", err);
    }
  };

  const handleReallocation = async () => {
    if (!reallocationInput.trim()) return;
    
    setReallocationLoading(true);
    setProposal(null);
    
    try {
      const res = await fetch("/api/budget/reallocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: reallocationInput }),
      });
      const data = await res.json();
      setProposal(data.proposal);
      setProposalId(data.changeId);
    } catch (err) {
      console.error("Error processing reallocation:", err);
    }
    setReallocationLoading(false);
  };

  const handleApplyProposal = async (apply: boolean) => {
    if (!proposalId) return;
    
    try {
      await fetch("/api/budget/reallocate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeId: proposalId, apply }),
      });
      setProposal(null);
      setProposalId(null);
      setReallocationInput("");
      if (apply) fetchBudgetData();
    } catch (err) {
      console.error("Error applying proposal:", err);
    }
  };

  // Build monthly data for chart
  const monthlyData = MONTHS.map((month, idx) => {
    const monthPlans = plans.filter(p => p.month === idx + 1);
    const planned = monthPlans.reduce((sum, p) => sum + p.planned, 0);
    const actual = monthPlans.reduce((sum, p) => sum + (p.actual || 0), 0);
    return { month, planned, actual, monthIndex: idx + 1 };
  });

  // Channel breakdown for current month
  const currentMonth = new Date().getMonth() + 1;
  const currentMonthPlans = plans.filter(p => p.month === currentMonth);

  const channelData = CHANNELS.map(channel => {
    const plan = currentMonthPlans.find(p => p.channel === channel);
    return {
      channel,
      label: channelLabels[channel],
      planned: plan?.planned || 0,
      actual: actualByChannel[channel] || 0,
      pacePercentage: plan?.pacePercentage || 0,
      utilization: plan?.utilization || 0,
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400">Loading budget data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Year Selector & Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {["overview", "allocate", "reallocate"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {tab === "overview" && "📊 Overview"}
              {tab === "allocate" && "📝 Allocate"}
              {tab === "reallocate" && "🔄 Reallocate"}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(year - 1)}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded hover:bg-gray-700"
          >
            ←
          </button>
          <span className="text-white font-medium px-4">{year}</span>
          <button
            onClick={() => setYear(year + 1)}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded hover:bg-gray-700"
          >
            →
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <>
          {/* Time Period Note */}
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 text-blue-300">
              <span className="text-lg">📅</span>
              <span className="font-medium">All values are MONTHLY</span>
            </div>
            <p className="text-sm text-blue-200/70 mt-1">
              Planned = monthly targets you set. Actual = last 30 days spend from campaigns.
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
              <div className="text-sm text-gray-400 mb-1">Annual Budget</div>
              <div className="text-2xl font-bold text-white">{formatCurrency(totals.planned)}</div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
              <div className="text-sm text-gray-400 mb-1">YTD Spend</div>
              <div className="text-2xl font-bold text-white">{formatCurrency(totals.actual)}</div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
              <div className="text-sm text-gray-400 mb-1">Remaining</div>
              <div className="text-2xl font-bold text-emerald-400">
                {formatCurrency(Math.max(0, totals.planned - totals.actual))}
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
              <div className="text-sm text-gray-400 mb-1">Utilization</div>
              <div className={`text-2xl font-bold ${
                totals.utilization > 100 ? "text-red-400" : 
                totals.utilization > 80 ? "text-amber-400" : "text-white"
              }`}>
                {totals.utilization.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Monthly Trend Chart */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
            <h3 className="font-semibold text-white mb-4">Monthly Budget vs Actual</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <XAxis dataKey="month" tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: "#1F2937", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Legend />
                  <Bar dataKey="planned" name="Planned" fill="#6366F1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Channel Pacing */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
            <h3 className="font-semibold text-white mb-4">
              Channel Pacing — {MONTHS[currentMonth - 1]} {year}
            </h3>
            <div className="space-y-4">
              {channelData.map((ch) => (
                <div key={ch.channel} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-300">{ch.label}</span>
                    <span className="text-gray-400">
                      {formatCurrency(ch.actual)} / {formatCurrency(ch.planned)}
                      <span className={`ml-2 ${
                        ch.pacePercentage > 110 ? "text-red-400" :
                        ch.pacePercentage > 90 ? "text-emerald-400" :
                        ch.pacePercentage > 70 ? "text-amber-400" : "text-gray-400"
                      }`}>
                        ({ch.pacePercentage.toFixed(0)}% pace)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, ch.utilization)}%`,
                        backgroundColor: channelColors[ch.channel],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Allocate Tab */}
      {activeTab === "allocate" && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
          <h3 className="font-semibold text-white mb-4">Monthly Budget Allocation</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-3 px-2">Channel</th>
                  {MONTHS.map((m, i) => (
                    <th key={m} className={`text-right py-3 px-2 ${i + 1 === currentMonth ? "bg-indigo-900/30" : ""}`}>
                      {m}
                    </th>
                  ))}
                  <th className="text-right py-3 px-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {CHANNELS.map((channel) => {
                  const channelPlans = plans.filter(p => p.channel === channel);
                  const total = channelPlans.reduce((sum, p) => sum + p.planned, 0);
                  
                  return (
                    <tr key={channel} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-3 px-2 text-gray-300">{channelLabels[channel]}</td>
                      {MONTHS.map((_, monthIdx) => {
                        const plan = channelPlans.find(p => p.month === monthIdx + 1);
                        const isEditing = editingPlan?.month === monthIdx + 1 && editingPlan?.channel === channel;
                        
                        return (
                          <td
                            key={monthIdx}
                            className={`text-right py-2 px-2 ${monthIdx + 1 === currentMonth ? "bg-indigo-900/30" : ""}`}
                          >
                            {isEditing ? (
                              <input
                                type="number"
                                value={editingPlan.planned}
                                onChange={(e) => setEditingPlan({ ...editingPlan, planned: parseFloat(e.target.value) || 0 })}
                                onBlur={handleSavePlan}
                                onKeyDown={(e) => e.key === "Enter" && handleSavePlan()}
                                className="w-20 px-2 py-1 bg-gray-900 border border-indigo-500 rounded text-right text-white text-sm"
                                autoFocus
                              />
                            ) : (
                              <button
                                onClick={() => setEditingPlan({ month: monthIdx + 1, channel, planned: plan?.planned || 0 })}
                                className="text-gray-300 hover:text-white hover:bg-gray-700 px-2 py-1 rounded"
                              >
                                {plan?.planned ? formatCurrency(plan.planned) : "—"}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-right py-3 px-2 text-white font-medium">
                        {formatCurrency(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-white font-semibold">
                  <td className="py-3 px-2">Total</td>
                  {MONTHS.map((_, monthIdx) => {
                    const monthTotal = plans.filter(p => p.month === monthIdx + 1).reduce((sum, p) => sum + p.planned, 0);
                    return (
                      <td key={monthIdx} className={`text-right py-3 px-2 ${monthIdx + 1 === currentMonth ? "bg-indigo-900/30" : ""}`}>
                        {formatCurrency(monthTotal)}
                      </td>
                    );
                  })}
                  <td className="text-right py-3 px-2">{formatCurrency(totals.planned)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          <p className="text-gray-500 text-xs mt-4">
            Click any cell to edit. Press Enter or click outside to save.
          </p>
        </div>
      )}

      {/* Reallocate Tab */}
      {activeTab === "reallocate" && (
        <div className="space-y-6">
          {/* AI Reallocation Input */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
            <h3 className="font-semibold text-white mb-4">🤖 AI Budget Reallocation</h3>
            <p className="text-gray-400 text-sm mb-4">
              Describe how you want to shift budget. I'll analyze the impact and show you exactly what changes would be made.
            </p>
            
            <div className="flex gap-3">
              <input
                type="text"
                value={reallocationInput}
                onChange={(e) => setReallocationInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReallocation()}
                placeholder="e.g., Shift $5K from TOFU to BOFU, or Move budget from StackAdapt to Google Ads"
                className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleReallocation}
                disabled={reallocationLoading || !reallocationInput.trim()}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {reallocationLoading ? "Analyzing..." : "Analyze"}
              </button>
            </div>
            
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Shift $3K from LinkedIn to Google Ads",
                "Increase BOFU budget by 20%",
                "Reduce APAC by $2K, add to AMER",
                "Balance spend across all channels",
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setReallocationInput(example)}
                  className="text-xs px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-full hover:bg-gray-700 transition"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {/* Proposal Card */}
          {proposal && (
            <div className="bg-gray-800/50 rounded-xl border border-indigo-500/50 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-white">📋 Proposed Changes</h3>
                  <p className="text-gray-400 text-sm mt-1">{proposal.summary}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  proposal.netChange === 0 
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : proposal.netChange > 0
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                }`}>
                  Net: {proposal.netChange === 0 ? "Budget Neutral" : formatCurrency(proposal.netChange)}
                </span>
              </div>

              <div className="space-y-3 mb-4">
                {proposal.changes.map((change, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      change.type === "increase" ? "bg-emerald-900/20" : "bg-red-900/20"
                    }`}
                  >
                    <span className={`text-lg ${change.type === "increase" ? "text-emerald-400" : "text-red-400"}`}>
                      {change.type === "increase" ? "↑" : "↓"}
                    </span>
                    <div className="flex-1">
                      <div className="text-white font-medium">
                        {change.type === "increase" ? "+" : "-"}{formatCurrency(change.amount)} — {channelLabels[change.channel] || change.channel}
                        {change.region && <span className="text-gray-400 ml-2">({change.region})</span>}
                      </div>
                      <div className="text-gray-400 text-sm">{change.reason}</div>
                    </div>
                  </div>
                ))}
              </div>

              {proposal.projectedImpact && (
                <div className="bg-indigo-900/20 rounded-lg p-3 mb-4">
                  <div className="text-sm text-indigo-300 font-medium mb-1">📈 Projected Impact</div>
                  <div className="text-gray-300 text-sm">{proposal.projectedImpact}</div>
                </div>
              )}

              {proposal.warnings && proposal.warnings.length > 0 && (
                <div className="bg-amber-900/20 rounded-lg p-3 mb-4">
                  <div className="text-sm text-amber-300 font-medium mb-1">⚠️ Considerations</div>
                  <ul className="text-gray-300 text-sm list-disc list-inside">
                    {proposal.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => handleApplyProposal(true)}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-500 transition"
                >
                  ✓ Apply Changes
                </button>
                <button
                  onClick={() => handleApplyProposal(false)}
                  className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg font-medium hover:bg-gray-600 transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Recent Changes */}
          {recentChanges.length > 0 && (
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
              <h3 className="font-semibold text-white mb-4">Recent Changes</h3>
              <div className="space-y-2">
                {recentChanges.slice(0, 5).map((change) => (
                  <div key={change.id} className="flex items-center justify-between py-2 border-b border-gray-700/50">
                    <div>
                      <div className="text-gray-300 text-sm">{change.description}</div>
                      <div className="text-gray-500 text-xs">
                        {new Date(change.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${
                      change.status === "approved" ? "bg-emerald-500/20 text-emerald-400" :
                      change.status === "rejected" ? "bg-red-500/20 text-red-400" :
                      "bg-gray-500/20 text-gray-400"
                    }`}>
                      {change.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
