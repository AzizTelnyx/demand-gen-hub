import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Parse query params
    const search = searchParams.get('search') || '';
    const product = searchParams.get('product') || '';
    const country = searchParams.get('country') || '';
    const sfStatus = searchParams.get('sfStatus') || '';
    const minRelevance = parseFloat(searchParams.get('minRelevance') || '0');
    const excluded = searchParams.get('excluded');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const sort = searchParams.get('sort') || 'createdAt';
    const order = searchParams.get('order') || 'desc';

    const offset = (page - 1) * limit;

    // Build where clause
    const where: Prisma.ABMAccountWhereInput = {};

    if (search) {
      where.OR = [
        { domain: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (product) {
      where.productFit = product;
    }

    if (country) {
      where.country = country;
    }

    if (sfStatus) {
      if (sfStatus === 'none') {
        where.sfAccountId = null;
        where.inPipeline = false;
      } else if (sfStatus === 'lead') {
        where.sfAccountId = { not: null };
        where.inPipeline = false;
      } else if (sfStatus === 'opportunity') {
        where.inPipeline = true;
      } else if (sfStatus === 'account') {
        where.sfAccountId = { not: null };
      }
    }

    // Get domains with campaign counts
    const domains = await prisma.aBMAccount.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: {
        [sort]: order as 'asc' | 'desc',
      },
      select: {
        id: true,
        domain: true,
        company: true,
        productFit: true,
        country: true,
        region: true,
        industry: true,
        sfAccountId: true,
        inPipeline: true,
        clearbitDesc: true,
        employeeCount: true,
        clearbitTags: true,
        clearbitTech: true,
        createdAt: true,
        lastActivity: true,
        lastEnrichedAt: true,
        annualRevenue: true,
        vertical: true,
        companySize: true,
        tier: true,
        status: true,
      },
    });

    // Get total count
    const total = await prisma.aBMAccount.count({ where });

    // Get exclusion status for these domains
    const domainList = domains.map(d => d.domain).filter(Boolean) as string[];
    const exclusions = await prisma.aBMExclusion.findMany({
      where: { domain: { in: domainList } },
      select: { domain: true, category: true },
    });
    const exclusionMap = new Map<string, string[]>();
    exclusions.forEach(e => {
      const existing = exclusionMap.get(e.domain) || [];
      existing.push(e.category);
      exclusionMap.set(e.domain, existing);
    });

    // Get campaign counts by product
    const campaignCounts = await prisma.aBMCampaignSegment.groupBy({
      by: ['parsedProduct'],
      _count: { campaignId: true },
      where: {
        parsedProduct: { not: null },
      },
    });
    const campaignCountMap = new Map<string, number>();
    campaignCounts.forEach(c => {
      if (c.parsedProduct) {
        campaignCountMap.set(c.parsedProduct, c._count.campaignId);
      }
    });

    // Enrich domains with exclusion and campaign data
    const enrichedDomains = domains.map(d => {
      const exclusionCategories = d.domain ? exclusionMap.get(d.domain) || [] : [];
      const campaignCount = d.productFit ? campaignCountMap.get(d.productFit) || 0 : 0;

      // Derive SF status
      let derivedSfStatus = 'none';
      if (d.inPipeline) {
        derivedSfStatus = 'opportunity';
      } else if (d.sfAccountId) {
        derivedSfStatus = 'account';
      }

      return {
        ...d,
        hasExclusion: exclusionCategories.length > 0,
        exclusionCategories,
        campaignCount,
        sfStatus: derivedSfStatus,
      };
    });

    // Filter by exclusion status if requested
    let filteredDomains = enrichedDomains;
    if (excluded === 'true') {
      filteredDomains = enrichedDomains.filter(d => d.hasExclusion);
    } else if (excluded === 'false') {
      filteredDomains = enrichedDomains.filter(d => !d.hasExclusion);
    }

    return NextResponse.json({
      domains: filteredDomains,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error fetching domains:', error);
    return NextResponse.json(
      { error: 'Failed to fetch domains' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { domain, product, company } = body;

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400 }
      );
    }

    // Clean domain
    const cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];

    // Check if domain already exists
    const existing = await prisma.aBMAccount.findUnique({
      where: { domain: cleanDomain },
    });

    if (existing) {
      // Update product fit if provided
      if (product && product !== existing.productFit) {
        const updated = await prisma.aBMAccount.update({
          where: { domain: cleanDomain },
          data: { productFit: product },
        });
        return NextResponse.json({ domain: updated, updated: true });
      }
      return NextResponse.json({ domain: existing, exists: true });
    }

    // Create new domain
    const newDomain = await prisma.aBMAccount.create({
      data: { id: crypto.randomUUID(),
        domain: cleanDomain,
        company: company || cleanDomain,
        productFit: product || null,
        source: 'manual',
        status: 'identified',
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ domain: newDomain, created: true });
  } catch (error) {
    console.error('Error adding domain:', error);
    return NextResponse.json(
      { error: 'Failed to add domain' },
      { status: 500 }
    );
  }
}
