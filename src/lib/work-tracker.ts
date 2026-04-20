/**
 * Work Tracker — shared utility for creating/updating work items from anywhere.
 * Used by agents, sync scripts, and Ares (via API).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type WorkItemType = 'launch' | 'optimization' | 'initiative' | 'task' | 'blocker';
export type WorkItemStatus = 'backlog' | 'upcoming' | 'in_progress' | 'done' | 'blocked';
export type WorkItemPriority = 'p0' | 'p1' | 'p2';

export interface CreateWorkItemInput {
  title: string;
  type: WorkItemType;
  description?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  platform?: string;
  assignee?: string;
  source: 'conversation' | 'agent' | 'sync' | 'manual';
  sourceRef?: string;
  dueDate?: Date;
  tags?: string[];
  parentId?: string;
  initialNote?: string;
  author?: string;
}

export interface AddUpdateInput {
  workItemId: string;
  author: string;
  type: 'note' | 'status_change' | 'decision' | 'blocker' | 'completion';
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Create a work item with optional initial update note.
 */
export async function createWorkItem(input: CreateWorkItemInput) {
  const item = await prisma.workItem.create({
    data: { id: crypto.randomUUID(), updatedAt: new Date(),
      title: input.title,
      type: input.type,
      description: input.description || null,
      status: input.status || 'backlog',
      priority: input.priority || 'p1',
      platform: input.platform || null,
      assignee: input.assignee || null,
      source: input.source,
      sourceRef: input.sourceRef || null,
      dueDate: input.dueDate || null,
      tags: input.tags || [],
      parentId: input.parentId || null,
      WorkItemUpdate: input.initialNote ? {
        create: {
          id: crypto.randomUUID(),
          author: input.author || input.source,
          type: 'note',
          content: input.initialNote,
        },
      } : undefined,
    },
  });
  return item;
}

/**
 * Add an update to an existing work item.
 */
export async function addWorkItemUpdate(input: AddUpdateInput) {
  const update = await prisma.workItemUpdate.create({
    data: { id: crypto.randomUUID(),
      workItemId: input.workItemId,
      author: input.author,
      type: input.type,
      content: input.content,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  await prisma.workItem.update({
    where: { id: input.workItemId },
    data: { updatedAt: new Date() },
  });

  return update;
}

/**
 * Find a work item by title substring (for dedup / linking).
 */
export async function findWorkItem(titleContains: string, status?: WorkItemStatus) {
  return prisma.workItem.findFirst({
    where: {
      title: { contains: titleContains, mode: 'insensitive' },
      ...(status ? { status } : {}),
    },
    include: { WorkItemUpdate: { orderBy: { createdAt: 'desc' }, take: 3 } },
  });
}

/**
 * Complete a work item.
 */
export async function completeWorkItem(id: string, note?: string, author: string = 'system') {
  await prisma.workItem.update({
    where: { id },
    data: { status: 'done', completedAt: new Date() },
  });

  if (note) {
    await addWorkItemUpdate({
      workItemId: id,
      author,
      type: 'completion',
      content: note,
    });
  }
}

/**
 * Create work items from agent findings.
 * Deduplicates by checking if a similar item already exists.
 */
export async function createFromAgentRun(opts: {
  agentName: string;
  agentRunId?: string;
  findings: Array<{
    title: string;
    description?: string;
    priority?: WorkItemPriority;
    platform?: string;
    tags?: string[];
  }>;
}) {
  const created = [];

  for (const finding of opts.findings) {
    // Check for duplicate
    const existing = await findWorkItem(finding.title);
    if (existing) {
      // Add update to existing item instead
      await addWorkItemUpdate({
        workItemId: existing.id,
        author: `agent:${opts.agentName}`,
        type: 'note',
        content: `Agent re-flagged this issue. ${finding.description || ''}`.trim(),
      });
      continue;
    }

    const item = await createWorkItem({
      title: finding.title,
      type: 'task',
      description: finding.description,
      priority: finding.priority || 'p1',
      platform: finding.platform,
      source: 'agent',
      sourceRef: opts.agentRunId,
      tags: [...(finding.tags || []), opts.agentName],
      initialNote: `Flagged by ${opts.agentName} agent.${finding.description ? ' ' + finding.description : ''}`,
      author: `agent:${opts.agentName}`,
    });
    created.push(item);
  }

  return created;
}

/**
 * Create work items from campaign sync changes.
 * Groups related changes into a single item.
 */
export async function createFromSyncChanges(changes: Array<{
  campaignName: string;
  platform: string;
  changeType: string; // 'paused' | 'ended' | 'launched' | 'budget_change' | 'status_change'
  details?: string;
}>) {
  if (changes.length === 0) return null;

  // Group by change type
  const groups: Record<string, typeof changes> = {};
  for (const c of changes) {
    const key = c.changeType;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }

  const created = [];

  for (const [changeType, items] of Object.entries(groups)) {
    const typeLabels: Record<string, { type: WorkItemType; verb: string }> = {
      paused: { type: 'optimization', verb: 'paused' },
      ended: { type: 'optimization', verb: 'ended' },
      launched: { type: 'launch', verb: 'launched' },
      budget_change: { type: 'optimization', verb: 'budget changed' },
      status_change: { type: 'task', verb: 'status changed' },
    };

    const label = typeLabels[changeType] || { type: 'task' as WorkItemType, verb: changeType };
    const platforms = [...new Set(items.map(i => i.platform))];
    const platformStr = platforms.length === 1 ? platforms[0] : 'cross-platform';
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const title = items.length === 1
      ? `${items[0].campaignName} — ${label.verb}`
      : `${items.length} campaigns ${label.verb} (${date})`;

    const description = items.map(i =>
      `- ${i.campaignName} (${i.platform})${i.details ? ': ' + i.details : ''}`
    ).join('\n');

    // Check for existing recent item with same title pattern
    const existing = await findWorkItem(title);
    if (existing) continue;

    const item = await createWorkItem({
      title,
      type: label.type,
      status: changeType === 'launched' ? 'in_progress' : 'done',
      platform: platforms.length === 1 ? platforms[0] : 'all',
      source: 'sync',
      tags: ['auto-detected', changeType],
      initialNote: description,
      author: 'sync',
    });
    created.push(item);
  }

  return created;
}
