import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1",
  apiKey: process.env.OPENCLAW_GATEWAY_TOKEN || "",
});

export async function POST(req: NextRequest) {
  try {
    const { instruction } = await req.json();

    if (!instruction) {
      return NextResponse.json({ error: "Missing instruction" }, { status: 400 });
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const budgetPlans = await prisma.budgetPlan.findMany({
      where: { year: currentYear, month: currentMonth },
    });

    const campaigns = await prisma.campaign.findMany({
      where: { status: { in: ["live", "active", "enabled"] } },
      select: {
        platform: true,
        spend: true,
        funnelStage: true,
        region: true,
        name: true,
      },
    });

    const spendByChannel: Record<string, number> = {};
    const spendByRegion: Record<string, number> = {};
    const spendByFunnel: Record<string, number> = {};

    campaigns.forEach((c) => {
      spendByChannel[c.platform] = (spendByChannel[c.platform] || 0) + (c.spend || 0);
      if (c.region) spendByRegion[c.region] = (spendByRegion[c.region] || 0) + (c.spend || 0);
      if (c.funnelStage) spendByFunnel[c.funnelStage] = (spendByFunnel[c.funnelStage] || 0) + (c.spend || 0);
    });

    const plannedByChannel: Record<string, number> = {};
    budgetPlans.forEach((p) => {
      plannedByChannel[p.channel] = (plannedByChannel[p.channel] || 0) + p.planned;
    });

    const prompt = `You are a demand generation budget analyst. The user wants to reallocate their marketing budget.

CURRENT STATE (${currentMonth}/${currentYear}):

Planned Budget by Channel:
${Object.entries(plannedByChannel).map(([k, v]) => `- ${k}: $${v.toLocaleString()}`).join("\n") || "No plans set"}

Actual Spend by Channel (30-day):
${Object.entries(spendByChannel).map(([k, v]) => `- ${k}: $${v.toLocaleString()}`).join("\n")}

Spend by Region:
${Object.entries(spendByRegion).map(([k, v]) => `- ${k}: $${v.toLocaleString()}`).join("\n")}

Spend by Funnel Stage:
${Object.entries(spendByFunnel).map(([k, v]) => `- ${k}: $${v.toLocaleString()}`).join("\n")}

USER REQUEST: "${instruction}"

Respond with ONLY a JSON object (no markdown, no code fences) containing:
{
  "summary": "Brief summary of the proposed change",
  "changes": [
    {
      "type": "decrease or increase",
      "channel": "google_ads or stackadapt or linkedin or reddit",
      "region": "AMER or EMEA or APAC or null",
      "funnelStage": "TOFU or MOFU or BOFU or ABM or null",
      "amount": number,
      "reason": "Why this change"
    }
  ],
  "projectedImpact": "Expected outcome of these changes",
  "warnings": ["Any risks or considerations"],
  "netChange": 0
}`;

    const completion = await openai.chat.completions.create({
      model: "openclaw:main",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const response = JSON.parse(responseText);

    const budgetChange = await prisma.budgetChange.create({
      data: {
        description: instruction,
        fromChannel: response.changes?.find((c: any) => c.type === "decrease")?.channel,
        toChannel: response.changes?.find((c: any) => c.type === "increase")?.channel,
        amount: response.netChange || response.changes?.reduce((sum: number, c: any) => 
          sum + (c.type === "increase" ? c.amount : 0), 0) || 0,
        reason: response.summary,
        status: "proposed",
      },
    });

    return NextResponse.json({
      ok: true,
      changeId: budgetChange.id,
      proposal: response,
      currentState: {
        spendByChannel,
        spendByRegion,
        spendByFunnel,
        plannedByChannel,
      },
    });
  } catch (error) {
    console.error("Error processing reallocation:", error);
    return NextResponse.json({ error: "Failed to process reallocation" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { changeId, apply } = await req.json();

    if (!changeId) {
      return NextResponse.json({ error: "Missing changeId" }, { status: 400 });
    }

    const change = await prisma.budgetChange.update({
      where: { id: changeId },
      data: {
        status: apply ? "approved" : "rejected",
        appliedAt: apply ? new Date() : null,
      },
    });

    return NextResponse.json({ ok: true, change });
  } catch (error) {
    console.error("Error applying change:", error);
    return NextResponse.json({ error: "Failed to apply change" }, { status: 500 });
  }
}
