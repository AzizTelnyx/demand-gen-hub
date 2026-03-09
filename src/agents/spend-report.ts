import { execFile } from "child_process";
import { promisify } from "util";
import type { AgentHandler, AgentInput, AgentOutput, Finding, AgentRecommendation } from "./types";

const execFileAsync = promisify(execFile);
const PYTHON = process.env.PYTHON_PATH || `${process.env.HOME}/.venv/bin/python`;
const SCRIPT = `${process.cwd()}/scripts/spend-report-agent.py`;

export const spendReport: AgentHandler = {
  slug: "spend-report",

  async run(input: AgentInput): Promise<AgentOutput> {
    const ctx = { ...(input.context || {}), ...(input.config || {}) };
    const dateFrom = ctx.from || ctx.date_from || ctx.dateFrom;
    const dateTo = ctx.to || ctx.date_to || ctx.dateTo;

    if (!dateFrom || !dateTo) {
      return {
        findings: [{ severity: "high", title: "Missing dates", detail: "from and to dates are required" }],
        recommendations: [],
        summary: "Cannot generate report: missing date range.",
      };
    }

    const args = [
      SCRIPT,
      "--from", dateFrom,
      "--to", dateTo,
      "--format", "json",
      "--platform", ctx.platform || "all",
      "--sections", ctx.sections || "all",
      "--top", String(ctx.top || 20),
    ];

    try {
      const { stdout, stderr } = await execFileAsync(PYTHON, args, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (stderr) {
        console.log(`[spend-report] stderr: ${stderr}`);
      }

      const report = JSON.parse(stdout);
      const findings: Finding[] = [];
      const recommendations: AgentRecommendation[] = [];

      // Generate findings from the report data
      if (report.summary) {
        const s = report.summary;
        findings.push({
          severity: "low",
          title: "Spend Summary",
          detail: `Total spend: $${s.total_spend?.toLocaleString()} across ${s.campaign_count} campaigns. Google Ads conversions: ${s.total_conversions_google}.`,
        });
      }

      // Flag high-spend zero-conversion campaigns (Google only)
      if (report.top_campaigns) {
        const zeroCon = report.top_campaigns.filter(
          (c: any) => c.platform === "google_ads" && c.spend > 500 && (c.conversions || 0) === 0
        );
        if (zeroCon.length > 0) {
          findings.push({
            severity: "high",
            title: "High-spend zero-conversion campaigns",
            detail: `${zeroCon.length} Google Ads campaign(s) spent >$500 with 0 conversions.`,
            campaigns: zeroCon.map((c: any) => c.name),
          });
          for (const c of zeroCon) {
            recommendations.push({
              type: "pause",
              severity: "high",
              target: c.name,
              targetId: c.campaignId,
              action: `Review campaign "${c.name}" — $${c.spend.toFixed(0)} spent with 0 conversions`,
              rationale: "High spend with no conversions in the reporting period.",
            });
          }
        }
      }

      // Check for efficiency outliers
      if (report.efficiency?.by_product) {
        const highCPC = report.efficiency.by_product.filter((p: any) => p.cpc > 20);
        for (const p of highCPC) {
          findings.push({
            severity: "medium",
            title: `High CPC: ${p.name}`,
            detail: `${p.name} has a CPC of $${p.cpc.toFixed(2)} — consider keyword/audience optimization.`,
          });
        }
      }

      // Generate markdown for chat display
      const { execFileSync } = require("child_process");
      let markdown = "";
      try {
        const mdArgs = [...args.slice(0, -4), "--format", "markdown", "--sections", ctx.sections || "all", "--top", String(ctx.top || 20)];
        const mdResult = execFileSync(PYTHON, mdArgs, { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
        markdown = mdResult.toString();
      } catch {
        markdown = `Spend report generated for ${dateFrom} to ${dateTo}. See JSON artifact for details.`;
      }

      return {
        findings,
        recommendations,
        summary: markdown,
        artifacts: [{ type: "spend_report", data: report }],
      };
    } catch (err: any) {
      return {
        findings: [{ severity: "critical", title: "Report generation failed", detail: err.message }],
        recommendations: [],
        summary: `Failed to generate spend report: ${err.message}`,
      };
    }
  },
};
