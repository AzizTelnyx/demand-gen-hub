import { NextRequest, NextResponse } from 'next/server';

// Google Ads API credentials from env
const GOOGLE_ADS_CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID || '2356650573';

interface OverlapResult {
  hasOverlap: boolean;
  overlappingKeywords: Array<{
    keyword: string;
    existingCampaign: string;
    existingAdGroup: string;
    matchType: string;
  }>;
  warnings: string[];
  recommendations: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keywords, region, product } = body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No keywords provided' 
      }, { status: 400 });
    }

    // Call internal Clawdbot to check Google Ads
    const CLAWDBOT_URL = process.env.CLAWDBOT_URL || 'http://127.0.0.1:18789/v1/chat/completions';
    const CLAWDBOT_TOKEN = process.env.CLAWDBOT_TOKEN || '';

    const prompt = `Check for keyword overlap in Google Ads account ${GOOGLE_ADS_CUSTOMER_ID}.

I need to check if any of these keywords already exist in active campaigns:

KEYWORDS TO CHECK:
${keywords.map((k: string) => `- ${k}`).join('\n')}

REGION: ${region || 'All'}
PRODUCT: ${product || 'General'}

Use the Google Ads API to:
1. Search for existing campaigns/ad groups targeting these exact keywords or close variants
2. Check if any campaigns with similar names exist (e.g., "Bandwidth" in campaign name if checking Bandwidth keywords)
3. Report any potential overlap

Return JSON:
{
  "hasOverlap": boolean,
  "overlappingKeywords": [
    {
      "keyword": "the keyword",
      "existingCampaign": "campaign name",
      "existingAdGroup": "ad group name",
      "matchType": "exact|phrase|broad"
    }
  ],
  "warnings": ["any warnings about potential conflicts"],
  "recommendations": ["what to do about overlaps"]
}`;

    const response = await fetch(CLAWDBOT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLAWDBOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'clawdbot:main',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      // Fallback: Return no overlap if API fails
      return NextResponse.json({
        success: true,
        overlap: {
          hasOverlap: false,
          overlappingKeywords: [],
          warnings: ['Could not check Google Ads API - please verify manually'],
          recommendations: ['Review existing campaigns before launching']
        },
        usedFallback: true
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const overlap = JSON.parse(jsonMatch[0]) as OverlapResult;
      return NextResponse.json({ success: true, overlap });
    }

    // Fallback response
    return NextResponse.json({
      success: true,
      overlap: {
        hasOverlap: false,
        overlappingKeywords: [],
        warnings: ['Could not parse overlap check results'],
        recommendations: ['Review existing campaigns before launching']
      },
      usedFallback: true
    });

  } catch (error: any) {
    console.error('Overlap check error:', error);
    return NextResponse.json({
      success: true,
      overlap: {
        hasOverlap: false,
        overlappingKeywords: [],
        warnings: [`Error checking overlap: ${error.message}`],
        recommendations: ['Review existing campaigns manually before launching']
      },
      usedFallback: true
    });
  }
}
