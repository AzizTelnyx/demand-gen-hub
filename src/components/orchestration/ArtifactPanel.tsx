'use client';

import { X, ThumbsUp, ThumbsDown, Check, Ban, Zap, CheckCircle2, Loader2, Circle, AlertCircle } from 'lucide-react';
import { useArtifacts, type ProgressStep } from './ArtifactContext';
import { useState } from 'react';
import { getTaskId } from './RuntimeProvider';

/* ── Helpers ──────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-blue-900/30 text-blue-400',
    done: 'bg-emerald-900/30 text-emerald-400',
    completed: 'bg-emerald-900/30 text-emerald-400',
    approved: 'bg-emerald-900/30 text-emerald-400',
    rejected: 'bg-red-900/30 text-red-400',
    applied: 'bg-violet-900/30 text-violet-400',
    failed: 'bg-red-900/30 text-red-400',
    pending: 'bg-amber-900/30 text-amber-400',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${colors[status] || 'bg-gray-800 text-gray-400'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'text-red-400 bg-red-900/30',
    high: 'text-amber-400 bg-amber-900/30',
    medium: 'text-blue-400 bg-blue-900/30',
    low: 'text-gray-400 bg-gray-800',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5 ${colors[severity] || colors.low}`}>
      {severity}
    </span>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-[9px] text-[var(--text-muted)] uppercase">{label}</span>
      <p className="text-[var(--text-secondary)] text-[11px] break-all">{String(value)}</p>
    </div>
  );
}

/* ── Step Icon ────────────────────────────────────────── */

function StepIcon({ step, index }: { step: ProgressStep; index: number }) {
  if (step.status === 'done') {
    return (
      <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
        <CheckCircle2 size={12} className="text-emerald-400" />
      </div>
    );
  }
  if (step.status === 'running') {
    return (
      <div className="w-6 h-6 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/40 flex items-center justify-center shrink-0">
        <Loader2 size={12} className="text-[var(--accent)] animate-spin" />
      </div>
    );
  }
  if (step.status === 'failed') {
    return (
      <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
        <AlertCircle size={12} className="text-red-400" />
      </div>
    );
  }
  // pending
  return (
    <div className="w-6 h-6 rounded-full bg-[var(--bg-primary)] border border-[var(--border-primary)] flex items-center justify-center shrink-0">
      <span className="text-[10px] text-[var(--text-muted)] font-medium">{index + 1}</span>
    </div>
  );
}

/* ── Progress Steps (Claude-style) ────────────────────── */

function ProgressPanel({ steps }: { steps: ProgressStep[] }) {
  if (steps.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Progress</span>
        <span className="text-[10px] text-[var(--text-muted)]">
          {steps.filter(s => s.status === 'done').length}/{steps.length}
        </span>
      </div>
      <div className="space-y-0">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-start gap-3 relative">
            {/* Vertical line connector */}
            {i < steps.length - 1 && (
              <div className="absolute left-[11px] top-[26px] w-px h-[calc(100%-2px)] bg-[var(--border-primary)]" />
            )}
            <StepIcon step={step} index={i} />
            <div className="flex-1 min-w-0 pb-4">
              <p className={`text-[12px] leading-tight ${
                step.status === 'done' ? 'text-[var(--text-secondary)]' :
                step.status === 'running' ? 'text-[var(--text-primary)] font-medium' :
                'text-[var(--text-muted)]'
              }`}>
                {step.label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Panel ──────────────────────────────────────── */

export function ArtifactPanel({ onClose }: { onClose: () => void }) {
  const { artifacts, recommendations, steps, setRecommendations } = useArtifacts();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const hasPendingRecs = recommendations.some((r) => r.status === 'pending');
  const hasApprovedRecs = recommendations.some((r) => r.status === 'approved');

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleAction = async (action: string, recId?: string) => {
    setActionLoading(action + (recId || ''));
    try {
      const taskId = getTaskId();
      if (!taskId) return;
      await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action, context: recId ? { recId } : undefined }),
      });
      if (action === 'approve_all') {
        setRecommendations((prev: any[]) => prev.map((r: any) => r.status === 'pending' ? { ...r, status: 'approved' } : r));
      } else if (action === 'reject_all') {
        setRecommendations((prev: any[]) => prev.map((r: any) => r.status === 'pending' ? { ...r, status: 'rejected' } : r));
      } else if (action === 'approve_rec') {
        setRecommendations((prev: any[]) => prev.map((r: any) => r.id === recId ? { ...r, status: 'approved' } : r));
      } else if (action === 'reject_rec') {
        setRecommendations((prev: any[]) => prev.map((r: any) => r.id === recId ? { ...r, status: 'rejected' } : r));
      } else if (action === 'execute') {
        setRecommendations((prev: any[]) => prev.map((r: any) => r.status === 'approved' ? { ...r, status: 'applied' } : r));
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const hasContent = artifacts.length > 0 || recommendations.length > 0 || steps.length > 0;
  if (!hasContent) return null;

  return (
    <div className="w-[420px] border-l border-[var(--border-primary)] bg-[var(--bg-card)] flex flex-col shrink-0 animate-slideIn">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-[var(--border-primary)] shrink-0">
        <span className="text-xs font-medium text-[var(--text-primary)]">Details</span>
        <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors rounded">
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Progress Steps */}
        <ProgressPanel steps={steps} />

        {/* Artifacts */}
        {artifacts.map((artifact, ai) => (
          <div key={ai} className="space-y-3">
            {/* Strategy Plan */}
            {artifact.type === 'strategy_plan' && artifact.plan && (
              <CollapsibleSection
                title="Execution Plan"
                sectionKey={`plan_${ai}`}
                collapsed={collapsedSections}
                toggle={toggleSection}
              >
                <p className="text-[11px] text-[var(--text-primary)] font-medium mb-2">{artifact.plan.summary}</p>
                <div className="space-y-1.5">
                  {artifact.plan.steps?.map((step: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-[11px]">
                      <span className="text-[var(--accent)] font-mono shrink-0 mt-px">{i + 1}.</span>
                      <div>
                        <span className="text-[var(--text-secondary)]">{step.description}</span>
                        <span className="text-[9px] text-[var(--text-muted)] ml-1">({step.agent})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Execution Summary */}
            {artifact.type === 'execution_summary' && artifact.agents && (
              <CollapsibleSection
                title={`Results (${artifact.agents.length} agents)`}
                sectionKey={`exec_${ai}`}
                collapsed={collapsedSections}
                toggle={toggleSection}
              >
                {artifact.agents.map((a: any, i: number) => (
                  <div key={i} className="text-[11px] pb-2 last:pb-0">
                    <span className="text-[var(--text-primary)] font-medium capitalize">{a.agent.replace(/-/g, ' ')}</span>
                    <p className="text-[var(--text-muted)] mt-0.5 leading-relaxed">{a.summary}</p>
                  </div>
                ))}
              </CollapsibleSection>
            )}

            {/* Keywords */}
            {artifact.type === 'keyword_research' && (
              <CollapsibleSection
                title={`Keywords${artifact.summary?.totalKeywords ? ` (${artifact.summary.totalKeywords})` : ''}`}
                sectionKey={`kw_${ai}`}
                collapsed={collapsedSections}
                toggle={toggleSection}
              >
                {artifact.summary && (
                  <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
                    {artifact.summary.totalVolume != null && <Field label="Volume" value={artifact.summary.totalVolume.toLocaleString() + '/mo'} />}
                    {artifact.summary.avgCPC != null && <Field label="Avg CPC" value={'$' + artifact.summary.avgCPC} />}
                    {artifact.summary.totalKeywords != null && <Field label="Count" value={artifact.summary.totalKeywords} />}
                  </div>
                )}
                {artifact.keywords?.length > 0 && (
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {artifact.keywords.map((kw: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="text-[var(--text-secondary)] flex-1">{kw.keyword}</span>
                        {kw.estVolume != null && <span className="text-[var(--text-muted)]">{kw.estVolume.toLocaleString()}</span>}
                        {kw.matchType && <span className="text-[9px] px-1 rounded bg-blue-900/30 text-blue-400">{kw.matchType}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* ABM List */}
            {artifact.type === 'abm_list' && (
              <CollapsibleSection
                title={`ABM List${artifact.summary?.total ? ` (${artifact.summary.total})` : ''}`}
                sectionKey={`abm_${ai}`}
                collapsed={collapsedSections}
                toggle={toggleSection}
              >
                {artifact.summary && (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {artifact.summary.estAudienceSize && <Field label="Est. Audience" value={artifact.summary.estAudienceSize.toLocaleString()} />}
                    {artifact.summary.verticals && <Field label="Verticals" value={Object.entries(artifact.summary.verticals).map(([k, v]) => `${k} (${v})`).join(', ')} />}
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* Budget */}
            {artifact.type === 'budget_calculation' && (
              <CollapsibleSection
                title="Budget"
                sectionKey={`budget_${ai}`}
                collapsed={collapsedSections}
                toggle={toggleSection}
              >
                {artifact.budget && (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {Object.entries(artifact.budget).map(([k, v]) => (
                      <Field key={k} label={k.replace(/([A-Z])/g, ' $1')} value={typeof v === 'number' ? `$${v.toLocaleString()}` : String(v)} />
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* Ad Copy */}
            {artifact.type === 'ad_copy' && (
              <CollapsibleSection
                title="Ad Copy"
                sectionKey={`copy_${ai}`}
                collapsed={collapsedSections}
                toggle={toggleSection}
              >
                {artifact.variants?.map((v: any, vi: number) => (
                  <div key={vi} className="space-y-1 border-t border-[var(--border-primary)] pt-2 first:border-0 first:pt-0">
                    {v.headlines?.map((h: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="text-[9px] text-[var(--text-muted)] font-mono">H{i + 1}</span>
                        <span className="text-[var(--text-secondary)] flex-1">{h}</span>
                        <span className="text-[9px] text-[var(--text-muted)]">{h.length}ch</span>
                      </div>
                    ))}
                    {v.descriptions?.map((d: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <span className="text-[9px] text-[var(--text-muted)] font-mono">D{i + 1}</span>
                        <span className="text-[var(--text-secondary)] flex-1">{d}</span>
                        <span className="text-[9px] text-[var(--text-muted)] shrink-0">{d.length}ch</span>
                      </div>
                    ))}
                  </div>
                ))}
              </CollapsibleSection>
            )}

            {/* Legacy: parsed brief, keywordResult, budgetResult, adCopyResult, campaignPlan, reviewSchedule */}
            {artifact.parsed && (
              <CollapsibleSection title="Parsed Brief" sectionKey={`parsed_${ai}`} collapsed={collapsedSections} toggle={toggleSection}>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {artifact.parsed.product && <Field label="Product" value={artifact.parsed.product} />}
                  {artifact.parsed.channel && <Field label="Channel" value={artifact.parsed.channel} />}
                  {artifact.parsed.funnel_stage && <Field label="Funnel" value={artifact.parsed.funnel_stage?.toUpperCase()} />}
                  {artifact.parsed.regions?.length > 0 && <Field label="Regions" value={artifact.parsed.regions.join(', ')} />}
                </div>
              </CollapsibleSection>
            )}

            {artifact.keywordResult?.plan?.length > 0 && (
              <CollapsibleSection title={`Keywords (${artifact.keywordResult.plan.length})`} sectionKey={`kwl_${ai}`} collapsed={collapsedSections} toggle={toggleSection}>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {artifact.keywordResult.plan.map((kw: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="text-[var(--text-secondary)] flex-1">{kw.keyword || kw.text}</span>
                      {kw.volume != null && <span className="text-[var(--text-muted)]">{kw.volume?.toLocaleString()}/mo</span>}
                      {kw.matchType && <span className="text-[9px] px-1 rounded bg-blue-900/30 text-blue-400">{kw.matchType}</span>}
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {artifact.adCopyResult?.adGroups?.length > 0 && (
              <CollapsibleSection title="Ad Copy" sectionKey={`acl_${ai}`} collapsed={collapsedSections} toggle={toggleSection}>
                {artifact.adCopyResult.adGroups.map((ag: any, gi: number) => (
                  <div key={gi} className="space-y-1 pb-2">
                    <h4 className="text-xs font-medium text-[var(--text-primary)]">{ag.name}</h4>
                    {ag.headlines?.map((h: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="text-[var(--text-secondary)] flex-1">{h.text}</span>
                        <span className="text-[9px] text-[var(--text-muted)]">{h.text.length}ch</span>
                        {h.pinPosition && <span className="text-[9px] px-1 rounded bg-indigo-900/30 text-indigo-400">H{h.pinPosition}</span>}
                      </div>
                    ))}
                    {ag.descriptions?.map((d: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <span className="text-[var(--text-secondary)] flex-1">{d.text}</span>
                        <span className="text-[9px] text-[var(--text-muted)] shrink-0">{d.text.length}ch</span>
                      </div>
                    ))}
                  </div>
                ))}
              </CollapsibleSection>
            )}

            {artifact.budgetResult?.budget && (
              <CollapsibleSection title="Budget" sectionKey={`bl_${ai}`} collapsed={collapsedSections} toggle={toggleSection}>
                <div className="text-[11px] space-y-1">
                  {artifact.budgetResult.budget.recommendedDailyBudget && (
                    <p className="text-[var(--text-primary)] font-medium">
                      ${artifact.budgetResult.budget.recommendedDailyBudget}/day
                      (${(artifact.budgetResult.budget.recommendedDailyBudget * 30).toLocaleString()}/mo)
                    </p>
                  )}
                  {artifact.budgetResult.summary && <p className="text-[var(--text-muted)]">{artifact.budgetResult.summary}</p>}
                </div>
              </CollapsibleSection>
            )}

            {artifact.campaignPlan && (
              <CollapsibleSection title="Campaign Plan" sectionKey={`cp_${ai}`} collapsed={collapsedSections} toggle={toggleSection}>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <Field label="Name" value={artifact.campaignPlan.campaign?.name} />
                  <Field label="Status" value={artifact.campaignPlan.campaign?.status} />
                  <Field label="Bidding" value={artifact.campaignPlan.campaign?.biddingStrategy} />
                  <Field label="Daily Budget" value={`$${artifact.campaignPlan.campaign?.dailyBudget}`} />
                </div>
              </CollapsibleSection>
            )}
          </div>
        ))}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="space-y-2">
            <span className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">
              Recommendations ({recommendations.length})
            </span>
            {recommendations.map((rec) => (
              <div key={rec.id} className="flex items-start gap-2 bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                <SeverityBadge severity={rec.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[var(--text-secondary)]">{rec.action}</p>
                  {rec.rationale && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{rec.rationale}</p>}
                  {rec.impact && <p className="text-[10px] text-emerald-500 mt-0.5">{rec.impact}</p>}
                </div>
                {rec.status === 'pending' ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleAction('approve_rec', rec.id)} disabled={!!actionLoading} className="p-1 text-emerald-500 hover:bg-emerald-900/30 rounded disabled:opacity-50"><ThumbsUp size={11} /></button>
                    <button onClick={() => handleAction('reject_rec', rec.id)} disabled={!!actionLoading} className="p-1 text-red-400 hover:bg-red-900/30 rounded disabled:opacity-50"><ThumbsDown size={11} /></button>
                  </div>
                ) : (
                  <StatusBadge status={rec.status} />
                )}
              </div>
            ))}

            <div className="flex items-center gap-2 pt-2">
              {hasPendingRecs && (
                <>
                  <button onClick={() => handleAction('approve_all')} disabled={!!actionLoading} className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-medium transition-colors disabled:opacity-50">
                    <Check size={10} /> Approve All
                  </button>
                  <button onClick={() => handleAction('reject_all')} disabled={!!actionLoading} className="flex items-center gap-1 px-3 py-1 bg-red-600/80 hover:bg-red-700 text-white rounded-lg text-[10px] font-medium transition-colors disabled:opacity-50">
                    <Ban size={10} /> Reject All
                  </button>
                </>
              )}
              {hasApprovedRecs && !hasPendingRecs && (
                <button onClick={() => handleAction('execute')} disabled={!!actionLoading} className="flex items-center gap-1 px-3 py-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white force-white rounded-lg text-[10px] font-medium transition-colors disabled:opacity-50">
                  <Zap size={10} /> Execute Approved
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Collapsible Section ──────────────────────────────── */

function CollapsibleSection({
  title, sectionKey, collapsed, toggle, children,
}: {
  title: string;
  sectionKey: string;
  collapsed: Set<string>;
  toggle: (key: string) => void;
  children: React.ReactNode;
}) {
  const isCollapsed = collapsed.has(sectionKey);
  return (
    <div className="bg-[var(--bg-primary)] rounded-lg overflow-hidden">
      <button
        onClick={() => toggle(sectionKey)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--bg-card)] transition-colors"
      >
        <span className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">{title}</span>
        <span className="text-[10px] text-[var(--text-muted)]">{isCollapsed ? '▸' : '▾'}</span>
      </button>
      {!isCollapsed && (
        <div className="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}
