'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings, Activity, HeartPulse } from 'lucide-react';

import AgentFleet from '@/components/agents/AgentFleet';

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/agents/status').then(r => r.json()),
      fetch('/api/agents/schedule').then(r => r.json()),
    ]).then(([statusData, schedData]) => {
      setAgents((statusData.agents || []).filter((a: any) => a.enabled));
      setSchedules(schedData.agents || []);
    }).catch(() => {});
  }, []);

  const activeCount = agents.filter(a => a.enabled).length;

  return (
    <div className="p-6 space-y-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Agents & Automation</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {agents.length} agents · {activeCount} active · Click any agent to configure, view logs, and manage recommendations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/activity"
            className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent)]/50 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <Activity size={16} /> Activity Log
          </Link>
          <Link href="/health"
            className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent)]/50 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <HeartPulse size={16} /> Health
          </Link>
          <Link href="/agents/config"
            className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent)]/50 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <Settings size={16} /> Global Config
          </Link>
        </div>
      </div>

      {/* 1. Agent Fleet Grid */}
      {agents.length > 0 && <AgentFleet agents={agents} schedules={schedules} />}

      {/* Approvals live in Activity Log — single source of truth */}
    </div>
  );
}
