"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import PlatformIcon from "./PlatformIcon";

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
  [key: string]: any;
}

const PLATFORM_ORDER = ["google_ads", "linkedin", "stackadapt", "reddit"];
const PLATFORM_COLORS: Record<string, { fill: string; text: string }> = {
  google_ads: { fill: "rgba(66,133,244,0.22)", text: "#2563eb" },
  linkedin: { fill: "rgba(10,102,194,0.28)", text: "#0A66C2" },
  stackadapt: { fill: "rgba(147,51,234,0.22)", text: "#9333ea" },
  reddit: { fill: "rgba(255,69,0,0.22)", text: "#ea580c" },
};
const PLATFORM_LABELS: Record<string, string> = {
  google_ads: "Google Ads",
  linkedin: "LinkedIn",
  stackadapt: "StackAdapt",
  reddit: "Reddit",
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

const PRODUCT_ACCENT: Record<string, string> = {
  "AI Agent": "#3b82f6",
  "Voice API": "#10b981",
  "SIP": "#f59e0b",
  "SMS": "#ec4899",
  "RCS": "#f472b6",
  "Numbers": "#8b5cf6",
  "IoT SIM": "#06b6d4",
  "Contact Center": "#f97316",
  "Other": "#94a3b8",
};

const PRODUCT_GROUPS: Record<string, { products: string[]; color: string }> = {
  "Voice AI": { products: ["AI Agent"], color: "#3b82f6" },
  "Voice Infrastructure": { products: ["Voice API", "SIP"], color: "#10b981" },
  "Messaging": { products: ["SMS", "RCS"], color: "#ec4899" },
  "Connectivity": { products: ["Numbers", "IoT SIM"], color: "#06b6d4" },
};

interface ProductData {
  total: number;
  byPlatform: Record<string, number>;
  byIntent: Record<string, number>;
  regions: Set<string>;
  variants: Set<string>;
  campaigns: Campaign[];
}

interface BoardProps {
  campaigns: Campaign[];
  onSelectProduct: (product: string) => void;
  onSelectCampaign: (campaign: Campaign) => void;
  groupBy?: "product-group" | "product";
}

function computeProductData(campaigns: Campaign[]) {
  const products: Record<string, ProductData> = {};
  for (const p of [...PRODUCTS, "Other"]) {
    products[p] = { total: 0, byPlatform: {}, byIntent: {}, regions: new Set(), variants: new Set(), campaigns: [] };
  }
  for (const c of campaigns) {
    const prod = c.parsedProduct && PRODUCTS.includes(c.parsedProduct) ? c.parsedProduct : "Other";
    const d = products[prod];
    d.total++;
    d.campaigns.push(c);
    d.byPlatform[c.platform] = (d.byPlatform[c.platform] || 0) + 1;
    if (c.parsedIntent) d.byIntent[c.parsedIntent] = (d.byIntent[c.parsedIntent] || 0) + 1;
    if (c.parsedRegion) d.regions.add(c.parsedRegion);
    if (c.parsedVariant) d.variants.add(c.parsedVariant);
  }
  return products;
}

// ── Platform Bar (shared) ──────────────────────────────
function PlatformBar({ byPlatform, total, maxTotal }: { byPlatform: Record<string, number>; total: number; maxTotal: number }) {
  const barWidth = (total / maxTotal) * 100;
  return (
    <div className="flex h-11 rounded-lg overflow-hidden" style={{ width: `${barWidth}%`, minWidth: "60px" }}>
      {PLATFORM_ORDER.filter(p => byPlatform[p]).map(p => {
        const pct = (byPlatform[p] / total) * 100;
        const pc = PLATFORM_COLORS[p];
        return (
          <div
            key={p}
            className="flex items-center justify-center gap-1.5 transition-all relative"
            style={{
              width: `${pct}%`,
              minWidth: pct > 8 ? "50px" : "28px",
              backgroundColor: pc.fill,
              borderRight: "3px solid var(--bg-card)",
            }}
          >
            <PlatformIcon platform={p} size={14} />
            {pct > 12 && (
              <span className="text-[11px] font-bold" style={{ color: pc.text }}>
                {byPlatform[p]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Intent Pills (shared) ──────────────────────────────
function IntentPills({ byIntent }: { byIntent: Record<string, number> }) {
  return (
    <div className="w-[200px] shrink-0 flex flex-wrap gap-1">
      {Object.entries(byIntent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([intent, count]) => (
          <span
            key={intent}
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ color: INTENT_COLORS[intent]?.color, background: INTENT_COLORS[intent]?.bg }}
          >
            {intent} {count}
          </span>
        ))}
    </div>
  );
}

// ── Region Tags (shared) ───────────────────────────────
function RegionTags({ regions, variantCount }: { regions: Set<string>; variantCount: number }) {
  return (
    <div className="w-[120px] shrink-0 text-right">
      <div className="flex flex-wrap gap-1 justify-end">
        {[...regions].sort().map(r => (
          <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border)]">
            {r}
          </span>
        ))}
      </div>
      {variantCount > 0 && (
        <div className="text-[10px] text-[var(--text-muted)] mt-1">
          {variantCount} variant{variantCount !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

// ── Product Row (used inside groups) ───────────────────
function ProductRow({ product, d, maxTotal, onSelectProduct }: {
  product: string;
  d: ProductData;
  maxTotal: number;
  onSelectProduct: (p: string) => void;
}) {
  return (
    <button
      onClick={() => onSelectProduct(product)}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--bg-elevated)] transition-all group text-left"
      style={{ borderLeft: `3px solid ${PRODUCT_ACCENT[product] || "#94a3b8"}` }}
    >
      <div className="w-[140px] shrink-0">
        <div className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
          {product}
        </div>
        <div className="text-[20px] font-bold leading-tight" style={{ color: PRODUCT_ACCENT[product] || "#94a3b8" }}>{d.total}</div>
      </div>
      <div className="flex-1">
        <PlatformBar byPlatform={d.byPlatform} total={d.total} maxTotal={maxTotal} />
      </div>
      <IntentPills byIntent={d.byIntent} />
      <RegionTags regions={d.regions} variantCount={d.variants.size} />
    </button>
  );
}

// ── Product Group View ─────────────────────────────────
function ProductGroupView({ campaigns, onSelectProduct, onSelectCampaign }: {
  campaigns: Campaign[];
  onSelectProduct: (p: string) => void;
  onSelectCampaign: (c: Campaign) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of Object.keys(PRODUCT_GROUPS)) init[g] = true;
    init["Other"] = true;
    return init;
  });

  const { groupData, productData, maxGroupTotal, maxProductTotal } = useMemo(() => {
    const pd = computeProductData(campaigns);

    // Build group aggregations
    const gd: Record<string, { total: number; byPlatform: Record<string, number>; byIntent: Record<string, number>; regions: Set<string>; products: string[] }> = {};

    const assignedProducts = new Set<string>();

    for (const [groupName, groupDef] of Object.entries(PRODUCT_GROUPS)) {
      const agg = { total: 0, byPlatform: {} as Record<string, number>, byIntent: {} as Record<string, number>, regions: new Set<string>(), products: [] as string[] };
      for (const prod of groupDef.products) {
        assignedProducts.add(prod);
        const d = pd[prod];
        if (!d || d.total === 0) continue;
        agg.products.push(prod);
        agg.total += d.total;
        for (const [k, v] of Object.entries(d.byPlatform)) agg.byPlatform[k] = (agg.byPlatform[k] || 0) + v;
        for (const [k, v] of Object.entries(d.byIntent)) agg.byIntent[k] = (agg.byIntent[k] || 0) + v;
        for (const r of d.regions) agg.regions.add(r);
      }
      if (agg.total > 0) gd[groupName] = agg;
    }

    // "Other" group for unassigned products
    const otherProducts: string[] = [];
    let otherTotal = 0;
    const otherByPlatform: Record<string, number> = {};
    const otherByIntent: Record<string, number> = {};
    const otherRegions = new Set<string>();
    for (const [prod, d] of Object.entries(pd)) {
      if (assignedProducts.has(prod) || d.total === 0) continue;
      otherProducts.push(prod);
      otherTotal += d.total;
      for (const [k, v] of Object.entries(d.byPlatform)) otherByPlatform[k] = (otherByPlatform[k] || 0) + v;
      for (const [k, v] of Object.entries(d.byIntent)) otherByIntent[k] = (otherByIntent[k] || 0) + v;
      for (const r of d.regions) otherRegions.add(r);
    }
    if (otherTotal > 0) {
      gd["Other"] = { total: otherTotal, byPlatform: otherByPlatform, byIntent: otherByIntent, regions: otherRegions, products: otherProducts };
    }

    const maxGT = Math.max(1, ...Object.values(gd).map(g => g.total));
    const maxPT = Math.max(1, ...Object.values(pd).map(d => d.total));

    return { groupData: gd, productData: pd, maxGroupTotal: maxGT, maxProductTotal: maxPT };
  }, [campaigns]);

  const toggle = (group: string) => setExpanded(e => ({ ...e, [group]: !e[group] }));

  // Order: Voice AI, Voice Infrastructure, Messaging, Connectivity, Other
  const groupOrder = [...Object.keys(PRODUCT_GROUPS), "Other"].filter(g => groupData[g]);

  return (
    <div className="space-y-3">
      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 pb-2 border-b border-[var(--border)]">
        <div className="w-[160px] text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Product Group</div>
        <div className="flex-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Platform Distribution</div>
        <div className="w-[200px] text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Funnel Mix</div>
        <div className="w-[120px] text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium text-right">Coverage</div>
      </div>

      {groupOrder.map(groupName => {
        const g = groupData[groupName];
        const isExpanded = expanded[groupName] ?? true;
        const groupColor = PRODUCT_GROUPS[groupName]?.color || "#94a3b8";

        return (
          <div key={groupName} className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-card)]">
            {/* Group header */}
            <button
              onClick={() => toggle(groupName)}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-[var(--bg-elevated)] transition-all text-left"
              style={{ borderLeft: `4px solid ${groupColor}` }}
            >
              <div className="w-[156px] shrink-0 flex items-center gap-2">
                {isExpanded ? <ChevronDown size={16} className="text-[var(--text-muted)] shrink-0" /> : <ChevronRight size={16} className="text-[var(--text-muted)] shrink-0" />}
                <div>
                  <div className="text-[15px] font-bold text-[var(--text-primary)]">
                    {groupName}
                  </div>
                  <div className="text-[22px] font-extrabold leading-tight" style={{ color: groupColor }}>{g.total}</div>
                </div>
              </div>

              <div className="flex-1">
                <PlatformBar byPlatform={g.byPlatform} total={g.total} maxTotal={maxGroupTotal} />
              </div>

              <IntentPills byIntent={g.byIntent} />

              <div className="w-[120px] shrink-0 text-right">
                <div className="flex flex-wrap gap-1 justify-end">
                  {[...g.regions].sort().map(r => (
                    <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border)]">
                      {r}
                    </span>
                  ))}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1">
                  {g.products.length} product{g.products.length !== 1 ? "s" : ""}
                </div>
              </div>
            </button>

            {/* Expanded product rows */}
            {isExpanded && (
              <div className="border-t border-[var(--border)] pl-6 space-y-1 py-1 bg-[var(--bg-base)]">
                {g.products
                  .filter(p => productData[p] && productData[p].total > 0)
                  .sort((a, b) => (productData[b]?.total || 0) - (productData[a]?.total || 0))
                  .map(product => (
                    <ProductRow
                      key={product}
                      product={product}
                      d={productData[product]}
                      maxTotal={maxProductTotal}
                      onSelectProduct={onSelectProduct}
                    />
                  ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 pt-3 border-t border-[var(--border)]">
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Platforms</span>
        {PLATFORM_ORDER.map(p => (
          <span key={p} className="flex items-center gap-1.5">
            <PlatformIcon platform={p} size={12} />
            <span className="text-[10px] text-[var(--text-secondary)]">{PLATFORM_LABELS[p]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Flat Product View (legacy) ─────────────────────────
function FlatProductView({ campaigns, onSelectProduct }: {
  campaigns: Campaign[];
  onSelectProduct: (p: string) => void;
}) {
  const data = useMemo(() => {
    const products = computeProductData(campaigns);
    return Object.entries(products)
      .filter(([_, d]) => d.total > 0)
      .sort((a, b) => b[1].total - a[1].total);
  }, [campaigns]);

  const maxTotal = data[0]?.[1].total || 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 px-4 pb-2 border-b border-[var(--border)]">
        <div className="w-[140px] text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Product</div>
        <div className="flex-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Platform Distribution</div>
        <div className="w-[200px] text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Funnel Mix</div>
        <div className="w-[120px] text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium text-right">Coverage</div>
      </div>
      {data.map(([product, d]) => (
        <ProductRow key={product} product={product} d={d} maxTotal={maxTotal} onSelectProduct={onSelectProduct} />
      ))}
      <div className="flex items-center gap-4 px-4 pt-3 border-t border-[var(--border)]">
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Platforms</span>
        {PLATFORM_ORDER.map(p => (
          <span key={p} className="flex items-center gap-1.5">
            <PlatformIcon platform={p} size={12} />
            <span className="text-[10px] text-[var(--text-secondary)]">{PLATFORM_LABELS[p]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main Export ─────────────────────────────────────────
export default function CampaignBoard({ campaigns, onSelectProduct, onSelectCampaign, groupBy = "product-group" }: BoardProps) {
  if (groupBy === "product") {
    return <FlatProductView campaigns={campaigns} onSelectProduct={onSelectProduct} />;
  }
  return <ProductGroupView campaigns={campaigns} onSelectProduct={onSelectProduct} onSelectCampaign={onSelectCampaign} />;
}
