import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Budget/spend data from synced AdImpression + Campaign tables (fast, DB-only)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultTo = now.toISOString().split("T")[0];

  const from = searchParams.get("from") || defaultFrom;
  const to = searchParams.get("to") || defaultTo;
  const platformFilter = searchParams.get("platform") || "all";
  const fromDate = new Date(from);
  const toDate = new Date(to + "T23:59:59.999Z");

  try {
    // Parallel queries: impressions aggregated + campaign snapshot data + budget plans + changes
    const platformWhere = platformFilter !== "all" ? `AND platform = '${platformFilter}'` : "";

    const [impByPlatform, impByCampaign, budgetPlans, recentChanges, campaigns] = await Promise.all([
      // Aggregated by platform
      prisma.$queryRawUnsafe<{ platform: string; spend: number; impressions: number; clicks: number; conversions: number; campaigns: number }[]>(`
        SELECT platform,
               ROUND(SUM(cost)::numeric, 2)::float AS spend,
               SUM(impressions)::int AS impressions,
               SUM(clicks)::int AS clicks,
               SUM(conversions)::int AS conversions,
               COUNT(DISTINCT "campaignName")::int AS campaigns
        FROM "AdImpression"
        WHERE "dateFrom" <= $1 AND "dateTo" >= $2 ${platformWhere}
        GROUP BY platform
        ORDER BY SUM(cost) DESC
      `, toDate, fromDate),

      // Top campaigns by spend
      prisma.$queryRawUnsafe<{ campaignName: string; platform: string; spend: number; impressions: number; clicks: number; conversions: number }[]>(`
        SELECT "campaignName", platform,
               ROUND(SUM(cost)::numeric, 2)::float AS spend,
               SUM(impressions)::int AS impressions,
               SUM(clicks)::int AS clicks,
               SUM(conversions)::int AS conversions
        FROM "AdImpression"
        WHERE "dateFrom" <= $1 AND "dateTo" >= $2 ${platformWhere}
        GROUP BY "campaignName", platform
        ORDER BY SUM(cost) DESC
        LIMIT 20
      `, toDate, fromDate),

      // Budget allocations (replaces removed BudgetPlan table)
      prisma.budgetAllocation.findMany({
        where: {
          year: fromDate.getFullYear(),
          month: { gte: fromDate.getMonth() + 1, lte: toDate.getMonth() + 1 },
        },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      }),

      // Recent budget changes
      prisma.budgetChange.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),

      // Campaign names for parsing (only campaigns that have impressions in range)
      prisma.$queryRawUnsafe<{ campaignName: string; platform: string; spend: number; impressions: number; clicks: number; conversions: number }[]>(`
        SELECT "campaignName", platform,
               ROUND(SUM(cost)::numeric, 2)::float AS spend,
               SUM(impressions)::int AS impressions,
               SUM(clicks)::int AS clicks,
               SUM(conversions)::int AS conversions
        FROM "AdImpression"
        WHERE "dateFrom" <= $1 AND "dateTo" >= $2 ${platformWhere}
        GROUP BY "campaignName", platform
      `, toDate, fromDate),
    ]);

    // Parse campaign names for breakdowns
    const { parseCampaignName } = await import("@/lib/parseCampaignName");
    const breakdowns = { product: {} as Record<string, any>, funnel: {} as Record<string, any>, region: {} as Record<string, any> };

    for (const c of campaigns) {
      const parsed = parseCampaignName(c.campaignName);
      for (const [dimKey, dimVal] of [
        ["product", parsed.product || "Other"],
        ["funnel", parsed.funnelStage || "Other"],
        ["region", parsed.region || "Other"],
      ] as [string, string][]) {
        const map = breakdowns[dimKey as keyof typeof breakdowns];
        if (!map[dimVal]) map[dimVal] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, count: 0 };
        map[dimVal].spend += c.spend || 0;
        map[dimVal].impressions += c.impressions || 0;
        map[dimVal].clicks += c.clicks || 0;
        map[dimVal].conversions += c.conversions || 0;
        map[dimVal].count += 1;
      }
    }

    const mapToArray = (m: Record<string, any>) =>
      Object.entries(m).map(([name, d]) => ({ name, ...d })).sort((a: any, b: any) => b.spend - a.spend);

    const totalSpend = impByPlatform.reduce((s, p) => s + p.spend, 0);
    const totalImpressions = impByPlatform.reduce((s, p) => s + p.impressions, 0);
    const totalClicks = impByPlatform.reduce((s, p) => s + p.clicks, 0);
    const totalConversions = impByPlatform.reduce((s, p) => s + (p.conversions || 0), 0);
    const daysInRange = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000));
    const dailyRate = totalSpend / daysInRange;
    const totalPlanned = budgetPlans.reduce((s: number, p: any) => s + p.planned, 0);

    return NextResponse.json({
      dateFrom: from,
      dateTo: to,
      daysInRange,
      totals: {
        spend: totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        conversions: totalConversions,
        dailyRate: Math.round(dailyRate * 100) / 100,
        ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
        cpc: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0,
        cpa: totalConversions > 0 ? Math.round((totalSpend / totalConversions) * 100) / 100 : 0,
        campaignCount: campaigns.length,
      },
      pacing: {
        totalPlanned,
        totalSpend,
        utilization: totalPlanned > 0 ? Math.round((totalSpend / totalPlanned) * 10000) / 100 : 0,
        dailyRate: Math.round(dailyRate * 100) / 100,
        projectedMonthly: Math.round(dailyRate * 30 * 100) / 100,
      },
      byPlatform: impByPlatform.map(p => ({
        name: p.platform,
        platform: p.platform,
        spend: p.spend,
        impressions: p.impressions,
        clicks: p.clicks,
        conversions: p.conversions || 0,
        count: p.campaigns,
        campaignCount: p.campaigns,
      })),
      byProduct: mapToArray(breakdowns.product),
      byFunnel: mapToArray(breakdowns.funnel),
      byRegion: mapToArray(breakdowns.region),
      topCampaigns: impByCampaign.map(c => ({
        name: c.campaignName,
        campaignId: c.campaignName,
        platform: c.platform,
        status: "active",
        spend: c.spend,
        impressions: c.impressions,
        clicks: c.clicks,
        conversions: c.conversions || 0,
        ctr: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
        avgCpc: c.clicks > 0 ? Math.round((c.spend / c.clicks) * 100) / 100 : 0,
        cpa: (c.conversions || 0) > 0 ? Math.round((c.spend / c.conversions) * 100) / 100 : 0,
      })),
      budgetPlans,
      recentChanges,
    });
  } catch (error: any) {
    console.error("Error fetching budget:", error);
    return NextResponse.json(
      { error: "Failed to fetch budget data", detail: error?.message },
      { status: 500 }
    );
  }
}

// POST/DELETE for BudgetPlan removed 2026-03-11 — use /api/budget-allocations instead
