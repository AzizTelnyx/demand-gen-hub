'use client';

import { useState, useEffect } from 'react';
import {
  Target, DollarSign, MousePointerClick, TrendingUp,
  AlertTriangle, AlertCircle, Info, Clock,
  Zap, Bot,
  Calendar, Flag, Users, Swords,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import PlatformIcon from "@/components/PlatformIcon";

interface DashboardData {
  metrics: { totalSpend: number; totalBudget: number; totalClicks: number; totalImpressions: number; googleAdsConversions: number; abmInfluencedDeals: number; abmInfluencedPipeline: number; ctr: number; cpc: number; liveCampaigns: number; totalCampaigns: number };
  channelPerformance: Array<{ channel: string; spend: number; clicks: number; impressions: number; conversions: number | null; conversionType: string; ctr: number; cpc: number; costPerConv: number | null; count: number }>;
  topCampaigns: Array<{ name: string; platform: string; spend: number; budget: number; clicks: number; impressions: number; conversions: number; ctr: number }>;
  criticalAlerts: Array<{ severity: string; title: string; detail: string; count?: number }>;
  agentRuns: Array<{ id: string; agentSlug: string; agentName: string; status: string; findingsCount: number; recsCount: number; output: string | null; startedAt: string; completedAt: string | null }>;
  trackers: Array<{ id: string; category: string; title: string; status: string; priority: string; dueDate: string | null; assignee: string | null; details: any }>;
  campaignsByStatus?: Array<{ status: string; count: number }>;
}

const PLATFORM_COLORS: Record<string, string> = {
  'Google Ads': '#3b82f6',
  'LinkedIn Ads': '#0ea5e9',
  'StackAdapt': '#8b5cf6',
  'Reddit': '#FF4500',
};

const STATUS_COLORS: Record<string, string> = {
  live: '#10b981', active: '#10b981', enabled: '#10b981',
  paused: '#f59e0b',
  ended: '#ef4444',
  unknown: '#6b7280',
};

const automationLabels: Record<string, { label: string; icon: any }> = {
  "health-monitor": { label: "Health Monitor", icon: AlertCircle },
  "campaign-sync": { label: "Campaign Sync", icon: Zap },
  "optimizer": { label: "Campaign Optimizer", icon: TrendingUp },
  "influencer-checker": { label: "Influencer Checker", icon: Users },
};

const categoryIcons: Record<string, any> = {
  influencer: Users, event: Calendar, competitive: Swords, deadline: Flag,
};

const priorityColors: Record<string, string> = {
  high: "text-red-400", medium: "text-amber-400", low: "text-[var(--text-muted)]",
};

const statusBadgeColors: Record<string, string> = {
  pending: "bg-[var(--bg-primary)] text-[var(--text-muted)]",
  "in-progress": "bg-blue-900/30 text-blue-400",
  blocked: "bg-red-900/30 text-red-400",
  done: "bg-emerald-900/30 text-emerald-400",
};

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-[var(--text-secondary)] font-medium">{label || payload[0]?.name}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm text-[var(--text-primary)] font-semibold">${p.value?.toLocaleString()}</p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 flex items-center justify-center h-full"><div className="animate-pulse text-[var(--text-muted)] text-sm">Loading dashboard...</div></div>;
  if (!data) return <div className="p-8 text-red-400">Failed to load dashboard</div>;

  const { metrics, channelPerformance, topCampaigns, criticalAlerts, agentRuns, trackers } = data;
  const visibleAlerts = criticalAlerts.filter((_, i) => !dismissedAlerts.has(i));
  const maxSpend = Math.max(...topCampaigns.map(c => c.spend), 1);

  const metricCards = [
    { label: 'Total Spend', value: `$${metrics.totalSpend.toLocaleString()}`, sub: `$${Math.round(metrics.totalSpend / 30).toLocaleString()}/day avg`, icon: DollarSign, accent: 'bg-emerald-500', iconColor: 'text-emerald-400' },
    { label: 'Total Clicks', value: formatNum(metrics.totalClicks), sub: `$${metrics.cpc} avg CPC`, icon: MousePointerClick, accent: 'bg-blue-500', iconColor: 'text-blue-400' },
    { label: 'Google Ads Conv.', value: `${metrics.googleAdsConversions || 0}`, sub: metrics.googleAdsConversions > 0 ? `$${Math.round(metrics.totalSpend / metrics.googleAdsConversions)} cost/conv` : 'Pixel + offline SF', icon: TrendingUp, accent: 'bg-amber-500', iconColor: 'text-amber-400' },
    { label: 'ABM Influenced', value: `${metrics.abmInfluencedDeals || 0} deals`, sub: metrics.abmInfluencedPipeline > 0 ? `$${metrics.abmInfluencedPipeline.toLocaleString()} pipeline` : 'LinkedIn + StackAdapt + Reddit attribution', icon: Target, accent: 'bg-sky-500', iconColor: 'text-sky-400' },
    { label: 'CTR', value: `${metrics.ctr}%`, sub: `${formatNum(metrics.totalImpressions)} impressions`, icon: Target, accent: 'bg-violet-500', iconColor: 'text-violet-400' },
  ];

  // Chart data
  const barData = channelPerformance.map(c => ({
    name: c.channel,
    spend: c.spend,
    fill: PLATFORM_COLORS[c.channel] || '#6b7280',
  }));

  const pieData = channelPerformance.map(c => ({
    name: c.channel,
    value: c.spend,
  }));

  return (
    <div className="p-8 space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">Dashboard</h1>
          <p className="text-[var(--text-muted)] text-sm mt-0.5">Campaign performance · Last 30 days</p>
        </div>
        <span className="text-[var(--text-muted)] text-xs">{metrics.liveCampaigns} live of {metrics.totalCampaigns} total campaigns</span>
      </div>

      {/* Alerts */}
      {visibleAlerts.length > 0 && (
        <div className="space-y-2">
          {visibleAlerts.map((alert) => {
            const actualIndex = criticalAlerts.indexOf(alert);
            const severityConfig = {
              critical: { bg: "bg-red-950/50 border-red-800/40", icon: AlertTriangle, iconColor: "text-red-400", titleColor: "text-red-300" },
              warning: { bg: "bg-amber-950/40 border-amber-800/30", icon: AlertCircle, iconColor: "text-amber-400", titleColor: "text-amber-300" },
              info: { bg: "bg-blue-950/40 border-blue-800/30", icon: Info, iconColor: "text-blue-400", titleColor: "text-blue-300" },
            }[alert.severity] || { bg: "bg-[var(--bg-card)] border-[var(--border-primary)]", icon: Info, iconColor: "text-[var(--text-muted)]", titleColor: "text-[var(--text-secondary)]" };
            const Icon = severityConfig.icon;
            return (
              <div key={actualIndex} className={`${severityConfig.bg} border rounded-xl px-4 py-3 flex items-start gap-3`}>
                <Icon size={16} className={`${severityConfig.iconColor} mt-0.5 shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${severityConfig.titleColor}`}>{alert.title}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{alert.detail}</p>
                </div>
                <button onClick={() => setDismissedAlerts(prev => new Set([...prev, actualIndex]))}
                  className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xs shrink-0">Dismiss</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-5 gap-4">
        {metricCards.map((m, i) => {
          const Icon = m.icon;
          return (
            <div key={i} className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5 relative overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-1 ${m.accent}`} />
              <div className="flex items-start justify-between">
                <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">{m.label}</p>
                <Icon size={16} className={m.iconColor} />
              </div>
              <p className="text-2xl font-semibold text-[var(--text-primary)] mt-2">{m.value}</p>
              <p className="text-[11px] mt-1 text-[var(--text-muted)]">{m.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-5 gap-5">
        {/* Channel Spend Bar Chart */}
        <div className="col-span-3 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
          <h2 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-4">Channel Spend</h2>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                <XAxis type="number" tickFormatter={(v) => `$${formatNum(v)}`} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107,114,128,0.1)' }} />
                <Bar dataKey="spend" radius={[0, 6, 6, 0]} barSize={28}>
                  {barData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-[var(--text-muted)] text-center py-12">No channel data</p>
          )}
        </div>

        {/* Platform Mix Donut */}
        <div className="col-span-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
          <h2 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-4">Platform Mix</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={PLATFORM_COLORS[entry.name] || '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  formatter={(value: string) => <span style={{ color: '#9ca3af', fontSize: 11 }}>{value}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-[var(--text-muted)] text-center py-12">No data</p>
          )}
        </div>
      </div>

      {/* Channel Performance Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
        <h2 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-4">Channel Performance</h2>
        <table className="w-full">
          <thead>
            <tr className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
              <th className="text-left py-2 font-medium">Channel</th>
              <th className="text-right py-2 font-medium">#</th>
              <th className="text-right py-2 font-medium">Spend</th>
              <th className="text-right py-2 font-medium">Clicks</th>
              <th className="text-right py-2 font-medium">Conv</th>
              <th className="text-right py-2 font-medium">CTR</th>
              <th className="text-right py-2 font-medium">Cost/Conv</th>
            </tr>
          </thead>
          <tbody>
            {channelPerformance.map((row, i) => (
              <tr key={i} className="border-t border-[var(--border-primary)] hover:bg-[var(--bg-primary)]/50 transition-colors">
                <td className="py-2.5 text-sm text-[var(--text-primary)] font-medium">
                  <PlatformIcon platform={row.channel === 'Google Ads' ? 'google_ads' : row.channel === 'LinkedIn Ads' ? 'linkedin' : row.channel === 'StackAdapt' ? 'stackadapt' : row.channel === 'Reddit' ? 'reddit' : row.channel} size={16} showLabel />
                </td>
                <td className="py-2.5 text-right text-xs text-[var(--text-muted)]">{row.count}</td>
                <td className="py-2.5 text-right text-sm text-[var(--text-secondary)]">${row.spend.toLocaleString()}</td>
                <td className="py-2.5 text-right text-sm text-[var(--text-secondary)]">{row.clicks.toLocaleString()}</td>
                <td className="py-2.5 text-right text-sm text-[var(--text-secondary)]">
                  {row.conversionType === 'attribution'
                    ? <span className="text-[var(--text-muted)] italic text-xs">ABM</span>
                    : (row.conversions ?? 0)}
                </td>
                <td className="py-2.5 text-right text-sm text-[var(--text-secondary)]">{row.ctr}%</td>
                <td className="py-2.5 text-right text-sm text-[var(--text-secondary)]">
                  {row.conversionType === 'attribution'
                    ? <span className="text-[var(--text-muted)] italic text-xs">See Pipeline</span>
                    : row.costPerConv ? `$${row.costPerConv.toLocaleString()}` : <span className="text-[var(--text-muted)]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top Campaigns */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
        <h2 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-4">Top Campaigns by Spend</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
              <th className="text-left py-2 font-medium">Campaign</th>
              <th className="text-left py-2 font-medium">Platform</th>
              <th className="text-right py-2 font-medium">Spend</th>
              <th className="text-left py-2 font-medium pl-4" style={{ width: '15%' }}></th>
              <th className="text-right py-2 font-medium">Clicks</th>
              <th className="text-right py-2 font-medium">Conv</th>
              <th className="text-right py-2 font-medium">CTR</th>
            </tr>
          </thead>
          <tbody>
            {topCampaigns.map((c, i) => {
              const platformLabel = c.platform === 'google_ads' ? 'Google Ads' : c.platform === 'linkedin' ? 'LinkedIn Ads' : c.platform === 'reddit' ? 'Reddit' : 'StackAdapt';
              const barColor = PLATFORM_COLORS[platformLabel] || '#6b7280';
              return (
                <tr key={i} className="border-t border-[var(--border-primary)] hover:bg-[var(--bg-primary)]/50 transition-colors">
                  <td className="py-2 text-[var(--text-primary)] truncate max-w-[280px] font-medium">{c.name}</td>
                  <td className="py-2">
                    <PlatformIcon platform={c.platform} size={14} showLabel />
                  </td>
                  <td className="py-2 text-right text-[var(--text-secondary)]">${c.spend.toLocaleString()}</td>
                  <td className="py-2 pl-4">
                    <div className="w-full h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(c.spend / maxSpend) * 100}%`, backgroundColor: barColor }} />
                    </div>
                  </td>
                  <td className="py-2 text-right text-[var(--text-secondary)]">{c.clicks.toLocaleString()}</td>
                  <td className="py-2 text-right text-[var(--text-secondary)]">
                    {(c.platform === 'linkedin' || c.platform === 'stackadapt' || c.platform === 'reddit')
                      ? <span className="text-[var(--text-muted)] italic text-xs">ABM</span>
                      : c.conversions}
                  </td>
                  <td className="py-2 text-right text-[var(--text-secondary)]">{c.ctr}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom Row: Automations + Trackers */}
      <div className="grid grid-cols-2 gap-5">
        {/* Agent Runs */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
          <h2 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Agent Runs</h2>
          {agentRuns.length === 0 ? (
            <div className="text-center py-4">
              <Bot size={20} className="text-[var(--text-muted)] mx-auto mb-2" />
              <p className="text-xs text-[var(--text-muted)]">No agent runs yet</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">Negative keyword, ad copy, budget pacing runs will appear here</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {agentRuns.map(run => (
                <div key={run.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--bg-primary)]/50 transition-colors">
                  <Bot size={13} className={run.status === "done" ? "text-emerald-500" : run.status === "failed" ? "text-red-500" : "text-blue-500"} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text-secondary)] font-medium">{run.agentName || run.agentSlug}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {run.findingsCount > 0 && <span className="text-[10px] text-amber-400">{run.findingsCount} findings</span>}
                      {run.recsCount > 0 && <span className="text-[10px] text-blue-400">{run.recsCount} recs</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                    {run.startedAt ? new Date(run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trackers */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5">
          <h2 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Active Trackers</h2>
          {trackers.length === 0 ? (
            <div className="text-center py-4">
              <Flag size={20} className="text-[var(--text-muted)] mx-auto mb-2" />
              <p className="text-xs text-[var(--text-muted)]">No active trackers</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">Influencer outreach, events, deadlines will show here</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {trackers.map(t => {
                const CatIcon = categoryIcons[t.category] || Flag;
                return (
                  <div key={t.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--bg-primary)]/50 transition-colors">
                    <CatIcon size={13} className={priorityColors[t.priority] || "text-[var(--text-muted)]"} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[var(--text-secondary)] font-medium">{t.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${statusBadgeColors[t.status] || statusBadgeColors.pending}`}>{t.status}</span>
                        {t.dueDate && (
                          <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                            <Clock size={9} /> {new Date(t.dueDate).toLocaleDateString([], { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
