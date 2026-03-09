/**
 * Safety & Validation Layer
 * 
 * RULES:
 * - All validation is PROGRAMMATIC (no AI for validation)
 * - All write operations require explicit approval
 * - All outputs include confidence scores
 * - All errors stop the workflow
 * - All runs are fully audited
 */

// ============================================================
// CONFIDENCE SCORING
// ============================================================

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface ConfidenceScore {
  level: ConfidenceLevel;
  reasons: string[];
  dataSourcesUsed: string[];
  dataSourcesMissing: string[];
}

export function computeConfidence(params: {
  hasApiData: boolean;
  hasKnowledgeBase: boolean;
  hasAllRequiredFields: boolean;
  validationsPassed: boolean;
  customFlags?: { condition: boolean; ifFalse: string }[];
}): ConfidenceScore {
  const reasons: string[] = [];
  const sourcesUsed: string[] = [];
  const sourcesMissing: string[] = [];

  if (params.hasApiData) {
    sourcesUsed.push("API data");
  } else {
    sourcesMissing.push("API data");
    reasons.push("No live API data available");
  }

  if (params.hasKnowledgeBase) {
    sourcesUsed.push("Knowledge base");
  } else {
    sourcesMissing.push("Knowledge base");
    reasons.push("Knowledge base files not loaded");
  }

  if (!params.hasAllRequiredFields) {
    reasons.push("Missing required input fields");
  }

  if (!params.validationsPassed) {
    reasons.push("Some validations failed");
  }

  for (const flag of params.customFlags || []) {
    if (!flag.condition) {
      reasons.push(flag.ifFalse);
    }
  }

  let level: ConfidenceLevel;
  if (sourcesMissing.length === 0 && reasons.length === 0) {
    level = "HIGH";
  } else if (sourcesMissing.length <= 1 && reasons.length <= 1) {
    level = "MEDIUM";
  } else {
    level = "LOW";
  }

  return {
    level,
    reasons,
    dataSourcesUsed: sourcesUsed,
    dataSourcesMissing: sourcesMissing,
  };
}

// ============================================================
// PROGRAMMATIC VALIDATORS
// ============================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Validate character limit — counts actual chars, not AI-reported */
export function validateCharLimit(text: string, maxChars: number, label: string): ValidationResult {
  const len = text.length;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (len > maxChars) {
    errors.push(`${label}: "${text}" is ${len} chars (max ${maxChars})`);
  } else if (len > maxChars * 0.95) {
    warnings.push(`${label}: "${text}" is ${len}/${maxChars} chars (very close to limit)`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate no em dashes */
export function validateNoEmDash(text: string, label: string): ValidationResult {
  if (text.includes("—") || text.includes("–")) {
    return { valid: false, errors: [`${label}: contains em/en dash: "${text}"`], warnings: [] };
  }
  return { valid: true, errors: [], warnings: [] };
}

/** Validate campaign name format: YYYYMM {Stage} {Product} {Channel} {Geo} */
export function validateCampaignName(name: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must start with YYYYMM
  if (!/^\d{6}\s/.test(name)) {
    errors.push(`Campaign name must start with YYYYMM: "${name}"`);
  }

  // No underscores
  if (name.includes("_")) {
    errors.push(`Campaign name must not contain underscores: "${name}"`);
  }

  // Must contain funnel stage or type prefix
  const validPrefixes = ["TOFU", "MOFU", "BOFU", "BRAND", "WEBINAR", "EVENTS", "COMMERCIAL", "PARTNERSHIP", "RT", "SOCIAL"];
  const hasPrefix = validPrefixes.some((p) => name.includes(p));
  if (!hasPrefix) {
    warnings.push(`Campaign name missing funnel stage/type prefix: "${name}"`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate UTM parameters */
export function validateUTM(url: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const parsed = new URL(url);
    const requiredParams = ["utm_source", "utm_medium", "utm_campaign"];
    for (const param of requiredParams) {
      if (!parsed.searchParams.get(param)) {
        errors.push(`Missing ${param} in URL: ${url}`);
      }
    }

    // Check for proper values
    const source = parsed.searchParams.get("utm_source");
    const validSources = ["google", "linkedin", "stackadapt", "reddit", "meta", "bing"];
    if (source && !validSources.includes(source.toLowerCase())) {
      warnings.push(`Unusual utm_source: "${source}"`);
    }
  } catch {
    errors.push(`Invalid URL: ${url}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate keyword match type — NEVER broad */
export function validateMatchType(matchType: string): ValidationResult {
  const normalized = matchType.toUpperCase().replace(/\s+/g, "_");
  if (normalized === "BROAD" || normalized === "BROAD_MATCH") {
    return {
      valid: false,
      errors: [`Broad match is NEVER allowed. Use EXACT or PHRASE only. Got: "${matchType}"`],
      warnings: [],
    };
  }
  if (!["EXACT", "PHRASE", "EXACT_MATCH", "PHRASE_MATCH"].includes(normalized)) {
    return {
      valid: false,
      errors: [`Invalid match type: "${matchType}". Must be EXACT or PHRASE.`],
      warnings: [],
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

/** Validate Google Ads campaign settings before creation */
export function validateGoogleAdsCampaignSettings(settings: {
  status?: string;
  geoTargetType?: string;
  networkSetting?: string;
  biddingStrategy?: string;
}): ValidationResult {
  const errors: string[] = [];

  // Must create as PAUSED
  if (settings.status && settings.status !== "PAUSED") {
    errors.push(`Campaign must be created with status=PAUSED, got "${settings.status}"`);
  }

  // Geo must be PRESENCE only
  if (settings.geoTargetType && settings.geoTargetType !== "PRESENCE") {
    errors.push(`Geo targeting must be PRESENCE only, got "${settings.geoTargetType}"`);
  }

  // Network must be SEARCH only (no display expansion)
  if (settings.networkSetting && !["SEARCH", "SEARCH_ONLY"].includes(settings.networkSetting.toUpperCase())) {
    errors.push(`Network must be SEARCH only, got "${settings.networkSetting}"`);
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}

/** Validate budget math adds up */
export function validateBudgetMath(params: {
  dailyBudget: number;
  monthlyBudget: number;
  daysInMonth?: number;
}): ValidationResult {
  const days = params.daysInMonth || 30;
  const expected = params.dailyBudget * days;
  const diff = Math.abs(expected - params.monthlyBudget);
  const tolerance = expected * 0.02; // 2% tolerance for rounding

  if (diff > tolerance) {
    return {
      valid: false,
      errors: [`Budget math doesn't add up: $${params.dailyBudget}/day × ${days} days = $${expected}, but monthly shows $${params.monthlyBudget}`],
      warnings: [],
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

/** Aggregate multiple validation results */
export function aggregateValidations(...results: ValidationResult[]): ValidationResult {
  return {
    valid: results.every((r) => r.valid),
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings),
  };
}

// ============================================================
// WRITE OPERATION GUARDS
// ============================================================

export type WriteOpType =
  | "create_campaign"
  | "pause_campaign"
  | "enable_campaign"
  | "update_budget"
  | "change_bid_strategy"
  | "add_keywords"
  | "add_negative_keywords"
  | "update_ad_copy";

export interface WriteOperation {
  type: WriteOpType;
  platform: string;
  target: string;
  description: string;
  oldValue?: string;
  newValue?: string;
  requiresApproval: true; // Always true — this is a type-level enforcement
}

/** Create a write operation record. Always requires approval. */
export function createWriteOp(params: Omit<WriteOperation, "requiresApproval">): WriteOperation {
  return { ...params, requiresApproval: true };
}

// ============================================================
// TOKEN COST ESTIMATION
// ============================================================

// Approximate costs per 1M tokens (Sonnet)
const SONNET_INPUT_COST = 3.0; // $/M tokens
const SONNET_OUTPUT_COST = 15.0; // $/M tokens

export function estimateTokenCost(inputChars: number, outputChars: number): {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
} {
  // Rough: 1 token ≈ 4 chars
  const inputTokens = Math.ceil(inputChars / 4);
  const outputTokens = Math.ceil(outputChars / 4);
  const cost =
    (inputTokens / 1_000_000) * SONNET_INPUT_COST +
    (outputTokens / 1_000_000) * SONNET_OUTPUT_COST;

  return {
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostUsd: Math.round(cost * 10000) / 10000,
  };
}
