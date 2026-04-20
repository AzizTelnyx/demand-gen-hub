/**
 * Comprehensive Asset Index for Banner Generation
 * Uses the full Asset Library at /Users/azizalsinafi/Documents/Asset_Library
 */

export interface Asset {
  id: string;
  filename: string;
  path: string;
  category: 'stock_photo' | 'composed_visual' | 'background' | 'icon_3d' | 'industry_visual' | 'feature_visual';
  useCases: string[];
  worksOn: ('light' | 'dark')[];
  colorScheme?: 'teal' | 'purple' | 'pink' | 'warm' | 'neutral';
  description?: string;
}

const ASSET_LIBRARY = '/Users/azizalsinafi/Documents/Asset_Library';
const BRAND_ASSETS = '/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/brand-assets';

export const ASSETS: Asset[] = [
  // ─── Industry Hero Visuals ────────────────────────────────────────────────
  {
    id: 'hero-finance',
    filename: 'Industry_Finance-Hero.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Industry_Hero/V1/Industry_Finance-Hero.png`,
    category: 'industry_visual',
    useCases: ['fintech', 'enterprise', 'finance'],
    worksOn: ['dark'],
    colorScheme: 'neutral',
    description: 'Skyscrapers finance hero'
  },
  {
    id: 'hero-travel',
    filename: 'Industry_Travel-Hospitality_Hero.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Industry_Hero/V1/Industry_Travel-Hospitality_Hero.png`,
    category: 'industry_visual',
    useCases: ['travel', 'hospitality'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Travel hospitality hero'
  },
  {
    id: 'hero-retail',
    filename: 'Industry_eCommerce-Retail_Hero.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Industry_Hero/V1/Industry_eCommerce-Retail_Hero.png`,
    category: 'industry_visual',
    useCases: ['retail', 'ecommerce'],
    worksOn: ['light', 'dark'],
    colorScheme: 'teal',
    description: 'Retail ecommerce hero'
  },
  {
    id: 'hero-restaurants',
    filename: 'Industry_Restaurants_Hero.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Industry_Hero/V1/Industry_Restaurants_Hero.png`,
    category: 'industry_visual',
    useCases: ['restaurants', 'food'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Restaurants hero'
  },
  {
    id: 'hero-automotive',
    filename: 'industry_automotive_hero.png',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/industry/hero/industry_automotive_hero.png`,
    category: 'industry_visual',
    useCases: ['automotive', 'insurance'],
    worksOn: ['dark'],
    colorScheme: 'neutral',
    description: 'Automotive hero'
  },
  {
    id: 'hero-finance-adgen',
    filename: 'industry_finance_hero.png',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/industry/hero/industry_finance_hero.png`,
    category: 'industry_visual',
    useCases: ['fintech', 'finance'],
    worksOn: ['dark'],
    colorScheme: 'neutral',
    description: 'Finance hero alternate'
  },

  // ─── Healthcare Social Assets (with chat bubbles) ─────────────────────────
  {
    id: 'healthcare-appointment',
    filename: 'Industry_Healthcare_Appointment-Schedule@2x.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Healthcare/Industry_Healthcare_Appointment-Schedule@2x.png`,
    category: 'composed_visual',
    useCases: ['healthcare', 'appointments'],
    worksOn: ['light'],
    colorScheme: 'teal',
    description: 'Healthcare appointment scheduling with chat'
  },
  {
    id: 'healthcare-lab',
    filename: 'Industry_Healthcare_Lab-Results@2x.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Healthcare/Industry_Healthcare_Lab-Results@2x.png`,
    category: 'composed_visual',
    useCases: ['healthcare'],
    worksOn: ['light'],
    colorScheme: 'teal',
    description: 'Healthcare lab results'
  },
  {
    id: 'healthcare-prescriptions',
    filename: 'Industry_Healthcare_Perscriptions@2x.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Healthcare/Industry_Healthcare_Perscriptions@2x.png`,
    category: 'composed_visual',
    useCases: ['healthcare'],
    worksOn: ['light'],
    colorScheme: 'teal',
    description: 'Healthcare prescriptions'
  },
  {
    id: 'healthcare-triage',
    filename: 'Industry_Healthcare_Symptom-Triage@2x.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Healthcare/Industry_Healthcare_Symptom-Triage@2x.png`,
    category: 'composed_visual',
    useCases: ['healthcare'],
    worksOn: ['light'],
    colorScheme: 'teal',
    description: 'Healthcare symptom triage'
  },

  // ─── Restaurant Social Assets ─────────────────────────────────────────────
  {
    id: 'restaurant-reorder',
    filename: 'Industry_Restaurants_Reorder@2x.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Restaurants/Industry_Restaurants_Reorder@2x.png`,
    category: 'composed_visual',
    useCases: ['restaurants', 'food'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Restaurant reorder scenario'
  },
  {
    id: 'restaurant-reservations',
    filename: 'Industry_Restaurants_Reservations@2x.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Restaurants/Industry_Restaurants_Reservations@2x.png`,
    category: 'composed_visual',
    useCases: ['restaurants', 'reservations'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Restaurant reservations'
  },
  {
    id: 'restaurant-order',
    filename: 'Industry_Restaurants_Order-Assistant@2x.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Restaurants/Industry_Restaurants_Order-Assistant@2x.png`,
    category: 'composed_visual',
    useCases: ['restaurants', 'ordering'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Restaurant order assistant'
  },
  {
    id: 'restaurant-waitlist',
    filename: 'Industry_Restaurants_Waitlist@2x.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Restaurants/Industry_Restaurants_Waitlist@2x.png`,
    category: 'composed_visual',
    useCases: ['restaurants'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Restaurant waitlist'
  },

  // ─── Travel Social Assets ─────────────────────────────────────────────────
  {
    id: 'travel-concierge',
    filename: 'Industry_Travel_Concierge.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Travel/Industry_Travel_Concierge.png`,
    category: 'composed_visual',
    useCases: ['travel', 'hospitality'],
    worksOn: ['light'],
    colorScheme: 'warm',
    description: 'Travel concierge'
  },
  {
    id: 'travel-loyalty',
    filename: 'Industry_Travel_Loyalty-Program@2x.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Travel/Industry_Travel_Loyalty-Program@2x.png`,
    category: 'composed_visual',
    useCases: ['travel', 'loyalty'],
    worksOn: ['light'],
    colorScheme: 'warm',
    description: 'Travel loyalty program'
  },
  {
    id: 'travel-itinerary',
    filename: 'Industry_Travel_Itinerary-Updates@2x.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Travel/Industry_Travel_Itinerary-Updates@2x.png`,
    category: 'composed_visual',
    useCases: ['travel'],
    worksOn: ['light'],
    colorScheme: 'warm',
    description: 'Travel itinerary updates'
  },

  // ─── Insurance & Retail Social Assets ─────────────────────────────────────
  {
    id: 'insurance-policy',
    filename: 'Industry_Insurance_Policy@2x.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Insurance/Industry_Insurance_Policy@2x.png`,
    category: 'composed_visual',
    useCases: ['insurance'],
    worksOn: ['light'],
    colorScheme: 'teal',
    description: 'Insurance policy'
  },
  {
    id: 'retail-returns',
    filename: 'Industry_Retail_Returns.png',
    path: `${ASSET_LIBRARY}/Industry_Visuals/Social_Assets/Retail/Industry_Retail_Returns.png`,
    category: 'composed_visual',
    useCases: ['retail', 'ecommerce'],
    worksOn: ['light'],
    colorScheme: 'teal',
    description: 'Retail returns'
  },

  // ─── Voice AI Feature Visuals ─────────────────────────────────────────────
  {
    id: 'feature-multi-agent',
    filename: 'voice-ai-features-multi-agent-handoffs.png',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/features/voice-ai/voice-ai-features-multi-agent-handoffs.png`,
    category: 'feature_visual',
    useCases: ['voice-ai', 'ai-agents', 'enterprise'],
    worksOn: ['light'],
    colorScheme: 'pink',
    description: 'Multi-agent handoffs with pink/purple gradient'
  },
  {
    id: 'feature-voice-playground',
    filename: 'voice-ai-features-voice-playground-language.png',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/features/voice-ai/voice-ai-features-voice-playground-language.png`,
    category: 'feature_visual',
    useCases: ['voice-ai', 'multilingual'],
    worksOn: ['light'],
    colorScheme: 'purple',
    description: 'Voice playground language'
  },

  // ─── Voice API Feature Visuals ────────────────────────────────────────────
  {
    id: 'feature-media-streaming',
    filename: 'voice-api-feature-real-time-media-streaming.png',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/features/voice-api/voice-api-feature-real-time-media-streaming.png`,
    category: 'feature_visual',
    useCases: ['voice-api', 'streaming'],
    worksOn: ['dark'],
    colorScheme: 'teal',
    description: 'Real-time media streaming'
  },
  {
    id: 'feature-hd-voice',
    filename: 'voice-api-feature-hd-voice.png',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/features/voice-api/voice-api-feature-hd-voice.png`,
    category: 'feature_visual',
    useCases: ['voice-api', 'quality'],
    worksOn: ['dark'],
    colorScheme: 'teal',
    description: 'HD voice quality'
  },
  {
    id: 'feature-call-recording',
    filename: 'voice-api-feature-call-recording.png',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/features/voice-api/voice-api-feature-call-recording.png`,
    category: 'feature_visual',
    useCases: ['voice-api', 'recording'],
    worksOn: ['dark'],
    colorScheme: 'teal',
    description: 'Call recording'
  },

  // ─── Industry Use Cases (AdGen Library) ───────────────────────────────────
  {
    id: 'usecase-travel-booking',
    filename: 'industry-usecases-travel-hospitality-booking-management.png',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/industry/use-cases/travel-hospitality/industry-usecases-travel-hospitality-booking-management.png`,
    category: 'composed_visual',
    useCases: ['travel', 'hospitality'],
    worksOn: ['light'],
    colorScheme: 'warm',
    description: 'Travel booking management'
  },
  {
    id: 'usecase-travel-modify',
    filename: 'industry-usecases-travel-hospitality-modify-booking.png',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/industry/use-cases/travel-hospitality/industry-usecases-travel-hospitality-modify-booking.png`,
    category: 'composed_visual',
    useCases: ['travel', 'hospitality'],
    worksOn: ['light'],
    colorScheme: 'warm',
    description: 'Modify booking'
  },

  // ─── Stock Photos: Restaurants ────────────────────────────────────────────
  {
    id: 'photo-restaurant-waiter',
    filename: 'industry-restaurants-photography-people-dining-waiter.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/restaurants/industry-restaurants-photography-people-dining-waiter.jpg`,
    category: 'stock_photo',
    useCases: ['restaurants', 'dining'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'People dining with waiter'
  },
  {
    id: 'photo-restaurant-takeout',
    filename: 'industry-restaurants-photography-people-food-takeout-home.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/restaurants/industry-restaurants-photography-people-food-takeout-home.jpg`,
    category: 'stock_photo',
    useCases: ['restaurants', 'takeout'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Food takeout at home'
  },
  {
    id: 'photo-restaurant-bar',
    filename: 'industry-restaurants-photography-bar-cafe-food-drinks-dine-outside-people.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/restaurants/industry-restaurants-photography-bar-cafe-food-drinks-dine-outside-people.jpg`,
    category: 'stock_photo',
    useCases: ['restaurants', 'bar'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Bar cafe outdoor dining'
  },
  {
    id: 'photo-restaurant-coffee',
    filename: 'industry-restaurants-photography-couple-coffee-cafe-outside.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/restaurants/industry-restaurants-photography-couple-coffee-cafe-outside.jpg`,
    category: 'stock_photo',
    useCases: ['restaurants', 'cafe'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Couple at coffee shop'
  },
  {
    id: 'photo-restaurant-dining-table',
    filename: 'industry-restaurants-photography-dining-table-eat.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/restaurants/industry-restaurants-photography-dining-table-eat.jpg`,
    category: 'stock_photo',
    useCases: ['restaurants', 'dining'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Dining table scene'
  },

  // ─── Stock Photos: Insurance ──────────────────────────────────────────────
  {
    id: 'photo-insurance-phone',
    filename: 'industry-insurance-photography-male-phone-car-breakdown.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/insurance/industry-insurance-photography-male-phone-car-breakdown.jpg`,
    category: 'stock_photo',
    useCases: ['insurance', 'automotive'],
    worksOn: ['light', 'dark'],
    colorScheme: 'neutral',
    description: 'Man on phone car breakdown'
  },
  {
    id: 'photo-insurance-car',
    filename: 'industry-insurance-photography-car-driveway.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/insurance/industry-insurance-photography-car-driveway.jpg`,
    category: 'stock_photo',
    useCases: ['insurance', 'automotive'],
    worksOn: ['light', 'dark'],
    colorScheme: 'neutral',
    description: 'Car in driveway'
  },
  {
    id: 'photo-insurance-family',
    filename: 'industry-insurance-photography-family-child-home-couch.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/insurance/industry-insurance-photography-family-child-home-couch.jpg`,
    category: 'stock_photo',
    useCases: ['insurance', 'home'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Family at home'
  },
  {
    id: 'photo-insurance-tow',
    filename: 'industry-insurance-photography-car-tow-truck-accident.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/insurance/industry-insurance-photography-car-tow-truck-accident.jpg`,
    category: 'stock_photo',
    useCases: ['insurance', 'automotive'],
    worksOn: ['dark'],
    colorScheme: 'neutral',
    description: 'Tow truck car accident'
  },

  // ─── Stock Photos: Logistics ──────────────────────────────────────────────
  {
    id: 'photo-logistics-airplane',
    filename: 'industry-logistics-photography-airplane-airport-landscape.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/logistics/industry-logistics-photography-airplane-airport-landscape.jpg`,
    category: 'stock_photo',
    useCases: ['logistics', 'shipping'],
    worksOn: ['light', 'dark'],
    colorScheme: 'neutral',
    description: 'Airplane at airport'
  },
  {
    id: 'photo-logistics-taxi',
    filename: 'industry-logistics-photography-taxi-street-meter.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/logistics/industry-logistics-photography-taxi-street-meter.jpg`,
    category: 'stock_photo',
    useCases: ['logistics', 'transportation'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Taxi on street'
  },
  {
    id: 'photo-logistics-delivery',
    filename: 'industry-logistics-photography-man-delivery-boxes-street.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/logistics/industry-logistics-photography-man-delivery-boxes-street.jpg`,
    category: 'stock_photo',
    useCases: ['logistics', 'delivery'],
    worksOn: ['light', 'dark'],
    colorScheme: 'neutral',
    description: 'Delivery man with boxes'
  },

  // ─── Stock Photos: Travel ─────────────────────────────────────────────────
  {
    id: 'photo-travel-landscape',
    filename: 'industry-travel-photography-holiday-landscape.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/travel/industry-travel-photography-holiday-landscape.jpg`,
    category: 'stock_photo',
    useCases: ['travel', 'hospitality'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Holiday landscape'
  },
  {
    id: 'photo-travel-train',
    filename: 'industry-travel-photography-people-train-passports-bags.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/industry/travel/industry-travel-photography-people-train-passports-bags.jpg`,
    category: 'stock_photo',
    useCases: ['travel'],
    worksOn: ['light', 'dark'],
    colorScheme: 'neutral',
    description: 'People on train with bags'
  },

  // ─── Stock Photos: People + Devices ───────────────────────────────────────
  {
    id: 'photo-people-cafe-phone',
    filename: 'photography-people-devices-people-cafe-phone-table.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/people-devices/photography-people-devices-people-cafe-phone-table.jpg`,
    category: 'stock_photo',
    useCases: ['general', 'voice-ai'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'People at cafe with phone'
  },
  {
    id: 'photo-people-cafe-call',
    filename: 'photography-people-devices-people-cafe-coffee-phone-call.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/people-devices/photography-people-devices-people-cafe-coffee-phone-call.jpg`,
    category: 'stock_photo',
    useCases: ['general', 'voice-ai'],
    worksOn: ['light', 'dark'],
    colorScheme: 'warm',
    description: 'Person on phone call at cafe'
  },
  {
    id: 'photo-business-text',
    filename: 'photography-people-devices-man-suit-work-phone-text.jpg',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/photography/people-devices/photography-people-devices-man-suit-work-phone-text.jpg`,
    category: 'stock_photo',
    useCases: ['enterprise', 'fintech', 'general'],
    worksOn: ['light', 'dark'],
    colorScheme: 'neutral',
    description: 'Business man texting'
  },

  // ─── Backgrounds ──────────────────────────────────────────────────────────
  {
    id: 'bg-voice-ai',
    filename: 'background_voice-ai-agent-6.png',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/backgrounds/voice-ai/background_voice-ai-agent-6.png`,
    category: 'background',
    useCases: ['voice-ai'],
    worksOn: ['dark'],
    colorScheme: 'teal',
    description: 'Voice AI agent background'
  },
  {
    id: 'bg-rcs-gradient',
    filename: 'gradient_rcs-1.png',
    path: `${ASSET_LIBRARY}/_NEW_AdGen_Library/backgrounds/rcs/gradient_rcs-1.png`,
    category: 'background',
    useCases: ['rcs', 'messaging', 'general'],
    worksOn: ['dark'],
    colorScheme: 'teal',
    description: 'RCS gradient background'
  },

  // ─── 3D Icons: AI ─────────────────────────────────────────────────────────
  {
    id: 'icon-ai-star',
    filename: 'AI00050.png',
    path: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/00_AI/AI00050.png`,
    category: 'icon_3d',
    useCases: ['voice-ai', 'ai-agents'],
    worksOn: ['dark'],
    colorScheme: 'teal',
    description: '4-point star gradient icon'
  },
  {
    id: 'icon-ai-2',
    filename: 'AI00075.png',
    path: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/00_AI/AI00075.png`,
    category: 'icon_3d',
    useCases: ['voice-ai', 'ai-agents', 'general'],
    worksOn: ['dark'],
    colorScheme: 'teal',
    description: 'AI gradient icon variant'
  },

  // ─── 3D Icons: Voice AI Agent ─────────────────────────────────────────────
  {
    id: 'icon-voice-ai',
    filename: 'Voice ai_00033.png',
    path: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/01_Voice-AI-Agent/Voice ai_00033.png`,
    category: 'icon_3d',
    useCases: ['voice-ai', 'ai-agents'],
    worksOn: ['dark'],
    colorScheme: 'teal',
    description: 'Voice AI blob icon'
  },
  {
    id: 'icon-voice-ai-2',
    filename: 'Voice ai_00116.png',
    path: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/01_Voice-AI-Agent/Voice ai_00116.png`,
    category: 'icon_3d',
    useCases: ['voice-ai', 'ai-agents'],
    worksOn: ['dark'],
    colorScheme: 'purple',
    description: 'Voice AI icon variant'
  },

  // ─── 3D Icons: Voice API ──────────────────────────────────────────────────
  {
    id: 'icon-voice-api',
    filename: 'voiceAPI_00063.png',
    path: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/02_Voice-API/voiceAPI_00063.png`,
    category: 'icon_3d',
    useCases: ['voice-api', 'telephony'],
    worksOn: ['dark'],
    colorScheme: 'teal',
    description: 'Voice API icon'
  },

  // ─── 3D Icons: eSIM ───────────────────────────────────────────────────────
  {
    id: 'icon-esim',
    filename: 'eSim_00033.png',
    path: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/03_eSIM/eSim_00033.png`,
    category: 'icon_3d',
    useCases: ['esim', 'mobile', 'iot'],
    worksOn: ['dark'],
    colorScheme: 'purple',
    description: 'eSIM icon'
  },

  // ─── 3D Icons: RCS ────────────────────────────────────────────────────────
  {
    id: 'icon-rcs',
    filename: 'RCS_00045.png',
    path: `${BRAND_ASSETS}/telnyx-assets/_NEW_Collection_Product-Icons/_NEW_Product-Icon-Static/Icon_Colorful_Static/04_RCS/RCS_00045.png`,
    category: 'icon_3d',
    useCases: ['rcs', 'messaging'],
    worksOn: ['dark'],
    colorScheme: 'purple',
    description: 'RCS messaging icon'
  },
];

// ─── Asset Selection Functions ──────────────────────────────────────────────

export function getAssetsByUseCase(useCase: string): Asset[] {
  return ASSETS.filter(a => a.useCases.includes(useCase) || a.useCases.includes('general'));
}

export function getAssetsByCategory(category: Asset['category']): Asset[] {
  return ASSETS.filter(a => a.category === category);
}

export function getAssetsForBackground(bg: 'light' | 'dark'): Asset[] {
  return ASSETS.filter(a => a.worksOn.includes(bg));
}

export function getAssetsByColorScheme(scheme: Asset['colorScheme']): Asset[] {
  return ASSETS.filter(a => a.colorScheme === scheme);
}

export function selectAsset(options: {
  useCase?: string;
  category?: Asset['category'];
  background?: 'light' | 'dark';
  colorScheme?: Asset['colorScheme'];
  excludeIds?: string[];
}): Asset | null {
  let candidates = [...ASSETS];

  if (options.useCase) {
    candidates = candidates.filter(a =>
      a.useCases.includes(options.useCase!) || a.useCases.includes('general')
    );
  }

  if (options.category) {
    candidates = candidates.filter(a => a.category === options.category);
  }

  if (options.background) {
    candidates = candidates.filter(a => a.worksOn.includes(options.background!));
  }

  if (options.colorScheme) {
    candidates = candidates.filter(a => a.colorScheme === options.colorScheme);
  }

  if (options.excludeIds?.length) {
    candidates = candidates.filter(a => !options.excludeIds!.includes(a.id));
  }

  if (candidates.length === 0) return null;

  // Return random selection from candidates
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function selectMultipleAssets(options: {
  useCase?: string;
  category?: Asset['category'];
  background?: 'light' | 'dark';
  colorScheme?: Asset['colorScheme'];
  count: number;
}): Asset[] {
  const selected: Asset[] = [];
  const excludeIds: string[] = [];

  for (let i = 0; i < options.count; i++) {
    const asset = selectAsset({ ...options, excludeIds });
    if (asset) {
      selected.push(asset);
      excludeIds.push(asset.id);
    }
  }

  return selected;
}

// ─── Industry-specific chat messages ────────────────────────────────────────

export const CHAT_MESSAGES: Record<string, { ai: string; user?: string }[]> = {
  'healthcare': [
    { ai: 'You have an appointment scheduled for next Thursday at 3:00 PM. Would you like to confirm or reschedule?', user: 'Confirm please' },
    { ai: 'Your prescription refill is ready for pickup at CVS Pharmacy.', user: 'Thanks!' },
    { ai: 'Based on your symptoms, I recommend scheduling a visit with Dr. Smith.' },
  ],
  'restaurants': [
    { ai: 'Table for 2 is ready! Would you like your usual order?', user: 'Yes, the usual' },
    { ai: 'Your order will be ready in 15 minutes. Would you like to add anything?', user: 'Add a side of fries' },
    { ai: 'Your reservation for Friday at 7 PM is confirmed!' },
  ],
  'fintech': [
    { ai: 'Great, you\'re all set! Your card is ready to use', user: 'That\'s awesome, thank you' },
    { ai: 'Your transfer of $500 to John has been completed.', user: 'Perfect' },
    { ai: 'Fraud alert: We noticed an unusual transaction. Was this you?' },
  ],
  'travel': [
    { ai: 'Your flight to Paris has been rebooked. New departure: 2:30 PM', user: 'Thank you!' },
    { ai: 'Your hotel check-in is ready. Room 412 on the 4th floor.' },
    { ai: 'Would you like to add travel insurance to your booking?' },
  ],
  'insurance': [
    { ai: 'Your claim #45892 has been approved. Payout will arrive in 2-3 business days.', user: 'Great news!' },
    { ai: 'I\'ve dispatched a tow truck to your location. ETA: 20 minutes.' },
    { ai: 'Your policy renewal is due in 15 days. Would you like to review your coverage?' },
  ],
  'logistics': [
    { ai: 'Your package is out for delivery. Expected arrival: 2-4 PM', user: 'Thanks for the update' },
    { ai: 'Driver pickup confirmed at warehouse B. ETA: 30 minutes.' },
    { ai: 'Shipment #7823 has cleared customs and is en route.' },
  ],
  'retail': [
    { ai: 'Your return has been processed. Refund will appear in 3-5 business days.', user: 'Thank you!' },
    { ai: 'The item you were watching is back in stock! Would you like to order?', user: 'Yes please' },
    { ai: 'Your order has shipped! Track it here: [link]' },
  ],
  'enterprise': [
    { ai: 'I\'ve scheduled the team meeting for Tuesday at 10 AM. Sending invites now.' },
    { ai: 'Your IT ticket #4521 has been resolved. Please confirm closure.', user: 'Confirmed, thanks' },
    { ai: 'The quarterly report is ready for your review.' },
  ],
  'voice-ai': [
    { ai: 'Connecting you to a specialist now. Please hold.', user: 'Thank you' },
    { ai: 'I\'ve found 3 options that match your criteria. Which would you like to explore?' },
    { ai: 'Your account has been updated successfully.' },
  ],
};
