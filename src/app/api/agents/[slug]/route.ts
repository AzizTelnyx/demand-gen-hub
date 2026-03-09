import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const agent = await prisma.agent.findUnique({
      where: { slug },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, completedAt: true, output: true, findingsCount: true, recsCount: true },
        },
      },
    });
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json({ agent });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await request.json();

  const allowed = ["enabled", "model", "schedule", "description", "config", "platform"];
  const data: Record<string, any> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const agent = await prisma.agent.update({
      where: { slug },
      data,
    });
    return NextResponse.json({ agent });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Agent not found" }, { status: 404 });
  }
}
