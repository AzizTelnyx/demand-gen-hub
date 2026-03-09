import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/agents — List all agents with run counts
 */
export async function GET() {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { runs: true },
        },
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            findingsCount: true,
            recsCount: true,
          },
        },
      },
    });

    const formatted = agents.map(a => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      description: a.description,
      platform: a.platform,
      schedule: a.schedule,
      model: a.model,
      enabled: a.enabled,
      config: a.config,
      totalRuns: a._count.runs,
      lastRun: a.runs[0] || null,
      createdAt: a.createdAt,
      updatedAt: (a as any).updatedAt || a.createdAt,
    }));

    return NextResponse.json({ agents: formatted });
  } catch (e: any) {
    console.error('GET /api/agents error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/agents — Create a new agent
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slug, name, description, platform, schedule, model, config } = body;

    if (!slug || !name) {
      return NextResponse.json({ error: 'slug and name are required' }, { status: 400 });
    }

    const agent = await prisma.agent.create({
      data: {
        slug,
        name,
        description: description || '',
        platform: platform || null,
        schedule: schedule || null,
        model: model || 'anthropic/claude-sonnet-4-20250514',
        config: config || '{}',
        enabled: true,
      },
    });

    return NextResponse.json({ agent }, { status: 201 });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return NextResponse.json({ error: 'Agent with this slug already exists' }, { status: 409 });
    }
    console.error('POST /api/agents error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
