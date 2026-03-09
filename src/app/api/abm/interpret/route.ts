import { NextRequest, NextResponse } from "next/server";

const OPENCLAW_BASE = process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1";
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// Load knowledge context for ABM interpretation
async function loadKnowledgeContext(): Promise<string> {
  try {
    const sections = ["telnyx-strategy", "brand/brand-messaging-q1-2026"];
    const results: string[] = [];

    for (const section of sections) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const res = await fetch(`${baseUrl}/api/context?section=${section}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.content) results.push(data.content);
        }
      } catch {}
    }

    return results.join("\n\n---\n\n");
  } catch {
    return "";
  }
}

const SYSTEM_PROMPT = `You are the ABM Brief Interpreter for Telnyx, a cloud communications company.

Your job: understand what kind of companies the user wants to target, then produce a structured research criteria when you have enough information.

TELNYX PRODUCTS (use these exact values for productFit):
- voice-ai: Real-time voice AI, call control, conversational AI, low-latency voice
- sip-trunking: SIP trunking for enterprises replacing legacy telco / PSTN
- sms-api: Programmable SMS/MMS, A2P messaging, notifications
- contact-center: CCaaS infrastructure, IVR replacement, omnichannel support
- iot: IoT SIM connectivity, fleet management, connected devices
- programmable-voice: Voice API, call routing, IVR, click-to-call
- multi-product: Would use 2+ Telnyx products

VALID VERTICALS: healthtech, fintech, insurtech, ccaas, travel, logistics, ecommerce, edtech, proptech, legaltech, media, telecom, automotive, energy, government, security, hr-tech, martech, retail, gaming, crypto, ai-voice, bpo

VALID REGIONS: AMER, EMEA, APAC, MENA

YOUR BEHAVIOR:
1. Read the user's brief/request carefully
2. If it's clear enough to generate a list, produce the CRITERIA block immediately
3. If it's ambiguous, ask 1-2 focused clarifying questions (not more). Examples:
   - "Are you targeting companies that BUILD contact center software, or companies that NEED contact center solutions?"
   - "Any specific company size preference — startups, mid-market, enterprise?"
   - "Can you give me 2-3 example companies that represent your ideal target?"
4. Never ask more than 2 questions at once
5. When you have enough context, output a CRITERIA block

CRITERIA BLOCK FORMAT (output this when ready):
\`\`\`criteria
{
  "ready": true,
  "listName": "Suggested list name",
  "listType": "vertical|use-case|conquest",
  "description": "One line description",
  "vertical": "primary vertical or null for use-case/conquest",
  "regions": ["AMER", "EMEA"],
  "productFit": ["voice-ai", "contact-center"],
  "targetCompanyProfile": "Detailed description of ideal company — what they do, why they need Telnyx, what signals to look for",
  "includeProviders": ["Twilio", "Vonage"],
  "excludeCompanies": [],
  "exampleCompanies": ["Company A", "Company B"],
  "estimatedTarget": 200
}
\`\`\`

IMPORTANT:
- Be conversational but concise — no filler
- If the user gives a full campaign brief, extract everything you can from it
- If the user gives a one-liner, that's fine too — just ask what's missing
- The criteria block drives the research agent, so be specific in targetCompanyProfile
- Don't output the criteria block until you're confident you understand the request`;

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json() as { messages: Message[] };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    // Load knowledge on first message
    const knowledgeContext = await loadKnowledgeContext();

    const systemMessage = knowledgeContext
      ? `${SYSTEM_PROMPT}\n\n--- TELNYX KNOWLEDGE BASE ---\n${knowledgeContext.slice(0, 8000)}`
      : SYSTEM_PROMPT;

    const aiMessages = [
      { role: "system", content: systemMessage },
      ...messages,
    ];

    const res = await fetch(`${OPENCLAW_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENCLAW_TOKEN}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-opus-4-6-20250306",
        messages: aiMessages,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("AI call failed:", res.status, err);
      return NextResponse.json({ error: "AI call failed" }, { status: 502 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Check if response contains criteria block
    const criteriaMatch = content.match(/```criteria\s*([\s\S]*?)\s*```/);
    let criteria = null;
    let message = content;

    if (criteriaMatch) {
      try {
        criteria = JSON.parse(criteriaMatch[1]);
        // Remove criteria block from visible message
        message = content.replace(/```criteria\s*[\s\S]*?\s*```/, "").trim();
      } catch {
        // If parsing fails, just return the message
      }
    }

    return NextResponse.json({
      message,
      criteria,
      done: !!criteria,
    });
  } catch (error: any) {
    console.error("Interpret error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
