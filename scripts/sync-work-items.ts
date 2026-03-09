#!/usr/bin/env npx tsx
/**
 * Reads recent CampaignChange records from DB and creates work items.
 * Run after sync_changes.py to auto-populate the work tracker.
 * 
 * Usage: npx tsx scripts/sync-work-items.ts [--hours 6]
 */

const BASE = 'http://localhost:3000';

async function main() {
  const hours = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--hours') || '6');
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Fetch recent campaign changes from DB via a simple query
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const changes = await prisma.campaignChange.findMany({
    where: { createdAt: { gte: new Date(since) } },
    orderBy: { createdAt: 'desc' },
  });

  if (changes.length === 0) {
    console.log('No recent campaign changes to track.');
    return;
  }

  // Group by changeType
  const groups: Record<string, any[]> = {};
  for (const c of changes) {
    const key = c.changeType;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }

  let created = 0;

  for (const [changeType, items] of Object.entries(groups)) {
    const typeMap: Record<string, string> = {
      Status: 'optimization',
      Budget: 'optimization',
      'Bid Strategy': 'optimization',
      Objective: 'optimization',
      Bid: 'optimization',
    };

    const platforms = [...new Set(items.map((i: any) => i.platform))];
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const title = items.length === 1
      ? `${items[0].campaignName} — ${changeType} changed`
      : `${items.length} campaign ${changeType.toLowerCase()} changes (${date})`;

    const description = items.map((i: any) =>
      `- ${i.campaignName} (${i.platform}): ${i.description}`
    ).join('\n');

    // Check for existing item with same title
    const existing = await prisma.workItem.findFirst({
      where: { title: { contains: title.slice(0, 30), mode: 'insensitive' } },
    });
    if (existing) {
      console.log(`  Skip (exists): ${title}`);
      continue;
    }

    await prisma.workItem.create({
      data: {
        title,
        type: typeMap[changeType] || 'task',
        status: 'done',
        platform: platforms.length === 1 ? platforms[0] : 'all',
        source: 'sync',
        tags: ['auto-detected', changeType.toLowerCase()],
        updates: {
          create: {
            author: 'sync',
            type: 'note',
            content: description,
          },
        },
      },
    });
    console.log(`  ✓ Created: ${title}`);
    created++;
  }

  console.log(`\nDone. ${created} work items created from ${changes.length} changes.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
