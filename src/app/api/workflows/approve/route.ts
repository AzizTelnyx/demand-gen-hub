import { NextRequest, NextResponse } from "next/server";
import { resumeWorkflow } from "@/lib/workflow-engine";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/workflows/approve
 * 
 * Approve or reject a pending workflow step / recommendation.
 * 
 * Input: { workflowRunId?, recommendationId?, approved, feedback? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workflowRunId, recommendationId, approved, feedback } = body;

    // ── Approve/reject a workflow step ────────────────────────
    if (workflowRunId) {
      const state = await resumeWorkflow(workflowRunId, approved, feedback);
      return NextResponse.json({
        ok: true,
        workflowRunId,
        status: state.status,
        currentPhase: state.currentPhase,
        summary: approved
          ? `Workflow approved. Status: ${state.status}, phase: ${state.currentPhase}`
          : `Workflow rejected. ${feedback || ""}`,
      });
    }

    // ── Approve/reject a recommendation ──────────────────────
    if (recommendationId) {
      const rec = await prisma.recommendation.findUnique({
        where: { id: recommendationId },
      });
      if (!rec) {
        return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
      }

      const newStatus = approved ? "approved" : "rejected";
      await prisma.recommendation.update({
        where: { id: recommendationId },
        data: { id: crypto.randomUUID(),
          status: newStatus,
          appliedAt: approved ? new Date() : undefined,
        },
      });

      // Log to activity
      await prisma.activity.create({
        data: { id: crypto.randomUUID(),
          actor: "user",
          action: approved ? "approved" : "rejected",
          entityType: "recommendation",
          entityId: recommendationId,
          entityName: rec.target || undefined,
          details: JSON.stringify({
            type: rec.type,
            action: rec.action,
            feedback,
          }),
        },
      });

      return NextResponse.json({
        ok: true,
        recommendationId,
        status: newStatus,
        summary: `Recommendation ${newStatus}${feedback ? `: ${feedback}` : ""}`,
      });
    }

    return NextResponse.json(
      { error: "Either workflowRunId or recommendationId is required" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
