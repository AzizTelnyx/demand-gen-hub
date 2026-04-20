import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * POST /api/abm/exclusions/restore
 * Restore (delete) one or more exclusions by ID
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ids } = body;

    const targetIds = ids || (id ? [id] : []);
    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'No exclusion IDs provided' }, { status: 400 });
    }

    // Safety check: don't restore exclusions for domains with active SF opportunities
    const exclusions = await prisma.aBMExclusion.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, domain: true, category: true },
    });

    const domains = [...new Set(exclusions.map(e => e.domain))];
    const pipelineAccounts = await prisma.aBMAccount.findMany({
      where: {
        domain: { in: domains },
        inPipeline: true,
      },
      select: { domain: true },
    });
    const pipelineDomains = new Set(pipelineAccounts.map(a => a.domain));

    // Separate safe vs blocked
    const safeIds = exclusions.filter(e => !pipelineDomains.has(e.domain)).map(e => e.id);
    const blockedIds = exclusions.filter(e => pipelineDomains.has(e.domain)).map(e => e.id);

    if (safeIds.length === 0 && blockedIds.length > 0) {
      return NextResponse.json({
        error: 'Cannot restore — all selected domains have active SF opportunities',
        blocked: blockedIds.length,
      }, { status: 403 });
    }

    // Delete safe exclusions
    const result = await prisma.aBMExclusion.deleteMany({
      where: { id: { in: safeIds } },
    });

    return NextResponse.json({
      deleted: result.count,
      blocked: blockedIds.length,
      blockedReason: blockedIds.length > 0 ? 'Some domains have active SF opportunities' : undefined,
    });
  } catch (error) {
    console.error('Error restoring exclusions:', error);
    return NextResponse.json({ error: 'Failed to restore exclusions' }, { status: 500 });
  }
}
