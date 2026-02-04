import { NextRequest, NextResponse } from 'next/server';
import { createCompletion } from '@/lib/ai-client';
import { 
  TELNYX_KNOWLEDGE, 
  detectCampaignType, 
  detectProduct, 
  detectCompetitors,
  getDefaultChannels,
  generateCampaignName
} from '@/lib/knowledge';
import { parseGeography, formatGeographyForName } from '@/lib/geography';

function buildKnowledgeContext(): string {
  const campaignTypes = Object.entries(TELNYX_KNOWLEDGE.campaignTypes)
    .map(([key, t]) => `- ${key}: ${t.name} - ${t.description}`)
    .join('\n');

  const products = Object.entries(TELNYX_KNOWLEDGE.products)
    .map(([name, p]) => `- ${name} (code: ${p.code})`)
    .join('\n');

  const competitors = Object.keys(TELNYX_KNOWLEDGE.competitors).join(', ');

  return `
=== TELNYX CAMPAIGN KNOWLEDGE BASE ===

CAMPAIGN TYPES:
${campaignTypes}

PRODUCTS:
${products}

COMPETITORS: ${competitors}

REGIONS: AMER, EMEA, APAC, MENA, LATAM, GLOBAL
CITIES: Map to country + region (e.g., "San Francisco" → US/AMER, "Dubai" → UAE/MENA)
`;
}

export async function POST(request: NextRequest) {
  let body: any;
  let briefText = '';
  
  try {
    body = await request.json();
    const { notes } = body;
    briefText = notes || '';
    
    if (!briefText.trim()) {
      return NextResponse.json({ 
        success: false, 
        error: 'No brief text provided' 
      }, { status: 400 });
    }

    const knowledgeContext = buildKnowledgeContext();

    const prompt = `You parse Telnyx campaign briefs. Extract campaign parameters accurately.

${knowledgeContext}

CRITICAL RULES:
1. Campaign type: webinar, event, social_boost, brand, competitor, commercial, partnership, retargeting, or lead_gen
2. Duration: Parse exactly what's mentioned:
   - "2 weeks" → { value: 2, unit: "weeks" }
   - "30 days" → { value: 30, unit: "days" }
   - "3 months" → { value: 3, unit: "months" }
   - "Feb 15 to Mar 1" → { startDate: "2026-02-15", endDate: "2026-03-01" }
   - If NO duration mentioned → null (campaign runs indefinitely)
3. Geography: Extract cities AND countries
   - "San Francisco" → cities: ["San Francisco"], countries: ["US"]
   - "London and Paris" → cities: ["London", "Paris"], countries: ["UK", "France"]
4. Return ONLY valid JSON

Parse this brief:

"${briefText}"

Return JSON:
{
  "campaignType": "lead_gen|brand|competitor|webinar|event|social_boost|commercial|partnership|retargeting",
  "product": "product name or null",
  "targetAudience": "audience description or null",
  "goal": "awareness|leads|pipeline|registrations|engagement",
  "funnelFocus": "tofu|mofu|bofu|full|null",
  
  "geography": {
    "regions": ["meta-regions like AMER, EMEA, APAC, MENA, GLOBAL"],
    "countries": ["specific countries mentioned"],
    "cities": ["specific cities mentioned"]
  },
  
  "duration": {
    "type": "indefinite|fixed|dateRange",
    "value": number or null,
    "unit": "days|weeks|months" or null,
    "startDate": "YYYY-MM-DD" or null,
    "endDate": "YYYY-MM-DD" or null
  },
  
  "channels": ["channels if specified"],
  "competitor": "competitor name if conquest campaign",
  "budgetType": "specified|recommend",
  "budgetAmount": null or number,
  
  "webinarTitle": "if webinar",
  "webinarDate": "if webinar",
  "eventName": "if event",
  "eventDate": "if event", 
  "eventLocation": "if event",
  "postUrl": "if social boost",
  "promoName": "if commercial",
  "partnerName": "if partnership",
  
  "keyMessages": ["angles mentioned"],
  "verticalFocus": "industry if mentioned"
}`;

    const llmResponse = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1200,
      temperature: 0.1,
    });

    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return NextResponse.json({ 
        success: true, 
        extracted: fallbackParse(briefText) 
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const campaignType = parsed.campaignType || detectCampaignType(briefText);
    const product = parsed.product || detectProduct(briefText);
    const competitors = detectCompetitors(briefText);
    const defaultChannels = getDefaultChannels(campaignType);
    
    const aiGeo = parsed.geography || { regions: [], countries: [], cities: [] };
    const fallbackGeo = parseGeography(briefText);
    
    const geography = {
      regions: [...new Set([...(aiGeo.regions || []), ...fallbackGeo.regions])],
      countries: [...new Set([...(aiGeo.countries || []), ...fallbackGeo.countries])],
      cities: [...new Set([...(aiGeo.cities || []), ...fallbackGeo.cities])],
    };
    
    const duration = parsed.duration || { type: 'indefinite' };
    
    const extracted = {
      campaignType,
      product,
      targetAudience: parsed.targetAudience || null,
      goal: parsed.goal || (campaignType === 'webinar' ? 'registrations' : 'leads'),
      funnelFocus: parsed.funnelFocus || 'full',
      geography,
      regions: geography.countries.length > 0 ? geography.countries : geography.regions,
      duration: {
        type: duration.type || 'indefinite',
        value: duration.value || null,
        unit: duration.unit || null,
        startDate: duration.startDate || null,
        endDate: duration.endDate || null,
      },
      timeline: {
        start: duration.startDate || new Date().toISOString().split('T')[0],
        durationMonths: duration.unit === 'months' ? duration.value : 
                        duration.unit === 'weeks' ? Math.ceil((duration.value || 0) / 4) :
                        duration.unit === 'days' ? Math.ceil((duration.value || 0) / 30) : null,
        hasEndDate: duration.type !== 'indefinite',
      },
      channels: parsed.channels?.length > 0 ? parsed.channels : defaultChannels,
      isCompetitorCampaign: campaignType === 'competitor' || competitors.length > 0,
      competitor: parsed.competitor || competitors[0] || null,
      budget: {
        type: parsed.budgetType || 'recommend',
        amount: parsed.budgetAmount || undefined,
      },
      webinarTitle: parsed.webinarTitle || null,
      webinarDate: parsed.webinarDate || null,
      eventName: parsed.eventName || null,
      eventDate: parsed.eventDate || null,
      eventLocation: parsed.eventLocation || null,
      postUrl: parsed.postUrl || null,
      promoName: parsed.promoName || null,
      partnerName: parsed.partnerName || null,
      keyMessages: parsed.keyMessages || [],
      verticalFocus: parsed.verticalFocus || null,
      abm: { type: 'broad' as const },
      suggestedName: generateCampaignName({
        campaignType,
        funnelStage: parsed.funnelFocus,
        product: product || undefined,
        competitor: parsed.competitor,
        channelCode: parsed.channels?.[0] ? getChannelCode(parsed.channels[0]) : 'SA',
        region: formatGeographyForName(geography),
      }),
    };

    return NextResponse.json({ success: true, extracted });

  } catch (error: any) {
    console.error('Parse brief error:', error);
    
    if (briefText && briefText.trim()) {
      return NextResponse.json({ 
        success: true, 
        extracted: fallbackParse(briefText),
        usedFallback: true,
      });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: `Failed to parse brief: ${error?.message || 'Unknown error'}` 
    }, { status: 500 });
  }
}

function getChannelCode(channel: string): string {
  const codes: Record<string, string> = {
    'Google Search': 'SA',
    'Google Display': 'DA',
    'YouTube': 'VA',
    'LinkedIn': 'SI',
    'Reddit': 'NA',
    'StackAdapt': 'DA',
    'Meta': 'SI',
  };
  return codes[channel] || 'SA';
}

function fallbackParse(text: string) {
  const campaignType = detectCampaignType(text);
  const product = detectProduct(text);
  const competitors = detectCompetitors(text);
  const defaultChannels = getDefaultChannels(campaignType);
  const geography = parseGeography(text);
  const duration = parseDuration(text);

  return {
    campaignType,
    product,
    targetAudience: null,
    goal: campaignType === 'webinar' ? 'registrations' : 'leads',
    funnelFocus: campaignType === 'competitor' ? 'bofu' : 'full',
    geography,
    regions: geography.countries.length > 0 ? geography.countries : geography.regions,
    duration,
    timeline: {
      start: duration.startDate || new Date().toISOString().split('T')[0],
      durationMonths: duration.unit === 'months' ? duration.value :
                      duration.unit === 'weeks' ? Math.ceil((duration.value || 0) / 4) :
                      duration.unit === 'days' ? Math.ceil((duration.value || 0) / 30) : null,
      hasEndDate: duration.type !== 'indefinite',
    },
    channels: defaultChannels,
    isCompetitorCampaign: campaignType === 'competitor' || competitors.length > 0,
    competitor: competitors[0] || null,
    budget: { type: 'recommend' as const },
    webinarTitle: null,
    webinarDate: null,
    eventName: null,
    eventDate: null,
    eventLocation: null,
    postUrl: null,
    promoName: null,
    partnerName: null,
    keyMessages: [],
    verticalFocus: null,
    abm: { type: 'broad' as const },
    suggestedName: generateCampaignName({
      campaignType,
      product: product || undefined,
      competitor: competitors[0],
      region: formatGeographyForName(geography),
    }),
  };
}

function parseDuration(text: string): {
  type: 'indefinite' | 'fixed' | 'dateRange';
  value: number | null;
  unit: 'days' | 'weeks' | 'months' | null;
  startDate: string | null;
  endDate: string | null;
} {
  const lower = text.toLowerCase();
  
  const dayMatch = lower.match(/(\d+)\s*days?/);
  if (dayMatch) {
    return { type: 'fixed', value: parseInt(dayMatch[1]), unit: 'days', startDate: null, endDate: null };
  }
  
  const weekMatch = lower.match(/(\d+)\s*weeks?/);
  if (weekMatch) {
    return { type: 'fixed', value: parseInt(weekMatch[1]), unit: 'weeks', startDate: null, endDate: null };
  }
  
  const monthMatch = lower.match(/(\d+)\s*months?/);
  if (monthMatch) {
    return { type: 'fixed', value: parseInt(monthMatch[1]), unit: 'months', startDate: null, endDate: null };
  }
  
  return { type: 'indefinite', value: null, unit: null, startDate: null, endDate: null };
}
