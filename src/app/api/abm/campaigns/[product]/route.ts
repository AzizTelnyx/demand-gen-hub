import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ product: string }> }
) {
  try {
    const { product } = await params;
    const decodedProduct = decodeURIComponent(product);

    // Get all campaign segments for this product
    const segments = await prisma.aBMCampaignSegment.findMany({
      where: {
        parsedProduct: decodedProduct,
      },
      orderBy: [
        { spend30d: 'desc' },
        { campaignName: 'asc' },
      ],
      select: {
        id: true,
        campaignId: true,
        campaignName: true,
        campaignStatus: true,
        campaignBudget: true,
        platform: true,
        parsedProduct: true,
        parsedVariant: true,
        parsedIntent: true,
        segmentId: true,
        segmentName: true,
        segmentType: true,
        segmentSize: true,
        segmentSource: true,
        segmentWritable: true,
        impressions30d: true,
        clicks30d: true,
        spend30d: true,
        conversions30d: true,
        ctr30d: true,
        cpc30d: true,
        cpm30d: true,
        healthFlags: true,
        lastSyncedAt: true,
      },
    });

    // Group segments by campaign
    const campaignMap = new Map<string, {
      campaignId: string;
      campaignName: string;
      campaignStatus: string;
      campaignBudget: number | null;
      platform: string;
      parsedVariant: string | null;
      parsedIntent: string | null;
      segments: typeof segments;
      totalSpend: number;
      totalImpressions: number;
      totalClicks: number;
      totalConversions: number;
      domainCount: number;
    }>();

    segments.forEach(s => {
      const key = `${s.campaignId}-${s.platform}`;
      const existing = campaignMap.get(key);

      if (existing) {
        existing.segments.push(s);
        existing.totalSpend += s.spend30d || 0;
        existing.totalImpressions += s.impressions30d || 0;
        existing.totalClicks += s.clicks30d || 0;
        existing.totalConversions += s.conversions30d || 0;
        existing.domainCount += s.segmentSize || 0;
      } else {
        campaignMap.set(key, {
          campaignId: s.campaignId,
          campaignName: s.campaignName,
          campaignStatus: s.campaignStatus,
          campaignBudget: s.campaignBudget,
          platform: s.platform,
          parsedVariant: s.parsedVariant,
          parsedIntent: s.parsedIntent,
          segments: [s],
          totalSpend: s.spend30d || 0,
          totalImpressions: s.impressions30d || 0,
          totalClicks: s.clicks30d || 0,
          totalConversions: s.conversions30d || 0,
          domainCount: s.segmentSize || 0,
        });
      }
    });

    const campaigns = Array.from(campaignMap.values()).sort((a, b) => b.totalSpend - a.totalSpend);

    // Get domain count for this product
    const domainCount = await prisma.aBMAccount.count({
      where: { productFit: decodedProduct },
    });

    return NextResponse.json({
      product: decodedProduct,
      campaigns,
      domainCount,
      totalCampaigns: campaigns.length,
      totalSegments: segments.length,
    });
  } catch (error) {
    console.error('Error fetching product campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product campaigns' },
      { status: 500 }
    );
  }
}
