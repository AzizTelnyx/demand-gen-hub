// Creative Asset Generator Types - Simplified

/* ─── Template Types ──────────────────────────────────── */

export type TemplateType =
  | 'voice-ai-product'   // Light bg, product colors, optional screenshot
  | 'industry-abm';      // Split with industry photography

export type ProductType = 'voice-ai' | 'voice-api' | 'sms' | 'messaging' | 'rcs' | 'esim';

export type IndustryType = 'healthcare' | 'finance' | 'retail' | 'travel' | 'insurance' | 'logistics' | 'restaurants';

export type Pillar = 'trust' | 'infrastructure' | 'physics';

/* ─── Size Configuration ──────────────────────────────── */

export interface SizeConfig {
  width: number;
  height: number;
  label: string;
}

/* ─── Creative Brief ──────────────────────────────────── */

export interface CreativeBrief {
  id: string;
  platform: string;
  audience: string;
  painPoints: string[];
  coreMessage: string;
  pillar: Pillar;
  product?: ProductType;
  industry?: IndustryType;
  adCopyExample?: string;
  ctaSuggestion?: string;
}

/* ─── Generated Copy ──────────────────────────────────── */

export interface GeneratedCopy {
  headlines: string[];
  descriptions: string[];
  cta: string;
}

/* ─── Selected Assets ─────────────────────────────────── */

export interface SelectedAssets {
  logoBase64: string;
  backgroundImage?: string;
  productScreenshot?: string;
  industryPhoto?: string;
  detectedProduct?: string;
  detectedIndustry?: string;
}

/* ─── Generated Asset Output ──────────────────────────── */

export interface GeneratedAsset {
  size: SizeConfig;
  html: string;
  pngPath?: string;
  templateUsed: TemplateType;
}

/* ─── Platform Specifications ─────────────────────────── */

export interface PlatformSpec {
  name: string;
  sizes: SizeConfig[];
  rules: string[];
}
