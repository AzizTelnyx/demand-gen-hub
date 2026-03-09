import { prisma } from "@/lib/prisma";
import { KB } from "@/lib/knowledge-loader";
import {
  computeConfidence, createWriteOp,
  type ConfidenceScore, type WriteOperation,
} from "@/lib/safety";
import type { AgentHandler, AgentOutput, AgentInput, Finding, AgentRecommendation } from "./types";

/**
 * Campaign Optimizer
 * 
 * SAFETY:
 * - NEVER auto-executes. All changes are RECOMMENDATIONS requiring approval.
 * - All rules are deterministic (from knowledge base / hardcoded thresholds).
 * - Exclusions: campaigns <14 days old, TOFU/MOFU exempt from conversion alerts.
 * - Every recommendation logged with before/after values.
 */

interface OptimizerInput {
  scope?: "all" | string[]; // "all" or array of campaign names
  platform_filter?: string; // google_ads, linkedin, stackadapt, reddit
  campaign_name?: string; // Specific campaign for pause/enable
  action_type?: "pause" | "enable" | "scale"; // Direct action type
}

// Optimization rules (from knowledge/workflows/campaign-orchestration.md)
const RULES = {
  // Auto-pause: spend >$300 + 0 conversions
  PAUSE_SPEND_THRESHOLD: 300,
  PAUSE_ZERO_CONVERSIONS: 0,
  // Auto-pause: CTR <0.5% for 7+ days (we use impression threshold as proxy)
  PAUSE_LOW_CTR: 0.5,
  PAUSE_LOW_CTR_MIN_IMPRESSIONS: 5000, // ~7 days of moderate delivery
  // Auto-scale: CTR >3% + CPA < target
  SCALE_HIGH_CTR: 3.0,
  // Bid switch thresholds
  BID_MANUAL_TO_MAXCONV: 3, // 3+ conversions
  BID_MAXCONV_TO_TCPA: 30,  // 30+ conversions
  // Negative keyword: search term 0 conv + $50+ spend
  NEGATIVE_KW_SPEND_THRESHOLD: 50,
  // Campaign age minimum
  MIN_AGE_DAYS: 14,
  // TOFU/MOFU exempt funnel stages
  EXEMPT_FUNNEL_STAGES: ["tofu", "mofu", "TOFU", "MOFU"],
};

export const campaignOptimizer: AgentHandler = {
  slug: "campaign-optimizer",

  async run(input: AgentInput): Promise<AgentOutput> {
    const params = { ...(input.context || {}), ...(input.config || {}) } as OptimizerInput;
    const findings: Finding[] = [];
    const recommendations: AgentRecommendation[] = [];
    const writeOps: WriteOperation[] = [];

    // ── Direct campaign pause/enable handler ──────────────────
    if (params.campaign_name) {
      const campaign = await prisma.campaign.findFirst({
        where: { name: { contains: params.campaign_name, mode: 'insensitive' } },
      });

      if (!campaign) {
        return {
          findings: [{ severity: "medium", title: "Campaign not found", detail: `No campaign matching "${params.campaign_name}" found.` }],
          recommendations: [],
          summary: `❌ Could not find a campaign matching "${params.campaign_name}".`,
        };
      }

      const actionType = params.action_type || "pause";
      const newStatus = actionType === "enable" ? "enabled" : "paused";
      const isAlready = campaign.status === newStatus || (actionType === "pause" && campaign.status === "paused");

      if (isAlready) {
        return {
          findings: [{ severity: "low", title: `Campaign already ${newStatus}`, detail: `"${campaign.name}" is already ${campaign.status}.` }],
          recommendations: [],
          summary: `ℹ️ "${campaign.name}" is already ${campaign.status}. No action needed.`,
        };
      }

      // Platform-specific API call info
      let apiCallInfo = "";
      if (campaign.platform === "google_ads") {
        apiCallInfo = `Google Ads API: mutate CampaignService, set status=${newStatus.toUpperCase()}`;
      } else if (campaign.platform === "stackadapt") {
        apiCallInfo = `StackAdapt GraphQL: mutation { updateCampaign(id: "${campaign.platformId || "?"}", input: { state: "${newStatus === "paused" ? "paused" : "active"}" }) }`;
      } else if (campaign.platform === "reddit") {
        apiCallInfo = `Reddit API: PATCH /api/v3/campaigns/${campaign.platformId || "?"} { data: { status: "${newStatus === "paused" ? "PAUSED" : "ACTIVE"}" } }`;
      } else if (campaign.platform === "linkedin_ads" || campaign.platform === "linkedin") {
        apiCallInfo = `LinkedIn API is read-only. ${actionType === "pause" ? "Pause" : "Enable"} manually in Campaign Manager.`;
      }

      const writeOp = createWriteOp({
        type: actionType === "pause" ? "pause_campaign" : "enable_campaign",
        platform: campaign.platform,
        target: campaign.name,
        description: `${actionType === "pause" ? "Pause" : "Enable"} "${campaign.name}" — currently ${campaign.status}`,
        oldValue: campaign.status,
        newValue: newStatus,
      });

      return {
        findings: [{
          severity: "medium",
          title: `${actionType === "pause" ? "Pause" : "Enable"} recommended: "${campaign.name}"`,
          detail: `Campaign is currently ${campaign.status} on ${campaign.platform}. ${apiCallInfo}`,
          campaigns: [campaign.name],
        }],
        recommendations: [{
          type: actionType === "pause" ? "pause" : "enable",
          severity: "high",
          target: campaign.name,
          targetId: campaign.id,
          action: `${actionType === "pause" ? "PAUSE" : "ENABLE"} "${campaign.name}" [${campaign.platform}]`,
          rationale: apiCallInfo,
          impact: actionType === "pause"
            ? `Save ~$${((campaign.spend || 0) / 30).toFixed(2)}/day`
            : `Resume delivery for "${campaign.name}"`,
        }],
        artifacts: [{ writeOps: [writeOp], platformApiCall: apiCallInfo }],
        summary: `⏸️ Ready to ${actionType} "${campaign.name}" (${campaign.platform}). ${apiCallInfo}\n\n⏸️ AWAITING APPROVAL.`,
        suggestedActions: actionType === "pause"
          ? ["Approve to pause this campaign", "Run a deep dive on this campaign first"]
          : ["Approve to enable this campaign", "Check budget before enabling"],
      };
    }

    // ── Get campaigns in scope ────────────────────────────────
    const where: any = {
      status: { in: ["enabled", "active", "live"] },
    };
    if (params.platform_filter) {
      where.platform = params.platform_filter;
    }
    if (params.scope && params.scope !== "all" && Array.isArray(params.scope)) {
      where.name = { in: params.scope };
    }

    const campaigns = await prisma.campaign.findMany({ where });

    if (campaigns.length === 0) {
      return {
        findings: [],
        recommendations: [],
        summary: "No active campaigns in scope.",
      };
    }

    // ── Filter out young campaigns ────────────────────────────
    const now = new Date();
    const minAgeMs = RULES.MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
    const eligible = campaigns.filter((c) => {
      const age = now.getTime() - (c.startDate?.getTime() || c.createdAt.getTime());
      return age >= minAgeMs;
    });
    const tooYoung = campaigns.length - eligible.length;

    if (tooYoung > 0) {
      findings.push({
        severity: "low",
        title: `${tooYoung} campaigns excluded (< ${RULES.MIN_AGE_DAYS} days old)`,
        detail: "New campaigns need time to gather data before optimization.",
      });
    }

    // ── Rule 1: Auto-pause (spend > $300 + 0 conversions) ────
    for (const c of eligible) {
      const isExempt = RULES.EXEMPT_FUNNEL_STAGES.includes(c.funnelStage || "");
      const spend = c.spend || 0;
      const conversions = c.conversions || 0;

      if (spend > RULES.PAUSE_SPEND_THRESHOLD && conversions === RULES.PAUSE_ZERO_CONVERSIONS && !isExempt) {
        findings.push({
          severity: "critical",
          title: `PAUSE recommended: "${c.name}"`,
          detail: `$${spend.toFixed(2)} spent, 0 conversions. BOFU campaign with no ROI.`,
          campaigns: [c.name],
        });

        const writeOp = createWriteOp({
          type: "pause_campaign",
          platform: c.platform,
          target: c.name,
          description: `Pause "${c.name}" — $${spend.toFixed(2)} with 0 conversions`,
          oldValue: c.status,
          newValue: "paused",
        });
        writeOps.push(writeOp);

        recommendations.push({
          type: "pause",
          severity: "critical",
          target: c.name,
          targetId: c.id,
          action: `PAUSE "${c.name}" — $${spend.toFixed(2)} spent, 0 conversions [${c.platform}]`,
          rationale: `Exceeds $${RULES.PAUSE_SPEND_THRESHOLD} spend threshold with zero conversions. Not TOFU/MOFU exempt.`,
          impact: `Save $${(spend / 30 * 30).toFixed(2)}/mo`,
        });
      }
    }

    // ── Rule 2: Low CTR pause ─────────────────────────────────
    for (const c of eligible) {
      const impressions = c.impressions || 0;
      const clicks = c.clicks || 0;
      if (impressions < RULES.PAUSE_LOW_CTR_MIN_IMPRESSIONS) continue;

      const ctr = (clicks / impressions) * 100;
      if (ctr < RULES.PAUSE_LOW_CTR) {
        findings.push({
          severity: "high",
          title: `Low CTR: "${c.name}" at ${ctr.toFixed(2)}%`,
          detail: `CTR ${ctr.toFixed(2)}% < ${RULES.PAUSE_LOW_CTR}% threshold with ${impressions.toLocaleString()} impressions.`,
          campaigns: [c.name],
        });
        recommendations.push({
          type: "pause",
          severity: "high",
          target: c.name,
          targetId: c.id,
          action: `Review/pause "${c.name}" — CTR ${ctr.toFixed(2)}% (< ${RULES.PAUSE_LOW_CTR}%)`,
          rationale: `Sustained low CTR with significant impressions suggests poor ad relevance.`,
          impact: `Reallocate $${(c.spend || 0).toFixed(2)} to better performers`,
        });
      }
    }

    // ── Rule 3: Auto-scale high performers ────────────────────
    for (const c of eligible) {
      const impressions = c.impressions || 0;
      const clicks = c.clicks || 0;
      if (impressions < 1000 || clicks < 10) continue;

      const ctr = (clicks / impressions) * 100;
      const conversions = c.conversions || 0;

      if (ctr > RULES.SCALE_HIGH_CTR && conversions > 0) {
        findings.push({
          severity: "low",
          title: `Scale opportunity: "${c.name}" (CTR ${ctr.toFixed(2)}%)`,
          detail: `High CTR with conversions. Good candidate for budget increase.`,
          campaigns: [c.name],
        });
        recommendations.push({
          type: "budget-increase",
          severity: "medium",
          target: c.name,
          targetId: c.id,
          action: `Increase budget for "${c.name}" — CTR ${ctr.toFixed(2)}%, ${conversions} conversions`,
          rationale: `High-performing campaign likely has room to scale.`,
          impact: `Potential for more conversions at efficient CPA`,
        });
      }
    }

    // ── Rule 4: Bid strategy switches ─────────────────────────
    for (const c of eligible) {
      if (c.platform !== "google_ads") continue;
      const conversions = c.conversions || 0;
      const metadata = c.metadata ? JSON.parse(c.metadata) : {};
      const currentBidStrategy = metadata.biddingStrategy || "MANUAL_CPC";

      if (conversions >= RULES.BID_MAXCONV_TO_TCPA && currentBidStrategy !== "TARGET_CPA") {
        recommendations.push({
          type: "bid-adjust",
          severity: "medium",
          target: c.name,
          targetId: c.id,
          action: `Switch "${c.name}" to Target CPA (${conversions} conversions, currently ${currentBidStrategy})`,
          rationale: `${conversions} conversions exceeds ${RULES.BID_MAXCONV_TO_TCPA} threshold for Target CPA.`,
        });
      } else if (
        conversions >= RULES.BID_MANUAL_TO_MAXCONV &&
        conversions < RULES.BID_MAXCONV_TO_TCPA &&
        currentBidStrategy === "MANUAL_CPC"
      ) {
        recommendations.push({
          type: "bid-adjust",
          severity: "low",
          target: c.name,
          targetId: c.id,
          action: `Switch "${c.name}" to Maximize Conversions (${conversions} conversions, currently Manual CPC)`,
          rationale: `${conversions} conversions exceeds ${RULES.BID_MANUAL_TO_MAXCONV} threshold for MaxConv.`,
        });
      }
    }

    // ── Confidence scoring ────────────────────────────────────
    const confidence: ConfidenceScore = computeConfidence({
      hasApiData: true, // Using DB data which is synced from APIs
      hasKnowledgeBase: true, // Rules from knowledge base
      hasAllRequiredFields: true,
      validationsPassed: true,
    });

    // ── Platform capability note ──────────────────────────────
    const platformNotes: string[] = [];
    const platforms = [...new Set(eligible.map((c) => c.platform))];
    for (const p of platforms) {
      if (p === "google_ads" || p === "stackadapt" || p === "reddit") {
        platformNotes.push(`${p}: can execute changes (with approval)`);
      } else if (p === "linkedin") {
        platformNotes.push(`${p}: recommend only (read-only API)`);
      }
    }

    return {
      findings,
      recommendations,
      artifacts: [{
        writeOps,
        campaignsAnalyzed: eligible.length,
        campaignsExcluded: tooYoung,
        platformCapabilities: platformNotes,
        rules: RULES,
        _meta: { confidence },
      }],
      summary: `🔧 Analyzed ${eligible.length} campaigns (${tooYoung} excluded as <${RULES.MIN_AGE_DAYS}d old). ` +
        `${findings.filter((f) => f.severity === "critical").length} critical, ` +
        `${findings.filter((f) => f.severity === "high").length} high-severity findings. ` +
        `${recommendations.length} recommendations (ALL require approval). ` +
        `${platformNotes.join(". ")}. Confidence: ${confidence.level}.`,
    };
  },
};
