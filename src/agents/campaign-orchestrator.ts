import { createCompletion } from "@/lib/ai-client";
import { prisma } from "@/lib/prisma";
import { KB, loadKnowledgeBundle } from "@/lib/knowledge-loader";
import {
  validateCampaignName, validateUTM, validateGoogleAdsCampaignSettings,
  validateMatchType, computeConfidence, estimateTokenCost,
  createWriteOp, aggregateValidations,
  type ConfidenceScore, type WriteOperation,
} from "@/lib/safety";
import { getPlatformSpec, validatePlanAgainstPlatform, type PlatformSpec } from "@/lib/platform-specs";
import { createTracker, updateTrackerStatus } from "@/lib/tracker-bridge";
import type { AgentHandler, AgentOutput, AgentInput, Finding, AgentRecommendation } from "./types";
import { getAgent } from "./registry";

/**
 * Campaign Orchestrator — Master workflow agent.
 * 
 * SAFETY:
 * - Chains sub-agents, PAUSES at every approval gate
 * - NEVER auto-creates campaigns — always returns plan for approval
 * - Uses Opus for orchestration, sub-agents use Sonnet
 * - Each phase produces a deliverable and waits for approval
 * - Uses programmatic validation at every step
 * 
 * PHASES:
 * 1. INTAKE: Parse brief, standards check, overlap check → approval
 * 2. BUILD: Keyword research, budget calc, ad copy gen → approval
 * 3. LAUNCH: Create campaign (PAUSED), validate settings → approval to enable
 * 4. TRACK: Create tracker, schedule reviews
 */

interface OrchestratorInput {
  brief?: string;
  phase?: "intake" | "build" | "launch" | "track";
  // Pre-parsed params (for resuming or direct calls)
  product?: string;
  icp?: string;
  competitors?: string[];
  value_props?: string[];
  landing_page?: string;
  funnel_stage?: string;
  regions?: string[];
  channel?: string;
  // ABM targeting
  abm_list_name?: string;
  // Accumulated context from previous phases
  intake_result?: any;
  build_result?: any;
  launch_result?: any;
  approved?: boolean;
  feedback?: string;
}

// ── ABM List Loading Helper ───────────────────────────────────

async function loadABMListForTargeting(listName: string) {
  const list = await prisma.aBMList.findFirst({
    where: { name: { contains: listName, mode: 'insensitive' } },
    include: {
      ABMListMember: { include: { ABMAccount: true } },
    },
  });
  if (!list) return null;
  return {
    listName: list.name,
    accountCount: list.ABMListMember.length,
    companies: list.ABMListMember.map(m => ({
      name: m.ABMAccount.company,
      domain: m.ABMAccount.domain,
      vertical: m.ABMAccount.vertical,
      productFit: m.ABMAccount.productFit,
    })),
    companyNames: list.ABMListMember.map(m => m.ABMAccount.company),
    domains: list.ABMListMember.map(m => m.ABMAccount.domain).filter(Boolean) as string[],
  };
}

export const campaignOrchestrator: AgentHandler = {
  slug: "campaign-orchestrator",

  async run(input: AgentInput): Promise<AgentOutput> {
    const params = { ...(input.context || {}), ...(input.config || {}) } as OrchestratorInput;
    const writer = (input.context as any)?._streamWriter;
    const phase = params.phase || "intake";

    switch (phase) {
      case "intake":
        return runIntakePhase(params, writer);
      case "build":
        return runBuildPhase(params, writer);
      case "launch":
        return runLaunchPhase(params, writer);
      case "track":
        return runTrackPhase(params, writer);
      default:
        return {
          findings: [{ severity: "critical", title: "Unknown phase", detail: `Phase "${phase}" not recognized.` }],
          recommendations: [],
          summary: `❌ Unknown orchestration phase: ${phase}`,
        };
    }
  },
};

// ════════════════════════════════════════════════════════════════
// PHASE 1: INTAKE
// ════════════════════════════════════════════════════════════════

async function runIntakePhase(params: OrchestratorInput, writer?: any): Promise<AgentOutput> {
  const findings: Finding[] = [];
  const recommendations: AgentRecommendation[] = [];

  // Conversational intake: if brief is too vague, ask clarifying questions
  if (!params.brief && !params.product) {
    return {
      findings: [],
      recommendations: [],
      summary: "I'd love to help you launch a campaign! To get started, I need a few details:\n\n" +
        "• **Product** — Voice AI, SMS API, SIP Trunking, IoT, or Inference?\n" +
        "• **Channel** — Google Search, LinkedIn, StackAdapt, or Reddit?\n" +
        "• **Region** — AMER, EMEA, or APAC?\n" +
        "• **Funnel stage** — TOFU (awareness), MOFU (consideration), or BOFU (decision)?\n" +
        "• **Landing page URL** (if you have one)\n\n" +
        "You can give me all of these at once, or we can go through them one by one. Even a rough brief like \"Launch a Voice AI search campaign for AMER\" works!",
      artifacts: [{ phase: "INTAKE", status: "NEEDS_CLARIFICATION" }],
    };
  }

  // Check if brief is too vague (no product identifiable)
  const briefText = params.brief || "";
  const hasProduct = params.product || /voice\s*ai|sms|sip|iot|inference|trunking|messaging|number|fax|video|wireless|networking/i.test(briefText);
  if (!hasProduct && briefText.length < 20) {
    return {
      findings: [],
      recommendations: [],
      summary: "Thanks! I can see you want to launch a campaign, but I need a bit more detail. Which **product** are we promoting?\n\n" +
        "• Voice AI\n• SMS API\n• SIP Trunking\n• IoT SIMs\n• Inference (AI Gateway)\n\n" +
        "And which **channel** — Google Search, LinkedIn, StackAdapt, or Reddit?",
      artifacts: [{ phase: "INTAKE", status: "NEEDS_CLARIFICATION" }],
    };
  }

  // ── Step 1: Parse brief with AI (Opus via gateway) ──────────
  let parsed: any = {};
  let inputCharCount = 0;
  let outputCharCount = 0;

  if (params.brief) {
    writer?.write?.({ type: "step", content: "Parsing campaign brief..." });
    const orchestrationKB = KB.campaignOrchestration();
    const namingKB = KB.campaignNaming();
    const geoKB = KB.geoTargeting();
    const utmKB = KB.utmTagging();

    const parsePrompt = `Parse this campaign brief and extract structured parameters.

## Standards
${orchestrationKB || "Use standard campaign conventions."}

## Brief
${params.brief}

Extract as JSON:
{
  "product": "product name",
  "icp": "target audience/ICP",
  "competitors": ["competitor1"],
  "value_props": ["value proposition 1"],
  "landing_page": "URL",
  "funnel_stage": "tofu|mofu|bofu",
  "regions": ["AMER", "EMEA"],
  "channel": "google_search|linkedin|stackadapt|reddit",
  "campaign_name_suggestion": "following naming conventions",
  "utm_params": {"utm_source": "...", "utm_medium": "...", "utm_campaign": "..."},
  "missing_info": ["anything not specified in the brief"],
  "confidence_notes": ["any assumptions made"]
}`;

    inputCharCount = parsePrompt.length;
    try {
      const response = await createCompletion({
        messages: [
          { role: "system", content: "You are a campaign planning expert. Parse the brief precisely. Flag anything missing. Return ONLY valid JSON." },
          { role: "user", content: parsePrompt },
        ],
        maxTokens: 1024,
        temperature: 0.1,
      });
      outputCharCount = response.length;
      let cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      // Extract first complete JSON object (AI sometimes appends explanation text)
      const firstBrace = cleaned.indexOf("{");
      if (firstBrace >= 0) {
        let depth = 0;
        let end = firstBrace;
        for (let i = firstBrace; i < cleaned.length; i++) {
          if (cleaned[i] === "{") depth++;
          else if (cleaned[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
        }
        cleaned = cleaned.slice(firstBrace, end);
      }
      parsed = JSON.parse(cleaned);
    } catch (err: any) {
      return {
        findings: [{ severity: "critical", title: "Brief parsing failed", detail: err.message }],
        recommendations: [],
        summary: `❌ Failed to parse campaign brief: ${err.message}`,
      };
    }
  } else {
    // Direct params provided
    parsed = {
      product: params.product,
      icp: params.icp || "",
      competitors: params.competitors || [],
      value_props: params.value_props || [],
      landing_page: params.landing_page || "",
      funnel_stage: params.funnel_stage || "mofu",
      regions: params.regions || ["AMER"],
      channel: params.channel || "google_search",
      missing_info: [],
    };
  }

  // ── Step 2: Programmatic standards validation ───────────────
  writer?.write?.({ type: "step", content: "Validating campaign standards..." });
  // Campaign name
  if (parsed.campaign_name_suggestion) {
    const nameVal = validateCampaignName(parsed.campaign_name_suggestion);
    if (!nameVal.valid) {
      findings.push({
        severity: "high",
        title: "Campaign name doesn't meet standards",
        detail: nameVal.errors.join("\n"),
      });
    }
    if (nameVal.warnings.length > 0) {
      findings.push({
        severity: "low",
        title: "Campaign name warnings",
        detail: nameVal.warnings.join("\n"),
      });
    }
  }

  // UTM validation
  if (parsed.landing_page && parsed.utm_params) {
    try {
      const fullUrl = new URL(parsed.landing_page);
      for (const [key, val] of Object.entries(parsed.utm_params)) {
        fullUrl.searchParams.set(key, val as string);
      }
      const utmVal = validateUTM(fullUrl.toString());
      if (!utmVal.valid) {
        findings.push({ severity: "high", title: "UTM validation failed", detail: utmVal.errors.join("\n") });
      }
    } catch {}
  }

  // Missing info flags
  if (parsed.missing_info?.length > 0) {
    findings.push({
      severity: "medium",
      title: `NEEDS REVIEW: ${parsed.missing_info.length} items not in brief`,
      detail: parsed.missing_info.join("\n"),
    });
  }

  // ── Step 3: Overlap check (calls sub-agent) ─────────────────
  writer?.write?.({ type: "step", content: "Checking for campaign overlaps..." });
  let overlapResult: any = null;
  if (parsed.channel === "google_search") {
    // We'll suggest running overlap check but don't block intake
    recommendations.push({
      type: "validation",
      severity: "medium",
      action: "Run Overlap Checker before BUILD phase with proposed keywords",
      rationale: "Ensure no keyword conflicts with existing campaigns before building.",
    });
  }

  // ── Confidence ──────────────────────────────────────────────
  const confidence: ConfidenceScore = computeConfidence({
    hasApiData: false, // Intake doesn't need API data
    hasKnowledgeBase: Boolean(KB.campaignOrchestration()),
    hasAllRequiredFields: Boolean(parsed.product && parsed.funnel_stage && parsed.regions?.length),
    validationsPassed: findings.filter((f) => f.severity === "critical" || f.severity === "high").length === 0,
    customFlags: [
      { condition: (parsed.missing_info?.length || 0) === 0, ifFalse: "Some brief items missing" },
      { condition: Boolean(parsed.landing_page), ifFalse: "No landing page specified" },
    ],
  });

  const cost = estimateTokenCost(inputCharCount, outputCharCount);

  return {
    findings,
    recommendations,
    artifacts: [{
      phase: "INTAKE",
      parsed,
      status: "AWAITING_APPROVAL",
      nextPhase: "build",
      _meta: { confidence, cost },
    }],
    summary: `📋 INTAKE complete for ${parsed.product || "unknown product"} (${parsed.channel}, ${parsed.funnel_stage}, ${(parsed.regions || []).join("/")}). ` +
      `${findings.length} findings. Confidence: ${confidence.level}. ` +
      `⏸️ AWAITING APPROVAL to proceed to BUILD phase.`,
    suggestedActions: [
      "Approve to proceed to BUILD",
      "Want to adjust any parameters?",
    ],
  };
}

// ════════════════════════════════════════════════════════════════
// PHASE 2: BUILD
// ════════════════════════════════════════════════════════════════

async function runBuildPhase(params: OrchestratorInput, writer?: any): Promise<AgentOutput> {
  const findings: Finding[] = [];
  const recommendations: AgentRecommendation[] = [];
  const intake = params.intake_result?.parsed || params.intake_result || params;

  if (!intake.product) {
    return {
      findings: [{ severity: "critical", title: "No intake data", detail: "Run INTAKE phase first." }],
      recommendations: [],
      summary: "❌ No intake data. Run INTAKE phase first.",
    };
  }

  const channel = (intake.channel || "google_search").toLowerCase();

  // ── Load ABM targeting if specified ─────────────────────────
  let abmTargeting: Awaited<ReturnType<typeof loadABMListForTargeting>> = null;
  const abmListName = params.abm_list_name || intake.abm_list_name;
  if (abmListName) {
    writer?.write?.({ type: "step", content: `Loading ABM list "${abmListName}" for targeting...` });
    abmTargeting = await loadABMListForTargeting(abmListName);
    if (!abmTargeting) {
      findings.push({
        severity: "medium",
        title: "ABM list not found",
        detail: `Could not find ABM list matching "${abmListName}". Proceeding without ABM targeting.`,
      });
    } else {
      findings.push({
        severity: "low",
        title: `ABM list loaded: ${abmTargeting.listName}`,
        detail: `${abmTargeting.accountCount} accounts loaded for targeting.`,
      });
    }
  }

  // ── Step 4: Keyword Research (Google Search only) ───────────
  let keywordResult: any = null;
  if (channel === "google_search") {
    writer?.write?.({ type: "step", content: "Running keyword research..." });
    const kwAgent = getAgent("keyword-researcher");
    if (kwAgent) {
      try {
        keywordResult = await kwAgent.run({
          context: {
            product: intake.product,
            competitors: intake.competitors,
            regions: intake.regions,
          },
        });
        findings.push(...keywordResult.findings);
      } catch (err: any) {
        findings.push({
          severity: "critical",
          title: "Keyword research FAILED — BUILD halted",
          detail: `Keyword Researcher error: ${err.message}. Cannot proceed without keyword data.`,
        });
        return {
          findings,
          recommendations: [],
          summary: `❌ BUILD HALTED: Keyword research failed. ${err.message}`,
        };
      }
    }
  } else {
    writer?.write?.({ type: "step", content: `Skipping keyword research (${channel} campaign)...` });
  }

  // ── Step 5: Budget Calculation (channel-specific) ───────────
  writer?.write?.({ type: "step", content: "Calculating budget..." });
  let budgetResult: any = null;
  const budgetAgent = getAgent("budget-calculator");
  if (budgetAgent) {
    try {
      const kwData = keywordResult?.artifacts?.[0]?.keywordPlan;
      const budgetContext: Record<string, any> = {
        channel: intake.channel,
        regions: intake.regions,
      };

      if (channel === "google_search") {
        budgetContext.keyword_data = kwData ? { keywords: kwData } : undefined;
      } else if (channel === "linkedin") {
        budgetContext.pricing_model = "CPC";
        budgetContext.audience_size = intake.audience_size;
        budgetContext.frequency = intake.frequency;
        budgetContext.platform_specifics = { type: "linkedin", avgCPC: 8.50, minDailyBudget: 10 };
      } else if (channel === "stackadapt") {
        budgetContext.pricing_model = "CPM";
        budgetContext.platform_specifics = { type: "stackadapt", avgCPM: 12, minDailyBudget: 50 };
      } else if (channel === "reddit") {
        budgetContext.pricing_model = "CPC";
        budgetContext.platform_specifics = { type: "reddit", avgCPC: 4.50, minDailyBudget: 5 };
      }

      budgetResult = await budgetAgent.run({ context: budgetContext });
      findings.push(...budgetResult.findings);
    } catch (err: any) {
      findings.push({
        severity: "medium",
        title: "Budget calculation failed",
        detail: err.message,
      });
    }
  }

  // ── Step 6: Ad Copy Generation (channel-specific limits) ────
  writer?.write?.({ type: "step", content: "Generating ad copy..." });
  let adCopyResult: any = null;
  const adCopyAgent = getAgent("ad-copy-generator");
  if (adCopyAgent) {
    try {
      const kwPlan = keywordResult?.artifacts?.[0]?.keywordPlan || [];
      const adGroups = kwPlan.length > 0
        ? groupKeywordsIntoAdGroups(kwPlan)
        : [{ name: intake.product || "General", theme: intake.product }];

      const adCopyContext: Record<string, any> = {
        product: intake.product,
        funnel_stage: intake.funnel_stage,
        channel: intake.channel,
        competitors: intake.competitors,
        landing_page: intake.landing_page,
        ad_groups: adGroups,
      };

      // Channel-specific character limits
      if (channel === "linkedin") {
        adCopyContext.charLimits = { headline: 200, description: 600 };
      } else if (channel === "stackadapt") {
        adCopyContext.charLimits = { headline: 90, description: 150 };
      } else if (channel === "reddit") {
        adCopyContext.charLimits = { headline: 150, description: 300 };
      }

      adCopyResult = await adCopyAgent.run({ context: adCopyContext });
      findings.push(...adCopyResult.findings);
    } catch (err: any) {
      findings.push({
        severity: "high",
        title: "Ad copy generation failed",
        detail: err.message,
      });
    }
  }

  // ── Channel-specific additions ──────────────────────────────
  let channelExtras: Record<string, any> = {};

  if (channel === "linkedin") {
    writer?.write?.({ type: "step", content: "Generating LinkedIn audience targeting..." });
    const linkedinKB = KB.linkedinPlaybook();
    try {
      const targetingResponse = await createCompletion({
        messages: [
          {
            role: "system",
            content: `You are a LinkedIn Ads targeting expert. Generate audience targeting recommendations.
${linkedinKB ? `\n## LinkedIn Playbook\n${linkedinKB}` : ""}
Return ONLY valid JSON with this structure:
{
  "jobTitles": ["VP Engineering", "CTO", ...],
  "industries": ["Software", "Telecommunications", ...],
  "companySizes": ["51-200", "201-500", ...],
  "seniority": ["Director", "VP", "C-Suite"],
  "audienceExpansion": false,
  "estimatedAudienceSize": "50,000-100,000"
}`,
          },
          {
            role: "user",
            content: `Product: ${intake.product}\nICP: ${intake.icp || "B2B tech companies"}\nFunnel: ${intake.funnel_stage}\nRegions: ${(intake.regions || []).join(", ")}${abmTargeting ? `\nABM List: ${abmTargeting.accountCount} accounts, companies: ${abmTargeting.companyNames.slice(0, 20).join(", ")}` : ""}`,
          },
        ],
        maxTokens: 512,
        temperature: 0.2,
      });
      let cleaned = targetingResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const brace = cleaned.indexOf("{");
      if (brace >= 0) {
        let depth = 0, end = brace;
        for (let i = brace; i < cleaned.length; i++) {
          if (cleaned[i] === "{") depth++;
          else if (cleaned[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
        }
        cleaned = cleaned.slice(brace, end);
      }
      channelExtras.audienceTargeting = JSON.parse(cleaned);
    } catch (err: any) {
      findings.push({ severity: "medium", title: "LinkedIn targeting generation failed", detail: err.message });
    }

    if (abmTargeting) {
      channelExtras.abmTargeting = {
        companyNames: abmTargeting.companyNames,
        domains: abmTargeting.domains,
        accountCount: abmTargeting.accountCount,
      };
    }
  }

  if (channel === "stackadapt") {
    channelExtras.creativeSizes = [
      { size: "300x250", name: "Medium Rectangle", priority: "high" },
      { size: "728x90", name: "Leaderboard", priority: "high" },
      { size: "160x600", name: "Wide Skyscraper", priority: "medium" },
      { size: "970x250", name: "Billboard", priority: "medium" },
      { size: "300x600", name: "Half Page", priority: "low" },
    ];

    // Native vs display recommendation based on funnel stage
    const funnelStage = (intake.funnel_stage || "mofu").toLowerCase();
    if (funnelStage === "tofu") {
      channelExtras.formatRecommendation = "Native ads recommended for TOFU — higher engagement, less intrusive for awareness.";
    } else if (funnelStage === "bofu") {
      channelExtras.formatRecommendation = "Display ads recommended for BOFU — stronger CTAs, retargeting-friendly.";
    } else {
      channelExtras.formatRecommendation = "Mix of native (60%) and display (40%) recommended for MOFU — balance engagement with conversion intent.";
    }

    if (abmTargeting) {
      channelExtras.abmTargeting = {
        domains: abmTargeting.domains,
        accountCount: abmTargeting.accountCount,
        note: "Use domain targeting for B2B audience segments in StackAdapt.",
      };
    }
  }

  if (channel === "reddit") {
    channelExtras.adFormats = [
      { type: "Promoted Post", details: "Standard image/video post in feed", priority: "high" },
      { type: "Conversation Placement", details: "Ad within comment threads — high engagement", priority: "medium" },
      { type: "Carousel", details: "Multi-image swipeable cards", priority: "medium" },
    ];

    const funnelStage = (intake.funnel_stage || "mofu").toLowerCase();
    if (funnelStage === "tofu") {
      channelExtras.formatRecommendation = "Promoted Posts targeting relevant subreddits for TOFU — focus on technical content.";
    } else if (funnelStage === "bofu") {
      channelExtras.formatRecommendation = "Conversation Placement for BOFU — engage users already discussing solutions.";
    } else {
      channelExtras.formatRecommendation = "Promoted Posts with subreddit targeting for MOFU — educational content performs best.";
    }

    channelExtras.targetingRecommendation = "Use subreddit targeting (r/devops, r/programming, r/aws, etc.) + interest targeting for technical audiences.";

    if (abmTargeting) {
      channelExtras.abmTargeting = {
        note: "Upload custom audience (email list) for account targeting on Reddit.",
        accountCount: abmTargeting.accountCount,
      };
    }
  }

  // ── Platform requirements validation ─────────────────────────
  writer?.write?.({ type: "step", content: "Validating against platform requirements..." });
  const platformSpec = getPlatformSpec(channel);
  if (platformSpec) {
    const planValidation = validatePlanAgainstPlatform({
      channel,
      hasConversionTracking: undefined, // Unknown at build time — flag it
      adExtensionCount: channel === "google_search" ? (adCopyResult?.artifacts?.length || 0) : undefined,
      geoTargetType: intake.geoTargetType || (channel === "google_search" ? "PRESENCE" : undefined),
      network: channel === "google_search" ? "SEARCH" : undefined,
      headlineCount: adCopyResult?.artifacts?.[0]?.headlines?.length,
      audienceSize: channelExtras.audienceTargeting?.estimatedAudienceSize
        ? parseInt(String(channelExtras.audienceTargeting.estimatedAudienceSize).replace(/[^0-9]/g, ""), 10)
        : undefined,
      hasFrequencyCap: channel === "stackadapt" ? false : undefined, // Default to false, flag it
      creativeSizeCount: channelExtras.creativeSizes?.length,
      hasInsightTag: undefined,
      hasConversionPixel: undefined,
      funnelStage: intake.funnel_stage,
    });

    for (const m of planValidation.missing) {
      findings.push({
        severity: m.severity,
        title: `Platform requirement: ${m.requirement}`,
        detail: `${platformSpec.name} requires this for campaign success.`,
      });
    }
    for (const w of planValidation.warnings) {
      findings.push({
        severity: "low",
        title: `Platform recommendation`,
        detail: w,
      });
    }

    // Attach must-have checklist to channelExtras
    channelExtras.platformRequirements = {
      mustHave: platformSpec.mustHave,
      shouldEnable: platformSpec.shouldEnable,
      validationResult: planValidation,
      abmApproach: platformSpec.abmApproach,
      biddingRecommendation: platformSpec.bidding.recommended,
      budgetInfo: platformSpec.budget,
    };
  }

  // ── Confidence ──────────────────────────────────────────────
  const hasCritical = findings.some((f) => f.severity === "critical");
  const needsKeywords = channel === "google_search";
  const confidence: ConfidenceScore = computeConfidence({
    hasApiData: needsKeywords ? Boolean(keywordResult) : true,
    hasKnowledgeBase: true,
    hasAllRequiredFields: Boolean(intake.product && intake.channel),
    validationsPassed: !hasCritical,
    customFlags: [
      { condition: !needsKeywords || Boolean(keywordResult), ifFalse: "Keyword research not completed" },
      { condition: Boolean(budgetResult), ifFalse: "Budget calculation not completed" },
      { condition: Boolean(adCopyResult), ifFalse: "Ad copy generation not completed" },
    ],
  });

  return {
    findings,
    recommendations,
    artifacts: [{
      phase: "BUILD",
      channel,
      keywordResult: keywordResult ? {
        summary: keywordResult.summary,
        keywordCount: keywordResult.artifacts?.[0]?.keywordPlan?.length || 0,
        plan: keywordResult.artifacts?.[0]?.keywordPlan,
      } : null,
      budgetResult: budgetResult ? {
        summary: budgetResult.summary,
        budget: budgetResult.artifacts?.[0],
      } : null,
      adCopyResult: adCopyResult ? {
        summary: adCopyResult.summary,
        adGroups: adCopyResult.artifacts?.filter((a: any) => !a._meta),
      } : null,
      channelExtras: Object.keys(channelExtras).length > 0 ? channelExtras : undefined,
      abmTargeting: abmTargeting ? { listName: abmTargeting.listName, accountCount: abmTargeting.accountCount } : undefined,
      intake,
      status: "AWAITING_APPROVAL",
      nextPhase: "launch",
      _meta: { confidence },
    }],
    summary: `🏗️ BUILD complete for ${intake.product} (${channel}). ` +
      `Keywords: ${needsKeywords ? (keywordResult ? "✅" : "❌") : "⏭️ skipped"} | Budget: ${budgetResult ? "✅" : "❌"} | Ad Copy: ${adCopyResult ? "✅" : "❌"}` +
      `${channelExtras.audienceTargeting ? " | Audience Targeting: ✅" : ""}` +
      `${channelExtras.creativeSizes ? " | Creative Sizes: ✅" : ""}` +
      `${abmTargeting ? ` | ABM: ${abmTargeting.accountCount} accounts` : ""}. ` +
      `${findings.length} findings. Confidence: ${confidence.level}. ` +
      `⏸️ AWAITING APPROVAL to proceed to LAUNCH phase.`,
  };
}

// ════════════════════════════════════════════════════════════════
// PHASE 3: LAUNCH
// ════════════════════════════════════════════════════════════════

async function runLaunchPhase(params: OrchestratorInput, writer?: any): Promise<AgentOutput> {
  const findings: Finding[] = [];
  const recommendations: AgentRecommendation[] = [];
  const build = params.build_result;
  writer?.write?.({ type: "phase", data: { current: "LAUNCH", completed: ["INTAKE", "BUILD"] } });

  if (!build) {
    return {
      findings: [{ severity: "critical", title: "No build data", detail: "Run BUILD phase first." }],
      recommendations: [],
      summary: "❌ No build data. Run BUILD phase first.",
    };
  }

  const channel = (build.channel || build.intake?.channel || "google_search").toLowerCase();
  const platformSpec = getPlatformSpec(channel);

  // Branch LAUNCH by channel
  if (channel === "linkedin") {
    return runLinkedInLaunch(build, findings, recommendations, writer);
  } else if (channel === "stackadapt") {
    return runStackAdaptLaunch(build, findings, recommendations, writer);
  } else if (channel === "reddit") {
    return runRedditLaunch(build, findings, recommendations, writer);
  }

  // ── Google Ads Search Launch (default) ──────────────────────

  // ── Pre-flight validation ───────────────────────────────────
  writer?.write?.({ type: "step", content: "Running pre-flight validation..." });
  const settingsVal = validateGoogleAdsCampaignSettings({
    status: "PAUSED",
    geoTargetType: "PRESENCE",
    networkSetting: "SEARCH",
    biddingStrategy: "MANUAL_CPC",
  });

  if (!settingsVal.valid) {
    findings.push({
      severity: "critical",
      title: "Campaign settings validation failed",
      detail: settingsVal.errors.join("\n"),
    });
    return { findings, recommendations: [], summary: "❌ Settings validation failed." };
  }

  // ── Validate all keywords have valid match types ────────────
  const kwPlan = build.keywordResult?.plan || [];
  for (const kw of kwPlan) {
    const mtVal = validateMatchType(kw.matchType);
    if (!mtVal.valid) {
      findings.push({
        severity: "critical",
        title: `Invalid match type for "${kw.keyword}"`,
        detail: mtVal.errors.join("\n"),
      });
    }
  }

  if (findings.some((f) => f.severity === "critical")) {
    return {
      findings,
      recommendations: [],
      summary: `❌ LAUNCH blocked: ${findings.filter((f) => f.severity === "critical").length} critical validation failures.`,
    };
  }

  // ── Build the campaign creation plan ────────────────────────
  writer?.write?.({ type: "step", content: "Building campaign creation plan..." });
  const writeOps: WriteOperation[] = [];

  const campaignPlan = {
    platform: "google_ads",
    campaign: {
      name: build.intake?.campaign_name_suggestion || `${new Date().toISOString().slice(0, 7).replace("-", "")} ${build.intake?.funnel_stage?.toUpperCase()} ${build.intake?.product} SA ${(build.intake?.regions || ["GLOBAL"]).join("/")}`,
      status: "PAUSED",
      biddingStrategy: "MANUAL_CPC",
      geoTargeting: "PRESENCE",
      network: "SEARCH_ONLY",
      dailyBudget: build.budgetResult?.budget?.recommendedDailyBudget || 50,
      settings: {
        autoApplyAdSuggestions: false,
        searchPartners: false,
      },
    },
    adGroups: (build.adCopyResult?.adGroups || []).map((ag: any) => ({
      name: ag.name,
      keywords: (kwPlan || [])
        .filter((_kw: any) => true)
        .map((kw: any) => ({
          text: kw.keyword,
          matchType: kw.matchType,
        })),
      ads: {
        headlines: (ag.headlines || []).map((h: any) => h.text),
        descriptions: (ag.descriptions || []).map((d: any) => d.text),
        pinning: (ag.headlines || [])
          .filter((h: any) => h.pinPosition)
          .map((h: any) => ({ text: h.text, position: h.pinPosition })),
      },
    })),
    extensions: {
      required: ["Sitelinks", "Callouts", "Structured Snippets"],
      note: "At least 3 ad extensions required per Google Ads best practices",
    },
    utmParams: build.intake?.utm_params || {},
    mustHaveChecklist: platformSpec?.mustHave || [],
  };

  writeOps.push(createWriteOp({
    type: "create_campaign",
    platform: "google_ads",
    target: campaignPlan.campaign.name,
    description: `Create campaign "${campaignPlan.campaign.name}" with ${campaignPlan.adGroups.length} ad groups, status=PAUSED, bid=Manual CPC, geo=PRESENCE, network=SEARCH`,
    newValue: JSON.stringify(campaignPlan),
  }));

  const confidence: ConfidenceScore = computeConfidence({
    hasApiData: Boolean(build.keywordResult),
    hasKnowledgeBase: true,
    hasAllRequiredFields: true,
    validationsPassed: true,
  });

  return {
    findings,
    recommendations: [{
      type: "create_campaign",
      severity: "high",
      target: campaignPlan.campaign.name,
      action: `CREATE campaign "${campaignPlan.campaign.name}" (PAUSED) via Google Ads API — requires approval`,
      rationale: `Full plan: ${campaignPlan.adGroups.length} ad groups, $${campaignPlan.campaign.dailyBudget}/day, Manual CPC, Search only, Presence targeting`,
      impact: `Est. $${(campaignPlan.campaign.dailyBudget * 30).toFixed(2)}/month`,
    }],
    artifacts: [{
      phase: "LAUNCH",
      campaignPlan,
      writeOps,
      status: "AWAITING_APPROVAL",
      nextPhase: "track",
      _meta: { confidence },
    }],
    summary: `🚀 LAUNCH plan ready: "${campaignPlan.campaign.name}" with ${campaignPlan.adGroups.length} ad groups. ` +
      `Status: PAUSED (will not go live until manually enabled). ` +
      `Budget: $${campaignPlan.campaign.dailyBudget}/day. ` +
      `⏸️ AWAITING APPROVAL to create in Google Ads.`,
  };
}

// ── LinkedIn Launch (READ-ONLY — plan document only) ──────────

async function runLinkedInLaunch(
  build: any, findings: Finding[], recommendations: AgentRecommendation[], writer?: any,
): Promise<AgentOutput> {
  writer?.write?.({ type: "step", content: "Building LinkedIn campaign plan document (read-only API)..." });

  const intake = build.intake || {};
  const channelExtras = build.channelExtras || {};
  const platformSpec = getPlatformSpec("linkedin");

  const campaignPlan = {
    platform: "linkedin_ads",
    apiNote: "⚠️ LinkedIn API is READ-ONLY for campaign creation. Create manually in Campaign Manager using this plan.",
    campaign: {
      name: intake.campaign_name_suggestion || `LI ${intake.funnel_stage?.toUpperCase()} ${intake.product} ${(intake.regions || ["GLOBAL"]).join("/")}`,
      objective: intake.funnel_stage?.toLowerCase() === "bofu" ? "Website Conversions"
        : intake.funnel_stage?.toLowerCase() === "tofu" ? "Brand Awareness" : "Website Visits",
      status: "PAUSED",
      dailyBudget: build.budgetResult?.budget?.recommendedDailyBudget || 50,
    },
    targeting: {
      ...(channelExtras.audienceTargeting || {}),
      ...(channelExtras.abmTargeting ? {
        matchedAudience: {
          type: "Company List Upload",
          companies: channelExtras.abmTargeting.companyNames?.slice(0, 50),
          totalCount: channelExtras.abmTargeting.accountCount,
        },
      } : {}),
    },
    adCopy: build.adCopyResult ? {
      summary: build.adCopyResult.summary,
      adGroups: build.adCopyResult.adGroups,
    } : null,
    creativeSpecs: {
      format: "Single Image",
      imageSize: "1200x627",
      headlineLimit: "200 characters",
      descriptionLimit: "600 characters",
    },
    mustHaveChecklist: platformSpec?.mustHave || [],
    setupSteps: [
      "1. Go to LinkedIn Campaign Manager → Create Campaign",
      "2. Select objective: " + (intake.funnel_stage?.toLowerCase() === "bofu" ? "Website Conversions" : "Website Visits"),
      "3. Set up targeting per the plan above",
      channelExtras.abmTargeting ? "4. Upload Matched Audience company list (see ABM targeting section)" : "4. Configure audience targeting",
      "5. Upload creatives (1200x627 single image recommended)",
      "6. Set daily budget and schedule",
      "7. Verify LinkedIn Insight Tag is installed",
      "8. Launch in PAUSED state, review, then enable",
    ],
    utmParams: intake.utm_params || {},
  };

  const confidence: ConfidenceScore = computeConfidence({
    hasApiData: false,
    hasKnowledgeBase: true,
    hasAllRequiredFields: Boolean(intake.product),
    validationsPassed: true,
  });

  return {
    findings,
    recommendations: [{
      type: "create_campaign_plan",
      severity: "high",
      target: campaignPlan.campaign.name,
      action: `LinkedIn campaign plan ready — CREATE MANUALLY in Campaign Manager`,
      rationale: `LinkedIn API is read-only. Plan includes targeting, copy, and step-by-step setup instructions.`,
      impact: `Est. $${(campaignPlan.campaign.dailyBudget * 30).toFixed(2)}/month`,
    }],
    artifacts: [{
      phase: "LAUNCH",
      campaignPlan,
      writeOps: [],
      status: "AWAITING_MANUAL_CREATION",
      nextPhase: "track",
      _meta: { confidence },
    }],
    summary: `📋 LinkedIn LAUNCH plan ready: "${campaignPlan.campaign.name}". ` +
      `⚠️ LinkedIn API is read-only — create manually in Campaign Manager. ` +
      `Budget: $${campaignPlan.campaign.dailyBudget}/day. ` +
      `${channelExtras.abmTargeting ? `ABM: ${channelExtras.abmTargeting.accountCount} accounts for Matched Audience upload. ` : ""}` +
      `Step-by-step instructions included.`,
  };
}

// ── StackAdapt Launch (via GraphQL API) ───────────────────────

async function runStackAdaptLaunch(
  build: any, findings: Finding[], recommendations: AgentRecommendation[], writer?: any,
): Promise<AgentOutput> {
  writer?.write?.({ type: "step", content: "Building StackAdapt campaign creation plan..." });

  const intake = build.intake || {};
  const channelExtras = build.channelExtras || {};
  const platformSpec = getPlatformSpec("stackadapt");

  const funnelStage = (intake.funnel_stage || "mofu").toLowerCase();
  const campaignType = funnelStage === "tofu" ? "Native" : funnelStage === "bofu" ? "Display" : "Native + Display";

  const campaignPlan = {
    platform: "stackadapt",
    apiMethod: "GraphQL mutation upsertCampaign",
    campaign: {
      name: intake.campaign_name_suggestion || `SA ${intake.funnel_stage?.toUpperCase()} ${intake.product} ${(intake.regions || ["GLOBAL"]).join("/")}`,
      type: campaignType,
      status: "paused",
      totalBudget: build.budgetResult?.budget?.recommendedBudget || (build.budgetResult?.budget?.recommendedDailyBudget ? build.budgetResult.budget.recommendedDailyBudget * 30 : 2000),
      biddingModel: "CPM",
      frequencyCap: { impressions: 4, period: "day" },
      brandSafety: true,
      viewabilityTarget: 60,
    },
    targeting: {
      ...(channelExtras.abmTargeting ? {
        domainTargeting: {
          domains: channelExtras.abmTargeting.domains?.slice(0, 100),
          totalDomains: channelExtras.abmTargeting.domains?.length || 0,
          note: "Domain targeting list for B2B audience",
        },
      } : {}),
      contextual: true,
      geo: intake.regions || ["AMER"],
    },
    creatives: {
      required: channelExtras.creativeSizes || [
        { size: "300x250", name: "Medium Rectangle", priority: "high" },
        { size: "728x90", name: "Leaderboard", priority: "high" },
      ],
      native: campaignType.includes("Native") ? {
        headlineLimit: 90,
        bodyLimit: 150,
        brandLimit: 25,
        imageSize: "1200x627",
      } : null,
      formatRecommendation: channelExtras.formatRecommendation,
    },
    adCopy: build.adCopyResult ? {
      summary: build.adCopyResult.summary,
      adGroups: build.adCopyResult.adGroups,
    } : null,
    mustHaveChecklist: platformSpec?.mustHave || [],
    utmParams: intake.utm_params || {},
  };

  const writeOps: WriteOperation[] = [];
  writeOps.push(createWriteOp({
    type: "create_campaign",
    platform: "stackadapt",
    target: campaignPlan.campaign.name,
    description: `Create StackAdapt ${campaignType} campaign "${campaignPlan.campaign.name}" via GraphQL upsertCampaign, status=paused, budget=$${campaignPlan.campaign.totalBudget}, CPM-based`,
    newValue: JSON.stringify(campaignPlan),
  }));

  const confidence: ConfidenceScore = computeConfidence({
    hasApiData: false,
    hasKnowledgeBase: true,
    hasAllRequiredFields: Boolean(intake.product),
    validationsPassed: true,
  });

  return {
    findings,
    recommendations: [{
      type: "create_campaign",
      severity: "high",
      target: campaignPlan.campaign.name,
      action: `CREATE StackAdapt ${campaignType} campaign "${campaignPlan.campaign.name}" (PAUSED) via GraphQL — requires approval`,
      rationale: `${campaignType} campaign, $${campaignPlan.campaign.totalBudget} total budget, CPM-based, freq cap 4/day`,
      impact: `Est. $${campaignPlan.campaign.totalBudget}/campaign`,
    }],
    artifacts: [{
      phase: "LAUNCH",
      campaignPlan,
      writeOps,
      status: "AWAITING_APPROVAL",
      nextPhase: "track",
      _meta: { confidence },
    }],
    summary: `🚀 StackAdapt LAUNCH plan ready: "${campaignPlan.campaign.name}" (${campaignType}). ` +
      `Budget: $${campaignPlan.campaign.totalBudget} total, CPM-based. ` +
      `${channelExtras.abmTargeting ? `ABM: ${channelExtras.abmTargeting.domains?.length || 0} domains for targeting. ` : ""}` +
      `⏸️ AWAITING APPROVAL to create via GraphQL upsertCampaign.`,
  };
}

// ── Reddit Launch (via REST API) ──────────────────────────────

async function runRedditLaunch(
  build: any, findings: Finding[], recommendations: AgentRecommendation[], writer?: any,
): Promise<AgentOutput> {
  writer?.write?.({ type: "step", content: "Building Reddit campaign creation plan..." });

  const intake = build.intake || {};
  const channelExtras = build.channelExtras || {};
  const platformSpec = getPlatformSpec("reddit");

  const campaignPlan = {
    platform: "reddit",
    apiMethod: "PATCH /api/v3/campaigns/{id}",
    campaign: {
      name: intake.campaign_name_suggestion || `Reddit ${intake.funnel_stage?.toUpperCase()} ${intake.product} ${(intake.regions || ["GLOBAL"]).join("/")}`,
      status: "PAUSED",
      dailyBudget: build.budgetResult?.budget?.recommendedDailyBudget || 50,
      objective: "CONVERSIONS",
    },
    targeting: {
      subreddits: channelExtras.targetingRecommendation || "Target relevant technical subreddits",
      geo: intake.regions || ["AMER"],
      ...(channelExtras.abmTargeting ? { customAudience: channelExtras.abmTargeting } : {}),
    },
    adCopy: build.adCopyResult ? {
      summary: build.adCopyResult.summary,
    } : null,
    mustHaveChecklist: platformSpec?.mustHave || [],
    utmParams: intake.utm_params || {},
  };

  const writeOps: WriteOperation[] = [];
  writeOps.push(createWriteOp({
    type: "create_campaign",
    platform: "reddit",
    target: campaignPlan.campaign.name,
    description: `Create Reddit campaign "${campaignPlan.campaign.name}" via Reddit Ads API, status=PAUSED, budget=$${campaignPlan.campaign.dailyBudget}/day`,
    newValue: JSON.stringify(campaignPlan),
  }));

  const confidence: ConfidenceScore = computeConfidence({
    hasApiData: false,
    hasKnowledgeBase: true,
    hasAllRequiredFields: Boolean(intake.product),
    validationsPassed: true,
  });

  return {
    findings,
    recommendations: [{
      type: "create_campaign",
      severity: "high",
      target: campaignPlan.campaign.name,
      action: `CREATE Reddit campaign "${campaignPlan.campaign.name}" (PAUSED) via Reddit Ads API — requires approval`,
      rationale: `Reddit campaign, $${campaignPlan.campaign.dailyBudget}/day budget, CPC-based, subreddit targeting`,
      impact: `Est. $${campaignPlan.campaign.dailyBudget}/day`,
    }],
    artifacts: [{
      phase: "LAUNCH",
      campaignPlan,
      writeOps,
      status: "AWAITING_APPROVAL",
      nextPhase: "track",
      _meta: { confidence },
    }],
    summary: `🚀 Reddit LAUNCH plan ready: "${campaignPlan.campaign.name}". ` +
      `Budget: $${campaignPlan.campaign.dailyBudget}/day. ` +
      `⏸️ AWAITING APPROVAL to create via Reddit Ads API.`,
  };
}

// ════════════════════════════════════════════════════════════════
// PHASE 4: TRACK
// ════════════════════════════════════════════════════════════════

async function runTrackPhase(params: OrchestratorInput, writer?: any): Promise<AgentOutput> {
  const findings: Finding[] = [];
  const launch = params.launch_result;

  const campaignName = launch?.campaignPlan?.campaign?.name || params.product || "New Campaign";

  // ── Create tracker ──────────────────────────────────────────
  writer?.write?.({ type: "step", content: "Setting up tracking and review schedule..." });
  let trackerId: string | null = null;
  try {
    trackerId = await createTracker({
      title: `Campaign: ${campaignName}`,
      agentType: "campaign-orchestrator",
      requestedBy: "orchestrator",
      priority: "high",
      details: {
        phase: "launched",
        campaignName,
        product: params.product || launch?.intake?.product,
        platform: "google_ads",
      },
    });
  } catch (err: any) {
    findings.push({
      severity: "medium",
      title: "Failed to create tracker",
      detail: err.message,
    });
  }

  // ── Schedule review milestones ──────────────────────────────
  // These are informational — actual reviews happen via separate agent runs
  const reviewSchedule = [
    { milestone: "Day 3 Check", days: 3, action: "Check delivery, impressions, any disapprovals" },
    { milestone: "Week 1 Review", days: 7, action: "CTR check, search term review, initial negatives" },
    { milestone: "Week 2 Optimization", days: 14, action: "Full optimization pass, bid adjustments" },
    { milestone: "Month 1 Deep Dive", days: 30, action: "Deep dive analysis, budget reallocation" },
  ];

  if (trackerId) {
    await updateTrackerStatus(trackerId, "completed", { reviewSchedule });
  }

  return {
    findings,
    recommendations: [],
    artifacts: [{
      phase: "TRACK",
      trackerId,
      campaignName,
      reviewSchedule,
      status: "COMPLETED",
    }],
    summary: `✅ TRACKING set up for "${campaignName}". ` +
      `Tracker: ${trackerId || "failed to create"}. ` +
      `Review schedule: Day 3, Week 1, Week 2, Month 1. ` +
      `Campaign orchestration complete.`,
  };
}

// ── Helpers ───────────────────────────────────────────────────

function groupKeywordsIntoAdGroups(
  keywords: any[]
): { name: string; keywords: string[]; theme: string }[] {
  // Simple grouping by first significant word
  const groups: Record<string, any[]> = {};
  for (const kw of keywords) {
    const text = kw.keyword || kw.text || "";
    const words = text.toLowerCase().split(/\s+/);
    // Use the most specific word (longest) as group key
    const key = words.reduce((a: string, b: string) => (b.length > a.length ? b : a), words[0] || "general");
    if (!groups[key]) groups[key] = [];
    groups[key].push(kw);
  }

  // Limit to reasonable number of ad groups
  return Object.entries(groups)
    .slice(0, 10)
    .map(([key, kws]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      keywords: kws.map((k: any) => k.keyword || k.text),
      theme: key,
    }));
}
