import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();
    
    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const lowerMessage = message.toLowerCase();
    
    // Get campaign data for context
    const campaigns = await prisma.campaign.findMany();
    const liveCampaigns = campaigns.filter(c => ["live", "active", "enabled"].includes(c.status));
    
    // Calculate stats
    const totalSpend = liveCampaigns.reduce((acc, c) => acc + (c.spend || 0), 0);
    const totalBudget = liveCampaigns.reduce((acc, c) => acc + (c.budget || 0), 0);
    const totalClicks = liveCampaigns.reduce((acc, c) => acc + (c.clicks || 0), 0);
    const totalImpressions = liveCampaigns.reduce((acc, c) => acc + (c.impressions || 0), 0);
    
    // Platform breakdown
    const byPlatform: Record<string, { count: number; spend: number }> = {};
    liveCampaigns.forEach(c => {
      if (!byPlatform[c.platform]) byPlatform[c.platform] = { count: 0, spend: 0 };
      byPlatform[c.platform].count++;
      byPlatform[c.platform].spend += c.spend || 0;
    });

    // Simple intent matching
    let response = "";

    // Status/Overview queries
    if (lowerMessage.includes("status") || lowerMessage.includes("overview") || lowerMessage.includes("how are") || lowerMessage.includes("what's running")) {
      response = `**Campaign Overview**\n\n`;
      response += `• **${liveCampaigns.length}** live campaigns\n`;
      response += `• **$${totalSpend.toLocaleString()}** total spend (last 30 days)\n`;
      response += `• **$${totalBudget.toLocaleString()}** total budget\n`;
      response += `• **${totalClicks.toLocaleString()}** clicks\n`;
      response += `• **${((totalClicks / totalImpressions) * 100).toFixed(2)}%** avg CTR\n\n`;
      response += `**By Platform:**\n`;
      Object.entries(byPlatform).forEach(([platform, data]) => {
        const name = platform === "google_ads" ? "Google Ads" : platform === "stackadapt" ? "StackAdapt" : platform;
        response += `• ${name}: ${data.count} campaigns, $${data.spend.toLocaleString()} spend\n`;
      });
    }
    // Spend queries
    else if (lowerMessage.includes("spend") || lowerMessage.includes("budget") || lowerMessage.includes("cost")) {
      const pacing = totalBudget > 0 ? ((totalSpend / totalBudget) * 100).toFixed(0) : "N/A";
      response = `**Budget & Spend**\n\n`;
      response += `• Total Budget: **$${totalBudget.toLocaleString()}**\n`;
      response += `• Total Spend: **$${totalSpend.toLocaleString()}**\n`;
      response += `• Pacing: **${pacing}%**\n\n`;
      
      // Top spenders
      const topSpenders = [...liveCampaigns].sort((a, b) => (b.spend || 0) - (a.spend || 0)).slice(0, 5);
      response += `**Top Spending Campaigns:**\n`;
      topSpenders.forEach((c, i) => {
        response += `${i + 1}. ${c.name.slice(0, 40)}... — $${(c.spend || 0).toLocaleString()}\n`;
      });
    }
    // Performance queries
    else if (lowerMessage.includes("performance") || lowerMessage.includes("ctr") || lowerMessage.includes("clicks")) {
      const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0";
      response = `**Performance Summary**\n\n`;
      response += `• Impressions: **${totalImpressions.toLocaleString()}**\n`;
      response += `• Clicks: **${totalClicks.toLocaleString()}**\n`;
      response += `• CTR: **${avgCTR}%**\n\n`;
      
      // Best CTR
      const withCTR = liveCampaigns
        .map(c => ({ ...c, ctr: (c.impressions || 0) > 100 ? ((c.clicks || 0) / (c.impressions || 1)) * 100 : 0 }))
        .filter(c => c.ctr > 0)
        .sort((a, b) => b.ctr - a.ctr)
        .slice(0, 5);
      
      if (withCTR.length > 0) {
        response += `**Top CTR Campaigns:**\n`;
        withCTR.forEach((c, i) => {
          response += `${i + 1}. ${c.name.slice(0, 35)}... — ${c.ctr.toFixed(2)}% CTR\n`;
        });
      }
    }
    // Platform specific
    else if (lowerMessage.includes("google") || lowerMessage.includes("search")) {
      const googleCampaigns = liveCampaigns.filter(c => c.platform === "google_ads");
      const spend = googleCampaigns.reduce((acc, c) => acc + (c.spend || 0), 0);
      const clicks = googleCampaigns.reduce((acc, c) => acc + (c.clicks || 0), 0);
      
      response = `**Google Ads Summary**\n\n`;
      response += `• **${googleCampaigns.length}** live campaigns\n`;
      response += `• **$${spend.toLocaleString()}** spend\n`;
      response += `• **${clicks.toLocaleString()}** clicks\n`;
    }
    else if (lowerMessage.includes("stackadapt") || lowerMessage.includes("display") || lowerMessage.includes("native")) {
      const saCampaigns = liveCampaigns.filter(c => c.platform === "stackadapt");
      const spend = saCampaigns.reduce((acc, c) => acc + (c.spend || 0), 0);
      const clicks = saCampaigns.reduce((acc, c) => acc + (c.clicks || 0), 0);
      
      response = `**StackAdapt Summary**\n\n`;
      response += `• **${saCampaigns.length}** live campaigns\n`;
      response += `• **$${spend.toLocaleString()}** spend\n`;
      response += `• **${clicks.toLocaleString()}** clicks\n`;
    }
    // Help
    else if (lowerMessage.includes("help") || lowerMessage.includes("what can you")) {
      response = `I can help you with:\n\n`;
      response += `• **"What's the status?"** — Overview of all campaigns\n`;
      response += `• **"How's the spend?"** — Budget and spend breakdown\n`;
      response += `• **"Show performance"** — Clicks, CTR, impressions\n`;
      response += `• **"Google Ads summary"** — Google-specific stats\n`;
      response += `• **"StackAdapt summary"** — StackAdapt stats\n\n`;
      response += `For complex tasks (creating campaigns, budget changes), use the main Clawdbot chat.`;
    }
    // Default
    else {
      response = `I understood: "${message}"\n\n`;
      response += `I can answer questions about your campaigns. Try:\n`;
      response += `• "What's running?"\n`;
      response += `• "How's the spend?"\n`;
      response += `• "Show performance"\n\n`;
      response += `For complex requests, use the main Clawdbot chat (Slack/Telegram).`;
    }

    return NextResponse.json({ 
      response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
