import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentSlug = searchParams.get('agent');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const days = parseInt(searchParams.get('days') || '7');

    // Get all agents
    const agents = await prisma.agent.findMany({
      where: {
        slug: {
          in: ['abm-pruner', 'abm-expander', 'abm-negative-builder', 'abm-auditor', 'abm-sf-sync'],
        },
      },
      include: {
        AgentRun: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Build agent summary
    const agentSummary = await Promise.all(
      agents.map(async (agent) => {
        const lastRun = agent.AgentRun[0];

        // Get stats for this agent
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 30);

        const [totalRuns, pendingRecs] = await Promise.all([
          prisma.agentRun.count({
            where: {
              agentId: agent.id,
              createdAt: { gte: sinceDate },
            },
          }),
          prisma.recommendation.count({
            where: {
              AgentRun: { agentId: agent.id },
              status: 'pending',
            },
          }),
        ]);

        // Calculate processed count from recent runs
        const recentRuns = await prisma.agentRun.findMany({
          where: {
            agentId: agent.id,
            createdAt: { gte: sinceDate },
          },
          select: {
            findingsCount: true,
            recsCount: true,
          },
        });

        const totalProcessed = recentRuns.reduce((sum, r) => sum + (r.findingsCount || 0), 0);
        const autoApproved = recentRuns.reduce((sum, r) => sum + (r.recsCount || 0), 0) - pendingRecs;

        // Map agent slug to friendly name
        const nameMap: Record<string, { name: string; description: string; icon: string }> = {
          'abm-pruner': { name: 'Pruner', description: 'Removes low-relevance domains from audiences', icon: 'scissors' },
          'abm-expander': { name: 'Expander', description: 'Discovers new relevant domains for audiences', icon: 'expand' },
          'abm-negative-builder': { name: 'Negative Builder', description: 'Builds negative keyword lists from exclusions', icon: 'shield-x' },
          'abm-auditor': { name: 'Auditor', description: 'Audits audience health and flags issues', icon: 'file-search' },
          'abm-sf-sync': { name: 'SF Sync', description: 'Syncs audience data with Salesforce', icon: 'refresh-cw' },
        };

        const info = nameMap[agent.slug] || { name: agent.name, description: agent.description, icon: 'bot' };

        return {
          id: agent.slug,
          name: info.name,
          description: info.description,
          icon: info.icon,
          enabled: agent.enabled,
          schedule: agent.schedule,
          lastRunAt: lastRun?.completedAt?.toISOString() || lastRun?.startedAt?.toISOString() || null,
          lastRunStatus: lastRun?.status || 'never',
          lastRunDuration: lastRun?.startedAt && lastRun?.completedAt
            ? new Date(lastRun.completedAt).getTime() - new Date(lastRun.startedAt).getTime()
            : null,
          totalProcessed,
          autoApproved: Math.max(0, autoApproved),
          pendingReview: pendingRecs,
        };
      })
    );

    // Get work log from recommendations
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const whereClause: {
      createdAt: { gte: Date };
      AgentRun?: { Agent: { slug: string } };
      status?: string;
    } = {
      createdAt: { gte: sinceDate },
    };

    if (agentSlug) {
      whereClause.AgentRun = { Agent: { slug: agentSlug } };
    }
    if (status) {
      whereClause.status = status;
    }

    const recommendations = await prisma.recommendation.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      include: {
        AgentRun: {
          include: {
            Agent: {
              select: { slug: true, name: true },
            },
          },
        },
      },
    });

    // Map recommendations to work log format
    const workLog = recommendations.map((rec) => {
      const agentName = rec.AgentRun.Agent?.name || 'Unknown';
      const agentSlug = rec.AgentRun.Agent?.slug || 'unknown';

      // Parse target for domain/segment info
      let domain = rec.target || '';
      let segment = rec.platform || null;

      // Try to extract domain from callbackData if available
      if (rec.callbackData) {
        try {
          const data = JSON.parse(rec.callbackData);
          if (data.domain) domain = data.domain;
          if (data.product) segment = data.product;
        } catch {
          // Ignore parse errors
        }
      }

      // Map status
      let mappedStatus: 'auto-approved' | 'pending-review' | 'approved' | 'rejected' = 'pending-review';
      if (rec.status === 'applied' || rec.autoApplied) {
        mappedStatus = rec.autoApplied ? 'auto-approved' : 'approved';
      } else if (rec.status === 'rejected' || rec.status === 'dismissed') {
        mappedStatus = 'rejected';
      } else if (rec.status === 'pending') {
        mappedStatus = 'pending-review';
      }

      return {
        id: rec.id,
        timestamp: rec.createdAt.toISOString(),
        agent: agentSlug.replace('abm-', ''),
        agentName,
        action: rec.type || rec.action,
        domain,
        segment,
        reason: rec.rationale,
        status: mappedStatus,
        severity: rec.severity,
        impact: rec.impact,
        reviewedBy: null, // Would need to track this separately
        reviewedAt: rec.appliedAt?.toISOString() || null,
        autoApplied: rec.autoApplied,
      };
    });

    // Get total count for pagination
    const totalCount = await prisma.recommendation.count({
      where: whereClause,
    });

    // Calculate stats
    const statsWhere = {
      createdAt: { gte: sinceDate },
    };

    const [totalRecs, pendingRecs, appliedRecs, rejectedRecs] = await Promise.all([
      prisma.recommendation.count({ where: statsWhere }),
      prisma.recommendation.count({ where: { ...statsWhere, status: 'pending' } }),
      prisma.recommendation.count({ where: { ...statsWhere, status: 'applied' } }),
      prisma.recommendation.count({ where: { ...statsWhere, status: { in: ['rejected', 'dismissed'] } } }),
    ]);

    const stats = {
      totalProcessedThisWeek: totalRecs,
      autoApprovedCount: appliedRecs,
      flaggedForReviewCount: pendingRecs,
      rejectedCount: rejectedRecs,
    };

    return NextResponse.json({
      agents: agentSummary,
      workLog,
      stats,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching agent activity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent activity' },
      { status: 500 }
    );
  }
}
