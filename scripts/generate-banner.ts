#!/usr/bin/env ts-node
/**
 * Dynamic Banner Generator CLI
 *
 * Usage:
 *   npm run banner -- --campaign "Voice AI" --industry voice-ai --headline "Build Voice AI in minutes"
 *   npm run banner -- --campaign "Voice AI" --headline "Build AI" --format linkedin
 *   npm run banner -- --campaign "Voice AI" --headline "Build AI" --color purple
 *   npm run banner -- --campaign "Voice AI" --headline "Build AI" --all
 *   npm run banner -- --campaign "Voice AI" --headline "Build AI" --all-formats
 *   npm run banner -- --brief briefs/fintech-q1.json
 *
 * Options:
 *   --format square|linkedin      Output format (default: square 1080x1080)
 *   --template composed|photo-chat|gradient|feature|minimal
 *   --color teal|purple|pink|warm|neutral
 *   --all                         Generate all template variations
 *   --all-formats                 Generate all templates in both square and LinkedIn
 *
 * Industries: voice-ai, fintech, healthcare, restaurants, travel, retail, insurance, logistics, enterprise
 */

import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import { generateBanner, generateBannerSet, generateAllFormats, BannerBrief } from './lib/banner-generator';

// ─── CLI Parsing ────────────────────────────────────────────────────────────

function parseArgs(): Partial<BannerBrief> & { briefFile?: string; all?: boolean; allFormats?: boolean } {
  const args = process.argv.slice(2);
  const result: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      result[key] = value;
      if (value !== true) i++;
    }
  }

  return {
    campaign: result.campaign as string,
    industry: result.industry as BannerBrief['industry'],
    headline: result.headline as string,
    highlightWords: result.highlight ? (result.highlight as string).split(',') : undefined,
    subtext: result.subtext as string,
    cta: result.cta as string,
    style: result.style as BannerBrief['style'],
    template: result.template as BannerBrief['template'],
    colorScheme: result.color as BannerBrief['colorScheme'],
    format: result.format as BannerBrief['format'],
    briefFile: result.brief as string,
    all: result.all === true || result.all === 'true',
    allFormats: result['all-formats'] === true || result['all-formats'] === 'true',
  };
}

// ─── Sample Briefs ──────────────────────────────────────────────────────────

const SAMPLE_BRIEFS: BannerBrief[] = [
  {
    campaign: 'Voice AI Platform',
    industry: 'voice-ai',
    headline: 'Build Voice AI agents in minutes',
    highlightWords: ['Voice AI'],
    subtext: 'From prototype to production on one platform.',
    cta: 'Start Free',
    colorScheme: 'teal',
  },
  {
    campaign: 'Fintech Solutions',
    industry: 'fintech',
    headline: 'Voice AI for regulated fintech flows',
    highlightWords: ['Voice AI'],
    subtext: 'Secure, compliant, production-ready.',
    cta: 'See Demo',
    colorScheme: 'teal',
  },
  {
    campaign: 'Healthcare AI',
    industry: 'healthcare',
    headline: 'AI-powered patient engagement',
    highlightWords: ['AI-powered'],
    subtext: 'Appointment scheduling, reminders, and more.',
    cta: 'Learn More',
    colorScheme: 'teal',
  },
  {
    campaign: 'Restaurant AI',
    industry: 'restaurants',
    headline: 'Never miss a reservation again',
    highlightWords: ['Never miss'],
    subtext: 'AI answers calls 24/7 for your restaurant.',
    cta: 'Learn More',
    colorScheme: 'warm',
  },
  {
    campaign: 'Travel Hospitality',
    industry: 'travel',
    headline: 'Elevate guest experiences with AI',
    highlightWords: ['Elevate'],
    subtext: 'Bookings, concierge, and itinerary updates.',
    cta: 'Get Started',
    colorScheme: 'warm',
  },
  {
    campaign: 'Retail Commerce',
    industry: 'retail',
    headline: 'AI that drives retail conversions',
    highlightWords: ['drives'],
    subtext: 'Order support, returns, and recommendations.',
    cta: 'See Demo',
    colorScheme: 'purple',
  },
  {
    campaign: 'Insurance Support',
    industry: 'insurance',
    headline: 'Claims support that customers love',
    highlightWords: ['love'],
    subtext: 'Fast, accurate, 24/7 AI support.',
    cta: 'Learn More',
    colorScheme: 'neutral',
  },
  {
    campaign: 'Enterprise Platform',
    industry: 'enterprise',
    headline: 'Enterprise-grade Voice AI infrastructure',
    highlightWords: ['Enterprise-grade'],
    subtext: '99.99% uptime. Global scale.',
    cta: 'Contact Sales',
    colorScheme: 'purple',
  },
];

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎨 Dynamic Banner Generator\n');

  const args = parseArgs();

  // Create output directory
  const outputDir = path.join(process.cwd(), 'output', 'creatives', `banners-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  let briefs: BannerBrief[] = [];

  // Load brief from file
  if (args.briefFile) {
    const briefContent = await fs.readFile(args.briefFile, 'utf-8');
    briefs = [JSON.parse(briefContent)];
  }
  // Build brief from CLI args
  else if (args.campaign && args.headline) {
    briefs = [{
      campaign: args.campaign,
      industry: args.industry || 'general',
      headline: args.headline,
      highlightWords: args.highlightWords,
      subtext: args.subtext,
      cta: args.cta,
      style: args.style,
      template: args.template,
      colorScheme: args.colorScheme,
      format: args.format,
    }];
  }
  // Use sample briefs
  else {
    console.log('   No brief provided, generating samples for all industries...\n');
    briefs = SAMPLE_BRIEFS;
  }

  // Generate banners
  for (const brief of briefs) {
    console.log(`📋 ${brief.campaign} (${brief.industry})`);

    if (args.allFormats) {
      // Generate all templates in both square and LinkedIn formats
      console.log('   Generating Square (1080x1080) + LinkedIn (1200x627)...');
      await generateAllFormats(brief, outputDir);
    } else if (args.all) {
      // Generate all template variations for current format
      await generateBannerSet(brief, outputDir);
    } else {
      // Generate single auto-selected banner
      const result = await generateBanner(brief, outputDir);
      console.log(`   ✓ ${path.basename(result.path)} [${result.template}]`);
    }

    console.log('');
  }

  console.log(`✅ Output: ${outputDir}\n`);

  // Open folder
  const { exec } = await import('child_process');
  exec(`open "${outputDir}"`);
}

main().catch(console.error);
