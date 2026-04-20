import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/agents/registry";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const dateFrom = params.get("from");
  const dateTo = params.get("to");

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "from and to query params required" }, { status: 400 });
  }

  const agent = getAgent("spend-report");
  if (!agent) {
    return NextResponse.json({ error: "spend-report agent not found" }, { status: 500 });
  }

  const result = await agent.run({
    context: {
      from: dateFrom,
      to: dateTo,
      platform: params.get("platform") || "all",
      sections: params.get("sections") || "all",
      top: parseInt(params.get("top") || "20"),
    },
  });

  // Log run
  try {
    const agentRecord = await prisma.agent.findUnique({ where: { slug: "spend-report" } });
    if (agentRecord) {
      await prisma.agentRun.create({
        data: { id: crypto.randomUUID(),
          agentId: agentRecord.id,
          status: "done",
          input: JSON.stringify({ from: dateFrom, to: dateTo }),
          output: JSON.stringify({ summary: result.summary?.slice(0, 500) }),
          findingsCount: result.findings.length,
          recsCount: result.recommendations.length,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({
    status: "completed",
    summary: result.summary,
    findings: result.findings,
    recommendations: result.recommendations,
    artifacts: result.artifacts,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { from: dateFrom, to: dateTo, platform, sections, telegram } = body;

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "from and to required" }, { status: 400 });
  }

  const agent = getAgent("spend-report");
  if (!agent) {
    return NextResponse.json({ error: "spend-report agent not found" }, { status: 500 });
  }

  const result = await agent.run({
    context: {
      from: dateFrom,
      to: dateTo,
      platform: platform || "all",
      sections: sections || "all",
    },
  });

  // Send to Telegram if requested
  if (telegram) {
    try {
      const { execFileSync } = require("child_process");
      const python = process.env.PYTHON_PATH || `${process.env.HOME}/.venv/bin/python`;
      const script = `${process.cwd()}/scripts/spend-report-agent.py`;
      execFileSync(python, [
        script, "--from", dateFrom, "--to", dateTo,
        "--format", "markdown", "--sections", "summary,top",
        "--telegram",
      ], { timeout: 120_000 });
    } catch (err: any) {
      console.error("[spend-report] Telegram send failed:", err.message);
    }
  }

  return NextResponse.json({
    status: "completed",
    summary: result.summary,
    findings: result.findings,
    recommendations: result.recommendations,
    artifacts: result.artifacts,
  });
}
