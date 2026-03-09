import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1",
  apiKey: process.env.OPENCLAW_GATEWAY_TOKEN || "",
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get("region");
    const status = searchParams.get("status");
    const strategyId = searchParams.get("strategyId");

    const where: Record<string, unknown> = {};
    if (region && region !== "all") where.region = region;
    if (status && status !== "all") where.status = status;
    if (strategyId) where.strategyId = strategyId;

    const initiatives = await prisma.initiative.findMany({
      where,
      include: {
        strategy: { select: { id: true, name: true } },
        campaigns: { include: { campaign: true } },
        notes: { orderBy: { createdAt: "desc" }, take: 5 },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(initiatives);
  } catch (error) {
    console.error("Initiatives GET error:", error);
    return NextResponse.json({ error: "Failed to fetch initiatives" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { strategyId, brief, ...fields } = body;

    if (!strategyId) {
      return NextResponse.json({ error: "strategyId required" }, { status: 400 });
    }

    // If brief provided, use AI to parse
    if (brief) {
      const completion = await openai.chat.completions.create({
        model: "openclaw:main",
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content: `Parse this demand gen initiative brief into structured fields. Return JSON only:
{
  "name": "short name",
  "description": "detailed description",
  "region": "GLOBAL|AMER|EMEA|APAC|null",
  "vertical": "Healthcare|Fintech|Travel|null",
  "product": "Voice AI|AI Agent|SIP|IoT|Contact Center|null",
  "funnel": "TOFU|MOFU|BOFU|null",
  "objective": "competitor_takeout|expansion|brand|lead_gen|null",
  "budget": number_or_null,
  "goalType": "SQOs|MQLs|pipeline|impressions|null",
  "goalTarget": number_or_null,
  "platforms": ["google_ads","linkedin","stackadapt","reddit"],
  "tags": ["tag1"]
}
Example: "Competitor takeout targeting Vapi in APAC, $15K, goal 20 SQOs on Google and LinkedIn" →
{"name":"APAC Vapi Competitor Takeout","description":"Competitor takeout campaign targeting Vapi users in APAC region","region":"APAC","vertical":null,"product":"Voice AI","funnel":null,"objective":"competitor_takeout","budget":15000,"goalType":"SQOs","goalTarget":20,"platforms":["google_ads","linkedin"],"tags":["vapi","competitor"]}`,
          },
          { role: "user", content: brief },
        ],
      });

      let parsed;
      try {
        const raw = completion.choices[0]?.message?.content || "{}";
        // Extract JSON from possible markdown code blocks
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
        parsed = JSON.parse(jsonMatch[1]!.trim());
      } catch {
        parsed = { name: brief.slice(0, 60), description: brief };
      }

      const initiative = await prisma.initiative.create({
        data: {
          strategyId,
          name: parsed.name || brief.slice(0, 60),
          description: parsed.description || brief,
          brief,
          region: parsed.region || null,
          vertical: parsed.vertical || null,
          product: parsed.product || null,
          funnel: parsed.funnel || null,
          objective: parsed.objective || null,
          budget: parsed.budget || null,
          goalType: parsed.goalType || null,
          goalTarget: parsed.goalTarget || null,
          platforms: parsed.platforms || [],
          tags: parsed.tags || [],
          ...fields,
        },
        include: { strategy: { select: { id: true, name: true } } },
      });

      return NextResponse.json(initiative, { status: 201 });
    }

    // Direct creation with structured fields
    const initiative = await prisma.initiative.create({
      data: {
        strategyId,
        name: fields.name,
        description: fields.description || null,
        brief: fields.brief || null,
        region: fields.region || null,
        vertical: fields.vertical || null,
        product: fields.product || null,
        funnel: fields.funnel || null,
        objective: fields.objective || null,
        status: fields.status || "planning",
        budget: fields.budget || null,
        goalType: fields.goalType || null,
        goalTarget: fields.goalTarget || null,
        platforms: fields.platforms || [],
        tags: fields.tags || [],
        startDate: fields.startDate ? new Date(fields.startDate) : null,
        endDate: fields.endDate ? new Date(fields.endDate) : null,
      },
      include: { strategy: { select: { id: true, name: true } } },
    });

    return NextResponse.json(initiative, { status: 201 });
  } catch (error) {
    console.error("Initiative POST error:", error);
    return NextResponse.json({ error: "Failed to create initiative" }, { status: 500 });
  }
}
