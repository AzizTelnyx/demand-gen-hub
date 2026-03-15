export const AGENT_WORKSPACES: Record<string, string> = {
  'neg-keyword': '/Users/azizalsinafi/.openclaw/agents/neg-keyword/workspace',
  'keyword-bid-optimizer': '/Users/azizalsinafi/.openclaw/agents/keyword-bid-optimizer/workspace',
  'creative-qa': '/Users/azizalsinafi/.openclaw/agents/creative-qa/workspace',
  'budget-pacing': '/Users/azizalsinafi/.openclaw/agents/budget-pacing/workspace',
  'stackadapt-ops': '/Users/azizalsinafi/.openclaw/agents/stackadapt-ops/workspace',
};

export function getAgentWorkspace(slug: string): string | null {
  return AGENT_WORKSPACES[slug] || null;
}
