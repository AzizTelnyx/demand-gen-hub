import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const trackers = await prisma.tracker.findMany({
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    });
    return NextResponse.json({
      trackers: trackers.map(t => ({
        ...t,
        details: t.details ? JSON.parse(t.details) : null,
        metadata: t.metadata ? JSON.parse(t.metadata) : null,
        dueDate: t.dueDate?.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Trackers API error:", error);
    return NextResponse.json({ error: "Failed to load trackers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, title, status, priority, dueDate, assignee, details, metadata } = body;

    if (!category || !title) {
      return NextResponse.json({ error: "category and title required" }, { status: 400 });
    }

    const tracker = await prisma.tracker.create({
      data: { id: crypto.randomUUID(), updatedAt: new Date(),
        category,
        title,
        status: status || "pending",
        priority: priority || "medium",
        dueDate: dueDate ? new Date(dueDate) : null,
        assignee: assignee || null,
        details: details ? JSON.stringify(details) : null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    return NextResponse.json({ ok: true, tracker });
  } catch (error) {
    console.error("Tracker create error:", error);
    return NextResponse.json({ error: "Failed to create tracker" }, { status: 500 });
  }
}
