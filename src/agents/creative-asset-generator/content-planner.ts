// Content Planner - Brief parsing and copy generation
import { createCompletion } from '@/lib/ai-client';
import type { CreativeBrief, GeneratedCopy, Pillar } from './types';

/* ─── Brand Guidelines ────────────────────────────────── */

const BRAND_GUIDE = {
  pillars: {
    trust: {
      keywords: ['HIPAA', 'compliance', 'secure', 'SOC2', 'PCI', 'trust', 'reliable', 'enterprise'],
      dataPoints: ['HIPAA-ready', 'SOC 2 Type II', '99.999% uptime', '30+ countries licensed'],
    },
    infrastructure: {
      keywords: ['network', 'vendor', 'platform', 'integration', 'stack', 'own', 'build', 'one'],
      dataPoints: ['1 platform', 'Own network', '140+ countries', 'Zero extra hops'],
    },
    physics: {
      keywords: ['latency', 'ms', 'faster', 'speed', 'performance', 'real-time', 'sub-', 'edge'],
      dataPoints: ['<500ms response', 'Sub-second latency', 'Co-located inference', '30+ edge PoPs'],
    },
  },
  differentiators: [
    'Owns its own network (not a reseller like Twilio)',
    'Sub-500ms latency (inference co-located with telephony)',
    'HIPAA/SOC2/PCI compliant',
    '140+ countries',
    'One platform (not 5 vendors)',
  ],
};

/* ─── Brief Parser ────────────────────────────────────── */

export async function parseBrief(promptText: string): Promise<CreativeBrief> {
  const parsePrompt = `Parse this creative brief and extract structured information:

"${promptText}"

Extract:
1. Platform (linkedin, stackadapt-native, stackadapt-display, reddit, google-display)
2. Target audience (who are we targeting?)
3. Pain points (what problem are we solving?)
4. Core message (what's the main point?)
5. Pillar (trust, infrastructure, physics - based on keywords)
6. Ad copy example (if provided in quotes)
7. CTA suggestion

Telnyx messaging pillars:
- **Trust**: HIPAA, compliance, security, SOC2, enterprise
- **Infrastructure**: Own network, 1 platform vs 5 vendors, integration
- **Physics**: Latency, speed, <500ms, performance, real-time

Return JSON:
{
  "platform": "linkedin",
  "audience": "healthcare IT decision makers",
  "painPoints": ["after-hours coverage", "overwhelmed staff"],
  "coreMessage": "HIPAA-ready Voice AI for 24/7 patient access",
  "pillar": "trust",
  "adCopyExample": "Voice AI that handles patient calls 24/7. HIPAA-ready.",
  "ctaSuggestion": "Learn More"
}`;

  try {
    const response = await createCompletion({
      messages: [
        { role: 'system', content: 'Return ONLY valid JSON, no markdown.' },
        { role: 'user', content: parsePrompt },
      ],
      maxTokens: 1024,
      temperature: 0.3,
    });

    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      id: `creative-${Date.now()}`,
      platform: parsed.platform || 'linkedin',
      audience: parsed.audience || 'developers',
      painPoints: parsed.painPoints || [],
      coreMessage: parsed.coreMessage || promptText,
      pillar: (parsed.pillar as Pillar) || inferPillar(promptText),
      adCopyExample: parsed.adCopyExample,
      ctaSuggestion: parsed.ctaSuggestion || 'Learn More',
    };
  } catch (error) {
    console.error('Brief parsing failed, using defaults:', error);
    return {
      id: `creative-${Date.now()}`,
      platform: 'linkedin',
      audience: 'developers',
      painPoints: [],
      coreMessage: promptText,
      pillar: inferPillar(promptText),
      ctaSuggestion: 'Learn More',
    };
  }
}

/* ─── Pillar Inference ────────────────────────────────── */

function inferPillar(text: string): Pillar {
  const lower = text.toLowerCase();

  for (const keyword of BRAND_GUIDE.pillars.trust.keywords) {
    if (lower.includes(keyword.toLowerCase())) return 'trust';
  }

  for (const keyword of BRAND_GUIDE.pillars.physics.keywords) {
    if (lower.includes(keyword.toLowerCase())) return 'physics';
  }

  return 'infrastructure';
}

/* ─── Copy Generator ──────────────────────────────────── */

export async function generateCopy(brief: CreativeBrief): Promise<GeneratedCopy> {
  const pillarInfo = BRAND_GUIDE.pillars[brief.pillar];

  const copyPrompt = `Generate ad copy for Telnyx Voice AI.

**Brief:**
- Platform: ${brief.platform}
- Audience: ${brief.audience}
- Pain points: ${brief.painPoints.join(', ') || 'general'}
- Core message: ${brief.coreMessage}
- Pillar: ${brief.pillar}

**Telnyx differentiators:**
${BRAND_GUIDE.differentiators.map(d => `- ${d}`).join('\n')}

**Key data points for ${brief.pillar}:**
${pillarInfo.dataPoints.map(d => `- ${d}`).join('\n')}

**Platform requirements:**
${brief.platform === 'linkedin' ? '- Headlines: Max 200 chars\n- Descriptions: Max 600 chars\n- Tone: Professional but human' : ''}
${brief.platform === 'stackadapt-native' ? '- Headlines: Max 55 chars\n- Descriptions: Max 120 chars\n- Tone: Editorial, informative' : ''}
${brief.platform === 'reddit' ? '- Headlines: Max 150 chars\n- Tone: Casual, authentic, peer-to-peer' : ''}
${brief.platform === 'google-display' ? '- Headlines: Max 30 chars (multiple)\n- Descriptions: Max 90 chars\n- Tone: Direct, transactional' : ''}

**Rules:**
- No filler words (leading, best-in-class, innovative, cutting-edge, etc.)
- Be specific with numbers
- Sound like an engineer, not a marketer
- No emojis
- Never use "platform" - use "stack" or "infrastructure"

Generate:
- 5 headline variations (short, punchy)
- 3 description variations
- 1 CTA

Return JSON:
{
  "headlines": ["headline 1", "headline 2", ...],
  "descriptions": ["desc 1", "desc 2", ...],
  "cta": "Learn More"
}`;

  try {
    const response = await createCompletion({
      messages: [
        { role: 'system', content: 'Return ONLY valid JSON, no markdown.' },
        { role: 'user', content: copyPrompt },
      ],
      maxTokens: 2048,
      temperature: 0.6,
    });

    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('Copy generation failed, using defaults:', error);
    return {
      headlines: [brief.coreMessage || 'Voice AI Infrastructure'],
      descriptions: [brief.coreMessage || 'Built for real-time voice AI at scale.'],
      cta: brief.ctaSuggestion || 'Learn More',
    };
  }
}

/* ─── Exports ─────────────────────────────────────────── */

export { BRAND_GUIDE };
