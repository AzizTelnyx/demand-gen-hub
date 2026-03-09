import { healthCheck } from "./health-check";
import { creative } from "./creative";
import { adCopyGenerator } from "./ad-copy-generator";
import { keywordResearcher } from "./keyword-researcher";
import { budgetCalculator } from "./budget-calculator";
import { adReview } from "./ad-review";
import { campaignDeepDive } from "./campaign-deep-dive";
import { campaignOptimizer } from "./campaign-optimizer";
import { overlapChecker } from "./overlap-checker";
import { reporting } from "./reporting";
import { campaignOrchestrator } from "./campaign-orchestrator";
import { abmList } from "./abm-list";
import { spendReport } from "./spend-report";
import type { AgentHandler } from "./types";

const agents: Record<string, AgentHandler> = {
  "health-check": healthCheck,
  "creative": creative,
  "ad-copy-generator": adCopyGenerator,
  "keyword-researcher": keywordResearcher,
  "budget-calculator": budgetCalculator,
  "ad-review": adReview,
  "campaign-deep-dive": campaignDeepDive,
  "campaign-optimizer": campaignOptimizer,
  "overlap-checker": overlapChecker,
  "reporting": reporting,
  "campaign-orchestrator": campaignOrchestrator,
  "abm-list": abmList,
  "spend-report": spendReport,
};

export function getAgent(slug: string): AgentHandler | undefined {
  return agents[slug];
}

export function listAgents(): string[] {
  return Object.keys(agents);
}
