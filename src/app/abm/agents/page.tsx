'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Search, ChevronDown, ChevronRight, Filter,
  Clock, CheckCircle, XCircle, AlertTriangle,
  Loader2, RefreshCw, Bot, Scissors, Expand, ShieldX,
  FileSearch, Activity, Calendar, Check, X, ChevronLeft,
} from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import DomainSlideOut from '@/components/DomainSlideOut';
import { formatRelativeTime, formatFullDateTime } from '@/lib/utils';

interface AgentCard {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  schedule: string | null;
  lastRunAt: string | null;
  lastRunStatus: 'done' | 'error' | 'running' | 'queued' | 'never' | null;
  lastRunDuration: number | null;
  totalProcessed: number;
  autoApproved: number;
  pendingReview: number;
}

interface WorkLogEntry {
  id: string;
  timestamp: string;
  agent: string;
  agentName: string;
  action: string;
  domain: string;
  segment: string | null;
  reason: string;
  status: 'auto-approved' | 'pending-review' | 'rejected' | 'approved';
  severity: string;
  impact: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  autoApplied: boolean | null;
}

interface Stats {
  totalProcessedThisWeek: number;
  autoApprovedCount: number;
  flaggedForReviewCount: number;
  rejectedCount: number;
}

const AGENT_ICONS: Record<string, React.ReactNode> = {
  pruner: <Scissors size={18} />,
  expander: <Expand size={18} />,
  'negative-builder': <ShieldX size={18} />,
  auditor: <FileSearch size={18} />,
  'sf-sync': <RefreshCw size={18} />,
};

const AGENT_COLORS: Record<string, string> = {
  pruner: 'bg-red-500/10 text-red-400 border-red-500/20',
  expander: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'negative-builder': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  auditor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'sf-sync': 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

const STATUS_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  'auto-approved': { label: 'Auto-approved', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  'pending-review': { label: 'Pending Review', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  'rejected': { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/10' },
  'approved': { label: 'Approved', color: 'text-blue-400', bg: 'bg-blue-500/10' },
};

const DATE_RANGE_OPTIONS = [
  { value: '24h', label: 'Last 24h', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { value: 'all', label: 'All time', ms: Infinity },
];

const ENTRIES_PER_PAGE = 25;

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export default function AgentActivityPage() {
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [workLog, setWorkLog] = useState<WorkLogEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7d');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  // Rejection reason input
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/abm/agent-activity')
      .then(r => r.json())
      .then(data => {
        setAgents(data.agents || []);
        setWorkLog(data.workLog || []);
        setStats(data.stats || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredWorkLog = useMemo(() => {
    let result = workLog;

    // Date range filter
    const rangeOption = DATE_RANGE_OPTIONS.find(o => o.value === dateRange);
    if (rangeOption && rangeOption.ms !== Infinity) {
      const cutoff = Date.now() - rangeOption.ms;
      result = result.filter(e => new Date(e.timestamp).getTime() >= cutoff);
    }

    if (agentFilter !== 'all') {
      result = result.filter(e => e.agent === agentFilter);
    }

    if (statusFilter !== 'all') {
      result = result.filter(e => e.status === statusFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.domain.toLowerCase().includes(q) ||
        e.reason.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q)
      );
    }

    return result;
  }, [workLog, agentFilter, statusFilter, dateRange, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredWorkLog.length / ENTRIES_PER_PAGE);
  const paginatedWorkLog = useMemo(() => {
    const start = (currentPage - 1) * ENTRIES_PER_PAGE;
    return filteredWorkLog.slice(start, start + ENTRIES_PER_PAGE);
  }, [filteredWorkLog, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [agentFilter, statusFilter, dateRange, searchQuery]);

  const toggleReason = (id: string) => {
    const next = new Set(expandedReasons);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedReasons(next);
  };

  // Approve action
  const handleApprove = async (logId: string) => {
    setReviewLoading(logId);
    setReviewError(null);

    try {
      const res = await fetch('/api/abm/agent-activity/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId, action: 'approve' }),
      });

      if (!res.ok) throw new Error('Failed to approve');

      setWorkLog(prev =>
        prev.map(e =>
          e.id === logId
            ? { ...e, status: 'approved' as const, reviewedBy: 'user', reviewedAt: new Date().toISOString() }
            : e
        )
      );
    } catch {
      setReviewError('Failed to approve. Please try again.');
    } finally {
      setReviewLoading(null);
    }
  };

  // Reject action
  const handleReject = async (logId: string) => {
    if (!rejectReason.trim()) return;

    setReviewLoading(logId);
    setReviewError(null);

    try {
      const res = await fetch('/api/abm/agent-activity/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId, action: 'reject', reason: rejectReason }),
      });

      if (!res.ok) throw new Error('Failed to reject');

      setWorkLog(prev =>
        prev.map(e =>
          e.id === logId
            ? { ...e, status: 'rejected' as const, reviewedBy: 'user', reviewedAt: new Date().toISOString() }
            : e
        )
      );
      setRejectingId(null);
      setRejectReason('');
    } catch {
      setReviewError('Failed to reject. Please try again.');
    } finally {
      setReviewLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-[var(--text-muted)]" size={24} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Agent Activity</h1>
            <InfoTooltip content="Monitor and manage ABM automation agents: Pruner, Expander, Negative Builder, Auditor, and SF Sync." />
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            View what the automation agents have been doing
          </p>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} className="text-[var(--text-muted)]" />
              <span className="text-xs text-[var(--text-muted)]">Processed This Week</span>
              <InfoTooltip content="Total domains processed by all agents this week" size={12} />
            </div>
            <div className="text-2xl font-semibold">{stats.totalProcessedThisWeek}</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={14} className="text-emerald-400" />
              <span className="text-xs text-[var(--text-muted)]">Auto-Approved</span>
              <InfoTooltip content="Actions automatically approved by agents" size={12} />
            </div>
            <div className="text-2xl font-semibold text-emerald-400">{stats.autoApprovedCount}</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="text-xs text-[var(--text-muted)]">Flagged for Review</span>
              <InfoTooltip content="Actions pending human review" size={12} />
            </div>
            <div className="text-2xl font-semibold text-amber-400">{stats.flaggedForReviewCount}</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle size={14} className="text-red-400" />
              <span className="text-xs text-[var(--text-muted)]">Rejected</span>
              <InfoTooltip content="Actions that were rejected or dismissed" size={12} />
            </div>
            <div className="text-2xl font-semibold text-red-400">{stats.rejectedCount}</div>
          </div>
        </div>
      )}

      {/* Agent Cards */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 flex items-center gap-2">
          Agents <InfoTooltip content="Agents run on a schedule. Use 'Filter to this agent' to see their activity." />
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {agents.map(agent => (
            <div
              key={agent.id}
              className={`bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-4 ${
                agent.lastRunStatus === 'running' ? 'border-indigo-500/50' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${AGENT_COLORS[agent.id]}`}>
                  {AGENT_ICONS[agent.id] || <Bot size={18} />}
                </div>
                {agent.lastRunStatus === 'done' && (
                  <CheckCircle size={14} className="text-emerald-400" />
                )}
                {agent.lastRunStatus === 'error' && (
                  <XCircle size={14} className="text-red-400" />
                )}
                {(agent.lastRunStatus === 'running' || agent.lastRunStatus === 'queued') && (
                  <Loader2 size={14} className="animate-spin text-indigo-400" />
                )}
                {!agent.enabled && (
                  <span className="text-[10px] px-1 py-0.5 bg-gray-500/10 text-gray-400 rounded">Disabled</span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{agent.name}</h3>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 mb-3">{agent.description}</p>

              <div className="space-y-1.5 text-[10px] text-[var(--text-muted)]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock size={10} /> Last run:
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    {formatRelativeTime(agent.lastRunAt)}
                    {agent.lastRunDuration && ` (${formatDuration(agent.lastRunDuration)})`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar size={10} /> Schedule:
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    {agent.schedule || 'Manual'}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-[var(--border-primary)]">
                <button
                  onClick={() => setAgentFilter(agent.id)}
                  className="w-full px-2 py-1.5 text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded hover:bg-[var(--bg-elevated)] border border-[var(--border-primary)]"
                >
                  Filter to this agent
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Work Log */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 flex items-center gap-2">
          Work Log <InfoTooltip content="Detailed log of all agent actions" />
        </h2>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md text-sm"
            />
          </div>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md text-sm"
          >
            {DATE_RANGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md text-sm"
          >
            <option value="all">All Agents</option>
            <option value="pruner">Pruner</option>
            <option value="expander">Expander</option>
            <option value="negative-builder">Negative Builder</option>
            <option value="auditor">Auditor</option>
            <option value="sf-sync">SF Sync</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="auto-approved">Auto-approved</option>
            <option value="pending-review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Review error */}
        {reviewError && (
          <div className="p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {reviewError}
          </div>
        )}

        {/* Log Table */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-elevated)]">
                <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">Date</th>
                <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">
                  <div className="flex items-center gap-1">
                    Agent <InfoTooltip content="Which agent performed this action" size={10} />
                  </div>
                </th>
                <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">Action</th>
                <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">
                  <div className="flex items-center gap-1">
                    Domain/Segment <InfoTooltip content="Click domain to view details" size={10} />
                  </div>
                </th>
                <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">
                  <div className="flex items-center gap-1">
                    Reason <InfoTooltip content="Click to expand full reasoning" size={10} />
                  </div>
                </th>
                <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedWorkLog.map(entry => {
                const statusBadge = STATUS_BADGES[entry.status];
                const isExpanded = expandedReasons.has(entry.id);
                const isPending = entry.status === 'pending-review';

                return (
                  <tr key={entry.id} className="border-t border-[var(--border-primary)] hover:bg-[var(--bg-elevated)]">
                    <td className="px-4 py-2 text-xs text-[var(--text-muted)] whitespace-nowrap">
                      <span title={formatFullDateTime(entry.timestamp)}>
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 text-[10px] rounded border ${AGENT_COLORS[entry.agent]}`}>
                        {entry.agent}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--text-secondary)]">{entry.action}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setSelectedDomain(entry.domain)}
                        className="text-sm font-medium text-[var(--text-primary)] hover:text-indigo-400"
                      >
                        {entry.domain}
                      </button>
                      {entry.segment && (
                        <div className="text-[10px] text-[var(--text-muted)]">{entry.segment}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 max-w-[250px]">
                      <button
                        onClick={() => toggleReason(entry.id)}
                        className="text-left"
                      >
                        <p className={`text-xs text-[var(--text-secondary)] ${isExpanded ? '' : 'truncate'}`}>
                          {entry.reason}
                        </p>
                        {entry.reason.length > 60 && (
                          <span className="text-[10px] text-indigo-400">
                            {isExpanded ? 'Show less' : 'Show more'}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 text-[10px] rounded ${statusBadge.bg} ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>

                        {isPending && (
                          <>
                            {rejectingId === entry.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  placeholder="Reason..."
                                  value={rejectReason}
                                  onChange={e => setRejectReason(e.target.value)}
                                  className="px-2 py-1 text-[10px] bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded w-24"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleReject(entry.id)}
                                  disabled={reviewLoading === entry.id || !rejectReason.trim()}
                                  className="p-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                                >
                                  {reviewLoading === entry.id ? (
                                    <Loader2 size={10} className="animate-spin" />
                                  ) : (
                                    <Check size={10} />
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectReason('');
                                  }}
                                  className="p-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleApprove(entry.id)}
                                  disabled={reviewLoading === entry.id}
                                  className="p-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                                  title="Approve"
                                >
                                  {reviewLoading === entry.id ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <Check size={12} />
                                  )}
                                </button>
                                <button
                                  onClick={() => setRejectingId(entry.id)}
                                  className="p-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                  title="Reject"
                                >
                                  <X size={12} />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredWorkLog.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                    No log entries match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>
              Showing {(currentPage - 1) * ENTRIES_PER_PAGE + 1}-
              {Math.min(currentPage * ENTRIES_PER_PAGE, filteredWorkLog.length)} of {filteredWorkLog.length} entries
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft size={12} /> Previous
              </button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                Next <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Domain Slide-Out */}
      <DomainSlideOut
        domain={selectedDomain}
        onClose={() => setSelectedDomain(null)}
      />
    </div>
  );
}
