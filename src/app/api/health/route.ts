import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get latest hub-doctor run
    const latestRun = await prisma.agentRun.findFirst({
      where: { Agent: { slug: 'hub-doctor' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, output: true, status: true, completedAt: true, createdAt: true },
    });

    if (!latestRun || !latestRun.output) {
      // Fallback: basic DB check
      const agentCount = await prisma.agent.count();
      const campaignCount = await prisma.campaign.count();
      return NextResponse.json({
        overall: 'healthy',
        checks: [
          { area: 'database', status: 'healthy', message: `Connected — ${agentCount} agents, ${campaignCount} campaigns` },
        ],
        lastRun: null,
      });
    }

    let output: any = {};
    try { output = JSON.parse(latestRun.output); } catch {}

    // Hub Doctor output format: { summary, checks: [{ name, status, details, issues }] }
    const rawChecks = output.checks || output.findings || [];
    
    // Normalize checks to { area, status, message, details } format
    const checks = rawChecks.map((c: any) => {
      const rawStatus = c.status || 'ok';
      // Map status values
      let status: 'healthy' | 'warning' | 'critical';
      if (rawStatus === 'ok' || rawStatus === 'healthy') status = 'healthy';
      else if (rawStatus === 'warning') status = 'warning';
      else if (rawStatus === 'error' || rawStatus === 'critical') status = 'critical';
      else status = 'healthy';
      
      // Build details from issues array
      const details: string[] = [];
      if (c.issues && Array.isArray(c.issues) && c.issues.length > 0) {
        details.push(...c.issues);
      }
      if (c.counts && typeof c.counts === 'object') {
        const countStr = Object.entries(c.counts).map(([k, v]) => `${k}=${v}`).join(', ');
        if (countStr) details.push(countStr);
      }
      
      return {
        area: c.name || c.area || 'unknown',
        status,
        message: c.details || 'Check completed',
        details: details.length > 0 ? details : undefined,
      };
    });
    
    const overall = checks.some((c: any) => c.status === 'critical')
      ? 'critical'
      : checks.some((c: any) => c.status === 'warning')
        ? 'warning'
        : 'healthy';

    return NextResponse.json({
      overall,
      checks,
      lastRun: latestRun.completedAt || latestRun.createdAt,
      runId: latestRun.id,
    });
  } catch (e: any) {
    return NextResponse.json({
      overall: 'critical',
      checks: [{ area: 'database', status: 'critical', message: `DB error: ${e.message}` }],
      lastRun: null,
    });
  }
}
