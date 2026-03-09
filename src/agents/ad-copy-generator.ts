import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-client";
import { loadKnowledge, loadKnowledgeBundle, KB } from "@/lib/knowledge-loader";
import type { AgentHandler, AgentOutput, AgentInput, Finding, AgentRecommendation } from "./types";

/* ─── Platform specs ─────────────────────────────────── */

interface PlatformSpec {
  headlines: { max: number; count: number };
  descriptions: { max: number; count: number };
  displayPaths?: { max: number; count: number };
  cta?: { max: number };
  tone: string;
}

const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  google_ads: {
    headlines: { max: 30, count: 15 },
    descriptions: { max: 90, count: 4 },
    displayPaths: { max: 15, count: 2 },
    tone: "Direct and transactional. User has high intent. Get to value immediately. Feature-focused works.",
  },
  linkedin: {
    headlines: { max: 200, count: 1 },
    descriptions: { max: 600, count: 1 },
    cta: { max: 20 },
    tone: "Professional but human. Thought leadership angle. Peer-to-peer tone. Balance authority with approachability. Intro text should be 150-300 chars for best engagement.",
  },
  stackadapt: {
    headlines: { max: 55, count: 1 },
    descriptions: { max: 120, count: 1 },
    cta: { max: 10 },
    tone: "Editorial, informative. Blend with publisher content. Educational over promotional. Trustworthy journalist tone.",
  },
  reddit: {
    headlines: { max: 150, count: 1 },
    descriptions: { max: 0, count: 0 }, // Reddit doesn't have descriptions in standard ads
    tone: "Most casual and conversational. Peer-to-peer discussion. Authentic and transparent. Community member, not advertiser.",
  },
};

const FILLER_WORDS = [
  "leading", "best-in-class", "cutting-edge", "innovative", "revolutionary",
  "world-class", "next-generation", "state-of-the-art", "game-changing",
];

/* ─── Knowledge loading by product ───────────────────── */

function getProductKBPaths(product?: string): string[] {
  const paths = [
    "brand/brand-messaging-q1-2026.md",
    "standards/ad-copy-rules.md",
    "standards/b2b-ad-copy-guide.md",
  ];
  const p = (product || "").toLowerCase();
  if (p.includes("voice") || p.includes("vapi")) {
    paths.push("messaging-frameworks/voice-api-framework.md");
  }
  if (p.includes("contact") || p.includes("ccaas")) {
    paths.push("messaging-frameworks/contact-center-framework.md");
  }
  return paths;
}

function getPlatformKBPaths(platform: string): string[] {
  if (platform === "google_ads") return ["standards/google-ads-rsa-best-practices.md"];
  return [];
}

/* ─── Char limit validation ──────────────────────────── */

function validateAndTruncate(text: string, maxLen: number): { text: string; truncated: boolean } {
  // Replace em/en dashes
  let t = text.replace(/[—–]/g, "-");
  // Remove filler words
  for (const filler of FILLER_WORDS) {
    const re = new RegExp(`\\b${filler}\\b`, "gi");
    t = t.replace(re, "").replace(/\s{2,}/g, " ").trim();
  }
  if (t.length <= maxLen) return { text: t, truncated: false };
  return { text: t.substring(0, maxLen), truncated: true };
}

/* ─── Fetch existing ads for dedup context ───────────── */

async function fetchExistingAds(platform: string, product?: string): Promise<any[]> {
  const where: any = {
    platform,
    status: { in: ["active", "enabled", "ENABLED", "Active", "live", "Live"] },
  };
  if (product) {
    where.campaignName = { contains: product, mode: "insensitive" };
  }
  const ads = await prisma.adCreative.findMany({
    where,
    take: 20,
    orderBy: { updatedAt: "desc" },
  });
  return ads.map(a => ({
    campaignName: a.campaignName,
    adGroupName: a.adGroupName,
    headlines: a.headlines ? JSON.parse(a.headlines) : [],
    descriptions: a.descriptions ? JSON.parse(a.descriptions) : [],
  }));
}

/* ─── Main agent ─────────────────────────────────────── */

export const adCopyGenerator: AgentHandler = {
  slug: "ad-copy-generator",

  async run(input: AgentInput): Promise<AgentOutput> {
    const ctx = input.context || {};
    const task = input.task || "";
    const platform = ctx.platform || "google_ads";
    const product = ctx.product;
    const funnel = ctx.funnel || "MOFU";
    const competitor = ctx.competitor;
    const spec = PLATFORM_SPECS[platform] || PLATFORM_SPECS.google_ads;

    const findings: Finding[] = [];
    const recommendations: AgentRecommendation[] = [];

    // Load knowledge
    const kbPaths = [...getProductKBPaths(product), ...getPlatformKBPaths(platform)];
    const knowledgeContext = loadKnowledgeBundle(kbPaths);

    // Fetch existing ads for dedup
    const existingAds = ctx.existingAds || await fetchExistingAds(platform, product);
    const existingContext = existingAds.length > 0
      ? `\n## Existing Ads (avoid duplicating these):\n${JSON.stringify(existingAds.slice(0, 10), null, 2)}`
      : "";

    // Build prompt
    const prompt = `You are a B2B ad copywriter for Telnyx (AI-Native Network for voice AI).

${knowledgeContext}
${existingContext}

## Task
${task || `Generate ${platform} ad copy for ${product || "Telnyx"}`}

## Requirements
- Platform: ${platform}
- Product: ${product || "Telnyx general"}
- Funnel stage: ${funnel}
- Competitor context: ${competitor || "none"}
- Tone: ${spec.tone}

## Character Limits (STRICT)
- Headlines: MAX ${spec.headlines.max} chars each, generate ${spec.headlines.count}
- Descriptions: MAX ${spec.descriptions.max} chars each, generate ${spec.descriptions.count}
${spec.displayPaths ? `- Display paths: MAX ${spec.displayPaths.max} chars each, generate ${spec.displayPaths.count}` : ""}
${spec.cta ? `- CTA: MAX ${spec.cta.max} chars` : ""}

## Rules
- No em dashes. Use hyphens only.
- No filler words: ${FILLER_WORDS.join(", ")}
- No emojis in copy
- Every headline/description must map to one of these messaging pillars:
  * Real-Time AI Performance
  * Telephony Built for AI
  * Voice That Drives Action
  * Secure Mobile Voice and Identity for AI
- Sound like an engineer, not a marketer
- Be specific with numbers (sub-200ms, 140+ countries, 60% cheaper, etc.)
- PPC patterns, not SEO patterns (no "Best X", "Top X")

## Output (JSON only)
{
  "headlines": ["headline1", "headline2", ...],
  "descriptions": ["desc1", "desc2", ...],
  ${spec.displayPaths ? '"displayPaths": ["path1", "path2"],' : ""}
  ${spec.cta ? '"cta": "CTA text",' : ""}
  "pillarMapping": { "headline1": "pillar name", ... },
  "analysis": "Brief analysis of the current ad landscape for this theme"
}`;

    let aiResult: any;
    try {
      const response = await createCompletion({
        messages: [
          { role: "system", content: "Return ONLY valid JSON. Count characters precisely. No markdown." },
          { role: "user", content: prompt },
        ],
        maxTokens: 4096,
        temperature: 0.5,
      });
      const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      aiResult = JSON.parse(cleaned);
    } catch (err: any) {
      return {
        findings: [{ severity: "critical", title: "Ad copy generation failed", detail: err.message }],
        recommendations: [],
        summary: `Failed: ${err.message}`,
      };
    }

    // Programmatic validation
    const validatedHeadlines: string[] = [];
    const truncatedItems: string[] = [];
    const pillarMapping: Record<string, string> = aiResult.pillarMapping || {};

    for (const h of (aiResult.headlines || []).slice(0, spec.headlines.count)) {
      const { text, truncated } = validateAndTruncate(h, spec.headlines.max);
      validatedHeadlines.push(text);
      if (truncated) truncatedItems.push(`Headline "${h}" (${h.length}>${spec.headlines.max}) truncated`);
    }

    const validatedDescriptions: string[] = [];
    for (const d of (aiResult.descriptions || []).slice(0, spec.descriptions.count)) {
      const { text, truncated } = validateAndTruncate(d, spec.descriptions.max);
      validatedDescriptions.push(text);
      if (truncated) truncatedItems.push(`Description truncated (${d.length}>${spec.descriptions.max})`);
    }

    const validatedPaths: string[] = [];
    if (spec.displayPaths && aiResult.displayPaths) {
      for (const p of aiResult.displayPaths.slice(0, spec.displayPaths.count)) {
        const { text } = validateAndTruncate(p, spec.displayPaths.max);
        validatedPaths.push(text);
      }
    }

    let validatedCta: string | undefined;
    if (spec.cta && aiResult.cta) {
      const { text } = validateAndTruncate(aiResult.cta, spec.cta.max);
      validatedCta = text;
    }

    if (truncatedItems.length > 0) {
      findings.push({
        severity: "medium",
        title: `${truncatedItems.length} items exceeded char limits (auto-fixed)`,
        detail: truncatedItems.join("\n"),
      });
    }

    // Build recommendation
    const copyData: any = {
      headlines: validatedHeadlines,
      descriptions: validatedDescriptions,
    };
    if (validatedPaths.length > 0) copyData.displayPaths = validatedPaths;
    if (validatedCta) copyData.cta = validatedCta;

    recommendations.push({
      type: "ad-copy",
      severity: "medium",
      target: `${platform} - ${product || "general"}`,
      action: task || `New ${platform} ad copy for ${product || "Telnyx"}`,
      rationale: aiResult.analysis || "Generated based on brand messaging pillars and platform specs.",
      impact: `${validatedHeadlines.length} headlines + ${validatedDescriptions.length} descriptions ready for review`,
    });

    // Build artifact
    const artifact = {
      type: "ad-copy",
      title: `${platform} copy: ${product || "Telnyx"} [${funnel}]`,
      content: JSON.stringify({
        copy: copyData,
        pillarMapping,
        platform,
        product,
        funnel,
        competitor,
        charLimits: {
          headlines: { max: spec.headlines.max, all_valid: truncatedItems.filter(t => t.includes("Headline")).length === 0 },
          descriptions: { max: spec.descriptions.max, all_valid: truncatedItems.filter(t => t.includes("Description")).length === 0 },
        },
      }, null, 2),
    };

    const confidence = truncatedItems.length === 0 ? "HIGH" : "MEDIUM";

    return {
      findings: [
        ...(aiResult.analysis ? [{
          severity: "low" as const,
          title: "Landscape Analysis",
          detail: aiResult.analysis,
        }] : []),
        ...findings,
      ],
      recommendations,
      artifacts: [artifact],
      summary: `Generated ${platform} ad copy: ${validatedHeadlines.length} headlines + ${validatedDescriptions.length} descriptions for ${product || "Telnyx"} [${funnel}]. ` +
        `${truncatedItems.length === 0 ? "All char limits passed." : `${truncatedItems.length} items auto-truncated.`} Confidence: ${confidence}.`,
      suggestedActions: [
        "Review the generated copy in the artifacts panel",
        "Approve and export to the ad platform",
        existingAds.length > 0 ? `${existingAds.length} existing ads were checked for dedup` : "No existing ads found for dedup check",
      ],
    };
  },
};
