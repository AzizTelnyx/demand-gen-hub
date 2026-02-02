import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const actor = searchParams.get("actor");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Record<string, string> = {};
    if (actor && actor !== "all") where.actor = actor;

    const activities = await prisma.activity.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error("Error fetching activities:", error);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { actor, action, entityType, entityId, entityName, details } = body;

    const activity = await prisma.activity.create({
      data: {
        actor,
        action,
        entityType,
        entityId,
        entityName,
        details: details ? JSON.stringify(details) : null,
      },
    });

    return NextResponse.json({ activity });
  } catch (error) {
    console.error("Error creating activity:", error);
    return NextResponse.json(
      { error: "Failed to create activity" },
      { status: 500 }
    );
  }
}
