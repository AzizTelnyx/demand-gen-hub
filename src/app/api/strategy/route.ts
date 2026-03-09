import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1",
  apiKey: process.env.OPENCLAW_GATEWAY_TOKEN || "",
});

export async function GET() {
  try {
    const strategies = await prisma.strategy.findMany({
      include: {
        initiatives: {
          include: {
            campaigns: { include: { campaign: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = strategies.map((s) => {
      const inits = s.initiatives;
      const totalBudget = inits.reduce((a, i) => a + (i.budget || 0), 0);
      const totalSpent = inits.reduce((a, i) => a + (i.budgetSpent || 0), 0);
      const totalCampaigns = inits.reduce((a, i) => a + i.campaigns.length, 0);
      const liveInitiatives = inits.filter((i) => i.status === "live").length;
      return {
        ...s,
        initiatives: undefined,
        initiativeCount: inits.length,
        liveInitiatives,
        totalBudget,
        totalSpent,
        totalCampaigns,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Strategy GET error:", error);
    return NextResponse.json({ error: "Failed to fetch strategies" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, region, status, startDate, endDate, brief } = body;

    // If brief provided, use AI to parse
    if (brief && !name) {
      const completion = await openai.chat.completions.create({
        model: "openclaw:main",
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: `Parse this strategy brief into structured fields. Return JSON only:
{"name": "string", "description": "string", "region": "GLOBAL|AMER|EMEA|APAC|null", "status": "planning"}`,
          },
          { role: "user", content: brief },
        ],
      });
      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      const strategy = await prisma.strategy.create({
        data: {
          name: parsed.name || brief.slice(0, 60),
          description: parsed.description || brief,
          region: parsed.region || null,
          status: parsed.status || "planning",
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
      });
      return NextResponse.json(strategy, { status: 201 });
    }

    const strategy = await prisma.strategy.create({
      data: {
        name,
        description: description || null,
        region: region || null,
        status: status || "planning",
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });
    return NextResponse.json(strategy, { status: 201 });
  } catch (error) {
    console.error("Strategy POST error:", error);
    return NextResponse.json({ error: "Failed to create strategy" }, { status: 500 });
  }
}
