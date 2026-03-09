import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const activities = await prisma.activity.findMany({
      orderBy: { timestamp: "desc" },
      take: 50,
    });
    return NextResponse.json({ activities });
  } catch (error) {
    console.error("Activity error:", error);
    return NextResponse.json({ activities: [] });
  }
}
