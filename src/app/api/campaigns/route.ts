import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const status = searchParams.get("status");

    const where: Record<string, string> = {};
    if (platform && platform !== "all") where.platform = platform;
    if (status && status !== "all") where.status = status;

    // Parallel: campaigns + sync states + pre-aggregated impression totals
    const [campaigns, syncStates, impAgg] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true, name: true, platform: true, platformId: true,
          status: true, funnelStage: true, region: true, channel: true,
          budget: true, spend: true, impressions: true, clicks: true, conversions: true,
          startDate: true, endDate: true, lastSyncedAt: true, metadata: true,
          createdAt: true, updatedAt: true,
          servingStatus: true, parsedDate: true, parsedIntent: true, parsedProduct: true,
          parsedVariant: true, parsedAdType: true, parsedRegion: true, parseConfidence: true,
        },
      }),
      prisma.syncState.findMany(),
      // Pre-aggregate impressions by campaignName using raw SQL — much faster than loading all rows
      prisma.$queryRaw<{ campaignName: string; impressions: bigint; clicks: bigint; domains: number }[]>`
        SELECT "campaignName",
               SUM(impressions)::bigint AS impressions,
               SUM(clicks)::bigint AS clicks,
               COUNT(DISTINCT CASE WHEN domain != '__campaign__' THEN domain END)::int AS domains
        FROM "AdImpression"
        GROUP BY "campaignName"
      `,
    ]);

    const syncStatesMap: Record<string, { lastSyncedAt: Date | null; status: string }> = {};
    for (const s of syncStates) {
      syncStatesMap[s.platform] = { lastSyncedAt: s.lastSyncedAt, status: s.status };
    }

    // Build fast lookup: campaignName -> aggregated metrics
    const impMap: Record<string, { impressions: number; clicks: number; domains: number }> = {};
    for (const row of impAgg) {
      impMap[row.campaignName] = {
        impressions: Number(row.impressions),
        clicks: Number(row.clicks),
        domains: row.domains,
      };
    }

    // Enrich campaigns with impression data (lightweight — no full attribution here)
    const enriched = campaigns.map(c => {
      const imp = impMap[c.name];
      return {
        ...c,
        attribution: imp && imp.domains > 0
          ? { influencedDeals: 0, influencedPipeline: 0, impressions: imp.impressions, clicks: imp.clicks }
          : null,
      };
    });

    return NextResponse.json({
      campaigns: enriched,
      syncStates: syncStatesMap,
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}
