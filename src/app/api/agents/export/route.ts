import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-client";

/**
 * POST /api/agents/export
 * 
 * Export an agent run's output as:
 * - "csv" → downloadable CSV
 * - "report" → AI-generated markdown report
 * - "sheet" → formatted for Google Sheets (returns JSON array of rows)
 * 
 * Input: { runId, format: "csv" | "report" | "sheet" }
 */
export async function POST(request: NextRequest) {
  try {
    const { runId, format } = await request.json();

    if (!runId || !format) {
      return NextResponse.json({ error: "runId and format required" }, { status: 400 });
    }

    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
      include: {
        agent: { select: { name: true, slug: true } },
        recommendations: true,
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const output = run.output ? JSON.parse(run.output) : {};
    const input = run.input ? JSON.parse(run.input) : {};

    if (format === "csv") {
      const rows: string[][] = [];

      // Findings
      if (output.findings?.length > 0) {
        rows.push(["Type", "Severity", "Title", "Detail", "Campaigns"]);
        for (const f of output.findings) {
          rows.push(["finding", f.severity, f.title, f.detail || "", (f.campaigns || []).join("; ")]);
        }
        rows.push([]);
      }

      // Recommendations
      if (run.recommendations.length > 0) {
        rows.push(["Type", "Severity", "Target", "Action", "Rationale", "Impact", "Status"]);
        for (const r of run.recommendations) {
          rows.push([r.type, r.severity, r.target || "", r.action, r.rationale || "", r.impact || "", r.status]);
        }
      }

      // Artifacts (ad copy, keywords, etc.)
      if (output.artifacts?.length > 0) {
        rows.push([]);
        rows.push(["--- Artifacts ---"]);
        for (const a of output.artifacts) {
          if (a.headlines) {
            rows.push(["Headlines"]);
            for (const h of a.headlines) {
              rows.push(["", h.text || h, `${(h.text || h).length}ch`, h.pillar || ""]);
            }
          }
          if (a.descriptions) {
            rows.push(["Descriptions"]);
            for (const d of a.descriptions) {
              rows.push(["", d.text || d, `${(d.text || d).length}ch`, d.pillar || ""]);
            }
          }
          if (a.keywords) {
            rows.push(["Keywords"]);
            for (const k of a.keywords) {
              rows.push(["", k.keyword || k.text, k.matchType || "", k.volume?.toString() || ""]);
            }
          }
        }
      }

      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${run.agent?.slug || "agent"}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    if (format === "report") {
      const report = await createCompletion({
        messages: [
          {
            role: "system",
            content: `You are a demand generation analyst at Telnyx. Generate a concise executive report from this agent run data. Use markdown formatting. Include: Executive Summary, Key Findings, Recommendations, and Next Steps. Be specific with numbers and campaign names. No filler.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              agent: run.agent?.name,
              task: input.message || input.task,
              summary: output.summary,
              findings: output.findings,
              recommendations: run.recommendations.map(r => ({
                severity: r.severity,
                target: r.target,
                action: r.action,
                rationale: r.rationale,
                impact: r.impact,
                status: r.status,
              })),
              artifacts: output.artifacts,
            }),
          },
        ],
        maxTokens: 2048,
        temperature: 0.3,
      });

      return NextResponse.json({ report, format: "markdown" });
    }

    if (format === "sheet") {
      // Return structured rows for Google Sheets
      const rows: any[][] = [];

      rows.push(["Agent Report", run.agent?.name || "", new Date().toISOString().slice(0, 10)]);
      rows.push([]);

      if (output.summary) {
        rows.push(["Summary", output.summary]);
        rows.push([]);
      }

      if (output.findings?.length > 0) {
        rows.push(["FINDINGS", "Severity", "Title", "Detail"]);
        for (const f of output.findings) {
          rows.push(["", f.severity, f.title, f.detail || ""]);
        }
        rows.push([]);
      }

      if (run.recommendations.length > 0) {
        rows.push(["RECOMMENDATIONS", "Severity", "Target", "Action", "Impact", "Status"]);
        for (const r of run.recommendations) {
          rows.push(["", r.severity, r.target || "", r.action, r.impact || "", r.status]);
        }
      }

      return NextResponse.json({ rows, format: "sheet" });
    }

    return NextResponse.json({ error: `Unknown format: ${format}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
