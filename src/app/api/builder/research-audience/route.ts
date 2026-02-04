import { NextRequest, NextResponse } from 'next/server';
import { createCompletion } from '@/lib/ai-client';

export async function POST(request: NextRequest) {
  let product = '';
  let targetAudience = '';
  
  try {
    const body = await request.json();
    product = body.product || '';
    targetAudience = body.targetAudience || '';
    const { regions, isCompetitorCampaign, competitorMentioned } = body;

    const prompt = `You are a B2B marketing strategist specializing in CPaaS (Communications Platform as a Service) and Voice AI markets. Generate detailed ICP (Ideal Customer Profile) analysis for Telnyx campaigns.

TELNYX CONTEXT:
- Cloud communications company competing with Twilio, Bandwidth, Vonage, Plivo
- Owns and operates its own network (key differentiator)
- Products: Voice API, SMS API, SIP Trunking, Voice AI, IoT/eSIM
- Targets developers, mid-market, and enterprise customers
- Value props: better pricing, network ownership, reliability, global coverage

Generate an ICP analysis for a Telnyx campaign:

Product: ${product || 'Telnyx Platform'}
Target Audience: ${targetAudience || 'B2B tech buyers'}
Regions: ${regions?.join(', ') || 'US'}
${isCompetitorCampaign ? `Competitor Focus: ${competitorMentioned || 'General'}` : ''}

Return ONLY valid JSON with this structure (no other text):
{
  "jobTitles": ["array of 5-7 target job titles, ordered by priority"],
  "industries": ["array of 4-6 target industries"],
  "companySize": "string describing company size range",
  "painPoints": ["array of 4-6 specific pain points these buyers face"],
  "buyingTriggers": ["array of 3-4 events that trigger buying"],
  "buyingStage": "string describing where they are in buying journey",
  "competitorsEvaluating": ["array of competitors they likely evaluate"],
  "objections": ["array of 3-4 common objections to overcome"],
  "valueProps": ["array of 3-4 Telnyx value props that resonate with this ICP"]
}`;

    const response = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1024,
      temperature: 0.5,
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ 
        success: true, 
        icpAnalysis: fallbackICP(product, targetAudience),
        debug: 'No JSON in response',
      });
    }

    const icpAnalysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ success: true, icpAnalysis });

  } catch (error: any) {
    console.error('Research audience error:', error?.message || error);
    return NextResponse.json({ 
      success: true, 
      icpAnalysis: fallbackICP(product, targetAudience),
      usedFallback: true,
      errorMessage: error?.message || 'Unknown error',
    });
  }
}

function fallbackICP(product: string, targetAudience: string) {
  const audienceLower = (targetAudience || '').toLowerCase();
  
  if (audienceLower.includes('contact center') || audienceLower.includes('enterprise contact')) {
    return {
      jobTitles: ['VP Customer Experience', 'Contact Center Director', 'CIO', 'CTO', 'VP Operations', 'Head of Customer Service'],
      industries: ['Insurance', 'Healthcare', 'Banking', 'Retail', 'Financial Services', 'Telecommunications'],
      companySize: '500+ employees',
      painPoints: [
        'High agent costs and turnover (30-50% annually)',
        'Long wait times affecting CSAT scores',
        'Legacy IVR systems frustrating customers',
        'Difficulty scaling for peak periods',
        'Limited self-service capabilities',
      ],
      buyingTriggers: [
        'Contract renewal with incumbent vendor',
        'Customer satisfaction scores declining',
        'Cost reduction mandates from leadership',
        'Digital transformation initiatives',
      ],
      buyingStage: 'Evaluating solutions',
      competitorsEvaluating: ['Five9', 'NICE', 'Genesys', 'Talkdesk', 'Twilio Flex'],
      objections: [
        'Migration complexity from existing system',
        'Integration with CRM and other tools',
        'Concerns about AI accuracy and quality',
        'Need for extensive training',
      ],
      valueProps: [
        'AI-powered agents that handle 70%+ of calls',
        'Reduce wait times to under 30 seconds',
        'Pay-per-use pricing vs. per-seat licensing',
        'Global network with 99.999% uptime',
      ],
    };
  }
  
  return {
    jobTitles: ['Software Engineer', 'Backend Developer', 'Full Stack Developer', 'CTO', 'VP Engineering', 'DevOps Engineer', 'Product Manager'],
    industries: ['Technology', 'SaaS', 'FinTech', 'HealthTech', 'Telecommunications', 'Startups'],
    companySize: '50-5000 employees',
    painPoints: [
      'High costs with current CPaaS provider',
      'Poor call quality and reliability issues',
      'Complex pricing with hidden fees',
      'Vendor lock-in concerns',
      'Need for better latency and global coverage',
      'Limited support and documentation',
    ],
    buyingTriggers: [
      'Unexpected price increase from current vendor',
      'Quality issues affecting customer experience',
      'Scaling to new regions requiring better coverage',
      'Building new voice/SMS features',
    ],
    buyingStage: 'Comparing alternatives',
    competitorsEvaluating: ['Twilio', 'Bandwidth', 'Vonage', 'Plivo', 'Sinch'],
    objections: [
      'Switching costs and migration effort',
      'Need to rewrite integrations',
      'Unknown brand compared to Twilio',
      'Concerns about support quality',
    ],
    valueProps: [
      'Own network = better quality and pricing',
      '30-50% lower costs than Twilio',
      'Mission control portal for real-time debugging',
      'Developer-first documentation and SDKs',
    ],
  };
}
