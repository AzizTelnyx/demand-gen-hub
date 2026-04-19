#!/usr/bin/env ts-node
/**
 * Creative Generator V3
 *
 * Matches real Telnyx ad style with:
 * - Dark gradient backgrounds with teal/cyan hints
 * - Green accent words in headlines
 * - Glowing metric cards with subtle borders
 * - Feature badges row
 * - Better visual density
 *
 * Usage:
 *   npm run generate-creative-v3 -- --prompt="Compare Telnyx vs Twilio for developers"
 */

import dotenv from 'dotenv';
dotenv.config();

import { createCompletion } from '../src/lib/ai-client';
import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

import { getTypography, Typography } from '../src/lib/typography';
import { selectPattern, PatternSelection } from '../src/lib/pattern-selector';
import { selectLogo } from '../src/lib/logo-selector';
import { Pillar } from '../src/lib/components';
import { detectProductType, loadProductAssetsAsBase64 } from '../src/lib/product-assets';

import {
  TEMPLATES_V3,
  TemplateData,
  TemplateAssets,
  MetricCard,
  ComparisonItem,
  FeatureBadge,
} from './templates-v3';

/* ─── Platform Sizes ─────────────────────────────────────────────────────────── */

const PLATFORM_SIZES: Record<string, { width: number; height: number; label: string }[]> = {
  linkedin: [
    { width: 1200, height: 627, label: '1200x627' },
    { width: 1200, height: 1200, label: '1200x1200' },
    { width: 628, height: 1200, label: '628x1200' },
  ],
  'stackadapt-native': [
    { width: 1200, height: 628, label: '1200x628' },
    { width: 600, height: 600, label: '600x600' },
  ],
  reddit: [
    { width: 1080, height: 1080, label: '1080x1080' },
    { width: 1920, height: 1080, label: '1920x1080' },
  ],
};

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface ParsedBrief {
  platform: string;
  audience: string;
  painPoints: string[];
  coreMessage: string;
  pillar: Pillar;
  ctaSuggestion: string;
}

interface GeneratedCopy {
  headlines: string[];
  greenWords: string[];
  descriptions: string[];
  cta: string;
  label: string;
}

/* ─── Data Presets ───────────────────────────────────────────────────────────── */

const METRIC_PRESETS: Record<string, MetricCard[]> = {
  latency: [
    { value: '<500ms', label: 'Response latency', sublabel: 'Telnyx Voice AI' },
    { value: '1.5-3s', label: 'Typical multi-vendor stack', highlight: false },
    { value: 'Full stack', label: 'Infrastructure', sublabel: 'Network + Telephony + GPUs' },
    { value: '30+', label: 'Global PoPs', sublabel: 'Co-located with edge GPUs' },
  ],
  trust: [
    { value: '30+', label: 'Countries', sublabel: 'Carrier licensed' },
    { value: '100+', label: 'Markets', sublabel: 'Local numbers' },
    { value: '70+', label: 'Languages', sublabel: 'Supported' },
    { value: '24/7', label: 'Support', sublabel: 'Engineering team' },
  ],
  infrastructure: [
    { value: '1', label: 'Platform', sublabel: 'Replaces 4-5 vendors' },
    { value: 'Own', label: 'Network', sublabel: 'Not a reseller' },
    { value: '140+', label: 'Countries', sublabel: 'Served' },
    { value: '0', label: 'Extra hops', sublabel: 'Direct carrier path' },
  ],
};

const COMPARISON_PRESETS: Record<string, { badHeader: string; goodHeader: string; items: ComparisonItem[] }> = {
  vendor: {
    badHeader: 'Multi-vendor stack',
    goodHeader: 'Telnyx Voice AI',
    items: [
      { bad: 'SIP provider + STT vendor + TTS vendor', good: 'One platform' },
      { bad: '3-5 carrier hops per call', good: 'Sub-second latency, one hop' },
      { bad: '4 dashboards to debug one failed call', good: 'End-to-end call traces in one dashboard' },
      { bad: 'Surprise bills from 4 vendors', good: 'One predictable bill' },
    ],
  },
  migration: {
    badHeader: 'Current provider',
    goodHeader: 'Telnyx Voice AI',
    items: [
      { bad: 'Vapi', good: 'Telnyx Voice AI (1-click)' },
      { bad: 'ElevenLabs', good: 'Telnyx Voice AI (1-click)' },
      { bad: 'Retell AI', good: 'Telnyx Voice AI (1-click)' },
      { bad: 'Any platform', good: 'Telnyx Voice AI (API import)' },
    ],
  },
};

const STEPS_PRESETS = {
  build: [
    { title: 'Build your agent', description: 'No-code UI or API — your choice' },
    { title: 'Pick your model', description: 'Open source LLMs or bring your own keys' },
    { title: 'Connect telephony', description: 'One-click PSTN integration, global numbers' },
    { title: 'Test & launch', description: 'Automated multi-path testing, then go live' },
  ],
};

const FEATURE_BADGES: Record<string, FeatureBadge[]> = {
  general: [
    { text: '30+ languages' },
    { text: 'Multi-agent handoffs' },
    { text: 'MCP support' },
    { text: 'Tool calling' },
  ],
  compliance: [
    { text: 'HIPAA' },
    { text: 'SOC 2 Type II' },
    { text: 'GDPR' },
    { text: 'PCI-DSS' },
    { text: 'STIR/SHAKEN' },
  ],
};

/* ─── Helper Functions ────────────────────────────────────────────────────────── */

async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const fullPath = path.join(process.cwd(), imagePath);
    const imageBuffer = await fs.readFile(fullPath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).slice(1);
    return `data:image/${ext};base64,${base64}`;
  } catch {
    console.warn(`   ⚠️  Could not load: ${imagePath}`);
    return '';
  }
}

/* ─── Brief Parser ────────────────────────────────────────────────────────────── */

async function parseBrief(promptText: string): Promise<ParsedBrief> {
  const parsePrompt = `Parse this creative brief:

"${promptText}"

Return JSON with:
- platform: linkedin, stackadapt-native, reddit (default: linkedin)
- audience: who are we targeting
- painPoints: array of problems we're solving
- coreMessage: main point
- pillar: trust, infrastructure, or physics (based on keywords)
- ctaSuggestion: CTA text

Pillar hints:
- trust: HIPAA, compliance, security, SOC2, enterprise
- infrastructure: own network, vendors, platform, stack, integration
- physics: latency, ms, speed, performance, edge

Return ONLY valid JSON.`;

  const response = await createCompletion({
    messages: [
      { role: 'system', content: 'Return ONLY valid JSON, no markdown.' },
      { role: 'user', content: parsePrompt },
    ],
    maxTokens: 512,
    temperature: 0.3,
  });

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

/* ─── Copy Generator ──────────────────────────────────────────────────────────── */

async function generateCopy(brief: ParsedBrief, patternSelection: PatternSelection): Promise<GeneratedCopy> {
  const copyPrompt = `Generate ad copy for Telnyx Voice AI.

Brief:
- Audience: ${brief.audience}
- Pain points: ${brief.painPoints.join(', ')}
- Core message: ${brief.coreMessage}
- Pillar: ${brief.pillar}

Telnyx differentiators:
- Owns its own network (not a reseller)
- Sub-500ms latency (inference co-located with telephony)
- HIPAA/SOC2/PCI compliant
- 140+ countries, 70+ languages
- One platform replaces 4-5 vendors

Rules:
- Headlines should have 1-2 words that can be highlighted in green (numbers, key benefits)
- Be specific with numbers
- Sound like an engineer, not a marketer
- No emojis

Return JSON:
{
  "headlines": ["headline 1", "headline 2", "headline 3"],
  "greenWords": ["<500ms", "one click", "minutes"],
  "descriptions": ["desc 1", "desc 2"],
  "cta": "Own The Stack",
  "label": "VOICE AI AGENTS"
}`;

  const response = await createCompletion({
    messages: [
      { role: 'system', content: 'Return ONLY valid JSON.' },
      { role: 'user', content: copyPrompt },
    ],
    maxTokens: 1024,
    temperature: 0.6,
  });

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

/* ─── Template Selection ──────────────────────────────────────────────────────── */

function selectTemplateType(brief: ParsedBrief, promptText: string): 'metrics' | 'comparison' | 'steps' | 'statsGrid' {
  const lowerText = promptText.toLowerCase();

  // Check for comparison triggers
  if (lowerText.includes('compare') || lowerText.includes('vs') || lowerText.includes('versus') ||
      lowerText.includes('multi-vendor') || lowerText.includes('stack')) {
    return 'comparison';
  }

  // Check for steps/how-to triggers
  if (lowerText.includes('build') || lowerText.includes('steps') || lowerText.includes('how to') ||
      lowerText.includes('minutes') || lowerText.includes('getting started')) {
    return 'steps';
  }

  // Check for trust/compliance triggers
  if (brief.pillar === 'trust' || lowerText.includes('compliance') || lowerText.includes('hipaa') ||
      lowerText.includes('enterprise')) {
    return 'statsGrid';
  }

  // Default to metrics for latency/performance
  return 'metrics';
}

/* ─── HTML Generator ──────────────────────────────────────────────────────────── */

function generateHTML(
  brief: ParsedBrief,
  copy: GeneratedCopy,
  width: number,
  height: number,
  assets: TemplateAssets,
  templateType: 'metrics' | 'comparison' | 'steps' | 'statsGrid',
  promptText: string
): string {
  const typography = getTypography(width, height);

  const templateData: TemplateData = {
    headline: copy.headlines[0],
    greenWords: copy.greenWords,
    description: copy.descriptions[0],
    cta: copy.cta,
    label: copy.label,
    pillar: brief.pillar,
  };

  switch (templateType) {
    case 'comparison': {
      const compType = promptText.toLowerCase().includes('migrate') ? 'migration' : 'vendor';
      return TEMPLATES_V3.comparison(
        templateData,
        COMPARISON_PRESETS[compType],
        assets,
        width,
        height,
        typography
      );
    }

    case 'steps': {
      return TEMPLATES_V3.steps(
        templateData,
        STEPS_PRESETS.build,
        assets,
        width,
        height,
        typography,
        FEATURE_BADGES.general
      );
    }

    case 'statsGrid': {
      return TEMPLATES_V3.statsGrid(
        templateData,
        METRIC_PRESETS.trust,
        FEATURE_BADGES.compliance.map(b => b.text),
        assets,
        width,
        height,
        typography
      );
    }

    case 'metrics':
    default: {
      const metricType = brief.pillar === 'infrastructure' ? 'infrastructure' : 'latency';
      return TEMPLATES_V3.darkModeMetrics(
        templateData,
        METRIC_PRESETS[metricType],
        assets,
        width,
        height,
        typography,
        FEATURE_BADGES.general
      );
    }
  }
}

/* ─── PNG Converter ───────────────────────────────────────────────────────────── */

async function convertHTMLtoPNG(html: string, outputPath: string, width: number, height: number): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    // Use 'load' instead of 'networkidle0' to avoid timeout with large base64 images
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    // Small delay to ensure images render
    await new Promise(resolve => setTimeout(resolve, 500));
    await fs.writeFile(outputPath.replace('.png', '.html'), html);
    await page.screenshot({ path: outputPath, type: 'png', fullPage: false });
  } finally {
    await browser.close();
  }
}

/* ─── Main Generator ──────────────────────────────────────────────────────────── */

async function generateCreative(promptText: string) {
  console.log('\n🎨 Telnyx Creative Generator V3\n');
  console.log('━'.repeat(60));

  // Step 1: Parse brief
  console.log('\n📋 Parsing brief...');
  const brief = await parseBrief(promptText);
  console.log(`   Platform: ${brief.platform || 'linkedin'}`);
  console.log(`   Audience: ${brief.audience}`);
  console.log(`   Pillar: ${brief.pillar}`);

  // Step 2: Select template type
  const templateType = selectTemplateType(brief, promptText);
  console.log(`   Template: ${templateType}`);

  // Step 3: Generate copy
  console.log('\n✍️  Generating copy...');
  const patternSelection = selectPattern({ briefText: promptText, pillar: brief.pillar });
  const copy = await generateCopy(brief, patternSelection);
  console.log(`   Headline: ${copy.headlines[0].substring(0, 50)}...`);
  console.log(`   Green words: ${copy.greenWords.join(', ')}`);
  console.log(`   CTA: ${copy.cta}`);

  // Step 4: Load assets
  console.log('\n🖼️  Loading assets...');
  const logoPath = await selectLogo('#000000'); // Dark background
  const logoBase64 = await imageToBase64(logoPath);

  // Load 3D product icon and pattern background
  const productType = detectProductType(promptText);
  console.log(`   Product type: ${productType}`);
  const productAssets = await loadProductAssetsAsBase64(productType, 'landscape');

  const assets: TemplateAssets = {
    logoBase64,
    productIconBase64: productAssets.iconBase64 || undefined,
    backgroundPatternBase64: productAssets.patternBase64 || undefined,
    iconPosition: productAssets.iconPosition,
    iconScale: productAssets.iconScale,
  };

  console.log(`   ✓ Logo loaded`);
  if (assets.productIconBase64) console.log(`   ✓ Product icon loaded`);
  if (assets.backgroundPatternBase64) console.log(`   ✓ Pattern background loaded`);

  // Step 5: Generate visuals
  const platform = brief.platform || 'linkedin';
  const sizes = PLATFORM_SIZES[platform] || PLATFORM_SIZES.linkedin;

  console.log(`\n📐 Generating ${sizes.length} sizes...`);

  const outputDir = path.join(
    process.cwd(),
    'output',
    'creatives',
    `v3-${templateType}-${Date.now()}`
  );
  await fs.mkdir(outputDir, { recursive: true });

  for (const size of sizes) {
    console.log(`   → ${size.label}...`);

    // Get aspect ratio for this size
    const aspectRatio: 'landscape' | 'square' | 'portrait' =
      size.width > size.height * 1.2 ? 'landscape' :
      size.height > size.width * 1.2 ? 'portrait' : 'square';

    // Update icon position and scale for this aspect ratio
    const sizeAssets = await loadProductAssetsAsBase64(productType, aspectRatio);
    const sizeSpecificAssets: TemplateAssets = {
      ...assets,
      iconPosition: sizeAssets.iconPosition,
      iconScale: sizeAssets.iconScale,
    };

    const html = generateHTML(brief, copy, size.width, size.height, sizeSpecificAssets, templateType, promptText);
    const outputPath = path.join(outputDir, `${size.label}.png`);
    await convertHTMLtoPNG(html, outputPath, size.width, size.height);
  }

  // Step 6: Save metadata
  await fs.writeFile(
    path.join(outputDir, 'metadata.json'),
    JSON.stringify({ brief, copy, templateType, generatedAt: new Date().toISOString() }, null, 2)
  );

  console.log(`\n✅ Done! Output: ${outputDir}`);
  console.log('\n' + '━'.repeat(60) + '\n');

  return outputDir;
}

/* ─── CLI ─────────────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
Telnyx Creative Generator V3 - Matching Real Telnyx Ads

Usage:
  npm run generate-creative-v3 -- --prompt="Your brief"

Examples:
  # Metrics template (latency/performance)
  npm run generate-creative-v3 -- --prompt="Show Voice AI latency advantages for developers"

  # Comparison template (vs competitors)
  npm run generate-creative-v3 -- --prompt="Compare Telnyx vs multi-vendor stack"

  # Steps template (how to build)
  npm run generate-creative-v3 -- --prompt="Build voice AI agents in minutes"

  # Stats grid template (compliance/trust)
  npm run generate-creative-v3 -- --prompt="Voice AI for enterprise compliance teams"
    `);
    process.exit(0);
  }

  const promptArg = args.find(arg => arg.startsWith('--prompt='));

  if (!promptArg) {
    console.error('❌ Provide --prompt="..."');
    process.exit(1);
  }

  const promptText = promptArg.replace('--prompt=', '');
  const outputDir = await generateCreative(promptText);

  // Open the generated images
  const { exec } = await import('child_process');
  exec(`open "${outputDir}"/*.png`);
}

main().catch(console.error);
