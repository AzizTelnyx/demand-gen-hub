import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { instruction } = await req.json();

    if (!instruction) {
      return NextResponse.json({ error: "Missing instruction" }, { status: 400 });
    }

    // Get current budget state
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

    // Calculate current state
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

Respond with a JSON object containing:
{
  "summary": "Brief summary of the proposed change",
  "changes": [
    {
      "type": "decrease" | "increase",
      "channel": "google_ads" | "stackadapt" | "linkedin" | "reddit",
      "region": "AMER" | "EMEA" | "APAC" | null,
      "funnelStage": "TOFU" | "MOFU" | "BOFU" | "ABM" | null,
      "amount": number,
      "reason": "Why this change"
    }
  ],
  "projectedImpact": "Expected outcome of these changes",
  "warnings": ["Any risks or considerations"],
  "netChange": number (should be 0 for reallocations, or the net budget change)
}

Be specific about dollar amounts. If the user's request is unclear, make reasonable assumptions and explain them.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const response = JSON.parse(completion.choices[0].message.content || "{}");

    // Store the proposed change
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

// Apply a proposed change
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

    // If approved, we could automatically update budget plans here
    // For now, just mark as approved and let user adjust manually

    return NextResponse.json({ ok: true, change });
  } catch (error) {
    console.error("Error applying change:", error);
    return NextResponse.json({ error: "Failed to apply change" }, { status: 500 });
  }
}
