import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-client";
import { adCopyGenerator } from "./ad-copy-generator";
import type { AgentHandler, AgentOutput, AgentInput } from "./types";
import { promises as fs } from "fs";
import path from "path";

/* ─── Platform Size Specs ─────────────────────────────── */

interface PlatformSizes {
  name: string;
  sizes: { width: number; height: number; label: string }[];
  rules: string[];
}

const PLATFORM_SIZES: Record<string, PlatformSizes> = {
  "stackadapt-native": {
    name: "StackAdapt Native Display",
    sizes: [
      { width: 1200, height: 628, label: "1200x628" },
      { width: 600, height: 600, label: "600x600" },
      { width: 800, height: 600, label: "800x600" },
    ],
    rules: [
      "NO text overlay on images",
      "Editorial style - must blend with publisher content",
      "High-quality photography or data visualizations",
      "Clean, professional",
    ],
  },
  "stackadapt-display": {
    name: "StackAdapt Display Ads",
    sizes: [
      { width: 300, height: 250, label: "300x250" },
      { width: 728, height: 90, label: "728x90" },
      { width: 160, height: 600, label: "160x600" },
      { width: 300, height: 600, label: "300x600" },
      { width: 320, height: 50, label: "320x50" },
    ],
    rules: ["Standard IAB sizes", "Text overlay allowed", "CTA button recommended"],
  },
  linkedin: {
    name: "LinkedIn Single Image",
    sizes: [
      { width: 1200, height: 627, label: "1200x627 (landscape)" },
      { width: 1200, height: 1200, label: "1200x1200 (square)" },
      { width: 628, height: 1200, label: "628x1200 (vertical - mobile only)" },
    ],
    rules: [
      "Professional quality essential",
      "Real people over stock",
      "Business context important",
      "Authentic workplace environments",
    ],
  },
  reddit: {
    name: "Reddit Image Ads",
    sizes: [
      { width: 1080, height: 1350, label: "1080x1350 (portrait - best for mobile)" },
      { width: 1080, height: 1080, label: "1080x1080 (square)" },
      { width: 1920, height: 1080, label: "1920x1080 (landscape)" },
    ],
    rules: [
      "Authentic over polished",
      "User-generated content style",
      "Avoid corporate aesthetic",
      "Mobile-first (70%+ traffic)",
    ],
  },
  "google-display": {
    name: "Google Display Ads",
    sizes: [
      { width: 300, height: 250, label: "300x250 (best performer)" },
      { width: 728, height: 90, label: "728x90" },
      { width: 160, height: 600, label: "160x600" },
      { width: 300, height: 600, label: "300x600" },
      { width: 320, height: 50, label: "320x50" },
    ],
    rules: ["300x250 is best all-around", "High quality, sharp", "Minimal text overlay"],
  },
};

/* ─── Telnyx Brand Assets ────────────────────────────── */

const BRAND_ASSETS = {
  colors: {
    darkBg: "#0A0A0A",
    brandGreen: "#00CE9C",
    white: "#FFFFFF",
    gray: "#4A4A4A",
  },
  fonts: {
    headline: "PP Formula Extrabold",
    body: "Inter",
  },
  logo: "telnyx-logo.svg", // Assume this exists
};

/* ─── Pillar Visual Definitions ──────────────────────── */

interface PillarVisuals {
  name: string;
  visualElements: string[];
  dataPoints: string[];
  colorScheme: string;
}

const PILLAR_VISUALS: Record<string, PillarVisuals> = {
  trust: {
    name: "Trust & Compliance",
    visualElements: [
      "Compliance shield icon",
      "HIPAA/SOC2/PCI badges",
      "Security lock symbols",
      "Donut chart (43% calls unanswered)",
      "STIR/SHAKEN attestation visual",
    ],
    dataPoints: ["HIPAA-ready", "SOC 2 Type II", "99.999% uptime", "43% spam prevention"],
    colorScheme: "Dark background with green accent for trust indicators",
  },
  infrastructure: {
    name: "Infrastructure & Integration",
    visualElements: [
      "Network architecture diagram",
      "Single-stack vs multi-vendor comparison",
      "One platform visualization",
      "Vendor reduction visual (5→1)",
      "Integration diagram",
    ],
    dataPoints: [
      "1 vendor vs 5",
      "Own network (not reseller)",
      "140+ countries",
      "Zero extra hops",
    ],
    colorScheme: "Technical diagrams on dark background, green for unified stack",
  },
  physics: {
    name: "Physics & Performance",
    visualElements: [
      "Latency benchmark bar chart",
      "Network hop diagram",
      "Speed comparison visual",
      "Sub-200ms callout",
      "Light traveling through fiber (physics visualization)",
    ],
    dataPoints: ["<200ms latency", "Sub-500ms total", "30-80ms per hop", "Co-located inference"],
    colorScheme: "Data visualization style, green for Telnyx performance",
  },
};

/* ─── Creative Brief Parser ──────────────────────────── */

interface CreativeBrief {
  id: string;
  platform: string;
  format: string;
  pillar: string;
  audience: string;
  messagingCore: string;
  adCopy: string;
  sizes: string[];
}

function parseBriefFromPrompt(promptText: string): CreativeBrief {
  // Extract platform from prompt
  let platform = "linkedin";
  let format = "single-image";

  if (promptText.includes("StackAdapt native")) {
    platform = "stackadapt-native";
  } else if (promptText.includes("StackAdapt display")) {
    platform = "stackadapt-display";
  } else if (promptText.includes("LinkedIn")) {
    platform = "linkedin";
  } else if (promptText.includes("Reddit")) {
    platform = "reddit";
  } else if (promptText.includes("Google")) {
    platform = "google-display";
  }

  // Extract ad copy
  const copyMatch = promptText.match(/"([^"]+)"/);
  const adCopy = copyMatch ? copyMatch[1] : "";

  // Determine pillar from messaging
  let pillar = "infrastructure";
  if (adCopy.includes("HIPAA") || adCopy.includes("compliance") || adCopy.includes("secure")) {
    pillar = "trust";
  } else if (adCopy.includes("latency") || adCopy.includes("ms") || adCopy.includes("faster")) {
    pillar = "physics";
  }

  // Extract audience
  let audience = "developers";
  if (promptText.includes("healthcare")) audience = "healthcare IT";
  if (promptText.includes("fintech")) audience = "fintech";
  if (promptText.includes("BPO") || promptText.includes("contact center")) audience = "CCaaS builders";
  if (promptText.includes("Twilio")) audience = "Twilio users";

  const platformSpec = PLATFORM_SIZES[platform];
  const sizes = platformSpec ? platformSpec.sizes.map(s => s.label) : [];

  return {
    id: `creative-${Date.now()}`,
    platform,
    format,
    pillar,
    audience,
    messagingCore: adCopy,
    adCopy,
    sizes,
  };
}

/* ─── Image Generation (Template-based) ──────────────── */

async function generateCreativeImage(
  brief: CreativeBrief,
  width: number,
  height: number,
  copy: { headline: string; description?: string; cta?: string }
): Promise<string> {
  // For MVP, generate HTML template and convert to image using Puppeteer
  // This is a placeholder - in production, you'd use Puppeteer or Canvas

  const pillarVisual = PILLAR_VISUALS[brief.pillar];
  const platformSpec = PLATFORM_SIZES[brief.platform];
  const noTextOverlay = platformSpec.rules.some(r => r.includes("NO text overlay"));

  const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${width}px;
      height: ${height}px;
      background: ${BRAND_ASSETS.colors.darkBg};
      color: ${BRAND_ASSETS.colors.white};
      font-family: 'Inter', sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 40px;
      position: relative;
      overflow: hidden;
    }
    .visual-element {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      opacity: 0.15;
      font-size: ${Math.min(width, height) * 0.6}px;
      color: ${BRAND_ASSETS.colors.brandGreen};
    }
    .content {
      z-index: 10;
      text-align: center;
      max-width: 80%;
    }
    .headline {
      font-size: ${Math.min(width / 15, 48)}px;
      font-weight: 800;
      color: ${BRAND_ASSETS.colors.white};
      margin-bottom: 20px;
      line-height: 1.2;
      ${noTextOverlay ? 'display: none;' : ''}
    }
    .description {
      font-size: ${Math.min(width / 25, 24)}px;
      color: ${BRAND_ASSETS.colors.white};
      opacity: 0.9;
      margin-bottom: 20px;
      ${noTextOverlay ? 'display: none;' : ''}
    }
    .data-point {
      font-size: ${Math.min(width / 8, 72)}px;
      font-weight: 900;
      color: ${BRAND_ASSETS.colors.brandGreen};
      margin-bottom: 10px;
    }
    .cta {
      background: ${BRAND_ASSETS.colors.brandGreen};
      color: ${BRAND_ASSETS.colors.darkBg};
      padding: 15px 40px;
      border-radius: 8px;
      font-weight: 700;
      font-size: ${Math.min(width / 30, 18)}px;
      display: inline-block;
      ${noTextOverlay ? 'display: none;' : ''}
    }
    .logo {
      position: absolute;
      bottom: 30px;
      right: 30px;
      font-size: ${Math.min(width / 20, 24)}px;
      font-weight: 700;
      color: ${BRAND_ASSETS.colors.white};
    }
    .pillar-visual {
      position: absolute;
      ${brief.pillar === 'physics' ? 'top: 20px; right: 20px;' : 'bottom: 20px; left: 20px;'}
      font-size: ${Math.min(width / 35, 14)}px;
      color: ${BRAND_ASSETS.colors.brandGreen};
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div class="visual-element">${pillarVisual.visualElements[0].includes('chart') ? '📊' : '🔒'}</div>

  <div class="content">
    ${noTextOverlay ? '' : `<div class="headline">${copy.headline}</div>`}
    ${noTextOverlay ? '' : copy.description ? `<div class="description">${copy.description}</div>` : ''}

    ${brief.pillar === 'physics' ? '<div class="data-point"><200ms</div>' : ''}
    ${brief.pillar === 'trust' ? '<div class="data-point">HIPAA</div>' : ''}
    ${brief.pillar === 'infrastructure' ? '<div class="data-point">1 Platform</div>' : ''}

    ${noTextOverlay ? '' : copy.cta ? `<div class="cta">${copy.cta}</div>` : ''}
  </div>

  <div class="logo">TELNYX</div>
  <div class="pillar-visual">${pillarVisual.name}</div>
</body>
</html>
  `;

  // Return HTML template path (in production, convert to PNG with Puppeteer)
  return htmlTemplate;
}

/* ─── Main Creative Asset Generator ──────────────────── */

export const creativeAssetGenerator: AgentHandler = {
  slug: "creative-asset-generator",

  async run(input: AgentInput): Promise<AgentOutput> {
    const ctx = input.context || {};
    const promptText = input.task || "";

    if (!promptText) {
      return {
        findings: [{ severity: "critical", title: "No prompt provided", detail: "Provide a creative brief prompt" }],
        recommendations: [],
        summary: "Failed: No prompt provided",
      };
    }

    // Parse brief from prompt
    const brief = parseBriefFromPrompt(promptText);

    // Step 1: Generate copy using existing ad-copy-generator
    const copyGenInput: AgentInput = {
      task: `Generate ad copy for: ${brief.messagingCore}`,
      context: {
        platform: brief.platform === "stackadapt-native" ? "stackadapt" : brief.platform,
        product: brief.audience,
        funnel: "MOFU",
      },
    };

    const copyResult = await adCopyGenerator.run(copyGenInput);

    // Extract generated copy from artifacts
    let generatedCopy: any = {};
    if (copyResult.artifacts && copyResult.artifacts.length > 0) {
      try {
        const artifact = JSON.parse(copyResult.artifacts[0].content);
        generatedCopy = artifact.copy;
      } catch (e) {
        // Fallback to brief messaging
        generatedCopy = {
          headlines: [brief.adCopy],
          descriptions: [brief.messagingCore],
          cta: "Learn More",
        };
      }
    }

    // Step 2: Generate images for all sizes
    const platformSpec = PLATFORM_SIZES[brief.platform];
    const creativeAssets: any[] = [];

    for (const size of platformSpec.sizes) {
      const copy = {
        headline: generatedCopy.headlines?.[0] || brief.adCopy,
        description: generatedCopy.descriptions?.[0],
        cta: generatedCopy.cta || "Learn More",
      };

      const htmlTemplate = await generateCreativeImage(brief, size.width, size.height, copy);

      creativeAssets.push({
        size: size.label,
        width: size.width,
        height: size.height,
        htmlTemplate,
        copy,
      });
    }

    // Step 3: Build output directory structure
    const outputDir = path.join(
      process.cwd(),
      "output",
      "creatives",
      `${brief.platform}-${brief.pillar}-${brief.audience.replace(/\s+/g, "-")}`
    );

    // Create artifact with all assets
    const artifact = {
      type: "creative-assets",
      title: `${brief.platform} - ${brief.pillar} - ${brief.audience}`,
      content: JSON.stringify({
        brief,
        copy: generatedCopy,
        assets: creativeAssets,
        outputDirectory: outputDir,
        nextSteps: [
          `Convert HTML templates to PNG using Puppeteer`,
          `Save to ${outputDir}`,
          `Upload to ${brief.platform} ad platform`,
        ],
      }, null, 2),
    };

    return {
      findings: [
        {
          severity: "low",
          title: "Creative assets generated",
          detail: `Generated ${creativeAssets.length} sizes for ${brief.platform}`,
        },
      ],
      recommendations: [
        {
          type: "creative-assets",
          severity: "medium",
          target: brief.platform,
          action: `Review and export ${creativeAssets.length} creative assets`,
          rationale: `Generated for ${brief.audience} targeting ${brief.pillar} messaging`,
          impact: `Ready for ${brief.platform} campaign launch`,
        },
      ],
      artifacts: [artifact],
      summary: `Generated ${creativeAssets.length} creative assets (${platformSpec.sizes.map(s => s.label).join(", ")}) for ${brief.platform}. Platform: ${platformSpec.name}. Pillar: ${brief.pillar}. Ready for conversion to PNG and upload.`,
      suggestedActions: [
        "Review HTML templates in artifacts",
        "Convert to PNG using Puppeteer",
        "Upload to ad platform",
        `Output directory: ${outputDir}`,
      ],
    };
  },
};
