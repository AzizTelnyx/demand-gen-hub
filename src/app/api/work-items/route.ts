import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/work-items — list with filters
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const status = params.get('status');        // comma-separated
  const type = params.get('type');            // comma-separated
  const platform = params.get('platform');
  const assignee = params.get('assignee');
  const parentId = params.get('parentId');    // null = top-level only
  const includeChildren = params.get('includeChildren') === 'true';
  const limit = parseInt(params.get('limit') || '100');
  const offset = parseInt(params.get('offset') || '0');

  const where: any = {};

  if (status) {
    where.status = { in: status.split(',') };
  }
  if (type) {
    where.type = { in: type.split(',') };
  }
  if (platform) {
    where.platform = platform;
  }
  if (assignee) {
    where.assignee = assignee;
  }
  if (parentId === 'null' || (!parentId && !includeChildren)) {
    where.parentId = null; // top-level items only by default
  } else if (parentId) {
    where.parentId = parentId;
  }

  const [items, total] = await Promise.all([
    prisma.workItem.findMany({
      where,
      include: {
        WorkItemUpdate: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        other_WorkItem: includeChildren ? {
          include: {
            WorkItemUpdate: {
              orderBy: { createdAt: 'desc' },
              take: 3,
            },
          },
          orderBy: { createdAt: 'desc' },
        } : false,
        _count: { select: { other_WorkItem: true } },
      },
      orderBy: [
        { status: 'asc' },
        { priority: 'asc' },
        { updatedAt: 'desc' },
      ],
      take: limit,
      skip: offset,
    }),
    prisma.workItem.count({ where }),
  ]);

  return NextResponse.json({ items, total });
}

// POST /api/work-items — create
export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    title, description, type, status, priority,
    platform, assignee, source, sourceRef,
    dueDate, tags, parentId, initialUpdate,
  } = body;

  if (!title || !type) {
    return NextResponse.json({ error: 'title and type are required' }, { status: 400 });
  }

  const item = await prisma.workItem.create({
    data: { id: crypto.randomUUID(),
      updatedAt: new Date(),
      title,
      description: description || null,
      type,
      status: status || 'backlog',
      priority: priority || 'p1',
      platform: platform || null,
      assignee: assignee || null,
      source: source || 'manual',
      sourceRef: sourceRef || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      tags: tags || [],
      parentId: parentId || null,
      WorkItemUpdate: initialUpdate ? {
        create: {
          id: crypto.randomUUID(),
          author: initialUpdate.author || 'system',
          type: 'note',
          content: initialUpdate.content,
          metadata: initialUpdate.metadata ? JSON.stringify(initialUpdate.metadata) : null,
        },
      } : undefined,
    },
    include: { WorkItemUpdate: true },
  });

  return NextResponse.json(item, { status: 201 });
}

// PATCH /api/work-items — bulk update (status changes, etc.)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { ids, status, priority, assignee } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }

  const data: any = {};
  if (status) {
    data.status = status;
    if (status === 'done') data.completedAt = new Date();
  }
  if (priority) data.priority = priority;
  if (assignee !== undefined) data.assignee = assignee;

  const result = await prisma.workItem.updateMany({
    where: { id: { in: ids } },
    data,
  });

  return NextResponse.json({ updated: result.count });
}
