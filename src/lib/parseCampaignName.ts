/**
 * Parse Telnyx campaign naming convention
 * Format: YEARMM FUNNEL_STAGE PRODUCT CHANNEL REGION
 * Example: "202602 BOFU AI Agent LiveKit SA GLOBAL"
 */

export interface ParsedCampaign {
  yearMonth: string | null;
  funnelStage: "TOFU" | "MOFU" | "BOFU" | null;
  product: string | null;
  channel: string | null;
  region: string | null;
  isCompetitor: boolean;
  competitorName: string | null;
}

const FUNNEL_STAGES = ["TOFU", "MOFU", "BOFU"];
const CHANNELS = ["SA", "DA", "Video", "DOOH", "Native"];
const REGIONS = ["GLOBAL", "AMER", "EMEA", "APAC", "MENA", "US", "UK", "EU"];

const PRODUCTS = [
  "AI Agent",
  "Voice AI", 
  "Voice API",
  "SMS API",
  "TTS API",
  "SIP Trunking",
  "Messaging",
  "IoT",
  "Number Lookup",
  "Verify",
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
      result.funnelStage = stage as "TOFU" | "MOFU" | "BOFU";
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
    // Match channel codes like "SA" (Search Ads), "DA" (Display Ads)
    const regex = new RegExp(`\\b${channel}\\b`, "i");
    if (regex.test(name)) {
      result.channel = channel === "SA" ? "Search" : 
                       channel === "DA" ? "Display" : 
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
    case "TOFU": return "bg-blue-100 text-blue-800";
    case "MOFU": return "bg-purple-100 text-purple-800";
    case "BOFU": return "bg-green-100 text-green-800";
    default: return "bg-gray-100 text-gray-800";
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
