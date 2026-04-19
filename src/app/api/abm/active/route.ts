import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const platform = url.searchParams.get("platform");
    const product = url.searchParams.get("product");
    const flag = url.searchParams.get("flag");
    const minSpend = url.searchParams.get("minSpend");

    const where: any = {};
    if (platform && platform !== "all") where.platform = platform;
    if (product && product !== "all") where.parsedProduct = product;
    if (flag) where.healthFlags = { array_contains: flag };
    if (minSpend) where.spend30d = { gte: parseFloat(minSpend) };

    // Get all campaign-segment pairs with campaign + segment details
    const segments = await prisma.aBMCampaignSegment.findMany({
      where,
      orderBy: { spend30d: "desc" },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            status: true,
            parsedProduct: true,
            parsedVariant: true,
            parsedIntent: true,
            budget: true,
          },
        },
      },
    });

    // Aggregate summary
    const summary = {
      totalSegments: segments.length,
      totalCampaigns: new Set(segments.map((s) => s.campaignId)).size,
      totalSpend: segments.reduce((sum, s) => sum + s.spend30d, 0),
      totalImpressions: segments.reduce((sum, s) => sum + s.impressions30d, 0),
      totalClicks: segments.reduce((sum, s) => sum + s.clicks30d, 0),
      totalConversions: segments.reduce((sum, s) => sum + s.conversions30d, 0),
      byPlatform: {} as Record<string, { count: number; spend: number; impressions: number }>,
      flags: {} as Record<string, number>,
    };

    for (const s of segments) {
      // Platform aggregation
      if (!summary.byPlatform[s.platform]) {
        summary.byPlatform[s.platform] = { count: 0, spend: 0, impressions: 0 };
      }
      summary.byPlatform[s.platform].count++;
      summary.byPlatform[s.platform].spend += s.spend30d;
      summary.byPlatform[s.platform].impressions += s.impressions30d;

      // Flag counts
      const flags = s.healthFlags as string[];
      if (Array.isArray(flags)) {
        for (const f of flags) {
          summary.flags[f] = (summary.flags[f] || 0) + 1;
        }
      }
    }

    return NextResponse.json({ summary, segments });
  } catch (error: any) {
    console.error("ABM active API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
