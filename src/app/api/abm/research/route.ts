import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — start a research job (generate new list OR expand existing)
export async function POST(request: NextRequest) {
  try {
    const { query, target = 200, listId, listType = "vertical", description, createdBy } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }

    const clampedTarget = Math.min(Math.max(target, 10), 500);

    // Expand existing list
    if (listId) {
      const existingList = await prisma.aBMList.findUnique({ where: { id: listId } });
      if (!existingList) {
        return NextResponse.json({ error: "List not found" }, { status: 404 });
      }

      const job = await prisma.aBMJob.create({
        data: {
          query,
          listId,
          target: clampedTarget,
          status: "queued",
          jobType: "expand",
          createdBy,
        },
      });

      return NextResponse.json({
        ok: true,
        jobId: job.id,
        listId,
        listName: existingList.name,
        jobType: "expand",
        target: clampedTarget,
        message: `Expansion job queued — adding up to ${clampedTarget} companies to "${existingList.name}"`,
      });
    }

    // Generate new list
    const listName = query.length > 80 ? query.slice(0, 77) + "..." : query;

    const list = await prisma.aBMList.create({
      data: {
        name: listName,
        query,
        listType,
        description,
        source: "research-agent",
        createdBy,
      },
    });

    const job = await prisma.aBMJob.create({
      data: {
        query,
        listId: list.id,
        target: clampedTarget,
        status: "queued",
        jobType: "generate",
        createdBy,
      },
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      listId: list.id,
      listName,
      listType,
      jobType: "generate",
      target: clampedTarget,
      message: `Job queued — finding up to ${clampedTarget} companies`,
    });
  } catch (error: any) {
    console.error("ABM research error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
