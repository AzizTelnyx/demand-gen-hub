'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, Building2, ExternalLink, Download,
  Sparkles, Loader2, Plus, X, ChevronDown, ChevronRight,
  Target, List, Archive, Filter, Globe,
  Swords, MoreHorizontal, Layers,
  PenLine, FileDown, Send, ArrowRight,
  MapPin, Calendar, Bot, User,
  ShieldCheck, ShieldAlert, ShieldQuestion,
} from 'lucide-react';

// --- Types ---
interface ABMAccount {
  id: string; company: string; domain: string | null; vertical: string | null;
  country: string | null; region: string | null;
  status: string; source: string | null; productFit: string | null;
  currentProvider: string | null; switchSignal: string | null; inPipeline: boolean;
  notes: string | null; listNames: string[]; listIds: string[];
  memberAddedAt: Record<string, string>; memberAddedBy: Record<string, string>;
}
interface ABMList {
  id: string; name: string; query: string | null; listType: string;
  description: string | null; source: string; status: string; createdBy: string | null;
  count: number; activeCount: number; pendingCount: number; recentCount: number;
  createdAt: string; updatedAt: string;
}
interface ABMJob {
  id: string; query: string; listId: string; status: string; jobType: string;
  target: number; found: number; waves: number; error: string | null;
  createdAt: string; list: { id: string; name: string };
}
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
interface Criteria {
  ready: boolean; listName: string; listType: string; description: string;
  vertical: string | null; regions: string[]; productFit: string[];
  targetCompanyProfile: string; includeProviders: string[];
  excludeCompanies: string[]; exampleCompanies: string[];
  estimatedTarget: number;
}

const listTypeConfig: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  vertical: { icon: Layers, label: 'Vertical', color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-800/30' },
  'use-case': { icon: Target, label: 'Use Case', color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-800/30' },
  conquest: { icon: Swords, label: 'Conquest', color: 'text-red-400', bg: 'bg-red-900/30 border-red-800/30' },
};

const productFitLabels: Record<string, string> = {
  "ai-agent": "AI Agent", "voice-api": "Voice API", "sip-trunking": "SIP Trunking", "sms-api": "SMS API",
  "iot": "IoT", "numbers": "Numbers",
  "multi-product": "Multi-Product",
};

// --- Confidence Badge ---
function ConfidenceBadge({ account }: { account: ABMAccount }) {
  let confidenceScore: number | null = null;
  let signals: Record<string, boolean> = {};
  try {
    if (account.notes) {
      const parsed = JSON.parse(account.notes);
      confidenceScore = parsed.confidenceScore ?? null;
      signals = parsed.validationSignals || {};
    }
  } catch {}

  const status = account.status || 'identified';
  const iconProps = { size: 14, className: 'shrink-0' };

  let icon: React.ReactNode;
  let tooltip: string;
  if (status === 'validated') {
    icon = <ShieldCheck {...iconProps} className="shrink-0 text-emerald-400" />;
    tooltip = `Verified (score: ${confidenceScore ?? '?'})`;
  } else if (status === 'unverified') {
    icon = <ShieldAlert {...iconProps} className="shrink-0 text-amber-400" />;
    tooltip = `Unverified (score: ${confidenceScore ?? '?'})`;
  } else {
    icon = <ShieldQuestion {...iconProps} className="shrink-0 text-gray-500" />;
    tooltip = 'Not yet validated';
  }

  const signalLabels = [
    ['dns', 'DNS'],
    ['clearbit', 'CB'],
    ['perplexica', 'Perp'],
    ['linkedin', 'LI'],
  ] as const;
  const hasSignals = Object.keys(signals).length > 0;

  return (
    <div className="flex flex-col items-center gap-0.5" title={tooltip}>
      {icon}
      {hasSignals && (
        <div className="flex gap-0.5">
          {signalLabels.map(([key, label]) => (
            <span key={key} className={`text-[8px] leading-none ${signals[key] ? 'text-emerald-500' : 'text-gray-600'}`} title={`${label}: ${signals[key] ? '✓' : '✗'}`}>
              {signals[key] ? '✓' : '·'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// --- List Card ---
function ListCard({ list, isSelected, onClick, onExpand, onRename, onArchive, onExport, activeJob }: {
  list: ABMList; isSelected: boolean; onClick: () => void;
  onExpand: () => void; onRename: () => void; onArchive: () => void; onExport: () => void;
  activeJob?: ABMJob | null;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const config = listTypeConfig[list.listType] || listTypeConfig.vertical;

  return (
    <div
      className={`p-3 rounded-lg border cursor-pointer transition-all ${
        isSelected ? 'border-indigo-500 bg-indigo-900/20' : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-hover)]'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${config.bg} ${config.color}`}>
              <config.icon size={10} />
              {config.label}
            </span>
          </div>
          <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">{list.name}</h3>
          {list.description && <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{list.description}</p>}
          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
            <span>{list.count} accounts</span>
            {!activeJob && list.recentCount > 0 && list.recentCount < list.count && (
              <span className="text-emerald-500">+{list.recentCount} this week</span>
            )}
          </div>
          {activeJob && (
            <div className="mt-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Loader2 size={10} className="animate-spin text-blue-400" />
                <span className="text-[10px] text-blue-400 font-medium">
                  {activeJob.status === 'queued' ? 'Queued...' : `Building — ${activeJob.found}/${activeJob.target}`}
                </span>
              </div>
              <div className="h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${activeJob.target > 0 ? Math.min((activeJob.found / activeJob.target) * 100, 100) : 0}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
            <MoreHorizontal size={14} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-6 z-20 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-xl py-1 w-40">
              <button onClick={(e) => { e.stopPropagation(); onExpand(); setShowMenu(false); }} className="w-full px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] flex items-center gap-2">
                <Plus size={12} /> Expand List
              </button>
              <button onClick={(e) => { e.stopPropagation(); onExport(); setShowMenu(false); }} className="w-full px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] flex items-center gap-2">
                <FileDown size={12} /> Export CSV
              </button>
              <button onClick={(e) => { e.stopPropagation(); onRename(); setShowMenu(false); }} className="w-full px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] flex items-center gap-2">
                <PenLine size={12} /> Rename
              </button>
              <button onClick={(e) => { e.stopPropagation(); onArchive(); setShowMenu(false); }} className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-[var(--bg-tertiary)] flex items-center gap-2">
                <Archive size={12} /> Archive
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Job Progress ---
function JobProgress({ job, onCancel }: { job: ABMJob; onCancel: (id: string) => void }) {
  const pct = job.target > 0 ? Math.min((job.found / job.target) * 100, 100) : 0;
  const isActive = job.status === 'queued' || job.status === 'running';
  return (
    <div className="p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-blue-400 flex items-center gap-1">
          {isActive && <Loader2 size={10} className="animate-spin" />}
          {job.jobType === 'expand' ? 'Expanding' : 'Generating'} — {job.found}/{job.target}
        </span>
        {isActive && (
          <button onClick={() => onCancel(job.id)} className="text-[10px] text-red-400 hover:text-red-300">Cancel</button>
        )}
      </div>
      <div className="h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// --- Brief Interpreter Drawer ---
function BriefDrawer({ onClose, onStartResearch, existingList }: {
  onClose: () => void;
  onStartResearch: (criteria: Criteria, listId?: string) => void;
  existingList?: ABMList | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [criteria, setCriteria] = useState<Criteria | null>(null);
  const [target, setTarget] = useState(200);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/abm/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();

      if (data.message) {
        setMessages([...newMessages, { role: 'assistant', content: data.message }]);
      }
      if (data.criteria) {
        setCriteria(data.criteria);
        setTarget(data.criteria.estimatedTarget || 200);
      }
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: 'Something went wrong. Try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface-solid)]">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {existingList ? `Expand "${existingList.name}"` : 'New List'}
          </h2>
          <p className="text-xs text-[var(--text-muted)]">Describe your targets or paste a campaign brief</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]"><X size={16} /></button>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Sparkles size={24} className="mx-auto text-indigo-400 mb-3" />
            <p className="text-sm text-[var(--text-tertiary)] mb-1">What kind of companies are you looking for?</p>
            <p className="text-xs text-[var(--text-muted)]">Describe your ideal targets, paste a campaign brief, or name specific examples.</p>
            <div className="mt-4 space-y-2">
              {[
                "Healthtech companies in Europe that need voice AI for patient communication",
                "Companies currently using Twilio for SMS — mid-market, North America",
                "BPOs and enterprises that need to replace legacy IVR systems",
              ].map((example, i) => (
                <button key={i} onClick={() => setInput(example)}
                  className="block w-full text-left px-3 py-2 text-xs text-[var(--text-tertiary)] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg hover:border-[var(--border-hover)] hover:text-[var(--text-secondary)] transition-all">
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-indigo-900/50 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={12} className="text-indigo-400" />
              </div>
            )}
            <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
              msg.role === 'user'
                ? 'bg-indigo-600/30 text-[var(--text-primary)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0 mt-0.5">
                <User size={12} className="text-[var(--text-tertiary)]" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-900/50 flex items-center justify-center shrink-0">
              <Loader2 size={12} className="text-indigo-400 animate-spin" />
            </div>
            <div className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)]">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Criteria Card */}
      {criteria && (
        <div className="mx-4 mb-3 p-4 bg-[var(--bg-elevated)] border border-indigo-800/50 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-indigo-400" />
            <span className="text-sm font-medium text-[var(--text-primary)]">Research Plan</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${listTypeConfig[criteria.listType]?.bg || ''} ${listTypeConfig[criteria.listType]?.color || ''}`}>
              {listTypeConfig[criteria.listType]?.label || criteria.listType}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div><span className="text-[var(--text-muted)]">Name:</span> <span className="text-[var(--text-secondary)]">{criteria.listName}</span></div>
            <div><span className="text-[var(--text-muted)]">Profile:</span> <span className="text-[var(--text-secondary)]">{criteria.targetCompanyProfile}</span></div>
            {criteria.regions.length > 0 && (
              <div><span className="text-[var(--text-muted)]">Regions:</span> <span className="text-[var(--text-secondary)]">{criteria.regions.join(', ')}</span></div>
            )}
            {criteria.productFit.length > 0 && (
              <div><span className="text-[var(--text-muted)]">Product fit:</span> <span className="text-[var(--text-secondary)]">{criteria.productFit.map(p => productFitLabels[p] || p).join(', ')}</span></div>
            )}
            {criteria.includeProviders.length > 0 && (
              <div><span className="text-[var(--text-muted)]">Targeting users of:</span> <span className="text-red-400">{criteria.includeProviders.join(', ')}</span></div>
            )}
            {criteria.exampleCompanies.length > 0 && (
              <div><span className="text-[var(--text-muted)]">Similar to:</span> <span className="text-[var(--text-secondary)]">{criteria.exampleCompanies.join(', ')}</span></div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-[var(--text-muted)] mb-1 block">Target: {target} companies</label>
              <input type="range" min={25} max={500} step={25} value={target} onChange={e => setTarget(+e.target.value)}
                className="w-full accent-indigo-500" />
            </div>
            <button
              onClick={() => onStartResearch({ ...criteria, estimatedTarget: target }, existingList?.id)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 flex items-center gap-2 shrink-0"
            >
              <ArrowRight size={14} /> Start Research
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-[var(--border)]">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={criteria ? "Refine your criteria..." : "Describe your targets or paste a brief..."}
            rows={2}
            className="w-full px-3 py-2 pr-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:border-[var(--accent-border)] focus:outline-none resize-none"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="absolute right-2 bottom-2 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Rename Modal ---
function RenameModal({ list, onClose, onSubmit }: { list: ABMList; onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(list.name);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--bg-surface-solid)] border border-[var(--border)] rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Rename List</h2>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus
          className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:border-[var(--accent-border)] focus:outline-none"
          onKeyDown={e => e.key === 'Enter' && onSubmit(name)}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]">Cancel</button>
          <button onClick={() => onSubmit(name)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg">Save</button>
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---
export default function ABMPage() {
  const [accounts, setAccounts] = useState<ABMAccount[]>([]);
  const [lists, setLists] = useState<ABMList[]>([]);
  const [jobs, setJobs] = useState<ABMJob[]>([]);
  const [filters, setFilters] = useState<any>({});
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  // State
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [verticalFilter, setVerticalFilter] = useState('');
  const [productFitFilter, setProductFitFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [listTypeFilter, setListTypeFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [listsCollapsed, setListsCollapsed] = useState(false);

  // Drawer / Modals
  const [showDrawer, setShowDrawer] = useState(false);
  const [expandList, setExpandList] = useState<ABMList | null>(null);
  const [renameList, setRenameList] = useState<ABMList | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedListId) params.set('listId', selectedListId);
      if (searchQuery) params.set('q', searchQuery);
      if (regionFilter) params.set('region', regionFilter);
      if (verticalFilter) params.set('vertical', verticalFilter);
      if (productFitFilter) params.set('productFit', productFitFilter);
      if (statusFilter) params.set('status', statusFilter);

      const [accRes, jobRes] = await Promise.all([
        fetch(`/api/abm?${params}`),
        fetch('/api/abm/jobs'),
      ]);
      const accData = await accRes.json();
      const jobData = await jobRes.json();

      setAccounts(accData.accounts || []);
      setLists(accData.lists || []);
      setFilters(accData.filters || {});
      setStats(accData.stats || {});
      setJobs(jobData.jobs || []);
    } catch (e) {
      console.error('Failed to fetch ABM data:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedListId, searchQuery, regionFilter, verticalFilter, productFitFilter, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'queued' || j.status === 'running');
    if (!hasActive) return;
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [jobs, fetchData]);

  const filteredLists = useMemo(() => {
    if (!listTypeFilter) return lists;
    return lists.filter(l => l.listType === listTypeFilter);
  }, [lists, listTypeFilter]);

  const selectedList = lists.find(l => l.id === selectedListId);
  const hasActiveFilters = regionFilter || verticalFilter || productFitFilter || statusFilter;

  // Actions
  const handleStartResearch = async (criteria: Criteria, listId?: string) => {
    setShowDrawer(false);
    setExpandList(null);

    const payload: any = {
      query: JSON.stringify(criteria),
      target: criteria.estimatedTarget,
      listType: criteria.listType,
      description: criteria.description,
      createdBy: 'hub-user',
    };

    if (listId) {
      payload.listId = listId;
    }

    // If creating new list, also pass the name
    if (!listId) {
      // Create list first, then start job
      const listRes = await fetch('/api/abm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-list',
          name: criteria.listName,
          listType: criteria.listType,
          description: criteria.description,
          createdBy: 'hub-user',
        }),
      });
      const listData = await listRes.json();
      if (listData.ok) {
        payload.listId = listData.list.id;
      }
    }

    if (payload.listId) {
      await fetch('/api/abm/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    fetchData();
  };

  const handleRenameList = async (name: string) => {
    if (!renameList) return;
    setRenameList(null);
    await fetch('/api/abm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rename-list', listId: renameList.id, name }),
    });
    fetchData();
  };

  const handleArchiveList = async (listId: string) => {
    if (!confirm('Archive this list? It can be restored later.')) return;
    await fetch('/api/abm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'archive-list', listId }),
    });
    if (selectedListId === listId) setSelectedListId(null);
    fetchData();
  };

  const handleExportCSV = async (listId: string) => {
    const params = new URLSearchParams({ listId });
    if (regionFilter) params.set('region', regionFilter);
    if (verticalFilter) params.set('vertical', verticalFilter);
    try {
      const res = await fetch(`/api/abm/export?${params}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || 'abm-export.csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed. Check console for details.');
    }
  };

  const handleCancelJob = async (jobId: string) => {
    await fetch('/api/abm/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', jobId }),
    });
    fetchData();
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!selectedListId) return;
    await fetch('/api/abm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove-from-list', listId: selectedListId, accountIds: [accountId] }),
    });
    fetchData();
  };

  const activeJobs = jobs.filter(j => j.status === 'queued' || j.status === 'running');

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-[var(--text-muted)]" size={24} /></div>;
  }

  return (
    <div className="flex h-full">
      {/* Left Panel — Lists */}
      <div className={`${listsCollapsed ? 'w-12' : 'w-72'} border-r border-[var(--border)] flex flex-col transition-all shrink-0`}>
        <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
          {!listsCollapsed && <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Lists</h2>}
          <div className="flex items-center gap-1">
            {!listsCollapsed && (
              <button onClick={() => setShowDrawer(true)}
                className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white">
                <Plus size={14} />
              </button>
            )}
            <button onClick={() => setListsCollapsed(!listsCollapsed)} className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
              {listsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {!listsCollapsed && (
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {/* Type filter tabs */}
            <div className="flex gap-1 mb-2">
              <button onClick={() => setListTypeFilter('')}
                className={`px-2 py-1 text-[10px] rounded ${!listTypeFilter ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                All
              </button>
              {Object.entries(listTypeConfig).map(([key, config]) => (
                <button key={key} onClick={() => setListTypeFilter(key)}
                  className={`px-2 py-1 text-[10px] rounded flex items-center gap-1 ${listTypeFilter === key ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                  <config.icon size={10} /> {config.label}
                </button>
              ))}
            </div>

            {/* All Accounts */}
            <div
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                !selectedListId ? 'border-indigo-500 bg-indigo-900/20' : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-hover)]'
              }`}
              onClick={() => setSelectedListId(null)}
            >
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-[var(--text-tertiary)]" />
                <span className="text-sm text-[var(--text-primary)]">All Accounts</span>
                <span className="text-xs text-[var(--text-muted)] ml-auto">{stats.total}</span>
              </div>
            </div>

            {filteredLists.map(list => {
              const activeJob = jobs.find(j => j.listId === list.id && (j.status === 'queued' || j.status === 'running'));
              return (
                <ListCard
                  key={list.id} list={list} isSelected={selectedListId === list.id}
                  onClick={() => setSelectedListId(list.id)}
                  onExpand={() => setExpandList(list)}
                  onRename={() => setRenameList(list)}
                  onArchive={() => handleArchiveList(list.id)}
                  onExport={() => handleExportCSV(list.id)}
                  activeJob={activeJob}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Right Panel — Accounts or Drawer */}
      {(showDrawer || expandList) ? (
        <div className="flex-1">
          <BriefDrawer
            onClose={() => { setShowDrawer(false); setExpandList(null); }}
            onStartResearch={handleStartResearch}
            existingList={expandList}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                  {selectedList ? selectedList.name : 'All Accounts'}
                </h1>
                {selectedList && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {listTypeConfig[selectedList.listType]?.label} list • {accounts.length} accounts
                    {selectedList.description && ` • ${selectedList.description}`}
                  </p>
                )}
                {!selectedList && (
                  <div className="text-xs text-[var(--text-muted)]">
                    <span>{accounts.length} accounts across {lists.length} lists</span>
                    {stats.byStatus && (
                      <span className="ml-2">
                        {stats.byStatus.validated ? <><span className="text-emerald-400">{stats.byStatus.validated} validated</span></> : null}
                        {stats.byStatus.validated && stats.byStatus.unverified ? ' · ' : ''}
                        {stats.byStatus.unverified ? <><span className="text-amber-400">{stats.byStatus.unverified} unverified</span></> : null}
                        {(stats.byStatus.validated || stats.byStatus.unverified) && stats.byStatus.identified ? ' · ' : ''}
                        {stats.byStatus.identified ? <><span className="text-gray-500">{stats.byStatus.identified} identified</span></> : null}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedList && (
                  <>
                    <button onClick={() => setExpandList(selectedList)}
                      className="px-3 py-1.5 text-xs bg-indigo-600/20 text-indigo-400 rounded-lg hover:bg-indigo-600/30 flex items-center gap-1.5">
                      <Sparkles size={12} /> Expand
                    </button>
                    <button onClick={() => handleExportCSV(selectedList.id)}
                      className="px-3 py-1.5 text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-tertiary)] flex items-center gap-1.5">
                      <Download size={12} /> Export
                    </button>
                  </>
                )}
                <button onClick={() => setShowFilters(!showFilters)}
                  className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 ${
                    hasActiveFilters ? 'bg-indigo-600/20 text-indigo-400' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <Filter size={12} /> Filters {hasActiveFilters && '•'}
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search companies or domains..."
                className="w-full pl-9 pr-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:border-[var(--accent-border)] focus:outline-none"
              />
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="flex flex-wrap gap-2 mt-3">
                <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
                  className="px-2 py-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded text-xs text-[var(--text-secondary)]">
                  <option value="">All Regions</option>
                  {(filters.regions || []).map((r: string) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={verticalFilter} onChange={e => setVerticalFilter(e.target.value)}
                  className="px-2 py-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded text-xs text-[var(--text-secondary)]">
                  <option value="">All Verticals</option>
                  {(filters.verticals || []).map((v: string) => <option key={v} value={v}>{v}</option>)}
                </select>
                <select value={productFitFilter} onChange={e => setProductFitFilter(e.target.value)}
                  className="px-2 py-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded text-xs text-[var(--text-secondary)]">
                  <option value="">All Products</option>
                  {(filters.productFits || []).map((p: string) => <option key={p} value={p}>{productFitLabels[p] || p}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="px-2 py-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded text-xs text-[var(--text-secondary)]">
                  <option value="">All Statuses</option>
                  <option value="validated">✓ Validated</option>
                  <option value="unverified">! Unverified</option>
                  <option value="identified">? Identified</option>
                </select>
                {hasActiveFilters && (
                  <button onClick={() => { setRegionFilter(''); setVerticalFilter(''); setProductFitFilter(''); setStatusFilter(''); }}
                    className="px-2 py-1 text-xs text-red-400 hover:text-red-300">Clear</button>
                )}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--bg-surface-solid)] backdrop-blur">
                <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="p-3">Company</th>
                  <th className="p-3">Vertical</th>
                  <th className="p-3">Country</th>
                  <th className="p-3">Region</th>
                  <th className="p-3">Product Fit</th>
                  {selectedList?.listType === 'conquest' && <th className="p-3">Current Provider</th>}
                  <th className="p-3">Added</th>
                  {selectedListId && <th className="p-3 w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {accounts.map(account => (
                  <tr key={account.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)] group">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <ConfidenceBadge account={account} />
                        <div>
                          <div className="text-[var(--text-primary)] font-medium">{account.company}</div>
                          {account.domain && (
                            <a href={`https://${account.domain}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[var(--text-muted)] hover:text-indigo-400 flex items-center gap-1">
                              {account.domain} <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-[var(--text-tertiary)]">{account.vertical || '—'}</td>
                    <td className="p-3 text-xs text-[var(--text-tertiary)]">{account.country || '—'}</td>
                    <td className="p-3">
                      {account.region ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-elevated)] text-[var(--text-tertiary)] border border-[var(--border)]">
                          {account.region}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="p-3 text-xs text-[var(--text-tertiary)]">
                      {account.productFit ? (productFitLabels[account.productFit] || account.productFit) : '—'}
                    </td>
                    {selectedList?.listType === 'conquest' && (
                      <td className="p-3">
                        {account.currentProvider ? (
                          <div>
                            <span className="text-xs text-red-400 font-medium">{account.currentProvider}</span>
                            {account.switchSignal && (
                              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 max-w-[200px] truncate">{account.switchSignal}</p>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                    )}
                    <td className="p-3 text-[10px] text-[var(--text-muted)]">
                      {selectedListId && account.memberAddedAt?.[selectedListId]
                        ? new Date(account.memberAddedAt[selectedListId]).toLocaleDateString()
                        : '—'
                      }
                    </td>
                    {selectedListId && (
                      <td className="p-3">
                        <button
                          onClick={() => handleDeleteAccount(account.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/30 text-[var(--text-muted)] hover:text-red-400 transition-all"
                          title="Remove from list"
                        >
                          <X size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-[var(--text-muted)] text-sm">
                      {selectedListId ? 'No accounts matching your filters' : 'No accounts found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameList && <RenameModal list={renameList} onClose={() => setRenameList(null)} onSubmit={handleRenameList} />}
    </div>
  );
}
