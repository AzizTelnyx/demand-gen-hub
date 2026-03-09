import { createCompletion } from "@/lib/ai-client";
import { prisma } from "@/lib/prisma";
import { computeConfidence, type ConfidenceScore } from "@/lib/safety";
import type { AgentHandler, AgentOutput, AgentInput, Finding, AgentRecommendation } from "./types";

interface KeywordInput {
  product?: string;
  competitors?: string[];
  seed_keywords?: string[];
  location?: string;
  regions?: string[];
}

interface KeywordEntry {
  keyword: string;
  matchTypes: string[];
  intent: "high" | "medium" | "low";
  estVolume: number;
  estCPC: number;
  overlap: string | null;
}

function classifyIntent(kw: string): "high" | "medium" | "low" {
  const l = kw.toLowerCase();
  // High intent patterns
  if (/\b(alternative|vs\b|versus|switch from|migrate from|replace|pricing|cost|buy|best .+ for)\b/.test(l)) return "high";
  if (/\b(competitor|comparison|compare)\b/.test(l)) return "high";
  // Low intent patterns
  if (/\b(tutorial|how to use|guide|what is|definition|learn|course|training)\b/.test(l)) return "low";
  // Medium: everything else (features, reviews, product-category)
  return "medium";
}

export const keywordResearcher: AgentHandler = {
  slug: "keyword-researcher",

  async run(input: AgentInput): Promise<AgentOutput> {
    const params = { ...(input.context || {}), ...(input.config || {}) } as KeywordInput;
    const product = params.product || "Voice AI";
    const location = params.location || "US";
    const competitors = params.competitors || [];
    const findings: Finding[] = [];
    const recommendations: AgentRecommendation[] = [];

    // Build seed keywords
    let seedKeywords = params.seed_keywords || [];
    if (seedKeywords.length === 0) {
      seedKeywords = [
        product.toLowerCase(),
        `${product.toLowerCase()} api`,
        `${product.toLowerCase()} provider`,
        `${product.toLowerCase()} platform`,
      ];
      for (const comp of competitors) {
        seedKeywords.push(`${comp.toLowerCase()} alternative`);
        seedKeywords.push(`${comp.toLowerCase()} vs telnyx`);
      }
    }

    // Use AI to generate expanded keyword list with volume/CPC estimates
    let aiKeywords: KeywordEntry[] = [];
    try {
      const response = await createCompletion({
        messages: [
          {
            role: "system",
            content: `You are a keyword research expert for B2B SaaS / cloud communications. Generate keyword research data as JSON.

IMPORTANT: Volume and CPC are ESTIMATES based on your knowledge of the market. Label them as estimates.

For each keyword, provide realistic estimates:
- B2B tech keywords typically have 100-10,000 monthly searches
- Competitor keywords ("X alternative") typically 500-5,000
- Long-tail keywords 50-500
- CPCs for B2B tech: $5-25 depending on competition
- High-intent keywords have higher CPCs

Return ONLY valid JSON array:
[
  { "keyword": "example keyword", "estVolume": 1200, "estCPC": 12.50 },
  ...
]

Generate 15-25 keywords covering:
- Competitor displacement (X alternative, X vs Y, switch from X)
- Product/solution terms (product API, product platform, product provider)
- Feature-specific (product + key feature)
- Use-case specific (product for Y)
- Category terms (cloud communications, CPaaS)`,
          },
          {
            role: "user",
            content: `Product: ${product}\nCompetitors: ${competitors.join(", ") || "general market"}\nLocation: ${location}\nSeed keywords: ${seedKeywords.join(", ")}`,
          },
        ],
        maxTokens: 2048,
        temperature: 0.4,
      });

      const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      aiKeywords = (Array.isArray(parsed) ? parsed : parsed.keywords || []).map((kw: any) => ({
        keyword: kw.keyword,
        matchTypes: ["exact", "phrase"],
        intent: classifyIntent(kw.keyword),
        estVolume: kw.estVolume || kw.volume || 500,
        estCPC: kw.estCPC || kw.cpc || 10,
        overlap: null,
      }));
    } catch (err: any) {
      return {
        findings: [{ severity: "critical", title: "Keyword generation failed", detail: err.message }],
        recommendations: [],
        summary: `❌ Failed to generate keywords: ${err.message}`,
      };
    }

    // Check for overlaps with existing campaigns
    try {
      const campaigns = await prisma.campaign.findMany({
        where: { status: { in: ["enabled", "active", "live"] } },
        select: { name: true, id: true },
      });

      for (const kw of aiKeywords) {
        const kwWords = kw.keyword.toLowerCase().split(/\s+/);
        for (const c of campaigns) {
          const cName = (c.name || "").toLowerCase();
          const matchCount = kwWords.filter(w => w.length > 3 && cName.includes(w)).length;
          if (matchCount >= 2) {
            kw.overlap = c.name;
            break;
          }
        }
      }

      const overlaps = aiKeywords.filter(k => k.overlap);
      if (overlaps.length > 0) {
        findings.push({
          severity: "medium",
          title: `${overlaps.length} keywords overlap with existing campaigns`,
          detail: overlaps.map(k => `"${k.keyword}" → ${k.overlap}`).join("\n"),
        });
      }
    } catch {
      findings.push({
        severity: "low",
        title: "Could not check campaign overlaps",
        detail: "DB query failed — overlap checking skipped.",
      });
    }

    // Sort: high intent first, then by volume
    const intentOrder = { high: 0, medium: 1, low: 2 };
    aiKeywords.sort((a, b) => {
      const intentDiff = intentOrder[a.intent] - intentOrder[b.intent];
      if (intentDiff !== 0) return intentDiff;
      return b.estVolume - a.estVolume;
    });

    // Build summary
    const highIntent = aiKeywords.filter(k => k.intent === "high");
    const totalVolume = aiKeywords.reduce((s, k) => s + k.estVolume, 0);
    const avgCPC = aiKeywords.length > 0
      ? aiKeywords.reduce((s, k) => s + k.estCPC, 0) / aiKeywords.length
      : 0;

    const artifact = {
      type: "keyword_research",
      location,
      keywords: aiKeywords,
      summary: {
        totalKeywords: aiKeywords.length,
        highIntent: highIntent.length,
        mediumIntent: aiKeywords.filter(k => k.intent === "medium").length,
        lowIntent: aiKeywords.filter(k => k.intent === "low").length,
        totalVolume,
        avgCPC: Math.round(avgCPC * 100) / 100,
      },
      _meta: {
        source: "AI-estimated (no Keyword Planner API access)",
        disclaimer: "Volume and CPC are AI estimates, not live API data",
      },
    };

    const confidence: ConfidenceScore = computeConfidence({
      hasApiData: false,
      hasKnowledgeBase: true,
      hasAllRequiredFields: true,
      validationsPassed: true,
      customFlags: [
        { condition: false, ifFalse: "Using AI estimates — no Google Ads Keyword Planner API" },
      ],
    });

    return {
      findings,
      recommendations,
      artifacts: [artifact],
      summary: `🔍 ${aiKeywords.length} keywords researched for ${product} (${location}). ` +
        `${highIntent.length} high-intent, est. ${totalVolume.toLocaleString()} total monthly volume, $${avgCPC.toFixed(2)} avg CPC. ` +
        `⚠️ Volumes/CPCs are AI estimates. Confidence: ${confidence.level}.`,
    };
  },
};
