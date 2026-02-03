import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notes, googleDocs, googleSheets } = body;

    // TODO: Call Clawdbot API to parse brief using brief-parser agent
    // For now, return mock extracted data
    
    const allText = [
      notes || '',
      // In production, fetch content from Google Docs/Sheets
    ].join(' ').toLowerCase();

    const extracted = {
      product: allText.includes('voice') ? 'Voice AI' : 
               allText.includes('sms') ? 'SMS API' : 'Voice AI',
      targetAudience: allText.includes('contact center') ? 'Enterprise contact centers' :
                      allText.includes('developer') ? 'Developers' : 'Enterprise',
      goal: allText.includes('demo') || allText.includes('lead') ? 'leads' :
            allText.includes('awareness') ? 'awareness' : 'leads',
      regions: extractRegions(allText),
      budget: extractBudget(allText),
      funnelFocus: allText.includes('awareness') ? 'tofu' :
                   allText.includes('conversion') ? 'bofu' : 'full',
      timeline: {
        start: new Date().toISOString().split('T')[0],
        durationMonths: 3,
      },
      abm: { type: 'broad' },
    };

    return NextResponse.json({ success: true, extracted });
  } catch (error) {
    console.error('Parse brief error:', error);
    return NextResponse.json({ success: false, error: 'Failed to parse brief' }, { status: 500 });
  }
}

function extractRegions(text: string): string[] {
  const regions: string[] = [];
  if (text.includes('us') || text.includes('america') || text.includes('amer')) regions.push('US');
  if (text.includes('uk') || text.includes('britain') || text.includes('emea')) regions.push('UK');
  if (text.includes('germany') || text.includes('dach')) regions.push('Germany');
  if (text.includes('apac') || text.includes('asia')) regions.push('APAC');
  if (text.includes('global')) return ['Global'];
  return regions.length > 0 ? regions : ['US'];
}

function extractBudget(text: string): { type: 'specified' | 'recommend'; amount?: number } {
  const match = text.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:k|K)?/);
  if (match) {
    let amount = parseFloat(match[1].replace(/,/g, ''));
    if (text.includes('k') || text.includes('K')) amount *= 1000;
    return { type: 'specified', amount };
  }
  return { type: 'recommend' };
}
