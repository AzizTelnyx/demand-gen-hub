"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Radar, Globe, Filter, Table2, X, ChevronRight, Users,
  Image as ImageIcon, Zap, Target, TrendingUp, Search,
  ArrowUpRight, ArrowDownRight, Minus, Layers, Radio,
} from "lucide-react";
import PlatformIcon from "@/components/PlatformIcon";
import CampaignBoard from "@/components/CampaignBoard";

// ── Types ────────────────────────────────────────────────
interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  budget: number | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  servingStatus: string | null;
  parsedIntent: string | null;
  parsedProduct: string | null;
  parsedVariant: string | null;
  parsedAdType: string | null;
  parsedRegion: string | null;
  parseConfidence: string | null;
  attribution: { influencedDeals: number; influencedPipeline: number } | null;
}

interface AudienceGroup {
  [type: string]: { id: string; name: string; value: string | null; matchType: string | null; status: string | null }[];
}

// ── Constants ────────────────────────────────────────────
const PLATFORM_META: Record<string, { label: string; color: string; bg: string }> = {
  google_ads: { label: "Google", color: "#4285F4", bg: "rgba(66,133,244,0.18)" },
  linkedin: { label: "LinkedIn", color: "#0A66C2", bg: "rgba(10,102,194,0.22)" },
  stackadapt: { label: "StackAdapt", color: "#7C3AED", bg: "rgba(124,58,237,0.18)" },
  reddit: { label: "Reddit", color: "#FF4500", bg: "rgba(255,69,0,0.18)" },
};

const INTENT_COLORS: Record<string, { color: string; bg: string }> = {
  TOFU: { color: "#3b82f6", bg: "rgba(59,130,246,0.16)" },
  MOFU: { color: "#8b5cf6", bg: "rgba(139,92,246,0.16)" },
  BOFU: { color: "#10b981", bg: "rgba(16,185,129,0.16)" },
  CONQUEST: { color: "#f97316", bg: "rgba(249,115,22,0.18)" },
  UPSELL: { color: "#ec4899", bg: "rgba(236,72,153,0.16)" },
  COMMERCIAL: { color: "#14b8a6", bg: "rgba(20,184,166,0.16)" },
  BRAND: { color: "#eab308", bg: "rgba(234,179,8,0.16)" },
  PARTNER: { color: "#64748b", bg: "rgba(100,116,139,0.16)" },
  EVENT: { color: "#06b6d4", bg: "rgba(6,182,212,0.16)" },
};

const PRODUCTS = ["AI Agent", "Voice API", "SIP", "SMS", "RCS", "Numbers", "IoT SIM"];
const ACTIVE_STATUSES = ["enabled", "active", "live"];

// ── Helpers ──────────────────────────────────────────────
function platformLabel(p: string) { return PLATFORM_META[p]?.label || p; }
function platformColor(p: string) { return PLATFORM_META[p]?.color || "#666"; }

// ── Main Component ───────────────────────────────────────
export default function CommandCenter() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "table">("board");
  const [groupBy, setGroupBy] = useState<"product-group" | "product">("product-group");
  const [filters, setFilters] = useState({ platform: "all", region: "all", intent: "all" });
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [audiences, setAudiences] = useState<AudienceGroup | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/campaigns")
      .then(r => r.json())
      .then(d => { setCampaigns(d.campaigns || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Active campaigns with filters
  const active = useMemo(() => {
    return campaigns.filter(c => {
      if (!ACTIVE_STATUSES.includes(c.status)) return false;
      if (filters.platform !== "all" && c.platform !== filters.platform) return false;
      if (filters.region !== "all" && c.parsedRegion !== filters.region) return false;
      if (filters.intent !== "all" && c.parsedIntent !== filters.intent) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [campaigns, filters, search]);

  // Product groups
  const productGroups = useMemo(() => {
    const groups: Record<string, Campaign[]> = {};
    for (const p of PRODUCTS) groups[p] = [];
    groups["Other"] = [];
    for (const c of active) {
      const prod = c.parsedProduct;
      if (prod && groups[prod]) groups[prod].push(c);
      else groups["Other"].push(c);
    }
    return groups;
  }, [active]);

  // Available filter values
  const regions = useMemo(() => [...new Set(active.map(c => c.parsedRegion).filter(Boolean))].sort(), [active]);
  const intents = useMemo(() => [...new Set(active.map(c => c.parsedIntent).filter(Boolean))].sort(), [active]);

  // Load audiences for selected campaign
  const loadDetail = useCallback(async (c: Campaign) => {
    setSelectedCampaign(c);
    setAudiences(null);
    try {
      const res = await fetch(`/api/campaigns/${c.id}/audiences`);
      const data = await res.json();
      setAudiences(data.audiences || data);
    } catch { setAudiences({}); }
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-pulse text-[var(--text-muted)]">Loading Command Center...</div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-[var(--border-primary)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Radar size={20} className="text-[var(--accent)]" />
              <h1 className="text-xl font-semibold">Command Center</h1>
            </div>
            <p className="text-[var(--text-muted)] text-xs mt-1">
              {active.length} active campaigns across {new Set(active.map(c => c.platform)).size} platforms
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search campaigns..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] w-48 focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            {/* Group by toggle */}
            {view === "board" && (
              <div className="flex bg-[var(--bg-input)] rounded-lg border border-[var(--border)] p-0.5">
                <button onClick={() => setGroupBy("product-group")}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-all ${groupBy === "product-group" ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                  Groups
                </button>
                <button onClick={() => setGroupBy("product")}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-all ${groupBy === "product" ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                  Products
                </button>
              </div>
            )}
            {/* View toggle */}
            <div className="flex bg-[var(--bg-input)] rounded-lg border border-[var(--border)] p-0.5">
              <button onClick={() => setView("board")}
                className={`px-3 py-1 text-xs rounded-md transition-all ${view === "board" ? "bg-[var(--accent-bg)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                <Layers size={13} />
              </button>
              <button onClick={() => setView("table")}
                className={`px-3 py-1 text-xs rounded-md transition-all ${view === "table" ? "bg-[var(--accent-bg)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                <Table2 size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={12} className="text-[var(--text-muted)]" />
          <select value={filters.platform} onChange={e => setFilters(f => ({ ...f, platform: e.target.value }))}
            className="text-xs bg-[var(--bg-input)] border border-[var(--border)] rounded-md px-2 py-1 text-[var(--text-secondary)]">
            <option value="all">All Platforms</option>
            {Object.entries(PLATFORM_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filters.region} onChange={e => setFilters(f => ({ ...f, region: e.target.value }))}
            className="text-xs bg-[var(--bg-input)] border border-[var(--border)] rounded-md px-2 py-1 text-[var(--text-secondary)]">
            <option value="all">All Regions</option>
            {regions.map(r => <option key={r} value={r!}>{r}</option>)}
          </select>
          <select value={filters.intent} onChange={e => setFilters(f => ({ ...f, intent: e.target.value }))}
            className="text-xs bg-[var(--bg-input)] border border-[var(--border)] rounded-md px-2 py-1 text-[var(--text-secondary)]">
            <option value="all">All Intents</option>
            {intents.map(i => <option key={i} value={i!}>{i}</option>)}
          </select>
          {(filters.platform !== "all" || filters.region !== "all" || filters.intent !== "all" || search) && (
            <button onClick={() => { setFilters({ platform: "all", region: "all", intent: "all" }); setSearch(""); }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-1">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {view === "board" ? (
          <BoardView
            productGroups={productGroups}
            active={active}
            selectedProduct={selectedProduct}
            onSelectProduct={setSelectedProduct}
            onSelectCampaign={loadDetail}
            groupBy={groupBy}
          />
        ) : (
          <TableView
            campaigns={active}
            onSelectCampaign={loadDetail}
          />
        )}
      </div>

      {/* Detail Panel */}
      {selectedCampaign && (
        <DetailPanel
          campaign={selectedCampaign}
          audiences={audiences}
          onClose={() => setSelectedCampaign(null)}
        />
      )}
    </div>
  );
}

// ── Board View ───────────────────────────────────────────
function BoardView({ productGroups, active, selectedProduct, onSelectProduct, onSelectCampaign, groupBy = "product-group" }: {
  productGroups: Record<string, Campaign[]>;
  active: Campaign[];
  selectedProduct: string | null;
  onSelectProduct: (p: string | null) => void;
  onSelectCampaign: (c: Campaign) => void;
  groupBy?: "product-group" | "product";
}) {
  return (
    <div className="space-y-6">
      {/* Product rows with platform bars */}
      <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-card)] overflow-hidden p-2">
        <CampaignBoard
          campaigns={active}
          onSelectProduct={(p) => onSelectProduct(selectedProduct === p ? null : p)}
          onSelectCampaign={onSelectCampaign}
          groupBy={groupBy}
        />
      </div>

      {/* Expanded product → campaign list (when clicking a product row) */}
      {selectedProduct && productGroups[selectedProduct] && (
        <div className="border border-[var(--accent-border)] rounded-xl bg-[var(--bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-[var(--accent)]" />
              <span className="text-sm font-semibold">{selectedProduct}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {productGroups[selectedProduct].length} campaigns
              </span>
            </div>
            <button onClick={() => onSelectProduct(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X size={14} />
            </button>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {productGroups[selectedProduct]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(c => (
                <button
                  key={c.id}
                  onClick={() => onSelectCampaign(c)}
                  className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-hover)] text-left transition-colors"
                >
                  <PlatformIcon platform={c.platform} size={14} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--text-primary)] truncate">{c.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.parsedIntent && (
                        <span className="text-[10px] px-1.5 py-0 rounded"
                          style={{ color: INTENT_COLORS[c.parsedIntent]?.color, background: INTENT_COLORS[c.parsedIntent]?.bg }}>
                          {c.parsedIntent}
                        </span>
                      )}
                      {c.parsedVariant && (
                        <span className="text-[10px] text-[var(--text-muted)]">{c.parsedVariant}</span>
                      )}
                      {c.parsedRegion && (
                        <span className="text-[10px] text-[var(--text-muted)]">{c.parsedRegion}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={12} className="text-[var(--text-muted)] shrink-0" />
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Coverage Matrix */}
      <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-card)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-[var(--accent)]" />
            <span className="text-sm font-semibold">Coverage Matrix</span>
            <span className="text-[10px] text-[var(--text-muted)]">Platform × Intent</span>
          </div>
        </div>
        <div className="p-4 overflow-x-auto">
          <HeatmapMatrix campaigns={active} />
        </div>
      </div>
    </div>
  );
}

// ── Heatmap Matrix ───────────────────────────────────────
function HeatmapMatrix({ campaigns }: { campaigns: Campaign[] }) {
  const platforms = Object.keys(PLATFORM_META);
  const allIntents = ["TOFU", "MOFU", "BOFU", "CONQUEST", "UPSELL", "BRAND", "PARTNER", "EVENT"];
  const usedIntents = allIntents.filter(i => campaigns.some(c => c.parsedIntent === i));

  // Build matrix: platform × intent → count
  const matrix: Record<string, Record<string, number>> = {};
  for (const p of platforms) {
    matrix[p] = {};
    for (const i of usedIntents) {
      matrix[p][i] = campaigns.filter(c => c.platform === p && c.parsedIntent === i).length;
    }
  }

  const maxVal = Math.max(1, ...Object.values(matrix).flatMap(row => Object.values(row)));

  return (
    <table className="w-full">
      <thead>
        <tr>
          <th className="text-left text-[10px] font-medium text-[var(--text-muted)] pb-2 pr-4" />
          {usedIntents.map(i => (
            <th key={i} className="text-center text-[10px] font-medium pb-2 px-1"
              style={{ color: INTENT_COLORS[i]?.color }}>{i}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {platforms.map(p => {
          const hasAny = usedIntents.some(i => matrix[p][i] > 0);
          if (!hasAny) return null;
          return (
            <tr key={p}>
              <td className="pr-4 py-1">
                <PlatformIcon platform={p} size={14} showLabel />
              </td>
              {usedIntents.map(i => {
                const val = matrix[p][i];
                const intensity = val / maxVal;
                return (
                  <td key={i} className="px-1 py-1 text-center">
                    {val > 0 ? (
                      <div
                        className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all"
                        style={{
                          backgroundColor: INTENT_COLORS[i]?.bg?.replace(/[\d.]+\)$/, `${0.3 + intensity * 0.5})`) || `rgba(100,100,100,${0.2 + intensity * 0.4})`,
                          color: intensity > 0.5 ? "#fff" : (INTENT_COLORS[i]?.color || "var(--accent)"),
                          border: `1px solid ${INTENT_COLORS[i]?.color || "var(--accent)"}33`,
                        }}
                      >
                        {val}
                      </div>
                    ) : (
                      <div className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] opacity-20">
                        ·
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Table View ───────────────────────────────────────────
function TableView({ campaigns, onSelectCampaign }: {
  campaigns: Campaign[];
  onSelectCampaign: (c: Campaign) => void;
}) {
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const sorted = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const av = (a as any)[sortKey] || "";
      const bv = (b as any)[sortKey] || "";
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });
  }, [campaigns, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(key); setSortDir(1); }
  };

  const SortHeader = ({ label, field }: { label: string; field: string }) => (
    <th
      className="text-left text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider pb-2 cursor-pointer hover:text-[var(--text-secondary)] select-none"
      onClick={() => toggleSort(field)}
    >
      {label} {sortKey === field && (sortDir === 1 ? "↑" : "↓")}
    </th>
  );

  return (
    <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-card)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-4 pt-3"><SortHeader label="Campaign" field="name" /></th>
              <th className="px-3 pt-3"><SortHeader label="Platform" field="platform" /></th>
              <th className="px-3 pt-3"><SortHeader label="Intent" field="parsedIntent" /></th>
              <th className="px-3 pt-3"><SortHeader label="Product" field="parsedProduct" /></th>
              <th className="px-3 pt-3"><SortHeader label="Variant" field="parsedVariant" /></th>
              <th className="px-3 pt-3"><SortHeader label="Region" field="parsedRegion" /></th>
              <th className="px-3 pt-3"><SortHeader label="Ad Type" field="parsedAdType" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {sorted.map(c => (
              <tr
                key={c.id}
                onClick={() => onSelectCampaign(c)}
                className="hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={c.platform} size={14} />
                    <span className="text-xs font-medium text-[var(--text-primary)] truncate max-w-[300px]">{c.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <PlatformIcon platform={c.platform} size={14} showLabel />
                </td>
                <td className="px-3 py-2.5">
                  {c.parsedIntent && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ color: INTENT_COLORS[c.parsedIntent]?.color, background: INTENT_COLORS[c.parsedIntent]?.bg }}>
                      {c.parsedIntent}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">{c.parsedProduct || "—"}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--text-muted)]">{c.parsedVariant || "—"}</td>
                <td className="px-3 py-2.5">
                  <span className="text-[10px] text-[var(--text-muted)]">{c.parsedRegion || "—"}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-[10px] text-[var(--text-muted)]">{c.parsedAdType || "—"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────
function DetailPanel({ campaign: c, audiences, onClose }: {
  campaign: Campaign;
  audiences: AudienceGroup | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-[var(--bg-card)] border-l border-[var(--border)] shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2 mb-1">
            <PlatformIcon platform={c.platform} size={16} showLabel />
          </div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-tight">{c.name}</h3>
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1">
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5 space-y-5">
        {/* Parsed breakdown */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Intent", value: c.parsedIntent, color: INTENT_COLORS[c.parsedIntent || ""]?.color },
            { label: "Product", value: c.parsedProduct },
            { label: "Variant", value: c.parsedVariant },
            { label: "Ad Type", value: c.parsedAdType },
            { label: "Region", value: c.parsedRegion },
            { label: "Status", value: c.servingStatus || c.status },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[var(--bg-base)] rounded-lg p-2.5">
              <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">{label}</div>
              <div className="text-xs font-medium" style={{ color: color || "var(--text-primary)" }}>
                {value || "—"}
              </div>
            </div>
          ))}
        </div>

        {/* Audience targeting */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Users size={13} className="text-[var(--accent)]" />
            <span className="text-xs font-semibold">Audience Targeting</span>
          </div>
          {audiences === null ? (
            <div className="text-xs text-[var(--text-muted)] animate-pulse">Loading audiences...</div>
          ) : Object.keys(audiences).length === 0 ? (
            <div className="text-xs text-[var(--text-muted)]">No audience data available</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(audiences).map(([type, items]) => (
                <div key={type}>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    {type.replace(/_/g, " ")} ({Array.isArray(items) ? items.length : 0})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(items) ? items.slice(0, 15) : []).map((item: any) => (
                      <span key={item.id} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-base)] border border-[var(--border)] text-[var(--text-secondary)]">
                        {item.name}
                        {item.matchType && <span className="text-[var(--text-muted)]"> ({item.matchType})</span>}
                      </span>
                    ))}
                    {Array.isArray(items) && items.length > 15 && (
                      <span className="text-[10px] text-[var(--text-muted)]">+{items.length - 15} more</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
