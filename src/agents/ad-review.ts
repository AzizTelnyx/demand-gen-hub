import { createCompletion } from "@/lib/ai-client";
import { prisma } from "@/lib/prisma";
import { KB, loadKnowledgeBundle } from "@/lib/knowledge-loader";
import {
  validateCharLimit, validateNoEmDash, computeConfidence,
  aggregateValidations, estimateTokenCost,
  type ConfidenceScore, type ValidationResult,
} from "@/lib/safety";
import type { AgentHandler, AgentOutput, AgentInput, Finding, AgentRecommendation } from "./types";

interface AdReviewInput {
  campaign_name?: string;
  platform?: string;
  product?: string;
  /** Direct ad copy to review (if not fetching from API) */
  ad_copy?: {
    headlines?: string[];
    descriptions?: string[];
  };
}

const CHAR_LIMITS: Record<string, { headline: number; description: number }> = {
  google_ads: { headline: 30, description: 90 },
  google_search: { headline: 30, description: 90 },
  linkedin: { headline: 200, description: 600 },
  stackadapt: { headline: 90, description: 150 },
  reddit: { headline: 150, description: 300 },
};

export const adReview: AgentHandler = {
  slug: "ad-review",

  async run(input: AgentInput): Promise<AgentOutput> {
    const params = { ...(input.context || {}), ...(input.config || {}) } as AdReviewInput;
    const findings: Finding[] = [];
    const recommendations: AgentRecommendation[] = [];

    // ── Get ad copy to review ─────────────────────────────────
    let adCopy = params.ad_copy;
    let platform = params.platform || "google_ads";
    let product = params.product || "";
    let campaignName = params.campaign_name || "";

    // If no direct copy provided, try to find it by campaign name in DB
    if (!adCopy && campaignName) {
      const campaign = await prisma.campaign.findFirst({
        where: { name: { contains: campaignName, mode: "insensitive" } },
      });
      if (campaign) {
        platform = campaign.platform || platform;
        // Try to get ad copy from AdCopy table
        const ads = await prisma.adCopy.findMany({
          where: { campaignId: campaign.id },
        });
        if (ads.length > 0) {
          const headlines: string[] = [];
          const descriptions: string[] = [];
          for (const ad of ads) {
            if (ad.headlines) {
              try { headlines.push(...JSON.parse(ad.headlines)); } catch { headlines.push(ad.headlines); }
            }
            if (ad.descriptions) {
              try { descriptions.push(...JSON.parse(ad.descriptions)); } catch { descriptions.push(ad.descriptions); }
            }
          }
          adCopy = { headlines, descriptions };
        }
      }
    }

    if (!adCopy || (!adCopy.headlines?.length && !adCopy.descriptions?.length)) {
      return {
        findings: [{
          severity: "critical",
          title: "No ad copy to review",
          detail: "Provide ad_copy directly or a campaign_name that has ads in the DB.",
        }],
        recommendations: [],
        summary: "❌ No ad copy provided or found for review.",
      };
    }

    // ── PROGRAMMATIC validation first ─────────────────────────
    const limits = CHAR_LIMITS[platform] || CHAR_LIMITS.google_ads;
    const allValidations: ValidationResult[] = [];
    const programmaticIssues: string[] = [];

    for (const h of adCopy.headlines || []) {
      const charVal = validateCharLimit(h, limits.headline, "Headline");
      allValidations.push(charVal);
      const dashVal = validateNoEmDash(h, "Headline");
      allValidations.push(dashVal);
    }
    for (const d of adCopy.descriptions || []) {
      const charVal = validateCharLimit(d, limits.description, "Description");
      allValidations.push(charVal);
      const dashVal = validateNoEmDash(d, "Description");
      allValidations.push(dashVal);
    }

    // Check for duplicate headlines
    const headlineSet = new Set<string>();
    for (const h of adCopy.headlines || []) {
      const normalized = h.toLowerCase().trim();
      if (headlineSet.has(normalized)) {
        programmaticIssues.push(`Duplicate headline: "${h}"`);
      }
      headlineSet.add(normalized);
    }

    const aggregated = aggregateValidations(...allValidations);
    if (!aggregated.valid) {
      findings.push({
        severity: "high",
        title: `${aggregated.errors.length} programmatic violations`,
        detail: aggregated.errors.join("\n"),
      });
    }
    if (programmaticIssues.length > 0) {
      findings.push({
        severity: "medium",
        title: `${programmaticIssues.length} duplicate/structural issues`,
        detail: programmaticIssues.join("\n"),
      });
    }

    // ── Load knowledge for AI review ──────────────────────────
    const brandKB = KB.brand();
    const adCopyRulesKB = KB.adCopyRules();
    const rsaKB = platform.includes("google") ? KB.rsaBestPractices() : "";
    const productKB = product ? KB.product(product) : "";
    const kbLoaded = Boolean(brandKB);

    if (!brandKB) {
      findings.push({
        severity: "medium",
        title: "NEEDS REVIEW: Brand messaging KB not loaded",
        detail: "Cannot verify messaging pillar alignment without brand KB.",
      });
    }

    // ── AI review for messaging quality ───────────────────────
    const knowledgeContext = [
      brandKB && `## Brand Messaging\n${brandKB}`,
      adCopyRulesKB && `## Ad Copy Rules\n${adCopyRulesKB}`,
      rsaKB && `## RSA Best Practices\n${rsaKB}`,
      productKB && `## Product Messaging\n${productKB}`,
    ].filter(Boolean).join("\n\n---\n\n");

    const prompt = `You are reviewing Telnyx ad copy for quality and brand alignment.

${knowledgeContext}

## Ad Copy to Review (${platform})
### Headlines
${(adCopy.headlines || []).map((h, i) => `${i + 1}. "${h}" (${h.length} chars)`).join("\n")}

### Descriptions
${(adCopy.descriptions || []).map((d, i) => `${i + 1}. "${d}" (${d.length} chars)`).join("\n")}

## Review Instructions
For each issue found, provide in this EXACT format:
{
  "reviews": [
    {
      "type": "headline|description",
      "index": 0,
      "current": "the current text",
      "issue": "what's wrong",
      "pillarMapping": "which messaging pillar this maps to, or 'NONE' if it doesn't map",
      "replacement": "exact replacement text",
      "replacementChars": 25,
      "issueType": "pillar-gap|weak-cta|generic|claim-unverified|tone-mismatch|missing-differentiator"
    }
  ],
  "pillarCoverage": {
    "infrastructure": 3,
    "ai": 2,
    "pricing": 1,
    "reliability": 0,
    "missing": ["reliability"]
  },
  "overallScore": 7
}

CRITICAL RULES:
- Every replacement must ALSO respect character limits (headline ≤${limits.headline}, description ≤${limits.description})
- If a claim cannot be verified in the knowledge base, flag as "claim-unverified"
- Map EVERY headline/description to a messaging pillar
- Flag any pillar with 0 coverage as a gap`;

    let aiReview: any = null;
    let inputCharCount = prompt.length;
    let outputCharCount = 0;

    try {
      const response = await createCompletion({
        messages: [
          { role: "system", content: "You are a senior ad copy reviewer. Return ONLY valid JSON." },
          { role: "user", content: prompt },
        ],
        maxTokens: 4096,
        temperature: 0.2,
      });
      outputCharCount = response.length;

      const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      aiReview = JSON.parse(cleaned);
    } catch (err: any) {
      findings.push({
        severity: "medium",
        title: "AI review failed — programmatic results only",
        detail: err.message,
      });
    }

    // ── Process AI review with PROGRAMMATIC validation ────────
    if (aiReview?.reviews) {
      for (const review of aiReview.reviews) {
        // Validate the AI's replacement text programmatically
        const maxChars = review.type === "headline" ? limits.headline : limits.description;
        if (review.replacement) {
          const replVal = validateCharLimit(review.replacement, maxChars, "AI replacement");
          if (!replVal.valid) {
            // AI's replacement is over limit — flag but don't use it
            review.replacement = `[AI REPLACEMENT OVER LIMIT: ${review.replacement.length}/${maxChars}] ${review.replacement}`;
            review.replacementValid = false;
          } else {
            review.replacementValid = true;
          }
        }

        recommendations.push({
          type: "copy-change",
          severity: review.issueType === "claim-unverified" ? "high" : "medium",
          target: campaignName || "Ad copy",
          action: `CURRENT: "${review.current}"\nISSUE: ${review.issue}\nUSE THIS: "${review.replacement}"${!review.replacementValid ? " [⚠️ OVER LIMIT — needs manual edit]" : ""}`,
          rationale: `Pillar: ${review.pillarMapping} | Issue: ${review.issueType}`,
        });
      }

      // Pillar coverage findings
      if (aiReview.pillarCoverage?.missing?.length > 0) {
        findings.push({
          severity: "medium",
          title: `Missing messaging pillars: ${aiReview.pillarCoverage.missing.join(", ")}`,
          detail: "Ad copy should cover all messaging pillars for balanced positioning.",
        });
      }
    }

    // ── Confidence scoring ────────────────────────────────────
    const confidence: ConfidenceScore = computeConfidence({
      hasApiData: Boolean(campaignName && adCopy),
      hasKnowledgeBase: kbLoaded,
      hasAllRequiredFields: (adCopy.headlines?.length || 0) > 0,
      validationsPassed: aggregated.valid,
      customFlags: [
        { condition: Boolean(aiReview), ifFalse: "AI review failed, only programmatic checks done" },
      ],
    });

    const cost = estimateTokenCost(inputCharCount, outputCharCount);

    return {
      findings,
      recommendations,
      artifacts: aiReview ? [{ ...aiReview, _meta: { confidence, cost } }] : [],
      summary: `Reviewed ${(adCopy.headlines || []).length} headlines + ${(adCopy.descriptions || []).length} descriptions. ` +
        `${aggregated.errors.length} format violations, ${recommendations.length} content recommendations. ` +
        `Score: ${aiReview?.overallScore || "N/A"}/10. Confidence: ${confidence.level}. ` +
        `Est. cost: $${cost.estimatedCostUsd}`,
    };
  },
};
