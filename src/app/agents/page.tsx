'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';

import AgentFleet from '@/components/agents/AgentFleet';
import ApprovalQueue from '@/components/agents/ApprovalQueue';
import ActivityFeed from '@/components/agents/ActivityFeed';
import AppliedChanges from '@/components/agents/AppliedChanges';

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/agents/status').then(r => r.json()),
      fetch('/api/agents/schedule').then(r => r.json()),
    ]).then(([statusData, schedData]) => {
      setAgents(statusData.agents || []);
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
            {agents.length} agents · {activeCount} active · Manage fleet, review actions, configure guardrails
          </p>
        </div>
        <Link href="/agents/config"
          className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent)]/50 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          <Settings size={16} /> Global Config
        </Link>
      </div>

      {/* 1. Agent Fleet Grid */}
      {agents.length > 0 && <AgentFleet agents={agents} schedules={schedules} />}

      {/* 2. Approval Queue */}
      <ApprovalQueue />

      {/* 3. Recent Activity Feed */}
      <ActivityFeed />

      {/* 4. Applied Changes Log */}
      <AppliedChanges />
    </div>
  );
}
