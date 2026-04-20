import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1",
  apiKey: process.env.OPENCLAW_GATEWAY_TOKEN || "",
});

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const initiative = await prisma.initiative.findUnique({
      where: { id },
      include: {
        InitiativeCampaign: { include: { Campaign: true } },
        InitiativeNote: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!initiative) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const campaigns = initiative.InitiativeCampaign.map((ic) => ic.Campaign);
    const totalSpend = campaigns.reduce((a, c) => a + (c.spend || 0), 0);
    const totalClicks = campaigns.reduce((a, c) => a + (c.clicks || 0), 0);
    const totalImpressions = campaigns.reduce((a, c) => a + (c.impressions || 0), 0);
    const totalConversions = campaigns.reduce((a, c) => a + (c.conversions || 0), 0);

    const completion = await openai.chat.completions.create({
      model: "openclaw:main",
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: `You are a demand gen analyst. Summarize this initiative's performance concisely. Include: status assessment, pace vs goals, key risks, and 1-2 recommendations. Be direct and actionable.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            name: initiative.name,
            objective: initiative.objective,
            region: initiative.region,
            product: initiative.product,
            status: initiative.status,
            budget: initiative.budget,
            budgetSpent: initiative.budgetSpent,
            goalType: initiative.goalType,
            goalTarget: initiative.goalTarget,
            goalCurrent: initiative.goalCurrent,
            campaignCount: campaigns.length,
            totalSpend,
            totalClicks,
            totalImpressions,
            totalConversions,
            platforms: initiative.platforms,
            recentNotes: initiative.InitiativeNote.slice(0, 5).map((n) => n.content),
          }),
        },
      ],
    });

    const summary = completion.choices[0]?.message?.content || "Unable to generate summary.";

    // Save summary
    await prisma.initiative.update({
      where: { id },
      data: { aiSummary: summary, aiLastCheck: new Date() },
    });

    // Also create a note
    await prisma.initiativeNote.create({
      data: { id: crypto.randomUUID(), initiativeId: id, content: summary, type: "ai_summary", author: "ai" },
    });

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summary POST error:", error);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}
