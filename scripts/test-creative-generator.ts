#!/usr/bin/env npx tsx
/**
 * Test script for Creative Asset Generator
 *
 * Usage:
 *   cd ~/.openclaw/workspace/demand-gen-hub
 *   npx tsx scripts/test-creative-generator.ts
 *
 * Options:
 *   --platform    Test specific platform (linkedin, reddit, stackadapt-native, etc.)
 *   --pillar      Test specific pillar (trust, infrastructure, physics)
 *   --prompt      Custom prompt text
 */

import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { creativeAssetGenerator } from '../src/agents/creative-asset-generator';

/* ─── CLI Argument Parsing ────────────────────────────── */

const args = process.argv.slice(2);
const platformArg = args.find(a => a.startsWith('--platform='))?.split('=')[1];
const pillarArg = args.find(a => a.startsWith('--pillar='))?.split('=')[1];
const promptArg = args.find(a => a.startsWith('--prompt='))?.split('=')[1];

/* ─── Test Prompts ────────────────────────────────────── */

const TEST_PROMPTS = {
  healthcare: 'A LinkedIn ad for healthcare IT decision makers. Focus on HIPAA compliance and 24/7 patient access with Voice AI.',
  fintech: 'A LinkedIn ad for fintech companies. Focus on secure voice AI for financial services with SOC 2 compliance.',
  voiceai: 'A LinkedIn ad for developers building voice AI agents. Focus on low latency and co-located inference.',
  migration: 'A LinkedIn ad targeting teams migrating from Vapi or ElevenLabs. Focus on one-click migration.',
  travel: 'A LinkedIn ad for hotels and travel companies. Focus on AI concierge for booking and reservations.',
};

/* ─── Main Test ───────────────────────────────────────── */

async function runTest() {
  console.log('\n🧪 Creative Asset Generator - Test\n');
  console.log('━'.repeat(50));

  const platform = platformArg || 'linkedin';
  const pillar = pillarArg || 'trust';
  const prompt = promptArg || TEST_PROMPTS.healthcare;

  console.log(`\n📋 Test Configuration:`);
  console.log(`   Platform: ${platform}`);
  console.log(`   Pillar: ${pillar}`);
  console.log(`   Prompt: "${prompt.substring(0, 60)}..."`);

  try {
    const result = await creativeAssetGenerator.run({
      task: prompt,
      context: {
        platform,
        pillar,
        generatePng: true,
      },
    });

    console.log(`\n✅ Test Result:`);
    console.log(`   ${result.summary}`);

    if (result.artifacts?.[0]) {
      const artifact = JSON.parse(result.artifacts[0].content);
      console.log(`\n📁 Output Directory:`);
      console.log(`   ${artifact.outputDirectory}`);

      console.log(`\n🖼️  Generated Assets:`);
      for (const asset of artifact.assets) {
        console.log(`   - ${asset.size} (${asset.width}x${asset.height})`);
      }

      console.log(`\n✍️  Copy:`);
      console.log(`   Headline: "${artifact.copy.headlines[0]}"`);
      console.log(`   CTA: "${artifact.copy.cta}"`);

      console.log(`\n✨ Template: ${artifact.templateUsed}`);

      // Open first PNG
      const { exec } = await import('child_process');
      const firstPng = artifact.assets[0]?.pngPath;
      if (firstPng) {
        exec(`open "${firstPng}"`, (err) => {
          if (!err) console.log(`\n👁️  Opened: ${path.basename(firstPng)}`);
        });
      }
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }

  console.log('\n' + '━'.repeat(50) + '\n');
}

/* ─── Run All Test Prompts ────────────────────────────── */

async function runAllTests() {
  console.log('\n🧪 Running All Test Prompts\n');

  for (const [name, prompt] of Object.entries(TEST_PROMPTS)) {
    console.log(`\n━━━ Testing: ${name} ━━━`);

    try {
      const result = await creativeAssetGenerator.run({
        task: prompt,
        context: {
          platform: 'linkedin',
          generatePng: true,
        },
      });

      console.log(`   ✅ ${result.summary}`);
    } catch (error) {
      console.log(`   ❌ Failed: ${error}`);
    }
  }
}

/* ─── Entry Point ─────────────────────────────────────── */

if (args.includes('--all')) {
  runAllTests().catch(console.error);
} else {
  runTest().catch(console.error);
}
