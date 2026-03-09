import { createCompletion, type Message } from "@/lib/ai-client";
import { prisma } from "@/lib/prisma";
import { loadKnowledgeBundle, KB } from "@/lib/knowledge-loader";
import { getAgent } from "./registry";
import type { AgentOutput } from "./types";

/* ─── Types ──────────────────────────────────────────── */

export interface StrategyContext {
  action: string;
  userContext: string;
  history?: Array<{ role: "user" | "agent"; content: string }>;
  taskId?: string;
  isConfirmation?: boolean;
  previousPlan?: string;
  agentResults?: Array<{ agent: string; summary: string }>;
}

export interface StrategyResult {
  response: string;
  plan?: StrategyPlan;
  agentResults?: AgentExecutionResult[];
  phase: "analysis" | "refinement" | "execution";
}

export interface StrategyPlan {
  summary: string;
  steps: Array<{ agent: string; description: string; params: Record<string, any> }>;
}

export interface AgentExecutionResult {
  agent: string;
  output: AgentOutput;
}

/* ─── Knowledge helpers ──────────────────────────────── */

function getRelevantKBPaths(action: string, context: string): string[] {
  const paths: string[] = [];
  const lower = (action + " " + context).toLowerCase();

  // Always include strategy (regional structure, measurement, naming conventions) + brand + ICP
  paths.push("telnyx-strategy.md");
  paths.push("brand/brand-messaging-q1-2026.txt");
  paths.push("standards/telnyx-icp.md");

  if (/competitor|vonage|twilio|bandwidth|plivo|retell|vapi/i.test(lower)) {
    paths.push("competitors/voice-ai-landscape.md");
  }
  if (/voice|ai|inference/i.test(lower)) {
    paths.push("products/voice-ai.md");
  }
  if (/sip|trunk/i.test(lower)) {
    paths.push("products/sip-trunking.md");
  }
  if (/sms|messag/i.test(lower)) {
    paths.push("products/messaging.md");
  }
  if (/google|search|rsa/i.test(lower)) {
    paths.push("standards/google-ads-standards.md");
    paths.push("standards/google-ads-rsa-best-practices.md");
  }
  if (/linkedin/i.test(lower)) {
    paths.push("standards/linkedin-ads-standards.md");
  }
  if (/copy|ad|headline/i.test(lower)) {
    paths.push("standards/ad-copy-rules.md");
  }
  if (/campaign|launch|naming/i.test(lower)) {
    paths.push("standards/campaign-naming-conventions.md");
    paths.push("standards/utm-tagging-2025.md");
  }
  if (/budget|spend/i.test(lower)) {
    paths.push("playbooks/channel-benchmarks.md");
  }

  return [...new Set(paths)];
}

/* ─── DB context loaders ─────────────────────────────── */

async function loadCampaignContext(context: string): Promise<string> {
  const stopWords = new Set(['the','what','how','can','you','plan','end','create','launch','build','run','with','for','from','that','this','have','our','strategy','campaign','campaigns']);
  const keywords = context.split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .slice(0, 6);

  // Query 1: campaigns matching ALL search terms (AND logic for precision)
  const nameFilters = keywords.map(term => ({
    name: { contains: term, mode: 'insensitive' as const },
  }));

  let matchedCampaigns = nameFilters.length > 0
    ? await prisma.campaign.findMany({
        where: { AND: nameFilters },
        orderBy: { spend: "desc" },
        take: 30,
      })
    : [];

  // Fallback: if AND returns nothing, try OR (broader)
  if (matchedCampaigns.length === 0 && nameFilters.length > 1) {
    matchedCampaigns = await prisma.campaign.findMany({
      where: { OR: nameFilters },
      orderBy: { spend: "desc" },
      take: 30,
    });
  }

  // Query 2: top active campaigns for general context
  const topCampaigns = await prisma.campaign.findMany({
    where: { status: { in: ["enabled", "active", "live"] } },
    orderBy: { spend: "desc" },
    take: 15,
  });

  const totalActive = await prisma.campaign.count({ where: { status: { in: ["enabled", "active", "live"] } } });

  let out = `## Campaigns\n`;

  if (matchedCampaigns.length > 0) {
    out += `\n### Matching "${context.slice(0, 50)}" (${matchedCampaigns.length} found, any status):\n`;
    for (const c of matchedCampaigns) {
      out += `- ${c.name} (${c.platform}, ${c.status}) — $${(c.spend || 0).toFixed(0)} spend, ${c.conversions || 0} conv, ${c.clicks || 0} clicks\n`;
    }
  }

  out += `\n### Top active by spend (${totalActive} active total):\n`;
  for (const c of topCampaigns) {
    out += `- ${c.name} (${c.platform}) — $${(c.spend || 0).toFixed(0)} spend, ${c.conversions || 0} conv\n`;
  }

  const totalSpend = topCampaigns.reduce((s, c) => s + (c.spend || 0), 0);
  const totalConv = topCampaigns.reduce((s, c) => s + (c.conversions || 0), 0);
  out += `\nTotal active spend: $${totalSpend.toFixed(0)} | Total conversions: ${totalConv}`;

  return out;
}

/* ─── System prompt ──────────────────────────────────── */

const STRATEGY_SYSTEM_PROMPT = `You are the Strategy Agent for Telnyx's demand generation team. You analyze data, form recommendations, and create execution plans.

## Rules
- NEVER fabricate data. If you need search volumes, competitor data, or performance metrics you don't have, say you'll pull real data.
- Be brief: 2-3 sentences for recommendations. Structured plan for confirmations.
- Ask only for genuinely missing info (1-2 questions max). Don't dump a form.
- Think through what you know from the data before asking anything.
- Reference specific campaigns, numbers, and patterns from the data provided.

## Response Format
Your response MUST be valid JSON:
{
  "response": "your conversational response to the user (markdown ok)",
  "plan": null | {
    "summary": "one-line plan summary",
    "steps": [
      { "agent": "agent-slug", "description": "what this step does", "params": {} }
    ]
  },
  "needsInfo": false,
  "phase": "analysis" | "refinement" | "execution"
}

- "analysis" phase: First response. Analyze data, make recommendations, ask 1-2 questions if needed.
- "refinement" phase: User answered questions. Refine the plan.
- "execution" phase: User confirmed. Return plan with concrete steps.

## Product Clarity
Telnyx products: Voice AI, SMS API, SIP Trunking, IoT SIMs, Programmable Voice, Inference (AI Gateway), Networking.
If the user mentions a USE CASE (e.g. "contact center", "call center", "authentication") instead of a specific product, ASK which Telnyx product(s) to focus on. Don't assume.
Once the product is confirmed, stay on that product. NEVER mix in unrelated products (e.g. don't put eSIM headlines in a Voice AI campaign).

## Budget Rules
- ALWAYS show math: "Based on avg CPC of $X and target Y clicks/mo = $Z/mo"
- Reference actual CPL/CPC data from the campaigns provided
- If you don't have real benchmarks, say so and give a range with assumptions stated
- Never give a number without explaining the formula

## Available Agents & Required Params
- keyword-researcher: { seed_keywords: string[], product: string, regions?: string[] }
- ad-copy-generator: { product: string, channel: "google_search"|"linkedin"|"stackadapt"|"reddit", funnel_stage?: string, regions?: string[], competitors?: string[] }
- budget-calculator: { channels: string[], regions?: string[], product?: string, target_budget?: number }
- campaign-optimizer: { campaign_name?: string }
- ad-review: { }
- overlap-checker: { }
- reporting: { }
- campaign-deep-dive: { campaign_name: string }
- campaign-orchestrator: Full campaign launch workflow
- abm-list: { description: string, target?: number }
- health-check: { }

CRITICAL: When creating plan steps, populate params with the EXACT product, regions, and context from the conversation. Do NOT default to voice-ai or US if the user specified something else.

## Examples

User: "Launch a competitor campaign targeting Vonage"
Good response:
{
  "response": "You don't have any active campaigns specifically targeting Vonage right now. I can build a competitor displacement campaign — Google Search on competitor keywords plus LinkedIn targeting their ICP.\n\nA few things I need first:\n- **Which product?** Voice AI, SMS API, SIP Trunking, IoT, or broader CPaaS?\n- **Region?** AMER only or global?\n- **Budget range?** Or should I recommend based on your current CPLs?",
  "plan": null,
  "needsInfo": true,
  "phase": "analysis"
}

User: "Voice AI, AMER, $3k"
Good response:
{
  "response": "Here's the plan:\n\n**Vonage Competitor Campaign — Voice AI (AMER) — $3k/mo**\n- Google Search: Competitor keywords, $2,000/mo budget\n- LinkedIn: Decision-maker targeting at Vonage accounts, $1,000/mo\n- Keywords: vonage alternative, vonage vs telnyx, switch from vonage\n- Copy angle: Telnyx Voice AI reliability + cost advantage\n\nShall I proceed?",
  "plan": {
    "summary": "Vonage competitor campaign - Voice AI - AMER - $3k/mo",
    "steps": [
      { "agent": "keyword-researcher", "description": "Research vonage competitor keywords", "params": { "seed_keywords": ["vonage alternative", "vonage vs telnyx", "switch from vonage", "vonage competitor"], "product": "voice-ai" } },
      { "agent": "ad-copy-generator", "description": "Generate competitor ad copy", "params": { "product": "voice-ai", "competitors": ["vonage"], "angle": "competitor-displacement" } },
      { "agent": "budget-calculator", "description": "Allocate $3k across Google + LinkedIn", "params": { "total_budget": 3000, "channels": ["google_search", "linkedin"] } }
    ]
  },
  "needsInfo": false,
  "phase": "refinement"
}`;

/* ─── Main strategy function ─────────────────────────── */

export async function runStrategy(ctx: StrategyContext): Promise<StrategyResult> {
  // Load context
  const [campaignData, knowledgeBase] = await Promise.all([
    loadCampaignContext(ctx.userContext),
    Promise.resolve(loadKnowledgeBundle(getRelevantKBPaths(ctx.action, ctx.userContext))),
  ]);

  // Build messages
  const messages: Message[] = [
    { role: "system", content: STRATEGY_SYSTEM_PROMPT },
    {
      role: "system",
      content: `## Current Data\n\n${campaignData}\n\n## Knowledge Base\n\n${knowledgeBase.slice(0, 8000)}`,
    },
  ];

  // Add conversation history
  if (ctx.history?.length) {
    for (const h of ctx.history.slice(-10)) {
      messages.push({
        role: h.role === "user" ? "user" : "assistant",
        content: h.content,
      });
    }
  }

  // Current message
  let userMsg = ctx.userContext;
  if (ctx.isConfirmation) {
    userMsg = `The user confirmed the plan. Set phase to "execution" and return the full plan with concrete params for each agent step.

CRITICAL: Read the ENTIRE conversation history above. Extract the exact product, regions, budget, funnel stage, and any other details the user specified. Put these into the agent params. Do NOT use defaults — use what the user said.

User said: "${ctx.userContext}"`;
    if (ctx.previousPlan) {
      userMsg += `\n\nPrevious plan draft:\n${ctx.previousPlan}`;
    }
    if (ctx.agentResults?.length) {
      userMsg += `\n\nPrevious agent execution results:\n${ctx.agentResults.map((r: any) => `- ${r.agent}: ${r.summary}`).join('\n')}`;
    }
  }

  messages.push({ role: "user", content: userMsg });

  const raw = await createCompletion({
    messages,
    maxTokens: 2048,
    temperature: 0.3,
  });

  // Parse JSON response
  let parsed: any;
  try {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
    parsed = JSON.parse(jsonMatch[1]!.trim());
  } catch {
    // Fallback: treat as plain text response
    return {
      response: raw,
      phase: "analysis",
    };
  }

  const phase = parsed.phase || "analysis";

  // If execution phase, run the agents
  if (phase === "execution" && parsed.plan?.steps?.length) {
    return {
      response: parsed.response,
      plan: parsed.plan,
      phase: "execution",
    };
  }

  return {
    response: parsed.response,
    plan: parsed.plan || undefined,
    phase,
  };
}

/* ─── Execute plan agents ────────────────────────────── */

export async function executePlan(
  plan: StrategyPlan,
  writer: { write: (event: any) => void },
): Promise<AgentExecutionResult[]> {
  const results: AgentExecutionResult[] = [];

  // Reorder: abm-list first, then keyword-researcher, then budget-calculator, then ad-copy-generator, then rest
  const priorityOrder = ["abm-list", "keyword-researcher", "budget-calculator", "ad-copy-generator"];
  const sortedSteps = [...plan.steps].sort((a, b) => {
    const aIdx = priorityOrder.indexOf(a.agent);
    const bIdx = priorityOrder.indexOf(b.agent);
    const aOrder = aIdx >= 0 ? aIdx : priorityOrder.length;
    const bOrder = bIdx >= 0 ? bIdx : priorityOrder.length;
    return aOrder - bOrder;
  });

  // Collected context to pass downstream
  let keywordData: any = null;
  let abmData: any = null;

  for (let i = 0; i < sortedSteps.length; i++) {
    const step = sortedSteps[i];
    const handler = getAgent(step.agent);

    if (!handler) {
      writer.write({ type: "step", content: `⚠️ Agent "${step.agent}" not found, skipping...` });
      continue;
    }

    writer.write({
      type: "step",
      content: `Running ${step.description}... (${i + 1}/${sortedSteps.length})`,
    });

    // Inject plan context + upstream data into all agents
    const enrichedParams: Record<string, any> = { ...step.params, _planSummary: plan.summary };

    if (step.agent === "budget-calculator") {
      if (keywordData) {
        enrichedParams.keyword_data = keywordData;
      }
      if (abmData) {
        enrichedParams.abm_data = abmData;
      }
    }

    if (step.agent === "ad-copy-generator" && keywordData) {
      enrichedParams.keyword_data = keywordData;
    }

    try {
      const output = await handler.run({
        task: step.description,
        context: { ...enrichedParams, _streamWriter: writer },
      });

      results.push({ agent: step.agent, output });

      // Extract data for downstream agents
      if (step.agent === "keyword-researcher" && output.artifacts?.length) {
        const kwArtifact = output.artifacts.find((a: any) => a.type === "keyword_research");
        if (kwArtifact) {
          keywordData = {
            totalKeywords: kwArtifact.summary?.totalKeywords,
            totalVolume: kwArtifact.summary?.totalVolume,
            highIntentVolume: Math.round(
              (kwArtifact.keywords || [])
                .filter((k: any) => k.intent === "high")
                .reduce((s: number, k: any) => s + (k.estVolume || 0), 0)
            ),
            avgCPC: kwArtifact.summary?.avgCPC,
            location: kwArtifact.location,
          };
        }
      }

      if (step.agent === "abm-list" && output.artifacts?.length) {
        const abmArtifact = output.artifacts.find((a: any) => a.type === "abm_list");
        if (abmArtifact) {
          abmData = {
            companyCount: abmArtifact.summary?.total || abmArtifact.companies?.length || 0,
            estAudienceSize: abmArtifact.summary?.estAudienceSize || 0,
          };
        }
      }

      // Stream individual agent results
      if (output.artifacts?.length) {
        writer.write({ type: "artifact", data: output.artifacts });
      }
      if (output.recommendations?.length) {
        writer.write({ type: "recommendations", data: output.recommendations });
      }
    } catch (err: any) {
      writer.write({
        type: "step",
        content: `❌ ${step.agent} failed: ${err.message}`,
      });
      results.push({
        agent: step.agent,
        output: {
          findings: [{ severity: "high", title: "Agent Error", detail: err.message }],
          recommendations: [],
          summary: `Failed: ${err.message}`,
        },
      });
    }
  }

  return results;
}
