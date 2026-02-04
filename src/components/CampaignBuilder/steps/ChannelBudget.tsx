'use client';

import { useState, useEffect, useRef } from 'react';
import { ExtractedBrief, IcpAnalysis, ChannelResearch } from '../index';

interface Props {
  extractedBrief: ExtractedBrief | null;
  icpAnalysis: IcpAnalysis | null;
  channelResearch: ChannelResearch[];
  onConfirm: (data: ChannelResearch[]) => void;
  onBack: () => void;
}

interface ExtendedChannelResearch extends ChannelResearch {
  priority?: number;
  estimatedMetrics?: {
    audienceSize?: number;
    estimatedCTR?: string;
    estimatedCPC?: number;
    estimatedCPM?: number;
  };
  expectedOutcomes?: {
    impressions?: number;
    clicks?: number;
    estimatedLeads?: number;
  };
}

interface OverlapResult {
  hasOverlap: boolean;
  overlappingKeywords: Array<{
    keyword: string;
    existingCampaign: string;
    existingAdGroup: string;
    matchType: string;
  }>;
  warnings: string[];
  recommendations: string[];
}

export function ChannelBudget({ extractedBrief, icpAnalysis, channelResearch, onConfirm, onBack }: Props) {
  const hasFetched = useRef(false);
  const hasCachedData = channelResearch && channelResearch.length > 0;
  
  const [isLoading, setIsLoading] = useState(!hasCachedData);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<ExtendedChannelResearch[]>(hasCachedData ? channelResearch : []);
  const [totalBudget, setTotalBudget] = useState(hasCachedData ? channelResearch.reduce((sum, c) => sum + (c.recommendedBudget || 0), 0) : 0);
  const [customBudget, setCustomBudget] = useState<number | null>(null);
  
  // Overlap check state
  const [overlapResult, setOverlapResult] = useState<OverlapResult | null>(null);
  const [checkingOverlap, setCheckingOverlap] = useState(false);

  useEffect(() => {
    if (hasCachedData || hasFetched.current) {
      setIsLoading(false);
      return;
    }
    
    hasFetched.current = true;
    
    const runResearch = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/builder/research-channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product: extractedBrief?.product,
            targetAudience: extractedBrief?.targetAudience,
            icpAnalysis,
            regions: extractedBrief?.regions,
            goal: extractedBrief?.goal,
            budget: extractedBrief?.budget,
            funnelFocus: extractedBrief?.funnelFocus,
            isCompetitorCampaign: (extractedBrief as any)?.isCompetitorCampaign,
            competitorMentioned: (extractedBrief as any)?.competitorMentioned,
          }),
        });

        const data = await response.json();

        if (data.success && data.channelResearch) {
          const mappedChannels = data.channelResearch.map((ch: any) => ({
            channel: ch.channel,
            recommended: ch.recommended,
            priority: ch.priority,
            rationale: ch.rationale,
            targeting: ch.targeting || {},
            keywords: ch.targeting?.keywords || ch.keywords || [],
            audienceSize: ch.estimatedMetrics?.audienceSize || ch.audienceSize || 0,
            estimatedCpc: ch.estimatedMetrics?.estimatedCPC || ch.estimatedCpc,
            estimatedCpm: ch.estimatedMetrics?.estimatedCPM || ch.estimatedCpm,
            estimatedMetrics: ch.estimatedMetrics,
            budgetCalculation: ch.budgetCalculation || { formula: '', result: 0 },
            recommendedBudget: ch.budgetCalculation?.monthlyBudget || ch.recommendedBudget || 0,
            expectedOutcomes: ch.expectedOutcomes,
          }));
          
          mappedChannels.sort((a: any, b: any) => (a.priority || 99) - (b.priority || 99));
          
          setChannels(mappedChannels);
          setTotalBudget(data.totalRecommendedBudget || mappedChannels.reduce((sum: number, c: any) => sum + (c.recommendedBudget || 0), 0));
          
          // Auto-check for overlap with Google keywords
          const googleChannel = mappedChannels.find((c: any) => c.channel === 'google_search');
          if (googleChannel?.keywords?.length > 0) {
            checkOverlap(googleChannel.keywords.map((k: any) => k.keyword || k));
          }
        } else {
          setError('Failed to research channels');
        }
      } catch (err) {
        console.error('Error researching channels:', err);
        setError('Failed to research channels. Please try again.');
      }

      setIsLoading(false);
    };

    runResearch();
  }, [extractedBrief, icpAnalysis, hasCachedData]);

  const checkOverlap = async (keywords: string[]) => {
    setCheckingOverlap(true);
    try {
      const response = await fetch('/api/builder/check-overlap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords,
          region: extractedBrief?.regions?.[0],
          product: extractedBrief?.product,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setOverlapResult(data.overlap);
      }
    } catch (err) {
      console.error('Overlap check failed:', err);
    }
    setCheckingOverlap(false);
  };

  const toggleChannel = (channelName: string) => {
    setChannels(prev => prev.map(c => 
      c.channel === channelName ? { ...c, recommended: !c.recommended } : c
    ));
  };

  const updateBudget = (channelName: string, newBudget: number) => {
    setChannels(prev => prev.map(c =>
      c.channel === channelName ? { ...c, recommendedBudget: newBudget } : c
    ));
  };

  const applyCustomBudget = () => {
    if (!customBudget) return;
    
    const recommendedChannels = channels.filter(c => c.recommended);
    const totalRecommended = recommendedChannels.reduce((sum, c) => sum + c.recommendedBudget, 0);
    
    setChannels(prev => prev.map(c => {
      if (!c.recommended) return c;
      const proportion = c.recommendedBudget / totalRecommended;
      return { ...c, recommendedBudget: Math.round(customBudget * proportion) };
    }));
  };

  useEffect(() => {
    setTotalBudget(channels.filter(c => c.recommended).reduce((sum, c) => sum + c.recommendedBudget, 0));
  }, [channels]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400">Researching channels with AI...</p>
        <p className="text-gray-500 text-sm mt-2">Analyzing keywords, audiences, and calculating optimal budgets</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <div className="text-red-400 mb-4">⚠️ {error}</div>
        <button
          onClick={() => {
            hasFetched.current = false;
            setError(null);
            setIsLoading(true);
          }}
          className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors mr-3"
        >
          Retry
        </button>
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
        >
          ← Back
        </button>
      </div>
    );
  }

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'google_search': return '🔍';
      case 'linkedin': return '💼';
      case 'stackadapt': return '📺';
      case 'reddit': return '🤖';
      default: return '📣';
    }
  };

  const getChannelName = (channel: string) => {
    switch (channel) {
      case 'google_search': return 'Google Search';
      case 'linkedin': return 'LinkedIn';
      case 'stackadapt': return 'StackAdapt';
      case 'reddit': return 'Reddit';
      default: return channel;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Channel & Budget Research</h2>
        <p className="text-gray-400">AI-recommended channels and budgets based on your ICP and goals</p>
      </div>

      {/* Overlap Warning */}
      {overlapResult && overlapResult.hasOverlap && (
        <div className="bg-amber-900/30 border border-amber-500/50 rounded-xl p-4">
          <h3 className="text-amber-400 font-semibold mb-2">⚠️ Keyword Overlap Detected</h3>
          <p className="text-gray-300 text-sm mb-3">
            Some keywords already exist in your Google Ads account:
          </p>
          <div className="space-y-2 mb-3">
            {overlapResult.overlappingKeywords.slice(0, 5).map((kw, idx) => (
              <div key={idx} className="text-sm bg-gray-800/50 rounded p-2">
                <span className="text-amber-300">{kw.keyword}</span>
                <span className="text-gray-500"> → </span>
                <span className="text-gray-400">{kw.existingCampaign}</span>
              </div>
            ))}
          </div>
          {overlapResult.recommendations.map((rec, idx) => (
            <p key={idx} className="text-sm text-gray-400">💡 {rec}</p>
          ))}
        </div>
      )}
      
      {checkingOverlap && (
        <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-blue-300">Checking for keyword overlap in existing campaigns...</span>
        </div>
      )}

      {overlapResult && !overlapResult.hasOverlap && (
        <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
          <span className="text-emerald-400">✓ No keyword overlap detected with existing campaigns</span>
        </div>
      )}

      {/* Channel Cards */}
      {channels.map((channel, idx) => (
        <div
          key={channel.channel}
          className={`bg-gray-800/50 backdrop-blur rounded-xl border-2 p-5 transition-colors ${
            channel.recommended ? 'border-blue-500/50' : 'border-gray-700/50 opacity-60'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getChannelIcon(channel.channel)}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-white">{getChannelName(channel.channel)}</h3>
                  {channel.priority && channel.priority <= 2 && (
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs">
                      Priority {channel.priority}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400">{channel.rationale}</p>
              </div>
            </div>
            <button
              onClick={() => toggleChannel(channel.channel)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                channel.recommended
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {channel.recommended ? '✓ Included' : 'Add'}
            </button>
          </div>

          {channel.recommended && (
            <>
              {/* Keywords Table (for Google Search) */}
              {channel.keywords && channel.keywords.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-300 mb-2">Keywords researched:</p>
                  <div className="bg-gray-900/50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-700/50">
                          <th className="text-left py-2 px-3">Keyword</th>
                          <th className="text-right py-2 px-3">Volume</th>
                          <th className="text-right py-2 px-3">CPC</th>
                          <th className="text-right py-2 px-3">Intent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {channel.keywords.slice(0, 8).map((kw: any, i: number) => (
                          <tr key={i} className="text-gray-300 border-t border-gray-700/30">
                            <td className="py-2 px-3">{typeof kw === 'string' ? kw : kw.keyword}</td>
                            <td className="text-right py-2 px-3">{kw.volume?.toLocaleString() || '-'}</td>
                            <td className="text-right py-2 px-3">{kw.cpc ? `$${kw.cpc.toFixed(2)}` : '-'}</td>
                            <td className="text-right py-2 px-3">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                kw.intent === 'bofu' || kw.intent === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
                                kw.intent === 'medium' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-gray-700 text-gray-400'
                              }`}>
                                {kw.intent || 'N/A'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Targeting Summary (for LinkedIn/StackAdapt/Reddit) */}
              {channel.channel !== 'google_search' && channel.targeting && (
                <div className="mb-4 text-sm text-gray-300 bg-gray-900/50 rounded-lg p-3">
                  <p className="font-medium text-gray-400 mb-2">Targeting:</p>
                  {channel.targeting.jobTitles && (
                    <p>• Titles: {channel.targeting.jobTitles.slice(0, 4).join(', ')}</p>
                  )}
                  {channel.targeting.industries && (
                    <p>• Industries: {channel.targeting.industries.slice(0, 4).join(', ')}</p>
                  )}
                  {channel.targeting.audiences && (
                    <p>• Audiences: {channel.targeting.audiences.slice(0, 3).join(', ')}</p>
                  )}
                  {channel.targeting.subreddits && (
                    <p>• Subreddits: {channel.targeting.subreddits.slice(0, 4).join(', ')}</p>
                  )}
                </div>
              )}

              {/* Budget Calculation */}
              <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-3">
                <p className="text-sm text-indigo-300 mb-2">💰 Budget Calculation:</p>
                <p className="text-sm text-gray-400 mb-2">{channel.budgetCalculation?.formula}</p>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Recommended:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white">$</span>
                    <input
                      type="number"
                      value={channel.recommendedBudget}
                      onChange={(e) => updateBudget(channel.channel, parseInt(e.target.value) || 0)}
                      className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-right focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-gray-400">/mo</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      ))}

      {/* Total Budget Summary */}
      <div className="bg-gray-800/50 backdrop-blur rounded-xl p-5 border-2 border-emerald-500/50">
        <h3 className="text-lg font-semibold text-white mb-4">📊 Total Recommended Budget</h3>
        
        <div className="space-y-2 mb-4">
          {channels.filter(c => c.recommended).map(channel => {
            const percent = totalBudget > 0 ? (channel.recommendedBudget / totalBudget) * 100 : 0;
            return (
              <div key={channel.channel} className="flex items-center gap-3">
                <span className="w-32 text-sm text-gray-300">{getChannelName(channel.channel)}</span>
                <div className="flex-1 bg-gray-700 rounded-full h-4">
                  <div
                    className="bg-indigo-600 h-4 rounded-full transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="w-28 text-sm text-gray-300 text-right">
                  ${channel.recommendedBudget.toLocaleString()} ({percent.toFixed(0)}%)
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-gray-700 pt-4">
          <span className="text-lg font-medium text-white">TOTAL</span>
          <span className="text-2xl font-bold text-emerald-400">${totalBudget.toLocaleString()}/month</span>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-700">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={customBudget !== null}
              onChange={(e) => setCustomBudget(e.target.checked ? totalBudget : null)}
              className="text-indigo-600"
            />
            <span className="text-gray-300">Adjust total budget:</span>
            {customBudget !== null && (
              <>
                <span className="text-gray-400">$</span>
                <input
                  type="number"
                  value={customBudget}
                  onChange={(e) => setCustomBudget(parseInt(e.target.value) || 0)}
                  className="w-32 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={applyCustomBudget}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm transition-colors"
                >
                  Apply
                </button>
              </>
            )}
          </label>
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
          onClick={() => onConfirm(channels.filter(c => c.recommended))}
          className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          Generate Campaign Plan →
        </button>
      </div>
    </div>
  );
}
