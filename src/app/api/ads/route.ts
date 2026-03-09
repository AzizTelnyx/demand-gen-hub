import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Ads Library API — searches pre-synced AdCreative table.
 * No live API calls. All data from sync_creatives.py (runs every 6h).
 */

export async function POST(request: NextRequest) {
  try {
    const { query, status: statusFilter, platform: platformFilter, adType: adTypeFilter } = await request.json();
    if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

    // Build search conditions — all terms must match (AND logic)
    const stopWords = new Set(['the', 'a', 'an', 'our', 'my', 'all', 'show', 'me', 'find', 'search', 'for', 'in', 'on', 'with', 'and', 'or', 'ads', 'ad', 'creatives', 'creative']);
    const terms = query.split(/[\s,]+/)
      .map((w: string) => w.trim().toLowerCase())
      .filter((w: string) => w.length >= 2 && !stopWords.has(w));

    const whereConditions: any[] = [];

    // Each term must appear in campaignName, headlines, or descriptions
    for (const term of terms) {
      whereConditions.push({
        OR: [
          { campaignName: { contains: term, mode: 'insensitive' as const } },
          { headlines: { contains: term, mode: 'insensitive' as const } },
          { descriptions: { contains: term, mode: 'insensitive' as const } },
          { brandName: { contains: term, mode: 'insensitive' as const } },
        ],
      });
    }

    // Platform filter
    if (platformFilter && platformFilter !== 'all') {
      whereConditions.push({ platform: platformFilter });
    }

    // Status filter
    if (statusFilter === 'active') {
      whereConditions.push({ status: { in: ['enabled', 'active', 'live'] } });
    } else if (statusFilter === 'paused') {
      whereConditions.push({ status: { in: ['paused', 'ended'] } });
    }

    // Ad type filter
    if (adTypeFilter && adTypeFilter !== 'all') {
      const typeMap: Record<string, string[]> = {
        search: ['Responsive Search', 'Expanded Text'],
        display: ['Responsive Display', 'Display', 'DOOH'],
        video: ['Video', 'Video In-Stream', 'Video (YouTube)', 'Video (In-Stream)'],
        native: ['Native', 'Sponsored Content', 'Single Image', 'Carousel'],
      };
      const allowed = typeMap[adTypeFilter] || [];
      if (allowed.length > 0) {
        whereConditions.push({ adType: { in: allowed } });
      }
    }

    const results = await prisma.adCreative.findMany({
      where: whereConditions.length > 0 ? { AND: whereConditions } : {},
      orderBy: { campaignName: 'asc' },
      take: 200,
    });

    // Transform to match the existing frontend format
    const ads = results.map(r => ({
      platform: r.platform,
      campaignName: r.campaignName,
      adGroupName: r.adGroupName || '',
      adId: r.platformAdId,
      adType: r.adType,
      status: r.status,
      headlines: safeJsonParse(r.headlines, []),
      descriptions: safeJsonParse(r.descriptions, []),
      finalUrls: safeJsonParse(r.finalUrls, []),
      images: safeJsonParse(r.images, []),
      videos: safeJsonParse(r.videos, []),
      dimensions: safeJsonParse(r.dimensions, []),
      brandName: r.brandName,
      cta: r.cta,
    }));

    // Check for fallback (active filter returned 0 but ads exist)
    let didFallback = false;
    if (statusFilter === 'active' && ads.length === 0) {
      // Check if there are paused ads matching
      const anyCount = await prisma.adCreative.count({
        where: { AND: whereConditions.filter(c => !c.status) },
      });
      if (anyCount > 0) didFallback = true;
    }

    // Group by campaign + ad type
    const byCampaign: Record<string, typeof ads> = {};
    for (const ad of ads) {
      const key = `${ad.campaignName} — ${ad.adType}`;
      if (!byCampaign[key]) byCampaign[key] = [];
      byCampaign[key].push(ad);
    }

    return NextResponse.json({
      ads,
      byCampaign,
      keywords: terms,
      totalAds: ads.length,
      totalCampaigns: Object.keys(byCampaign).length,
      fallback: didFallback ? "No active ads found — showing all statuses instead" : null,
    });
  } catch (error: any) {
    console.error("Ads library error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function safeJsonParse(val: string | null | undefined, fallback: any): any {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const campaign = url.searchParams.get("campaign");

  if (!campaign) {
    // Browse mode — return campaign list
    const campaigns = await prisma.campaign.findMany({
      select: { name: true, platform: true, status: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ campaigns, mode: "browse" });
  }

  // Get all creatives for a specific campaign
  const creatives = await prisma.adCreative.findMany({
    where: { campaignName: { contains: campaign, mode: 'insensitive' } },
    orderBy: { adType: 'asc' },
  });

  const ads = creatives.map(r => ({
    platform: r.platform,
    campaignName: r.campaignName,
    adGroupName: r.adGroupName || '',
    adId: r.platformAdId,
    adType: r.adType,
    status: r.status,
    headlines: safeJsonParse(r.headlines, []),
    descriptions: safeJsonParse(r.descriptions, []),
    finalUrls: safeJsonParse(r.finalUrls, []),
    images: safeJsonParse(r.images, []),
    videos: safeJsonParse(r.videos, []),
  }));

  return NextResponse.json({ ads });
}
