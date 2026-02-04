/**
 * Parse Telnyx campaign naming convention
 * Format: YEARMM FUNNEL_STAGE PRODUCT CHANNEL REGION
 * Example: "202602 BOFU AI Agent LiveKit SA GLOBAL"
 */

export interface ParsedCampaign {
  yearMonth: string | null;
  funnelStage: "TOFU" | "MOFU" | "BOFU" | "ABM" | "UPSELL" | "PARTNERSHIP" | null;
  product: string | null;
  channel: string | null;
  region: string | null;
  isCompetitor: boolean;
  competitorName: string | null;
}

const FUNNEL_STAGES = ["ABM", "TOFU", "MOFU", "BOFU", "UPSELL", "PARTNERSHIP"];
const CHANNELS = ["SA", "DA", "NA", "Video", "DOOH", "Native", "Display", "CTV"];
const REGIONS = ["GLOBAL", "AMER", "EMEA", "APAC", "MENA", "US", "UK", "EU"];

const PRODUCTS = [
  "AI Agent",
  "Voice AI", 
  "Voice API",
  "SMS API",
  "SMS",
  "TTS API",
  "SIP Trunking",
  "SIP",
  "Messaging",
  "IoT",
  "Number Lookup",
  "Verify",
  "RCS",
  "Wireless",
  "Brand",
  "MS Teams",
  "Healthcare",
  "Insurance",
  "Banking",
  "UCaaS",
];

const COMPETITORS = [
  "LiveKit",
  "Pipecat", 
  "Vapi",
  "Retell",
  "Elevenlabs",
  "ElevenLabs",
  "Twilio",
  "Vonage",
  "Bandwidth",
  "Plivo",
];

export function parseCampaignName(name: string): ParsedCampaign {
  const result: ParsedCampaign = {
    yearMonth: null,
    funnelStage: null,
    product: null,
    channel: null,
    region: null,
    isCompetitor: false,
    competitorName: null,
  };

  if (!name) return result;

  const upperName = name.toUpperCase();

  // Extract year/month (YYYYMM at start)
  const yearMonthMatch = name.match(/^(\d{6})/);
  if (yearMonthMatch) {
    result.yearMonth = yearMonthMatch[1];
  }

  // Extract funnel stage
  for (const stage of FUNNEL_STAGES) {
    if (upperName.includes(stage)) {
      result.funnelStage = stage as "TOFU" | "MOFU" | "BOFU" | "ABM" | "UPSELL" | "PARTNERSHIP";
      break;
    }
  }

  // Extract product
  for (const product of PRODUCTS) {
    if (upperName.includes(product.toUpperCase())) {
      result.product = product;
      break;
    }
  }

  // Extract channel
  for (const channel of CHANNELS) {
    // Match channel codes like "SA" (Search Ads), "DA" (Display Ads), "NA" (Native Ads)
    const regex = new RegExp(`\\b${channel}\\b`, "i");
    if (regex.test(name)) {
      result.channel = channel === "SA" ? "Search" : 
                       channel === "DA" ? "Display" : 
                       channel === "NA" ? "Native" :
                       channel;
      break;
    }
  }

  // Extract region
  for (const region of REGIONS) {
    if (upperName.includes(region)) {
      result.region = region;
      break;
    }
  }

  // Check for competitor campaigns
  for (const competitor of COMPETITORS) {
    if (upperName.includes(competitor.toUpperCase())) {
      result.isCompetitor = true;
      result.competitorName = competitor;
      break;
    }
  }

  return result;
}

export function getFunnelStageColor(stage: string | null): string {
  switch (stage) {
    case "TOFU": return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
    case "MOFU": return "bg-purple-500/20 text-purple-400 border border-purple-500/30";
    case "BOFU": return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    case "ABM": return "bg-amber-500/20 text-amber-400 border border-amber-500/30";
    case "UPSELL": return "bg-pink-500/20 text-pink-400 border border-pink-500/30";
    case "PARTNERSHIP": return "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30";
    default: return "bg-gray-500/20 text-gray-400 border border-gray-500/30";
  }
}

export function getFunnelStageLabel(stage: string | null): string {
  switch (stage) {
    case "TOFU": return "Top of Funnel";
    case "MOFU": return "Middle of Funnel";
    case "BOFU": return "Bottom of Funnel";
    default: return "Unknown";
  }
}
