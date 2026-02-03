'use client';

import { useState, useEffect } from 'react';
import { ExtractedBrief, IcpAnalysis, ChannelResearch } from '../index';

interface Props {
  extractedBrief: ExtractedBrief | null;
  icpAnalysis: IcpAnalysis | null;
  channelResearch: ChannelResearch[];
  onConfirm: (data: ChannelResearch[]) => void;
  onBack: () => void;
}

export function ChannelBudget({ extractedBrief, icpAnalysis, channelResearch, onConfirm, onBack }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState('');
  const [channels, setChannels] = useState<ChannelResearch[]>([]);
  const [totalBudget, setTotalBudget] = useState(0);
  const [customBudget, setCustomBudget] = useState<number | null>(null);

  useEffect(() => {
    const runResearch = async () => {
      setIsLoading(true);
      
      setLoadingStage('Researching Google keywords...');
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      setLoadingStage('Building LinkedIn audiences...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setLoadingStage('Analyzing StackAdapt segments...');
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setLoadingStage('Calculating budgets...');
      await new Promise(resolve => setTimeout(resolve, 600));

      // Mock channel research results
      const mockChannels: ChannelResearch[] = [
        {
          channel: 'google_search',
          recommended: true,
          rationale: 'High-intent searches for contact center AI solutions',
          targeting: {
            keywords: [
              { keyword: 'contact center AI', volume: 2400, cpc: 8.5, intent: 'high' },
              { keyword: 'voice AI platform', volume: 1900, cpc: 12.2, intent: 'high' },
              { keyword: 'IVR replacement', volume: 880, cpc: 15.4, intent: 'high' },
              { keyword: 'five9 alternative', volume: 590, cpc: 18.0, intent: 'bofu' },
              { keyword: 'AI customer service', volume: 4200, cpc: 6.2, intent: 'medium' },
            ],
          },
          keywords: [
            { keyword: 'contact center AI', volume: 2400, cpc: 8.5, intent: 'high' },
            { keyword: 'voice AI platform', volume: 1900, cpc: 12.2, intent: 'high' },
            { keyword: 'IVR replacement', volume: 880, cpc: 15.4, intent: 'high' },
            { keyword: 'five9 alternative', volume: 590, cpc: 18.0, intent: 'bofu' },
            { keyword: 'AI customer service', volume: 4200, cpc: 6.2, intent: 'medium' },
          ],
          audienceSize: 10000,
          estimatedCpc: 10.5,
          budgetCalculation: {
            formula: '10,000 searches × 4% CTR × $10.50 CPC × 1.2 buffer',
            result: 5040,
          },
          recommendedBudget: 4500,
        },
        {
          channel: 'linkedin',
          recommended: true,
          rationale: 'Reaches decision makers by title and company',
          targeting: {
            jobTitles: icpAnalysis?.jobTitles || [],
            industries: icpAnalysis?.industries || [],
            companySize: ['500-1000', '1000-5000', '5000+'],
            geo: extractedBrief?.regions || [],
          },
          audienceSize: 48000,
          estimatedCpm: 45,
          budgetCalculation: {
            formula: '48K audience × 40% reach × 4 freq × $45 CPM',
            result: 3456,
          },
          recommendedBudget: 3500,
        },
        {
          channel: 'stackadapt',
          recommended: true,
          rationale: 'Intent-based targeting and retargeting',
          targeting: {
            intentSegments: ['Contact Center Software', 'Voice AI', 'IVR Solutions'],
            firmographics: {
              employeeCount: '500+',
              industries: icpAnalysis?.industries || [],
            },
            geo: extractedBrief?.regions || [],
          },
          audienceSize: 185000,
          estimatedCpm: 12,
          budgetCalculation: {
            formula: '185K × 30% reach × 5 freq × $12 CPM',
            result: 3330,
          },
          recommendedBudget: 3500,
        },
        {
          channel: 'reddit',
          recommended: false,
          rationale: 'Limited enterprise B2B audience for contact centers',
          targeting: {
            subreddits: ['r/customerservice', 'r/callcentres'],
            note: 'Better for developer audiences than enterprise contact centers',
          },
          audienceSize: 50000,
          estimatedCpm: 8,
          budgetCalculation: {
            formula: 'Not recommended for this audience',
            result: 0,
          },
          recommendedBudget: 0,
        },
      ];

      setChannels(mockChannels);
      setTotalBudget(mockChannels.reduce((sum, c) => sum + c.recommendedBudget, 0));
      setIsLoading(false);
    };

    runResearch();
  }, [extractedBrief, icpAnalysis]);

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
    
    // Redistribute proportionally
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
        <p className="text-gray-400">{loadingStage}</p>
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
        <h2 className="text-2xl font-bold text-white mb-2">Channel Research</h2>
        <p className="text-gray-400">Based on your ICP, here's what I found:</p>
      </div>

      {/* Channel Cards */}
      {channels.map(channel => (
        <div
          key={channel.channel}
          className={`bg-gray-800 rounded-lg p-5 border-2 transition-colors ${
            channel.recommended ? 'border-blue-600' : 'border-gray-700 opacity-60'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getChannelIcon(channel.channel)}</span>
              <div>
                <h3 className="text-lg font-semibold text-white">{getChannelName(channel.channel)}</h3>
                <p className="text-sm text-gray-400">{channel.rationale}</p>
              </div>
            </div>
            <button
              onClick={() => toggleChannel(channel.channel)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                channel.recommended
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {channel.recommended ? '✓ Included' : 'Add'}
            </button>
          </div>

          {channel.recommended && (
            <>
              {/* Keywords Table (for Google) */}
              {channel.keywords && channel.keywords.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-300 mb-2">Keywords researched:</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left py-1">Keyword</th>
                        <th className="text-right py-1">Volume</th>
                        <th className="text-right py-1">CPC</th>
                        <th className="text-right py-1">Intent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channel.keywords.slice(0, 5).map((kw, i) => (
                        <tr key={i} className="text-gray-300 border-t border-gray-700">
                          <td className="py-1">{kw.keyword}</td>
                          <td className="text-right">{kw.volume.toLocaleString()}</td>
                          <td className="text-right">${kw.cpc.toFixed(2)}</td>
                          <td className="text-right">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              kw.intent === 'bofu' ? 'bg-green-900 text-green-400' :
                              kw.intent === 'high' ? 'bg-blue-900 text-blue-400' :
                              'bg-gray-700 text-gray-400'
                            }`}>
                              {kw.intent}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Targeting Summary (for LinkedIn/StackAdapt) */}
              {channel.channel !== 'google_search' && channel.targeting && (
                <div className="mb-4 text-sm text-gray-300">
                  <p className="font-medium text-gray-400 mb-1">Targeting:</p>
                  {channel.targeting.jobTitles && (
                    <p>• Titles: {channel.targeting.jobTitles.slice(0, 3).join(', ')}</p>
                  )}
                  {channel.targeting.industries && (
                    <p>• Industries: {channel.targeting.industries.slice(0, 3).join(', ')}</p>
                  )}
                  {channel.targeting.intentSegments && (
                    <p>• Intent: {channel.targeting.intentSegments.join(', ')}</p>
                  )}
                  <p className="mt-1">📊 Estimated Audience: {channel.audienceSize.toLocaleString()}</p>
                </div>
              )}

              {/* Budget Calculation */}
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-sm text-gray-400 mb-2">💰 Budget Calculation:</p>
                <p className="text-sm text-gray-300 mb-2">{channel.budgetCalculation.formula}</p>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Recommended:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white">$</span>
                    <input
                      type="number"
                      value={channel.recommendedBudget}
                      onChange={(e) => updateBudget(channel.channel, parseInt(e.target.value) || 0)}
                      className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-right focus:outline-none focus:border-blue-500"
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
      <div className="bg-gray-800 rounded-lg p-5 border-2 border-green-600">
        <h3 className="text-lg font-semibold text-white mb-4">📊 Total Recommended Budget</h3>
        
        {/* Budget Bars */}
        <div className="space-y-2 mb-4">
          {channels.filter(c => c.recommended).map(channel => {
            const percent = totalBudget > 0 ? (channel.recommendedBudget / totalBudget) * 100 : 0;
            return (
              <div key={channel.channel} className="flex items-center gap-3">
                <span className="w-32 text-sm text-gray-300">{getChannelName(channel.channel)}</span>
                <div className="flex-1 bg-gray-700 rounded-full h-4">
                  <div
                    className="bg-blue-600 h-4 rounded-full transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="w-24 text-sm text-gray-300 text-right">
                  ${channel.recommendedBudget.toLocaleString()} ({percent.toFixed(0)}%)
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-gray-700 pt-4">
          <span className="text-lg font-medium text-white">TOTAL</span>
          <span className="text-2xl font-bold text-green-400">${totalBudget.toLocaleString()}/month</span>
        </div>

        {/* Adjust Total */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={customBudget !== null}
              onChange={(e) => setCustomBudget(e.target.checked ? totalBudget : null)}
              className="text-blue-600"
            />
            <span className="text-gray-300">Adjust total budget to:</span>
            {customBudget !== null && (
              <>
                <span className="text-gray-400">$</span>
                <input
                  type="number"
                  value={customBudget}
                  onChange={(e) => setCustomBudget(parseInt(e.target.value) || 0)}
                  className="w-32 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={applyCustomBudget}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                >
                  Apply
                </button>
              </>
            )}
          </label>
          <p className="text-sm text-gray-500 mt-1">(I'll redistribute proportionally)</p>
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
          className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Generate Plan →
        </button>
      </div>
    </div>
  );
}
