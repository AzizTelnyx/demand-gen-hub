/**
 * Platform specifications — hardcoded requirements for each ad platform.
 * Used by the campaign orchestrator to validate plans and guide builds.
 */

export interface PlatformSpec {
  slug: string;
  name: string;
  campaignTypes: string[];
  objectives?: string[];
  adFormats: AdFormatSpec[];
  targeting: TargetingSpec;
  bidding: BiddingSpec;
  budget: BudgetSpec;
  mustHave: string[];
  shouldEnable: string[];
  abmApproach?: string;
  notes?: string[];
}

export interface AdFormatSpec {
  type: string;
  limits?: Record<string, number>; // char limits or dimensions
  details?: string;
  priority?: "high" | "medium" | "low";
}

export interface TargetingSpec {
  methods: string[];
  geoOptions?: string[];
  audienceMinimum?: number;
  details?: string;
}

export interface BiddingSpec {
  model: "CPC" | "CPM" | "mixed";
  strategies: string[];
  recommended?: string;
  details?: string;
}

export interface BudgetSpec {
  type: "daily" | "lifetime" | "total";
  minimumDaily?: number;
  details?: string;
}

// ════════════════════════════════════════════════════════════════
// Google Ads Search
// ════════════════════════════════════════════════════════════════

export const GOOGLE_ADS: PlatformSpec = {
  slug: "google_search",
  name: "Google Ads Search",
  campaignTypes: ["Search", "Performance Max", "Display", "Video", "Demand Gen"],
  adFormats: [
    {
      type: "RSA",
      limits: { headlines: 15, descriptions: 4, headlineMaxChars: 30, descriptionMaxChars: 90 },
      details: "Responsive Search Ad: min 3 unique headlines pinned to positions, no duplicate messaging",
      priority: "high",
    },
    { type: "Call Extension", details: "Phone number for click-to-call", priority: "high" },
    { type: "Sitelink Extension", details: "Additional landing page links (min 4 recommended)", priority: "high" },
    { type: "Callout Extension", details: "Short benefit phrases (25 chars each)", priority: "high" },
    { type: "Structured Snippet", details: "Category headers with values", priority: "medium" },
  ],
  targeting: {
    methods: ["Keywords (exact/phrase/broad)", "Audiences", "Demographics", "Geo"],
    geoOptions: ["PRESENCE", "PRESENCE_OR_INTEREST"],
    details: "Use PRESENCE only (not PRESENCE_OR_INTEREST) for B2B. Exact and phrase match preferred for new campaigns.",
  },
  bidding: {
    model: "CPC",
    strategies: ["Manual CPC", "Target CPA", "Target ROAS", "Maximize Conversions", "Maximize Clicks"],
    recommended: "Manual CPC for new campaigns, switch to Maximize Conversions at 3+ conv, Target CPA at 30+ conv",
  },
  budget: {
    type: "daily",
    details: "Daily budget. Google may spend up to 2x daily budget on high-traffic days.",
  },
  mustHave: [
    "Conversion tracking configured",
    "At least 3 ad extensions (sitelinks, callouts, structured snippets)",
    "Geo targeting set to PRESENCE (not PRESENCE_OR_INTEREST)",
    "Network set to Search only (not Display for search campaigns)",
    "At least 3 unique headlines pinned to positions in RSA",
  ],
  shouldEnable: [
    "Auto-apply ad suggestions OFF",
    "Search partners OFF for new campaigns",
    "Location bid adjustments for priority regions",
    "Negative keyword list attached",
  ],
  notes: [
    "Campaign needs 14 days learning phase before optimization",
    "Min 3 conversions before switching from Manual CPC",
    "Min 30 conversions before switching to Target CPA",
  ],
};

// ════════════════════════════════════════════════════════════════
// LinkedIn Ads
// ════════════════════════════════════════════════════════════════

export const LINKEDIN_ADS: PlatformSpec = {
  slug: "linkedin",
  name: "LinkedIn Ads",
  campaignTypes: ["Sponsored Content", "Message Ads", "Text Ads", "Dynamic Ads", "Document Ads", "Video Ads"],
  objectives: ["Brand Awareness", "Website Visits", "Engagement", "Video Views", "Lead Generation", "Website Conversions"],
  adFormats: [
    {
      type: "Single Image",
      limits: { width: 1200, height: 627, headlineMaxChars: 200, descriptionMaxChars: 600, introMaxChars: 600 },
      priority: "high",
    },
    {
      type: "Carousel",
      limits: { width: 1080, height: 1080, cards: 10, cardHeadlineMaxChars: 45 },
      priority: "medium",
    },
    {
      type: "Video",
      limits: { minDurationSec: 3, maxDurationMin: 30 },
      details: "MP4 format. 15-30 sec recommended for Sponsored Content.",
      priority: "medium",
    },
    {
      type: "Document",
      details: "PDF upload for document ads. Great for MOFU content.",
      priority: "medium",
    },
    {
      type: "Event",
      details: "Promote LinkedIn Events.",
      priority: "low",
    },
  ],
  targeting: {
    methods: [
      "Job Title", "Job Function", "Seniority", "Industry", "Company Size",
      "Company Name", "Skills", "Groups", "Matched Audiences (account list upload)",
    ],
    audienceMinimum: 50000,
    details: "Audience size must be >50,000 for reliable delivery. For ABM, upload company list as Matched Audience, layer with job title/seniority.",
  },
  bidding: {
    model: "mixed",
    strategies: ["CPC", "CPM", "Automated (target cost)"],
    recommended: "CPC for website visits/conversions, CPM for brand awareness",
  },
  budget: {
    type: "daily",
    minimumDaily: 10,
    details: "Daily or Lifetime budget. Minimum $10/day. Lifetime budget recommended for short-duration campaigns.",
  },
  mustHave: [
    "LinkedIn Insight Tag installed for conversions",
    "Audience size >50,000 for reliable delivery",
    "Clear objective aligned with funnel stage",
    "UTM parameters on all destination URLs",
  ],
  shouldEnable: [
    "Audience expansion OFF for ABM campaigns",
    "Lead Gen Forms for BOFU campaigns",
    "Conversion tracking via Insight Tag",
    "A/B test with 2-4 ad variations",
  ],
  abmApproach: "Upload company list as Matched Audience, layer with job title/seniority targeting. Disable audience expansion. Use Lead Gen Forms for BOFU.",
  notes: [
    "LinkedIn API is READ-ONLY for campaign creation — generate plan document, create manually in Campaign Manager",
    "Higher CPCs than other platforms ($5-15 typical for B2B tech)",
    "Document Ads have highest engagement for MOFU content",
    "Lead Gen Forms have higher conversion rates than landing pages",
  ],
};

// ════════════════════════════════════════════════════════════════
// StackAdapt
// ════════════════════════════════════════════════════════════════

export const STACKADAPT_ADS: PlatformSpec = {
  slug: "stackadapt",
  name: "StackAdapt",
  campaignTypes: ["Native", "Display", "Video", "Connected TV", "DOOH", "In-Game", "Audio"],
  adFormats: [
    {
      type: "Native",
      limits: { headlineMaxChars: 90, bodyMaxChars: 150, brandMaxChars: 25, imageWidth: 1200, imageHeight: 627 },
      details: "Native ads blend into publisher content. Best for TOFU/MOFU.",
      priority: "high",
    },
    {
      type: "Display 300x250",
      limits: { width: 300, height: 250 },
      details: "Medium Rectangle — highest fill rate",
      priority: "high",
    },
    {
      type: "Display 728x90",
      limits: { width: 728, height: 90 },
      details: "Leaderboard",
      priority: "high",
    },
    {
      type: "Display 160x600",
      limits: { width: 160, height: 600 },
      details: "Wide Skyscraper",
      priority: "medium",
    },
    {
      type: "Display 970x250",
      limits: { width: 970, height: 250 },
      details: "Billboard",
      priority: "medium",
    },
    {
      type: "Display 300x600",
      limits: { width: 300, height: 600 },
      details: "Half Page",
      priority: "low",
    },
    {
      type: "Video (VAST)",
      details: "VAST-compliant video ads. Pre-roll, mid-roll, out-stream.",
      priority: "medium",
    },
  ],
  targeting: {
    methods: [
      "B2B (Bombora intent segments)", "Company domain targeting",
      "Contextual", "Behavioral", "Retargeting",
      "Geo", "Device", "Custom audiences",
    ],
    details: "Domain targeting lists for ABM. Bombora intent data for B2B prospecting. Contextual targeting for broad reach.",
  },
  bidding: {
    model: "CPM",
    strategies: ["CPM (fixed)", "Dynamic CPM", "CPC (limited availability)"],
    recommended: "CPM-based bidding. Typical B2B CPMs: $8-15 for native, $5-10 for display.",
    details: "StackAdapt is CPM-based, not CPC. Budget accordingly.",
  },
  budget: {
    type: "total",
    details: "Total campaign budget (not daily). StackAdapt paces spend across campaign duration. Minimum recommended: $2,000/month for meaningful data.",
  },
  mustHave: [
    "Conversion pixel installed on site",
    "Frequency cap set (3-5 impressions/user/day typical)",
    "At least 2 creative sizes for display (300x250 + 728x90 minimum)",
    "UTM parameters on all click URLs",
  ],
  shouldEnable: [
    "Brand safety categories enabled",
    "Viewability targeting (60%+ in-view)",
    "Cross-device tracking",
    "Site retargeting audiences",
  ],
  abmApproach: "Upload domain targeting list for B2B. Layer with Bombora intent segments for higher-intent accounts. Use contextual targeting for net-new reach.",
  notes: [
    "StackAdapt API supports campaign creation via GraphQL upsertCampaign mutation",
    "Native ads outperform display for TOFU by 2-3x engagement",
    "Connected TV available for brand awareness at scale",
    "Frequency caps are critical — B2B audiences are small",
  ],
};

// ════════════════════════════════════════════════════════════════
// Reddit Ads
// ════════════════════════════════════════════════════════════════

export const REDDIT_ADS: PlatformSpec = {
  slug: "reddit",
  name: "Reddit Ads",
  campaignTypes: ["Conversions", "Traffic", "Awareness", "Video Views", "App Installs"],
  objectives: ["Conversions", "Traffic", "Brand Awareness", "Video Views"],
  adFormats: [
    {
      type: "Promoted Post",
      limits: { headlineMaxChars: 300, bodyMaxChars: 40000, imageWidth: 1200, imageHeight: 628 },
      details: "Standard promoted post — appears in feed. Image or video with headline.",
      priority: "high",
    },
    {
      type: "Promoted Video",
      limits: { maxDurationMin: 15 },
      details: "Video post in feed. Autoplay on scroll.",
      priority: "medium",
    },
    {
      type: "Carousel",
      limits: { cards: 6, imageWidth: 1080, imageHeight: 1080 },
      details: "Swipeable image cards.",
      priority: "medium",
    },
    {
      type: "Conversation Placement",
      details: "Ads within comment threads — high engagement.",
      priority: "medium",
    },
  ],
  targeting: {
    methods: [
      "Subreddit/Community targeting", "Interest targeting", "Audience expansion",
      "Custom audiences (email/device ID)", "Lookalike audiences",
      "Keyword targeting", "Geo", "Device", "Placement",
    ],
    details: "Subreddit targeting is Reddit's unique strength — reach users in specific technical communities (r/devops, r/aws, r/programming). B2B tech audiences are highly engaged.",
  },
  bidding: {
    model: "mixed",
    strategies: ["CPC", "CPM", "CPV (video)"],
    recommended: "CPC for conversions/traffic, CPM for awareness. Typical B2B CPC: $2-8.",
  },
  budget: {
    type: "daily",
    minimumDaily: 5,
    details: "Daily or lifetime budget. Minimum $5/day. Reddit can be cost-effective for developer/tech audiences.",
  },
  mustHave: [
    "Reddit Pixel installed for conversion tracking",
    "Clear subreddit targeting strategy",
    "UTM parameters on all destination URLs",
    "Authentic, non-salesy tone (Reddit users reject overt marketing)",
  ],
  shouldEnable: [
    "Frequency capping (Reddit audiences can be small)",
    "Conversation placement for higher engagement",
    "A/B test with 2-3 ad variations",
    "Exclude irrelevant subreddits",
  ],
  abmApproach: "Use custom audience uploads (email lists) for account targeting. Layer with subreddit targeting for developer/technical decision-maker reach.",
  notes: [
    "Reddit users are highly skeptical of ads — authentic, technical tone is critical",
    "Best for developer audiences, AI/ML, and technical products",
    "Subreddit targeting is uniquely powerful — no other platform offers this",
    "Comments on promoted posts are public — monitor and engage",
    "Lower CPCs than LinkedIn for technical audiences",
  ],
};

// ════════════════════════════════════════════════════════════════
// Lookup helpers
// ════════════════════════════════════════════════════════════════

const PLATFORM_MAP: Record<string, PlatformSpec> = {
  google_search: GOOGLE_ADS,
  google_ads: GOOGLE_ADS,
  google: GOOGLE_ADS,
  linkedin: LINKEDIN_ADS,
  linkedin_ads: LINKEDIN_ADS,
  stackadapt: STACKADAPT_ADS,
  reddit: REDDIT_ADS,
  reddit_ads: REDDIT_ADS,
};

export function getPlatformSpec(channel: string): PlatformSpec | null {
  return PLATFORM_MAP[channel.toLowerCase()] || null;
}

export function getAllPlatformSpecs(): PlatformSpec[] {
  return [GOOGLE_ADS, LINKEDIN_ADS, STACKADAPT_ADS, REDDIT_ADS];
}

// ════════════════════════════════════════════════════════════════
// Validation helper — checks a campaign plan against platform reqs
// ════════════════════════════════════════════════════════════════

export interface PlanValidationResult {
  passed: boolean;
  missing: { requirement: string; severity: "critical" | "high" | "medium" }[];
  warnings: string[];
}

export function validatePlanAgainstPlatform(
  plan: {
    channel: string;
    hasConversionTracking?: boolean;
    adExtensionCount?: number;
    geoTargetType?: string;
    network?: string;
    headlineCount?: number;
    audienceSize?: number;
    hasFrequencyCap?: boolean;
    creativeSizeCount?: number;
    hasInsightTag?: boolean;
    hasConversionPixel?: boolean;
    funnelStage?: string;
    hasAudienceExpansionOff?: boolean;
  },
): PlanValidationResult {
  const spec = getPlatformSpec(plan.channel);
  if (!spec) return { passed: true, missing: [], warnings: ["Unknown platform — no validation rules"] };

  const missing: PlanValidationResult["missing"] = [];
  const warnings: string[] = [];

  if (spec.slug === "google_search" || spec.slug === "google_ads") {
    if (plan.hasConversionTracking === false) {
      missing.push({ requirement: "Conversion tracking not configured", severity: "critical" });
    }
    if (plan.adExtensionCount !== undefined && plan.adExtensionCount < 3) {
      missing.push({ requirement: `Only ${plan.adExtensionCount} ad extensions — need at least 3 (sitelinks, callouts, structured snippets)`, severity: "high" });
    }
    if (plan.geoTargetType && plan.geoTargetType !== "PRESENCE") {
      missing.push({ requirement: `Geo targeting is "${plan.geoTargetType}" — should be PRESENCE for B2B`, severity: "high" });
    }
    if (plan.network && plan.network.toLowerCase().includes("display")) {
      warnings.push("Display network enabled on a search campaign — recommend Search only for new campaigns");
    }
    if (plan.headlineCount !== undefined && plan.headlineCount < 3) {
      missing.push({ requirement: `Only ${plan.headlineCount} headlines — RSA needs at least 3 unique pinned headlines`, severity: "high" });
    }
  }

  if (spec.slug === "linkedin" || spec.slug === "linkedin_ads") {
    if (plan.hasInsightTag === false) {
      missing.push({ requirement: "LinkedIn Insight Tag not installed — needed for conversion tracking", severity: "critical" });
    }
    if (plan.audienceSize !== undefined && plan.audienceSize < 50000) {
      missing.push({ requirement: `Audience size ${plan.audienceSize.toLocaleString()} is below 50,000 minimum for reliable delivery`, severity: "high" });
    }
    if (plan.funnelStage?.toLowerCase() === "bofu") {
      warnings.push("BOFU LinkedIn campaign — consider Lead Gen Forms for higher conversion rates");
    }
    if (plan.hasAudienceExpansionOff === false) {
      warnings.push("Audience expansion is ON — disable for ABM campaigns to maintain targeting precision");
    }
  }

  if (spec.slug === "stackadapt") {
    if (plan.hasConversionPixel === false) {
      missing.push({ requirement: "StackAdapt conversion pixel not installed", severity: "critical" });
    }
    if (plan.hasFrequencyCap === false) {
      missing.push({ requirement: "No frequency cap set — B2B audiences need frequency caps (3-5/day)", severity: "high" });
    }
    if (plan.creativeSizeCount !== undefined && plan.creativeSizeCount < 2) {
      missing.push({ requirement: `Only ${plan.creativeSizeCount} creative size — need at least 2 (300x250 + 728x90 minimum)`, severity: "medium" });
    }
  }

  return {
    passed: missing.filter(m => m.severity === "critical").length === 0,
    missing,
    warnings,
  };
}
