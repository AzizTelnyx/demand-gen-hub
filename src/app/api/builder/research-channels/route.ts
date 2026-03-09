import { NextRequest, NextResponse } from 'next/server';
import { createCompletion } from '@/lib/ai-client';

export async function POST(request: NextRequest) {
  let product = '';
  let targetAudience = '';
  let icpAnalysis: any = null;
  let regions: string[] = [];
  let isCompetitorCampaign = false;
  let competitorMentioned: string | null = null;
  let budget: any = null;
  
  try {
    const body = await request.json();
    product = body.product || '';
    targetAudience = body.targetAudience || '';
    icpAnalysis = body.icpAnalysis;
    regions = body.regions || [];
    isCompetitorCampaign = body.isCompetitorCampaign || false;
    competitorMentioned = body.competitorMentioned;
    budget = body.budget;
    const { goal, funnelFocus } = body;

    const prompt = `You are a B2B paid media strategist specializing in CPaaS and enterprise software marketing. Generate channel recommendations with realistic budget calculations.

CHANNEL EXPERTISE:
- Google Ads Search: High-intent, $5-25 CPC for B2B tech, 2-5% CTR
- LinkedIn Ads: Best for job title targeting, $40-80 CPM, 0.4-0.8% CTR
- StackAdapt: Programmatic display/native, $10-20 CPM, intent-based targeting
- Reddit: Promoted posts in subreddits, $2-8 CPC, community/interest targeting — great for developers
- Reddit Ads: Good for developers, $8-15 CPM, community targeting
- Facebook/Meta: Limited B2B effectiveness, better for SMB

BUDGET GUIDELINES:
- Minimum viable test: $2,000/month per channel
- Google Search: Base on keyword volume × CTR × CPC
- LinkedIn: Base on audience size × frequency × CPM
- Always recommend 20% buffer for optimization

Generate channel recommendations for a Telnyx campaign:

Product: ${product || 'Telnyx Platform'}
Target Audience: ${targetAudience || 'B2B tech buyers'}
ICP Pain Points: ${icpAnalysis?.painPoints?.slice(0, 3).join(', ') || 'Cost, quality, reliability'}
ICP Job Titles: ${icpAnalysis?.jobTitles?.slice(0, 4).join(', ') || 'Engineers, CTOs'}
Regions: ${regions?.join(', ') || 'US'}
Goal: ${goal || 'leads'}
Funnel Focus: ${funnelFocus || 'full'}
${isCompetitorCampaign ? `Competitor Focus: ${competitorMentioned || 'General'}` : ''}
Budget Preference: ${budget?.type === 'specified' ? `$${budget.amount}/month` : 'Recommend based on research'}

Return ONLY valid JSON (no other text):
{
  "recommendations": [
    {
      "channel": "channel name",
      "recommended": true,
      "rationale": "why this channel",
      "funnelStage": "tofu|mofu|bofu",
      "audienceSize": number,
      "targeting": {
        "jobTitles": ["if LinkedIn"],
        "keywords": [{"keyword": "term", "volume": number, "cpc": number, "intent": "high|medium"}],
        "interests": ["if display"]
      },
      "budgetCalculation": {
        "formula": "explanation of calculation",
        "inputs": {"metric": "value"},
        "result": number
      },
      "recommendedBudget": number,
      "expectedMetrics": {
        "impressions": number,
        "clicks": number,
        "ctr": "percent string",
        "conversions": "range string"
      }
    }
  ],
  "totalRecommendedBudget": number
}`;

    const response = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2048,
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ 
        success: true, 
        channelResearch: fallbackChannels(product, targetAudience, icpAnalysis, regions, isCompetitorCampaign, competitorMentioned, budget) 
      });
    }

    const channelResearch = JSON.parse(jsonMatch[0]);
    
    const recommendations = channelResearch.recommendations || [];
    const formattedResearch = recommendations.map((rec: any) => ({
      channel: mapChannelName(rec.channel),
      recommended: rec.recommended !== false,
      rationale: rec.rationale || '',
      targeting: rec.targeting || {},
      audienceSize: rec.audienceSize || 50000,
      estimatedCpm: rec.targeting?.cpm || 50,
      estimatedCpc: rec.targeting?.keywords?.[0]?.cpc || 15,
      keywords: rec.targeting?.keywords || [],
      budgetCalculation: rec.budgetCalculation || { formula: '', result: 0 },
      recommendedBudget: rec.recommendedBudget || 2500,
    }));

    return NextResponse.json({ 
      success: true, 
      channelResearch: formattedResearch,
      totalRecommendedBudget: channelResearch.totalRecommendedBudget || formattedResearch.reduce((sum: number, r: any) => sum + r.recommendedBudget, 0),
    });

  } catch (error: any) {
    console.error('Research channels error:', error?.message || error);
    return NextResponse.json({ 
      success: true, 
      channelResearch: fallbackChannels(product, targetAudience, icpAnalysis, regions, isCompetitorCampaign, competitorMentioned, budget),
      usedFallback: true,
    });
  }
}

function mapChannelName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('google') && lower.includes('search')) return 'google_search';
  if (lower.includes('google') && lower.includes('display')) return 'google_display';
  if (lower.includes('linkedin')) return 'linkedin';
  if (lower.includes('stackadapt')) return 'stackadapt';
  if (lower.includes('reddit')) return 'reddit';
  if (lower.includes('reddit')) return 'reddit';
  if (lower.includes('meta') || lower.includes('facebook')) return 'meta';
  return 'google_search';
}

function fallbackChannels(product: string, targetAudience: string, icpAnalysis: any, regions: string[], isCompetitorCampaign: boolean, competitorMentioned: string | null, budget: any) {
  let keywords = [];
  if (isCompetitorCampaign && competitorMentioned) {
    keywords = [
      { keyword: `${competitorMentioned.toLowerCase()} alternative`, volume: 720, cpc: 18.5, intent: 'high' },
      { keyword: `${competitorMentioned.toLowerCase()} pricing`, volume: 480, cpc: 12.0, intent: 'high' },
      { keyword: `${competitorMentioned.toLowerCase()} vs`, volume: 320, cpc: 15.0, intent: 'high' },
    ];
  } else {
    keywords = [
      { keyword: 'voice api', volume: 1200, cpc: 15.0, intent: 'high' },
      { keyword: 'sip trunking provider', volume: 880, cpc: 22.0, intent: 'high' },
      { keyword: 'cloud communications platform', volume: 590, cpc: 18.0, intent: 'medium' },
    ];
  }

  return [
    {
      channel: 'google_search',
      recommended: true,
      rationale: 'High-intent search captures users actively looking for solutions',
      targeting: { keywords },
      audienceSize: 15000,
      estimatedCpc: 15,
      keywords,
      budgetCalculation: { formula: 'Monthly searches × CTR × CPC × 1.2 buffer', result: 3500 },
      recommendedBudget: 3500,
    },
    {
      channel: 'linkedin',
      recommended: true,
      rationale: 'Best platform for reaching B2B decision makers by job title',
      targeting: {
        jobTitles: icpAnalysis?.jobTitles?.slice(0, 5) || ['CTO', 'VP Engineering', 'Software Engineer'],
        industries: icpAnalysis?.industries?.slice(0, 4) || ['Technology', 'SaaS'],
      },
      audienceSize: 48000,
      estimatedCpm: 55,
      budgetCalculation: { formula: 'Audience × 40% reach × 4 frequency × $55 CPM / 1000', result: 4200 },
      recommendedBudget: 4200,
    },
    {
      channel: 'stackadapt',
      recommended: true,
      rationale: 'Programmatic display for awareness and retargeting with intent data',
      targeting: {
        interests: ['Cloud Computing', 'APIs', 'Enterprise Software'],
        intentTopics: ['CPaaS', 'Voice API', 'Business Communications'],
      },
      audienceSize: 185000,
      estimatedCpm: 12,
      budgetCalculation: { formula: 'Audience × 30% reach × 5 frequency × $12 CPM / 1000', result: 3300 },
      recommendedBudget: 3300,
    },
    {
      channel: 'reddit',
      recommended: true,
      rationale: 'Developer and technical audience reach via subreddit targeting — cost-effective for B2B tech',
      targeting: {
        subreddits: ['r/devops', 'r/programming', 'r/aws', 'r/sysadmin', 'r/voip'],
        interests: ['Technology', 'Programming', 'Cloud Computing'],
      },
      audienceSize: 120000,
      estimatedCpm: 15,
      budgetCalculation: { formula: 'Audience × 25% reach × 3 frequency × $4.50 CPC avg', result: 1500 },
      recommendedBudget: 1500,
    },
  ];
}
