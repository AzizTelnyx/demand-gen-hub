'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  HeartPulse, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Server, Database, Bot, Clock, Wifi, HardDrive, Activity,
} from 'lucide-react';

interface HealthCheck {
  area: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  details?: string[];
  checkedAt?: string;
}

interface HealthReport {
  overall: 'healthy' | 'warning' | 'critical';
  checks: HealthCheck[];
  lastRun?: string;
  runId?: string;
}

const AREA_ICONS: Record<string, any> = {
  pm2: Server,
  database: Database,
  agents: Bot,
  crons: Clock,
  apis: Wifi,
  syncs: Activity,
  disk: HardDrive,
};

const STATUS_CONFIG = {
  healthy: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2, label: 'Healthy' },
  warning: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: AlertTriangle, label: 'Warning' },
  critical: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: XCircle, label: 'Critical' },
};

export default function HealthPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setReport(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-[var(--bg-card)] rounded w-48" />
          <div className="h-64 bg-[var(--bg-card)] rounded-xl" />
        </div>
      </div>
    );
  }

  const overall = report?.overall || 'healthy';
  const overallCfg = STATUS_CONFIG[overall];
  const OverallIcon = overallCfg.icon;

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <HeartPulse size={24} className="text-[var(--accent)]" />
            System Health
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Hub Doctor monitors infrastructure, agents, and data pipelines
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent)]/50 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Overall Status Banner */}
      <div className={`${overallCfg.bg} border rounded-xl p-6 flex items-center gap-4`}>
        <OverallIcon size={32} className={overallCfg.color} />
        <div>
          <p className={`text-lg font-semibold ${overallCfg.color}`}>{overallCfg.label}</p>
          <p className="text-sm text-[var(--text-muted)]">
            {report?.checks?.length || 0} checks · Last run {report?.lastRun ? new Date(report.lastRun).toLocaleString() : 'never'}
          </p>
        </div>
      </div>

      {/* Health Checks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(report?.checks || []).map((check, i) => {
          const cfg = STATUS_CONFIG[check.status];
          const StatusIcon = cfg.icon;
          const AreaIcon = AREA_ICONS[check.area] || Activity;

          return (
            <div key={i} className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                    <AreaIcon size={16} className="text-[var(--accent)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)] capitalize">{check.area}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusIcon size={14} className={cfg.color} />
                  <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)]">{check.message}</p>

              {check.details && check.details.length > 0 && (
                <div className="space-y-1">
                  {check.details.map((d, j) => (
                    <p key={j} className="text-xs text-[var(--text-muted)] pl-3 border-l-2 border-[var(--border-primary)]">{d}</p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* No checks fallback */}
      {(!report?.checks || report.checks.length === 0) && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-12 text-center">
          <HeartPulse size={32} className="mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No health data available. Hub Doctor runs daily at 6 AM PST.</p>
        </div>
      )}
    </div>
  );
}
