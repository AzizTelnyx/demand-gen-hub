'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';
import { GuardrailsPanel } from '@/components/agents/AgentConfig';

export default function AgentConfigPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/agents" className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
          <ArrowLeft size={16} /> Back to Agents
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
          <Shield size={24} className="text-accent-violet" />
          Agent Configuration
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Safety limits, budget rules, regional priorities, and platform budgets</p>
      </div>

      <GuardrailsPanel />
    </div>
  );
}
