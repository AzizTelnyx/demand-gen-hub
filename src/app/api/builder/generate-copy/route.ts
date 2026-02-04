import { NextRequest, NextResponse } from 'next/server';
import { createCompletion } from '@/lib/ai-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignType, product, targetAudience, icpAnalysis, plan, channels, isCompetitorCampaign, competitor, webinarTitle, eventName, eventDate, eventLocation } = body;

    const adGroups = plan?.channels?.flatMap((ch: any) => 
      ch.adGroups?.map((ag: string) => ({ channel: ch.name, theme: ag })) || []
    ) || [{ channel: 'Google Search', theme: 'Brand' }];

    const prompt = `You are an expert B2B ad copywriter for CPaaS/Voice AI. Generate high-converting ad copy.

CHARACTER LIMITS (STRICT):
- Google Headlines: 30 characters max
- Google Descriptions: 90 characters max
- LinkedIn Headlines: 70 characters max

TELNYX VALUE PROPS: Own network, Sub-200ms latency, 50%+ cost savings, Single integration, Global coverage

BRAND VOICE: No em dashes, Engineer tone, Specific numbers, Proof over promises

Generate ad copy for:

Campaign Type: ${campaignType || 'lead_gen'}
Product: ${product || 'Telnyx Platform'}
${isCompetitorCampaign ? `Competitor: ${competitor}` : ''}
${webinarTitle ? `Webinar: ${webinarTitle}` : ''}
${eventName ? `Event: ${eventName} on ${eventDate} in ${eventLocation}` : ''}

Target Audience: ${targetAudience || 'B2B tech buyers'}
Pain Points: ${icpAnalysis?.painPoints?.slice(0, 3).join(', ') || 'Cost, latency, reliability'}

Ad Groups: ${adGroups.map((ag: any) => `${ag.channel}: ${ag.theme}`).join(', ')}

Return ONLY valid JSON:
{
  "adGroups": [
    {
      "channel": "Google Search",
      "theme": "theme",
      "headlines": [{"text": "max 30 chars", "pinned": "H1|H2|null", "chars": number}],
      "descriptions": [{"text": "max 90 chars", "chars": number}]
    }
  ],
  "linkedInAds": [{ "name": "name", "headline": "70 chars max", "introText": "150 chars max", "cta": "Learn More" }],
  "displayAds": [{ "size": "300x250", "headline": "text", "subhead": "text", "cta": "CTA" }]
}`;

    const response = await createCompletion({ messages: [{ role: 'user', content: prompt }], maxTokens: 3000, temperature: 0.7 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return NextResponse.json({ success: true, adCopy: fallbackCopy(channels, product, competitor) });
    }

    const adCopy = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ success: true, adCopy });

  } catch (error: any) {
    console.error('Generate copy error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function fallbackCopy(channels: string[], product: string | null, competitor: string | null) {
  const productName = product || 'Voice AI';
  
  return {
    adGroups: [{
      channel: 'Google Search',
      theme: competitor ? `${competitor} Alternative` : 'Brand',
      headlines: [
        { text: competitor ? `${competitor} Alternative` : `Telnyx ${productName}`, pinned: 'H1', chars: 25 },
        { text: 'Sub-200ms Latency', pinned: 'H2', chars: 17 },
        { text: 'Own Network, Lower Cost', pinned: null, chars: 22 },
        { text: 'No Vendor Sprawl', pinned: null, chars: 16 },
        { text: 'Global Coverage', pinned: null, chars: 15 },
        { text: 'Try Free Today', pinned: null, chars: 14 },
        { text: '50% Lower Than Twilio', pinned: null, chars: 20 },
        { text: 'One Integration', pinned: null, chars: 15 },
      ],
      descriptions: [
        { text: 'Cut costs by 50% vs legacy providers. Own network, sub-200ms latency. One integration.', chars: 85 },
        { text: 'Stop overpaying for voice. Telnyx owns the network. Better quality, lower price.', chars: 78 },
        { text: 'Deploy voice AI in hours. Global coverage, local numbers. Start free today.', chars: 73 },
      ]
    }],
    linkedInAds: [
      { name: 'Value Prop - Cost', headline: `Cut ${productName} Costs by 50%`, introText: `Still overpaying for voice infrastructure? Telnyx owns our network. Same quality, half the price.`, cta: 'Learn More' },
      { name: 'Value Prop - Latency', headline: `Sub-200ms ${productName} Latency`, introText: `Real-time voice AI needs real-time infrastructure. Telnyx delivers sub-200ms latency globally.`, cta: 'Learn More' }
    ],
    displayAds: [
      { size: '300x250', headline: 'Voice AI Infrastructure', subhead: '50% lower cost', cta: 'Learn More' },
      { size: '728x90', headline: `${productName} That Actually Works`, subhead: 'Sub-200ms latency. Global coverage.', cta: 'Get Started' }
    ]
  };
}
