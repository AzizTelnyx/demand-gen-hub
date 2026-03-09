"use client";

import { useMemo, useState } from "react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { PLATFORM_ICONS } from "@/components/PlatformIcon";

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

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  google_ads: { label: "Google", color: "#4285F4" },
  linkedin: { label: "LinkedIn", color: "#E87A2F" },
  stackadapt: { label: "StackAdapt", color: "#22C55E" },
  reddit: { label: "Reddit", color: "#FF4500" },
};

const INTENT_COLORS: Record<string, string> = {
  TOFU: "#60a5fa",
  MOFU: "#a78bfa",
  BOFU: "#34d399",
  CONQUEST: "#fb923c",
  UPSELL: "#f472b6",
  BRAND: "#fbbf24",
  PARTNER: "#94a3b8",
  EVENT: "#2dd4bf",
};

type GroupBy = "product" | "platform" | "intent" | "region";

interface TreemapProps {
  campaigns: Campaign[];
  width: number;
  height: number;
  onSelectCampaign: (c: Campaign) => void;
  onSelectGroup: (group: string, groupBy: GroupBy) => void;
}

function buildTree(campaigns: Campaign[], groupBy: GroupBy) {
  const groups: Record<string, Campaign[]> = {};

  for (const c of campaigns) {
    let key: string;
    switch (groupBy) {
      case "product": key = c.parsedProduct || "Other"; break;
      case "platform": key = PLATFORM_META[c.platform]?.label || c.platform; break;
      case "intent": key = c.parsedIntent || "Other"; break;
      case "region": key = c.parsedRegion || "Other"; break;
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }

  // Build nested: group → platform (or intent) → campaigns
  const children = Object.entries(groups)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, camps]) => {
      // Sub-group by platform (if grouping by product) or by product (if grouping by platform)
      const subKey = groupBy === "platform" ? "parsedProduct" : "platform";
      const subGroups: Record<string, Campaign[]> = {};
      for (const c of camps) {
        const sk = subKey === "platform"
          ? (PLATFORM_META[c.platform]?.label || c.platform)
          : (c[subKey as keyof Campaign] as string || "Other");
        if (!subGroups[sk]) subGroups[sk] = [];
        subGroups[sk].push(c);
      }

      return {
        name,
        children: Object.entries(subGroups)
          .sort((a, b) => b[1].length - a[1].length)
          .map(([subName, subCamps]) => ({
            name: subName,
            value: subCamps.length,
            campaigns: subCamps,
            parent: name,
          })),
      };
    });

  return { name: "root", children };
}

function getBlockColor(node: any, groupBy: GroupBy): string {
  const name = node.data.parent || node.data.name;
  if (groupBy === "platform") {
    const entry = Object.entries(PLATFORM_META).find(([_, v]) => v.label === name);
    return entry?.[1].color || "#666";
  }
  if (groupBy === "intent") {
    return INTENT_COLORS[name] || "#666";
  }
  // For product/region grouping, color by platform of the sub-block
  const subName = node.data.name;
  const entry = Object.entries(PLATFORM_META).find(([_, v]) => v.label === subName);
  if (entry) return entry[1].color;
  return "#34d399"; // accent
}

export default function CampaignTreemap({ campaigns, width, height, onSelectCampaign, onSelectGroup }: TreemapProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("product");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const treeData = useMemo(() => {
    const root = hierarchy(buildTree(campaigns, groupBy))
      .sum((d: any) => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const tm = treemap<any>()
      .size([width, height])
      .padding(3)
      .paddingOuter(6)
      .paddingTop(28)
      .tile(treemapSquarify.ratio(1.2));

    return tm(root);
  }, [campaigns, groupBy, width, height]);

  // Get top-level groups (depth 1)
  const groups = treeData.children || [];
  // Get leaf nodes (depth 2)
  const leaves = treeData.leaves();

  return (
    <div>
      {/* Group by selector */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Group by</span>
        {(["product", "platform", "intent", "region"] as GroupBy[]).map(g => (
          <button
            key={g}
            onClick={() => setGroupBy(g)}
            className={`text-[11px] px-2.5 py-1 rounded-md transition-all ${
              groupBy === g
                ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            {g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      {/* Treemap SVG */}
      <svg width={width} height={height} className="rounded-xl overflow-hidden">
        <rect width={width} height={height} fill="var(--bg-base)" rx={12} />

        {/* Group backgrounds (depth 1) */}
        {groups.map((group: any) => (
          <g key={group.data.name}>
            <rect
              x={group.x0}
              y={group.y0}
              width={group.x1 - group.x0}
              height={group.y1 - group.y0}
              fill="var(--bg-card)"
              rx={8}
              stroke="var(--border)"
              strokeWidth={1}
            />
            {/* Group label with platform icon */}
            {(group.x1 - group.x0) > 60 && (() => {
              const platformKey = Object.entries(PLATFORM_META).find(([_, v]) => v.label === group.data.name)?.[0];
              const iconSrc = platformKey ? PLATFORM_ICONS[platformKey] : null;
              return (
                <g onClick={() => onSelectGroup(group.data.name, groupBy)} className="cursor-pointer">
                  {iconSrc && (
                    <image href={iconSrc} x={group.x0 + 6} y={group.y0 + 6} width={14} height={14} />
                  )}
                  <text
                    x={group.x0 + (iconSrc ? 24 : 8)}
                    y={group.y0 + 18}
                    className="text-[11px] font-semibold fill-[var(--text-secondary)] select-none"
                  >
                    {group.data.name}
                    <tspan className="text-[10px] font-normal fill-[var(--text-muted)]">
                      {" "}({group.value})
                    </tspan>
                  </text>
                </g>
              );
            })()}
          </g>
        ))}

        {/* Leaf blocks (depth 2) */}
        {leaves.map((leaf: any) => {
          const w = leaf.x1 - leaf.x0;
          const h = leaf.y1 - leaf.y0;
          if (w < 4 || h < 4) return null;

          const nodeId = `${leaf.data.parent}-${leaf.data.name}`;
          const isHovered = hoveredNode === nodeId;
          const color = getBlockColor(leaf, groupBy);
          const count = leaf.data.value || 0;

          return (
            <g
              key={nodeId}
              onMouseEnter={() => setHoveredNode(nodeId)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => {
                const camps = leaf.data.campaigns;
                if (camps?.length === 1) onSelectCampaign(camps[0]);
                else if (camps?.length > 0) onSelectGroup(leaf.data.parent, groupBy);
              }}
              className="cursor-pointer"
            >
              <rect
                x={leaf.x0}
                y={leaf.y0}
                width={w}
                height={h}
                rx={4}
                fill={color}
                opacity={isHovered ? 0.45 : 0.25}
                stroke={isHovered ? color : "transparent"}
                strokeWidth={1.5}
                className="transition-all duration-150"
              />
              {/* Sub-block label */}
              {w > 40 && h > 24 && (
                <>
                  <text
                    x={leaf.x0 + w / 2}
                    y={leaf.y0 + h / 2 - (h > 40 ? 4 : 0)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-[10px] font-medium select-none pointer-events-none"
                    fill={color}
                  >
                    {leaf.data.name}
                  </text>
                  {h > 40 && (
                    <text
                      x={leaf.x0 + w / 2}
                      y={leaf.y0 + h / 2 + 12}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-[18px] font-bold select-none pointer-events-none"
                      fill={color}
                      opacity={0.7}
                    >
                      {count}
                    </text>
                  )}
                </>
              )}
              {/* Tiny blocks just show count */}
              {w > 20 && w <= 40 && h > 16 && (
                <text
                  x={leaf.x0 + w / 2}
                  y={leaf.y0 + h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[10px] font-bold select-none pointer-events-none"
                  fill={color}
                  opacity={0.7}
                >
                  {count}
                </text>
              )}
            </g>
          );
        })}

        {/* Hover tooltip */}
        {hoveredNode && (() => {
          const leaf = leaves.find((l: any) => `${l.data.parent}-${l.data.name}` === hoveredNode);
          if (!leaf) return null;
          const camps = leaf.data.campaigns || [];
          const x = Math.min(leaf.x0 + 10, width - 200);
          const y = Math.max(leaf.y0 - 50, 10);
          return (
            <g>
              <rect x={x} y={y} width={190} height={42} rx={6} fill="var(--bg-card)" stroke="var(--border)" />
              <text x={x + 8} y={y + 16} className="text-[10px] font-semibold fill-[var(--text-primary)] select-none">
                {leaf.data.parent} → {leaf.data.name}
              </text>
              <text x={x + 8} y={y + 32} className="text-[10px] fill-[var(--text-muted)] select-none">
                {camps.length} campaign{camps.length !== 1 ? "s" : ""}
                {camps.length <= 3 && camps.length > 0 ? `: ${camps.map((c: any) => c.parsedVariant || c.parsedRegion || "").filter(Boolean).join(", ")}` : ""}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
