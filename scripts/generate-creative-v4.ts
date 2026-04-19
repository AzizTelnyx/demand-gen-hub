#!/usr/bin/env ts-node
/**
 * Creative Generator V4 - Clean Telnyx Style
 *
 * Matches actual Telnyx reference banners:
 * - Clean layouts with no overlapping assets
 * - Data visualizations as the visual element
 * - Clear 50/50 split
 * - Green accents
 *
 * Usage:
 *   npm run generate-creative-v4 -- --prompt="Your brief"
 */

import dotenv from 'dotenv';
dotenv.config();

import { createCompletion } from '../src/lib/ai-client';
import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

import { getTypography } from '../src/lib/typography';
import { selectLogo } from '../src/lib/logo-selector';

import {
  TEMPLATES_V4,
  TemplateData,
  TemplateAssets,
  MetricCard,
  ComparisonSection,
  StepItem,
} from './templates-v4';

/* ─── Platform Sizes ─────────────────────────────────────────────────────────── */

const PLATFORM_SIZES: Record<string, { width: number; height: number; label: string }[]> = {
  linkedin: [
    { width: 1200, height: 627, label: '1200x627' },
    { width: 1200, height: 1200, label: '1200x1200' },
    { width: 628, height: 1200, label: '628x1200' },
  ],
};

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface ParsedBrief {
  platform: string;
  audience: string;
  coreMessage: string;
  templateType: 'metrics' | 'comparison' | 'migration' | 'steps' | 'statsGrid';
}

interface GeneratedCopy {
  headline: string;
  greenWords: string[];
  description: string;
  ctaLabel: string;
}

/* ─── Presets ────────────────────────────────────────────────────────────────── */

const METRICS_PRESETS: MetricCard[] = [
  { value: '<500ms', label: 'Response latency', sublabel: 'Telnyx Voice AI', isHighlight: true },
  { value: '1.5-3s', label: 'Typical multi-vendor stack', sublabel: 'Twilio + ElevenLabs + STT', isNegative: true },
  { value: 'Full stack', label: 'Infrastructure', sublabel: 'Network → Telephony → GPUs', isHighlight: true },
  { value: '30+', label: 'Global PoPs', sublabel: 'Co-located with edge GPUs' },
];

const COMPARISON_BAD: ComparisonSection = {
  header: 'Multi-vendor stack',
  isGood: false,
  items: [
    'SIP provider + STT vendor + TTS vendor',
    '3-5 carrier hops per call',
    '4 dashboards to debug one failed call',
    'Surprise bills from 4 vendors',
  ],
};

const COMPARISON_GOOD: ComparisonSection = {
  header: 'Telnyx Voice AI',
  isGood: true,
  items: [
    'One platform: network + telephony + AI',
    'Sub-second latency, one hop',
    'End-to-end call traces in one dashboard',
    'One predictable bill',
  ],
};

const MIGRATION_PRESETS = [
  { from: 'Vapi', to: 'Telnyx Voice AI', method: '1-click' },
  { from: 'ElevenLabs', to: 'Telnyx Voice AI', method: '1-click' },
  { from: 'Retell AI', to: 'Telnyx Voice AI', method: '1-click' },
  { from: 'Any platform', to: 'Telnyx Voice AI', method: 'API import' },
];

const STEPS_PRESETS: StepItem[] = [
  { number: 1, title: 'Build your agent', description: 'No-code UI or API — your choice' },
  { number: 2, title: 'Pick your model', description: 'Open source LLMs or bring your own keys' },
  { number: 3, title: 'Connect telephony', description: 'One-click PSTN integration, global numbers' },
  { number: 4, title: 'Test & launch', description: 'Automated multi-path testing, then go live' },
];

const STATS_PRESETS = [
  { value: '30+', label: 'Countries licensed' },
  { value: '100+', label: 'Markets with local numbers' },
  { value: '70+', label: 'Languages supported' },
  { value: '24/7', label: 'Engineering support' },
];

const FEATURE_BADGES = ['30+ languages', 'Multi-agent handoffs', 'MCP support', 'Tool calling'];
const COMPLIANCE_BADGES = ['HIPAA', 'SOC 2 Type II', 'GDPR', 'PCI-DSS', 'STIR/SHAKEN'];

/* ─── Helper ─────────────────────────────────────────────────────────────────── */

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

/* ─── Brief Parser ───────────────────────────────────────────────────────────── */

async function parseBrief(promptText: string): Promise<ParsedBrief> {
  const lower = promptText.toLowerCase();

  // Detect template type from keywords
  let templateType: ParsedBrief['templateType'] = 'metrics';

  if (lower.includes('migrate') || lower.includes('switch from') || lower.includes('move from')) {
    templateType = 'migration';
  } else if (lower.includes('compare') || lower.includes('vs') || lower.includes('versus') || lower.includes('multi-vendor')) {
    templateType = 'comparison';
  } else if (lower.includes('build') || lower.includes('steps') || lower.includes('how to') || lower.includes('getting started')) {
    templateType = 'steps';
  } else if (lower.includes('compliance') || lower.includes('hipaa') || lower.includes('enterprise') || lower.includes('trust')) {
    templateType = 'statsGrid';
  }

  const parsePrompt = `Parse this creative brief and return JSON:
"${promptText}"

Return:
{
  "platform": "linkedin",
  "audience": "who we're targeting",
  "coreMessage": "main point in 10 words"
}

Return ONLY valid JSON.`;

  const response = await createCompletion({
    messages: [
      { role: 'system', content: 'Return ONLY valid JSON, no markdown.' },
      { role: 'user', content: parsePrompt },
    ],
    maxTokens: 256,
    temperature: 0.3,
  });

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  return {
    ...parsed,
    templateType,
  };
}

/* ─── Copy Generator ─────────────────────────────────────────────────────────── */

async function generateCopy(brief: ParsedBrief): Promise<GeneratedCopy> {
  const templateHints: Record<string, string> = {
    metrics: 'Focus on latency and performance numbers',
    comparison: 'Contrast multi-vendor complexity vs Telnyx simplicity',
    migration: 'Emphasize easy migration and one-click switching',
    steps: 'Focus on how easy it is to build and launch',
    statsGrid: 'Focus on enterprise trust, compliance, global reach',
  };

  const copyPrompt = `Generate ad copy for Telnyx Voice AI.

Brief:
- Audience: ${brief.audience}
- Core message: ${brief.coreMessage}
- Style hint: ${templateHints[brief.templateType]}

Telnyx differentiators:
- Owns its own network (not a reseller)
- Sub-500ms latency (inference co-located with telephony)
- HIPAA/SOC2/PCI compliant
- 140+ countries, 70+ languages
- One platform replaces 4-5 vendors

Rules:
- Headline: 6-10 words, punchy, can break across 2-3 lines
- Include 1-3 words/phrases to highlight in green (numbers, key benefits)
- Green words should be impactful: "<500ms", "in minutes", "one click", etc.
- Sound like an engineer, not a marketer

Return JSON:
{
  "headline": "Your voice AI demo works.\\nProduction won't.",
  "greenWords": ["Production won't."],
  "description": "Brief description in 2 sentences",
  "ctaLabel": "VOICE AI INFRASTRUCTURE"
}`;

  const response = await createCompletion({
    messages: [
      { role: 'system', content: 'Return ONLY valid JSON.' },
      { role: 'user', content: copyPrompt },
    ],
    maxTokens: 512,
    temperature: 0.6,
  });

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

/* ─── HTML Generator ─────────────────────────────────────────────────────────── */

function generateHTML(
  brief: ParsedBrief,
  copy: GeneratedCopy,
  width: number,
  height: number,
  assets: TemplateAssets
): string {
  const typography = getTypography(width, height);

  const data: TemplateData = {
    headline: copy.headline,
    greenWords: copy.greenWords,
    description: copy.description,
    cta: 'Own The Stack',
    label: 'VOICE AI AGENTS',
    ctaLabel: copy.ctaLabel,
  };

  switch (brief.templateType) {
    case 'comparison':
      return TEMPLATES_V4.comparison(data, COMPARISON_BAD, COMPARISON_GOOD, assets, width, height, typography);

    case 'migration':
      return TEMPLATES_V4.migration(data, MIGRATION_PRESETS, assets, width, height, typography);

    case 'steps':
      return TEMPLATES_V4.steps(data, STEPS_PRESETS, FEATURE_BADGES, assets, width, height, typography);

    case 'statsGrid':
      return TEMPLATES_V4.statsGrid(data, STATS_PRESETS, COMPLIANCE_BADGES, assets, width, height, typography);

    case 'metrics':
    default:
      return TEMPLATES_V4.metrics(data, METRICS_PRESETS, assets, width, height, typography);
  }
}

/* ─── PNG Converter ──────────────────────────────────────────────────────────── */

async function convertHTMLtoPNG(html: string, outputPath: string, width: number, height: number): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 300));
    await fs.writeFile(outputPath.replace('.png', '.html'), html);
    await page.screenshot({ path: outputPath, type: 'png', fullPage: false });
  } finally {
    await browser.close();
  }
}

/* ─── Main Generator ─────────────────────────────────────────────────────────── */

async function generateCreative(promptText: string) {
  console.log('\n🎨 Telnyx Creative Generator V4 (Clean Style)\n');
  console.log('━'.repeat(60));

  // Parse brief
  console.log('\n📋 Parsing brief...');
  const brief = await parseBrief(promptText);
  console.log(`   Template: ${brief.templateType}`);
  console.log(`   Audience: ${brief.audience}`);

  // Generate copy
  console.log('\n✍️  Generating copy...');
  const copy = await generateCopy(brief);
  console.log(`   Headline: ${copy.headline.substring(0, 40)}...`);
  console.log(`   Green: ${copy.greenWords.join(', ')}`);

  // Load assets
  console.log('\n🖼️  Loading assets...');
  const logoPath = await selectLogo('#0D1117');
  const logoBase64 = await imageToBase64(logoPath);
  const assets: TemplateAssets = { logoBase64 };
  console.log('   ✓ Logo loaded');

  // Generate sizes
  const sizes = PLATFORM_SIZES.linkedin;
  console.log(`\n📐 Generating ${sizes.length} sizes...`);

  const outputDir = path.join(process.cwd(), 'output', 'creatives', `v4-${brief.templateType}-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  for (const size of sizes) {
    console.log(`   → ${size.label}...`);
    const html = generateHTML(brief, copy, size.width, size.height, assets);
    const outputPath = path.join(outputDir, `${size.label}.png`);
    await convertHTMLtoPNG(html, outputPath, size.width, size.height);
  }

  // Save metadata
  await fs.writeFile(
    path.join(outputDir, 'metadata.json'),
    JSON.stringify({ brief, copy, generatedAt: new Date().toISOString() }, null, 2)
  );

  console.log(`\n✅ Done! Output: ${outputDir}`);
  console.log('━'.repeat(60) + '\n');

  return outputDir;
}

/* ─── CLI ────────────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
Telnyx Creative Generator V4 - Clean Style

Usage:
  npm run generate-creative-v4 -- --prompt="Your brief"

Examples:
  # Metrics (latency cards)
  npm run generate-creative-v4 -- --prompt="Show Voice AI latency for developers"

  # Comparison (two columns)
  npm run generate-creative-v4 -- --prompt="Compare Telnyx vs multi-vendor stack"

  # Migration (switch from competitors)
  npm run generate-creative-v4 -- --prompt="Migrate from Vapi or ElevenLabs"

  # Steps (numbered list)
  npm run generate-creative-v4 -- --prompt="Build voice AI agents in minutes"

  # Stats Grid (compliance)
  npm run generate-creative-v4 -- --prompt="Voice AI for enterprise compliance"
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

  const { exec } = await import('child_process');
  exec(`open "${outputDir}"/*.png`);
}

main().catch(console.error);
