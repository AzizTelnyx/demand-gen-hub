import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Get all agents with their last run info
    const agents = await prisma.agent.findMany({
      orderBy: { createdAt: "asc" },
    });

    // Get last run + run counts for each agent
    const agentData = await Promise.all(
      agents.map(async (agent) => {
        const [lastRun, totalRuns, recentRuns] = await Promise.all([
          prisma.agentRun.findFirst({
            where: { agentId: agent.id },
            orderBy: { startedAt: "desc" },
            select: { id: true, status: true, startedAt: true, completedAt: true, output: true, findingsCount: true, recsCount: true },
          }),
          prisma.agentRun.count({ where: { agentId: agent.id } }),
          prisma.agentRun.count({
            where: { agentId: agent.id, startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          }),
        ]);

        // Determine status from last run
        let status = "idle";
        if (lastRun) {
          if (lastRun.status === "running") status = "running";
          else if (lastRun.status === "done" || lastRun.status === "completed") status = "done";
          else if (lastRun.status === "failed" || lastRun.status === "error") status = "failed";
        }

        return {
          slug: agent.slug,
          name: agent.name,
          description: agent.description,
          model: agent.model,
          enabled: agent.enabled,
          status,
          totalRuns,
          recentRuns,
          lastRun: lastRun?.completedAt || lastRun?.startedAt || null,
          lastRunStatus: lastRun?.status || null,
          lastRunFindings: lastRun?.findingsCount || 0,
          lastRunRecs: lastRun?.recsCount || 0,
          lastRunSummary: (lastRun?.output as any)?.summary?.slice(0, 200) || null,
        };
      })
    );

    return NextResponse.json({ agents: agentData });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
