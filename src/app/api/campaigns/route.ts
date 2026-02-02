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

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    // Get sync states
    const syncStates = await prisma.syncState.findMany();

    return NextResponse.json({
      campaigns,
      syncStates: syncStates.reduce((acc, s) => {
        acc[s.platform] = {
          lastSyncedAt: s.lastSyncedAt,
          status: s.status,
        };
        return acc;
      }, {} as Record<string, { lastSyncedAt: Date | null; status: string }>),
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}
