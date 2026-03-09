export type IntentType =
  | "campaign_launch"
  | "ad_copy"
  | "keyword_research"
  | "ad_review"
  | "campaign_analysis"
  | "optimize"
  | "abm_list"
  | "health_check"
  | "budget"
  | "report"
  | "overlap_check"
  | "pause_campaign"
  | "scale_campaign"
  | "target_abm_list"
  | "question"
  | "unknown";

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  extractedParams: Record<string, any>;
  rawMessage: string;
}

// Robust pattern-based classification — no AI needed for routing
// Each entry: [patterns (any match), intent, confidence]
const INTENT_PATTERNS: [RegExp[], IntentType, number][] = [
  // Campaign launch
  [[/\b(launch|create|build|set\s*up|start|spin\s*up)\b.*\b(campaign|campaigns)\b/i,
    /\bcampaign\b.*\b(launch|create|build|set\s*up|start)\b/i,
    /\bwant\s+to\s+(launch|create|run|start)\b/i,
    /\bnew\s+campaign\b/i,
    /\blaunch\s+(a|an)\b/i], "campaign_launch", 0.85],

  // Ad copy
  [[/\b(write|generate|create|draft)\b.*\b(ad\s*copy|ads|headlines?|descriptions?|copy)\b/i,
    /\bad\s*copy\b/i,
    /\b(headlines?|descriptions?)\s+(for|about)\b/i], "ad_copy", 0.85],

  // Keyword research
  [[/\bkeyword/i,
    /\bsearch\s*terms?\b/i,
    /\b(find|suggest|research)\b.*\b(keywords?|queries)\b/i], "keyword_research", 0.85],

  // Ad review (reviewing specific copy quality)
  [[/\b(review|audit|critique|evaluate)\b.*\b(ad|ads|copy|creative)\b/i,
    /\bad\s*(copy|text|creative)\b.*\b(review|audit|check)\b/i], "ad_review", 0.8],

  // Campaign analysis
  [[/\b(analyze|analysis|deep\s*dive|drill\s*into|how\s+is|how\s+are)\b.*\b(campaign|campaigns)\b/i,
    /\bcampaign\b.*\b(perform|doing|results?|stats?|metrics?)\b/i,
    /\bbest\s+perform/i,
    /\bworst\s+perform/i], "campaign_analysis", 0.85],

  // Optimize
  [[/\b(optimize|optimization|optimise|improve)\b/i,
    /\bwhat\s+should\s+(we|i)\s+(pause|change|adjust)\b/i], "optimize", 0.85],

  // ABM
  [[/\babm\b/i,
    /\baccount\s*(based|list)\b/i,
    /\btarget\s*accounts?\b/i,
    /\b(build|create|generate)\b.*\b(list|companies|accounts)\b.*\b(for|targeting|campaign)\b/i,
    /\bcompanies\b.*\b(that|who|which|for)\b/i], "abm_list", 0.85],

  // Health check
  [[/\bhealth\b/i,
    /\bdiagnostic/i,
    /\baccount\s*(check|audit|review)\b/i,
    /\bwhat.*(wrong|issues?|problems?)\b/i], "health_check", 0.85],

  // Budget
  [[/\b(budget|cost|spend)\b.*\b(calc|estimate|plan|forecast|break|allocat)/i,
    /\bhow\s+much\b.*\b(spend|cost|budget)\b/i,
    /\bspend\s*(breakdown|summary|overview)\b/i], "budget", 0.85],

  // Report
  [[/\b(report|reporting|summary)\b/i,
    /\b(weekly|monthly|quarterly)\s+(report|summary|review)\b/i,
    /\bperformance\s+(report|summary|overview)\b/i], "report", 0.85],

  // Overlap check
  [[/\boverlap/i,
    /\bkeyword\s*(conflict|cannibali|duplicate)/i,
    /\bduplicate\s*keyword/i], "overlap_check", 0.85],

  // Pause campaign
  [[/\b(pause|stop|disable|turn\s*off)\b.*\b(campaign|campaigns)\b/i,
    /\bcampaign\b.*\b(pause|stop|disable|turn\s*off)\b/i], "pause_campaign", 0.9],

  // Scale campaign
  [[/\b(scale|increase|boost|ramp|double)\b.*\b(campaign|budget|spend)\b/i,
    /\b(budget|spend)\b.*\b(increase|scale|boost|raise|up)\b/i], "scale_campaign", 0.85],

  // Target ABM list
  [[/\btarget\b.*\b(abm|account)\s*(list)?\b/i,
    /\buse\b.*\b(abm|account)\s*list\b/i,
    /\babm\b.*\btarget/i], "target_abm_list", 0.85],
];

// Extract params from message text
function extractParams(message: string): Record<string, any> {
  const params: Record<string, any> = {};
  
  // Product
  const productMatch = message.match(/\b(voice\s*ai|sms\s*api?|sip\s*trunk|iot|inference|tts|stt|messaging|number|fax|wireless|networking)\b/i);
  if (productMatch) params.product = productMatch[1];
  
  // Platform
  if (/\bgoogle\b/i.test(message)) params.platform = "google_ads";
  else if (/\blinkedin\b/i.test(message)) params.platform = "linkedin";
  else if (/\bstackadapt\b/i.test(message)) params.platform = "stackadapt";
  else if (/\breddit\b/i.test(message)) params.platform = "reddit";
  
  // Competitor
  const compMatch = message.match(/\b(twilio|vonage|bandwidth|plivo|retell|vapi|elevenlabs|livekit|sinch|infobip)\b/i);
  if (compMatch) params.competitors = [compMatch[1]];
  
  // Region
  const regionMatch = message.match(/\b(amer|emea|apac|global|us|europe|asia)\b/i);
  if (regionMatch) params.regions = [regionMatch[1].toUpperCase()];
  
  // Funnel
  const funnelMatch = message.match(/\b(tofu|mofu|bofu|awareness|consideration|decision)\b/i);
  if (funnelMatch) params.funnel_stage = funnelMatch[1].toLowerCase();
  
  // Budget
  const budgetMatch = message.match(/\$\s*([\d,]+(?:\.\d+)?)\s*k?\b/i);
  if (budgetMatch) {
    let amount = parseFloat(budgetMatch[1].replace(/,/g, ''));
    if (/k\b/i.test(budgetMatch[0])) amount *= 1000;
    params.budget = amount;
  }
  
  // Campaign name
  const nameMatch = message.match(/[""]([^""]+)[""]/);
  if (nameMatch) params.campaign_name = nameMatch[1];
  
  return params;
}

export async function classifyIntent(message: string, history?: Array<{ role: string; content: string }>): Promise<IntentResult> {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // Pattern matching — check all patterns, pick highest confidence match
  for (const [patterns, intent, confidence] of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        return {
          intent,
          confidence,
          extractedParams: extractParams(trimmed),
          rawMessage: trimmed,
        };
      }
    }
  }

  // No pattern matched — it's a general question
  return {
    intent: "question",
    confidence: 0.7,
    extractedParams: extractParams(trimmed),
    rawMessage: trimmed,
  };
}

// Map intents to agent slugs
export function intentToAgent(intent: IntentType): string | null {
  const map: Record<IntentType, string | null> = {
    campaign_launch: "campaign-orchestrator",
    ad_copy: "ad-copy-generator",
    keyword_research: "keyword-researcher",
    ad_review: "ad-review",
    campaign_analysis: "campaign-deep-dive",
    optimize: "campaign-optimizer",
    abm_list: "abm-list",
    health_check: "health-check",
    budget: "budget-calculator",
    report: "reporting",
    overlap_check: "overlap-checker",
    pause_campaign: "campaign-optimizer",
    scale_campaign: "budget-calculator",
    target_abm_list: "campaign-orchestrator",
    question: null, // Direct AI answer
    unknown: null,
  };
  return map[intent];
}
