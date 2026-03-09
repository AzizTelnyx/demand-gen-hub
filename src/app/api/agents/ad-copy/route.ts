import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgent } from "@/agents/registry";

// GET: fetch pending ad copy recommendations
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") || "pending";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");

  const recs = await prisma.recommendation.findMany({
    where: {
      type: "ad-copy",
      status,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      agentRun: {
        select: { id: true, createdAt: true, agent: { select: { slug: true, name: true } } },
      },
    },
  });

  return NextResponse.json({ recommendations: recs, count: recs.length });
}

// POST: generate new ad copy on demand
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task, platform, product, funnel, competitor } = body;

    const agent = getAgent("ad-copy-generator");
    if (!agent) {
      return NextResponse.json({ error: "ad-copy-generator agent not found" }, { status: 500 });
    }

    const result = await agent.run({
      task: task || `Generate ${platform || "google_ads"} ad copy`,
      context: {
        platform: platform || "google_ads",
        product,
        funnel: funnel || "MOFU",
        competitor,
      },
    });

    // Save agent run
    const dbAgent = await prisma.agent.findUnique({ where: { slug: "ad-copy-generator" } });
    if (dbAgent) {
      const run = await prisma.agentRun.create({
        data: {
          agentId: dbAgent.id,
          status: "done",
          input: JSON.stringify(body),
          output: JSON.stringify(result),
          findingsCount: result.findings.length,
          recsCount: result.recommendations.length,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });

      // Save recommendations
      for (const rec of result.recommendations) {
        await prisma.recommendation.create({
          data: {
            agentRunId: run.id,
            type: rec.type,
            severity: rec.severity,
            target: rec.target,
            targetId: rec.targetId,
            action: rec.action,
            rationale: rec.rationale,
            impact: rec.impact,
            status: "pending",
          },
        });
      }
    }

    return NextResponse.json({ result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: approve/reject recommendations
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { recommendationId, action } = body; // action: "approve" | "reject" | "dismiss"

    if (!recommendationId || !action) {
      return NextResponse.json({ error: "recommendationId and action required" }, { status: 400 });
    }

    const statusMap: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      dismiss: "dismissed",
    };
    const newStatus = statusMap[action];
    if (!newStatus) {
      return NextResponse.json({ error: "action must be approve, reject, or dismiss" }, { status: 400 });
    }

    const rec = await prisma.recommendation.update({
      where: { id: recommendationId },
      data: {
        status: newStatus,
        appliedAt: action === "approve" ? new Date() : undefined,
      },
    });

    return NextResponse.json({ recommendation: rec });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
