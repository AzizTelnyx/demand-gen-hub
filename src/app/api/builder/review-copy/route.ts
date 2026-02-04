import { NextRequest, NextResponse } from 'next/server';
import { createCompletion } from '@/lib/ai-client';

const BRAND_VOICE = `
TELNYX BRAND VOICE:
- Authoritative: We know this space, we built the infrastructure
- Grounded: Real claims, real proof, no hype
- Confident: Direct statements, not hedging
- Plainspoken: Engineer-to-engineer, not marketing fluff

BANNED: revolutionary, game-changing, cutting-edge, best-in-class, "solutions" without specificity, em dashes (—)
`;

const VOICE_AI_PILLARS = `
VOICE AI PILLARS (map each ad to these):

Pillar 1: Real-Time Performance
- Pain: Latency, jitter, turn-taking breakdowns, vendor chains adding delay
- Telnyx: Sub-second response, stable at scale, global consistency

Pillar 2: Telephony Designed for AI
- Pain: Carrier hops, audio degradation, PSTN not built for AI
- Telnyx: HD audio, noise suppression, predictable routing

Pillar 3: Voice That Takes Action
- Pain: AI talks but can't act, disconnected from systems, manual follow-up
- Telnyx: Tool calling, MCP integration, actions during calls

Pillar 4: Predictable Cost & Observability
- Pain: Multi-vendor bills, no traceability, surprise costs
- Telnyx: One platform, end-to-end traces, transparent pricing
`;

const CHARACTER_LIMITS = `
CHARACTER LIMITS (strict):
- Google Headlines: 30 characters max
- Google Descriptions: 90 characters max
- LinkedIn Headlines: 70 characters max
- LinkedIn Intro Text: 150 characters (before truncation)
`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adCopy, product, targetAudience, funnelStage, channels } = body;

    const prompt = `You are a senior B2B ad reviewer for Telnyx. Review this ad copy against brand guidelines and messaging pillars.

${BRAND_VOICE}

${VOICE_AI_PILLARS}

${CHARACTER_LIMITS}

REVIEW FRAMEWORK:
1. Pain Point Check: Is the pain clear? Will audience feel it as THEIR problem?
2. Transformation Check: Is before/after clear? Is the "after" compelling?
3. Brand Voice Check: Does it sound like Telnyx? Engineer-to-engineer? No hype?
4. Fact Check: Are claims accurate? No invented stats?
5. Character Limit Check: Within platform limits?
6. Em Dash Check: NO em dashes (—) allowed

CRITICAL RULES:
- If something needs fixing, provide EXACT replacement copy
- Never say "consider" or "could be tightened" — WRITE THE FIX
- Every issue must cite: "Per Pillar X..." or "Brand voice requires..."

Review this ad copy:

Product: ${product || 'Telnyx Platform'}
Audience: ${targetAudience || 'B2B tech buyers'}
Funnel Stage: ${funnelStage || 'MOFU'}
Channels: ${channels?.join(', ') || 'Google, LinkedIn'}

AD COPY TO REVIEW:
${JSON.stringify(adCopy, null, 2)}

Return ONLY valid JSON:
{
  "overallScore": "approved|needs_edits|rewrite",
  "summary": "one sentence overall assessment",
  "reviews": [
    {
      "element": "headline|description|intro|cta",
      "channel": "google|linkedin|display",
      "variant": "variant name or number",
      "currentText": "exact current text",
      "charCount": number,
      "charLimit": number,
      "withinLimit": true|false,
      "status": "approved|needs_edit|rewrite",
      "pillarMapping": "Pillar X: Name" or "No clear pillar",
      "issues": [
        {
          "type": "pain_point|transformation|brand_voice|fact_check|char_limit|em_dash",
          "description": "what's wrong",
          "citation": "Per Pillar X..." or "Brand voice requires...",
          "severity": "critical|warning|suggestion"
        }
      ],
      "suggestedText": "exact replacement if needed",
      "reasoning": "why this change"
    }
  ],
  "priorityFixes": ["most critical fix first", "second", "third"],
  "actionItems": ["specific task 1", "task 2"]
}`;

    const response = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4000,
      temperature: 0.3,
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ 
        success: true, 
        review: fallbackReview(adCopy),
        usedFallback: true 
      });
    }

    const review = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ success: true, review });

  } catch (error: any) {
    console.error('Review copy error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function fallbackReview(adCopy: any) {
  const reviews: any[] = [];
  
  // Check Google ad groups
  adCopy?.adGroups?.forEach((group: any, idx: number) => {
    group.headlines?.forEach((h: any, hIdx: number) => {
      const hasEmDash = h.text?.includes('—');
      const overLimit = (h.chars || h.text?.length || 0) > 30;
      
      reviews.push({
        element: 'headline',
        channel: 'google',
        variant: `${group.theme} H${hIdx + 1}`,
        currentText: h.text,
        charCount: h.chars || h.text?.length || 0,
        charLimit: 30,
        withinLimit: !overLimit,
        status: hasEmDash || overLimit ? 'needs_edit' : 'approved',
        pillarMapping: 'Pillar 1: Real-Time Performance',
        issues: [
          ...(hasEmDash ? [{
            type: 'em_dash',
            description: 'Contains em dash',
            citation: 'Brand voice requires: No em dashes in any copy',
            severity: 'critical'
          }] : []),
          ...(overLimit ? [{
            type: 'char_limit',
            description: `Exceeds 30 char limit (${h.chars || h.text?.length})`,
            citation: 'Google Ads headline limit: 30 characters',
            severity: 'critical'
          }] : [])
        ],
        suggestedText: hasEmDash ? h.text?.replace(/—/g, ', ') : (overLimit ? h.text?.substring(0, 27) + '...' : null),
        reasoning: hasEmDash ? 'Em dashes not allowed in ad copy' : (overLimit ? 'Must fit within character limit' : null)
      });
    });
  });

  return {
    overallScore: reviews.some(r => r.status !== 'approved') ? 'needs_edits' : 'approved',
    summary: 'Basic validation completed. AI review recommended for full pillar alignment check.',
    reviews,
    priorityFixes: reviews.filter(r => r.status !== 'approved').map(r => r.issues?.[0]?.description).slice(0, 3),
    actionItems: ['Review pillar alignment manually', 'Verify all claims against knowledge base']
  };
}
