'use client';

import { useState, useEffect } from 'react';
import { X, ExternalLink, Building2, Users, Target, History, ShieldCheck, ShieldAlert, ShieldBan, Loader2 } from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import RelevanceBar from './RelevanceBar';
import SfBadge from './SfBadge';
import PlatformBadge, { getPlatformFullName } from './PlatformBadge';
import { formatRelativeTime } from '@/lib/utils';

interface DomainData {
  domain: string;
  company: string;
  description: string | null;
  industry: string | null;
  employeeCount: string | null;
  location: string | null;
  logo: string | null;
  salesforce: {
    status: 'none' | 'lead' | 'account' | 'opportunity' | 'customer';
    accountId: string | null;
    accountName: string | null;
    ownerId: string | null;
    ownerName: string | null;
  };
  relevanceByProduct: Array<{
    product: string;
    score: number; // 0-100 from API
    inAudience: boolean;
  }>;
  segmentMembership: Array<{
    campaignId: string;
    campaignName: string;
    platform: string;
    addedAt: string;
  }>;
  exclusionStatus: {
    isExcluded: boolean;
    reason: string | null;
    excludedAt: string | null;
    excludedBy: string | null;
    pushedToSA: boolean;
  };
  activityLog: Array<{
    action: string;
    timestamp: string;
    actor: string;
  }>;
}

interface ProductOption {
  id: string;
  name: string;
}

const SF_STATUS_BADGES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  none: { label: 'Not in SF', color: 'text-gray-500 bg-gray-500/10 border-gray-500/20', icon: <ShieldBan size={12} /> },
  lead: { label: 'Lead', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: <Users size={12} /> },
  account: { label: 'Account', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: <Building2 size={12} /> },
  opportunity: { label: 'Opportunity', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: <Target size={12} /> },
  customer: { label: 'Customer', color: 'text-violet-400 bg-violet-500/10 border-violet-500/20', icon: <ShieldCheck size={12} /> },
};

// Mock product list for exclusion selector
const PRODUCTS: ProductOption[] = [
  { id: 'ai-agent', name: 'AI Agent' },
  { id: 'iot-sim', name: 'IoT SIM' },
  { id: 'voice-api', name: 'Voice API' },
  { id: 'sip-trunking', name: 'SIP Trunking' },
  { id: 'sms-api', name: 'SMS API' },
];

interface DomainSlideOutProps {
  domain: string | null;
  onClose: () => void;
}

export default function DomainSlideOut({ domain, onClose }: DomainSlideOutProps) {
  const [data, setData] = useState<DomainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'about' | 'salesforce' | 'relevance' | 'segments' | 'exclusion' | 'activity'>('about');

  // SF actions
  const [sfLoading, setSfLoading] = useState(false);
  const [sfError, setSfError] = useState<string | null>(null);

  // Restore action
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Add to exclusions
  const [showExcludeModal, setShowExcludeModal] = useState(false);
  const [excludeProduct, setExcludeProduct] = useState('');
  const [excludeReason, setExcludeReason] = useState('');
  const [excludeLoading, setExcludeLoading] = useState(false);
  const [excludeError, setExcludeError] = useState<string | null>(null);

  useEffect(() => {
    if (!domain) {
      setData(null);
      return;
    }

    setLoading(true);
    fetch(`/api/abm/domains/${encodeURIComponent(domain)}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [domain]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showRestoreConfirm) {
          setShowRestoreConfirm(false);
        } else if (showExcludeModal) {
          setShowExcludeModal(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, showRestoreConfirm, showExcludeModal]);

  // Create SF record
  const handleCreateSF = async (type: 'lead' | 'account') => {
    if (!domain) return;

    setSfLoading(true);
    setSfError(null);

    try {
      const res = await fetch(`/api/abm/domains/${encodeURIComponent(domain)}/salesforce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });

      if (!res.ok) throw new Error('Failed to create SF record');

      // Update local data
      setData(prev =>
        prev
          ? {
              ...prev,
              salesforce: { ...prev.salesforce, status: type },
            }
          : null
      );
    } catch {
      setSfError('Failed to create Salesforce record. Please try again.');
    } finally {
      setSfLoading(false);
    }
  };

  // Restore domain
  const handleRestore = async () => {
    if (!domain) return;

    setRestoreLoading(true);
    setRestoreError(null);

    try {
      const res = await fetch('/api/abm/exclusions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });

      if (!res.ok) throw new Error('Failed to restore');

      // Update local data
      setData(prev =>
        prev
          ? {
              ...prev,
              exclusionStatus: {
                ...prev.exclusionStatus,
                isExcluded: false,
                reason: null,
                excludedAt: null,
                excludedBy: null,
              },
            }
          : null
      );
      setShowRestoreConfirm(false);
    } catch {
      setRestoreError('Failed to restore domain. Please try again.');
    } finally {
      setRestoreLoading(false);
    }
  };

  // Add to exclusions
  const handleExclude = async () => {
    if (!domain || !excludeProduct) return;

    setExcludeLoading(true);
    setExcludeError(null);

    try {
      const res = await fetch('/api/abm/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          category: excludeProduct,
          reason: excludeReason || 'Manual exclusion',
        }),
      });

      if (!res.ok) throw new Error('Failed to exclude');

      // Update local data
      setData(prev =>
        prev
          ? {
              ...prev,
              exclusionStatus: {
                isExcluded: true,
                reason: excludeReason || 'Manual exclusion',
                excludedAt: new Date().toISOString(),
                excludedBy: "manual",
                pushedToSA: false,
              },
            }
          : null
      );
      setShowExcludeModal(false);
      setExcludeProduct('');
      setExcludeReason('');
    } catch {
      setExcludeError('Failed to exclude domain. Please try again.');
    } finally {
      setExcludeLoading(false);
    }
  };

  if (!domain) return null;

  const sfStatus = data?.salesforce?.status || 'none';
  const sfBadge = SF_STATUS_BADGES[sfStatus];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Slide-out panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-[var(--bg-surface-solid)] border-l border-[var(--border)] shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-start justify-between">
          <div className="flex items-center gap-3">
            {data?.logo ? (
              <img src={data.logo} alt="" className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
                <Building2 size={20} className="text-[var(--text-muted)]" />
              </div>
            )}
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{data?.company || domain}</h2>
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--text-muted)] hover:text-indigo-400 flex items-center gap-1"
              >
                {domain} <ExternalLink size={10} />
              </a>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 pt-2 border-b border-[var(--border)] flex gap-1 overflow-x-auto">
          {[
            { id: 'about', label: 'About' },
            { id: 'salesforce', label: 'Salesforce' },
            { id: 'relevance', label: 'Relevance' },
            { id: 'segments', label: 'Segments' },
            { id: 'exclusion', label: 'Exclusion' },
            { id: 'activity', label: 'Activity' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="animate-spin text-[var(--text-muted)]" size={24} />
            </div>
          ) : !data ? (
            <div className="text-center text-[var(--text-muted)] py-8">
              Failed to load domain data
            </div>
          ) : (
            <>
              {/* About Tab */}
              {activeTab === 'about' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">Company Info</h3>
                    <InfoTooltip content="Data sourced from Clearbit enrichment" />
                  </div>

                  {data.description && (
                    <p className="text-sm text-[var(--text-secondary)]">{data.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[var(--bg-elevated)] rounded-lg p-3 border border-[var(--border)]">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Industry</div>
                      <div className="text-sm text-[var(--text-primary)]">{data.industry || '—'}</div>
                    </div>
                    <div className="bg-[var(--bg-elevated)] rounded-lg p-3 border border-[var(--border)]">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Employees</div>
                      <div className="text-sm text-[var(--text-primary)]">{data.employeeCount || '—'}</div>
                    </div>
                    <div className="bg-[var(--bg-elevated)] rounded-lg p-3 border border-[var(--border)] col-span-2">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Location</div>
                      <div className="text-sm text-[var(--text-primary)]">{data.location || '—'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Salesforce Tab */}
              {activeTab === 'salesforce' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">Salesforce Status</h3>
                    <InfoTooltip content="Current status in Salesforce CRM" />
                  </div>

                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${sfBadge.color}`}>
                    {sfBadge.icon}
                    <span className="text-sm font-medium">{sfBadge.label}</span>
                  </div>

                  {data.salesforce.accountName && (
                    <div className="bg-[var(--bg-elevated)] rounded-lg p-3 border border-[var(--border)]">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Account</div>
                      <div className="text-sm text-[var(--text-primary)]">{data.salesforce.accountName}</div>
                      {data.salesforce.ownerName && (
                        <div className="text-xs text-[var(--text-muted)] mt-1">Owner: {data.salesforce.ownerName}</div>
                      )}
                    </div>
                  )}

                  {sfStatus === 'none' && (
                    <div className="space-y-2">
                      {sfError && (
                        <p className="text-xs text-red-400">{sfError}</p>
                      )}
                      <button
                        onClick={() => handleCreateSF('lead')}
                        disabled={sfLoading}
                        className="w-full px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {sfLoading && <Loader2 size={14} className="animate-spin" />}
                        <Users size={14} /> Create Lead
                      </button>
                      <button
                        onClick={() => handleCreateSF('account')}
                        disabled={sfLoading}
                        className="w-full px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm rounded-lg hover:bg-[var(--bg-elevated)] flex items-center justify-center gap-2 border border-[var(--border)] disabled:opacity-50"
                      >
                        {sfLoading && <Loader2 size={14} className="animate-spin" />}
                        <Building2 size={14} /> Create Account
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Relevance Tab */}
              {activeTab === 'relevance' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">Relevance by Product</h3>
                    <InfoTooltip content="AI-calculated relevance scores across all products" />
                  </div>

                  <div className="space-y-2">
                    {data.relevanceByProduct.map(item => {
                      // Normalize score from 0-100 to 0-1 for RelevanceBar
                      const normalizedScore = item.score / 100;

                      return (
                        <div key={item.product} className="bg-[var(--bg-elevated)] rounded-lg p-3 border border-[var(--border)]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-[var(--text-primary)]">{item.product}</span>
                            <div className="flex items-center gap-2">
                              {item.inAudience && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                                  In Audience
                                </span>
                              )}
                            </div>
                          </div>
                          <RelevanceBar score={normalizedScore} width="w-full" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Segments Tab */}
              {activeTab === 'segments' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">Segment Membership</h3>
                    <InfoTooltip content="Campaigns where this domain is included in the audience" />
                  </div>

                  {data.segmentMembership.length === 0 ? (
                    <div className="text-sm text-[var(--text-muted)] text-center py-4">
                      Not in any active segments
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.segmentMembership.map((seg, i) => (
                        <div key={i} className="bg-[var(--bg-elevated)] rounded-lg p-3 border border-[var(--border)]">
                          <div className="text-sm font-medium text-[var(--text-primary)]">{seg.campaignName}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <PlatformBadge platform={seg.platform} label={getPlatformFullName(seg.platform)} size="sm" />
                            <span className="text-[10px] text-[var(--text-muted)]">
                              Added {formatRelativeTime(seg.addedAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Exclusion Tab */}
              {activeTab === 'exclusion' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">Exclusion Status</h3>
                    <InfoTooltip content="Whether this domain is excluded from ABM targeting" />
                  </div>

                  {data.exclusionStatus.isExcluded ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-red-400 mb-2">
                        <ShieldAlert size={16} />
                        <span className="font-medium">Excluded</span>
                      </div>
                      {data.exclusionStatus.reason && (
                        <p className="text-sm text-[var(--text-secondary)] mb-2">{data.exclusionStatus.reason}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                        {data.exclusionStatus.excludedAt && (
                          <span>Excluded {formatRelativeTime(data.exclusionStatus.excludedAt)}</span>
                        )}
                        {data.exclusionStatus.excludedBy && (
                          <span>by {data.exclusionStatus.excludedBy}</span>
                        )}
                      </div>

                      {restoreError && (
                        <p className="text-xs text-red-400 mt-3">{restoreError}</p>
                      )}

                      {showRestoreConfirm ? (
                        <div className="mt-3 p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
                          <p className="text-sm text-[var(--text-secondary)] mb-3">
                            Restore this domain? It will be added back to the audience.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowRestoreConfirm(false)}
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
                      ) : (
                        <button
                          onClick={() => setShowRestoreConfirm(true)}
                          className="mt-3 px-4 py-1.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs rounded-lg hover:bg-[var(--bg-elevated)] border border-[var(--border)]"
                        >
                          Restore Domain
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-emerald-400 mb-2">
                        <ShieldCheck size={16} />
                        <span className="font-medium">Not Excluded</span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">This domain is eligible for ABM targeting.</p>
                      <button
                        onClick={() => setShowExcludeModal(true)}
                        className="mt-3 px-4 py-1.5 bg-red-500/10 text-red-400 text-xs rounded-lg hover:bg-red-500/20 border border-red-500/20"
                      >
                        Add to Exclusions
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Activity Tab */}
              {activeTab === 'activity' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">Activity Log</h3>
                    <InfoTooltip content="Recent actions taken on this domain" />
                  </div>

                  {data.activityLog.length === 0 ? (
                    <div className="text-sm text-[var(--text-muted)] text-center py-4">
                      No activity recorded
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.activityLog.map((log, i) => (
                        <div key={i} className="flex items-start gap-3 py-2 border-b border-[var(--border)] last:border-0">
                          <div className="w-6 h-6 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center shrink-0 mt-0.5">
                            <History size={12} className="text-[var(--text-muted)]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[var(--text-secondary)]">{log.action}</p>
                            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mt-0.5">
                              <span>{formatRelativeTime(log.timestamp)}</span>
                              <span>by {log.actor}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Exclude Modal */}
      {showExcludeModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
          onClick={() => setShowExcludeModal(false)}
        >
          <div
            className="bg-[var(--bg-surface-solid)] border border-[var(--border-primary)] rounded-xl p-5 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">
              Add to Exclusions
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Product</label>
                <select
                  value={excludeProduct}
                  onChange={e => setExcludeProduct(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm"
                >
                  <option value="">Select product...</option>
                  {PRODUCTS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Reason (optional)</label>
                <textarea
                  placeholder="Why is this domain being excluded?"
                  rows={2}
                  value={excludeReason}
                  onChange={e => setExcludeReason(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg text-sm resize-none"
                />
              </div>

              {excludeError && (
                <p className="text-xs text-red-400">{excludeError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowExcludeModal(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleExclude}
                disabled={excludeLoading || !excludeProduct}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 flex items-center gap-1"
              >
                {excludeLoading && <Loader2 size={12} className="animate-spin" />}
                Exclude
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
