import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-client";
import { KB } from "@/lib/knowledge-loader";
import { computeConfidence, estimateTokenCost, type ConfidenceScore } from "@/lib/safety";
import type { AgentHandler, AgentOutput, AgentInput, Finding, AgentRecommendation } from "./types";

const execFileAsync = promisify(execFile);
const PYTHON = `${process.env.HOME}/.venv/bin/python3`;
const SCRIPTS = path.join(process.cwd(), "scripts");

interface DeepDiveInput {
  campaign_name?: string;
  campaign_id?: string;
  platform?: string; // google_ads, linkedin, stackadapt, reddit
  days?: number;
}

export const campaignDeepDive: AgentHandler = {
  slug: "campaign-deep-dive",

  async run(input: AgentInput): Promise<AgentOutput> {
    const params = { ...(input.context || {}), ...(input.config || {}) } as DeepDiveInput;
    const days = params.days || 30;
    const findings: Finding[] = [];
    const recommendations: AgentRecommendation[] = [];

    // ── Find campaign in DB ───────────────────────────────────
    let campaign: any = null;
    if (params.campaign_id) {
      campaign = await prisma.campaign.findUnique({ where: { id: params.campaign_id } });
    } else if (params.campaign_name) {
      campaign = await prisma.campaign.findFirst({
        where: { name: { contains: params.campaign_name, mode: "insensitive" } },
      });
    }

    if (!campaign) {
      return {
        findings: [{ severity: "critical", title: "Campaign not found", detail: `No campaign matching "${params.campaign_name || params.campaign_id}" in DB.` }],
        recommendations: [],
        summary: "❌ Campaign not found in DB.",
      };
    }

    const platform = params.platform || campaign.platform || "google_ads";

    // ── Pull fresh data from API ──────────────────────────────
    // SAFETY: Only real API data. If API fails, use DB data with warning.
    let apiData: any = null;
    let dataSource = "database";

    try {
      if (platform === "google_ads" && campaign.platformId) {
        apiData = await fetchGoogleAdsData(campaign.platformId, days);
        dataSource = "Google Ads API (live)";
      } else if (platform === "linkedin" && campaign.platformId) {
        apiData = await fetchLinkedInData(campaign.platformId, days);
        dataSource = "LinkedIn API (live)";
      } else if (platform === "stackadapt" && campaign.platformId) {
        apiData = await fetchStackAdaptData(campaign.platformId, days);
        dataSource = "StackAdapt API (live)";
      } else if (platform === "reddit" && campaign.platformId) {
        apiData = await fetchRedditData(campaign.platformId, days);
        dataSource = "Reddit API (live)";
      }
    } catch (err: any) {
      findings.push({
        severity: "medium",
        title: `API fetch failed — using DB data only`,
        detail: `Could not pull fresh data from ${platform}: ${err.message}. Analysis based on last synced DB data.`,
      });
    }

    // ── Build performance data ────────────────────────────────
    const perfData = apiData || {
      spend: campaign.spend || 0,
      impressions: campaign.impressions || 0,
      clicks: campaign.clicks || 0,
      conversions: campaign.conversions || 0,
      ctr: campaign.impressions ? ((campaign.clicks || 0) / campaign.impressions * 100) : 0,
      cpc: campaign.clicks ? ((campaign.spend || 0) / campaign.clicks) : 0,
      cpa: campaign.conversions ? ((campaign.spend || 0) / campaign.conversions) : 0,
      searchTerms: apiData?.searchTerms || [],
      adGroupBreakdown: apiData?.adGroupBreakdown || [],
      geoBreakdown: apiData?.geoBreakdown || [],
      deviceBreakdown: apiData?.deviceBreakdown || [],
    };

    // ── Pull account averages for benchmarking ────────────────
    const accountAvg = await getAccountAverages(platform);
    const benchmarks = KB.channelBenchmarks();

    // ── Programmatic analysis ─────────────────────────────────
    // CTR analysis
    if (perfData.impressions > 1000 && perfData.ctr < 0.5) {
      findings.push({
        severity: "high",
        title: `CTR critically low: ${perfData.ctr.toFixed(2)}%`,
        detail: `Account average: ${accountAvg.avgCtr.toFixed(2)}%. Ad copy or targeting likely needs work.`,
        campaigns: [campaign.name],
      });
    } else if (perfData.impressions > 1000 && perfData.ctr < accountAvg.avgCtr * 0.5) {
      findings.push({
        severity: "medium",
        title: `CTR below account average: ${perfData.ctr.toFixed(2)}% vs ${accountAvg.avgCtr.toFixed(2)}%`,
        detail: "Campaign underperforming relative to other campaigns on same platform.",
        campaigns: [campaign.name],
      });
    }

    // Spend with no conversions
    if (perfData.spend > 300 && perfData.conversions === 0) {
      findings.push({
        severity: "critical",
        title: `$${perfData.spend.toFixed(2)} spent with 0 conversions`,
        detail: "Significant spend with no conversions. Check: conversion tracking, landing page, targeting quality.",
        campaigns: [campaign.name],
      });
      recommendations.push({
        type: "pause",
        severity: "critical",
        target: campaign.name,
        targetId: campaign.id,
        action: `Consider pausing "${campaign.name}" — $${perfData.spend.toFixed(2)} with 0 conversions`,
        rationale: "Zero conversions with significant spend suggests fundamental issues.",
        impact: `Save $${perfData.spend.toFixed(2)}/${days} days if paused`,
      });
    }

    // Search term waste analysis (Google only)
    if (perfData.searchTerms?.length > 0) {
      const wasteTerms = perfData.searchTerms.filter(
        (t: any) => t.spend > 50 && t.conversions === 0
      );
      if (wasteTerms.length > 0) {
        const wasteAmount = wasteTerms.reduce((s: number, t: any) => s + t.spend, 0);
        findings.push({
          severity: "high",
          title: `$${wasteAmount.toFixed(2)} wasted on ${wasteTerms.length} non-converting search terms`,
          detail: wasteTerms.slice(0, 10).map((t: any) => `"${t.term}" — $${t.spend.toFixed(2)}`).join("\n"),
          campaigns: [campaign.name],
        });
        for (const t of wasteTerms.slice(0, 5)) {
          recommendations.push({
            type: "add-negative",
            severity: "high",
            target: campaign.name,
            targetId: campaign.id,
            action: `Add negative keyword: "${t.term}" ($${t.spend.toFixed(2)} spent, 0 conversions)`,
            rationale: `Search term "${t.term}" has spent $${t.spend.toFixed(2)} without converting.`,
            impact: `Save ~$${t.spend.toFixed(2)} over ${days} days`,
          });
        }
      }
    }

    // ── AI synthesis (analysis narrative only, not data) ──────
    let aiSynthesis = "";
    let inputCharCount = 0;
    let outputCharCount = 0;

    try {
      const analysisPrompt = `Synthesize this campaign performance data into actionable insights. Do NOT fabricate any numbers — use only what's provided.

Campaign: ${campaign.name}
Platform: ${platform}
Period: Last ${days} days
Data source: ${dataSource}

Performance:
- Spend: $${perfData.spend?.toFixed(2)}
- Impressions: ${perfData.impressions?.toLocaleString()}
- Clicks: ${perfData.clicks?.toLocaleString()}
- CTR: ${perfData.ctr?.toFixed(2)}%
- CPC: $${perfData.cpc?.toFixed(2)}
- Conversions: ${perfData.conversions}
- CPA: ${perfData.cpa ? `$${perfData.cpa.toFixed(2)}` : "N/A"}

Account Averages:
- Avg CTR: ${accountAvg.avgCtr.toFixed(2)}%
- Avg CPC: $${accountAvg.avgCpc.toFixed(2)}
- Avg CPA: ${accountAvg.avgCpa > 0 ? `$${accountAvg.avgCpa.toFixed(2)}` : "N/A"}

${perfData.adGroupBreakdown?.length ? `Ad Group Breakdown:\n${JSON.stringify(perfData.adGroupBreakdown.slice(0, 10), null, 2)}` : ""}
${perfData.geoBreakdown?.length ? `Geo Breakdown:\n${JSON.stringify(perfData.geoBreakdown.slice(0, 10), null, 2)}` : ""}

Provide a concise 3-5 bullet analysis with specific recommendations. Reference exact numbers from the data above.`;

      inputCharCount = analysisPrompt.length;
      const response = await createCompletion({
        messages: [
          { role: "system", content: "You are a campaign analyst. Be concise and specific. Only reference numbers from the data provided — never fabricate metrics." },
          { role: "user", content: analysisPrompt },
        ],
        maxTokens: 1024,
        temperature: 0.2,
      });
      outputCharCount = response.length;
      aiSynthesis = response;
    } catch {
      aiSynthesis = "AI synthesis unavailable — see programmatic findings above.";
    }

    // ── Confidence ────────────────────────────────────────────
    const confidence: ConfidenceScore = computeConfidence({
      hasApiData: apiData !== null,
      hasKnowledgeBase: Boolean(benchmarks),
      hasAllRequiredFields: Boolean(campaign),
      validationsPassed: true,
    });

    const cost = estimateTokenCost(inputCharCount, outputCharCount);

    return {
      findings,
      recommendations,
      artifacts: [{
        campaign: { name: campaign.name, platform, id: campaign.id, platformId: campaign.platformId },
        performance: perfData,
        accountAverages: accountAvg,
        analysis: aiSynthesis,
        dataSource,
        period: `Last ${days} days`,
        _meta: { confidence, cost },
      }],
      summary: `📊 ${campaign.name} (${platform}, ${days}d): ` +
        `$${perfData.spend?.toFixed(2)} spend, ${perfData.impressions?.toLocaleString()} imp, ` +
        `${perfData.ctr?.toFixed(2)}% CTR, ${perfData.conversions} conv. ` +
        `${findings.length} findings, ${recommendations.length} recommendations. ` +
        `Data: ${dataSource}. Confidence: ${confidence.level}.`,
    };
  },
};

// ── Data fetching helpers ───────────────────────────────────

async function fetchGoogleAdsData(campaignId: string, days: number): Promise<any> {
  const script = `${process.cwd()}/scripts/sync_local.py`;
  const { stdout } = await execFileAsync(PYTHON, [
    script, "--campaign-id", campaignId, "--days", String(days), "--format", "json",
  ], { timeout: 60_000 });
  return JSON.parse(stdout);
}

async function fetchLinkedInData(campaignId: string, days: number): Promise<any> {
  const script = `${process.cwd()}/scripts/sync_linkedin.py`;
  const { stdout } = await execFileAsync(PYTHON, [
    script, "--campaign-id", campaignId, "--days", String(days), "--format", "json",
  ], { timeout: 60_000 });
  return JSON.parse(stdout);
}

async function fetchStackAdaptData(campaignId: string, days: number): Promise<any> {
  // StackAdapt uses GraphQL — handled in sync script
  const script = `${process.cwd()}/scripts/sync_local.py`;
  const { stdout } = await execFileAsync(PYTHON, [
    script, "--platform", "stackadapt", "--campaign-id", campaignId, "--days", String(days), "--format", "json",
  ], { timeout: 60_000 });
  return JSON.parse(stdout);
}

async function fetchRedditData(campaignId: string, days: number): Promise<any> {
  // Reddit uses REST API — query via platform connector
  const script = path.join(SCRIPTS, "query_metrics.py");
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const { stdout } = await execFileAsync(PYTHON, [
    script, "--platform", "reddit", "--from", from.toISOString().slice(0, 10), "--to", now.toISOString().slice(0, 10),
  ], { timeout: 60_000 });
  const data = JSON.parse(stdout);
  const campaign = (data.campaigns || []).find((c: any) => c.campaignId === campaignId);
  return campaign || data;
}

async function getAccountAverages(platform: string): Promise<{
  avgCtr: number; avgCpc: number; avgCpa: number;
}> {
  const campaigns = await prisma.campaign.findMany({
    where: {
      platform,
      status: { in: ["enabled", "active", "live"] },
      impressions: { gt: 1000 },
    },
  });

  if (campaigns.length === 0) {
    return { avgCtr: 0, avgCpc: 0, avgCpa: 0 };
  }

  const totalImpressions = campaigns.reduce((s, c) => s + (c.impressions || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0);
  const totalSpend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
  const totalConversions = campaigns.reduce((s, c) => s + (c.conversions || 0), 0);

  return {
    avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    avgCpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
  };
}
