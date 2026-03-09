'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Loader2, Eye, EyeOff, Download, FileText,
} from 'lucide-react';
import { StatusBadge, SeverityBadge, timeAgo } from './AgentFleet';

const statusColors: Record<string, { text: string; icon: any }> = {
  running: { text: 'text-blue-400', icon: Loader2 },
  done: { text: 'text-emerald-400', icon: CheckCircle2 },
  completed: { text: 'text-emerald-400', icon: CheckCircle2 },
  failed: { text: 'text-red-400', icon: XCircle },
};

export default function ActivityFeed() {
  const [agents, setAgents] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filterAgent, setFilterAgent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [reportContent, setReportContent] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agents/status')
      .then(r => r.json())
      .then(data => setAgents((data.agents || []).filter((a: any) => a.totalRuns > 0)))
      .catch(() => {});
  }, []);

  const loadRuns = useCallback((reset = false) => {
    const p = reset ? 1 : page;
    const params = new URLSearchParams({ limit: '25', offset: String((p - 1) * 25) });
    if (filterAgent) params.set('agent', filterAgent);
    if (filterStatus) params.set('status', filterStatus);
    if (showAll) params.set('all', 'true');

    fetch(`/api/agents/activity?${params}`)
      .then(r => r.json())
      .then(data => {
        const newRuns = data.runs || [];
        if (reset) setRuns(newRuns);
        else setRuns(prev => [...prev, ...newRuns]);
        setHasMore(newRuns.length === 25);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, filterAgent, filterStatus, showAll]);

  useEffect(() => { setPage(1); loadRuns(true); }, [filterAgent, filterStatus, showAll]);

  const loadDetail = async (runId: string) => {
    if (expandedRun === runId) { setExpandedRun(null); setRunDetail(null); setReportContent(null); return; }
    try {
      const res = await fetch(`/api/agents/activity?runId=${runId}`);
      const data = await res.json();
      setRunDetail(data.run);
      setExpandedRun(runId);
      setReportContent(null);
    } catch {}
  };

  const handleExport = async (runId: string, format: string) => {
    setExporting(`${runId}-${format}`);
    try {
      if (format === 'csv') {
        const res = await fetch('/api/agents/export', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, format: 'csv' }),
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `agent-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
      } else if (format === 'report') {
        const res = await fetch('/api/agents/export', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, format: 'report' }),
        });
        const data = await res.json();
        setReportContent(data.report);
      }
    } catch {}
    setExporting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Activity size={18} className="text-[var(--accent)]" />
          Recent Activity
        </h2>
        <div className="flex items-center gap-3">
          <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
            className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none">
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none">
            <option value="">All Statuses</option>
            <option value="done">Done</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
          </select>
          <button onClick={() => setShowAll(!showAll)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showAll ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]' : 'bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-muted)]'
            }`}>
            {showAll ? <Eye size={12} /> : <EyeOff size={12} />}
            {showAll ? 'All runs' : 'Key only'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-[var(--text-muted)] text-sm animate-pulse p-4">Loading activity...</div>
      ) : runs.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-10 text-center text-[var(--text-muted)] text-sm">
          No agent activity yet.
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden divide-y divide-[var(--border-primary)]/30">
          {runs.map(run => {
            const s = statusColors[run.status] || statusColors.done;
            const Icon = s?.icon || CheckCircle2;
            const isExpanded = expandedRun === run.id;

            return (
              <div key={run.id}>
                <div className="px-5 py-4 hover:bg-[var(--bg-primary)]/50 transition-colors cursor-pointer flex items-center gap-4"
                  onClick={() => loadDetail(run.id)}>
                  {isExpanded ? <ChevronDown size={14} className="text-[var(--text-muted)]" /> : <ChevronRight size={14} className="text-[var(--text-muted)]" />}
                  <Icon size={14} className={`${s.text} shrink-0 ${run.status === 'running' ? 'animate-spin' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{run.agentName}</span>
                      {run.autonomous && <span className="text-xs px-2 py-0.5 rounded bg-violet-900/30 text-accent-violet">auto</span>}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] truncate mt-1">{run.task || run.summary}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs text-[var(--text-muted)]">
                    {(run.findingsCount > 0 || run.recsCount > 0) && <span>{run.findingsCount}f / {run.recsCount}r</span>}
                    <span>{run.completedAt ? timeAgo(run.completedAt) : run.startedAt ? timeAgo(run.startedAt) : 'running...'}</span>
                  </div>
                </div>
                {isExpanded && runDetail && (
                  <div className="px-5 py-5 bg-[var(--bg-primary)]/50 border-t border-[var(--border-primary)]/30 space-y-4 ml-8 mr-4">
                    {runDetail.output?.summary && <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{runDetail.output.summary}</p>}
                    {runDetail.output?.findings?.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Findings ({runDetail.output.findings.length})</span>
                        {runDetail.output.findings.slice(0, 5).map((f: any, i: number) => (
                          <div key={i} className="flex items-start gap-3 bg-[var(--bg-card)] rounded-lg px-4 py-3">
                            <SeverityBadge severity={f.severity} />
                            <div>
                              <p className="text-sm text-[var(--text-secondary)]">{f.title}</p>
                              {f.detail && <p className="text-xs text-[var(--text-muted)] mt-1">{f.detail}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {reportContent && (
                      <div className="bg-[var(--bg-card)] rounded-lg p-4 border border-[var(--border-primary)]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Report</span>
                          <button onClick={() => navigator.clipboard.writeText(reportContent)} className="text-xs text-[var(--accent)] hover:underline">Copy</button>
                        </div>
                        <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">{reportContent}</div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-primary)]/30">
                      <button onClick={e => { e.stopPropagation(); handleExport(run.id, 'csv'); }} disabled={exporting === `${run.id}-csv`}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent)] text-[var(--text-secondary)] rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                        <Download size={12} /> {exporting === `${run.id}-csv` ? 'Exporting...' : 'Export CSV'}
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleExport(run.id, 'report'); }} disabled={exporting === `${run.id}-report`}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent)] text-[var(--text-secondary)] rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                        <FileText size={12} /> {exporting === `${run.id}-report` ? 'Generating...' : 'Report'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasMore && runs.length > 0 && (
        <div className="text-center">
          <button onClick={() => { setPage(p => p + 1); loadRuns(); }}
            className="px-5 py-2.5 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent)] text-[var(--text-secondary)] rounded-lg text-sm font-medium transition-colors">
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
