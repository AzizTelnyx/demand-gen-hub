import { prisma } from "@/lib/prisma";
import { getAgent } from "@/agents/registry";
import { updateTrackerStatus } from "@/lib/tracker-bridge";

export type GateType = "none" | "approval" | "validation";

export interface WorkflowStep {
  name: string;
  agentSlug: string;
  config?: Record<string, any>;
  gate: GateType;
  /** Transform previous step output into this step's input */
  inputMapper?: (context: Record<string, any>) => Record<string, any>;
}

export interface WorkflowDefinition {
  slug: string;
  name: string;
  phases: WorkflowPhase[];
}

export interface WorkflowPhase {
  name: string;
  steps: WorkflowStep[];
  gate: GateType; // Gate after all steps in phase complete
}

export interface WorkflowState {
  workflowRunId: string;
  status: "running" | "paused" | "done" | "failed" | "cancelled";
  currentPhase: number;
  currentStep: number;
  context: Record<string, any>;
  phaseResults: Record<string, any>[];
}

/** Start a new workflow run */
export async function startWorkflow(
  workflowSlug: string,
  initialContext: Record<string, any>,
  trackerId?: string
): Promise<WorkflowState> {
  // Find or create workflow definition in DB
  let workflow = await prisma.workflow.findUnique({ where: { slug: workflowSlug } });
  if (!workflow) {
    throw new Error(`Workflow "${workflowSlug}" not found in DB`);
  }

  const run = await prisma.workflowRun.create({
    data: {
      workflowId: workflow.id,
      status: "running",
      context: JSON.stringify({ ...initialContext, trackerId }),
      currentStep: 0,
    },
  });

  const state: WorkflowState = {
    workflowRunId: run.id,
    status: "running",
    currentPhase: 0,
    currentStep: 0,
    context: { ...initialContext, trackerId },
    phaseResults: [],
  };

  // Execute until we hit a gate or finish
  return executeWorkflow(state, workflow);
}

/** Resume a paused workflow after approval */
export async function resumeWorkflow(
  workflowRunId: string,
  approved: boolean,
  feedback?: string
): Promise<WorkflowState> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: workflowRunId },
    include: { workflow: true },
  });
  if (!run) throw new Error("Workflow run not found");
  if (run.status !== "running") throw new Error(`Workflow is ${run.status}, not resumable`);

  const context = JSON.parse(run.context || "{}");

  if (!approved) {
    // Rejected — fail the workflow
    await prisma.workflowRun.update({
      where: { id: workflowRunId },
      data: { status: "cancelled", completedAt: new Date() },
    });
    if (context.trackerId) {
      await updateTrackerStatus(context.trackerId, "failed", { reason: feedback || "Rejected" });
    }
    return {
      workflowRunId,
      status: "cancelled",
      currentPhase: context._currentPhase || 0,
      currentStep: context._currentStep || 0,
      context: { ...context, rejectionFeedback: feedback },
      phaseResults: context._phaseResults || [],
    };
  }

  // Approved — advance to next phase
  const nextPhase = (context._currentPhase || 0) + 1;
  const state: WorkflowState = {
    workflowRunId,
    status: "running",
    currentPhase: nextPhase,
    currentStep: 0,
    context: { ...context, approvalFeedback: feedback },
    phaseResults: context._phaseResults || [],
  };

  return executeWorkflow(state, run.workflow);
}

/** Internal: execute workflow steps until gate or completion */
async function executeWorkflow(
  state: WorkflowState,
  workflow: { id: string; slug: string; steps: string }
): Promise<WorkflowState> {
  const definition: WorkflowPhase[] = JSON.parse(workflow.steps);

  while (state.currentPhase < definition.length) {
    const phase = definition[state.currentPhase];

    if (state.context.trackerId) {
      await updateTrackerStatus(state.context.trackerId, "in_progress", {
        phase: phase.name,
        phaseIndex: state.currentPhase,
      });
    }

    // Execute each step in the phase
    while (state.currentStep < phase.steps.length) {
      const step = phase.steps[state.currentStep];
      try {
        const result = await executeStep(step, state);
        // Store step result in context
        state.context[`step_${state.currentPhase}_${state.currentStep}`] = result;
        state.context[step.name] = result;
        state.currentStep++;
      } catch (err: any) {
        state.status = "failed";
        state.context._error = err.message;
        await persistState(state, workflow.id);
        if (state.context.trackerId) {
          await updateTrackerStatus(state.context.trackerId, "failed", { error: err.message });
        }
        return state;
      }
    }

    // Phase complete — collect phase result
    state.phaseResults.push({
      phase: phase.name,
      stepResults: phase.steps.map((s, i) => ({
        name: s.name,
        result: state.context[`step_${state.currentPhase}_${i}`],
      })),
    });

    // Check phase gate
    if (phase.gate === "approval") {
      state.status = "paused" as any; // We persist as "running" but with paused flag
      state.context._currentPhase = state.currentPhase;
      state.context._currentStep = 0;
      state.context._phaseResults = state.phaseResults;
      state.context._pendingApproval = {
        phase: phase.name,
        phaseIndex: state.currentPhase,
      };
      await persistState(state, workflow.id, "running"); // Keep as running, approval pending
      if (state.context.trackerId) {
        await updateTrackerStatus(state.context.trackerId, "awaiting_approval", {
          phase: phase.name,
        });
      }
      return state;
    }

    // Move to next phase
    state.currentPhase++;
    state.currentStep = 0;
  }

  // All phases complete
  state.status = "done";
  await persistState(state, workflow.id, "done");
  if (state.context.trackerId) {
    await updateTrackerStatus(state.context.trackerId, "completed");
  }
  return state;
}

/** Execute a single workflow step by running its agent */
async function executeStep(
  step: WorkflowStep,
  state: WorkflowState
): Promise<any> {
  const handler = getAgent(step.agentSlug);
  if (!handler) {
    // If no handler, treat step as a pass-through (e.g., for non-agent steps)
    return { skipped: true, reason: `No handler for ${step.agentSlug}` };
  }

  // Build input from context + step config
  const input = {
    task: step.name,
    context: state.context,
    config: step.config || {},
  };

  // Find agent in DB for the run record
  const agent = await prisma.agent.findUnique({ where: { slug: step.agentSlug } });

  const agentRun = await prisma.agentRun.create({
    data: {
      agentId: agent?.id || "unknown",
      workflowRunId: state.workflowRunId,
      status: "running",
      input: JSON.stringify(input),
      startedAt: new Date(),
    },
  });

  try {
    const output = await handler.run(input);

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: "done",
        output: JSON.stringify(output),
        findingsCount: output.findings.length,
        recsCount: output.recommendations.length,
        completedAt: new Date(),
      },
    });

    return output;
  } catch (err: any) {
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "failed", error: err.message, completedAt: new Date() },
    });
    throw err;
  }
}

/** Persist workflow state to DB */
async function persistState(
  state: WorkflowState,
  workflowId: string,
  dbStatus?: string
): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: state.workflowRunId },
    data: {
      status: dbStatus || state.status,
      context: JSON.stringify(state.context),
      currentStep: state.currentPhase * 100 + state.currentStep, // Encode phase+step
      completedAt: state.status === "done" ? new Date() : undefined,
    },
  });
}

/** Get workflow state from DB */
export async function getWorkflowState(workflowRunId: string): Promise<{
  run: any;
  workflow: any;
  agentRuns: any[];
  pendingApproval: any | null;
}> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: workflowRunId },
    include: {
      workflow: true,
      agentRuns: {
        orderBy: { createdAt: "asc" },
        include: { agent: true },
      },
    },
  });

  if (!run) throw new Error("Workflow run not found");

  const context = JSON.parse(run.context || "{}");
  const pendingApproval = context._pendingApproval || null;

  return { run, workflow: run.workflow, agentRuns: run.agentRuns, pendingApproval };
}

/** List active workflow runs */
export async function listWorkflowRuns(status?: string, limit = 20) {
  return prisma.workflowRun.findMany({
    where: status ? { status } : undefined,
    include: {
      workflow: true,
      agentRuns: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
