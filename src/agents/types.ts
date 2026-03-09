export interface AgentInput {
  task?: string;
  context?: Record<string, any>;
  config?: Record<string, any>;
}

export interface Finding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  detail: string;
  campaigns?: string[];
}

export interface AgentRecommendation {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  target?: string;
  targetId?: string;
  action: string;
  rationale: string;
  impact?: string;
}

export interface AgentOutput {
  findings: Finding[];
  recommendations: AgentRecommendation[];
  artifacts?: Record<string, any>[];
  summary: string;
  suggestedActions?: string[];
}

export interface AgentHandler {
  slug: string;
  run: (input: AgentInput) => Promise<AgentOutput>;
}
