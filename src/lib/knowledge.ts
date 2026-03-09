// ⚠️ LEGACY: This file contains hardcoded knowledge that should migrate to markdown files in knowledge/.
// Product groups are now canonical in knowledge/product-groups.md — use knowledge-sync.ts for product group lookups.
// TODO: Incrementally migrate products, competitors, regions to markdown and read from there.
//
// Telnyx Knowledge Base - Campaign Builder Context
// Source: ~/clawd/knowledge/

export const TELNYX_KNOWLEDGE = {
  // ============================================================
  // CAMPAIGN TYPES
  // ============================================================
  campaignTypes: {
    'lead_gen': {
      name: 'Lead Generation',
      description: 'Standard funnel campaigns (TOFU/MOFU/BOFU)',
      funnelStages: ['tofu', 'mofu', 'bofu'],
      defaultChannels: ['Google Search', 'LinkedIn'],
      requiredFields: ['product', 'regions', 'funnelFocus'],
      namingPrefix: null, // Uses funnel stage instead
    },
    'brand': {
      name: 'Brand Awareness',
      description: 'Brand awareness and protection campaigns',
      funnelStages: ['tofu'],
      defaultChannels: ['Google Display', 'YouTube', 'StackAdapt'],
      requiredFields: ['regions'],
      namingPrefix: 'BRAND',
    },
    'competitor': {
      name: 'Competitor Conquest',
      description: 'Target competitor users/searchers',
      funnelStages: ['mofu', 'bofu'],
      defaultChannels: ['Google Search', 'Google Display'],
      requiredFields: ['competitor', 'regions'],
      namingPrefix: 'BOFU', // Competitor campaigns are typically BOFU
    },
    'webinar': {
      name: 'Webinar Promotion',
      description: 'Drive webinar registrations',
      funnelStages: ['tofu', 'mofu'],
      defaultChannels: ['LinkedIn', 'Google Display', 'Meta'],
      requiredFields: ['webinarTitle', 'webinarDate', 'registrationUrl'],
      namingPrefix: 'WEBINAR',
    },
    'event': {
      name: 'Event Promotion',
      description: 'Promote conferences, meetups, Voice AI Connect',
      funnelStages: ['tofu'],
      defaultChannels: ['LinkedIn', 'Google Display', 'StackAdapt'],
      requiredFields: ['eventName', 'eventDate', 'eventLocation'],
      namingPrefix: 'EVENTS',
    },
    'social_boost': {
      name: 'Social Boost',
      description: 'Boost organic social posts',
      funnelStages: ['tofu'],
      defaultChannels: ['LinkedIn', 'Meta'],
      requiredFields: ['postUrl'],
      namingPrefix: 'SOCIAL',
    },
    'commercial': {
      name: 'Commercial/Promo',
      description: 'Seasonal promotions, product launches, holidays',
      funnelStages: ['tofu', 'mofu'],
      defaultChannels: ['Google Display', 'YouTube', 'LinkedIn'],
      requiredFields: ['promoName'],
      namingPrefix: 'COMMERCIAL',
    },
    'partnership': {
      name: 'Partnership',
      description: 'Co-marketing and partner campaigns',
      funnelStages: ['tofu', 'mofu'],
      defaultChannels: ['LinkedIn', 'Google Display'],
      requiredFields: ['partnerName'],
      namingPrefix: 'PARTNERSHIP',
    },
    'retargeting': {
      name: 'Retargeting',
      description: 'Retarget website visitors and engaged users',
      funnelStages: ['mofu', 'bofu'],
      defaultChannels: ['Google Display', 'LinkedIn', 'Meta'],
      requiredFields: ['audienceSource'],
      namingPrefix: 'RT',
    },
  },

  // ============================================================
  // CHANNEL CODES (for campaign naming)
  // ============================================================
  channelCodes: {
    'Google Search': { code: 'SA', type: 'SEARCH', platform: 'google' },
    'Google Display': { code: 'DA', type: 'DISPLAY', platform: 'google' },
    'YouTube': { code: 'VA', type: 'VIDEO', platform: 'google' },
    'LinkedIn': { code: 'SI', type: 'SOCIAL', platform: 'linkedin' }, // Single Image default
    'Reddit': { code: 'NA', type: 'SOCIAL', platform: 'reddit' },
    'StackAdapt': { code: 'DA', type: 'DISPLAY', platform: 'stackadapt' },
    'Meta': { code: 'SI', type: 'SOCIAL', platform: 'meta' },
    'Hacker News': { code: 'SPA', type: 'SPONSORED', platform: 'hn' },
    'RLSA': { code: 'RLSA', type: 'SEARCH', platform: 'google' }, // Remarketing Lists
    'Retargeting': { code: 'RT', type: 'DISPLAY', platform: 'various' },
  },

  // ============================================================
  // CONTENT TYPE CODES
  // ============================================================
  contentCodes: {
    'SI': 'Single Image Ad',
    'VA': 'Video Ad',
    'CA': 'Carousel Ad',
    'NA': 'Native Ad',
    'DA': 'Display Ad',
    'MA': 'Message Ad',
    'SPA': 'Spotlight Ad',
    'TL': 'Thought Leadership',
    'SA': 'Search Ad',
    'IM': 'Interactive Media',
  },

  // ============================================================
  // PRODUCTS (Truth List from UTM Standards)
  // ============================================================
  products: {
    'Voice AI': {
      code: 'AI_Agent',
      description: 'Real-time voice AI infrastructure',
      aliases: ['AI Agent', 'Voice AI', 'Conversational AI'],
      competitors: ['LiveKit', 'Pipecat', 'Vapi', 'Retell', 'ElevenLabs'],
    },
    'Voice API': {
      code: 'Voice_API',
      description: 'Programmable voice for developers',
      aliases: ['Voice API', 'Call Control', 'Programmable Voice'],
      competitors: ['Twilio', 'Vonage', 'Bandwidth', 'Plivo'],
    },
    'Voice SDK': {
      code: 'Voice_SDK',
      description: 'Voice SDK for mobile/web',
      aliases: ['Voice SDK', 'WebRTC'],
      competitors: ['Twilio', 'Vonage'],
    },
    'SMS API': {
      code: 'SMS',
      description: 'A2P messaging platform',
      aliases: ['SMS', 'SMS API', 'Messaging', 'A2P'],
      competitors: ['Twilio', 'Vonage', 'Plivo', 'MessageBird'],
    },
    'MMS': {
      code: 'MMS',
      description: 'Multimedia messaging',
      aliases: ['MMS'],
      competitors: ['Twilio', 'Vonage'],
    },
    'RCS': {
      code: 'RCS',
      description: 'Rich Communication Services',
      aliases: ['RCS', 'Rich Messaging'],
      competitors: ['Twilio', 'Sinch'],
    },
    'SIP Trunking': {
      code: 'SIP',
      description: 'Enterprise voice connectivity',
      aliases: ['SIP', 'SIP Trunk', 'SIP Trunking'],
      competitors: ['Bandwidth', 'Vonage', 'RingCentral'],
    },
    'IoT': {
      code: 'IoT_SIM',
      description: 'Global IoT connectivity',
      aliases: ['IoT', 'IoT SIM', 'eSIM', 'Cellular IoT'],
      competitors: ['Twilio IoT', 'Hologram', 'KORE'],
    },
    'Numbers': {
      code: 'Numbers',
      description: 'Phone number provisioning',
      aliases: ['Numbers', 'DIDs', 'Phone Numbers', 'Virtual Numbers'],
      competitors: ['Twilio', 'Bandwidth'],
    },
    'Verify': {
      code: 'Verify',
      description: 'Phone verification API',
      aliases: ['Verify', '2FA', 'OTP'],
      competitors: ['Twilio Verify', 'Telesign'],
    },
    'Number Lookup': {
      code: 'Number_Look_Up',
      description: 'Phone number intelligence',
      aliases: ['Number Lookup', 'Carrier Lookup'],
      competitors: ['Twilio Lookup', 'Ekata'],
    },
    'Fax API': {
      code: 'Fax_API',
      description: 'Programmable fax',
      aliases: ['Fax', 'Fax API'],
      competitors: ['Twilio'],
    },
    'Video API': {
      code: 'Video_API',
      description: 'Video conferencing API',
      aliases: ['Video', 'Video API'],
      competitors: ['Twilio Video', 'Vonage Video'],
    },
    'TTS API': {
      code: 'TTS_API',
      description: 'Text-to-speech API',
      aliases: ['TTS', 'Text to Speech'],
      competitors: ['ElevenLabs', 'AWS Polly', 'Google TTS'],
    },
    'STT API': {
      code: 'STT_API',
      description: 'Speech-to-text API',
      aliases: ['STT', 'Speech to Text', 'Transcription'],
      competitors: ['Deepgram', 'AssemblyAI', 'AWS Transcribe'],
    },
    'Microsoft Teams': {
      code: 'MS_Teams',
      description: 'MS Teams Direct Routing',
      aliases: ['MS Teams', 'Teams', 'Direct Routing'],
      competitors: ['Operator Connect providers'],
    },
  },

  // ============================================================
  // COMPETITORS (for conquest campaigns)
  // ============================================================
  competitors: {
    // CPaaS
    'Twilio': { type: 'CPaaS', products: ['Voice', 'SMS', 'Video'], code: 'Twilio' },
    'Vonage': { type: 'CPaaS', products: ['Voice', 'SMS'], code: 'Vonage' },
    'Bandwidth': { type: 'CPaaS', products: ['Voice', 'SMS'], code: 'Bandwidth' },
    'Plivo': { type: 'CPaaS', products: ['Voice', 'SMS'], code: 'Plivo' },
    'MessageBird': { type: 'CPaaS', products: ['SMS'], code: 'MessageBird' },
    'Sinch': { type: 'CPaaS', products: ['SMS'], code: 'Sinch' },
    
    // Voice AI
    'LiveKit': { type: 'Voice AI', products: ['Real-time'], code: 'LiveKit' },
    'Pipecat': { type: 'Voice AI', products: ['Orchestration'], code: 'Pipecat' },
    'Vapi': { type: 'Voice AI', products: ['Voice Agents'], code: 'Vapi' },
    'Retell': { type: 'Voice AI', products: ['Voice Agents'], code: 'Retell' },
    'ElevenLabs': { type: 'Voice AI', products: ['TTS'], code: 'Elevenlabs' },
    
    // Contact Center
    'Five9': { type: 'Contact Center', products: ['CCaaS'], code: 'Five9' },
    'NICE': { type: 'Contact Center', products: ['CCaaS'], code: 'NICE' },
    'Genesys': { type: 'Contact Center', products: ['CCaaS'], code: 'Genesys' },
    'Talkdesk': { type: 'Contact Center', products: ['CCaaS'], code: 'Talkdesk' },
    'Amazon Connect': { type: 'Contact Center', products: ['CCaaS'], code: 'Amazon_Connect' },
    
    // IoT
    'Hologram': { type: 'IoT', products: ['IoT SIM'], code: 'Hologram' },
    'KORE': { type: 'IoT', products: ['IoT'], code: 'Kore' },
  },

  // ============================================================
  // REGIONS
  // ============================================================
  regions: {
    'AMER': { code: 'AMER', countries: ['US', 'Canada', 'Mexico', 'Brazil'] },
    'EMEA': { code: 'EMEA', countries: ['UK', 'Germany', 'France', 'Netherlands', 'Ireland', 'Spain', 'Italy'] },
    'APAC': { code: 'APAC', countries: ['Australia', 'Singapore', 'Japan', 'South Korea', 'India', 'Philippines', 'Thailand'] },
    'MENA': { code: 'MENA', countries: ['UAE', 'Saudi Arabia', 'Qatar', 'Israel'] },
    'GLOBAL': { code: 'GLOBAL', countries: ['All'] },
  },

  // ============================================================
  // ICP SEGMENTS
  // ============================================================
  icps: {
    'Developers': {
      titles: ['Software Engineer', 'Backend Developer', 'Full-stack Developer', 'DevOps Engineer'],
      industries: ['SaaS', 'FinTech', 'HealthTech', 'AI/ML startups'],
      channels: ['Google Search', 'Reddit', 'Hacker News'],
    },
    'Enterprise Contact Centers': {
      titles: ['VP Customer Experience', 'Contact Center Director', 'CIO', 'Head of CX'],
      industries: ['Insurance', 'Healthcare', 'Banking', 'Retail', 'Travel'],
      channels: ['LinkedIn', 'Google Search'],
    },
    'AI-Native Companies': {
      titles: ['CTO', 'Founder', 'Head of Engineering', 'VP Engineering'],
      industries: ['Voice AI', 'Conversational AI', 'Virtual agents'],
      channels: ['Google Search', 'LinkedIn', 'Reddit'],
    },
    'Enterprise IT': {
      titles: ['CIO', 'IT Director', 'VP IT', 'Telecom Manager'],
      industries: ['Enterprise'],
      channels: ['LinkedIn', 'Google Search'],
    },
  },

  // ============================================================
  // VERTICALS
  // ============================================================
  verticals: [
    'Healthcare/HealthTech',
    'Financial Services/FinTech',
    'Insurance/InsurTech',
    'Travel & Hospitality',
    'Retail/E-commerce',
    'Logistics & Delivery',
    'Contact Centers/BPO',
    'SaaS/Technology',
    'Automotive',
    'Real Estate',
  ],
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Generate campaign name following convention
export function generateCampaignName(params: {
  campaignType: string;
  funnelStage?: string;
  product?: string;
  competitor?: string;
  channelCode?: string;
  region?: string;
  context?: string;
}): string {
  const { campaignType, funnelStage, product, competitor, channelCode, region, context } = params;
  
  // Get current YYYYMM
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Naming convention: YYYYMM {Funnel} {Product} {Type} {Geo}
  // Examples:
  // - 202602 BOFU Voice AI SA US (Search Ads, US)
  // - 202602 MOFU SMS API DSA GLOBAL (Dynamic Search Ads)
  // - 202602 TOFU Contact Center DA US/UK (Display Ads)
  
  // Get campaign type info
  const typeInfo = TELNYX_KNOWLEDGE.campaignTypes[campaignType as keyof typeof TELNYX_KNOWLEDGE.campaignTypes];
  
  // Determine funnel prefix
  let funnelPrefix: string;
  if (typeInfo?.namingPrefix && typeInfo.namingPrefix !== null) {
    // Non-funnel campaigns use their specific prefix (WEBINAR, EVENTS, BRAND, etc.)
    funnelPrefix = typeInfo.namingPrefix;
  } else if (funnelStage && funnelStage.toLowerCase() !== 'full') {
    // Use specified funnel stage
    funnelPrefix = funnelStage.toUpperCase();
  } else {
    // Default to MOFU for "full" funnel campaigns
    funnelPrefix = 'MOFU';
  }
  
  // Get product code
  const productInfo = product ? TELNYX_KNOWLEDGE.products[product as keyof typeof TELNYX_KNOWLEDGE.products] : null;
  const productCode = productInfo?.code || product?.replace(/\s+/g, ' ') || '';
  
  // Get competitor code if conquest campaign
  const competitorInfo = competitor ? TELNYX_KNOWLEDGE.competitors[competitor as keyof typeof TELNYX_KNOWLEDGE.competitors] : null;
  const competitorCode = competitorInfo?.code || '';
  
  // Build name: YYYYMM {Funnel} {Product} {Type} {Geo}
  const parts = [yearMonth, funnelPrefix];
  
  // Add product or competitor
  if (competitorCode) {
    parts.push(competitorCode);
  } else if (productCode) {
    parts.push(productCode);
  }
  
  // Add context if provided (webinar title, event name, etc.)
  if (context) parts.push(context.replace(/\s+/g, ' '));
  
  // Add channel type code (SA, DA, SI, etc.)
  if (channelCode) parts.push(channelCode);
  
  // Add region
  if (region) parts.push(region);
  
  return parts.join(' ');
}

// Detect campaign type from brief text
export function detectCampaignType(text: string): string {
  const lower = text.toLowerCase();
  
  if (lower.includes('webinar')) return 'webinar';
  if (lower.includes('event') || lower.includes('conference') || lower.includes('meetup') || lower.includes('voice ai connect')) return 'event';
  if (lower.includes('boost') || lower.includes('social post') || lower.includes('promote post')) return 'social_boost';
  if (lower.includes('brand') && (lower.includes('awareness') || lower.includes('protection'))) return 'brand';
  if (lower.includes('retarget') || lower.includes('remarketing') || lower.includes('rlsa')) return 'retargeting';
  if (lower.includes('partner') || lower.includes('co-marketing')) return 'partnership';
  if (lower.includes('promo') || lower.includes('launch') || lower.includes('holiday') || lower.includes('commercial')) return 'commercial';
  
  // Check for competitor mentions
  for (const comp of Object.keys(TELNYX_KNOWLEDGE.competitors)) {
    if (lower.includes(comp.toLowerCase()) || lower.includes('alternative') || lower.includes('vs ') || lower.includes('conquest')) {
      return 'competitor';
    }
  }
  
  // Default to lead gen
  return 'lead_gen';
}

// Detect product from text
export function detectProduct(text: string): string | null {
  const lower = text.toLowerCase();
  
  for (const [product, info] of Object.entries(TELNYX_KNOWLEDGE.products)) {
    for (const alias of info.aliases) {
      if (lower.includes(alias.toLowerCase())) {
        return product;
      }
    }
  }
  
  return null;
}

// Detect competitors from text
export function detectCompetitors(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  
  for (const comp of Object.keys(TELNYX_KNOWLEDGE.competitors)) {
    if (lower.includes(comp.toLowerCase())) {
      found.push(comp);
    }
  }
  
  return found;
}

// Get default channels for campaign type
export function getDefaultChannels(campaignType: string): string[] {
  const typeInfo = TELNYX_KNOWLEDGE.campaignTypes[campaignType as keyof typeof TELNYX_KNOWLEDGE.campaignTypes];
  return typeInfo?.defaultChannels || ['Google Search', 'LinkedIn'];
}
