import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({
  baseURL: process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1",
  apiKey: process.env.OPENCLAW_GATEWAY_TOKEN || "",
});

export async function POST(request: NextRequest) {
  try {
    const { campaign } = await request.json();
    if (!campaign) {
      return NextResponse.json({ error: "Campaign name required" }, { status: 400 });
    }

    // Find matching campaigns
    const campaigns = await prisma.campaign.findMany({
      where: { name: { contains: campaign, mode: "insensitive" } },
    });

    if (campaigns.length === 0) {
      return NextResponse.json({ error: "No matching campaigns found" }, { status: 404 });
    }

    const c = campaigns[0];
    const ctr = c.impressions && c.impressions > 0 ? ((c.clicks || 0) / c.impressions * 100).toFixed(2) : "0";
    const cpc = c.clicks && c.clicks > 0 ? ((c.spend || 0) / c.clicks).toFixed(2) : "N/A";
    const pacing = c.budget && c.budget > 0 ? ((c.spend || 0) / c.budget * 100).toFixed(0) : "N/A";

    const completion = await openai.chat.completions.create({
      model: "openclaw:main",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `Analyze this campaign and provide actionable recommendations:

Campaign: ${c.name}
Platform: ${c.platform}
Status: ${c.status}
Budget: $${c.budget || 0}
Spend: $${c.spend || 0} (${pacing}% pacing)
Clicks: ${c.clicks || 0}
Impressions: ${c.impressions || 0}
CTR: ${ctr}%
CPC: $${cpc}
Conversions: ${c.conversions || 0}
Region: ${c.region || 'Unknown'}
Funnel Stage: ${c.funnelStage || 'Unknown'}

Provide:
1. Health assessment (healthy/watch/action needed)
2. Key observations (2-3 bullet points)
3. Specific recommendations (2-3 actionable items)
4. Risk factors

Be concise and specific. No filler.`,
      }],
    });

    const analysis = completion.choices[0]?.message?.content || "Analysis failed";

    // Log activity
    await prisma.activity.create({
      data: {
        actor: "Ares",
        action: "deep_dive",
        entityType: "campaign",
        entityId: c.id,
        entityName: c.name,
        details: `Deep dive analysis on ${c.name}`,
      },
    });

    return NextResponse.json({
      status: "completed",
      campaign: c.name,
      metrics: { spend: c.spend, budget: c.budget, clicks: c.clicks, impressions: c.impressions, ctr, cpc, pacing, conversions: c.conversions },
      analysis,
    });
  } catch (error) {
    console.error("Deep dive error:", error);
    return NextResponse.json({ error: "Failed to run deep dive" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ running: false, message: "Use POST to trigger a deep dive" });
}
