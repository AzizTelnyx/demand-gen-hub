import { prisma } from "@/lib/prisma";

export interface TrackerCreateInput {
  title: string;
  agentType: string;
  requestedBy?: string;
  details?: Record<string, any>;
  priority?: "high" | "medium" | "low";
}

export type TrackerStatus =
  | "pending"
  | "in_progress"
  | "awaiting_approval"
  | "completed"
  | "failed";

export async function createTracker(input: TrackerCreateInput): Promise<string> {
  const tracker = await prisma.tracker.create({
    data: {
      category: "agent-task",
      title: input.title,
      status: "pending",
      priority: input.priority || "medium",
      assignee: input.agentType,
      details: JSON.stringify({
        agentType: input.agentType,
        requestedBy: input.requestedBy || "system",
        ...input.details,
      }),
    },
  });
  return tracker.id;
}

export async function updateTrackerStatus(
  trackerId: string,
  status: TrackerStatus,
  details?: Record<string, any>
): Promise<void> {
  const existing = await prisma.tracker.findUnique({ where: { id: trackerId } });
  const currentDetails = existing?.details ? JSON.parse(existing.details) : {};

  await prisma.tracker.update({
    where: { id: trackerId },
    data: {
      status,
      details: JSON.stringify({ ...currentDetails, ...details }),
      updatedAt: new Date(),
    },
  });
}

export async function getTrackersByAgent(agentType: string, limit = 20) {
  return prisma.tracker.findMany({
    where: { assignee: agentType, category: "agent-task" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
