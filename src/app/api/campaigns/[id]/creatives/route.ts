import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Find campaign to get name and platformId
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { name: true, platformId: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Match creatives by campaignId (platformId) or campaignName
    const creatives = await prisma.adCreative.findMany({
      where: {
        OR: [
          ...(campaign.platformId ? [{ campaignId: campaign.platformId }] : []),
          { campaignName: campaign.name },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ creatives });
  } catch (error) {
    console.error("Error fetching creatives:", error);
    return NextResponse.json({ error: "Failed to fetch creatives" }, { status: 500 });
  }
}
