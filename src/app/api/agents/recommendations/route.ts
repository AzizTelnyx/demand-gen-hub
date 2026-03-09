import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/agents/recommendations?status=pending&type=add-negative
 * Fetch recommendations with optional filters
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {};
  if (status) where.status = status;
  if (type) where.type = type;

  const recs = await prisma.recommendation.findMany({
    where,
    include: {
      agentRun: {
        select: {
          id: true,
          agent: { select: { name: true, slug: true } },
          completedAt: true,
          output: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Parse impact JSON for each rec
  const formatted = recs.map((r) => {
    let metadata: any = {};
    try { metadata = JSON.parse(r.impact || "{}"); } catch {}
    
    let runStats: any = {};
    try { runStats = JSON.parse(r.agentRun?.output || "{}"); } catch {}

    return {
      id: r.id,
      type: r.type,
      severity: r.severity,
      target: r.target,
      targetId: r.targetId,
      action: r.action,
      rationale: r.rationale,
      status: r.status,
      appliedAt: r.appliedAt,
      createdAt: r.createdAt,
      metadata,
      agentName: r.agentRun?.agent?.name || "Unknown",
      agentSlug: r.agentRun?.agent?.slug || "",
      runId: r.agentRun?.id,
      runDate: r.agentRun?.completedAt,
    };
  });

  // Summary counts
  const counts = await prisma.recommendation.groupBy({
    by: ["status"],
    _count: true,
    where: type ? { type } : undefined,
  });

  return NextResponse.json({
    recommendations: formatted,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
  });
}
