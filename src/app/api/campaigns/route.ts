import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const LOOKBACK_DAYS = 90;
const EXCLUDED_OPP_TYPES = ["Upsell", "Cross-sell", "Cross-Sell"];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const status = searchParams.get("status");
    const includeAttribution = searchParams.get("attribution") !== "false";

    const where: Record<string, string> = {};
    if (platform && platform !== "all") where.platform = platform;
    if (status && status !== "all") where.status = status;

    const campaigns = await prisma.campaign.findMany({
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
    });

    // Get sync states
    const syncStates = await prisma.syncState.findMany();
    const syncStatesMap: Record<string, { lastSyncedAt: Date | null; status: string }> = {};
    for (const s of syncStates) {
      syncStatesMap[s.platform] = { lastSyncedAt: s.lastSyncedAt, status: s.status };
    }

    // Attribution enrichment for LinkedIn + StackAdapt campaigns
    let attributionMap: Record<string, { influencedDeals: number; influencedPipeline: number; impressions: number; clicks: number }> = {};

    if (includeAttribution) {
      // Get all ad impressions grouped by campaign
      const impressions = await prisma.adImpression.findMany({
        select: { domain: true, campaignName: true, impressions: true, clicks: true, cost: true, dateFrom: true, dateTo: true },
      });

      // Get all open + recently won opps with domains (New Business only)
      const opps = await prisma.sFOpportunity.findMany({
        where: {
          accountDomain: { not: null },
          oppType: { notIn: EXCLUDED_OPP_TYPES },
        },
        select: { accountDomain: true, amount: true, createdDate: true, isClosed: true, isWon: true },
      });

      // Build domain -> opps map
      const domainOpps: Record<string, typeof opps> = {};
      for (const opp of opps) {
        const d = opp.accountDomain?.toLowerCase();
        if (!d) continue;
        if (!domainOpps[d]) domainOpps[d] = [];
        domainOpps[d].push(opp);
      }

      // Build campaignName -> impression domains
      const campaignDomains: Record<string, { domain: string; impressions: number; clicks: number; dateFrom: Date | null; dateTo: Date | null }[]> = {};
      for (const imp of impressions) {
        if (!campaignDomains[imp.campaignName]) campaignDomains[imp.campaignName] = [];
        campaignDomains[imp.campaignName].push({
          domain: imp.domain,
          impressions: imp.impressions,
          clicks: imp.clicks,
          dateFrom: imp.dateFrom,
          dateTo: imp.dateTo,
        });
      }

      // For each campaign, find influenced deals via domain matching with 90-day lookback
      for (const [campName, impRecords] of Object.entries(campaignDomains)) {
        const seen = new Set<string>(); // dedupe opps
        let influencedDeals = 0;
        let influencedPipeline = 0;
        let totalImpressions = 0;
        let totalClicks = 0;

        for (const imp of impRecords) {
          totalImpressions += imp.impressions;
          totalClicks += imp.clicks;

          const matchedOpps = domainOpps[imp.domain.toLowerCase()];
          if (!matchedOpps) continue;

          for (const opp of matchedOpps) {
            const oppKey = `${opp.accountDomain}-${opp.amount}-${opp.createdDate?.getTime()}`;
            if (seen.has(oppKey)) continue;

            // 90-day lookback: impression must be within 90 days before opp creation
            if (opp.createdDate && imp.dateTo) {
              const lookbackStart = new Date(opp.createdDate.getTime() - LOOKBACK_DAYS * 86400000);
              if (imp.dateFrom && imp.dateFrom > opp.createdDate) continue;
              if (imp.dateTo < lookbackStart) continue;
            }

            seen.add(oppKey);
            influencedDeals++;
            influencedPipeline += opp.amount || 0;
          }
        }

        if (influencedDeals > 0 || totalImpressions > 0) {
          attributionMap[campName] = { influencedDeals, influencedPipeline, impressions: totalImpressions, clicks: totalClicks };
        }
      }
    }

    // Enrich campaigns with attribution
    const enriched = campaigns.map(c => {
      const attr = attributionMap[c.name] || null;
      return {
        ...c,
        // For LinkedIn/StackAdapt: attribution metrics replace pixel conversions
        attribution: (c.platform === "linkedin" || c.platform === "stackadapt" || c.platform === "reddit") ? attr : null,
        // For Google Ads: conversions come from all_conversions (pixel + offline SF)
        // Keep conversions field as-is
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
