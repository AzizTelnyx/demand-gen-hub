import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-client";
import type { AgentHandler, AgentOutput, Finding, AgentRecommendation, AgentInput } from "./types";

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
async function fetchLiveMetrics(): Promise<LiveCampaignMetrics[]> {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const dateTo = now.toISOString().slice(0, 10);
  const dateFrom = from.toISOString().slice(0, 10);

  const { stdout } = await execFileAsync(PYTHON, [
    path.join(SCRIPTS, "query_metrics.py"),
    "--platform", "all",
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

// Fetch current ad creatives from the ads API (internal)
async function fetchAdsForCampaigns(campaigns: { name: string; platform: string }[]): Promise<Record<string, any[]>> {
  const adsByCampaign: Record<string, any[]> = {};

  // Group campaigns by platform
  const byPlatform = new Map<string, string[]>();
  for (const c of campaigns) {
    const p = c.platform;
    if (!byPlatform.has(p)) byPlatform.set(p, []);
    byPlatform.get(p)!.push(c.name);
  }

  // Fetch ads via internal API for each platform
  for (const [platform, names] of byPlatform) {
    // Use a broad search term from campaign names
    const keywords = extractKeywords(names);
    for (const keyword of keywords.slice(0, 5)) {
      try {
        const res = await fetch("http://127.0.0.1:3000/api/ads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cookie": `dg-hub-session=authenticated`,
          },
          body: JSON.stringify({
            query: keyword,
            platform: platform === "google_ads" ? "google" : platform === "linkedin" ? "linkedin" : platform === "reddit" ? "reddit" : "stackadapt",
            status: "active",
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        for (const ad of (data.ads || [])) {
          const campName = ad.campaignName;
          if (!adsByCampaign[campName]) adsByCampaign[campName] = [];
          adsByCampaign[campName].push(ad);
        }
      } catch {}
    }
  }

  return adsByCampaign;
}

function extractKeywords(campaignNames: string[]): string[] {
  // Extract unique meaningful words from campaign names
  const stopWords = new Set([
    "202501", "202502", "202503", "202504", "202505", "202506", "202507", "202508", "202509", "202510", "202511", "202512",
    "tofu", "mofu", "bofu", "global", "amer", "emea", "apac", "na", "sa", "da", "va", "rt", "wv", "si",
    "gdn", "yt", "uk", "us", "from", "hs", "the", "and", "for", "with",
  ]);
  const words = new Map<string, number>();
  for (const name of campaignNames) {
    for (const word of name.split(/[\s\-_]+/)) {
      const w = word.toLowerCase();
      if (w.length < 3 || stopWords.has(w)) continue;
      words.set(w, (words.get(w) || 0) + 1);
    }
  }
  // Return most common keywords
  return [...words.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
}

export const creative: AgentHandler = {
  slug: "creative",

  async run(input: AgentInput): Promise<AgentOutput> {
    const findings: Finding[] = [];
    const recommendations: AgentRecommendation[] = [];

    // Get active campaigns (metadata from DB)
    const campaigns = await prisma.campaign.findMany({
      where: { status: { in: ["enabled", "active", "live"] } },
    });

    if (campaigns.length === 0) {
      return { findings: [], recommendations: [], summary: "No active campaigns found." };
    }

    // Fetch LIVE metrics from APIs
    const liveMetrics = await fetchLiveMetrics();
    const metricsMap = new Map<string, LiveCampaignMetrics>();
    for (const m of liveMetrics) {
      metricsMap.set(m.name.toLowerCase().trim(), m);
    }

    // Merge DB metadata + live metrics, sort by live spend desc
    const mergedCampaigns = campaigns.map(c => {
      const live = metricsMap.get(c.name.toLowerCase().trim());
      return {
        ...c,
        spend: live?.spend ?? 0,
        impressions: live?.impressions ?? 0,
        clicks: live?.clicks ?? 0,
        conversions: live?.conversions ?? 0,
        liveCtr: live?.ctr ?? 0,
        liveAvgCpc: live?.avg_cpc ?? 0,
      };
    }).sort((a, b) => b.spend - a.spend);

    // Focus on top spending campaigns (most impactful to optimize)
    const topCampaigns = mergedCampaigns.slice(0, 30);

    // Fetch ad creatives
    const adsByCampaign = await fetchAdsForCampaigns(topCampaigns);

    // Build context for AI analysis
    const campaignSummaries = topCampaigns.map(c => {
      const ads = adsByCampaign[c.name] || [];
      const adDetails = ads.slice(0, 5).map(a => ({
        type: a.adType,
        headlines: a.headlines || [],
        descriptions: (a.descriptions || []).map((d: string) => d.slice(0, 200)),
        images: (a.images || []).length,
      }));

      return {
        name: c.name,
        platform: c.platform,
        funnelStage: c.funnelStage || "unknown",
        region: c.region || "unknown",
        spend: c.spend,
        impressions: c.impressions,
        clicks: c.clicks,
        conversions: c.conversions,
        ctr: c.impressions ? (c.clicks / c.impressions * 100).toFixed(2) + "%" : "N/A",
        cpc: c.clicks ? ("$" + (c.spend / c.clicks).toFixed(2)) : "N/A",
        adCount: ads.length,
        ads: adDetails,
      };
    });

    // Separate campaigns with and without ad data
    const withAds = campaignSummaries.filter(c => c.adCount > 0);
    const withoutAds = campaignSummaries.filter(c => c.adCount === 0);

    const prompt = `You are a demand generation creative strategist analyzing ad campaigns for Telnyx, a cloud communications platform (Voice API, SMS API, SIP Trunking, IoT, AI voice agents).

Analyze these active campaigns and their ad creatives. Focus on actionable creative recommendations.

## Campaigns with Ad Data (${withAds.length})
${JSON.stringify(withAds, null, 2)}

## Campaigns without Ad Data (${withoutAds.length} — couldn't fetch creatives)
${JSON.stringify(withoutAds.map(c => ({ name: c.name, platform: c.platform, funnelStage: c.funnelStage, spend: c.spend, ctr: c.ctr, cpc: c.cpc })), null, 2)}

Provide your analysis as JSON with this exact structure:
{
  "findings": [
    {
      "severity": "low|medium|high|critical",
      "title": "short title",
      "detail": "explanation",
      "campaigns": ["campaign names affected"]
    }
  ],
  "recommendations": [
    {
      "type": "copy-refresh|ab-test|new-variant|messaging-gap|platform-optimization",
      "severity": "low|medium|high|critical",
      "target": "campaign name",
      "action": "specific action to take",
      "rationale": "why this matters",
      "impact": "expected impact",
      "suggestedCopy": {
        "headlines": ["suggested headline 1", "suggested headline 2"],
        "descriptions": ["suggested description"],
        "cta": "suggested CTA"
      }
    }
  ],
  "summary": "1-2 sentence overall assessment"
}

Rules:
- Be specific — give exact copy suggestions, not vague advice
- Focus on highest-spend campaigns first (most ROI from optimization)
- Flag stale messaging, missing A/B tests, weak CTAs
- Note platform-specific issues (e.g., LinkedIn needs professional tone, Google needs keyword-rich headlines)
- If CTR is low (<0.5%), the creative likely needs work
- Consider funnel stage: TOFU = awareness/education, MOFU = consideration/comparison, BOFU = conversion/demo
- Telnyx differentiators: owns its network (not a reseller), sub-3s latency, competitive pricing vs Twilio, AI-native voice
- Max 10 findings, max 10 recommendations`;

    try {
      const response = await createCompletion({
        messages: [
          { role: "system", content: "You are a senior creative strategist for B2B SaaS advertising. Return ONLY valid JSON, no markdown." },
          { role: "user", content: prompt },
        ],
        maxTokens: 4096,
        temperature: 0.4,
      });

      // Parse AI response
      const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(cleaned);

      // Map findings
      for (const f of (result.findings || [])) {
        findings.push({
          severity: f.severity || "medium",
          title: f.title,
          detail: f.detail,
          campaigns: f.campaigns,
        });
      }

      // Map recommendations
      for (const r of (result.recommendations || [])) {
        recommendations.push({
          type: r.type || "copy-refresh",
          severity: r.severity || "medium",
          target: r.target,
          action: r.action + (r.suggestedCopy ? `\n\nSuggested copy:\n${formatSuggestedCopy(r.suggestedCopy)}` : ""),
          rationale: r.rationale,
          impact: r.impact,
        });
      }

      return {
        findings,
        recommendations,
        artifacts: result.recommendations?.filter((r: any) => r.suggestedCopy).map((r: any) => ({
          type: "copy-suggestion",
          campaign: r.target,
          ...r.suggestedCopy,
        })),
        summary: result.summary || `Analyzed ${withAds.length} campaigns with ad data, ${withoutAds.length} without.`,
      };
    } catch (err: any) {
      // If AI fails, fall back to rule-based analysis
      const lowCtr = campaignSummaries.filter(c => {
        if (!c.impressions || c.impressions < 1000) return false;
        return parseFloat(c.ctr) < 0.5;
      });

      if (lowCtr.length > 0) {
        findings.push({
          severity: "high",
          title: `${lowCtr.length} high-spend campaigns with CTR below 0.5%`,
          detail: "Low click-through rates indicate ad creative needs refreshing.",
          campaigns: lowCtr.map(c => c.name),
        });
        for (const c of lowCtr.slice(0, 5)) {
          recommendations.push({
            type: "copy-refresh",
            severity: "high",
            target: c.name,
            action: `Refresh ad creative for "${c.name}" — CTR at ${c.ctr}`,
            rationale: `Spending $${c.spend.toLocaleString()} with only ${c.ctr} CTR suggests the messaging isn't resonating.`,
            impact: "Improving CTR from 0.5% to 1% would double click volume at same spend",
          });
        }
      }

      const noAds = withoutAds.filter(c => c.spend > 500);
      if (noAds.length > 0) {
        findings.push({
          severity: "medium",
          title: `${noAds.length} spending campaigns with no fetchable ad creative`,
          detail: "Couldn't retrieve ad creatives for review. May need manual audit.",
          campaigns: noAds.map(c => c.name),
        });
      }

      return {
        findings,
        recommendations,
        summary: `Rule-based analysis (AI unavailable: ${err.message}). ${findings.length} issues found.`,
      };
    }
  },
};

function formatSuggestedCopy(copy: { headlines?: string[]; descriptions?: string[]; cta?: string }): string {
  const parts: string[] = [];
  if (copy.headlines?.length) parts.push(`Headlines: ${copy.headlines.join(" | ")}`);
  if (copy.descriptions?.length) parts.push(`Description: ${copy.descriptions[0]}`);
  if (copy.cta) parts.push(`CTA: ${copy.cta}`);
  return parts.join("\n");
}
