import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST /api/work-items/:id/updates — add an update to a work item
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { author, type, content, metadata } = body;

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const update = await prisma.workItemUpdate.create({
    data: {
      workItemId: id,
      author: author || 'system',
      type: type || 'note',
      content,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  // Touch the parent work item's updatedAt
  await prisma.workItem.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(update, { status: 201 });
}
