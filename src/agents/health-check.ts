import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { prisma } from "@/lib/prisma";
import type { AgentHandler, AgentInput, AgentOutput, Finding, AgentRecommendation } from "./types";

const execFileAsync = promisify(execFile);
const PYTHON = `${process.env.HOME}/.venv/bin/python3`;
const SCRIPTS = path.join(process.cwd(), "scripts");

interface LiveCampaignMetrics {
  name: string;
  campaign_id: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  avg_cpc: number;
  status: string;
}

/** Fetch live metrics from all platforms via query_metrics.py */
async function fetchLiveMetrics(platformFilter?: string): Promise<LiveCampaignMetrics[]> {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const dateTo = now.toISOString().slice(0, 10);
  const dateFrom = from.toISOString().slice(0, 10);
  const plat = platformFilter || "all";

  const { stdout } = await execFileAsync(PYTHON, [
    path.join(SCRIPTS, "query_metrics.py"),
    "--platform", plat,
    "--from", dateFrom,
    "--to", dateTo,
    "--json",
  ], { timeout: 120_000 });

  const data = JSON.parse(stdout);
  const allCampaigns: LiveCampaignMetrics[] = [];
  for (const [, platData] of Object.entries(data.platforms || {})) {
    for (const c of (platData as any).campaigns || []) {
      allCampaigns.push(c);
    }
  }
  return allCampaigns;
}

/** Parse campaign name for funnel stage: BOFU / MOFU / TOFU */
function getFunnelStage(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes("BOFU")) return "BOFU";
  if (upper.includes("MOFU")) return "MOFU";
  if (upper.includes("TOFU")) return "TOFU";
  // Brand search is BOFU
  if (upper.includes("BRAND") && upper.includes("SEARCH")) return "BOFU";
  return "unknown";
}

/** Check if campaign is in learning phase (<14 days live) */
function isLearning(c: any): boolean {
  if (!c.startDate) return false;
  const start = new Date(c.startDate);
  const daysSinceLaunch = (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceLaunch < 14;
}

export const healthCheck: AgentHandler = {
  slug: "health-check",

  async run(input?: AgentInput): Promise<AgentOutput> {
    const findings: Finding[] = [];
    const recommendations: AgentRecommendation[] = [];

    // ── Build filter from context ──────────────────────────
    const ctx = input?.context || {};
    const where: any = { status: { in: ["enabled", "active", "live"] } };

    // Filter by platform
    if (ctx.platform) {
      const platformMap: Record<string, string> = {
        linkedin: "linkedin_ads",
        google: "google_ads",
        stackadapt: "stackadapt",
        reddit: "reddit",
      };
      const p = ctx.platform?.toLowerCase();
      where.platform = platformMap[p] || p;
    }

    // Filter by campaign name/product keywords from task
    const task = input?.task || "";
    const nameFilters: string[] = [];

    // Extract meaningful keywords from the task (skip common words)
    const skipWords = new Set(["do", "a", "run", "health", "check", "healthcheck", "on", "the", "for", "campaign", "campaigns", "my"]);
    const words = task.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2 && !skipWords.has(w));

    // Detect platform from task
    if (!ctx.platform) {
      if (/linkedin/i.test(task)) where.platform = "linkedin_ads";
      else if (/google/i.test(task)) where.platform = "google_ads";
      else if (/stackadapt/i.test(task)) where.platform = "stackadapt";
      else if (/reddit/i.test(task)) where.platform = "reddit";
    }

    // Detect product/topic keywords
    const productKeywords = words.filter(w => !["linkedin", "google", "stackadapt", "reddit", "ads"].includes(w));
    if (productKeywords.length > 0) {
      where.name = { contains: productKeywords.join(" "), mode: "insensitive" };
    }

    // If follow-up, carry previous context
    if (ctx.followUp && ctx.previousResult) {
      // Re-use same filters — the follow-up refines the output, not the query
    }

    // Fetch campaign metadata from DB (names, status, startDate, id)
    const campaigns = await prisma.campaign.findMany({ where });

    if (campaigns.length === 0) {
      return {
        findings: [],
        recommendations: [],
        summary: `No active campaigns found matching your criteria${where.platform ? ` on ${where.platform}` : ""}${productKeywords.length > 0 ? ` for "${productKeywords.join(" ")}"` : ""}.`,
      };
    }

    // Fetch LIVE metrics from APIs via query_metrics.py
    const liveMetrics = await fetchLiveMetrics(where.platform);

    // Build a lookup: normalize campaign name → live metrics
    const metricsMap = new Map<string, LiveCampaignMetrics>();
    for (const m of liveMetrics) {
      metricsMap.set(m.name.toLowerCase().trim(), m);
    }

    // Merge: DB metadata + live metrics
    type MergedCampaign = {
      name: string; id: string; platform: string | null; startDate: Date | null;
      spend: number; impressions: number; clicks: number; conversions: number;
    };
    const merged: MergedCampaign[] = campaigns.map(c => {
      const live = metricsMap.get(c.name.toLowerCase().trim());
      return {
        name: c.name,
        id: c.id,
        platform: c.platform,
        startDate: c.startDate,
        spend: live?.spend ?? 0,
        impressions: live?.impressions ?? 0,
        clicks: live?.clicks ?? 0,
        conversions: live?.conversions ?? 0,
      };
    });

    const nonLearning = merged.filter(c => !isLearning(c));
    const learningCount = merged.length - nonLearning.length;

    // ── 1. Zero impressions (exclude learning phase) ────────
    const zeroImpressions = nonLearning.filter(c => c.impressions === 0);
    if (zeroImpressions.length > 0) {
      findings.push({
        severity: "critical",
        title: `${zeroImpressions.length} live campaigns with zero impressions`,
        detail: "Enabled but no delivery in the last 30 days (live API data). May need targeting/approval review.",
        campaigns: zeroImpressions.map(c => c.name),
      });
      for (const c of zeroImpressions.slice(0, 10)) {
        recommendations.push({
          type: "alert",
          severity: "critical",
          target: c.name,
          targetId: c.id,
          action: `Review "${c.name}" — zero impressions while enabled`,
          rationale: "Could be: disapproved ads, targeting too narrow, budget too low, or scheduling issues.",
        });
      }
    }

    // ── 2. Spending with zero conversions (BOFU only) ───────
    const bofuSpendNoConv = nonLearning.filter(c =>
      c.spend > 100 &&
      c.conversions === 0 &&
      getFunnelStage(c.name) === "BOFU"
    );
    if (bofuSpendNoConv.length > 0) {
      const totalBurn = bofuSpendNoConv.reduce((s, c) => s + c.spend, 0);
      findings.push({
        severity: "high",
        title: `${bofuSpendNoConv.length} BOFU campaigns burning $${totalBurn.toLocaleString()} with 0 conversions`,
        detail: "Bottom-of-funnel campaigns should be converting. TOFU/MOFU excluded (awareness is expected). Math: " +
          bofuSpendNoConv.map(c => `${c.name} = $${c.spend.toFixed(2)} spend, 0 conv`).join("; "),
        campaigns: bofuSpendNoConv.map(c => c.name),
      });
      for (const c of bofuSpendNoConv.sort((a, b) => b.spend - a.spend).slice(0, 10)) {
        recommendations.push({
          type: "pause",
          severity: "high",
          target: c.name,
          targetId: c.id,
          action: `Consider pausing "${c.name}" — $${c.spend.toLocaleString()} spent, 0 conversions`,
          rationale: "High spend with no conversions on a BOFU campaign suggests poor targeting, landing page issues, or tracking problems.",
          impact: `Save $${c.spend.toLocaleString()} if paused`,
        });
      }
    }

    // ── 3. High CPC outliers (>2x average) ──────────────────
    const withClicks = nonLearning.filter(c => c.clicks > 10 && c.spend > 0);
    if (withClicks.length > 0) {
      const totalSpend = withClicks.reduce((s, c) => s + c.spend, 0);
      const totalClicks = withClicks.reduce((s, c) => s + c.clicks, 0);
      const avgCpc = totalSpend / totalClicks;
      const highCpc = withClicks.filter(c => {
        const cpc = c.spend / (c.clicks || 1);
        return cpc > avgCpc * 2;
      });
      if (highCpc.length > 0) {
        findings.push({
          severity: "medium",
          title: `${highCpc.length} campaigns with CPC >2x average ($${avgCpc.toFixed(2)})`,
          detail: `Account avg CPC = $${totalSpend.toFixed(2)} / ${totalClicks} clicks = $${avgCpc.toFixed(2)}. ` +
            highCpc.map(c => `${c.name}: $${(c.spend / (c.clicks || 1)).toFixed(2)} CPC`).join("; "),
          campaigns: highCpc.map(c => c.name),
        });
        for (const c of highCpc.sort((a, b) => b.spend / (b.clicks || 1) - a.spend / (a.clicks || 1)).slice(0, 5)) {
          const cpc = (c.spend / (c.clicks || 1)).toFixed(2);
          recommendations.push({
            type: "optimize",
            severity: "medium",
            target: c.name,
            targetId: c.id,
            action: `Optimize "${c.name}" — CPC $${cpc} vs avg $${avgCpc.toFixed(2)}`,
            rationale: "CPC is 2x+ the account average. Review keywords, audiences, and bid strategy.",
          });
        }
      }
    }

    // ── 4. Low CTR (<0.5%) ──────────────────────────────────
    const lowCtr = nonLearning.filter(c => {
      if (c.impressions < 1000) return false;
      const ctr = (c.clicks / (c.impressions || 1)) * 100;
      return ctr < 0.5;
    });
    if (lowCtr.length > 0) {
      findings.push({
        severity: "low",
        title: `${lowCtr.length} campaigns with CTR below 0.5%`,
        detail: "Low click-through rates suggest ad copy or targeting needs improvement. " +
          lowCtr.map(c => `${c.name}: ${((c.clicks / (c.impressions || 1)) * 100).toFixed(2)}% CTR (${c.clicks}/${c.impressions})`).join("; "),
        campaigns: lowCtr.map(c => c.name),
      });
    }

    // ── Summary ─────────────────────────────────────────────
    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const highCount = findings.filter(f => f.severity === "high").length;
    const scope = where.platform ? ` on ${where.platform.replace("_", " ")}` : "";
    const productScope = productKeywords.length > 0 ? ` matching "${productKeywords.join(" ")}"` : "";
    const learningNote = learningCount > 0 ? ` (${learningCount} in learning phase, excluded from alerts)` : "";

    const summary = criticalCount > 0
      ? `⚠️ ${criticalCount} critical and ${highCount} high-severity issues across ${nonLearning.length} campaigns${scope}${productScope}${learningNote}`
      : highCount > 0
        ? `${highCount} high-severity issues across ${nonLearning.length} campaigns${scope}${productScope}${learningNote}`
        : findings.length > 0
          ? `${findings.length} issues across ${nonLearning.length} campaigns${scope}${productScope} — nothing critical${learningNote}`
          : `✅ All ${campaigns.length} campaigns${scope}${productScope} look healthy${learningNote}`;

    // ── Suggested actions ──────────────────────────────────
    const suggestedActions: string[] = [];
    if (findings.some(f => f.severity === "critical" || f.severity === "high")) {
      const worstCampaign = recommendations[0]?.target;
      suggestedActions.push("Want me to pause the worst performers?");
      if (worstCampaign) suggestedActions.push(`Run a deep dive on "${worstCampaign}"?`);
    }
    if (findings.length > 0) {
      suggestedActions.push("Run a full optimization pass?");
    }

    return { findings, recommendations, summary, suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined };
  },
};
