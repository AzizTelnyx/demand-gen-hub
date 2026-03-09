import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const agents = await prisma.agent.findMany({
      select: { slug: true, name: true, schedule: true, enabled: true, platform: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ agents });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
