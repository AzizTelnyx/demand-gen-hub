import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const { domain } = await params;
    const decodedDomain = decodeURIComponent(domain).toLowerCase();

    // Get ABMAccount data
    const account = await prisma.aBMAccount.findUnique({
      where: { domain: decodedDomain },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Domain not found', domain: decodedDomain },
        { status: 404 }
      );
    }

    // Get SF Account if exists
    let sfAccount = null;
    if (account.sfAccountId) {
      sfAccount = await prisma.sFAccount.findFirst({
        where: {
          OR: [
            { sfId: account.sfAccountId },
            { cleanDomain: decodedDomain },
            { domain: decodedDomain },
          ],
        },
      });
    } else {
      // Try to find by domain match
      sfAccount = await prisma.sFAccount.findFirst({
        where: {
          OR: [
            { cleanDomain: decodedDomain },
            { domain: decodedDomain },
          ],
        },
      });
    }

    // Derive SF status
    let sfStatus: 'none' | 'lead' | 'account' | 'opportunity' | 'customer' = 'none';
    if (account.inPipeline) {
      sfStatus = 'opportunity';
    } else if (sfAccount) {
      // Check for opportunities
      const hasOpportunity = await prisma.sFOpportunity.findFirst({
        where: {
          OR: [
            { accountDomain: decodedDomain },
            { accountSfId: sfAccount.sfId },
          ],
          isWon: true,
        },
      });
      if (hasOpportunity) {
        sfStatus = 'customer';
      } else {
        const hasOpenOpp = await prisma.sFOpportunity.findFirst({
          where: {
            OR: [
              { accountDomain: decodedDomain },
              { accountSfId: sfAccount.sfId },
            ],
            isClosed: false,
          },
        });
        sfStatus = hasOpenOpp ? 'opportunity' : 'account';
      }
    } else if (account.sfAccountId) {
      sfStatus = 'lead';
    }

    // Get all exclusions for this domain
    const exclusions = await prisma.aBMExclusion.findMany({
      where: { domain: decodedDomain },
    });

    // Get campaign segments for this domain's product
    const segmentMembership = account.productFit
      ? await prisma.aBMCampaignSegment.findMany({
          where: { parsedProduct: account.productFit },
          select: {
            campaignId: true,
            campaignName: true,
            platform: true,
            segmentName: true,
            createdAt: true,
          },
          take: 20,
        })
      : [];

    // Get ad impressions for this domain
    const impressions = await prisma.adImpression.findMany({
      where: { domain: decodedDomain },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Build relevance by product
    // For now, we'll use the productFit and assign relevance based on that
    // In a real system, this would be calculated from scoring models
    const products = ['AI Agent', 'Voice API', 'SMS API', 'SIP Trunking', 'IoT SIM', 'Fax', 'Numbers'];
    const relevanceByProduct = products.map((product) => {
      const isProductFit = account.productFit === product;
      // Calculate relevance based on various factors
      let score = 30; // Base score
      if (isProductFit) score = 85;
      // Adjust based on industry/tags if available
      if (account.clearbitTags && Array.isArray(account.clearbitTags)) {
        const tags = account.clearbitTags as string[];
        if (product === 'AI Agent' && (tags.includes('contact center') || tags.includes('customer service'))) {
          score = Math.max(score, 75);
        }
        if (product === 'IoT SIM' && (tags.includes('fleet') || tags.includes('logistics') || tags.includes('iot'))) {
          score = Math.max(score, 80);
        }
      }

      // Check if domain is in audience for this product
      const inAudience = isProductFit;

      return {
        product,
        score,
        inAudience,
      };
    });

    // Build activity log from various sources
    const activityLog: Array<{
      action: string;
      timestamp: string;
      actor: string;
    }> = [];

    // Add exclusion events
    exclusions.forEach((e) => {
      activityLog.push({
        action: `Excluded from ${e.category}: ${e.reason}`,
        timestamp: e.addedAt.toISOString(),
        actor: e.addedBy,
      });
    });

    // Add impression events
    if (impressions.length > 0) {
      const totalImpressions = impressions.reduce((sum, i) => sum + i.impressions, 0);
      activityLog.push({
        action: `Received ${totalImpressions.toLocaleString()} ad impressions`,
        timestamp: impressions[0].createdAt.toISOString(),
        actor: 'ad-sync',
      });
    }

    // Add account creation
    activityLog.push({
      action: 'Added to ABM database',
      timestamp: account.createdAt.toISOString(),
      actor: account.source || 'system',
    });

    // Add enrichment event
    if (account.lastEnrichedAt) {
      activityLog.push({
        action: `Enriched via ${account.enrichmentSource}`,
        timestamp: account.lastEnrichedAt.toISOString(),
        actor: 'enrichment-service',
      });
    }

    // Sort activity log by timestamp descending
    activityLog.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Build exclusion status (primary exclusion)
    const primaryExclusion = exclusions.length > 0 ? exclusions[0] : null;
    const exclusionStatus = {
      isExcluded: exclusions.length > 0,
      categories: exclusions.map((e) => e.category),
      reason: primaryExclusion?.reason || null,
      excludedAt: primaryExclusion?.addedAt.toISOString() || null,
      excludedBy: primaryExclusion?.addedBy || null,
    };

    // Build response
    const response = {
      domain: account.domain,
      company: account.company,
      description: account.clearbitDesc,
      industry: account.industry || account.vertical,
      employeeCount: account.employeeCount
        ? account.employeeCount > 10000
          ? '10,001+'
          : account.employeeCount > 5000
          ? '5,001-10,000'
          : account.employeeCount > 1000
          ? '1,001-5,000'
          : account.employeeCount > 500
          ? '501-1,000'
          : account.employeeCount > 200
          ? '201-500'
          : account.employeeCount > 50
          ? '51-200'
          : '1-50'
        : account.companySize,
      location: account.country || account.region,
      logo: `https://logo.clearbit.com/${account.domain}`,
      annualRevenue: account.annualRevenue,
      tags: account.clearbitTags || [],
      tech: account.clearbitTech || [],
      productFit: account.productFit,
      tier: account.tier,
      status: account.status,

      salesforce: {
        status: sfStatus,
        accountId: sfAccount?.sfId || account.sfAccountId,
        accountName: sfAccount?.name || account.company,
        inPipeline: account.inPipeline,
      },

      relevanceByProduct,
      segmentMembership: segmentMembership.map((s) => ({
        campaignId: s.campaignId,
        campaignName: s.campaignName,
        platform: s.platform,
        segmentName: s.segmentName,
        addedAt: s.createdAt.toISOString(),
      })),
      exclusionStatus,
      exclusions: exclusions.map((e) => ({
        id: e.id,
        category: e.category,
        reason: e.reason,
        addedAt: e.addedAt.toISOString(),
        addedBy: e.addedBy,
        notes: e.notes,
      })),
      activityLog: activityLog.slice(0, 20),

      // Raw data for debugging
      _raw: {
        accountId: account.id,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        lastActivity: account.lastActivity,
        lastEnrichedAt: account.lastEnrichedAt,
        enrichmentSource: account.enrichmentSource,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching domain details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch domain details' },
      { status: 500 }
    );
  }
}
