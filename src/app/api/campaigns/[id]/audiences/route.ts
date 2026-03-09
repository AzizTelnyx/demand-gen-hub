import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const audiences = await prisma.campaignAudience.findMany({
      where: { campaignId: id },
      orderBy: { audienceType: "asc" },
    });

    // Group by audienceType
    const grouped: Record<string, typeof audiences> = {};
    for (const a of audiences) {
      if (!grouped[a.audienceType]) grouped[a.audienceType] = [];
      grouped[a.audienceType].push(a);
    }

    return NextResponse.json({ audiences, grouped });
  } catch (error) {
    console.error("Error fetching audiences:", error);
    return NextResponse.json({ error: "Failed to fetch audiences" }, { status: 500 });
  }
}
