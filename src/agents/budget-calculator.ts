import { computeConfidence, type ConfidenceScore } from "@/lib/safety";
import type { AgentHandler, AgentOutput, AgentInput, Finding, AgentRecommendation } from "./types";

/**
 * Budget Calculator — data-driven, shows all math.
 * Accepts keyword research and ABM data from prior agent outputs.
 */

interface BudgetInput {
  channel?: string;
  total_budget?: number;
  target_budget?: number;
  channels?: string[];
  duration_days?: number;
  // From keyword researcher
  keyword_data?: {
    totalKeywords?: number;
    totalVolume?: number;
    highIntentVolume?: number;
    avgCPC?: number;
    location?: string;
  };
  // From ABM list agent
  abm_data?: {
    companyCount?: number;
    estAudienceSize?: number;
  };
  // Direct params
  target_impressions?: number;
  target_audience_size?: number;
  conversion_rate?: number;
}

// Benchmarks
const CONVERSION_RATE_DEFAULT = 0.03; // 3%
const IMPRESSION_SHARE_LOW = 0.05;
const IMPRESSION_SHARE_MID = 0.10;
const IMPRESSION_SHARE_HIGH = 0.15;
const LINKEDIN_CPM = { low: 35, mid: 42, high: 50 };
const STACKADAPT_DISPLAY_CPM = { low: 8, mid: 12, high: 15 };
const STACKADAPT_NATIVE_CPM = { low: 15, mid: 20, high: 25 };
const DECISION_MAKERS_PER_COMPANY = 175;

interface BudgetTier {
  name: string;
  monthly: number;
  dailyBudget: number;
  estClicks: number;
  estLeads: number;
  cpl: number;
  rationale: string;
}

function calcGoogleSearch(params: BudgetInput, findings: Finding[]) {
  const kd = params.keyword_data;
  const totalVolume = kd?.totalVolume || 10000;
  const highIntentVolume = kd?.highIntentVolume || Math.round(totalVolume * 0.6);
  const avgCPC = kd?.avgCPC || 10;
  const convRate = params.conversion_rate || CONVERSION_RATE_DEFAULT;
  const location = kd?.location || "US";
  const totalKeywords = kd?.totalKeywords || 15;

  if (!kd) {
    findings.push({
      severity: "medium",
      title: "No keyword data provided — using defaults",
      detail: "Run keyword-researcher first for accurate budget. Using 10K volume, $10 CPC defaults.",
    });
  }

  // Tiers based on impression share capture
  const tiers: BudgetTier[] = [
    {
      name: "Minimum",
      monthly: 0, dailyBudget: 0, estClicks: 0, estLeads: 0, cpl: 0,
      rationale: "Enough data to optimize after 2 weeks",
    },
    {
      name: "Recommended",
      monthly: 0, dailyBudget: 0, estClicks: 0, estLeads: 0, cpl: 0,
      rationale: "Statistical significance in 30 days",
    },
    {
      name: "Aggressive",
      monthly: 0, dailyBudget: 0, estClicks: 0, estLeads: 0, cpl: 0,
      rationale: `Capture ~${(IMPRESSION_SHARE_HIGH * 100).toFixed(0)}% of high-intent volume`,
    },
  ];

  const shares = [IMPRESSION_SHARE_LOW, IMPRESSION_SHARE_MID, IMPRESSION_SHARE_HIGH];
  for (let i = 0; i < 3; i++) {
    const share = shares[i];
    const monthlyClicks = Math.round(highIntentVolume * share);
    const monthly = Math.round(monthlyClicks * avgCPC);
    const daily = Math.round(monthly / 30);
    const leads = Math.round(monthlyClicks * convRate);
    tiers[i].monthly = monthly;
    tiers[i].dailyBudget = daily;
    tiers[i].estClicks = monthlyClicks;
    tiers[i].estLeads = Math.max(leads, 1);
    tiers[i].cpl = leads > 0 ? Math.round(monthly / leads) : monthly;
  }

  return {
    type: "budget_calculation",
    channel: "google_search",
    inputs: {
      keywords: totalKeywords,
      totalVolume,
      highIntentVolume,
      avgCPC,
      location,
      conversionRate: convRate,
    },
    tiers,
    math: {
      formula: "highIntentVolume × impressionShare × avgCPC = monthlyBudget",
      example: `${highIntentVolume} × ${(IMPRESSION_SHARE_MID * 100)}% × $${avgCPC.toFixed(2)} = $${tiers[1].monthly}/mo`,
      leadsFormula: `clicks × ${(convRate * 100).toFixed(0)}% conversion rate = leads`,
    },
    assumptions: [
      `${(convRate * 100).toFixed(0)}% conversion rate (Telnyx avg for competitor campaigns)`,
      `${(IMPRESSION_SHARE_LOW * 100).toFixed(0)}-${(IMPRESSION_SHARE_HIGH * 100).toFixed(0)}% impression share range across tiers`,
      kd ? "CPC from keyword research estimates" : "CPC estimated at $10 (no keyword data)",
      "High-intent volume used as base (excludes low-intent informational)",
    ],
  };
}

function calcLinkedIn(params: BudgetInput, findings: Finding[]) {
  const abm = params.abm_data;
  let audienceSize = params.target_audience_size || 0;

  if (abm?.companyCount && !audienceSize) {
    audienceSize = abm.estAudienceSize || abm.companyCount * DECISION_MAKERS_PER_COMPANY;
  }
  if (!audienceSize) {
    audienceSize = 50000; // Default
    findings.push({
      severity: "medium",
      title: "No audience size provided — using 50K default",
      detail: "Run abm-list first or provide target_audience_size for accurate budget.",
    });
  }

  const frequency = { low: 2, mid: 4, high: 6 }; // monthly impressions per person
  const tiers: BudgetTier[] = [];

  for (const [tierName, freq, cpm, rationale] of [
    ["Minimum", frequency.low, LINKEDIN_CPM.low, "Low frequency — awareness only"] as const,
    ["Recommended", frequency.mid, LINKEDIN_CPM.mid, "4x/mo frequency — consideration building"] as const,
    ["Aggressive", frequency.high, LINKEDIN_CPM.high, "High frequency + premium placements"] as const,
  ]) {
    const impressions = audienceSize * freq;
    const monthly = Math.round((impressions / 1000) * cpm);
    const daily = Math.round(monthly / 30);
    const estClicks = Math.round(impressions * 0.004); // 0.4% CTR
    const estLeads = Math.max(Math.round(estClicks * 0.02), 1); // 2% form fill rate
    tiers.push({
      name: tierName,
      monthly,
      dailyBudget: daily,
      estClicks,
      estLeads,
      cpl: Math.round(monthly / estLeads),
      rationale: `${rationale} — ${freq}x freq, $${cpm} CPM`,
    });
  }

  return {
    type: "budget_calculation",
    channel: "linkedin",
    inputs: {
      audienceSize,
      abmCompanies: abm?.companyCount || null,
      decisionMakersPerCompany: abm?.companyCount ? DECISION_MAKERS_PER_COMPANY : null,
    },
    tiers,
    math: {
      formula: "audienceSize × frequency × CPM/1000 = monthlyBudget",
      example: `${audienceSize.toLocaleString()} × ${frequency.mid}/mo × $${LINKEDIN_CPM.mid}/1000 = $${tiers[1].monthly}/mo`,
      audienceCalc: abm?.companyCount
        ? `${abm.companyCount} companies × ${DECISION_MAKERS_PER_COMPANY} decision-makers = ${audienceSize.toLocaleString()}`
        : "Direct audience size provided",
    },
    assumptions: [
      `$${LINKEDIN_CPM.low}-$${LINKEDIN_CPM.high} CPM range (B2B tech LinkedIn benchmark)`,
      "0.4% CTR (LinkedIn sponsored content avg)",
      "2% form fill rate on clicks",
      abm?.companyCount ? `${DECISION_MAKERS_PER_COMPANY} avg decision-makers per company` : "Default 50K audience",
    ],
  };
}

function calcStackAdapt(params: BudgetInput, findings: Finding[]) {
  const abm = params.abm_data;
  let audienceSize = params.target_audience_size || 0;
  if (abm?.companyCount && !audienceSize) {
    audienceSize = abm.estAudienceSize || abm.companyCount * DECISION_MAKERS_PER_COMPANY;
  }
  if (!audienceSize) audienceSize = 100000;

  const isNative = (params.channel || "").includes("native");
  const cpmRange = isNative ? STACKADAPT_NATIVE_CPM : STACKADAPT_DISPLAY_CPM;
  const ctr = isNative ? 0.003 : 0.001;
  const adType = isNative ? "native" : "display";

  const frequency = { low: 3, mid: 6, high: 10 };
  const tiers: BudgetTier[] = [];

  for (const [tierName, freq, cpm, rationale] of [
    ["Minimum", frequency.low, cpmRange.low, "Low frequency retargeting"] as const,
    ["Recommended", frequency.mid, cpmRange.mid, "Balanced reach + frequency"] as const,
    ["Aggressive", frequency.high, cpmRange.high, "High frequency surround-sound"] as const,
  ]) {
    const impressions = audienceSize * freq;
    const monthly = Math.round((impressions / 1000) * cpm);
    const daily = Math.round(monthly / 30);
    const estClicks = Math.round(impressions * ctr);
    const estLeads = Math.max(Math.round(estClicks * 0.015), 1);
    tiers.push({
      name: tierName,
      monthly,
      dailyBudget: daily,
      estClicks,
      estLeads,
      cpl: Math.round(monthly / estLeads),
      rationale: `${rationale} — ${freq}x freq, $${cpm} CPM`,
    });
  }

  return {
    type: "budget_calculation",
    channel: `stackadapt_${adType}`,
    inputs: { audienceSize, adType },
    tiers,
    math: {
      formula: `audienceSize × frequency × CPM/1000 = monthlyBudget`,
      example: `${audienceSize.toLocaleString()} × ${frequency.mid}/mo × $${cpmRange.mid}/1000 = $${tiers[1].monthly}/mo`,
    },
    assumptions: [
      `$${cpmRange.low}-$${cpmRange.high} CPM (StackAdapt ${adType})`,
      `${(ctr * 100).toFixed(1)}% CTR (${adType} benchmark)`,
      "1.5% conversion rate on clicks",
    ],
  };
}

const REDDIT_CPC = { low: 2, mid: 4.5, high: 8 };

function calcReddit(params: BudgetInput, findings: Finding[]) {
  const abm = params.abm_data;
  let audienceSize = params.target_audience_size || 0;
  if (abm?.companyCount && !audienceSize) {
    audienceSize = abm.estAudienceSize || abm.companyCount * DECISION_MAKERS_PER_COMPANY;
  }
  if (!audienceSize) audienceSize = 75000;

  const ctr = 0.008; // Reddit B2B benchmark
  const convRate = CONVERSION_RATE_DEFAULT;

  const tiers: BudgetTier[] = [];
  for (const [tierName, cpc, rationale] of [
    ["Minimum", REDDIT_CPC.low, "Low-bid subreddit targeting"] as const,
    ["Recommended", REDDIT_CPC.mid, "Balanced CPC for tech subreddits"] as const,
    ["Aggressive", REDDIT_CPC.high, "Premium placements + conversation ads"] as const,
  ]) {
    const dailyClicks = Math.round((params.total_budget || 3000) / 30 / cpc);
    const monthly = Math.round(dailyClicks * cpc * 30);
    const daily = Math.round(monthly / 30);
    const estClicks = dailyClicks * 30;
    const estLeads = Math.max(Math.round(estClicks * convRate), 1);
    tiers.push({
      name: tierName,
      monthly,
      dailyBudget: daily,
      estClicks,
      estLeads,
      cpl: Math.round(monthly / estLeads),
      rationale: `${rationale} — $${cpc} avg CPC`,
    });
  }

  return {
    type: "budget_calculation",
    channel: "reddit",
    inputs: { audienceSize },
    tiers,
    math: {
      formula: `dailyBudget / avgCPC = dailyClicks → monthly`,
      example: `$${tiers[1].dailyBudget}/day / $${REDDIT_CPC.mid} CPC = ~${Math.round(tiers[1].estClicks / 30)} clicks/day`,
    },
    assumptions: [
      `$${REDDIT_CPC.low}-$${REDDIT_CPC.high} CPC (Reddit B2B tech)`,
      `${(ctr * 100).toFixed(1)}% CTR (Reddit promoted posts)`,
      `${(convRate * 100).toFixed(0)}% conversion rate`,
      "Lower CPCs than LinkedIn for developer audiences",
    ],
  };
}

export const budgetCalculator: AgentHandler = {
  slug: "budget-calculator",

  async run(input: AgentInput): Promise<AgentOutput> {
    const params = { ...(input.context || {}), ...(input.config || {}) } as BudgetInput;
    const channels = params.channels || [params.channel || "google_search"];
    const findings: Finding[] = [];
    const recommendations: AgentRecommendation[] = [];
    const artifacts: Record<string, any>[] = [];

    for (const channel of channels) {
      let result: any;
      if (channel === "google_search") {
        result = calcGoogleSearch(params, findings);
      } else if (channel === "linkedin") {
        result = calcLinkedIn(params, findings);
      } else if (channel.startsWith("stackadapt")) {
        result = calcStackAdapt({ ...params, channel }, findings);
      } else if (channel === "reddit") {
        result = calcReddit(params, findings);
      } else {
        findings.push({
          severity: "medium",
          title: `Unknown channel: ${channel}`,
          detail: "Supported: google_search, linkedin, stackadapt, stackadapt_native, reddit",
        });
        continue;
      }
      artifacts.push(result);
    }

    if (artifacts.length === 0) {
      return {
        findings: [{ severity: "critical", title: "No valid channels", detail: "No budget could be calculated." }],
        recommendations: [],
        summary: "❌ No valid channels provided.",
      };
    }

    // If user specified a total budget, pick the tier that fits and show allocation
    const userBudget = params.total_budget || params.target_budget;
    if (userBudget && artifacts.length > 0) {
      // Find best allocation that fits within user's budget
      const totalRecommendedRaw = artifacts.reduce((s, a) => s + (a.tiers?.[1]?.monthly || 0), 0);
      
      if (totalRecommendedRaw > userBudget) {
        // Scale down proportionally to fit within budget
        const ratio = userBudget / totalRecommendedRaw;
        for (const a of artifacts) {
          // Find the tier closest to the scaled amount
          const targetMonthly = Math.round((a.tiers?.[1]?.monthly || 0) * ratio);
          a.userBudgetAllocation = targetMonthly;
          a.userBudgetNote = `Scaled to fit $${userBudget.toLocaleString()}/mo total budget (${Math.round(ratio * 100)}% of recommended)`;
        }
        findings.push({
          severity: "medium",
          title: `Budget constraint applied — $${userBudget.toLocaleString()}/mo`,
          detail: `Your budget is ${Math.round(ratio * 100)}% of the recommended $${totalRecommendedRaw.toLocaleString()}/mo. ` +
            `Allocations scaled proportionally. Consider starting with the constrained budget and scaling up based on performance.`,
        });
      }
    }

    // Multi-channel summary
    const totalRecommended = userBudget || artifacts.reduce((s, a) => s + (a.tiers?.[1]?.monthly || 0), 0);

    const confidence: ConfidenceScore = computeConfidence({
      hasApiData: Boolean(params.keyword_data || params.abm_data),
      hasKnowledgeBase: true,
      hasAllRequiredFields: true,
      validationsPassed: true,
      customFlags: [
        { condition: Boolean(params.keyword_data), ifFalse: "No keyword data — using default estimates" },
        { condition: Boolean(params.abm_data), ifFalse: "No ABM data — using default audience sizes" },
      ],
    });

    const channelSummaries = artifacts.map(a => {
      const allocated = a.userBudgetAllocation;
      const recommended = a.tiers[1].monthly;
      return allocated
        ? `${a.channel}: $${allocated.toLocaleString()}/mo (of $${recommended.toLocaleString()} recommended)`
        : `${a.channel}: $${recommended.toLocaleString()}/mo recommended`;
    }).join(" | ");

    const budgetNote = userBudget
      ? `Within $${userBudget.toLocaleString()}/mo budget.`
      : `Total recommended: $${totalRecommended.toLocaleString()}/mo.`;

    return {
      findings,
      recommendations,
      artifacts,
      summary: `Budget: ${channelSummaries}. ${budgetNote} ` +
        `All numbers show formulas. Confidence: ${confidence.level}.`,
    };
  },
};
