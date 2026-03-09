import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const platform = url.searchParams.get("platform");
    const changeType = url.searchParams.get("changeType");
    const campaign = url.searchParams.get("campaign");
    const days = parseInt(url.searchParams.get("days") || "30");

    const where: any = {};
    if (platform) where.platform = platform;
    if (changeType) where.changeType = changeType;
    if (campaign) where.campaignName = { contains: campaign, mode: "insensitive" };

    const since = new Date();
    since.setDate(since.getDate() - days);
    where.timestamp = { gte: since };

    const changes = await prisma.campaignChange.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 500,
    });

    // Stats
    const allRecent = await prisma.campaignChange.findMany({
      where: { timestamp: { gte: since } },
      select: { changeType: true, platform: true, source: true },
    });

    const byType: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    allRecent.forEach(c => {
      byType[c.changeType] = (byType[c.changeType] || 0) + 1;
      byPlatform[c.platform] = (byPlatform[c.platform] || 0) + 1;
      bySource[c.source] = (bySource[c.source] || 0) + 1;
    });

    // Get distinct values for filters
    const changeTypes = [...new Set(allRecent.map(c => c.changeType))].sort();
    const platforms = [...new Set(allRecent.map(c => c.platform))].sort();
    const sources = [...new Set(allRecent.map(c => c.source))].sort();

    return NextResponse.json({
      changes: changes.map(c => ({
        ...c,
        timestamp: c.timestamp.toISOString(),
        createdAt: c.createdAt.toISOString(),
      })),
      stats: { total: allRecent.length, byType, byPlatform, bySource },
      filters: { changeTypes, platforms, sources },
    });
  } catch (error) {
    console.error("Optimizations API error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignName, platform, changeType, description, oldValue, newValue, source, actor, timestamp } = body;

    if (!campaignName || !platform || !changeType || !description) {
      return NextResponse.json({ error: "campaignName, platform, changeType, description required" }, { status: 400 });
    }

    const change = await prisma.campaignChange.create({
      data: {
        campaignName,
        platform,
        changeType,
        description,
        oldValue: oldValue || null,
        newValue: newValue || null,
        source: source || "manual",
        actor: actor || null,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      },
    });

    return NextResponse.json({ ok: true, change });
  } catch (error) {
    console.error("Create change error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
