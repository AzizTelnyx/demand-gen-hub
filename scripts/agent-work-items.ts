#!/usr/bin/env npx tsx
/**
 * Creates work items from recent agent runs + recommendations.
 * Run after any agent completes to auto-populate work tracker.
 * 
 * Usage: npx tsx scripts/agent-work-items.ts [--hours 24]
 */

async function main() {
  const hours = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--hours') || '24');
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  // 1. Check for pending recommendations (negative keywords, ad copy, etc.)
  const pendingRecs = await prisma.recommendation.findMany({
    where: {
      status: 'pending',
      createdAt: { gte: since },
    },
    include: { agentRun: { include: { agent: true } } },
  });

  if (pendingRecs.length > 0) {
    // Group by agent
    const byAgent: Record<string, any[]> = {};
    for (const rec of pendingRecs) {
      const name = rec.agentRun?.agent?.name || 'unknown';
      if (!byAgent[name]) byAgent[name] = [];
      byAgent[name].push(rec);
    }

    for (const [agentName, recs] of Object.entries(byAgent)) {
      const title = `Review ${recs.length} pending ${agentName} recommendation${recs.length > 1 ? 's' : ''}`;

      // Dedup
      const existing = await prisma.workItem.findFirst({
        where: {
          title: { contains: `pending ${agentName}`, mode: 'insensitive' },
          status: { not: 'done' },
        },
      });

      if (existing) {
        // Update existing item with new count
        await prisma.workItemUpdate.create({
          data: {
            workItemId: existing.id,
            author: `agent:${agentName}`,
            type: 'note',
            content: `${recs.length} pending items as of ${new Date().toLocaleDateString()}.`,
          },
        });
        await prisma.workItem.update({
          where: { id: existing.id },
          data: { updatedAt: new Date() },
        });
        console.log(`  Updated existing: ${existing.title}`);
        continue;
      }

      const descriptions = recs.slice(0, 10).map((r: any) =>
        `- [${r.severity}] ${r.target}: ${r.action}`
      ).join('\n');

      await prisma.workItem.create({
        data: {
          title,
          type: 'task',
          status: 'upcoming',
          priority: recs.some((r: any) => r.severity === 'critical' || r.severity === 'high') ? 'p0' : 'p1',
          source: 'agent',
          sourceRef: recs[0]?.agentRunId || null,
          tags: ['agent', agentName, 'needs-review'],
          updates: {
            create: {
              author: `agent:${agentName}`,
              type: 'note',
              content: `${recs.length} items need review:\n${descriptions}${recs.length > 10 ? `\n... and ${recs.length - 10} more` : ''}`,
            },
          },
        },
      });
      console.log(`  ✓ Created: ${title}`);
    }
  }

  // 2. Check for recent agent runs with findings
  const recentRuns = await prisma.agentRun.findMany({
    where: {
      startedAt: { gte: since },
      status: 'completed',
    },
    include: { agent: true, recommendations: true },
  });

  for (const run of recentRuns) {
    if (!run.output) continue;

    let output: any;
    try { output = JSON.parse(run.output); } catch { continue; }

    // Only create items for runs with actionable findings
    const findings = output.findings || output.recommendations || [];
    if (findings.length === 0) continue;

    const agentName = run.agent?.name || 'unknown';
    const title = `${agentName} run: ${findings.length} finding${findings.length > 1 ? 's' : ''} (${new Date(run.startedAt).toLocaleDateString()})`;

    const existing = await prisma.workItem.findFirst({
      where: { sourceRef: run.id },
    });
    if (existing) continue;

    await prisma.workItem.create({
      data: {
        title,
        type: 'task',
        status: 'upcoming',
        source: 'agent',
        sourceRef: run.id,
        tags: ['agent', agentName],
        updates: {
          create: {
            author: `agent:${agentName}`,
            type: 'note',
            content: `Agent completed with ${findings.length} findings. Review in Hub → Agents.`,
          },
        },
      },
    });
    console.log(`  ✓ Created: ${title}`);
  }

  const totalItems = await prisma.workItem.count({ where: { source: 'agent' } });
  console.log(`\nDone. ${totalItems} total agent-sourced work items.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
