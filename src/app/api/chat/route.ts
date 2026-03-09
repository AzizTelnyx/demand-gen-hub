import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1",
  apiKey: process.env.OPENCLAW_GATEWAY_TOKEN || "",
});

export async function POST(request: NextRequest) {
  try {
    const { message, history = [] } = await request.json();
    
    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // Get campaign data for context
    const campaigns = await prisma.campaign.findMany({
      orderBy: { spend: 'desc' },
      take: 100,
    });
    
    const liveCampaigns = campaigns.filter(c => ["live", "active", "enabled"].includes(c.status));
    
    // Calculate stats
    const totalSpend = liveCampaigns.reduce((acc, c) => acc + (c.spend || 0), 0);
    const totalBudget = liveCampaigns.reduce((acc, c) => acc + (c.budget || 0), 0);
    const totalClicks = liveCampaigns.reduce((acc, c) => acc + (c.clicks || 0), 0);
    const totalImpressions = liveCampaigns.reduce((acc, c) => acc + (c.impressions || 0), 0);
    const totalConversions = liveCampaigns.reduce((acc, c) => acc + (c.conversions || 0), 0);
    
    // Platform breakdown
    const googleCampaigns = liveCampaigns.filter(c => c.platform === "google_ads");
    const stackadaptCampaigns = liveCampaigns.filter(c => c.platform === "stackadapt");
    const redditCampaigns = liveCampaigns.filter(c => c.platform === "reddit");
    
    // Top campaigns by spend
    const topBySpend = liveCampaigns.slice(0, 10).map(c => ({
      name: c.name,
      platform: c.platform,
      spend: c.spend,
      budget: c.budget,
      clicks: c.clicks,
      impressions: c.impressions,
      conversions: c.conversions,
      ctr: c.impressions && c.impressions > 0 ? ((c.clicks || 0) / c.impressions * 100).toFixed(2) : '0',
    }));

    const systemPrompt = `You are the Demand Gen Hub assistant for Telnyx's Demand Generation team. You help with campaign analysis, performance insights, and marketing operations.

CURRENT DATA (Last 30 days):
- Live Campaigns: ${liveCampaigns.length}
- Total Spend: $${totalSpend.toLocaleString()}
- Total Budget: $${totalBudget.toLocaleString()}
- Pacing: ${totalBudget > 0 ? ((totalSpend / totalBudget) * 100).toFixed(0) : 0}%
- Clicks: ${totalClicks.toLocaleString()}
- Impressions: ${totalImpressions.toLocaleString()}
- CTR: ${totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0}%
- Conversions: ${totalConversions}

PLATFORM BREAKDOWN:
- Google Ads: ${googleCampaigns.length} campaigns, $${googleCampaigns.reduce((a, c) => a + (c.spend || 0), 0).toLocaleString()} spend
- StackAdapt: ${stackadaptCampaigns.length} campaigns, $${stackadaptCampaigns.reduce((a, c) => a + (c.spend || 0), 0).toLocaleString()} spend
- Reddit: ${redditCampaigns.length} campaigns, $${redditCampaigns.reduce((a, c) => a + (c.spend || 0), 0).toLocaleString()} spend

TOP 10 CAMPAIGNS BY SPEND:
${topBySpend.map((c, i) => `${i + 1}. ${c.name} (${c.platform === 'google_ads' ? 'Google' : c.platform === 'reddit' ? 'Reddit' : c.platform === 'linkedin' ? 'LinkedIn' : 'StackAdapt'}) - Spend: $${(c.spend || 0).toLocaleString()}, Budget: $${(c.budget || 0).toLocaleString()}, CTR: ${c.ctr}%, Conv: ${c.conversions || 0}`).join('\n')}

GUIDELINES:
- Be concise and actionable
- Use bullet points and formatting for readability
- When discussing campaigns, always include the full campaign name
- Proactively suggest optimizations when you see issues
- Be conversational but efficient`;

    const completion = await openai.chat.completions.create({
      model: "openclaw:main",
      max_tokens: 1000,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-10).map((h: { role: string; content: string }) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: message },
      ],
    });

    const response = completion.choices[0]?.message?.content 
      || "Sorry, I couldn't generate a response.";

    return NextResponse.json({ 
      response,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process message", details: String(error) },
      { status: 500 }
    );
  }
}
