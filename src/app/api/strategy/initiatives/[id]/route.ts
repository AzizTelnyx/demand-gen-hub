import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const initiative = await prisma.initiative.findUnique({
      where: { id },
      include: {
        strategy: { select: { id: true, name: true } },
        campaigns: { include: { campaign: true } },
        notes: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!initiative) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(initiative);
  } catch (error) {
    console.error("Initiative GET error:", error);
    return NextResponse.json({ error: "Failed to fetch initiative" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const allowedFields = [
      "name", "description", "brief", "region", "vertical", "product",
      "funnel", "objective", "status", "budget", "budgetSpent",
      "goalType", "goalTarget", "goalCurrent", "platforms", "tags",
      "startDate", "endDate", "aiSummary", "aiLastCheck",
    ];
    const data: Record<string, unknown> = {};
    for (const f of allowedFields) {
      if (body[f] !== undefined) {
        if (f === "startDate" || f === "endDate" || f === "aiLastCheck") {
          data[f] = body[f] ? new Date(body[f]) : null;
        } else {
          data[f] = body[f];
        }
      }
    }
    const initiative = await prisma.initiative.update({ where: { id }, data });
    return NextResponse.json(initiative);
  } catch (error) {
    console.error("Initiative PATCH error:", error);
    return NextResponse.json({ error: "Failed to update initiative" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.initiativeNote.deleteMany({ where: { initiativeId: id } });
    await prisma.initiativeCampaign.deleteMany({ where: { initiativeId: id } });
    await prisma.initiative.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Initiative DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete initiative" }, { status: 500 });
  }
}
