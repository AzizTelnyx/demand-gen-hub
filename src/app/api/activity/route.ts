import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActionType } from '@/lib/recommendation-types';

/**
 * GET /api/activity — Unified activity timeline
 * ?kind=all|approvals|runs|changes &agent=slug &limit=100
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') || 'all';
  const agentSlug = url.searchParams.get('agent') || '';
  const limit = parseInt(url.searchParams.get('limit') || '100');

  const items: any[] = [];

  // Fetch agent runs
  if (kind === 'all' || kind === 'runs') {
    const where: any = {};
    if (agentSlug) where.agent = { slug: agentSlug };

    const runs = await prisma.agentRun.findMany({
      where,
      include: { agent: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    for (const run of runs) {
      let summary = '';
      try {
        const out = JSON.parse(run.output || '{}');
        summary = out.summary || '';
      } catch {}

      items.push({
        id: run.id,
        kind: 'run',
        timestamp: run.completedAt || run.startedAt || run.createdAt,
        agentName: run.agent?.name || 'Unknown',
        agentSlug: run.agent?.slug || '',
        status: run.status,
        summary,
        findingsCount: run.findingsCount,
        recsCount: run.recsCount,
      });
    }
  }

  // Fetch recommendations (approvals + changes)
  if (kind === 'all' || kind === 'approvals' || kind === 'changes') {
    const recWhere: any = {};
    if (agentSlug) recWhere.agentRun = { agent: { slug: agentSlug } };

    if (kind === 'approvals') {
      // Show all statuses for approval view
    } else if (kind === 'changes') {
      recWhere.status = 'applied';
    }

    const recs = await prisma.recommendation.findMany({
      where: recWhere,
      include: {
        agentRun: {
          select: { agent: { select: { name: true, slug: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    for (const rec of recs) {
      let metadata: any = {};
      try { metadata = JSON.parse(rec.impact || '{}'); } catch {}

      const itemKind = rec.status === 'applied' && kind === 'changes' ? 'change' : 'approval';

      items.push({
        id: rec.id,
        kind: itemKind,
        timestamp: rec.createdAt,
        agentName: rec.agentRun?.agent?.name || 'Unknown',
        agentSlug: rec.agentRun?.agent?.slug || '',
        type: rec.type,
        actionType: getActionType(rec.type),
        action: rec.action,
        rationale: rec.rationale,
        severity: rec.severity,
        target: rec.target,
        recStatus: rec.status,
        confidence: (rec as any).confidence || metadata.confidence,
        spend: metadata.spend,
        appliedAt: rec.appliedAt,
        platform: (rec as any).platform || metadata.platform,
        campaignName: (rec as any).campaignName || metadata.campaign_name,
        // Rich impact data for approval clarity
        searchTerm: metadata.search_term,
        matchType: metadata.match_type,
        clicks: metadata.clicks,
        conversions: metadata.conversions,
        intentType: metadata.intent_type,
        oldValue: metadata.old_value,
        newValue: metadata.new_value,
        metadata,
        autoApplied: (rec as any).autoApplied || false,
      });
    }
  }

  // Sort by timestamp desc
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Get agent list for filters
  const agents = await prisma.agent.findMany({
    select: { slug: true, name: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    items: items.slice(0, limit),
    agents,
  });
}
