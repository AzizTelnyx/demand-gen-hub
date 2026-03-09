import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const strategy = await prisma.strategy.findUnique({
      where: { id },
      include: {
        initiatives: {
          include: {
            campaigns: { include: { campaign: true } },
            notes: { orderBy: { createdAt: "desc" }, take: 20 },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!strategy) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Rollup metrics
    const totalBudget = strategy.initiatives.reduce((a, i) => a + (i.budget || 0), 0);
    const totalSpent = strategy.initiatives.reduce((a, i) => a + (i.budgetSpent || 0), 0);
    const totalCampaigns = strategy.initiatives.reduce((a, i) => a + i.campaigns.length, 0);

    return NextResponse.json({ ...strategy, totalBudget, totalSpent, totalCampaigns });
  } catch (error) {
    console.error("Strategy GET error:", error);
    return NextResponse.json({ error: "Failed to fetch strategy" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, region, status, startDate, endDate } = body;
    const strategy = await prisma.strategy.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(region !== undefined && { region }),
        ...(status !== undefined && { status }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      },
    });
    return NextResponse.json(strategy);
  } catch (error) {
    console.error("Strategy PATCH error:", error);
    return NextResponse.json({ error: "Failed to update strategy" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Delete related initiatives first
    await prisma.initiativeNote.deleteMany({ where: { initiative: { strategyId: id } } });
    await prisma.initiativeCampaign.deleteMany({ where: { initiative: { strategyId: id } } });
    await prisma.initiative.deleteMany({ where: { strategyId: id } });
    await prisma.strategy.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Strategy DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete strategy" }, { status: 500 });
  }
}
