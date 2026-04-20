'use client';

import { useState, useEffect } from 'react';
import {
  Target,
  ChevronDown,
  ChevronRight,
  Loader2,
  DollarSign,
  Eye,
  Users,
  MousePointerClick,
} from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import PlatformBadge from '@/components/PlatformBadge';

interface ProductSummary {
  product: string;
  campaignCount: number;
  segmentCount: number;
  domainCount: number;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
}

interface CampaignSegment {
  id: string;
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  campaignBudget: number | null;
  platform: string;
  parsedProduct: string | null;
  parsedVariant: string | null;
  parsedIntent: string | null;
  segmentId: string;
  segmentName: string | null;
  segmentType: string | null;
  segmentSize: number | null;
  impressions30d: number;
  clicks30d: number;
  spend30d: number;
  conversions30d: number;
  ctr30d: number | null;
  cpc30d: number | null;
  cpm30d: number | null;
  healthFlags: string[];
}

interface CampaignGroup {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  campaignBudget: number | null;
  platform: string;
  parsedVariant: string | null;
  parsedIntent: string | null;
  segments: CampaignSegment[];
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  domainCount: number;
}

interface ProductDetail {
  product: string;
  campaigns: CampaignGroup[];
  domainCount: number;
  totalCampaigns: number;
  totalSegments: number;
}

export default function CampaignsPage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  // Fetch product summaries
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch('/api/abm/campaigns');
        const data = await res.json();
        setProducts(data.products || []);
      } catch (error) {
        console.error('Failed to fetch campaign stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // Fetch product detail when expanded
  const handleExpandProduct = async (product: string) => {
    if (expandedProduct === product) {
      setExpandedProduct(null);
      setProductDetail(null);
      return;
    }

    setExpandedProduct(product);
    setDetailLoading(true);
    setExpandedCampaign(null);

    try {
      const res = await fetch(`/api/abm/campaigns/${encodeURIComponent(product)}`);
      const data = await res.json();
      setProductDetail(data);
    } catch (error) {
      console.error('Failed to fetch product campaigns:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toLocaleString();
  };

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('active') || s.includes('enabled') || s.includes('running')) {
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    }
    if (s.includes('paused')) {
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    }
    if (s.includes('ended') || s.includes('completed') || s.includes('removed')) {
      return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
    return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <Target size={20} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Campaigns</h1>
            <p className="text-sm text-[var(--text-muted)]">
              ABM campaign segments grouped by product
            </p>
          </div>
        </div>
      </div>

      {/* Product Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-[var(--text-muted)]" size={24} />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          No campaign segments found
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((product) => (
            <div
              key={product.product}
              className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-primary)] overflow-hidden"
            >
              {/* Product Header */}
              <div
                onClick={() => handleExpandProduct(product.product)}
                className="p-4 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {expandedProduct === product.product ? (
                      <ChevronDown size={16} className="text-[var(--text-muted)]" />
                    ) : (
                      <ChevronRight size={16} className="text-[var(--text-muted)]" />
                    )}
                    <div>
                      <h2 className="text-base font-semibold text-[var(--text-primary)]">
                        {product.product}
                      </h2>
                      <p className="text-xs text-[var(--text-muted)]">
                        {product.campaignCount} campaigns · {product.segmentCount} segments
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-[var(--text-muted)]">
                        <DollarSign size={12} />
                        <span className="text-xs">Spend 30d</span>
                      </div>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {formatCurrency(product.totalSpend)}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-[var(--text-muted)]">
                        <Eye size={12} />
                        <span className="text-xs">Impressions</span>
                      </div>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {formatNumber(product.totalImpressions)}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-[var(--text-muted)]">
                        <Users size={12} />
                        <span className="text-xs">Domains</span>
                      </div>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {formatNumber(product.domainCount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Campaign Detail */}
              {expandedProduct === product.product && (
                <div className="border-t border-[var(--border-primary)]">
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="animate-spin text-[var(--text-muted)]" size={20} />
                    </div>
                  ) : productDetail ? (
                    <div className="divide-y divide-[var(--border-primary)]">
                      {productDetail.campaigns.length === 0 ? (
                        <div className="p-4 text-center text-sm text-[var(--text-muted)]">
                          No campaigns found for this product
                        </div>
                      ) : (
                        productDetail.campaigns.map((campaign) => (
                          <div key={`${campaign.campaignId}-${campaign.platform}`}>
                            {/* Campaign Row */}
                            <div
                              onClick={() =>
                                setExpandedCampaign(
                                  expandedCampaign === campaign.campaignId
                                    ? null
                                    : campaign.campaignId
                                )
                              }
                              className="px-4 py-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-base)] cursor-pointer transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {expandedCampaign === campaign.campaignId ? (
                                    <ChevronDown size={14} className="text-[var(--text-muted)]" />
                                  ) : (
                                    <ChevronRight size={14} className="text-[var(--text-muted)]" />
                                  )}
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-[var(--text-primary)]">
                                        {campaign.campaignName}
                                      </span>
                                      <PlatformBadge platform={campaign.platform} size="sm" />
                                      <span
                                        className={`px-1.5 py-0.5 text-[10px] rounded border ${getStatusColor(
                                          campaign.campaignStatus
                                        )}`}
                                      >
                                        {campaign.campaignStatus}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5">
                                      {campaign.parsedVariant && (
                                        <span className="text-[10px] text-[var(--text-muted)]">
                                          Variant: {campaign.parsedVariant}
                                        </span>
                                      )}
                                      <span className="text-[10px] text-[var(--text-muted)]">
                                        {campaign.segments.length} segment
                                        {campaign.segments.length !== 1 ? 's' : ''}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-6 text-xs">
                                  <div className="text-right">
                                    <span className="text-[var(--text-muted)]">Budget</span>
                                    <div className="text-[var(--text-primary)]">
                                      {campaign.campaignBudget
                                        ? formatCurrency(campaign.campaignBudget)
                                        : '—'}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[var(--text-muted)]">Spend</span>
                                    <div className="text-[var(--text-primary)]">
                                      {formatCurrency(campaign.totalSpend)}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[var(--text-muted)]">Impr</span>
                                    <div className="text-[var(--text-primary)]">
                                      {formatNumber(campaign.totalImpressions)}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[var(--text-muted)]">Domains</span>
                                    <div className="text-[var(--text-primary)]">
                                      {formatNumber(campaign.domainCount)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Segments */}
                            {expandedCampaign === campaign.campaignId && (
                              <div className="bg-[var(--bg-base)]">
                                <table className="w-full">
                                  <thead>
                                    <tr className="border-b border-[var(--border-primary)]">
                                      <th className="px-6 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">
                                        Segment
                                      </th>
                                      <th className="px-4 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">
                                        Type
                                      </th>
                                      <th className="px-4 py-2 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase">
                                        Size
                                      </th>
                                      <th className="px-4 py-2 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase">
                                        Impr
                                      </th>
                                      <th className="px-4 py-2 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase">
                                        Clicks
                                      </th>
                                      <th className="px-4 py-2 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase">
                                        CTR
                                        <InfoTooltip content="Click-through rate" size={10} />
                                      </th>
                                      <th className="px-4 py-2 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase">
                                        Spend
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--border-primary)]">
                                    {campaign.segments.map((seg) => (
                                      <tr
                                        key={seg.id}
                                        className="hover:bg-[var(--bg-elevated)] text-xs"
                                      >
                                        <td className="px-6 py-2 text-[var(--text-primary)]">
                                          {seg.segmentName || seg.segmentId}
                                        </td>
                                        <td className="px-4 py-2 text-[var(--text-muted)]">
                                          {seg.segmentType || '—'}
                                        </td>
                                        <td className="px-4 py-2 text-right text-[var(--text-secondary)]">
                                          {seg.segmentSize?.toLocaleString() || '—'}
                                        </td>
                                        <td className="px-4 py-2 text-right text-[var(--text-secondary)]">
                                          {formatNumber(seg.impressions30d)}
                                        </td>
                                        <td className="px-4 py-2 text-right text-[var(--text-secondary)]">
                                          {formatNumber(seg.clicks30d)}
                                        </td>
                                        <td className="px-4 py-2 text-right text-[var(--text-secondary)]">
                                          {seg.ctr30d ? `${(seg.ctr30d * 100).toFixed(2)}%` : '—'}
                                        </td>
                                        <td className="px-4 py-2 text-right text-[var(--text-secondary)]">
                                          {formatCurrency(seg.spend30d)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
