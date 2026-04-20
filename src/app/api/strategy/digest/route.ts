import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1",
  apiKey: process.env.OPENCLAW_GATEWAY_TOKEN || "",
});

export async function GET() {
  try {
    const strategies = await prisma.strategy.findMany({
      where: { status: { in: ["planning", "active"] } },
      include: {
        Initiative: {
          include: { InitiativeCampaign: { include: { Campaign: true } } },
        },
      },
    });

    const summary = strategies.map((s) => ({
      name: s.name,
      region: s.region,
      status: s.status,
      initiatives: s.Initiative.map((i) => ({
        name: i.name,
        status: i.status,
        region: i.region,
        product: i.product,
        budget: i.budget,
        budgetSpent: i.budgetSpent,
        goalType: i.goalType,
        goalTarget: i.goalTarget,
        goalCurrent: i.goalCurrent,
        campaignCount: i.InitiativeCampaign.length,
        totalSpend: i.InitiativeCampaign.reduce((a, ic) => a + (ic.Campaign.spend || 0), 0),
        totalConversions: i.InitiativeCampaign.reduce((a, ic) => a + (ic.Campaign.conversions || 0), 0),
      })),
    }));

    const completion = await openai.chat.completions.create({
      model: "openclaw:main",
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: `You are a demand gen strategist. Generate a weekly digest of all active strategies and initiatives. Include: overall health, wins, risks, and top 3 actions needed. Be concise and actionable. Use markdown formatting.`,
        },
        { role: "user", content: JSON.stringify(summary) },
      ],
    });

    const digest = completion.choices[0]?.message?.content || "Unable to generate digest.";
    return NextResponse.json({ digest, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Digest GET error:", error);
    return NextResponse.json({ error: "Failed to generate digest" }, { status: 500 });
  }
}
