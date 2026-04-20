'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Search, ChevronDown, ChevronRight, Plus,
  RotateCcw, ShieldX, AlertTriangle,
  Loader2, Send, X,
} from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import DomainSlideOut from '@/components/DomainSlideOut';
import SfBadge from '@/components/SfBadge';
import { formatRelativeTime } from '@/lib/utils';

interface Exclusion {
  id: string;
  domain: string;
  company: string | null;
  country: string | null;
  product: string;
  category: string;
  reason: string;
  addedBy: string;
  addedAt: string;
  excludedAt: string;
  excludedBy: string;
  notes: string | null;
  sfStatus: 'none' | 'lead' | 'account' | 'opportunity' | 'customer';
  inSalesforce: boolean;
  // Computed fields
  expandedReason?: boolean;
}

interface ProductGroup {
  product: string;
  count: number;
}

const EXCLUDER_BADGES: Record<string, { label: string; className: string }> = {
  pruner: { label: 'pruner', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  'abm-pruner': { label: 'pruner', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  manual: { label: 'manual', className: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
  auditor: { label: 'auditor', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  'abm-auditor': { label: 'auditor', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  'negative-builder': { label: 'neg-builder', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  'abm-negative-builder': { label: 'neg-builder', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  system: { label: 'system', className: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
};

export default function ExclusionsPage() {
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state for add modal
  const [addDomain, setAddDomain] = useState('');
  const [addProduct, setAddProduct] = useState('');
  const [addReason, setAddReason] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Restore confirmation
  const [confirmRestore, setConfirmRestore] = useState<Exclusion | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Bulk restore
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false);
  const [bulkRestoreLoading, setBulkRestoreLoading] = useState(false);
  const [bulkRestoreError, setBulkRestoreError] = useState<string | null>(null);

  // Push to SA
  const [pushLoading, setPushLoading] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);


  useEffect(() => {
    fetch('/api/abm/exclusions')
      .then(r => r.json())
      .then(data => {
        setExclusions(data.exclusions || []);
        setProductGroups(data.productGroups || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggleProduct = (product: string) => {
    const next = new Set(expandedProducts);
    if (next.has(product)) {
      next.delete(product);
    } else {
      next.add(product);
    }
    setExpandedProducts(next);
  };

  const filteredExclusions = useMemo(() => {
    if (!searchQuery) return exclusions;
    const q = searchQuery.toLowerCase();
    return exclusions.filter(e =>
      e.domain.toLowerCase().includes(q) ||
      (e.company || '').toLowerCase().includes(q) ||
      e.reason.toLowerCase().includes(q)
    );
  }, [exclusions, searchQuery]);

  const groupedExclusions = useMemo(() => {
    const groups: Record<string, Exclusion[]> = {};
    filteredExclusions.forEach(e => {
      if (!groups[e.product]) groups[e.product] = [];
      groups[e.product].push(e);
    });
    return groups;
  }, [filteredExclusions]);

  // Toggle reason expansion
  const toggleReason = (id: string) => {
    const next = new Set(expandedReasons);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedReasons(next);
  };

  // Handle restore single exclusion
  const handleRestore = async () => {
    if (!confirmRestore) return;

    setRestoreLoading(true);
    setRestoreError(null);

    try {
      const res = await fetch('/api/abm/exclusions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: confirmRestore.id }),
      });

      if (!res.ok) throw new Error('Failed to restore');

      setExclusions(prev => prev.filter(e => e.id !== confirmRestore.id));
      setConfirmRestore(null);
    } catch {
      setRestoreError('Failed to restore domain. Please try again.');
    } finally {
      setRestoreLoading(false);
    }
  };

  // Handle add exclusion
  const handleAddExclusion = async () => {
    if (!addDomain.trim() || !addProduct) return;

    setAddLoading(true);
    setAddError(null);

    try {
      const res = await fetch('/api/abm/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: addDomain.trim(),
          product: addProduct,
          reason: addReason.trim() || 'Manual exclusion',
        }),
      });

      if (!res.ok) throw new Error('Failed to add exclusion');

      setShowAddModal(false);
      setAddDomain('');
      setAddProduct('');
      setAddReason('');
      // Refresh data
      const data = await fetch('/api/abm/exclusions').then(r => r.json());
      setExclusions(data.exclusions || []);
      setProductGroups(data.productGroups || []);
    } catch {
      setAddError('Failed to add exclusion. Please try again.');
    } finally {
      setAddLoading(false);
    }
  };

  // Handle push to SA
  const handlePushToSA = async (product: string) => {
    setPushLoading(product);
    setPushError(null);

    try {
      const res = await fetch('/api/abm/exclusions/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product }),
      });

      if (!res.ok) throw new Error('Failed to push');

      // Update local state
      setExclusions(prev =>
        prev.map(e =>
          e.product === product ? { ...e, pushedToSA: true } : e
        )
      );
      setProductGroups(prev =>
        prev.map(g =>
          g.product === product ? { ...g, pushedCount: g.count } : g
        )
      );
    } catch {
      setPushError(`Failed to push ${product} to SA. Please try again.`);
    } finally {
      setPushLoading(null);
    }
  };

  // Handle bulk restore
  const handleBulkRestore = async () => {
    setBulkRestoreLoading(true);
    setBulkRestoreError(null);

    const ids = Array.from(selectedIds);

    try {
      const res = await fetch('/api/abm/exclusions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      if (!res.ok) throw new Error('Failed to restore');

      setExclusions(prev => prev.filter(e => !selectedIds.has(e.id)));
      setSelectedIds(new Set());
      setShowBulkRestoreConfirm(false);
    } catch {
      setBulkRestoreError('Failed to restore domains. Please try again.');
    } finally {
      setBulkRestoreLoading(false);
    }
  };


  // Toggle selection
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Close modals on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setConfirmRestore(null);
        setShowBulkRestoreConfirm(false);
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Exclusions</h1>
            <InfoTooltip content="Domains excluded from ABM targeting. These are pushed to StackAdapt as negative audiences." />
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {exclusions.length} excluded domains across {productGroups.length} products
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 flex items-center gap-2"
          >
            <Plus size={14} /> Add Exclusion
          </button>
        </div>
      </div>

      {/* Bulk restore button */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg">
          <span className="text-sm text-[var(--text-secondary)]">
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => {
              if (selectedIds.size > 10) {
                setShowBulkRestoreConfirm(true);
              } else {
                handleBulkRestore();
              }
            }}
            className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 flex items-center gap-1"
          >
            <RotateCcw size={12} /> Restore Selected ({selectedIds.size})
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* Push error */}
      {pushError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {pushError}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Search exclusions..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-sm"
        />
      </div>

      {/* Product Groups */}
      <div className="space-y-4">
        {productGroups.map(group => {
          const isExpanded = expandedProducts.has(group.product);
          const productExclusions = groupedExclusions[group.product] || [];

          return (
            <div key={group.product} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg overflow-hidden">
              {/* Group Header */}
              <button
                onClick={() => toggleProduct(group.product)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{group.product}</h3>
                  <span className="text-xs text-[var(--text-muted)]">{group.count} exclusions</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handlePushToSA(group.product);
                    }}
                    disabled={pushLoading === group.product}
                    className="px-2 py-1 text-[10px] bg-violet-600 text-white rounded hover:bg-violet-500 disabled:opacity-50 flex items-center gap-1"
                  >
                    {pushLoading === group.product ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Send size={10} />
                    )}
                    Push to SA
                  </button>
                  <InfoTooltip content="Push this product's exclusion list to StackAdapt as a negative audience" size={12} />
                </div>
              </button>

              {/* Exclusion List */}
              {isExpanded && productExclusions.length > 0 && (
                <div className="border-t border-[var(--border-primary)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--bg-elevated)]">
                        <th className="text-left px-4 py-2 w-8">
                          <input
                            type="checkbox"
                            checked={productExclusions.every(e => selectedIds.has(e.id))}
                            onChange={e => {
                              if (e.target.checked) {
                                const next = new Set(selectedIds);
                                productExclusions.forEach(ex => next.add(ex.id));
                                setSelectedIds(next);
                              } else {
                                const next = new Set(selectedIds);
                                productExclusions.forEach(ex => next.delete(ex.id));
                                setSelectedIds(next);
                              }
                            }}
                            className="rounded"
                          />
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">
                          <div className="flex items-center gap-1">
                            Domain <InfoTooltip content="Click to view domain details" size={10} />
                          </div>
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">Country</th>
                        <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs min-w-[200px]">
                          <div className="flex items-center gap-1">
                            Reason <InfoTooltip content="Click reason to expand. Why this domain was excluded." size={10} />
                          </div>
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">
                          <div className="flex items-center gap-1">
                            Excluded At <InfoTooltip content="When the domain was excluded" size={10} />
                          </div>
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">
                          <div className="flex items-center gap-1">
                            Excluded By <InfoTooltip content="Who/what excluded this domain" size={10} />
                          </div>
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-[var(--text-muted)] text-xs">SF Status</th>
                        <th className="text-right px-4 py-2 font-medium text-[var(--text-muted)] text-xs">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productExclusions.map(excl => {
                        const excluderBadge = EXCLUDER_BADGES[excl.excludedBy] || EXCLUDER_BADGES.manual;

                        return (
                          <tr key={excl.id} className="border-t border-[var(--border-primary)] hover:bg-[var(--bg-elevated)]">
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(excl.id)}
                                onChange={() => toggleSelect(excl.id)}
                                className="rounded"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <button
                                onClick={() => setSelectedDomain(excl.domain)}
                                className="text-left"
                              >
                                <div className="font-medium text-[var(--text-primary)] hover:text-indigo-400">
                                  {excl.domain}
                                </div>
                                {excl.company && (
                                  <div className="text-[10px] text-[var(--text-muted)]">{excl.company}</div>
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-2">
                              <span className="text-xs text-[var(--text-muted)]">
                                {excl.country || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2 max-w-[300px]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleReason(excl.id);
                                }}
                                className="text-left w-full"
                              >
                                <p
                                  className={`text-xs text-[var(--text-secondary)] ${
                                    expandedReasons.has(excl.id) ? 'whitespace-pre-wrap' : 'line-clamp-2'
                                  }`}
                                  title={excl.reason}
                                >
                                  {excl.reason}
                                </p>
                                {excl.reason.length > 80 && !expandedReasons.has(excl.id) && (
                                  <span className="text-[10px] text-indigo-400 hover:text-indigo-300">
                                    Show more
                                  </span>
                                )}
                                {expandedReasons.has(excl.id) && excl.reason.length > 80 && (
                                  <span className="text-[10px] text-indigo-400 hover:text-indigo-300">
                                    Show less
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-2">
                              <span className="text-xs text-[var(--text-muted)]" title={new Date(excl.excludedAt).toLocaleString()}>
                                {formatRelativeTime(excl.excludedAt)}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`px-1.5 py-0.5 text-[10px] rounded border ${excluderBadge.className}`}>
                                {excluderBadge.label}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <SfBadge status={excl.sfStatus} />
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => setConfirmRestore(excl)}
                                className="px-2 py-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded hover:bg-[var(--bg-elevated)] flex items-center gap-1 ml-auto"
                              >
                                <RotateCcw size={10} /> Restore
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {isExpanded && productExclusions.length === 0 && (
                <div className="border-t border-[var(--border-primary)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                  No exclusions match your search
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Domain Slide-Out */}
      <DomainSlideOut
        domain={selectedDomain}
        onClose={() => setSelectedDomain(null)}
      />

      {/* Add Exclusion Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <ShieldX size={16} /> Add Exclusion
                <InfoTooltip content="Manually add a domain to the exclusion list" />
              </h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Domain</label>
                <input
                  type="text"
                  placeholder="example.com"
                  value={addDomain}
                  onChange={e => setAddDomain(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Product</label>
                <select
                  value={addProduct}
                  onChange={e => setAddProduct(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm"
                >
                  <option value="">Select product...</option>
                  <option value="ai-agent">AI Agent</option>
                  <option value="iot-sim">IoT SIM</option>
                  <option value="voice-api">Voice API</option>
                  <option value="sip-trunking">SIP Trunking</option>
                  <option value="sms-api">SMS API</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Reason</label>
                <textarea
                  placeholder="Why is this domain being excluded?"
                  rows={2}
                  value={addReason}
                  onChange={e => setAddReason(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm resize-none"
                />
              </div>

              {addError && (
                <p className="text-xs text-red-400">{addError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleAddExclusion}
                disabled={addLoading || !addDomain.trim() || !addProduct}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-1"
              >
                {addLoading && <Loader2 size={12} className="animate-spin" />}
                Add Exclusion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {confirmRestore && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmRestore(null)}>
          <div className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2">
              Restore Domain
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Restore <span className="font-medium text-[var(--text-primary)]">{confirmRestore.domain}</span>? It will be added back to the {confirmRestore.product} audience.
            </p>

            {restoreError && (
              <p className="text-xs text-red-400 mb-4">{restoreError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRestore(null)}
                className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                disabled={restoreLoading}
                className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1"
              >
                {restoreLoading && <Loader2 size={12} className="animate-spin" />}
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Restore Approval Modal */}
      {showBulkRestoreConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBulkRestoreConfirm(false)}>
          <div className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" /> Approval Required
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Restoring more than 10 domains requires approval. Continue?
            </p>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              {selectedIds.size} domains selected for restoration.
            </p>

            {bulkRestoreError && (
              <p className="text-xs text-red-400 mb-4">{bulkRestoreError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBulkRestoreConfirm(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkRestore}
                disabled={bulkRestoreLoading}
                className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-500 disabled:opacity-50 flex items-center gap-1"
              >
                {bulkRestoreLoading && <Loader2 size={12} className="animate-spin" />}
                Submit for Approval
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
