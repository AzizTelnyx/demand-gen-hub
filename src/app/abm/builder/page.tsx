'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Plus, Upload, Download, Trash2, Play,
  Loader2, CheckCircle, Clock, FileText, Send,
  ChevronRight, ChevronDown, AlertTriangle, X, ChevronLeft,
} from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import DomainSlideOut from '@/components/DomainSlideOut';
import RelevanceBar from '@/components/RelevanceBar';
import PlatformBadge from '@/components/PlatformBadge';
import { formatRelativeTime } from '@/lib/utils';

interface BuilderList {
  id: string;
  name: string;
  description?: string;
  domainCount: number;
  status: 'draft' | 'active' | 'pushed';
  platforms: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

interface ListDomain {
  domain: string;
  company: string;
  relevanceScore: number;
  addedAt: string;
  addedBy: string;
}

interface ProductAudience {
  id: string;
  product: string;
  name: string;
  domainCount: number;
}

const STATUS_BADGES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', color: 'text-gray-400 bg-gray-500/10 border-gray-500/20', icon: <FileText size={12} /> },
  active: { label: 'Active', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: <CheckCircle size={12} /> },
  pushed: { label: 'Pushed', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', icon: <Send size={12} /> },
};

const DOMAINS_PER_PAGE = 50;

export default function BuilderPage() {
  const [lists, setLists] = useState<BuilderList[]>([]);
  const [productAudiences, setProductAudiences] = useState<ProductAudience[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedList, setSelectedList] = useState<BuilderList | null>(null);
  const [listDomains, setListDomains] = useState<ListDomain[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [showPushModal, setShowPushModal] = useState<'stackadapt' | 'google_ads' | null>(null);
  const [showAddDomainsModal, setShowAddDomainsModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExpanderConfirm, setShowExpanderConfirm] = useState(false);
  const [confirmDeleteList, setConfirmDeleteList] = useState<BuilderList | null>(null);
  const [confirmRemoveDomain, setConfirmRemoveDomain] = useState<string | null>(null);

  // Form states
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [newListSource, setNewListSource] = useState<string>('');
  const [newListLoading, setNewListLoading] = useState(false);
  const [newListError, setNewListError] = useState<string | null>(null);

  const [addDomainsText, setAddDomainsText] = useState('');
  const [addDomainsLoading, setAddDomainsLoading] = useState(false);
  const [addDomainsError, setAddDomainsError] = useState<string | null>(null);

  const [importPreview, setImportPreview] = useState<string[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const [expanderLoading, setExpanderLoading] = useState(false);
  const [expanderError, setExpanderError] = useState<string | null>(null);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [removeDomainLoading, setRemoveDomainLoading] = useState(false);
  const [removeDomainError, setRemoveDomainError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/abm/lists').then(r => r.json()),
      fetch('/api/abm/campaigns').then(r => r.json()),
    ])
      .then(([listsData, campaignsData]) => {
        setLists(listsData.lists || []);
        // Get product audiences from campaigns data
        setProductAudiences(
          (campaignsData.products || []).map((p: { id: string; product: string; name: string; domainCount: number }) => ({
            id: p.id || p.product,
            product: p.product,
            name: p.name || p.product,
            domainCount: p.domainCount,
          }))
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSelectList = async (list: BuilderList) => {
    setSelectedList(list);
    setDomainsLoading(true);
    setCurrentPage(1);

    try {
      const res = await fetch(`/api/abm/lists/${list.id}`);
      const data = await res.json();
      setListDomains(data.domains || []);
    } catch {
      setListDomains([]);
    } finally {
      setDomainsLoading(false);
    }
  };

  const filteredDomains = useMemo(() => {
    let result = listDomains;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.domain.toLowerCase().includes(q) ||
        d.company.toLowerCase().includes(q)
      );
    }

    if (scoreFilter !== 'all') {
      result = result.filter(d => {
        if (scoreFilter === 'high') return d.relevanceScore >= 0.7;
        if (scoreFilter === 'medium') return d.relevanceScore >= 0.4 && d.relevanceScore < 0.7;
        return d.relevanceScore < 0.4;
      });
    }

    return result;
  }, [listDomains, searchQuery, scoreFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredDomains.length / DOMAINS_PER_PAGE);
  const paginatedDomains = useMemo(() => {
    const start = (currentPage - 1) * DOMAINS_PER_PAGE;
    return filteredDomains.slice(start, start + DOMAINS_PER_PAGE);
  }, [filteredDomains, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, scoreFilter]);

  // Create new list
  const handleCreateList = async () => {
    if (!newListName.trim()) return;

    setNewListLoading(true);
    setNewListError(null);

    try {
      const res = await fetch('/api/abm/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newListName.trim(),
          description: newListDescription.trim() || undefined,
          copyFromProduct: newListSource || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to create list');

      const data = await res.json();
      setLists(prev => [...prev, data.list || { ...data, id: Date.now().toString() }]);
      setShowNewListModal(false);
      setNewListName('');
      setNewListDescription('');
      setNewListSource('');
    } catch {
      setNewListError('Failed to create list. Please try again.');
    } finally {
      setNewListLoading(false);
    }
  };

  // Delete list
  const handleDeleteList = async () => {
    if (!confirmDeleteList) return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/abm/lists/${confirmDeleteList.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete');

      setLists(prev => prev.filter(l => l.id !== confirmDeleteList.id));
      if (selectedList?.id === confirmDeleteList.id) {
        setSelectedList(null);
        setListDomains([]);
      }
      setConfirmDeleteList(null);
    } catch {
      setDeleteError('Failed to delete list. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Add domains
  const handleAddDomains = async () => {
    if (!selectedList || !addDomainsText.trim()) return;

    setAddDomainsLoading(true);
    setAddDomainsError(null);

    const domainList = addDomainsText
      .split('\n')
      .map(d => d.trim())
      .filter(d => d.length > 0);

    try {
      const res = await fetch(`/api/abm/lists/${selectedList.id}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: domainList }),
      });

      if (!res.ok) throw new Error('Failed to add domains');

      // Refresh domains
      handleSelectList(selectedList);
      setShowAddDomainsModal(false);
      setAddDomainsText('');
    } catch {
      setAddDomainsError('Failed to add domains. Please try again.');
    } finally {
      setAddDomainsLoading(false);
    }
  };

  // Remove domain
  const handleRemoveDomain = async () => {
    if (!selectedList || !confirmRemoveDomain) return;

    setRemoveDomainLoading(true);
    setRemoveDomainError(null);

    try {
      const res = await fetch(`/api/abm/lists/${selectedList.id}/domains`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: confirmRemoveDomain }),
      });

      if (!res.ok) throw new Error('Failed to remove');

      // Optimistically update
      setListDomains(prev => prev.filter(d => d.domain !== confirmRemoveDomain));
      setConfirmRemoveDomain(null);
    } catch {
      setRemoveDomainError('Failed to remove domain. Please try again.');
    } finally {
      setRemoveDomainLoading(false);
    }
  };

  // Import CSV
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      const domainIndex = headers.findIndex(h => h === 'domain' || h === 'domains');

      if (domainIndex === -1) {
        setImportError('CSV must have a "domain" column');
        return;
      }

      const domains: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const domain = cols[domainIndex]?.trim();
        if (domain && domain.length > 0) {
          domains.push(domain);
        }
      }

      setImportPreview(domains);
      setShowImportModal(true);
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImportConfirm = async () => {
    if (!selectedList || importPreview.length === 0) return;

    setImportLoading(true);
    setImportError(null);

    try {
      const res = await fetch(`/api/abm/lists/${selectedList.id}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: importPreview }),
      });

      if (!res.ok) throw new Error('Failed to import');

      handleSelectList(selectedList);
      setShowImportModal(false);
      setImportPreview([]);
    } catch {
      setImportError('Failed to import domains. Please try again.');
    } finally {
      setImportLoading(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!selectedList || listDomains.length === 0) return;

    const headers = 'domain,company,relevance_score,added_at,added_by\n';
    const rows = listDomains
      .map(d => `${d.domain},${d.company},${(d.relevanceScore * 100).toFixed(0)},${d.addedAt},${d.addedBy}`)
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedList.name.replace(/\s+/g, '_')}_domains.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Push to platform
  const handlePush = async () => {
    if (!selectedList || !showPushModal) return;

    setPushLoading(true);
    setPushError(null);

    try {
      const res = await fetch(`/api/abm/lists/${selectedList.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: showPushModal }),
      });

      if (!res.ok) throw new Error('Failed to push');

      // Update list status
      setLists(prev =>
        prev.map(l =>
          l.id === selectedList.id
            ? { ...l, status: 'pushed', platforms: [...new Set([...l.platforms, showPushModal])] }
            : l
        )
      );
      setSelectedList(prev =>
        prev
          ? { ...prev, status: 'pushed', platforms: [...new Set([...prev.platforms, showPushModal])] }
          : null
      );
      setShowPushModal(null);
    } catch {
      setPushError('Failed to push. Please try again.');
    } finally {
      setPushLoading(false);
    }
  };

  // Run Expander
  const handleRunExpander = async () => {
    if (!selectedList) return;

    setExpanderLoading(true);
    setExpanderError(null);

    try {
      const res = await fetch(`/api/abm/lists/${selectedList.id}/expand`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Failed to run expander');

      setShowExpanderConfirm(false);
      // Could show a success toast here
    } catch {
      setExpanderError('Failed to run expander. Please try again.');
    } finally {
      setExpanderLoading(false);
    }
  };

  // Close modals on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNewListModal(false);
        setShowPushModal(null);
        setShowAddDomainsModal(false);
        setShowImportModal(false);
        setShowExpanderConfirm(false);
        setConfirmDeleteList(null);
        setConfirmRemoveDomain(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-[var(--text-muted)]" size={24} />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left Panel - List Cards */}
      <div className="w-80 border-r border-[var(--border-primary)] flex flex-col">
        <div className="p-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Lists</h2>
              <InfoTooltip content="Create and manage domain lists for ABM campaigns" />
            </div>
            <button
              onClick={() => setShowNewListModal(true)}
              className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {lists.map(list => {
            const status = STATUS_BADGES[list.status];
            const isSelected = selectedList?.id === list.id;

            return (
              <div
                key={list.id}
                className={`p-3 rounded-lg border cursor-pointer transition-all relative group ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-900/20'
                    : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-hover)]'
                }`}
              >
                <div onClick={() => handleSelectList(list)}>
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-medium text-[var(--text-primary)] truncate pr-6">{list.name}</h3>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded border flex items-center gap-1 ${status.color}`}>
                      {status.icon} {status.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>{list.domainCount} domains</span>
                    {list.platforms.length > 0 && (
                      <div className="flex gap-1">
                        {list.platforms.map(p => (
                          <PlatformBadge key={p} platform={p} />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-[var(--text-muted)] mt-2">
                    Updated {formatRelativeTime(list.updatedAt)}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setConfirmDeleteList(list);
                  }}
                  className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-all"
                  title="Delete list"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}

          {lists.length === 0 && (
            <div className="text-center py-8 text-sm text-[var(--text-muted)]">
              No lists yet. Create your first list!
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - List Details */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedList ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-[var(--border-primary)]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h1 className="text-lg font-semibold text-[var(--text-primary)]">{selectedList.name}</h1>
                  <p className="text-xs text-[var(--text-muted)]">
                    {listDomains.length} domains • Created by {selectedList.createdBy}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-elevated)] flex items-center gap-1 border border-[var(--border-primary)]"
                  >
                    <Upload size={12} /> Import CSV
                  </button>
                  <button
                    onClick={handleExportCSV}
                    disabled={listDomains.length === 0}
                    className="px-3 py-1.5 text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-elevated)] flex items-center gap-1 border border-[var(--border-primary)] disabled:opacity-50"
                  >
                    <Download size={12} /> Export CSV
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowAddDomainsModal(true)}
                  className="px-3 py-1.5 text-xs bg-indigo-600/20 text-indigo-400 rounded-lg hover:bg-indigo-600/30 flex items-center gap-1 border border-indigo-500/20"
                >
                  <Plus size={12} /> Add Domains
                </button>
                <button
                  onClick={() => setShowExpanderConfirm(true)}
                  className="px-3 py-1.5 text-xs bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600/30 flex items-center gap-1 border border-emerald-500/20"
                >
                  <Play size={12} /> Run Expander
                </button>

                <div className="flex-1" />

                <button
                  onClick={() => setShowPushModal('stackadapt')}
                  className="px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-500 flex items-center gap-1"
                >
                  <Send size={12} /> Push to StackAdapt
                </button>
                <button
                  onClick={() => setShowPushModal('google_ads')}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 flex items-center gap-1"
                >
                  <Send size={12} /> Push to Google Ads
                </button>
              </div>
            </div>

            {/* Domain Search & Filter */}
            <div className="p-4 border-b border-[var(--border-primary)] flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search domains..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-sm"
                />
              </div>
              <select
                value={scoreFilter}
                onChange={e => setScoreFilter(e.target.value as typeof scoreFilter)}
                className="px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-sm"
              >
                <option value="all">All Scores</option>
                <option value="high">High (70%+)</option>
                <option value="medium">Medium (40-70%)</option>
                <option value="low">Low (&lt;40%)</option>
              </select>
            </div>

            {/* Domain List */}
            <div className="flex-1 overflow-auto">
              {domainsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-[var(--text-muted)]" size={24} />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--bg-surface-solid)]">
                    <tr className="border-b border-[var(--border-primary)]">
                      <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">Domain</th>
                      <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">
                        <div className="flex items-center gap-1">
                          Relevance <InfoTooltip content="AI-calculated relevance score" size={10} />
                        </div>
                      </th>
                      <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">Added</th>
                      <th className="text-right px-4 py-2 font-medium text-[var(--text-muted)] text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDomains.map(d => (
                      <tr key={d.domain} className="border-b border-[var(--border-primary)] hover:bg-[var(--bg-elevated)] group">
                        <td className="px-4 py-2">
                          <button
                            onClick={() => setSelectedDomain(d.domain)}
                            className="text-left"
                          >
                            <div className="font-medium text-[var(--text-primary)] hover:text-indigo-400">{d.domain}</div>
                            <div className="text-[10px] text-[var(--text-muted)]">{d.company}</div>
                          </button>
                        </td>
                        <td className="px-4 py-2">
                          <RelevanceBar score={d.relevanceScore} />
                        </td>
                        <td className="px-4 py-2 text-xs text-[var(--text-muted)]">
                          {formatRelativeTime(d.addedAt)}
                          <br />
                          <span className="text-[10px]">by {d.addedBy}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => setConfirmRemoveDomain(d.domain)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {filteredDomains.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                          {searchQuery ? 'No domains match your search' : 'No domains in this list'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-[var(--border-primary)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>
                  Showing {(currentPage - 1) * DOMAINS_PER_PAGE + 1}-
                  {Math.min(currentPage * DOMAINS_PER_PAGE, filteredDomains.length)} of {filteredDomains.length} domains
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
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText size={48} className="mx-auto text-[var(--text-muted)] mb-4" />
              <h2 className="text-lg font-semibold text-[var(--text-secondary)] mb-2">Select a list</h2>
              <p className="text-sm text-[var(--text-muted)]">Choose a list from the sidebar or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* Domain Slide-Out */}
      <DomainSlideOut
        domain={selectedDomain}
        onClose={() => setSelectedDomain(null)}
      />

      {/* New List Modal */}
      {showNewListModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewListModal(false)}>
          <div className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Plus size={16} /> New List
                <InfoTooltip content="Create an empty list or import domains from a product audience" />
              </h2>
              <button onClick={() => setShowNewListModal(false)} className="p-1 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">List Name</label>
                <input
                  type="text"
                  placeholder="e.g., Healthcare AI Targets Q2"
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Description (optional)</label>
                <textarea
                  placeholder="What is this list for?"
                  rows={2}
                  value={newListDescription}
                  onChange={e => setNewListDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">
                  Copy from Product Audience (optional)
                  <InfoTooltip content="Import all domains with this product fit into your new list" size={12} />
                </label>
                <select
                  value={newListSource}
                  onChange={e => setNewListSource(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm"
                >
                  <option value="">Start blank</option>
                  {productAudiences.map(p => (
                    <option key={p.product} value={p.product}>
                      {p.product} ({p.domainCount} domains)
                    </option>
                  ))}
                </select>
              </div>

              {newListError && (
                <p className="text-xs text-red-400">{newListError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowNewListModal(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateList}
                disabled={newListLoading || !newListName.trim()}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-1"
              >
                {newListLoading && <Loader2 size={12} className="animate-spin" />}
                Create List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Domains Modal */}
      {showAddDomainsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddDomainsModal(false)}>
          <div className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Plus size={16} /> Add Domains
              </h2>
              <button onClick={() => setShowAddDomainsModal(false)} className="p-1 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Domains (one per line)</label>
                <textarea
                  placeholder="example.com&#10;another-domain.io&#10;third-example.com"
                  rows={8}
                  value={addDomainsText}
                  onChange={e => setAddDomainsText(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm resize-none font-mono"
                />
              </div>

              {addDomainsError && (
                <p className="text-xs text-red-400">{addDomainsError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowAddDomainsModal(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDomains}
                disabled={addDomainsLoading || !addDomainsText.trim()}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-1"
              >
                {addDomainsLoading && <Loader2 size={12} className="animate-spin" />}
                Add Domains
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Preview Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowImportModal(false)}>
          <div className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Upload size={16} /> Import Preview
              </h2>
              <button onClick={() => setShowImportModal(false)} className="p-1 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-[var(--text-secondary)] mb-3">
              Found {importPreview.length} domains to import:
            </p>

            <div className="max-h-48 overflow-y-auto bg-[var(--bg-elevated)] rounded-lg p-3 text-xs font-mono space-y-1">
              {importPreview.slice(0, 20).map((d, i) => (
                <div key={i} className="text-[var(--text-secondary)]">{d}</div>
              ))}
              {importPreview.length > 20 && (
                <div className="text-[var(--text-muted)]">... and {importPreview.length - 20} more</div>
              )}
            </div>

            {importError && (
              <p className="text-xs text-red-400 mt-3">{importError}</p>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleImportConfirm}
                disabled={importLoading}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-1"
              >
                {importLoading && <Loader2 size={12} className="animate-spin" />}
                Import {importPreview.length} Domains
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Push Confirmation Modal */}
      {showPushModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPushModal(null)}>
          <div className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <Send size={16} /> Push to {showPushModal === 'stackadapt' ? 'StackAdapt' : 'Google Ads'}
            </h2>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-400 font-medium">Approval Required</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    This will push {listDomains.length} domains to {showPushModal === 'stackadapt' ? 'StackAdapt' : 'Google Ads'}.
                    This action requires manager approval.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">List:</span>
                <span className="text-[var(--text-primary)]">{selectedList?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Domains:</span>
                <span className="text-[var(--text-primary)]">{listDomains.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Platform:</span>
                <span className={showPushModal === 'stackadapt' ? 'text-violet-400' : 'text-blue-400'}>
                  {showPushModal === 'stackadapt' ? 'StackAdapt' : 'Google Ads'}
                </span>
              </div>
            </div>

            {pushError && (
              <p className="text-xs text-red-400 mt-4">{pushError}</p>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowPushModal(null)}
                className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              >
                Cancel
              </button>
              <button
                onClick={handlePush}
                disabled={pushLoading}
                className={`px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50 flex items-center gap-1 ${
                  showPushModal === 'stackadapt' ? 'bg-violet-600 hover:bg-violet-500' : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {pushLoading && <Loader2 size={12} className="animate-spin" />}
                Request Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run Expander Confirmation */}
      {showExpanderConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowExpanderConfirm(false)}>
          <div className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <Play size={16} className="text-emerald-400" /> Run Expander
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Run Expander for this list? It will discover new domains matching the list profile.
            </p>

            {expanderError && (
              <p className="text-xs text-red-400 mb-4">{expanderError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowExpanderConfirm(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleRunExpander}
                disabled={expanderLoading}
                className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1"
              >
                {expanderLoading && <Loader2 size={12} className="animate-spin" />}
                Run Expander
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete List Confirmation */}
      {confirmDeleteList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmDeleteList(null)}>
          <div className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <Trash2 size={16} className="text-red-400" /> Delete List
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Delete <span className="font-medium text-[var(--text-primary)]">{confirmDeleteList.name}</span>? This cannot be undone.
            </p>

            {deleteError && (
              <p className="text-xs text-red-400 mb-4">{deleteError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteList(null)}
                className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteList}
                disabled={deleteLoading}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 flex items-center gap-1"
              >
                {deleteLoading && <Loader2 size={12} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Domain Confirmation */}
      {confirmRemoveDomain && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmRemoveDomain(null)}>
          <div className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2">
              Remove Domain
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Remove <span className="font-medium text-[var(--text-primary)]">{confirmRemoveDomain}</span> from this list?
            </p>

            {removeDomainError && (
              <p className="text-xs text-red-400 mb-4">{removeDomainError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemoveDomain(null)}
                className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveDomain}
                disabled={removeDomainLoading}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 flex items-center gap-1"
              >
                {removeDomainLoading && <Loader2 size={12} className="animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
