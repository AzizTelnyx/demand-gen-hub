import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTracker, updateTrackerStatus } from "@/lib/tracker-bridge";
import { getAgent } from "@/agents/registry";
import { createCompletion, type Message } from "@/lib/ai-client";
import { runStrategy, executePlan, type StrategyContext } from "@/agents/strategy";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

/* ─── Knowledge Base Context ─────────────────────────── */

const KNOWLEDGE_DIR = join(process.cwd(), "knowledge");

// Core files loaded into every AI prompt — single source of truth
const CORE_KNOWLEDGE_FILES = [
  "telnyx-strategy.md",
  "brand/brand-messaging-q1-2026.md",
  "standards/ad-copy-rules.md",
  "product-groups.md",
];

let _knowledgeCache: { content: string; loadedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 min cache

async function loadKnowledgeContext(): Promise<string> {
  if (_knowledgeCache && Date.now() - _knowledgeCache.loadedAt < CACHE_TTL) {
    return _knowledgeCache.content;
  }
  const parts: string[] = [];
  for (const file of CORE_KNOWLEDGE_FILES) {
    const filePath = join(KNOWLEDGE_DIR, file);
    if (existsSync(filePath)) {
      try {
        parts.push(await readFile(filePath, "utf-8"));
      } catch { /* skip */ }
    }
  }
  const content = parts.join("\n\n---\n\n");
  _knowledgeCache = { content, loadedAt: Date.now() };
  return content;
}

/* ─── Live Metrics Query ─────────────────────────────── */

const PYTHON = join(homedir(), ".venv/bin/python");
const QUERY_SCRIPT = join(process.cwd(), "scripts/query_metrics.py");

interface LiveMetrics {
  platform: string;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  campaignCount: number;
  campaigns: any[];
}

async function queryLiveMetrics(opts: {
  platform: string;
  from: string;
  to: string;
  search?: string;
  top?: number;
}): Promise<LiveMetrics | null> {
  const args = [
    QUERY_SCRIPT,
    "--platform", opts.platform,
    "--from", opts.from,
    "--to", opts.to,
  ];
  if (opts.search) args.push("--search", opts.search);
  if (opts.top) args.push("--top", String(opts.top));

  try {
    const { stdout } = await execFileAsync(PYTHON, args, {
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env, HOME: homedir() },
    });
    return JSON.parse(stdout);
  } catch (e: any) {
    console.error(`[queryLiveMetrics] ${opts.platform} failed:`, e.message?.slice(0, 200));
    return null;
  }
}

async function queryAllPlatforms(from: string, to: string, search?: string, top?: number): Promise<LiveMetrics[]> {
  // Run each platform in parallel to avoid OOM from --platform all
  const platforms = ["google_ads", "linkedin", "stackadapt", "reddit"];
  const results = await Promise.allSettled(
    platforms.map(p => queryLiveMetrics({ platform: p, from, to, search, top }))
  );
  return results
    .map(r => r.status === "fulfilled" ? r.value : null)
    .filter((r): r is LiveMetrics => r !== null);
}

function formatMetricsContext(metrics: LiveMetrics[]): string {
  if (metrics.length === 0) return "\n(Live metrics unavailable — API query failed)\n";

  let ctx = "";
  let grandSpend = 0, grandImpr = 0, grandClicks = 0, grandConv = 0;

  for (const m of metrics) {
    grandSpend += m.totalSpend || 0;
    grandImpr += m.totalImpressions || 0;
    grandClicks += m.totalClicks || 0;
    if (m.platform === "google_ads") grandConv += m.totalConversions || 0;

    ctx += `\n### ${m.platform} (${m.campaignCount} active campaigns)\n`;
    ctx += `Total: $${m.totalSpend?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} spend | ${m.totalImpressions?.toLocaleString()} impr | ${m.totalClicks?.toLocaleString()} clicks`;
    if (m.platform === "google_ads") {
      ctx += ` | ${m.totalConversions} conv`;
    } else {
      ctx += ` | ABM attribution (see Pipeline)`;
    }
    ctx += "\n";

    if (m.campaigns?.length > 0) {
      ctx += "Top campaigns:\n";
      for (const c of m.campaigns.slice(0, 10)) {
        const convPart = m.platform === "google_ads"
          ? `${c.conversions} conv`
          : "ABM (Pipeline)";
        ctx += `- ${c.name}: $${c.spend?.toFixed(2)} | ${c.impressions?.toLocaleString()} impr | ${c.clicks} clicks | ${convPart}\n`;
      }
    }
  }

  ctx += `\n### Grand Total\n$${grandSpend.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} spend | ${grandImpr.toLocaleString()} impr | ${grandClicks.toLocaleString()} clicks | ${grandConv} Google Ads conv\n`;
  return ctx;
}

/* ─── Types ──────────────────────────────────────────── */

interface HistoryMessage {
  role: "user" | "agent";
  content: string;
}

interface SSEWriter {
  write: (event: SSEEvent) => void;
  close: () => void;
}

type SSEEvent =
  | { type: "step"; content: string }
  | { type: "chunk"; content: string }
  | { type: "artifact"; data: any }
  | { type: "recommendations"; data: any[] }
  | { type: "phase"; data: { current: string; completed: string[] } }
  | { type: "done"; taskId: string | null; runId?: string; intent: string; agent: string | null; status: string; confidence?: number; result?: any };

function createSSEStream(): { readable: ReadableStream; writer: SSEWriter } {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
  });
  return {
    readable,
    writer: {
      write(event: SSEEvent) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* stream closed */ }
      },
      close() {
        try { controller.close(); } catch { /* already closed */ }
      },
    },
  };
}

/* ─── Classifier ─────────────────────────────────────── */

const CLASSIFIER_PROMPT = `Classify the user message. Return JSON only.
Question = asking about data, status, how things work, or general info.
Task = requesting an action (launch, create, generate, optimize, review, analyze, build).

{"type":"question"} or {"type":"task","action":"brief_action_name","context":"key details from message"}`;

async function classifyMessage(message: string): Promise<{ type: "question" | "task"; action?: string; context?: string }> {
  const lower = message.toLowerCase().trim();

  // Task verbs — check these FIRST (even if message ends with ?)
  const taskVerbs = /\b(launch|create|build|generate|optimize|set\s*up|write|draft|run|start|spin|plan|pause|enable|disable|scale|research|do\s*(a|the|some|keyword|kw|ad)|execute|analyze|audit)\b/i;
  
  // "Can you do X" / "do the X" / "run a X" = task, not question
  const isActionRequest = /^(can\s*you\s*(do|run|create|generate|build|write|draft|plan|research|launch|optimize|execute|start))\b/i.test(lower)
    || /^(do|run|execute|perform)\s+(a|the|some|my|keyword|kw|ad|budget)\b/i.test(lower);

  if (isActionRequest || taskVerbs.test(lower)) {
    // But not if it's purely asking about data ("what does our research show")
    const pureDataQuery = /^(what|which|how\s*many|how\s*much|show|list)\s/i.test(lower) && !isActionRequest;
    if (!pureDataQuery) {
      return { type: "task", action: "general", context: message.slice(0, 100) };
    }
  }

  // Spend report requests should be tasks even if they start with "give me" or "show me"
  if (/spend\s*report|budget\s*report|break\s*down\s*spend|spend\s*by\s*(product|funnel|region|platform)|spending\s*report/i.test(lower)) {
    return { type: "task", action: "spend_report", context: message.slice(0, 100) };
  }

  // Questions: data retrieval queries
  const isQuestion = /^(show|list|what|which|how\s*many|how\s*is|how\s*are|tell\s*me|give\s*me|compare|whats|what'?s|is\s*there|do\s*we|are\s*there|what\s*about|break\s*down)/i.test(lower)
    || /\?\s*$/.test(lower)
    || /^(can\s*you\s*(show|list|tell|give|check|look|find))/i.test(lower);

  if (isQuestion) {
    return { type: "question" };
  }

  // Default: question (safer)
  return { type: "question" };
}

/* ─── Short affirmative/negative detection ───────────── */

const AFFIRMATIVE = /^(yes|yeah|yep|yup|y|go\s*ahead|sounds?\s*good|do\s*it|approved?|proceed|continue|sure|ok|okay|let'?s?\s*(do|go)|absolutely|correct|right|confirm)/i;
const NEGATIVE = /^(no|nah|nope|n|skip|cancel|stop|reject|don'?t|negative|pass)/i;

function isShortResponse(msg: string): "affirm" | "negate" | null {
  const trimmed = msg.trim();
  if (trimmed.length > 40) return null;
  if (AFFIRMATIVE.test(trimmed)) return "affirm";
  if (NEGATIVE.test(trimmed)) return "negate";
  return null;
}

/* ─── POST /api/orchestrate ──────────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, userId, context, taskId, action, history } = body;
    const wantStream = request.nextUrl.searchParams.get("stream") === "true";

    // ── Follow-up on existing task ────────────────────────
    if (taskId) {
      return handleFollowUp(taskId, message, action, userId, context, history, wantStream);
    }

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // ── 1. Classify: question or task? ────────────────────
    const classification = await classifyMessage(message);

    // ── 2. Questions: answer directly ─────────────────────
    if (classification.type === "question") {
      if (wantStream) {
        return handleDirectQuestionStreaming(message, context, history);
      }
      const answer = await handleDirectQuestion(message, context, history);
      return NextResponse.json({
        taskId: null, intent: "question", agent: null, status: "completed",
        result: { answer },
      });
    }

    // ── 3. Tasks: Strategy Agent ──────────────────────────
    const trackerId = await createTracker({
      title: `${classification.action}: ${message.substring(0, 100)}`,
      agentType: "strategy",
      requestedBy: userId || "api",
      priority: "medium",
      details: {
        intent: classification.action,
        context: classification.context,
        phase: "analysis",
      },
    });

    if (wantStream) {
      return handleStrategyStreaming(trackerId, message, classification, history);
    }

    // Sync fallback
    const result = await runStrategy({
      action: classification.action || "general",
      userContext: message,
      history,
    });

    await updateTrackerStatus(trackerId, result.phase === "execution" ? "in_progress" : "awaiting_approval", {
      phase: result.phase,
      plan: result.plan,
    });

    return NextResponse.json({
      taskId: trackerId, intent: classification.action, agent: "strategy",
      status: result.phase === "execution" ? "in_progress" : "awaiting_approval",
      result: { answer: result.response, plan: result.plan },
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* ═══════════════════════════════════════════════════════
   STRATEGY STREAMING
   ═══════════════════════════════════════════════════════ */

function handleStrategyStreaming(
  trackerId: string,
  message: string,
  classification: { type: string; action?: string; context?: string },
  history?: HistoryMessage[],
): Response {
  const { readable, writer } = createSSEStream();

  (async () => {
    try {
      writer.write({ type: "step", content: "Analyzing your request..." });
      writer.write({ type: "phase", data: { current: "STRATEGY", completed: [] } });

      const result = await runStrategy({
        action: classification.action || "general",
        userContext: message,
        history,
      });

      writer.write({ type: "chunk", content: result.response });

      // Emit plan as artifact if present
      if (result.plan) {
        writer.write({
          type: "artifact",
          data: {
            type: "strategy_plan",
            phase: "STRATEGY",
            plan: result.plan,
          },
        });
      }

      await updateTrackerStatus(trackerId, "awaiting_approval", {
        phase: result.phase,
        plan: result.plan,
      });

      writer.write({
        type: "done", taskId: trackerId, intent: classification.action || "task",
        agent: "strategy", status: "awaiting_approval",
      });
    } catch (err: any) {
      writer.write({ type: "chunk", content: `Error: ${err.message}` });
      writer.write({
        type: "done", taskId: trackerId, intent: classification.action || "task",
        agent: "strategy", status: "failed", result: { error: err.message },
      });
    }
    writer.close();
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

/* ═══════════════════════════════════════════════════════
   QUESTION HANDLER
   ═══════════════════════════════════════════════════════ */

function handleDirectQuestionStreaming(message: string, context: any, history?: HistoryMessage[]): Response {
  const { readable, writer } = createSSEStream();

  (async () => {
    try {
      writer.write({ type: "step", content: "Thinking..." });
      const answer = await handleDirectQuestion(message, context, history);
      writer.write({ type: "chunk", content: answer });
      writer.write({ type: "done", taskId: null, intent: "question", agent: null, status: "completed" });
    } catch (err: any) {
      writer.write({ type: "done", taskId: null, intent: "question", agent: null, status: "failed", result: { error: err.message } });
    }
    writer.close();
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

async function handleDirectQuestion(message: string, context?: any, history?: HistoryMessage[]): Promise<string> {
  // Extract search terms from the question for targeted DB queries
  const searchTerms = message
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'what', 'how', 'many', 'are', 'our', 'have', 'does', 'which', 'can', 'you', 'whats', 'there', 'between', 'each', 'them', 'for', 'with', 'from', 'that', 'this', 'they'].includes(w));

  // Detect if user explicitly asks about paused/all campaigns
  const wantsPaused = /paused|inactive|stopped|all\s*campaigns|every\s*campaign/i.test(message);
  const activeFilter = wantsPaused ? {} : { status: { in: ["enabled", "active", "live"] } };

  // Detect platform filter from message
  const platformMap: Record<string, string> = {
    'linkedin': 'linkedin', 'google': 'google_ads', 'google ads': 'google_ads',
    'stackadapt': 'stackadapt', 'stack adapt': 'stackadapt',
    'reddit': 'reddit', 'reddit ads': 'reddit',
  };
  let platformFilter: string | null = null;
  for (const [key, val] of Object.entries(platformMap)) {
    if (message.toLowerCase().includes(key)) { platformFilter = val; break; }
  }

  // Query 1: campaigns matching search terms OR platform (active only unless user asks for all)
  const nameFilters = searchTerms
    .filter(t => !['linkedin', 'google', 'stackadapt', 'reddit', 'ads', 'stack', 'adapt', 'campaigns', 'campaign', 'live', 'active', 'performing', 'performance', 'show', 'list'].includes(t))
    .map(term => ({ name: { contains: term, mode: 'insensitive' as const } }));

  // Build query: name terms use AND (all must match), platform is separate
  const whereConditions: any[] = [activeFilter];
  
  // All name terms must be present in campaign name (AND logic)
  for (const nf of nameFilters) {
    whereConditions.push(nf);
  }
  if (platformFilter) {
    whereConditions.push({ platform: platformFilter });
  }

  const hasFilters = nameFilters.length > 0 || !!platformFilter;

  // Primary query: AND all terms (strict match)
  let matchedCampaigns = hasFilters
    ? await prisma.campaign.findMany({
        where: { AND: whereConditions },
        orderBy: { name: "asc" },
        take: 50,
      })
    : [];

  // Fallback: if AND returns nothing but we have multiple terms, try OR (broader)
  if (matchedCampaigns.length === 0 && nameFilters.length > 1) {
    const orConditions: any[] = [...nameFilters];
    if (platformFilter) orConditions.push({ platform: platformFilter });
    matchedCampaigns = await prisma.campaign.findMany({
      where: { AND: [activeFilter, { OR: orConditions }] },
      orderBy: { name: "asc" },
      take: 50,
    });
  }

  console.log(`[orchestrate] search: terms=${searchTerms.join(',')} platform=${platformFilter} nameFilters=${nameFilters.length} matched=${matchedCampaigns.length} activeOnly=${!wantsPaused}`);

  // Query 2: top active campaigns for general context
  const topCampaigns = await prisma.campaign.findMany({
    where: { status: { in: ["enabled", "active", "live"] } },
    take: 30, orderBy: { name: "asc" },
  });

  // Deduplicate
  const seenIds = new Set<string>();
  const allCampaigns = [...matchedCampaigns, ...topCampaigns].filter(c => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  // Build context — structure only, NO metrics from DB (they're stale)
  let campaignContext = '';
  if (matchedCampaigns.length > 0) {
    campaignContext += `Campaigns matching query (${matchedCampaigns.length} found, ${wantsPaused ? 'all statuses' : 'active only'}):\n`;
    campaignContext += matchedCampaigns.map((c) => {
      return `- ${c.name} | ${c.platform} | ${c.status} | budget: $${c.budget || 'N/A'}/day | started: ${c.startDate || 'unknown'}`;
    }).join("\n");
    campaignContext += "\n\n";
  }
  campaignContext += `Top active campaigns (${topCampaigns.length}):\n`;
  campaignContext += topCampaigns.map((c) => {
    return `- ${c.name} (${c.platform}) | ${c.status} | budget: $${c.budget || 'N/A'}/day | started: ${c.startDate || 'unknown'}`;
  }).join("\n");

  // Also get aggregate stats
  const totalActive = await prisma.campaign.count({ where: { status: { in: ["enabled", "active", "live"] } } });
  const totalAll = await prisma.campaign.count();
  campaignContext += `\n\nTotal: ${totalActive} active / ${totalAll} total campaigns across Google Ads, LinkedIn, StackAdapt, and Reddit.`;

  // Query live metrics — default to current month
  const now = new Date();
  const fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const toDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Only pass search to metrics if we matched actual campaigns in DB
  // Use the first matched campaign's name keywords rather than user's raw query
  let metricsSearch: string | undefined;
  if (matchedCampaigns.length > 0) {
    // Find common keyword from matched campaign names that was in the user's query
    const userLower = message.toLowerCase();
    const campaignWords = new Set<string>();
    for (const c of matchedCampaigns) {
      for (const word of c.name.split(/[\s_-]+/)) {
        if (word.length > 3 && userLower.includes(word.toLowerCase())) {
          campaignWords.add(word);
        }
      }
    }
    if (campaignWords.size > 0) {
      metricsSearch = [...campaignWords].join(" ");
    }
  }

  console.log(`[orchestrate] querying live metrics: ${fromDate} → ${toDate}${metricsSearch ? ` search="${metricsSearch}"` : ''}`);
  const liveMetrics = await queryAllPlatforms(fromDate, toDate, metricsSearch, 10);
  campaignContext += `\n\n## Live Performance Data (${fromDate} to ${toDate})\n`;
  campaignContext += formatMetricsContext(liveMetrics);

  // Include previous agent results if available (from task follow-up)
  if (context?.previousResults?.length) {
    campaignContext += `\n\n## Previous Agent Results (from this conversation)\n`;
    campaignContext += context.previousResults.map((r: any) => `**${r.agent}**: ${r.summary}`).join('\n');
  }
  if (context?.previousPlan) {
    campaignContext += `\n\n## Previous Plan\n${JSON.stringify(context.previousPlan)}`;
  }

  const knowledgeContext = await loadKnowledgeContext();

  const messages: Message[] = [
    {
      role: "system",
      content: `You are a demand generation expert assistant for Telnyx. You help with campaign strategy, ad copy, optimizations, and operational tasks.

## Knowledge Base
${knowledgeContext}

## Rules
- Be specific with numbers, campaign names, and platforms
- If data doesn't contain what the user asks, say "I don't see that in the data" — don't make things up
- Default to ACTIVE campaigns only. Only include paused/removed if the user explicitly asks
- Keep answers concise — lead with the answer, then detail
- ALWAYS cover all 4 platforms (Google Ads, LinkedIn, StackAdapt, Reddit) unless user specifies one
- Use the Knowledge Base above for regional structure, conversion models, campaign naming, and measurement framework. Never guess these — refer to the knowledge base.

## Data Available
You have campaign structure (names, platforms, status, budgets) AND live performance metrics (spend, impressions, clicks, conversions) from API queries. The metrics are for the current month unless otherwise specified.

## Format
When listing campaigns with metrics, use a table:
| Campaign | Platform | Spend | Impressions | Clicks | Conv/Attribution |
|----------|----------|-------|-------------|--------|-----------------|

For strategy, copy, or recommendations: use clear structured sections.

## Campaign Data
${campaignContext}`,
    },
  ];

  if (history?.length) {
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role === "user" ? "user" : "assistant", content: h.content });
    }
  }

  messages.push({ role: "user", content: message });

  return createCompletion({ messages, maxTokens: 1024, temperature: 0.3 });
}

/* ═══════════════════════════════════════════════════════
   FOLLOW-UP HANDLER
   ═══════════════════════════════════════════════════════ */

async function handleFollowUp(
  taskId: string, message: string | undefined, action: string | undefined,
  userId?: string, extraContext?: any, history?: HistoryMessage[], wantStream?: boolean,
): Promise<NextResponse | Response> {
  const tracker = await prisma.tracker.findUnique({ where: { id: taskId } });
  if (!tracker) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const trackerDetails = tracker.details ? JSON.parse(tracker.details) : {};

  // ── Explicit actions (approve/reject/execute) ──────────
  if (action === "approve_rec" || action === "reject_rec") {
    return handleRecAction(taskId, action, message, userId, extraContext);
  }

  if (action === "reject_all") {
    return handleRejectAll(taskId, userId, tracker);
  }

  if (action === "execute") {
    return handleExecuteApproved(taskId, tracker, userId, wantStream);
  }

  // ── Short response detection ───────────────────────────
  if (message) {
    const shortType = isShortResponse(message);

    if (shortType === "negate") {
      await updateTrackerStatus(taskId, "completed", { cancelled: true });
      if (wantStream) {
        const { readable, writer } = createSSEStream();
        writer.write({ type: "chunk", content: "Got it, cancelled." });
        writer.write({ type: "done", taskId, intent: "task", agent: "strategy", status: "completed" });
        writer.close();
        return new Response(readable, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
        });
      }
      return NextResponse.json({ taskId, status: "completed", result: { answer: "Got it, cancelled." } });
    }

    // Confirmation → execute the plan
    const isConfirmation = shortType === "affirm" || action === "approve_all";
    const hasPlan = trackerDetails.plan;

    if (isConfirmation && hasPlan) {
      // Execute the strategy plan
      if (wantStream) {
        return handlePlanExecutionStreaming(taskId, trackerDetails.plan, userId);
      }
      return handlePlanExecutionSync(taskId, trackerDetails.plan, userId);
    }

    // ── Detect follow-up agent actions ─────────────────
    // If the user asks to DO something specific, run the agent instead of just chatting
    const followUpAction = detectFollowUpAction(message);
    if (followUpAction && wantStream) {
      return handleFollowUpAgentExecution(taskId, followUpAction, message, trackerDetails, history);
    }

    // ── Data questions within a task context ─────────────
    // Only route to question handler if it's clearly a data question (not a short clarification)
    const isDataQuestion = /^(show|list|what|which|how\s*many|how\s*is|how\s*are|tell\s*me|give\s*me|compare|whats|what'?s|do\s*we|are\s*there|how\s*much)/i.test(message.trim())
      || (/\?\s*$/.test(message.trim()) && message.trim().split(/\s+/).length > 5); // question mark + substantial length
    
    if (isDataQuestion) {
      const enrichedContext = {
        ...extraContext,
        previousResults: trackerDetails.results,
        previousPlan: trackerDetails.plan,
      };
      if (wantStream) {
        return handleDirectQuestionStreaming(message, enrichedContext, history);
      }
      const answer = await handleDirectQuestion(message, enrichedContext, history);
      return NextResponse.json({
        taskId, intent: "question", agent: null, status: "completed",
        result: { answer },
      });
    }

    // If confirmation but no plan yet, or if it's a follow-up message,
    // send back to strategy agent for refinement
    if (wantStream) {
      return handleStrategyFollowUpStreaming(taskId, message, isConfirmation, trackerDetails, history);
    }

    const result = await runStrategy({
      action: trackerDetails.intent || "general",
      userContext: message,
      history,
      taskId,
      isConfirmation,
      previousPlan: hasPlan ? JSON.stringify(hasPlan) : undefined,
    });

    await updateTrackerStatus(taskId, "awaiting_approval", {
      ...trackerDetails,
      phase: result.phase,
      plan: result.plan || trackerDetails.plan,
    });

    return NextResponse.json({
      taskId, intent: trackerDetails.intent, agent: "strategy",
      status: "awaiting_approval",
      result: { answer: result.response, plan: result.plan },
    });
  }

  return NextResponse.json({ error: "message required for follow-up" }, { status: 400 });
}

/* ─── Strategy follow-up streaming ───────────────────── */

/* ═══════════════════════════════════════════════════════
   FOLLOW-UP ACTION DETECTION + EXECUTION
   Detect when user asks to DO something, not just chat
   ═══════════════════════════════════════════════════════ */

interface FollowUpAction {
  agents: Array<{ slug: string; task: string; params: Record<string, any> }>;
  chatResponse?: string; // brief response to pair with execution
}

function detectFollowUpAction(message: string): FollowUpAction | null {
  const lower = message.toLowerCase();
  const actions: FollowUpAction['agents'] = [];

  // Overlap check
  if (/overlap|cannibaliz|competing|duplicate\s*keyword/i.test(lower)) {
    actions.push({
      slug: 'overlap-checker',
      task: 'Check keyword overlap between the new campaign and existing campaigns',
      params: {},
    });
  }

  // Budget re-evaluation
  if (/budget.*(too|much|high|low|reduce|increase|cut|adjust|revis)|re-?run.*budget|recalculate.*budget|cheaper|more conservative/i.test(lower)) {
    // Extract budget hint if present
    const budgetMatch = lower.match(/\$?([\d,]+(?:\.\d+)?)\s*(?:k|K)?\s*(?:\/?\s*(?:mo|month))?/);
    const params: Record<string, any> = {};
    if (budgetMatch) {
      let val = parseFloat(budgetMatch[1].replace(/,/g, ''));
      if (/k/i.test(lower.slice(budgetMatch.index!, budgetMatch.index! + budgetMatch[0].length + 2))) val *= 1000;
      params.suggested_budget = val;
    }
    actions.push({
      slug: 'budget-calculator',
      task: 'Re-evaluate budget allocation with a more conservative approach',
      params,
    });
  }

  // Ad copy review / verify
  if (/review.*(?:ad|copy|headline|description)|verify.*(?:ad|copy|headline|pin)|check.*(?:headline|pin|ad\s*copy)|audit.*(?:ad|copy)/i.test(lower)) {
    actions.push({
      slug: 'ad-review',
      task: 'Review and verify ad copy quality, pinning, and compliance',
      params: {},
    });
  }

  // Keyword research
  if (/research.*keyword|find.*keyword|more\s*keyword|expand.*keyword|keyword.*research/i.test(lower)) {
    actions.push({
      slug: 'keyword-researcher',
      task: 'Research additional keywords',
      params: {},
    });
  }

  // Health check
  if (/health\s*check|diagnos|audit.*account|check.*account/i.test(lower)) {
    actions.push({
      slug: 'health-check',
      task: 'Run account health diagnostics',
      params: {},
    });
  }

  // Spend / budget report
  if (/spend\s*report|budget\s*report|break\s*down\s*spend|how\s*much\s*(did\s*we|have\s*we)\s*spend|spend\s*by\s*(product|funnel|region|platform)|spend\s*breakdown|monthly\s*spend|spending\s*report/i.test(lower)) {
    // Try to extract date range from message
    const monthMatch = lower.match(/(?:for|in)\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?/i);
    const params: Record<string, any> = {};
    if (monthMatch) {
      const months: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
      const m = months[monthMatch[1].toLowerCase()];
      const y = monthMatch[2] ? parseInt(monthMatch[2]) : new Date().getFullYear();
      const lastDay = new Date(y, m, 0).getDate();
      params.from = `${y}-${String(m).padStart(2, '0')}-01`;
      params.to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
    }
    // Extract platform filter
    if (/google/i.test(lower)) params.platform = 'google_ads';
    else if (/linkedin/i.test(lower)) params.platform = 'linkedin';
    // Extract section filter
    if (/by\s*product/i.test(lower)) params.sections = 'summary,product';
    else if (/by\s*funnel/i.test(lower)) params.sections = 'summary,funnel';
    else if (/by\s*region/i.test(lower)) params.sections = 'summary,region';
    else if (/by\s*platform/i.test(lower)) params.sections = 'summary,platform';

    actions.push({
      slug: 'spend-report',
      task: 'Generate spend/budget report',
      params,
    });
  }

  if (actions.length === 0) return null;
  return { agents: actions };
}

function handleFollowUpAgentExecution(
  taskId: string,
  followUp: FollowUpAction,
  message: string,
  trackerDetails: any,
  history?: HistoryMessage[],
): Response {
  const { readable, writer } = createSSEStream();

  (async () => {
    try {
      const agentNames = followUp.agents.map(a => a.slug.replace(/-/g, ' ')).join(' + ');
      writer.write({ type: "step", content: `Running ${agentNames}...` });
      writer.write({ type: "phase", data: { current: "EXECUTION", completed: ["STRATEGY"] } });

      const results: Array<{ agent: string; output: any }> = [];

      for (let i = 0; i < followUp.agents.length; i++) {
        const agentDef = followUp.agents[i];
        const handler = getAgent(agentDef.slug);

        if (!handler) {
          writer.write({ type: "step", content: `Agent "${agentDef.slug}" not found, skipping.` });
          continue;
        }

        writer.write({ type: "step", content: `Running ${agentDef.task}... (${i + 1}/${followUp.agents.length})` });

        // Include previous execution context
        const prevResults = trackerDetails.results || [];
        const enrichedParams = {
          ...agentDef.params,
          previousContext: prevResults,
          userMessage: message,
        };

        try {
          const output = await handler.run({
            task: agentDef.task,
            context: { ...enrichedParams, _streamWriter: writer },
          });

          results.push({ agent: agentDef.slug, output });

          if (output.artifacts?.length) {
            writer.write({ type: "artifact", data: output.artifacts });
          }
          if (output.recommendations?.length) {
            writer.write({ type: "recommendations", data: output.recommendations });
          }
        } catch (err: any) {
          writer.write({ type: "step", content: `${agentDef.slug} failed: ${err.message}` });
          results.push({
            agent: agentDef.slug,
            output: { findings: [{ severity: 'high', title: 'Error', detail: err.message }], recommendations: [], summary: `Failed: ${err.message}` },
          });
        }
      }

      // Generate a brief summary using AI
      const summaryPrompt = results.map(r => `**${r.agent}**: ${r.output.summary}`).join('\n');
      const summary = await createCompletion({
        messages: [
          { role: 'system', content: 'You are a demand gen assistant. The user asked a follow-up question and agents ran to answer it. Summarize the results in 2-3 concise sentences. Be specific with numbers. No filler.' },
          { role: 'user', content: `User asked: "${message}"\n\nAgent results:\n${summaryPrompt}` },
        ],
        maxTokens: 300,
        temperature: 0.2,
      });

      writer.write({ type: "chunk", content: summary });

      // Send execution summary artifact
      writer.write({
        type: "artifact",
        data: {
          type: "execution_summary",
          agents: results.map(r => ({ agent: r.agent, summary: r.output.summary })),
        },
      });

      // Log runs to DB
      for (const r of results) {
        const agent = await prisma.agent.findUnique({ where: { slug: r.agent } });
        if (agent) {
          await prisma.agentRun.create({
            data: {
              agentId: agent.id, status: "done",
              input: JSON.stringify({ taskId, followUp: true, message }),
              output: JSON.stringify(r.output),
              findingsCount: r.output.findings?.length || 0,
              recsCount: r.output.recommendations?.length || 0,
              startedAt: new Date(), completedAt: new Date(),
            },
          });
        }
      }

      await updateTrackerStatus(taskId, "completed", {
        ...trackerDetails,
        followUpResults: results.map(r => ({ agent: r.agent, summary: r.output.summary })),
      });

      writer.write({
        type: "done", taskId, intent: "follow_up",
        agent: followUp.agents.map(a => a.slug).join('+'), status: "completed",
      });
    } catch (err: any) {
      writer.write({ type: "chunk", content: `Error: ${err.message}` });
      writer.write({ type: "done", taskId, intent: "follow_up", agent: null, status: "failed" });
    }
    writer.close();
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

/* ─── Strategy follow-up streaming ───────────────────── */

function handleStrategyFollowUpStreaming(
  taskId: string, message: string, isConfirmation: boolean,
  trackerDetails: any, history?: HistoryMessage[],
): Response {
  const { readable, writer } = createSSEStream();

  (async () => {
    try {
      writer.write({ type: "step", content: isConfirmation ? "Building execution plan..." : "Refining strategy..." });

      const result = await runStrategy({
        action: trackerDetails.intent || "general",
        userContext: message,
        history,
        taskId,
        isConfirmation,
        previousPlan: trackerDetails.plan ? JSON.stringify(trackerDetails.plan) : undefined,
        agentResults: trackerDetails.results || undefined,
      });

      // If strategy says execute and has a plan, run it
      if (result.phase === "execution" && result.plan?.steps?.length) {
        writer.write({ type: "chunk", content: result.response });
        writer.write({ type: "phase", data: { current: "EXECUTION", completed: ["STRATEGY"] } });

        const agentResults = await executePlan(result.plan, writer);

        // Short chat summary — details are in artifact panel
        const agentNames = agentResults.map(r => r.agent.replace(/-/g, ' ')).join(', ');
        const successCount = agentResults.filter(r => !r.output.summary?.startsWith('Failed')).length;
        writer.write({ type: "chunk", content: `\n\nDone — ran ${successCount}/${agentResults.length} agents (${agentNames}). Check the artifact panel for full details.` });

        // Send execution summary as artifact
        writer.write({
          type: "artifact",
          data: {
            type: "execution_summary",
            agents: agentResults.map(r => ({ agent: r.agent, summary: r.output.summary })),
          },
        });

        await updateTrackerStatus(taskId, "completed", {
          ...trackerDetails,
          phase: "completed",
          plan: result.plan,
          results: agentResults.map(r => ({ agent: r.agent, summary: r.output.summary })),
        });

        writer.write({
          type: "done", taskId, intent: trackerDetails.intent || "task",
          agent: "strategy", status: "completed",
        });
      } else {
        writer.write({ type: "chunk", content: result.response });

        await updateTrackerStatus(taskId, "awaiting_approval", {
          ...trackerDetails,
          phase: result.phase,
          plan: result.plan || trackerDetails.plan,
        });

        writer.write({
          type: "done", taskId, intent: trackerDetails.intent || "task",
          agent: "strategy", status: "awaiting_approval",
        });
      }
    } catch (err: any) {
      writer.write({ type: "chunk", content: `Error: ${err.message}` });
      writer.write({
        type: "done", taskId, intent: trackerDetails.intent || "task",
        agent: "strategy", status: "failed", result: { error: err.message },
      });
    }
    writer.close();
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

/* ═══════════════════════════════════════════════════════
   PLAN EXECUTION
   ═══════════════════════════════════════════════════════ */

function handlePlanExecutionStreaming(taskId: string, plan: any, userId?: string): Response {
  const { readable, writer } = createSSEStream();

  (async () => {
    try {
      writer.write({ type: "phase", data: { current: "EXECUTION", completed: ["STRATEGY"] } });
      writer.write({ type: "step", content: `Executing plan: ${plan.summary}` });

      await updateTrackerStatus(taskId, "in_progress");

      const agentResults = await executePlan(plan, writer);

      // Log runs to DB
      for (const r of agentResults) {
        const agent = await prisma.agent.findUnique({ where: { slug: r.agent } });
        if (agent) {
          const run = await prisma.agentRun.create({
            data: {
              agentId: agent.id, status: "done",
              input: JSON.stringify({ taskId, plan: plan.summary }),
              output: JSON.stringify(r.output),
              findingsCount: r.output.findings.length,
              recsCount: r.output.recommendations.length,
              startedAt: new Date(), completedAt: new Date(),
            },
          });
          for (const rec of r.output.recommendations) {
            await prisma.recommendation.create({
              data: {
                agentRunId: run.id, type: rec.type, severity: rec.severity,
                target: rec.target, targetId: rec.targetId,
                action: rec.action, rationale: rec.rationale, impact: rec.impact,
                status: "pending",
              },
            });
          }
        }
      }

      // Short chat message — full details in artifact panel
      const agentCount = agentResults.length;
      const successCount = agentResults.filter(r => !r.output.summary?.startsWith('Failed')).length;
      writer.write({ type: "chunk", content: `Done — ran ${successCount}/${agentCount} agents. Check the details panel for keywords, budget breakdown, and ad copy.` });

      // Send structured summary to artifact panel
      writer.write({
        type: "artifact",
        data: {
          type: "execution_summary",
          agents: agentResults.map(r => ({ agent: r.agent, summary: r.output.summary })),
        },
      });

      await updateTrackerStatus(taskId, "completed");

      writer.write({
        type: "done", taskId, intent: "task", agent: "strategy", status: "completed",
      });
    } catch (err: any) {
      await updateTrackerStatus(taskId, "failed", { error: err.message });
      writer.write({
        type: "done", taskId, intent: "task", agent: "strategy",
        status: "failed", result: { error: err.message },
      });
    }
    writer.close();
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

async function handlePlanExecutionSync(taskId: string, plan: any, userId?: string): Promise<NextResponse> {
  try {
    await updateTrackerStatus(taskId, "in_progress");
    const writer = { write: (_: any) => {} }; // no-op writer for sync
    const agentResults = await executePlan(plan, writer);

    await updateTrackerStatus(taskId, "completed");

    return NextResponse.json({
      taskId, intent: "task", agent: "strategy", status: "completed",
      result: {
        summary: agentResults.map(r => `${r.agent}: ${r.output.summary}`).join(" | "),
        agentResults: agentResults.map(r => ({ agent: r.agent, ...r.output })),
      },
    });
  } catch (err: any) {
    await updateTrackerStatus(taskId, "failed", { error: err.message });
    return NextResponse.json({ taskId, status: "failed", result: { error: err.message } }, { status: 500 });
  }
}

/* ═══════════════════════════════════════════════════════
   RECOMMENDATION ACTIONS (kept from original)
   ═══════════════════════════════════════════════════════ */

async function handleRecAction(
  taskId: string, action: string, message?: string, userId?: string, extraContext?: any,
): Promise<NextResponse> {
  const recId = extraContext?.recId || extraContext?.recommendationId;
  if (!recId) return NextResponse.json({ error: "recId required" }, { status: 400 });

  const newStatus = action === "approve_rec" ? "approved" : "rejected";
  await prisma.recommendation.update({
    where: { id: recId },
    data: { status: newStatus, appliedAt: newStatus === "approved" ? new Date() : undefined },
  });
  await prisma.activity.create({
    data: {
      actor: userId || "user", action: newStatus, entityType: "recommendation",
      entityId: recId, details: JSON.stringify({ feedback: message }),
    },
  });

  return NextResponse.json({ taskId, action, status: "completed", result: { summary: `Recommendation ${newStatus}.` } });
}

async function handleRejectAll(taskId: string, userId?: string, tracker?: any): Promise<NextResponse> {
  const trackerDetails = tracker?.details ? JSON.parse(tracker.details) : {};
  const agentSlug = tracker?.assignee || trackerDetails.agentType;

  const recentRun = await prisma.agentRun.findFirst({
    where: { agent: { slug: agentSlug } },
    orderBy: { createdAt: "desc" },
    include: { recommendations: true },
  });

  const pendingRecs = recentRun?.recommendations.filter((r) => r.status === "pending") || [];
  for (const rec of pendingRecs) {
    await prisma.recommendation.update({ where: { id: rec.id }, data: { status: "rejected" } });
  }

  await updateTrackerStatus(taskId, "completed", { actionTaken: "reject_all" });
  await prisma.activity.create({
    data: {
      actor: userId || "user", action: "rejected", entityType: "task",
      entityId: taskId, entityName: tracker?.title || undefined,
      details: JSON.stringify({ count: pendingRecs.length }),
    },
  });

  return NextResponse.json({
    taskId, action: "reject_all", status: "completed",
    result: { summary: `${pendingRecs.length} recommendation(s) rejected.` },
  });
}

async function handleExecuteApproved(
  taskId: string, tracker: any, userId?: string, wantStream?: boolean,
): Promise<NextResponse> {
  const trackerDetails = tracker.details ? JSON.parse(tracker.details) : {};
  const agentSlug = tracker.assignee || trackerDetails.agentType;

  const recentRun = await prisma.agentRun.findFirst({
    where: { agent: { slug: agentSlug } },
    orderBy: { createdAt: "desc" },
    include: { recommendations: true },
  });

  const approvedRecs = recentRun?.recommendations.filter((r) => r.status === "approved") || [];
  if (approvedRecs.length === 0) {
    return NextResponse.json({
      taskId, action: "execute", status: "error",
      result: { error: "No approved recommendations to execute." },
    });
  }

  // Mark as applied
  for (const rec of approvedRecs) {
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { status: "applied", appliedAt: new Date() },
    });
  }

  await updateTrackerStatus(taskId, "completed", { executed: approvedRecs.length });
  await prisma.activity.create({
    data: {
      actor: userId || "user", action: "executed", entityType: "task",
      entityId: taskId, entityName: tracker.title || undefined,
      details: JSON.stringify({ count: approvedRecs.length }),
    },
  });

  return NextResponse.json({
    taskId, action: "execute", status: "completed",
    result: { summary: `Executed ${approvedRecs.length} recommendation(s).` },
  });
}
