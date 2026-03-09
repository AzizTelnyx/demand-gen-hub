/**
 * knowledge-sync.ts — Bridge module that reads product groups from markdown.
 *
 * Reads knowledge/product-groups.md (the canonical source shared with Python agents)
 * and exposes structured helpers so TypeScript code can look up product groups
 * without relying on the hardcoded object in knowledge.ts.
 */

import { readFileSync } from "fs";
import { join } from "path";

// ── Types ──────────────────────────────────────────────────────

export interface ProductGroupVariant {
  category: string; // e.g. "Vertical", "Feature", "Conquest"
  values: string[];
}

export interface ProductGroup {
  name: string;
  description: string;
  products: string[];
  variants: ProductGroupVariant[];
  audience: string[];
  intentSignals: string[];
  operational: boolean;
}

// ── Cache ──────────────────────────────────────────────────────

let cached: ProductGroup[] | null = null;
let cachedMtime: number = 0;

function mdPath(): string {
  return join(process.cwd(), "knowledge", "product-groups.md");
}

function loadIfNeeded(): ProductGroup[] {
  const fs = require("fs") as typeof import("fs");
  try {
    const stat = fs.statSync(mdPath());
    if (cached && stat.mtimeMs === cachedMtime) return cached;
    const raw = fs.readFileSync(mdPath(), "utf-8");
    cached = parseProductGroups(raw);
    cachedMtime = stat.mtimeMs;
    return cached;
  } catch (e) {
    console.warn("knowledge-sync: could not read product-groups.md", e);
    return cached ?? [];
  }
}

// ── Parser ─────────────────────────────────────────────────────

function parseProductGroups(md: string): ProductGroup[] {
  const groups: ProductGroup[] = [];
  // Split on H2 headers
  const sections = md.split(/^## /m).slice(1); // drop preamble

  for (const section of sections) {
    const lines = section.split("\n");
    const nameLine = lines[0].trim();
    // Check for "(NOT OPERATIONAL)" marker
    const operational = !nameLine.toUpperCase().includes("NOT OPERATIONAL");
    const name = nameLine.replace(/\s*\(.*?\)\s*$/, "").trim();

    // Description = first non-empty line after the header
    const description = lines.find((l, i) => i > 0 && l.trim() && !l.startsWith("**"))?.trim() ?? "";

    // Products
    const productsLine = lines.find((l) => l.startsWith("**Products:**"));
    const products = productsLine
      ? productsLine.replace("**Products:**", "").split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // Variants — bullet list after **Variants:**
    const variants: ProductGroupVariant[] = [];
    const variantsIdx = lines.findIndex((l) => l.startsWith("**Variants:**"));
    if (variantsIdx !== -1) {
      const variantsInline = lines[variantsIdx].replace("**Variants:**", "").trim();
      if (variantsInline.toLowerCase() === "none currently" || variantsInline.toLowerCase() === "none") {
        // no variants
      } else {
        // Parse bullet lines
        for (let i = variantsIdx + 1; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith("**") || line.startsWith("##") || line.startsWith("---")) break;
          const bulletMatch = line.match(/^-\s+(.+)/);
          if (!bulletMatch) continue;
          const bullet = bulletMatch[1].trim();
          // Format: "Category: val1, val2, val3" or just "val1, val2"
          // Some bullets have sub-product prefix: "Voice API: Generic, Twilio (conquest)"
          // Some have category prefix: "Vertical: Healthcare, Contact Center, ..."
          const colonIdx = bullet.indexOf(":");
          if (colonIdx > -1) {
            const cat = bullet.slice(0, colonIdx).trim();
            const vals = bullet.slice(colonIdx + 1).split(",").map((s) => s.trim()).filter(Boolean);
            variants.push({ category: cat, values: vals });
          } else {
            variants.push({ category: "General", values: [bullet] });
          }
        }
      }
    }

    // Audience
    const audienceLine = lines.find((l) => l.startsWith("**Audience:**"));
    const audience = audienceLine
      ? audienceLine.replace("**Audience:**", "").split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // Intent signals
    const intentLine = lines.find((l) => l.startsWith("**Intent signals:**"));
    const intentSignals = intentLine
      ? intentLine.replace("**Intent signals:**", "").split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    groups.push({ name, description, products, variants, audience, intentSignals, operational });
  }

  // Filter out non-product sections (e.g. "Cross-Cutting Rules")
  return groups.filter((g) => g.products.length > 0);
}

// ── Public API ─────────────────────────────────────────────────

/** Return all parsed product groups from knowledge/product-groups.md */
export function getProductGroups(): ProductGroup[] {
  return loadIfNeeded();
}

/**
 * Given a campaign's parsedProduct (and optional parsedVariant),
 * return the product group name it belongs to.
 *
 * Matching logic:
 * 1. Exact match on group products list
 * 2. Fuzzy/case-insensitive match on products
 * 3. Check if parsedVariant appears in any variant values (for conquest campaigns
 *    where the variant is a competitor name but product is the parent)
 *
 * Returns the group name or "Unknown" if no match.
 */
export function getProductGroup(parsedProduct: string, parsedVariant?: string): string {
  const groups = loadIfNeeded();
  const prodLower = parsedProduct.toLowerCase().trim();

  // Direct product match
  for (const g of groups) {
    for (const p of g.products) {
      if (p.toLowerCase() === prodLower) return g.name;
    }
  }

  // Fuzzy: check if parsedProduct is contained in or contains a product name
  for (const g of groups) {
    for (const p of g.products) {
      const pLower = p.toLowerCase();
      if (pLower.includes(prodLower) || prodLower.includes(pLower)) return g.name;
    }
  }

  // Check variant values — variant might identify the group
  if (parsedVariant) {
    const varLower = parsedVariant.toLowerCase().trim();
    for (const g of groups) {
      for (const v of g.variants) {
        for (const val of v.values) {
          if (val.toLowerCase().includes(varLower) || varLower.includes(val.toLowerCase())) {
            return g.name;
          }
        }
      }
    }
  }

  return "Unknown";
}
