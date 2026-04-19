// Creative Asset Generator - Main Handler
// Orchestrates existing templates and asset selection
import path from 'path';
import { promises as fs } from 'fs';
import type { AgentHandler, AgentOutput, AgentInput } from '../types';
import type { CreativeBrief, SizeConfig, PlatformSpec, GeneratedCopy } from './types';
import { parseBrief, generateCopy } from './content-planner';
import { loadAssets, selectTemplate, generateHTML, generateAllBanners } from './renderer';

/* ─── Platform Size Specs ─────────────────────────────── */

const PLATFORM_SIZES: Record<string, PlatformSpec> = {
  linkedin: {
    name: 'LinkedIn Single Image',
    sizes: [
      { width: 1200, height: 627, label: '1200x627' },
      { width: 1200, height: 1200, label: '1200x1200' },
      { width: 628, height: 1200, label: '628x1200' },
    ],
    rules: ['Professional quality', 'Real people over stock', 'Business context'],
  },
  'stackadapt-native': {
    name: 'StackAdapt Native Display',
    sizes: [
      { width: 1200, height: 628, label: '1200x628' },
      { width: 600, height: 600, label: '600x600' },
      { width: 800, height: 600, label: '800x600' },
    ],
    rules: ['Editorial style', 'Blend with publisher content', 'High-quality visuals'],
  },
  'stackadapt-display': {
    name: 'StackAdapt Display Ads',
    sizes: [
      { width: 300, height: 250, label: '300x250' },
      { width: 728, height: 90, label: '728x90' },
      { width: 160, height: 600, label: '160x600' },
      { width: 300, height: 600, label: '300x600' },
      { width: 320, height: 50, label: '320x50' },
    ],
    rules: ['Standard IAB sizes', 'Text overlay allowed', 'CTA recommended'],
  },
  reddit: {
    name: 'Reddit Image Ads',
    sizes: [
      { width: 1080, height: 1350, label: '1080x1350' },
      { width: 1080, height: 1080, label: '1080x1080' },
      { width: 1920, height: 1080, label: '1920x1080' },
    ],
    rules: ['Authentic over polished', 'User-generated style', 'Mobile-first'],
  },
  'google-display': {
    name: 'Google Display Ads',
    sizes: [
      { width: 300, height: 250, label: '300x250' },
      { width: 728, height: 90, label: '728x90' },
      { width: 160, height: 600, label: '160x600' },
      { width: 300, height: 600, label: '300x600' },
      { width: 320, height: 50, label: '320x50' },
    ],
    rules: ['300x250 is best performer', 'High quality, sharp', 'Minimal text overlay'],
  },
};

/* ─── Main Agent Handler ──────────────────────────────── */

export const creativeAssetGenerator: AgentHandler = {
  slug: 'creative-asset-generator',

  async run(input: AgentInput): Promise<AgentOutput> {
    const promptText = input.task || '';
    const ctx = input.context || {};

    if (!promptText) {
      return {
        findings: [{ severity: 'critical', title: 'No prompt provided', detail: 'Provide a creative brief prompt' }],
        recommendations: [],
        summary: 'Failed: No prompt provided',
      };
    }

    console.log('\n🎨 Creative Asset Generator\n');
    console.log('━'.repeat(50));

    // Step 1: Parse brief (or use context if provided)
    console.log('\n📋 Parsing brief...');
    let brief: CreativeBrief;

    if (ctx.brief) {
      // Use pre-parsed brief from context
      brief = ctx.brief as CreativeBrief;
    } else {
      brief = await parseBrief(promptText);
    }

    // Override with context values if provided
    if (ctx.platform) brief.platform = ctx.platform;
    if (ctx.pillar) brief.pillar = ctx.pillar;
    if (ctx.audience) brief.audience = ctx.audience;
    if (ctx.product) brief.product = ctx.product;
    if (ctx.industry) brief.industry = ctx.industry;

    console.log(`   Platform: ${brief.platform}`);
    console.log(`   Audience: ${brief.audience}`);
    console.log(`   Pillar: ${brief.pillar}`);

    // Step 2: Generate copy (or use context if provided)
    console.log('\n✍️  Generating copy...');
    let copy: GeneratedCopy;

    if (ctx.copy) {
      copy = ctx.copy as GeneratedCopy;
    } else {
      copy = await generateCopy(brief);
    }

    console.log(`   ✓ ${copy.headlines.length} headlines`);
    console.log(`   ✓ ${copy.descriptions.length} descriptions`);
    console.log(`   ✓ CTA: ${copy.cta}`);

    // Step 3: Load assets using existing smart selector
    console.log('\n🖼️  Selecting assets...');
    const assets = await loadAssets(brief);

    if (assets.detectedProduct) {
      console.log(`   🎯 Product: ${assets.detectedProduct}`);
    }
    if (assets.detectedIndustry) {
      console.log(`   🏢 Industry: ${assets.detectedIndustry}`);
    }
    if (assets.productScreenshot) {
      console.log(`   📸 Has product screenshot`);
    }
    if (assets.industryPhoto) {
      console.log(`   📷 Has industry photo`);
    }

    // Step 4: Select template
    const templateType = selectTemplate(brief, assets);
    console.log(`\n✨ Template: ${templateType}`);

    // Step 5: Get platform sizes
    const platformSpec = PLATFORM_SIZES[brief.platform] || PLATFORM_SIZES.linkedin;
    const sizes = platformSpec.sizes;

    // Step 6: Generate all banners
    console.log(`\n🎨 Generating ${sizes.length} banners...`);

    const outputDir = path.join(
      process.cwd(),
      'output',
      'creatives',
      ctx.campaignId || `${brief.platform}-${brief.pillar}-${brief.audience.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`
    );

    const generatePng = ctx.generatePng !== false; // Default to true

    const results = await generateAllBanners(brief, copy, assets, sizes, outputDir);

    // Step 7: Save copy.json
    const copyPath = path.join(outputDir, 'copy.json');
    await fs.writeFile(copyPath, JSON.stringify({
      brief,
      copy,
      templateUsed: templateType,
      generatedAt: new Date().toISOString(),
    }, null, 2));

    console.log(`\n✅ Generated ${results.length} banners`);
    console.log(`📁 Output: ${outputDir}`);
    console.log('━'.repeat(50) + '\n');

    // Build artifact
    const artifact = {
      type: 'creative-assets',
      title: `${platformSpec.name} - ${brief.pillar} - ${brief.audience}`,
      content: JSON.stringify({
        brief,
        copy,
        templateUsed: templateType,
        assets: results.map(r => ({
          size: r.size.label,
          width: r.size.width,
          height: r.size.height,
          pngPath: r.pngPath,
        })),
        outputDirectory: outputDir,
      }, null, 2),
    };

    return {
      findings: [
        {
          severity: 'low',
          title: 'Creative assets generated',
          detail: `Generated ${results.length} banners for ${brief.platform} using ${templateType} template`,
        },
      ],
      recommendations: [
        {
          type: 'creative-assets',
          severity: 'medium',
          target: brief.platform,
          action: `Review ${results.length} creative assets`,
          rationale: `Generated for ${brief.audience} targeting ${brief.pillar} messaging`,
          impact: `Ready for ${brief.platform} campaign`,
        },
      ],
      artifacts: [artifact],
      summary: `Generated ${results.length} banners (${sizes.map(s => s.label).join(', ')}) for ${platformSpec.name}. Template: ${templateType}. Pillar: ${brief.pillar}.`,
      suggestedActions: [
        `Open PNGs in: ${outputDir}`,
        'Review copy in copy.json',
        `Upload to ${brief.platform}`,
      ],
    };
  },
};

/* ─── Exports ─────────────────────────────────────────── */

export { PLATFORM_SIZES };
export * from './types';
export * from './content-planner';
export * from './renderer';
