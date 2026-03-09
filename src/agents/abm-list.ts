import { createCompletion } from "@/lib/ai-client";
import type { AgentHandler, AgentOutput, AgentInput, Finding } from "./types";

const DECISION_MAKERS_PER_COMPANY = 175;

export function estimateAudienceSize(companyCount: number): number {
  return companyCount * DECISION_MAKERS_PER_COMPANY;
}

interface ABMCompany {
  name: string;
  domain: string;
  employeeRange: string;
  vertical: string;
  productFit: string;
}

export const abmList: AgentHandler = {
  slug: "abm-list",

  async run(input: AgentInput): Promise<AgentOutput> {
    const findings: Finding[] = [];
    const task = input.task || "";
    const ctx = input.context || {};
    const query = ctx.query || task;
    const target = Math.min(Math.max(ctx.target || 20, 5), 500);
    const quickMode = ctx.quick === true || target <= 20;

    if (!query) {
      return {
        findings: [],
        recommendations: [],
        summary: "I need more details to build an ABM list. What type of companies are you targeting?\n\n" +
          "Example: \"Find 200 fintech companies using voice AI in North America\"",
      };
    }

    // Quick mode: AI-generated list directly (no background job)
    if (quickMode || target <= 20) {
      return await generateQuickList(query, Math.min(target, 20), findings);
    }

    // Large list: use background job system
    return await createBackgroundJob(query, target, findings);
  },
};

async function generateQuickList(
  query: string,
  target: number,
  findings: Finding[],
): Promise<AgentOutput> {
  try {
    const response = await createCompletion({
      messages: [
        {
          role: "system",
          content: `You are a B2B market research expert. Generate a list of real companies matching the criteria.

Return ONLY valid JSON:
{
  "companies": [
    {
      "name": "Company Name",
      "domain": "company.com",
      "employeeRange": "51-200",
      "vertical": "fintech",
      "productFit": "Brief reason why they'd be a good target"
    }
  ]
}

Use realistic companies. Employee ranges: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5000+.
Verticals should be specific (fintech, healthcare, e-commerce, etc).`,
        },
        {
          role: "user",
          content: `Find ${target} companies matching: ${query}`,
        },
      ],
      maxTokens: 4096,
      temperature: 0.5,
    });

    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const companies: ABMCompany[] = parsed.companies || [];

    // Build vertical breakdown
    const byVertical: Record<string, number> = {};
    for (const c of companies) {
      byVertical[c.vertical] = (byVertical[c.vertical] || 0) + 1;
    }

    const estAudienceSize = estimateAudienceSize(companies.length);

    const artifact = {
      type: "abm_list",
      companies,
      summary: {
        total: companies.length,
        byVertical,
        estAudienceSize,
        decisionMakersPerCompany: DECISION_MAKERS_PER_COMPANY,
      },
      suggestedActions: [
        "Build LinkedIn Matched Audience",
        "Create StackAdapt B2B domain targeting",
        "Create Reddit custom audience targeting",
        "Upload to Salesforce for sales outreach",
      ],
    };

    return {
      findings,
      recommendations: [],
      artifacts: [artifact],
      summary: `🎯 ABM list: ${companies.length} companies found for "${query}". ` +
        `Verticals: ${Object.entries(byVertical).map(([v, c]) => `${v} (${c})`).join(", ")}. ` +
        `Est. LinkedIn audience: ${estAudienceSize.toLocaleString()} decision-makers.`,
      suggestedActions: [
        "Build LinkedIn Matched Audience",
        "Create StackAdapt B2B domain targeting",
        "Create Reddit custom audience targeting",
      ],
    };
  } catch (err: any) {
    return {
      findings: [{ severity: "critical", title: "ABM list generation failed", detail: err.message }],
      recommendations: [],
      summary: `❌ Failed to generate ABM list: ${err.message}`,
    };
  }
}

async function createBackgroundJob(
  query: string,
  target: number,
  findings: Finding[],
): Promise<AgentOutput> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

    const res = await fetch(`${baseUrl}/api/abm/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, target }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return {
        findings: [{ severity: "critical", title: "ABM job creation failed", detail: `API returned ${res.status}: ${errBody}` }],
        recommendations: [],
        summary: `❌ Failed to create ABM research job: ${res.status}`,
      };
    }

    const data = await res.json();
    const job = data.job;

    // Estimate audience size from target
    const estAudienceSize = estimateAudienceSize(target);

    return {
      findings,
      recommendations: [],
      artifacts: [{
        type: "abm_list",
        jobId: job.id,
        listId: job.listId,
        listName: job.listName,
        query,
        target,
        status: job.status,
        companies: [],
        summary: {
          total: 0,
          byVertical: {},
          estAudienceSize,
          note: `Background job started — targeting ${target} companies`,
        },
        suggestedActions: [
          "Build LinkedIn Matched Audience once complete",
          "Create StackAdapt B2B domain targeting",
        "Create Reddit custom audience targeting",
        ],
      }],
      summary: `🎯 ABM research job created for ${target} companies.\n\n` +
        `**Query:** ${query}\n` +
        `**Est. audience:** ${estAudienceSize.toLocaleString()} decision-makers\n` +
        `**Status:** ${job.status}\n\n` +
        `Track progress on the [ABM page](/abm).`,
      suggestedActions: [
        "Once complete, target this list with a LinkedIn campaign",
        "View progress on the ABM page",
      ],
    };
  } catch (err: any) {
    return {
      findings: [{ severity: "critical", title: "ABM job creation failed", detail: err.message }],
      recommendations: [],
      summary: `❌ Failed to create ABM research job: ${err.message}`,
    };
  }
}
