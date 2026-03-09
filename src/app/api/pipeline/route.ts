import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const HIDDEN_STAGES = ["0: AE Qualification", "AE Qualification:0"];
const EXCLUDED_TYPES = ["Upsell", "Cross-sell", "Cross-Sell"];
const LOOKBACK_DAYS = 90;

// Parse campaign name: "YYYYMM FUNNEL PRODUCT CHANNEL REGION"
function parseCampaignName(name: string) {
  const upper = name.toUpperCase();
  let funnel = "OTHER";
  if (upper.includes("TOFU")) funnel = "TOFU";
  else if (upper.includes("MOFU")) funnel = "MOFU";
  else if (upper.includes("BOFU")) funnel = "BOFU";
  else if (upper.includes("PARTNERSHIP") || upper.includes("BRAND")) funnel = "BRAND";

  let product = "Other";
  if (/voice\s*ai|ai\s*agent|vapi|elevenlabs/i.test(name)) product = "Voice AI";
  else if (/sip|trunking|porting/i.test(name)) product = "SIP Trunking";
  else if (/sms|messaging|mms/i.test(name)) product = "SMS API";
  else if (/iot|sim|esim/i.test(name)) product = "IoT";
  else if (/voice\s*api|programmable.voice/i.test(name)) product = "Voice API";
  else if (/number|did|toll.free/i.test(name)) product = "Numbers";
  else if (/brand|twilio|competitor|contact.center/i.test(name)) product = "Brand";

  let region = "Global";
  if (/\bAMER\b/i.test(name)) region = "AMER";
  else if (/\bEMEA\b/i.test(name)) region = "EMEA";
  else if (/\bAPAC\b/i.test(name)) region = "APAC";
  else if (/\bGLOBAL\b/i.test(name)) region = "Global";
  else if (/\bUK\b/i.test(name)) region = "EMEA";
  else if (/\bCA\b/i.test(name) && !/campaign/i.test(name)) region = "AMER";

  return { funnel, product, region };
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const attrMode = url.searchParams.get("attribution") || "impressions";
    const platformFilter = url.searchParams.get("platform"); // linkedin | stackadapt | null=all
    const funnelFilter = url.searchParams.get("funnel");
    const productFilter = url.searchParams.get("product");
    const regionFilter = url.searchParams.get("region");
    const segment = "new"; // New Business only — no renewals/upsells/cross-sells

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); dateFilter.lte = d; }
    const createdDateWhere = from || to ? { createdDate: dateFilter } : {};

    const baseWhere = { oppType: { notIn: [...EXCLUDED_TYPES, "Renewal"] } };

    // --- Pipeline overview (always unfiltered by date) ---
    const stageData = await prisma.sFOpportunity.groupBy({
      by: ["stageName"], _sum: { amount: true }, _count: { id: true },
      where: { ...baseWhere, isClosed: false, stageName: { notIn: HIDDEN_STAGES } },
      orderBy: { _sum: { amount: "desc" } },
    });

    const wonData = await prisma.sFOpportunity.aggregate({
      _sum: { amount: true }, _count: { id: true },
      where: { ...baseWhere, isWon: true, ...createdDateWhere },
    });
    const lostData = await prisma.sFOpportunity.aggregate({
      _sum: { amount: true }, _count: { id: true },
      where: { ...baseWhere, isClosed: true, isWon: false, ...createdDateWhere },
    });
    const openPipeline = await prisma.sFOpportunity.aggregate({
      _sum: { amount: true }, _count: { id: true },
      where: { ...baseWhere, isClosed: false, stageName: { notIn: HIDDEN_STAGES } },
    });

    // --- All opps with domains ---
    const allOpps = await prisma.sFOpportunity.findMany({
      where: { accountDomain: { not: null }, ...baseWhere, ...createdDateWhere },
      select: {
        id: true, name: true, amount: true, stageName: true,
        oppSource: true, oppSourceDetail: true, oppType: true,
        accountName: true, accountDomain: true, createdDate: true,
        isClosed: true, isWon: true,
      },
    });

    // --- Ad impressions with platform column ---
    const impressionWhere: any = {};
    if (platformFilter) impressionWhere.platform = platformFilter;
    const allImpressions = await prisma.adImpression.findMany({
      where: impressionWhere,
      select: { domain: true, campaignId: true, campaignName: true, impressions: true, clicks: true, cost: true, dateFrom: true, dateTo: true, platform: true },
    });

    // Apply funnel/product/region filters to impressions
    const filteredImpressions = allImpressions.filter(imp => {
      const parsed = parseCampaignName(imp.campaignName);
      if (funnelFilter && parsed.funnel !== funnelFilter) return false;
      if (productFilter && parsed.product !== productFilter) return false;
      if (regionFilter && parsed.region !== regionFilter) return false;
      return true;
    });

    // Build domain -> impression index
    const domainImpressions: Record<string, typeof filteredImpressions> = {};
    for (const imp of filteredImpressions) {
      if (!domainImpressions[imp.domain]) domainImpressions[imp.domain] = [];
      domainImpressions[imp.domain].push(imp);
    }

    // Available filter options (from all impressions, not filtered)
    const filterOptions = { funnels: new Set<string>(), products: new Set<string>(), regions: new Set<string>(), platforms: new Set<string>() };
    for (const imp of allImpressions) {
      const p = parseCampaignName(imp.campaignName);
      filterOptions.funnels.add(p.funnel);
      filterOptions.products.add(p.product);
      filterOptions.regions.add(p.region);
      if (imp.platform) filterOptions.platforms.add(imp.platform);
    }

    function getAdDataForDeal(domain: string, dealCreatedDate: Date | null) {
      const imps = domainImpressions[domain];
      if (!imps?.length) return null;
      const filtered = dealCreatedDate
        ? imps.filter(imp => {
            const lookbackStart = new Date(dealCreatedDate.getTime() - LOOKBACK_DAYS * 86400000);
            const impFrom = imp.dateFrom || new Date(0);
            const impTo = imp.dateTo || new Date();
            return impFrom <= dealCreatedDate && impTo >= lookbackStart;
          })
        : imps;
      if (!filtered.length) return null;

      const result = {
        totalImpressions: 0, totalClicks: 0, totalCost: 0,
        byPlatform: {} as Record<string, { impressions: number; clicks: number; cost: number }>,
        campaigns: [] as { name: string; impressions: number; clicks: number; cost: number; platform: string; funnel: string; product: string; region: string }[],
      };
      for (const imp of filtered) {
        result.totalImpressions += imp.impressions;
        result.totalClicks += imp.clicks;
        result.totalCost += imp.cost;
        const platform = imp.platform || (imp.campaignId?.startsWith("li_") ? "linkedin" : imp.campaignId?.startsWith("rd_") ? "reddit" : "stackadapt");
        if (!result.byPlatform[platform]) result.byPlatform[platform] = { impressions: 0, clicks: 0, cost: 0 };
        result.byPlatform[platform].impressions += imp.impressions;
        result.byPlatform[platform].clicks += imp.clicks;
        result.byPlatform[platform].cost += imp.cost;
        const parsed = parseCampaignName(imp.campaignName);
        result.campaigns.push({ name: imp.campaignName, impressions: imp.impressions, clicks: imp.clicks, cost: imp.cost, platform, ...parsed });
      }
      return result;
    }

    // Enrich opps
    const enriched = allOpps.map(opp => {
      const domain = opp.accountDomain?.toLowerCase();
      const adData = domain ? getAdDataForDeal(domain, opp.createdDate) : null;
      let isExposed = false;
      if (adData) {
        if (attrMode === "clicks") isExposed = adData.totalClicks > 0;
        else isExposed = adData.totalImpressions > 0;
      }
      return {
        ...opp, createdDate: opp.createdDate?.toISOString(), isExposed,
        adImpressions: adData?.totalImpressions || 0, adClicks: adData?.totalClicks || 0,
        adCost: adData?.totalCost || 0, adPlatforms: adData?.byPlatform || {},
        adCampaigns: isExposed ? adData!.campaigns.sort((a, b) => b.impressions - a.impressions).slice(0, 10) : [],
        campaignCount: adData?.campaigns.length || 0,
      };
    });

    function buildSegmentStats(opps: typeof enriched) {
      const exposed = opps.filter(o => o.isExposed);
      const unexposed = opps.filter(o => !o.isExposed);
      const exposedTotal = exposed.reduce((s, o) => s + o.amount, 0);
      const unexposedTotal = unexposed.reduce((s, o) => s + o.amount, 0);
      const exposedAvg = exposed.length > 0 ? exposedTotal / exposed.length : 0;
      const unexposedAvg = unexposed.length > 0 ? unexposedTotal / unexposed.length : 0;
      const eWon = exposed.filter(o => o.isWon).length;
      const eClosed = exposed.filter(o => o.isClosed).length;
      const uWon = unexposed.filter(o => o.isWon).length;
      const uClosed = unexposed.filter(o => o.isClosed).length;
      const eWinRate = eClosed > 0 ? (eWon / eClosed) * 100 : 0;
      const uWinRate = uClosed > 0 ? (uWon / uClosed) * 100 : 0;

      // By source
      const bySource: Record<string, { exposed: number; unexposed: number; exposedPipeline: number; unexposedPipeline: number }> = {};
      for (const o of [...exposed, ...unexposed]) {
        const src = o.oppSource || "Unknown";
        if (!bySource[src]) bySource[src] = { exposed: 0, unexposed: 0, exposedPipeline: 0, unexposedPipeline: 0 };
        if (o.isExposed) { bySource[src].exposed++; bySource[src].exposedPipeline += o.amount; }
        else { bySource[src].unexposed++; bySource[src].unexposedPipeline += o.amount; }
      }

      // By stage
      const byStage: Record<string, { count: number; pipeline: number }> = {};
      for (const o of exposed) {
        if (HIDDEN_STAGES.includes(o.stageName)) continue;
        if (!byStage[o.stageName]) byStage[o.stageName] = { count: 0, pipeline: 0 };
        byStage[o.stageName].count++; byStage[o.stageName].pipeline += o.amount;
      }

      // By product (from campaign names of exposed deals)
      const byProduct: Record<string, { count: number; pipeline: number; impressions: number }> = {};
      for (const o of exposed) {
        for (const c of o.adCampaigns) {
          if (!byProduct[c.product]) byProduct[c.product] = { count: 0, pipeline: 0, impressions: 0 };
          byProduct[c.product].count++;
          byProduct[c.product].pipeline += o.amount;
          byProduct[c.product].impressions += c.impressions;
        }
      }

      // By funnel
      const byFunnel: Record<string, { count: number; pipeline: number; impressions: number }> = {};
      for (const o of exposed) {
        for (const c of o.adCampaigns) {
          if (!byFunnel[c.funnel]) byFunnel[c.funnel] = { count: 0, pipeline: 0, impressions: 0 };
          byFunnel[c.funnel].count++;
          byFunnel[c.funnel].pipeline += o.amount;
          byFunnel[c.funnel].impressions += c.impressions;
        }
      }

      return {
        total: opps.length,
        exposed: { count: exposed.length, pipeline: exposedTotal, avgDeal: exposedAvg, winRate: eWinRate, wonCount: eWon },
        unexposed: { count: unexposed.length, pipeline: unexposedTotal, avgDeal: unexposedAvg, winRate: uWinRate, wonCount: uWon },
        lift: {
          dealSizeLift: unexposedAvg > 0 ? ((exposedAvg - unexposedAvg) / unexposedAvg) * 100 : 0,
          winRateLift: uWinRate > 0 ? ((eWinRate - uWinRate) / uWinRate) * 100 : 0,
        },
        bySource: Object.entries(bySource).map(([source, d]) => ({ source, ...d })),
        byStage: Object.entries(byStage).map(([stage, d]) => ({ stage, ...d })),
        byProduct: Object.entries(byProduct).map(([product, d]) => ({ product, ...d })).sort((a, b) => b.pipeline - a.pipeline),
        byFunnel: Object.entries(byFunnel).map(([funnel, d]) => ({ funnel, ...d })).sort((a, b) => b.pipeline - a.pipeline),
      };
    }

    // Campaign → Deal mapping
    const campaignDeals: Record<string, {
      pipeline: number; deals: any[]; impressions: number; cost: number;
      wonAmount: number; wonCount: number; platform: string; funnel: string; product: string; region: string;
    }> = {};

    for (const opp of enriched.filter(o => o.isExposed)) {
      for (const camp of opp.adCampaigns) {
        if (!campaignDeals[camp.name]) {
          campaignDeals[camp.name] = { pipeline: 0, deals: [], impressions: 0, cost: 0, wonAmount: 0, wonCount: 0, platform: camp.platform, funnel: camp.funnel, product: camp.product, region: camp.region };
        }
        const cd = campaignDeals[camp.name];
        cd.pipeline += opp.amount; cd.impressions += camp.impressions; cd.cost += camp.cost;
        if (opp.isWon) { cd.wonAmount += opp.amount; cd.wonCount++; }
        cd.deals.push({
          name: opp.name, accountName: opp.accountName, amount: opp.amount,
          stage: opp.stageName, oppType: opp.oppType, oppSource: opp.oppSource,
          isWon: opp.isWon, isClosed: opp.isClosed, impressions: camp.impressions,
        });
      }
    }

    const campaignInfluence = Object.entries(campaignDeals)
      .map(([name, d]) => ({
        name, pipeline: d.pipeline, dealCount: d.deals.length, impressions: d.impressions,
        cost: d.cost, wonAmount: d.wonAmount, wonCount: d.wonCount,
        roi: d.cost > 0 ? d.pipeline / d.cost : 0, platform: d.platform,
        funnel: d.funnel, product: d.product, region: d.region,
        deals: d.deals.sort((a, b) => b.amount - a.amount).slice(0, 15),
      }))
      .sort((a, b) => b.pipeline - a.pipeline)
      .slice(0, 30);

    // Open exposed deals
    const openExposedDeals = enriched
      .filter(o => o.isExposed && !o.isClosed && !HIDDEN_STAGES.includes(o.stageName))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 30);

    // Platform totals
    const platformTotals: Record<string, { impressions: number; clicks: number; cost: number; dealCount: number; pipeline: number }> = {};
    for (const opp of enriched.filter(o => o.isExposed)) {
      for (const [plat, stats] of Object.entries(opp.adPlatforms)) {
        if (!platformTotals[plat]) platformTotals[plat] = { impressions: 0, clicks: 0, cost: 0, dealCount: 0, pipeline: 0 };
        platformTotals[plat].impressions += (stats as any).impressions;
        platformTotals[plat].clicks += (stats as any).clicks;
        platformTotals[plat].cost += (stats as any).cost;
        platformTotals[plat].dealCount++;
        platformTotals[plat].pipeline += opp.amount;
      }
    }

    return NextResponse.json({
      attributionMode: attrMode,
      platformTotals,
      filters: {
        platforms: [...filterOptions.platforms],
        funnels: [...filterOptions.funnels].sort(),
        products: [...filterOptions.products].sort(),
        regions: [...filterOptions.regions].sort(),
        active: { platform: platformFilter, funnel: funnelFilter, product: productFilter, region: regionFilter, segment },
      },
      summary: {
        openPipeline: { amount: openPipeline._sum.amount || 0, count: openPipeline._count.id },
        adInfluencedPipeline: {
          amount: enriched.filter(o => o.isExposed && !o.isClosed).reduce((s, o) => s + o.amount, 0),
          count: enriched.filter(o => o.isExposed && !o.isClosed).length,
        },
        won: { amount: wonData._sum.amount || 0, count: wonData._count.id },
        lost: { amount: lostData._sum.amount || 0, count: lostData._count.id },
        winRate: (wonData._count.id + lostData._count.id) > 0
          ? (wonData._count.id / (wonData._count.id + lostData._count.id)) * 100 : 0,
        dateRange: { from: from || null, to: to || null },
      },
      stages: stageData.map(s => ({ stage: s.stageName, amount: s._sum.amount || 0, count: s._count.id })),
      attribution: buildSegmentStats(enriched),
      lookbackDays: LOOKBACK_DAYS,
      campaignInfluence,
      openExposedDeals,
    });
  } catch (error: any) {
    console.error("Pipeline API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
