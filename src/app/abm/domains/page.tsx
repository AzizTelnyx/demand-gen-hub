'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Filter,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Loader2,
  X,
  Building2,
} from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import SfBadge from '@/components/SfBadge';
import DomainSlideOut from '@/components/DomainSlideOut';
import { formatRelativeTime } from '@/lib/utils';

interface Domain {
  id: string;
  domain: string | null;
  company: string;
  productFit: string | null;
  country: string | null;
  region: string | null;
  industry: string | null;
  sfAccountId: string | null;
  inPipeline: boolean;
  clearbitDesc: string | null;
  employeeCount: number | null;
  createdAt: string;
  lastActivity: string | null;
  hasExclusion: boolean;
  exclusionCategories: string[];
  campaignCount: number;
  sfStatus: 'none' | 'lead' | 'account' | 'opportunity' | 'customer';
}

interface DomainsResponse {
  domains: Domain[];
  total: number;
  page: number;
  limit: number;
}

const PRODUCTS = ['AI Agent', 'Voice API', 'SMS API', 'SIP Trunking', 'IoT SIM', 'Fax', 'Numbers'];
const SF_STATUSES = ['none', 'lead', 'account', 'opportunity', 'customer'];

export default function DomainsPage() {
  // Data state
  const [domains, setDomains] = useState<Domain[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [sfStatusFilter, setSfStatusFilter] = useState('');
  const [excludedFilter, setExcludedFilter] = useState<'all' | 'excluded' | 'not_excluded'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination & sorting
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  // Slide out
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  // Add domain modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newProduct, setNewProduct] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch domains
  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (productFilter) params.set('product', productFilter);
      if (countryFilter) params.set('country', countryFilter);
      if (sfStatusFilter) params.set('sfStatus', sfStatusFilter);
      if (excludedFilter !== 'all') {
        params.set('excluded', excludedFilter === 'excluded' ? 'true' : 'false');
      }
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      params.set('sort', sort);
      params.set('order', order);

      const res = await fetch(`/api/abm/domains?${params}`);
      const data: DomainsResponse = await res.json();
      setDomains(data.domains);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to fetch domains:', error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, productFilter, countryFilter, sfStatusFilter, excludedFilter, page, limit, sort, order]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  // Get unique countries from domains
  const countries = useMemo(() => {
    const countrySet = new Set<string>();
    domains.forEach((d) => {
      if (d.country) countrySet.add(d.country);
    });
    return Array.from(countrySet).sort();
  }, [domains]);

  // Handle sort
  const handleSort = (field: string) => {
    if (sort === field) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(field);
      setOrder('desc');
    }
    setPage(1);
  };

  // Add domain
  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;

    setAddLoading(true);
    setAddError(null);

    try {
      const res = await fetch('/api/abm/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: newDomain.trim(),
          product: newProduct || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add domain');
      }

      setShowAddModal(false);
      setNewDomain('');
      setNewProduct('');
      fetchDomains();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Failed to add domain');
    } finally {
      setAddLoading(false);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSearch('');
    setProductFilter('');
    setCountryFilter('');
    setSfStatusFilter('');
    setExcludedFilter('all');
    setPage(1);
  };

  const hasFilters = search || productFilter || countryFilter || sfStatusFilter || excludedFilter !== 'all';

  // Pagination
  const totalPages = Math.ceil(total / limit);
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Domains</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {total.toLocaleString()} domains in the ABM database
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors"
          >
            <Plus size={16} />
            Add Domain
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-4 space-y-3">
        {/* Search bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by domain or company name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <InfoTooltip content="Search domains by name or company. Results update as you type." />

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
              showFilters || hasFilters
                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            <Filter size={14} />
            Filters
            {hasFilters && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-indigo-500 text-white rounded-full">
                {[productFilter, countryFilter, sfStatusFilter, excludedFilter !== 'all' ? 1 : 0].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Filter row */}
        {showFilters && (
          <div className="flex items-center gap-3 p-3 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-primary)]">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">Product</label>
              <select
                value={productFilter}
                onChange={(e) => {
                  setProductFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)]"
              >
                <option value="">All</option>
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">Country</label>
              <select
                value={countryFilter}
                onChange={(e) => {
                  setCountryFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)]"
              >
                <option value="">All</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">SF Status</label>
              <select
                value={sfStatusFilter}
                onChange={(e) => {
                  setSfStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)]"
              >
                <option value="">All</option>
                {SF_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">Exclusion</label>
              <select
                value={excludedFilter}
                onChange={(e) => {
                  setExcludedFilter(e.target.value as 'all' | 'excluded' | 'not_excluded');
                  setPage(1);
                }}
                className="px-2 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)]"
              >
                <option value="all">All</option>
                <option value="excluded">Excluded only</option>
                <option value="not_excluded">Not excluded</option>
              </select>
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-primary)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-primary)]">
                {[
                  { key: 'domain', label: 'Domain', sortable: true },
                  { key: 'company', label: 'Company', sortable: true },
                  { key: 'productFit', label: 'Product', sortable: true },
                  { key: 'country', label: 'Country', sortable: true },
                  { key: 'industry', label: 'Industry', sortable: true },
                  { key: 'sfStatus', label: 'SF Status', sortable: false },
                  { key: 'campaignCount', label: 'Campaigns', sortable: false, tooltip: 'Number of campaigns targeting this product' },
                  { key: 'lastActivity', label: 'Last Activity', sortable: true },
                ].map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider ${
                      col.sortable ? 'cursor-pointer hover:text-[var(--text-secondary)]' : ''
                    }`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.tooltip && <InfoTooltip content={col.tooltip} size={12} />}
                      {col.sortable && sort === col.key && (
                        <ArrowUpDown size={12} className={order === 'asc' ? 'rotate-180' : ''} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Loader2 className="animate-spin mx-auto text-[var(--text-muted)]" size={24} />
                  </td>
                </tr>
              ) : domains.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[var(--text-muted)]">
                    No domains found matching your filters
                  </td>
                </tr>
              ) : (
                domains.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelectedDomain(d.domain)}
                    className="hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://logo.clearbit.com/${d.domain}`}
                          alt=""
                          className="w-5 h-5 rounded"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <span className="text-sm font-medium text-indigo-400 hover:text-indigo-300">
                          {d.domain || '—'}
                        </span>
                        {d.hasExclusion && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-red-500/10 text-red-400 rounded border border-red-500/20">
                            Excluded
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-primary)]">{d.company}</td>
                    <td className="px-4 py-3">
                      {d.productFit ? (
                        <span className="px-2 py-0.5 text-xs bg-violet-500/10 text-violet-400 rounded border border-violet-500/20">
                          {d.productFit}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{d.country || '—'}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{d.industry || '—'}</td>
                    <td className="px-4 py-3">
                      <SfBadge status={d.sfStatus} />
                    </td>
                    <td className="px-4 py-3">
                      {d.campaignCount > 0 ? (
                        <span className="px-2 py-0.5 text-xs bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                          {d.campaignCount}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                      {formatRelativeTime(d.lastActivity)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="px-4 py-3 border-t border-[var(--border-primary)] flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">
              Showing {startItem.toLocaleString()}-{endItem.toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-[var(--text-secondary)]">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Domain Slide Out */}
      {selectedDomain && (
        <DomainSlideOut domain={selectedDomain} onClose={() => setSelectedDomain(null)} />
      )}

      {/* Add Domain Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Building2 size={20} className="text-indigo-400" />
              </div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Add Domain</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Domain</label>
                <input
                  type="text"
                  placeholder="example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Product (optional)</label>
                <select
                  value={newProduct}
                  onChange={(e) => setNewProduct(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)]"
                >
                  <option value="">Select product...</option>
                  {PRODUCTS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {addError && <p className="text-xs text-red-400">{addError}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewDomain('');
                  setNewProduct('');
                  setAddError(null);
                }}
                className="px-3 py-1.5 text-xs text-[var(--text-muted)]"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDomain}
                disabled={addLoading || !newDomain.trim()}
                className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-1"
              >
                {addLoading && <Loader2 size={12} className="animate-spin" />}
                Add Domain
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
