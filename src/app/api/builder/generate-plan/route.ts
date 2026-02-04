import { NextRequest, NextResponse } from 'next/server';
import { createCompletion } from '@/lib/ai-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignType, product, targetAudience, regions, channels, icpAnalysis, channelResearch, budget, funnelFocus, duration, goal, isCompetitorCampaign, competitor } = body;

    const prompt = `You are a B2B campaign planning expert for CPaaS/Voice AI marketing. Create detailed campaign plans with justified budgets.

BUDGET CALCULATION RULES:
- Google Search: Daily Budget = (Daily Searches × CTR × CPC) × 1.2 buffer
- LinkedIn: Monthly = (Audience × Reach% × Frequency × CPM) / 1000
- StackAdapt: Monthly = (Audience × Reach% × Frequency × CPM) / 1000
- Reddit: CPM $8-15, developer-focused

MINIMUM BUDGETS: Google $1,500, LinkedIn $2,000, StackAdapt $1,500, Reddit $1,000

Create a campaign plan:

Campaign Type: ${campaignType || 'lead_gen'}
Product: ${product || 'Telnyx Platform'}
Goal: ${goal || 'leads'}
Funnel Focus: ${funnelFocus || 'full'}
Regions: ${regions?.join(', ') || 'US'}
Duration: ${formatDuration(duration)}
${isCompetitorCampaign ? `Competitor Target: ${competitor}` : ''}

Target Audience: ${targetAudience || 'B2B tech decision makers'}
ICP Job Titles: ${icpAnalysis?.jobTitles?.slice(0, 5).join(', ') || 'CTOs, VPs Engineering, Developers'}
ICP Pain Points: ${icpAnalysis?.painPoints?.slice(0, 3).join(', ') || 'Cost, reliability, latency'}

Selected Channels: ${channels?.join(', ') || 'Google Search, LinkedIn'}
Budget Preference: ${budget?.type === 'specified' ? `$${budget.amount}/month` : 'Recommend based on research'}

Return ONLY valid JSON:
{
  "summary": {
    "campaignName": "YYYYMM TYPE PRODUCT CHANNEL REGION format",
    "objective": "one sentence",
    "duration": "X months or ongoing",
    "totalMonthlyBudget": number,
    "expectedResults": { "impressions": "range", "clicks": "range", "leads": "range" }
  },
  "channels": [
    {
      "name": "channel name",
      "monthlyBudget": number,
      "allocation": "percent",
      "funnelStage": "tofu|mofu|bofu",
      "calculation": { "method": "description", "inputs": {}, "result": number },
      "targeting": ["criteria"],
      "expectedMetrics": { "impressions": number, "clicks": number, "ctr": "percent", "cpc": number, "conversions": "range" },
      "adGroups": ["themes"]
    }
  ],
  "timeline": { "week1": "Setup", "week2_4": "Optimize", "month2": "Scale" },
  "successMetrics": ["KPIs"],
  "risks": ["challenges"],
  "recommendations": ["suggestions"]
}`;

    const response = await createCompletion({ messages: [{ role: 'user', content: prompt }], maxTokens: 2500, temperature: 0.3 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return NextResponse.json({ success: true, plan: fallbackPlan(channels, budget, duration) });
    }

    const plan = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ success: true, plan });

  } catch (error: any) {
    console.error('Generate plan error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function formatDuration(duration: any): string {
  if (!duration) return '3 months';
  if (duration.type === 'indefinite') return 'Ongoing (no end date)';
  if (duration.type === 'fixed') return `${duration.value} ${duration.unit}`;
  if (duration.type === 'dateRange') return `${duration.startDate} to ${duration.endDate}`;
  return '3 months';
}

function fallbackPlan(channels: string[], budget: any, duration: any) {
  const selectedChannels = channels || ['Google Search', 'LinkedIn'];
  const monthlyBudget = budget?.amount || 8000;
  const perChannel = Math.round(monthlyBudget / selectedChannels.length);

  return {
    summary: {
      campaignName: '202602 LEAD_GEN Voice AI SA US',
      objective: 'Generate qualified leads for Telnyx Voice AI platform',
      duration: formatDuration(duration),
      totalMonthlyBudget: monthlyBudget,
      expectedResults: { impressions: '80,000 - 150,000', clicks: '800 - 2,000', leads: '30 - 80' }
    },
    channels: selectedChannels.map(ch => ({
      name: ch,
      monthlyBudget: perChannel,
      allocation: `${Math.round(100 / selectedChannels.length)}%`,
      funnelStage: 'full',
      calculation: { method: 'Budget allocated based on channel mix', inputs: { totalBudget: monthlyBudget }, result: perChannel },
      targeting: ['Job titles', 'Industries', 'Company size'],
      expectedMetrics: { impressions: Math.round(perChannel * 30), clicks: Math.round(perChannel * 0.3), ctr: '1-3%', cpc: 15, conversions: '8-20' },
      adGroups: ['Brand', 'Product', 'Use Case']
    })),
    timeline: { week1: 'Campaign setup and launch', week2_4: 'Monitor and optimize', month2: 'Scale top performers' },
    successMetrics: ['Cost per lead < $150', 'Lead to SQO rate > 15%', 'Pipeline generated'],
    risks: ['Competitive auction pressure', 'Audience saturation'],
    recommendations: ['Start with conservative budgets', 'A/B test ad creative']
  };
}
