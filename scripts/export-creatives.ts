#!/usr/bin/env tsx
/**
 * Export current ad creatives from database for brand analysis
 */

import { prisma } from "../src/lib/prisma";
import { promises as fs } from "fs";
import path from "path";

async function exportCreatives() {
  console.log("📊 Fetching ad creatives from database...\n");

  // Get recent active creatives
  const creatives = await prisma.adCreative.findMany({
    where: {
      status: {
        in: ["active", "enabled", "ENABLED", "Active", "live", "Live"],
      },
    },
    orderBy: {
      lastSyncedAt: "desc",
    },
    take: 50,
  });

  console.log(`Found ${creatives.length} active creatives\n`);

  // Group by platform
  const byPlatform: Record<string, any[]> = {};
  for (const creative of creatives) {
    const platform = creative.platform.toLowerCase();
    if (!byPlatform[platform]) byPlatform[platform] = [];
    byPlatform[platform].push(creative);
  }

  // Print summary
  console.log("Platform breakdown:");
  for (const [platform, items] of Object.entries(byPlatform)) {
    console.log(`  ${platform}: ${items.length} creatives`);
  }

  // Export detailed analysis
  const analysis: any[] = [];

  for (const creative of creatives) {
    const headlines = creative.headlines ? JSON.parse(creative.headlines) : [];
    const descriptions = creative.descriptions ? JSON.parse(creative.descriptions) : [];
    const images = creative.images ? JSON.parse(creative.images) : [];

    analysis.push({
      platform: creative.platform,
      campaignName: creative.campaignName,
      adType: creative.adType,
      headlines: headlines.slice(0, 3), // First 3
      descriptions: descriptions.slice(0, 2), // First 2
      images: images.slice(0, 2), // First 2
      cta: creative.cta,
      status: creative.status,
    });
  }

  // Save to file
  const outputPath = path.join(
    process.cwd(),
    "brand-assets",
    "current-creatives-analysis.json"
  );

  await fs.writeFile(outputPath, JSON.stringify(analysis, null, 2));

  console.log(`\n✅ Analysis saved to: brand-assets/current-creatives-analysis.json`);
  console.log(`\n📋 Sample creatives:\n`);

  // Show 5 examples
  for (const item of analysis.slice(0, 5)) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Platform: ${item.platform}`);
    console.log(`Campaign: ${item.campaignName}`);
    console.log(`Ad Type: ${item.adType}`);
    if (item.headlines.length > 0) {
      console.log(`Headline: "${item.headlines[0]}"`);
    }
    if (item.descriptions.length > 0) {
      console.log(`Description: "${item.descriptions[0]}"`);
    }
    if (item.cta) {
      console.log(`CTA: "${item.cta}"`);
    }
    console.log("");
  }

  console.log(`\nTotal: ${creatives.length} active creatives analyzed`);
}

exportCreatives()
  .catch(console.error)
  .finally(() => process.exit(0));
