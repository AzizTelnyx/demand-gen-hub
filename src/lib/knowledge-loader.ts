import { readFileSync } from "fs";
import { join } from "path";

const KB_ROOT = join(process.cwd(), "knowledge");

/** Load a knowledge base file by relative path. Returns empty string if not found. */
export function loadKnowledge(relativePath: string): string {
  try {
    return readFileSync(join(KB_ROOT, relativePath), "utf-8");
  } catch {
    console.warn(`Knowledge file not found: ${relativePath}`);
    return "";
  }
}

/** Load multiple knowledge base files, concatenated with headers. */
export function loadKnowledgeBundle(paths: string[]): string {
  return paths
    .map((p) => {
      const content = loadKnowledge(p);
      if (!content) return "";
      return `## [${p}]\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

/** Common knowledge bundles for agents */
export const KB = {
  brand: () => loadKnowledge("brand/brand-messaging-q1-2026.md"),
  adCopyRules: () => loadKnowledge("standards/ad-copy-rules.md"),
  rsaBestPractices: () => loadKnowledge("standards/google-ads-rsa-best-practices.md"),
  googleAdsStandards: () => loadKnowledge("standards/google-ads-standards.md"),
  campaignNaming: () => loadKnowledge("standards/campaign-naming-conventions.md"),
  geoTargeting: () => loadKnowledge("standards/geo-targeting-rules.md"),
  utmTagging: () => loadKnowledge("standards/utm-tagging-2025.md"),
  icp: () => loadKnowledge("standards/telnyx-icp.md"),
  conversionFramework: () => loadKnowledge("standards/conversion-framework.md"),
  voiceAiLandscape: () => loadKnowledge("competitors/voice-ai-landscape.md"),
  channelBenchmarks: () => loadKnowledge("playbooks/channel-benchmarks.md"),
  googlePlaybook: () => loadKnowledge("playbooks/google-ads-playbook.md"),
  linkedinPlaybook: () => loadKnowledge("playbooks/linkedin-playbook.md"),
  stackadaptPlaybook: () => loadKnowledge("playbooks/stackadapt-playbook.md"),
  redditPlaybook: () => loadKnowledge("playbooks/reddit-playbook.md"),
  campaignOrchestration: () => loadKnowledge("workflows/campaign-orchestration.md"),
  strategy: () => loadKnowledge("telnyx-strategy.md"),
  product: (name: string) => {
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const attempts = [
      `products/${slug}.md`,
      `products/${slug}-messaging.md`,
      `products/${slug}-dev-messaging.md`,
      `products/${name}.md`,
    ];
    // Also try partial matches (e.g. "voice ai" matches "voice-ai-dev-messaging.md")
    try {
      const fs = require("fs");
      const dir = join(KB_ROOT, "products");
      const files = fs.readdirSync(dir) as string[];
      for (const f of files) {
        if (f.includes(slug) && f.endsWith(".md")) {
          attempts.unshift(`products/${f}`);
        }
      }
    } catch {}
    for (const path of attempts) {
      const content = loadKnowledge(path);
      if (content) return content;
    }
    return "";
  },
};
