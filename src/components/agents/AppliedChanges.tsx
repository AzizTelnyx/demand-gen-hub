'use client';

import React, { useState, useEffect } from 'react';
import { History, ArrowRight, Bot, User, Zap, Settings, Globe } from 'lucide-react';
import PlatformIcon from '@/components/PlatformIcon';

const sourceConfig: Record<string, { icon: any; label: string; color: string }> = {
  'google-ads-api': { icon: Zap, label: 'Google Ads', color: 'text-blue-400' },
  'stackadapt-api': { icon: Zap, label: 'StackAdapt', color: 'text-violet-400' },
  'reddit-api': { icon: Zap, label: 'Reddit', color: 'text-orange-400' },
  ares: { icon: Bot, label: 'Ares', color: 'text-indigo-400' },
  manual: { icon: User, label: 'Manual', color: 'text-[var(--text-muted)]' },
  hub: { icon: Settings, label: 'Hub', color: 'text-cyan-400' },
};

interface CampaignChange {
  id: string;
  campaignName: string;
  platform: string;
  changeType: string;
  description: string;
  oldValue: string | null;
  newValue: string | null;
  source: string;
  actor: string | null;
  timestamp: string;
}

export default function AppliedChanges() {
  const [changes, setChanges] = useState<CampaignChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/optimizations?days=30')
      .then(r => r.json())
      .then(data => {
        // Filter to non-manual changes
        const automated = (data.changes || []).filter((c: CampaignChange) => c.source !== 'manual');
        setChanges(automated.slice(0, 50));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <History size={18} className="text-cyan-400" />
          Applied Changes
        </h2>
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-8 animate-pulse">
          <div className="h-4 bg-[var(--bg-primary)] rounded w-1/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
        <History size={18} className="text-cyan-400" />
        Applied Changes
        <span className="text-xs text-[var(--text-muted)] font-normal ml-2">{changes.length} automated changes (30d)</span>
      </h2>

      {changes.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-8 text-center">
          <History size={24} className="mx-auto text-[var(--text-muted)] mb-2" />
          <p className="text-sm text-[var(--text-muted)]">No automated changes in the last 30 days</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-primary)]/30">
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">Date</th>
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">Source</th>
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">Campaign</th>
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">Platform</th>
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">Action</th>
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {changes.map(c => {
                const src = sourceConfig[c.source] || sourceConfig.manual;
                const SrcIcon = src.icon;
                return (
                  <tr key={c.id} className="border-b border-[var(--border-primary)]/20 last:border-0 hover:bg-[var(--bg-primary)]/50">
                    <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                      {new Date(c.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 ${src.color}`}>
                        <SrcIcon size={11} /> {c.actor || src.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] max-w-[250px] truncate">{c.campaignName}</td>
                    <td className="px-4 py-3">
                      <PlatformIcon platform={c.platform} size={14} showLabel />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{c.description}</td>
                    <td className="px-4 py-3">
                      {c.oldValue && c.newValue ? (
                        <span className="flex items-center gap-1 text-[var(--text-muted)]">
                          {c.oldValue} <ArrowRight size={9} /> <span className="text-[var(--text-secondary)]">{c.newValue}</span>
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
