import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/work-items/:id — single item with all updates
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await prisma.workItem.findUnique({
    where: { id },
    include: {
      WorkItemUpdate: { orderBy: { createdAt: 'desc' } },
      other_WorkItem: {
        include: {
          WorkItemUpdate: { orderBy: { createdAt: 'desc' }, take: 3 },
          _count: { select: { other_WorkItem: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      WorkItem: true,
      _count: { select: { other_WorkItem: true } },
    },
  });

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(item);
}

// PATCH /api/work-items/:id — update single item
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const {
    title, description, type, status, priority,
    platform, assignee, dueDate, tags, parentId,
    update, // Optional: add an update entry alongside the change
  } = body;

  const data: any = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (type !== undefined) data.type = type;
  if (priority !== undefined) data.priority = priority;
  if (platform !== undefined) data.platform = platform;
  if (assignee !== undefined) data.assignee = assignee;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (tags !== undefined) data.tags = tags;
  if (parentId !== undefined) data.parentId = parentId || null;

  if (status !== undefined) {
    data.status = status;
    if (status === 'done') data.completedAt = new Date();
    if (status !== 'done') data.completedAt = null;
  }

  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.workItem.update({
      where: { id },
      data,
      include: {
        WorkItemUpdate: { orderBy: { createdAt: 'desc' }, take: 5 },
        _count: { select: { other_WorkItem: true } },
      },
    });

    if (update) {
      await tx.workItemUpdate.create({
        data: { id: crypto.randomUUID(),
          workItemId: id,
          author: update.author || 'system',
          type: update.type || 'note',
          content: update.content,
          metadata: update.metadata ? JSON.stringify(update.metadata) : null,
        },
      });
    }

    return updated;
  });

  return NextResponse.json(item);
}

// DELETE /api/work-items/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.workItem.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
