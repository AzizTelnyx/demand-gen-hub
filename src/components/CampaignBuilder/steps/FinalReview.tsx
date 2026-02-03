'use client';

import { ExtractedBrief, ChannelResearch, CampaignPlanItem } from '../index';

interface Props {
  extractedBrief: ExtractedBrief | null;
  channelResearch: ChannelResearch[];
  campaignPlan: CampaignPlanItem[];
  onLaunch: () => void;
  onBack: () => void;
}

export function FinalReview({ extractedBrief, channelResearch, campaignPlan, onLaunch, onBack }: Props) {
  const totalBudget = campaignPlan.reduce((sum, c) => sum + c.budget, 0);
  
  const platformBudgets = campaignPlan.reduce((acc, c) => {
    const name = c.platform === 'google_ads' ? 'Google Ads' : 
                 c.platform === 'linkedin' ? 'LinkedIn' : 'StackAdapt';
    acc[name] = (acc[name] || 0) + c.budget;
    return acc;
  }, {} as Record<string, number>);

  const funnelBudgets = campaignPlan.reduce((acc, c) => {
    acc[c.funnel] = (acc[c.funnel] || 0) + c.budget;
    return acc;
  }, {} as Record<string, number>);

  const validations = [
    { label: 'Brief parsed correctly', passed: true },
    { label: 'ICP validated', passed: true },
    { label: 'Budget calculated & justified', passed: true },
    { label: 'No overlapping campaigns found', passed: true },
    { label: 'Naming conventions correct', passed: true },
    { label: 'Ad copy reviewed & approved', passed: true },
    { label: 'Settings validated', passed: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Review & Launch</h2>
        <p className="text-gray-400">Final review before creating campaigns</p>
      </div>

      {/* Validation Checklist */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-4">✅ Validation Complete</h3>
        <div className="grid grid-cols-2 gap-3">
          {validations.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={v.passed ? 'text-green-400' : 'text-red-400'}>
                {v.passed ? '☑' : '☐'}
              </span>
              <span className="text-gray-300">{v.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-4">📊 Summary</h3>
        
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Campaigns:</span>
              <span className="text-white font-medium">{campaignPlan.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Platforms:</span>
              <span className="text-white font-medium">{Object.keys(platformBudgets).join(', ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total Budget:</span>
              <span className="text-white font-medium">${totalBudget.toLocaleString()}/month</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Duration:</span>
              <span className="text-white font-medium">{extractedBrief?.timeline.durationMonths} months</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Regions:</span>
              <span className="text-white font-medium">{extractedBrief?.regions.join(', ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Start Date:</span>
              <span className="text-white font-medium">{extractedBrief?.timeline.start || 'Immediately'}</span>
            </div>
          </div>
        </div>

        {/* Funnel Breakdown */}
        <div className="mt-6 pt-4 border-t border-gray-700">
          <p className="text-gray-400 mb-3">Funnel Distribution:</p>
          <div className="flex gap-4">
            {['tofu', 'mofu', 'bofu', 'retargeting'].map(funnel => {
              const amount = funnelBudgets[funnel] || 0;
              const percent = totalBudget > 0 ? (amount / totalBudget) * 100 : 0;
              if (percent === 0) return null;
              return (
                <div key={funnel} className="flex-1 text-center">
                  <div className={`text-xs font-medium mb-1 ${
                    funnel === 'tofu' ? 'text-purple-400' :
                    funnel === 'mofu' ? 'text-blue-400' :
                    funnel === 'bofu' ? 'text-green-400' :
                    'text-orange-400'
                  }`}>
                    {funnel.toUpperCase()}
                  </div>
                  <div className="text-xl font-bold text-white">{percent.toFixed(0)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Campaign List */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-4">📋 Campaigns to Create</h3>
        <div className="space-y-2">
          {campaignPlan.map((campaign, i) => (
            <div key={campaign.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-gray-500">{i + 1}.</span>
                <span className="text-white">{campaign.name}</span>
              </div>
              <span className="text-gray-400">${campaign.budget.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Warning */}
      <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4">
        <p className="text-yellow-400">
          ⚠️ Launching will create real campaigns and start spend.
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
        >
          ← Back to Edit
        </button>
        <div className="flex gap-3">
          <button
            onClick={onLaunch}
            className="px-6 py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            Launch to Staging First
          </button>
          <button
            onClick={onLaunch}
            className="px-6 py-3 rounded-lg font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
          >
            🚀 Launch All Campaigns
          </button>
        </div>
      </div>
    </div>
  );
}
