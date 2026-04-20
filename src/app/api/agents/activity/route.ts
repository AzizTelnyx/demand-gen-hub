import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/agents/activity
 * 
 * Returns agent runs with full output for the activity feed.
 * Query: ?limit=20&autonomous=true&minConfidence=HIGH
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const autonomous = searchParams.get("autonomous") === "true";
    const runId = searchParams.get("runId"); // Get single run detail

    if (runId) {
      const run = await prisma.agentRun.findUnique({
        where: { id: runId },
        include: {
          Agent: { select: { name: true, slug: true } },
          Recommendation: {
            orderBy: { createdAt: "desc" },
          },
        },
      });
      if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }

      const output = run.output ? JSON.parse(run.output) : null;
      const input = run.input ? JSON.parse(run.input) : null;

      return NextResponse.json({
        run: {
          id: run.id,
          agentName: run.Agent?.name || "Unknown",
          agentSlug: run.Agent?.slug || "",
          status: run.status,
          input,
          output,
          findingsCount: run.findingsCount,
          recsCount: run.recsCount,
          error: run.error,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          recommendations: run.Recommendation.map(r => ({
            id: r.id,
            type: r.type,
            severity: r.severity,
            target: r.target,
            action: r.action,
            rationale: r.rationale,
            impact: r.impact,
            status: r.status,
          })),
        },
      });
    }

    // Filter: significant activity only (launches, cron, campaign changes) unless ?all=true
    const showAll = searchParams.get("all") === "true";
    const agentFilter = searchParams.get("agent");
    const statusFilter = searchParams.get("status");
    const offset = parseInt(searchParams.get("offset") || "0");

    const significantAgents = [
      "campaign-orchestrator", "health-check", "campaign-optimizer",
    ];

    const runs = await prisma.agentRun.findMany({
      where: {
        status: statusFilter ? { equals: statusFilter } : { in: ["done", "failed"] },
        ...(agentFilter ? {
          Agent: { slug: agentFilter },
        } : !showAll ? {
          OR: [
            // Campaign orchestrator runs (launches)
            { Agent: { slug: { in: significantAgents } } },
            // Cron/system triggered runs
            { input: { contains: '"triggeredBy":"cron"' } },
            { input: { contains: '"triggeredBy":"system"' } },
            // Runs with recommendations (actionable)
            { recsCount: { gt: 0 } },
            // Follow-up executions (user-triggered agent runs)
            { input: { contains: '"followUp":true' } },
          ],
        } : {}),
        ...(autonomous ? {
          input: { contains: '"triggeredBy":"cron"' },
        } : {}),
      },
      include: {
        Agent: { select: { name: true, slug: true, model: true } },
        Recommendation: {
          where: { status: "pending" },
          select: { id: true },
        },
      },
      orderBy: { completedAt: "desc" },
      take: limit,
      skip: offset,
    });

    return NextResponse.json({
      runs: runs.map(r => {
        const output = r.output ? JSON.parse(r.output) : null;
        const input = r.input ? JSON.parse(r.input) : null;
        return {
          id: r.id,
          agentName: r.Agent?.name || "Unknown",
          agentSlug: r.Agent?.slug || "",
          model: r.Agent?.model || "",
          status: r.status,
          task: input?.message || input?.task || output?.summary?.slice(0, 100) || "Agent run",
          summary: output?.summary || null,
          findingsCount: r.findingsCount,
          recsCount: r.recsCount,
          pendingRecs: r.Recommendation.length,
          error: r.error,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          autonomous: input?.triggeredBy === "cron" || input?.triggeredBy === "system",
          confidence: output?.confidence || (r.findingsCount > 0 ? "HIGH" : null),
        };
      }),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
