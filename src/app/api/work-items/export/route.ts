import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/work-items/export — full JSON export for migration
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get('format') || 'json';

  const items = await prisma.workItem.findMany({
    include: {
      WorkItemUpdate: { orderBy: { createdAt: 'asc' } },
      other_WorkItem: {
        include: {
          WorkItemUpdate: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (format === 'csv') {
    const rows = items.map(i => [
      i.id, i.title, i.type, i.status, i.priority,
      i.platform || '', i.assignee || '', i.source,
      i.tags.join(';'), i.dueDate?.toISOString() || '',
      i.createdAt.toISOString(), i.completedAt?.toISOString() || '',
      i.WorkItemUpdate.length,
    ].join('\t'));

    const header = 'id\ttitle\ttype\tstatus\tpriority\tplatform\tassignee\tsource\ttags\tdueDate\tcreatedAt\tcompletedAt\tupdateCount';
    const tsv = [header, ...rows].join('\n');

    return new NextResponse(tsv, {
      headers: {
        'Content-Type': 'text/tab-separated-values',
        'Content-Disposition': `attachment; filename="work-items-${new Date().toISOString().split('T')[0]}.tsv"`,
      },
    });
  }

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    version: '1.0',
    count: items.length,
    items,
  });
}
