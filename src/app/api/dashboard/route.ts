import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const LOOKBACK_DAYS = 90;
const EXCLUDED_OPP_TYPES = ["Upsell", "Cross-sell", "Cross-Sell"];

export async function GET() {
  try {
    const campaigns = await prisma.campaign.findMany();
    const live = campaigns.filter(c => ["live", "active", "enabled"].includes(c.status));

    const totalSpend = live.reduce((a, c) => a + (c.spend || 0), 0);
    const totalBudget = live.reduce((a, c) => a + (c.budget || 0), 0);
    const totalClicks = live.reduce((a, c) => a + (c.clicks || 0), 0);
    const totalImpressions = live.reduce((a, c) => a + (c.impressions || 0), 0);
    // Only count Google Ads conversions (pixel + offline SF). LinkedIn/SA use attribution.
    const googleAdsConversions = live.filter(c => c.platform === "google_ads").reduce((a, c) => a + (c.conversions || 0), 0);
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

    // --- ABM Attribution for LinkedIn/StackAdapt ---
    const impressions = await prisma.adImpression.findMany({
      select: { domain: true, campaignName: true, impressions: true, clicks: true, cost: true, dateFrom: true, dateTo: true },
    });
    const opps = await prisma.sFOpportunity.findMany({
      where: { accountDomain: { not: null }, oppType: { notIn: EXCLUDED_OPP_TYPES } },
      select: { accountDomain: true, amount: true, createdDate: true, isClosed: true, isWon: true },
    });

    // domain -> opps map
    const domainOpps: Record<string, typeof opps> = {};
    for (const opp of opps) {
      const d = opp.accountDomain?.toLowerCase();
      if (!d) continue;
      if (!domainOpps[d]) domainOpps[d] = [];
      domainOpps[d].push(opp);
    }

    // Compute total ABM attribution (dedupe by opp)
    const seenOpps = new Set<string>();
    let abmInfluencedDeals = 0;
    let abmInfluencedPipeline = 0;
    for (const imp of impressions) {
      const matchedOpps = domainOpps[imp.domain.toLowerCase()];
      if (!matchedOpps) continue;
      for (const opp of matchedOpps) {
        const oppKey = `${opp.accountDomain}-${opp.amount}-${opp.createdDate?.getTime()}`;
        if (seenOpps.has(oppKey)) continue;
        if (opp.createdDate && imp.dateTo) {
          const lookbackStart = new Date(opp.createdDate.getTime() - LOOKBACK_DAYS * 86400000);
          if (imp.dateFrom && imp.dateFrom > opp.createdDate) continue;
          if (imp.dateTo < lookbackStart) continue;
        }
        seenOpps.add(oppKey);
        abmInfluencedDeals++;
        abmInfluencedPipeline += opp.amount || 0;
      }
    }

    // Channel breakdown
    const byPlatform: Record<string, { spend: number; clicks: number; impressions: number; conversions: number; count: number; budget: number }> = {};
    for (const c of live) {
      const p = c.platform || "unknown";
      if (!byPlatform[p]) byPlatform[p] = { spend: 0, clicks: 0, impressions: 0, conversions: 0, count: 0, budget: 0 };
      byPlatform[p].spend += c.spend || 0;
      byPlatform[p].clicks += c.clicks || 0;
      byPlatform[p].impressions += c.impressions || 0;
      // Only add conversions for Google Ads
      if (p === "google_ads") byPlatform[p].conversions += c.conversions || 0;
      byPlatform[p].count += 1;
      byPlatform[p].budget += c.budget || 0;
    }

    const channelPerformance = Object.entries(byPlatform).map(([platform, data]) => {
      const isABM = platform === "linkedin" || platform === "stackadapt" || platform === "reddit";
      return {
        channel: platform === "google_ads" ? "Google Ads" : platform === "stackadapt" ? "StackAdapt" : platform === "linkedin" ? "LinkedIn Ads" : platform === "reddit" ? "Reddit" : platform,
        spend: Math.round(data.spend),
        clicks: data.clicks,
        impressions: data.impressions,
        conversions: isABM ? null : data.conversions,
        conversionType: isABM ? "attribution" : "pixel",
        ctr: data.impressions > 0 ? +(data.clicks / data.impressions * 100).toFixed(2) : 0,
        cpc: data.clicks > 0 ? +(data.spend / data.clicks).toFixed(2) : 0,
        costPerConv: !isABM && data.conversions > 0 ? +(data.spend / data.conversions).toFixed(2) : null,
        count: data.count,
      };
    });

    // Top campaigns
    const topCampaigns = [...live].sort((a, b) => (b.spend || 0) - (a.spend || 0)).slice(0, 10).map(c => ({
      name: c.name, platform: c.platform, spend: c.spend || 0, budget: c.budget || 0,
      clicks: c.clicks || 0, impressions: c.impressions || 0, conversions: c.conversions || 0,
      ctr: c.impressions && c.impressions > 0 ? +(((c.clicks || 0) / c.impressions) * 100).toFixed(2) : 0,
    }));

    // === CRITICAL ALERTS ===
    const criticalAlerts: Array<{ severity: "critical" | "warning" | "info"; title: string; detail: string; count?: number }> = [];
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Helper: is campaign mature (>14 days old)?
    const isMature = (c: any) => {
      if (!c.startDate) return true; // no start date = assume mature
      return new Date(c.startDate) <= fourteenDaysAgo;
    };

    // Helper: is campaign BOFU? (parse from name)
    const isBofu = (c: any) => /\bBOFU\b/i.test(c.name);

    // Only consider mature campaigns (>14 days live)
    const matureLive = live.filter(isMature);
    const newLive = live.filter(c => !isMature(c));

    // 1. BOFU campaigns with $0 conversions and significant spend (Google Ads only — LinkedIn/SA use attribution)
    const bofuZeroConv = matureLive.filter(c => c.platform === "google_ads" && isBofu(c) && (c.conversions || 0) === 0 && (c.spend || 0) > 100);
    if (bofuZeroConv.length > 0) {
      const totalBurn = bofuZeroConv.reduce((a, c) => a + (c.spend || 0), 0);
      criticalAlerts.push({
        severity: "critical",
        title: `${bofuZeroConv.length} BOFU campaigns spending $${Math.round(totalBurn).toLocaleString()} with 0 conversions`,
        detail: bofuZeroConv.slice(0, 5).map(c => c.name).join(", ") + (bofuZeroConv.length > 5 ? ` +${bofuZeroConv.length - 5} more` : ""),
        count: bofuZeroConv.length,
      });
    }

    // 2. Campaigns expiring soon (within 7 days)
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiring = live.filter(c => c.endDate && new Date(c.endDate) <= sevenDays && new Date(c.endDate) > now);
    if (expiring.length > 0) {
      criticalAlerts.push({
        severity: "warning",
        title: `${expiring.length} campaigns ending within 7 days`,
        detail: expiring.map(c => {
          const days = Math.ceil((new Date(c.endDate!).getTime() - now.getTime()) / (24*60*60*1000));
          return `${c.name} (${days}d)`;
        }).join(", "),
        count: expiring.length,
      });
    }

    // 3. Zero impressions — mature campaigns only (new ones may be pending approval)
    const zeroImpressions = matureLive.filter(c => (c.impressions || 0) === 0);
    if (zeroImpressions.length > 0) {
      criticalAlerts.push({
        severity: "warning",
        title: `${zeroImpressions.length} campaigns with zero impressions (live >14 days)`,
        detail: zeroImpressions.slice(0, 5).map(c => c.name).join(", ") + (zeroImpressions.length > 5 ? ` +${zeroImpressions.length - 5} more` : ""),
        count: zeroImpressions.length,
      });
    }

    // 4. New campaigns still in learning phase (informational)
    if (newLive.length > 0) {
      criticalAlerts.push({
        severity: "info",
        title: `${newLive.length} campaigns in learning phase (<14 days)`,
        detail: newLive.slice(0, 5).map(c => c.name).join(", ") + (newLive.length > 5 ? ` +${newLive.length - 5} more` : ""),
        count: newLive.length,
      });
    }

    // === AUTOMATION RUNS ===
    let automationRuns: any[] = [];
    try {
      const runs = await prisma.automationRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 10,
      });
      automationRuns = runs.map(r => ({
        id: r.id, automation: r.automation, status: r.status,
        summary: r.summary, startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt?.toISOString(),
      }));
    } catch { /* table might be empty */ }

    // === TRACKERS ===
    let trackers: any[] = [];
    try {
      const items = await prisma.tracker.findMany({
        where: { status: { not: "done" } },
        orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
        take: 20,
      });
      trackers = items.map(t => ({
        id: t.id, category: t.category, title: t.title, status: t.status,
        priority: t.priority, dueDate: t.dueDate?.toISOString(), assignee: t.assignee,
        details: t.details ? JSON.parse(t.details) : null,
      }));
    } catch { /* table might be empty */ }

    // Campaign status distribution
    const statusCounts: Record<string, number> = {};
    campaigns.forEach(c => {
      const s = c.status || 'unknown';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    const campaignsByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    return NextResponse.json({
      campaignsByStatus,
      metrics: {
        totalSpend: Math.round(totalSpend), totalBudget: Math.round(totalBudget),
        totalClicks, totalImpressions,
        googleAdsConversions,
        abmInfluencedDeals, abmInfluencedPipeline: Math.round(abmInfluencedPipeline),
        ctr: +ctr.toFixed(2), cpc: +cpc.toFixed(2),
        liveCampaigns: live.length, totalCampaigns: campaigns.length,
      },
      channelPerformance,
      topCampaigns,
      criticalAlerts,
      automationRuns,
      trackers,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
