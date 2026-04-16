import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/recommendations
 * 
 * List recommendations with filters.
 * Query params: status, type, platform, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const type = searchParams.get("type") || undefined;
    const platform = searchParams.get("platform") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = { contains: type };
    if (platform) where.platform = platform;

    const [recommendations, total] = await Promise.all([
      prisma.recommendation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.recommendation.count({ where }),
    ]);

    // Group by type for summary
    const byType = await prisma.recommendation.groupBy({
      by: ["type"],
      where: status ? { status } : {},
      _count: true,
      orderBy: { _count: { type: "desc" } },
      take: 20,
    });

    return NextResponse.json({
      recommendations,
      total,
      byType: byType.map((t) => ({ type: t.type, count: t._count })),
      limit,
      offset,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
