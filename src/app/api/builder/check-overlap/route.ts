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

// Known existing campaign keywords (hardcoded for speed - update as needed)
const EXISTING_KEYWORDS: Record<string, { campaign: string; adGroup: string }> = {
  'bandwidth alternative': { campaign: '202502 MOFU Bandwidth SA', adGroup: 'Competitor - Bandwidth' },
  'bandwidth vs telnyx': { campaign: '202502 MOFU Bandwidth SA', adGroup: 'Competitor - Bandwidth' },
  'twilio alternative': { campaign: '202501 MOFU Twilio SA', adGroup: 'Competitor - Twilio' },
  'twilio vs telnyx': { campaign: '202501 MOFU Twilio SA', adGroup: 'Competitor - Twilio' },
  'vonage alternative': { campaign: '202501 MOFU Vonage SA', adGroup: 'Competitor - Vonage' },
  'plivo alternative': { campaign: '202501 MOFU Plivo SA', adGroup: 'Competitor - Plivo' },
  'sip trunking': { campaign: '202501 TOFU SIP Trunking', adGroup: 'SIP Generic' },
  'sip trunk provider': { campaign: '202501 TOFU SIP Trunking', adGroup: 'SIP Generic' },
  'voice api': { campaign: '202501 TOFU Voice API', adGroup: 'Voice Generic' },
  'programmable voice': { campaign: '202501 TOFU Voice API', adGroup: 'Voice Generic' },
  'sms api': { campaign: '202501 TOFU SMS API', adGroup: 'SMS Generic' },
  'bulk sms': { campaign: '202501 TOFU SMS API', adGroup: 'SMS Bulk' },
};

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

    // Quick local check against known keywords
    const overlappingKeywords: OverlapResult['overlappingKeywords'] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    for (const keyword of keywords) {
      const normalizedKw = keyword.toLowerCase().trim();
      
      // Check exact match
      if (EXISTING_KEYWORDS[normalizedKw]) {
        overlappingKeywords.push({
          keyword: keyword,
          existingCampaign: EXISTING_KEYWORDS[normalizedKw].campaign,
          existingAdGroup: EXISTING_KEYWORDS[normalizedKw].adGroup,
          matchType: 'exact',
        });
        continue;
      }
      
      // Check partial match (keyword contains existing or vice versa)
      for (const [existingKw, info] of Object.entries(EXISTING_KEYWORDS)) {
        if (normalizedKw.includes(existingKw) || existingKw.includes(normalizedKw)) {
          overlappingKeywords.push({
            keyword: keyword,
            existingCampaign: info.campaign,
            existingAdGroup: info.adGroup,
            matchType: 'partial',
          });
          break;
        }
      }
    }

    const hasOverlap = overlappingKeywords.length > 0;

    if (hasOverlap) {
      warnings.push(`Found ${overlappingKeywords.length} keyword(s) that may conflict with existing campaigns`);
      recommendations.push('Consider using negative keywords or adjusting match types to avoid internal competition');
      recommendations.push('Review the existing campaigns to ensure targeting doesn\'t overlap');
    } else {
      recommendations.push('No obvious overlaps detected. Verify in Google Ads before launching.');
    }

    // Always add a note to verify manually
    warnings.push('This is a quick check against known keywords. Always verify in Google Ads UI before launch.');

    return NextResponse.json({
      success: true,
      overlap: {
        hasOverlap,
        overlappingKeywords,
        warnings,
        recommendations,
      },
      checkedAt: new Date().toISOString(),
      keywordsChecked: keywords.length,
    });

  } catch (error: any) {
    console.error('Overlap check error:', error);
    return NextResponse.json({
      success: true,
      overlap: {
        hasOverlap: false,
        overlappingKeywords: [],
        warnings: [`Error checking overlap: ${error.message}`, 'Please verify manually in Google Ads'],
        recommendations: ['Review existing campaigns before launching'],
      },
      usedFallback: true,
    });
  }
}
