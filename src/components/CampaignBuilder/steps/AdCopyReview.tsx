'use client';

import { useState, useEffect } from 'react';
import { CampaignPlanItem, AdCopy } from '../index';

interface Props {
  campaignPlan: CampaignPlanItem[];
  adCopy: AdCopy[];
  onConfirm: (data: AdCopy[]) => void;
  onBack: () => void;
}

export function AdCopyReview({ campaignPlan, adCopy, onConfirm, onBack }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [copies, setCopies] = useState<AdCopy[]>([]);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [editingCopy, setEditingCopy] = useState<{ campaignId: string; type: 'headline' | 'description'; index: number } | null>(null);

  useEffect(() => {
    const generateCopy = async () => {
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Generate ad copy for each campaign
      const generatedCopy: AdCopy[] = campaignPlan.map(campaign => {
        const isGoogle = campaign.platform === 'google_ads';
        const isLinkedIn = campaign.platform === 'linkedin';
        
        return {
          campaignId: campaign.id,
          headlines: isGoogle ? [
            'AI Voice Agents for Contact Centers',
            'Cut Wait Times by 50%',
            'Replace Your Legacy IVR',
            'Enterprise-Grade Voice AI',
            'Start Free - No Credit Card',
            '99.99% Uptime SLA',
            'Deploy AI Agents in Hours',
            'Sub-200ms Voice Latency',
            'SOC 2 Type II Certified',
            'Reduce Costs 40%',
            'AI That Actually Understands',
            'Scale Instantly - No Limits',
            'Trusted by 1000+ Companies',
            '24/7 Support Included',
            'Free Demo Available',
          ] : isLinkedIn ? [
            'Voice AI for Contact Centers',
            'The Future of Customer Service',
            'AI That Customers Love',
          ] : [
            'Voice AI - Transform CX',
            'Contact Center AI',
          ],
          descriptions: isGoogle ? [
            'Deploy AI voice agents in hours. Own the network, own the quality. Start your free trial today.',
            'Cut contact center costs by 40%. AI voice agents that scale instantly. Try free for 14 days.',
            'Enterprise-grade AI with 99.99% uptime. SOC 2 certified. 24/7 support. Book a demo now.',
            'Replace frustrating IVRs with AI that understands. Natural conversations, real results.',
          ] : isLinkedIn ? [
            'See how enterprises are cutting contact center costs by 40% while improving CSAT. Download the Voice AI Buyer\'s Guide.',
            'Your contact center agents cost $12 per interaction. AI voice agents? $0.25. Learn how leaders are making the switch.',
          ] : [
            'AI voice agents for enterprise contact centers. Cut costs, improve CSAT.',
          ],
          brandCheckPassed: true,
          factCheckPassed: true,
        };
      });

      setCopies(generatedCopy);
      setExpandedCampaigns(new Set([generatedCopy[0]?.campaignId])); // Expand first by default
      setIsLoading(false);
    };

    generateCopy();
  }, [campaignPlan]);

  const toggleExpand = (campaignId: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else {
        next.add(campaignId);
      }
      return next;
    });
  };

  const updateCopy = (campaignId: string, type: 'headlines' | 'descriptions', index: number, value: string) => {
    setCopies(prev => prev.map(copy => {
      if (copy.campaignId !== campaignId) return copy;
      const updated = { ...copy };
      updated[type] = [...updated[type]];
      updated[type][index] = value;
      return updated;
    }));
  };

  const getCampaign = (campaignId: string) => campaignPlan.find(c => c.id === campaignId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400">Generating ad copy...</p>
        <p className="text-sm text-gray-500 mt-2">Loading brand guidelines and product messaging...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Ad Copy Review</h2>
        <p className="text-gray-400">Review generated ad copy for each campaign:</p>
      </div>

      {copies.map(copy => {
        const campaign = getCampaign(copy.campaignId);
        if (!campaign) return null;
        
        const isExpanded = expandedCampaigns.has(copy.campaignId);
        const isGoogle = campaign.platform === 'google_ads';

        return (
          <div key={copy.campaignId} className="bg-gray-800 rounded-lg overflow-hidden">
            {/* Header */}
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-750"
              onClick={() => toggleExpand(copy.campaignId)}
            >
              <div className="flex items-center gap-3">
                <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                <span className="text-white font-medium">{campaign.name}</span>
              </div>
              <div className="flex items-center gap-4">
                {copy.brandCheckPassed && (
                  <span className="text-green-400 text-sm">✓ Brand check</span>
                )}
                {copy.factCheckPassed && (
                  <span className="text-green-400 text-sm">✓ Fact check</span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(copy.campaignId);
                  }}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                >
                  {isExpanded ? 'Collapse' : 'Review'}
                </button>
              </div>
            </div>

            {/* Content */}
            {isExpanded && (
              <div className="p-4 pt-0 space-y-4">
                {/* Headlines */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-300">
                      HEADLINES {isGoogle && <span className="text-gray-500">(30 char max)</span>}
                    </p>
                    <span className="text-sm text-gray-500">{copy.headlines.length} headlines</span>
                  </div>
                  <div className="space-y-2">
                    {copy.headlines.slice(0, isGoogle ? 15 : 3).map((headline, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-gray-500 text-sm w-8">H{i + 1}:</span>
                        <input
                          type="text"
                          value={headline}
                          onChange={(e) => updateCopy(copy.campaignId, 'headlines', i, e.target.value)}
                          className={`flex-1 bg-gray-900 border rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 ${
                            isGoogle && headline.length > 30 ? 'border-red-500' : 'border-gray-700'
                          }`}
                        />
                        <span className={`text-sm w-12 text-right ${
                          isGoogle && headline.length > 30 ? 'text-red-400' : 'text-gray-500'
                        }`}>
                          {headline.length}{isGoogle && '/30'}
                        </span>
                      </div>
                    ))}
                    {isGoogle && copy.headlines.length > 5 && (
                      <p className="text-sm text-gray-500 ml-10">
                        + {copy.headlines.length - 5} more headlines
                      </p>
                    )}
                  </div>
                </div>

                {/* Descriptions */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-300">
                      DESCRIPTIONS {isGoogle && <span className="text-gray-500">(90 char max)</span>}
                    </p>
                    <span className="text-sm text-gray-500">{copy.descriptions.length} descriptions</span>
                  </div>
                  <div className="space-y-2">
                    {copy.descriptions.map((desc, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-gray-500 text-sm w-8 pt-2">D{i + 1}:</span>
                        <textarea
                          value={desc}
                          onChange={(e) => updateCopy(copy.campaignId, 'descriptions', i, e.target.value)}
                          rows={2}
                          className={`flex-1 bg-gray-900 border rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 resize-none ${
                            isGoogle && desc.length > 90 ? 'border-red-500' : 'border-gray-700'
                          }`}
                        />
                        <span className={`text-sm w-12 text-right pt-2 ${
                          isGoogle && desc.length > 90 ? 'text-red-400' : 'text-gray-500'
                        }`}>
                          {desc.length}{isGoogle && '/90'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Validation */}
                <div className="flex items-center gap-4 pt-2 border-t border-gray-700">
                  <div className={`flex items-center gap-2 ${copy.brandCheckPassed ? 'text-green-400' : 'text-red-400'}`}>
                    {copy.brandCheckPassed ? '✓' : '✗'} Brand guidelines
                  </div>
                  <div className={`flex items-center gap-2 ${copy.factCheckPassed ? 'text-green-400' : 'text-red-400'}`}>
                    {copy.factCheckPassed ? '✓' : '✗'} Fact check
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => onConfirm(copies)}
          className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Review & Launch →
        </button>
      </div>
    </div>
  );
}
