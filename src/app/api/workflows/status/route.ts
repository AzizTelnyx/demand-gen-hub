import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkflowState, listWorkflowRuns } from "@/lib/workflow-engine";

/**
 * GET /api/workflows/status
 * 
 * Get workflow run status. If workflowRunId provided, returns specific run.
 * Otherwise returns recent runs.
 * 
 * Query params: ?workflowRunId=xxx or ?status=running&limit=20
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workflowRunId = searchParams.get("workflowRunId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (workflowRunId) {
      const state = await getWorkflowState(workflowRunId);
      const context = JSON.parse(state.run.context || "{}");
      const phases = JSON.parse(state.workflow.steps || "[]");

      return NextResponse.json({
        workflowRunId: state.run.id,
        workflowName: state.workflow.name,
        status: state.run.status,
        currentStep: state.run.currentStep,
        phases: phases.map((p: any, i: number) => ({
          name: p.name,
          gate: p.gate,
          stepsCount: p.steps?.length || 0,
          completed: i < (Math.floor(state.run.currentStep / 100)),
        })),
        pendingApproval: state.pendingApproval,
        agentRuns: state.agentRuns.map((r: any) => ({
          id: r.id,
          agent: r.agent?.name || r.agentId,
          status: r.status,
          findingsCount: r.findingsCount,
          recsCount: r.recsCount,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          error: r.error,
        })),
        startedAt: state.run.startedAt,
        completedAt: state.run.completedAt,
      });
    }

    // List runs
    const runs = await listWorkflowRuns(status || undefined, limit);

    return NextResponse.json({
      runs: runs.map((r) => {
        const context = JSON.parse(r.context || "{}");
        return {
          id: r.id,
          workflowName: r.workflow.name,
          status: r.status,
          currentStep: r.currentStep,
          pendingApproval: context._pendingApproval || null,
          latestAgentRun: r.agentRuns[0]
            ? {
                agent: (r.agentRuns[0] as any).agent?.name,
                status: r.agentRuns[0].status,
              }
            : null,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
        };
      }),
      total: runs.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
