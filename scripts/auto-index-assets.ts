#!/usr/bin/env tsx
/**
 * Auto-Index Asset Library
 * Scans entire Asset_Library and generates comprehensive index
 */

import { promises as fs } from "fs";
import path from "path";

const ASSET_LIBRARY_ROOT = "/Users/azizalsinafi/Documents/Asset_Library";
const BRAND_ASSETS_ROOT = "/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/brand-assets";

interface AssetEntry {
  path: string;
  category: string;
  industry?: string;
  product?: string;
  keywords: string[];
  bestFor?: string[];
  features?: string[];
  pillars?: string[];
}

// Map folder names to categories
function categorizeAsset(filePath: string): string {
  if (filePath.includes("Product-Heroes")) return "product-hero";
  if (filePath.includes("Product-Features")) return "product-feature";
  if (filePath.includes("Product-Icons")) return "product-icon";
  if (filePath.includes("Industry_Visuals/Social_Assets")) return "use-case-screenshot";
  if (filePath.includes("Industry_Visuals/Industry_Hero")) return "industry-hero";
  if (filePath.includes("Photography/Stock")) return "stock-photography";
  if (filePath.includes("photography/industry")) return "industry-photo";
  if (filePath.includes("Product_Visuals")) return "product-visual";
  if (filePath.includes("Homepage_Visuals")) return "homepage-visual";
  if (filePath.includes("backgrounds")) return "product-background";
  if (filePath.includes("features")) return "feature-screenshot";
  return "general-asset";
}

// Extract product from path/filename
function extractProduct(filePath: string, filename: string): string | undefined {
  const lower = (filePath + filename).toLowerCase();
  if (lower.includes("voice-ai-agent") || lower.includes("voice_ai")) return "voice-ai";
  if (lower.includes("voice-api") || lower.includes("voice_api")) return "voice-api";
  if (lower.includes("mobile-voice")) return "mobile-voice";
  if (lower.includes("messaging") || lower.includes("sms")) return "messaging";
  if (lower.includes("rcs")) return "rcs";
  if (lower.includes("esim")) return "esim";
  return undefined;
}

// Extract industry from path/filename
function extractIndustry(filePath: string, filename: string): string | undefined {
  const lower = (filePath + filename).toLowerCase();
  if (lower.includes("healthcare") || lower.includes("health")) return "healthcare";
  if (lower.includes("insurance")) return "insurance";
  if (lower.includes("restaurant") || lower.includes("dining")) return "restaurants";
  if (lower.includes("travel") || lower.includes("hospitality")) return "travel";
  if (lower.includes("retail") || lower.includes("ecommerce")) return "retail";
  if (lower.includes("finance") || lower.includes("banking")) return "finance";
  if (lower.includes("automotive") || lower.includes("auto")) return "automotive";
  if (lower.includes("logistics") || lower.includes("delivery")) return "logistics";
  return undefined;
}

// Generate keywords from filename and path
function generateKeywords(filePath: string, filename: string): string[] {
  const keywords: string[] = [];

  // Clean filename
  const cleanName = filename
    .replace(/\.(png|jpg|jpeg)$/i, "")
    .replace(/@\dx$/i, "") // Remove @2x
    .replace(/[-_]/g, " ")
    .toLowerCase();

  // Split into words
  const words = cleanName.split(/\s+/).filter(w => w.length > 2);
  keywords.push(...words);

  // Add path-based keywords
  if (filePath.includes("HIPAA")) keywords.push("hipaa", "compliance");
  if (filePath.includes("AI")) keywords.push("ai", "artificial intelligence");
  if (filePath.includes("Voice")) keywords.push("voice", "telephony");

  return [...new Set(keywords)]; // Dedupe
}

// Generate bestFor from filename
function generateBestFor(filename: string, industry?: string, product?: string): string[] {
  const bestFor: string[] = [];
  const lower = filename.toLowerCase();

  if (lower.includes("appointment")) bestFor.push("appointment scheduling");
  if (lower.includes("reservation")) bestFor.push("reservations", "booking");
  if (lower.includes("lab") || lower.includes("results")) bestFor.push("lab results", "medical diagnostics");
  if (lower.includes("prescription")) bestFor.push("prescription management", "pharmacy");
  if (lower.includes("symptom") || lower.includes("triage")) bestFor.push("symptom checking", "patient triage");
  if (lower.includes("order")) bestFor.push("ordering", "order management");
  if (lower.includes("policy")) bestFor.push("policy management", "insurance");
  if (lower.includes("waitlist")) bestFor.push("waitlist management");
  if (lower.includes("loyalty")) bestFor.push("loyalty programs");
  if (lower.includes("concierge")) bestFor.push("concierge services");

  if (industry) bestFor.push(`${industry} industry`);
  if (product) bestFor.push(`${product} product`);

  return bestFor;
}

// Scan directory recursively
async function scanDirectory(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip hidden files, archives, and source files
      if (entry.name.startsWith(".")) continue;
      if (entry.name.startsWith("z")) continue; // zOld, zArchive
      if (entry.name.includes("Source File")) continue;

      if (entry.isDirectory()) {
        const subFiles = await scanDirectory(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".png", ".jpg", ".jpeg"].includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not read ${dir}`);
  }

  return files;
}

// Convert absolute path to relative brand-assets path
function toRelativePath(absolutePath: string): string {
  // Check if already in _NEW_AdGen_Library
  if (absolutePath.includes("_NEW_AdGen_Library")) {
    const relativePart = absolutePath.split("_NEW_AdGen_Library")[1];
    return `brand-assets/assets${relativePart}`;
  }

  // Check if in Industry_Visuals (symlinked)
  if (absolutePath.includes("Industry_Visuals")) {
    const relativePart = absolutePath.split("Industry_Visuals")[1];
    return `brand-assets/industry-visuals${relativePart}`;
  }

  // For other folders, use symlink names
  const libraryPart = absolutePath.replace(ASSET_LIBRARY_ROOT + "/", "");
  const folderName = libraryPart.split("/")[0];

  // Map folder names to symlink names
  const symlinkMap: Record<string, string> = {
    "_NEW_Collection_Product-Features": "_new_collection_product-features",
    "_NEW_Collection_Product-Heroes": "_new_collection_product-heroes",
    "_NEW_Collection_Product-Icons": "_new_collection_product-icons",
    "Product_Visuals": "product-visuals",
    "Photography": "photography",
    "Homepage_Visuals_April-2025": "homepage-visuals-april-2025",
    "Homepage_Visuals_July-2025": "homepage-visuals-july-2025",
  };

  const symlinkName = symlinkMap[folderName] || folderName.toLowerCase().replace(/_/g, "-");
  return `brand-assets/${symlinkName}/${libraryPart.split("/").slice(1).join("/")}`;
}

// Process all assets
async function indexAllAssets() {
  console.log("🔍 Scanning Asset Library...\n");

  const allFiles = await scanDirectory(ASSET_LIBRARY_ROOT);
  console.log(`   Found ${allFiles.length} image files\n`);

  const assetsByCategory: Record<string, AssetEntry[]> = {
    backgrounds: [],
    productScreenshots: [],
    industryPhotography: [],
    industryHeroes: [],
    useCaseScreenshots: [],
    productHeroes: [],
    productIcons: [],
    productVisuals: [],
    icons: [],
    brandAssets: [],
  };

  for (const file of allFiles) {
    const filename = path.basename(file);
    const category = categorizeAsset(file);
    const product = extractProduct(file, filename);
    const industry = extractIndustry(file, filename);
    const keywords = generateKeywords(file, filename);
    const bestFor = generateBestFor(filename, industry, product);
    const relativePath = toRelativePath(file);

    const entry: AssetEntry = {
      path: relativePath,
      category,
      keywords,
    };

    if (industry) entry.industry = industry;
    if (product) entry.product = product;
    if (bestFor.length > 0) entry.bestFor = bestFor;

    // Categorize into appropriate section
    if (category === "product-background") {
      assetsByCategory.backgrounds.push(entry);
    } else if (category === "feature-screenshot" || category === "product-feature") {
      assetsByCategory.productScreenshots.push(entry);
    } else if (category === "industry-photo" || category === "stock-photography") {
      assetsByCategory.industryPhotography.push(entry);
    } else if (category === "industry-hero") {
      assetsByCategory.industryHeroes.push(entry);
    } else if (category === "use-case-screenshot") {
      assetsByCategory.useCaseScreenshots.push(entry);
    } else if (category === "product-hero") {
      assetsByCategory.productHeroes.push(entry);
    } else if (category === "product-icon") {
      assetsByCategory.productIcons.push(entry);
    } else if (category === "product-visual" || category === "homepage-visual") {
      assetsByCategory.productVisuals.push(entry);
    } else {
      assetsByCategory.brandAssets.push(entry);
    }
  }

  // Print summary
  console.log("📊 Asset Distribution:\n");
  for (const [category, assets] of Object.entries(assetsByCategory)) {
    if (assets.length > 0) {
      console.log(`   ${category}: ${assets.length} assets`);
    }
  }

  // Generate index JSON
  const index = {
    description: "Comprehensive asset library index - AUTO-GENERATED",
    version: "2.0.0",
    lastUpdated: new Date().toISOString().split("T")[0],
    totalAssets: allFiles.length,
    ...assetsByCategory,
  };

  // Save to file
  const outputPath = path.join(process.cwd(), "config", "asset-library-index-full.json");
  await fs.writeFile(outputPath, JSON.stringify(index, null, 2));

  console.log(`\n✅ Generated index with ${allFiles.length} assets`);
  console.log(`📁 Saved to: ${outputPath}\n`);
  console.log("💡 Review the file, then replace asset-library-index.json with it.\n");
}

indexAllAssets().catch(console.error);
