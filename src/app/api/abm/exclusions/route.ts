import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');

    // Get all exclusions
    const where = category ? { category } : {};

    const exclusions = await prisma.aBMExclusion.findMany({
      where,
      orderBy: { addedAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    });

    // Get SF status for excluded domains
    const domains = exclusions.map(e => e.domain);
    const sfAccounts = await prisma.aBMAccount.findMany({
      where: { domain: { in: domains } },
      select: {
        domain: true,
        sfAccountId: true,
        inPipeline: true,
      },
    });
    const sfStatusMap = new Map<string, { sfAccountId: string | null; inPipeline: boolean }>();
    sfAccounts.forEach(a => {
      if (a.domain) {
        sfStatusMap.set(a.domain, { sfAccountId: a.sfAccountId, inPipeline: a.inPipeline });
      }
    });

    // Enrich exclusions with SF status
    const enrichedExclusions = exclusions.map(e => {
      const sfData = sfStatusMap.get(e.domain);
      let sfStatus: 'none' | 'lead' | 'account' | 'opportunity' = 'none';
      if (sfData?.inPipeline) {
        sfStatus = 'opportunity';
      } else if (sfData?.sfAccountId) {
        sfStatus = 'account';
      }

      return {
        id: e.id,
        domain: e.domain,
        company: e.company,
        country: e.country,
        product: e.category, // category maps to product in UI
        category: e.category,
        reason: e.reason,
        addedBy: e.addedBy,
        addedAt: e.addedAt,
        excludedAt: e.addedAt.toISOString(),
        excludedBy: e.addedBy,
        notes: e.notes,
        sfStatus,
        inSalesforce: !!sfData?.sfAccountId,
      };
    });

    // Get counts by category/product
    const categoryCounts = await prisma.aBMExclusion.groupBy({
      by: ['category'],
      _count: { id: true },
    });

    const productGroups = categoryCounts.map(c => ({
      product: c.category,
      count: c._count.id,
    }));

    const total = await prisma.aBMExclusion.count({ where });

    return NextResponse.json({
      exclusions: enrichedExclusions,
      productGroups,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error fetching exclusions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exclusions' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { domain, company, category, reason, addedBy = 'manual', notes } = body;

    if (!domain || !category || !reason) {
      return NextResponse.json(
        { error: 'Domain, category, and reason are required' },
        { status: 400 }
      );
    }

    // Clean domain
    const cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];

    // Check if exclusion already exists for this domain+category
    const existing = await prisma.aBMExclusion.findFirst({
      where: {
        domain: cleanDomain,
        category,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Exclusion already exists for this domain and category' },
        { status: 409 }
      );
    }

    // Create exclusion
    const exclusion = await prisma.aBMExclusion.create({
      data: { id: crypto.randomUUID(),
        domain: cleanDomain,
        company: company || cleanDomain,
        category,
        reason,
        addedBy,
        notes,
        pushedToSa: false,
      },
    });

    return NextResponse.json({ exclusion, created: true });
  } catch (error) {
    console.error('Error creating exclusion:', error);
    return NextResponse.json(
      { error: 'Failed to create exclusion' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const domain = searchParams.get('domain');
    const category = searchParams.get('category');

    if (id) {
      // Delete by ID
      await prisma.aBMExclusion.delete({ where: { id } });
      return NextResponse.json({ deleted: true });
    }

    if (domain && category) {
      // Delete by domain + category
      const cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
      await prisma.aBMExclusion.deleteMany({
        where: {
          domain: cleanDomain,
          category,
        },
      });
      return NextResponse.json({ deleted: true });
    }

    return NextResponse.json(
      { error: 'Either id or domain+category required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error deleting exclusion:', error);
    return NextResponse.json(
      { error: 'Failed to delete exclusion' },
      { status: 500 }
    );
  }
}
