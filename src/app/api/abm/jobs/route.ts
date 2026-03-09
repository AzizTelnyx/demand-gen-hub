import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — list jobs (optionally filter by status)
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const where: any = {};
  if (status) where.status = status;

  const jobs = await prisma.aBMJob.findMany({
    where,
    include: { list: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ jobs });
}

// POST — create a new job (and its list)
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Cancel a job
  if (body.action === "cancel") {
    await prisma.aBMJob.update({
      where: { id: body.jobId },
      data: { status: "cancelled" },
    });
    return NextResponse.json({ ok: true });
  }

  // Create new job
  const { query, target = 500 } = body;
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const clampedTarget = Math.min(Math.max(target, 10), 500);
  const listName = query.length > 60 ? query.slice(0, 57) + "..." : query;

  const list = await prisma.aBMList.create({
    data: { name: listName, query, source: "research-agent", count: 0 },
  });

  const job = await prisma.aBMJob.create({
    data: { query, listId: list.id, target: clampedTarget, status: "queued" },
  });

  return NextResponse.json({ ok: true, job: { ...job, listId: list.id, listName: list.name } });
}
