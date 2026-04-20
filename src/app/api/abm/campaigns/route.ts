import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    // Get campaign segments grouped by product
    const productStats = await prisma.aBMCampaignSegment.groupBy({
      by: ['parsedProduct'],
      _count: {
        campaignId: true,
        segmentId: true,
      },
      _sum: {
        impressions30d: true,
        clicks30d: true,
        spend30d: true,
        conversions30d: true,
      },
      where: {
        parsedProduct: {
          not: null,
        },
      },
    });

    // Get domain counts per product from ABMAccount
    const domainCounts = await prisma.aBMAccount.groupBy({
      by: ['productFit'],
      _count: { id: true },
      where: {
        productFit: { not: null },
      },
    });
    const domainCountMap = new Map<string, number>();
    domainCounts.forEach(d => {
      if (d.productFit) {
        domainCountMap.set(d.productFit, d._count.id);
      }
    });

    // Get unique campaign counts per product
    const uniqueCampaigns = await prisma.aBMCampaignSegment.findMany({
      where: {
        parsedProduct: { not: null },
      },
      select: {
        parsedProduct: true,
        campaignId: true,
      },
      distinct: ['parsedProduct', 'campaignId'],
    });

    const uniqueCampaignMap = new Map<string, Set<string>>();
    uniqueCampaigns.forEach(c => {
      if (c.parsedProduct) {
        const existing = uniqueCampaignMap.get(c.parsedProduct) || new Set();
        existing.add(c.campaignId);
        uniqueCampaignMap.set(c.parsedProduct, existing);
      }
    });

    // Build product summary
    const products = productStats
      .filter(p => p.parsedProduct && p.parsedProduct.trim() !== '')
      .map(p => ({
        product: p.parsedProduct!,
        campaignCount: uniqueCampaignMap.get(p.parsedProduct!)?.size || 0,
        segmentCount: p._count.segmentId,
        domainCount: domainCountMap.get(p.parsedProduct!) || 0,
        totalSpend: p._sum.spend30d || 0,
        totalImpressions: p._sum.impressions30d || 0,
        totalClicks: p._sum.clicks30d || 0,
        totalConversions: p._sum.conversions30d || 0,
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend);

    return NextResponse.json({ products });
  } catch (error) {
    console.error('Error fetching campaign stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign statistics' },
      { status: 500 }
    );
  }
}
