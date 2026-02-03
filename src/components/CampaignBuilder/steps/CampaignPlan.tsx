'use client';

import { useState, useEffect } from 'react';
import { ChannelResearch, CampaignPlanItem } from '../index';

interface Props {
  channelResearch: ChannelResearch[];
  campaignPlan: CampaignPlanItem[];
  onConfirm: (data: CampaignPlanItem[]) => void;
  onBack: () => void;
}

export function CampaignPlan({ channelResearch, campaignPlan, onConfirm, onBack }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignPlanItem[]>([]);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());

  useEffect(() => {
    const generatePlan = async () => {
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const now = new Date();
      const monthYear = `${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getFullYear().toString().slice(-2)}`;

      // Generate campaigns based on channel research
      const generatedCampaigns: CampaignPlanItem[] = [];
      let id = 1;

      // Google Ads campaigns
      const googleChannel = channelResearch.find(c => c.channel === 'google_search');
      if (googleChannel) {
        const budget = googleChannel.recommendedBudget;
        generatedCampaigns.push(
          {
            id: `campaign-${id++}`,
            name: `2026${monthYear} BOFU Voice AI Contact Center SA US`,
            platform: 'google_ads',
            funnel: 'bofu',
            budget: Math.round(budget * 0.45),
            adGroups: [
              { name: 'High Intent', keywords: ['contact center AI', 'voice AI platform', 'AI customer service'] },
              { name: 'Solutions', keywords: ['IVR replacement', 'automated contact center', 'AI voice agents'] },
            ],
            status: 'planned',
          },
          {
            id: `campaign-${id++}`,
            name: `2026${monthYear} BOFU Voice AI Competitors SA US/UK`,
            platform: 'google_ads',
            funnel: 'bofu',
            budget: Math.round(budget * 0.33),
            adGroups: [
              { name: 'Competitor Terms', keywords: ['five9 alternative', 'nice alternative', 'genesys competitor'] },
            ],
            status: 'planned',
          },
          {
            id: `campaign-${id++}`,
            name: `2026${monthYear} MOFU AI Customer Service SA US/UK`,
            platform: 'google_ads',
            funnel: 'mofu',
            budget: Math.round(budget * 0.22),
            adGroups: [
              { name: 'Solution Aware', keywords: ['conversational AI', 'AI for customer service', 'contact center automation'] },
            ],
            status: 'planned',
          }
        );
      }

      // LinkedIn campaigns
      const linkedInChannel = channelResearch.find(c => c.channel === 'linkedin');
      if (linkedInChannel) {
        const budget = linkedInChannel.recommendedBudget;
        generatedCampaigns.push(
          {
            id: `campaign-${id++}`,
            name: `2026${monthYear} MOFU Voice AI LinkedIn US`,
            platform: 'linkedin',
            funnel: 'mofu',
            budget: Math.round(budget * 0.57),
            adGroups: [
              { name: 'Decision Makers', targeting: 'VP CX, CC Directors, CIO at 500+ enterprises' },
            ],
            status: 'planned',
          },
          {
            id: `campaign-${id++}`,
            name: `2026${monthYear} TOFU AI CX Trends LinkedIn UK`,
            platform: 'linkedin',
            funnel: 'tofu',
            budget: Math.round(budget * 0.43),
            adGroups: [
              { name: 'Awareness', targeting: 'CX Leaders at Insurance, Healthcare, Banking' },
            ],
            status: 'planned',
          }
        );
      }

      // StackAdapt campaigns
      const stackAdaptChannel = channelResearch.find(c => c.channel === 'stackadapt');
      if (stackAdaptChannel) {
        const budget = stackAdaptChannel.recommendedBudget;
        generatedCampaigns.push(
          {
            id: `campaign-${id++}`,
            name: `2026${monthYear} TOFU Voice AI DA US/UK`,
            platform: 'stackadapt',
            funnel: 'tofu',
            budget: Math.round(budget * 0.43),
            adGroups: [
              { name: 'Display Awareness', targeting: 'Intent: Contact Center + Voice AI' },
            ],
            status: 'planned',
          },
          {
            id: `campaign-${id++}`,
            name: `2026${monthYear} MOFU Contact Center AI NA US/UK`,
            platform: 'stackadapt',
            funnel: 'mofu',
            budget: Math.round(budget * 0.43),
            adGroups: [
              { name: 'Native Consideration', targeting: 'Firmographic: 500+ employees, target industries' },
            ],
            status: 'planned',
          },
          {
            id: `campaign-${id++}`,
            name: `2026${monthYear} RETAR Voice AI DA GLOBAL`,
            platform: 'stackadapt',
            funnel: 'retargeting',
            budget: Math.round(budget * 0.14),
            adGroups: [
              { name: 'Retargeting', targeting: 'Website visitors (30 days), exclude converters' },
            ],
            status: 'planned',
          }
        );
      }

      setCampaigns(generatedCampaigns);
      setIsLoading(false);
    };

    generatePlan();
  }, [channelResearch]);

  const toggleExpand = (id: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateCampaignBudget = (id: string, budget: number) => {
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, budget } : c));
  };

  const removeCampaign = (id: string) => {
    setCampaigns(prev => prev.filter(c => c.id !== id));
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'google_ads': return '🔍';
      case 'linkedin': return '💼';
      case 'stackadapt': return '📺';
      case 'reddit': return '🤖';
      default: return '📣';
    }
  };

  const getFunnelColor = (funnel: string) => {
    switch (funnel) {
      case 'tofu': return 'bg-purple-900 text-purple-400';
      case 'mofu': return 'bg-blue-900 text-blue-400';
      case 'bofu': return 'bg-green-900 text-green-400';
      case 'retargeting': return 'bg-orange-900 text-orange-400';
      default: return 'bg-gray-700 text-gray-400';
    }
  };

  const groupedCampaigns = campaigns.reduce((acc, campaign) => {
    if (!acc[campaign.platform]) acc[campaign.platform] = [];
    acc[campaign.platform].push(campaign);
    return acc;
  }, {} as Record<string, CampaignPlanItem[]>);

  const totalBudget = campaigns.reduce((sum, c) => sum + c.budget, 0);
  const funnelBreakdown = campaigns.reduce((acc, c) => {
    acc[c.funnel] = (acc[c.funnel] || 0) + c.budget;
    return acc;
  }, {} as Record<string, number>);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400">Generating campaign plan...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Campaign Plan</h2>
        <p className="text-gray-400">{campaigns.length} campaigns to create</p>
      </div>

      {/* Campaign Groups */}
      {Object.entries(groupedCampaigns).map(([platform, platformCampaigns]) => (
        <div key={platform} className="space-y-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            {getPlatformIcon(platform)}
            {platform === 'google_ads' ? 'Google Ads' : platform === 'linkedin' ? 'LinkedIn' : 'StackAdapt'}
          </h3>
          
          <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
            {platformCampaigns.map(campaign => (
              <div key={campaign.id} className="p-4">
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleExpand(campaign.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400">{expandedCampaigns.has(campaign.id) ? '▼' : '▶'}</span>
                    <span className="text-white font-medium">{campaign.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getFunnelColor(campaign.funnel)}`}>
                      {campaign.funnel.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">$</span>
                      <input
                        type="number"
                        value={campaign.budget}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateCampaignBudget(campaign.id, parseInt(e.target.value) || 0);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-right focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCampaign(campaign.id);
                      }}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {expandedCampaigns.has(campaign.id) && campaign.adGroups && (
                  <div className="mt-3 ml-8 space-y-2">
                    {campaign.adGroups.map((ag, i) => (
                      <div key={i} className="bg-gray-900 rounded p-3">
                        <p className="text-sm font-medium text-gray-300">{ag.name}</p>
                        {ag.keywords && (
                          <p className="text-sm text-gray-500 mt-1">
                            Keywords: {ag.keywords.join(', ')}
                          </p>
                        )}
                        {ag.targeting && (
                          <p className="text-sm text-gray-500 mt-1">
                            Targeting: {ag.targeting}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Summary */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-4">💡 Rationale</h3>
        <p className="text-gray-300 mb-4">
          BOFU-heavy split ({Math.round((funnelBreakdown.bofu || 0) / totalBudget * 100)}%) given lead gen goal. 
          Google captures high-intent searches. LinkedIn reaches decision makers directly. 
          StackAdapt provides awareness reach and retargeting to warm up prospects.
        </p>

        <div className="grid grid-cols-4 gap-4 text-center">
          {['tofu', 'mofu', 'bofu', 'retargeting'].map(funnel => {
            const amount = funnelBreakdown[funnel] || 0;
            const percent = totalBudget > 0 ? (amount / totalBudget) * 100 : 0;
            return (
              <div key={funnel} className="bg-gray-900 rounded-lg p-3">
                <p className={`text-xs font-medium ${getFunnelColor(funnel)} bg-transparent`}>
                  {funnel.toUpperCase()}
                </p>
                <p className="text-xl font-bold text-white mt-1">{percent.toFixed(0)}%</p>
                <p className="text-sm text-gray-500">${amount.toLocaleString()}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => onConfirm(campaigns)}
          className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Generate Ad Copy →
        </button>
      </div>
    </div>
  );
}
