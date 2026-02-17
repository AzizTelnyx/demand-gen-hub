'use client';

import { useState, useEffect, useRef } from 'react';
import { ExtractedBrief, IcpAnalysis, ChannelResearch, CampaignPlanItem } from '../index';

interface ExtendedBrief extends ExtractedBrief {
  campaignType?: string;
  competitor?: string;
  isCompetitorCampaign?: boolean;
  duration?: { type: string; value: number | null; unit: string | null };
  channels?: string[];
}

interface Props {
  extractedBrief: ExtendedBrief | null;
  icpAnalysis: IcpAnalysis | null;
  channelResearch: ChannelResearch[];
  campaignPlan: CampaignPlanItem[];
  generatedPlan?: PlanData | null;
  onConfirm: (data: CampaignPlanItem[], fullPlan?: any) => void;
  onBack: () => void;
}

interface PlanData {
  summary: {
    campaignName: string;
    objective: string;
    duration: string;
    totalMonthlyBudget: number;
    expectedResults: {
      impressions: string;
      clicks: string;
      leads: string;
    };
  };
  channels: Array<{
    name: string;
    monthlyBudget: number;
    allocation: string;
    funnelStage: string;
    calculation: {
      method: string;
      inputs: Record<string, any>;
      result: number;
    };
    targeting: string[];
    expectedMetrics: {
      impressions: number;
      clicks: number;
      ctr: string;
      cpc: number;
      conversions: string;
    };
    adGroups: string[];
  }>;
  timeline: Record<string, string>;
  successMetrics: string[];
  risks: string[];
  recommendations: string[];
}

export function CampaignPlan({ extractedBrief, icpAnalysis, channelResearch, campaignPlan, generatedPlan, onConfirm, onBack }: Props) {
  const hasFetched = useRef(false);
  const hasCachedData = generatedPlan !== null && generatedPlan !== undefined;
  
  const [isLoading, setIsLoading] = useState(!hasCachedData);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(generatedPlan || null);
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Skip if we already have cached data OR already fetched
    if (hasCachedData || hasFetched.current) {
      setIsLoading(false);
      return;
    }
    
    hasFetched.current = true;
    
    const generatePlan = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch('/api/builder/generate-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignType: extractedBrief?.campaignType || 'lead_gen',
            product: extractedBrief?.product,
            targetAudience: extractedBrief?.targetAudience,
            regions: extractedBrief?.regions,
            channels: extractedBrief?.channels || channelResearch.map(c => c.channel),
            icpAnalysis,
            channelResearch,
            budget: extractedBrief?.budget,
            funnelFocus: extractedBrief?.funnelFocus,
            duration: extractedBrief?.duration,
            goal: extractedBrief?.goal,
            isCompetitorCampaign: extractedBrief?.isCompetitorCampaign,
            competitor: extractedBrief?.competitor,
          }),
        });

        const data = await response.json();
        
        if (data.success && data.plan) {
          setPlan(data.plan);
        } else {
          setError(data.error || 'Failed to generate plan');
        }
      } catch (err) {
        console.error('Generate plan error:', err);
        setError('Failed to generate plan. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    generatePlan();
  }, [extractedBrief, icpAnalysis, channelResearch]);

  const toggleChannel = (channelName: string) => {
    const newSet = new Set(expandedChannels);
    if (newSet.has(channelName)) {
      newSet.delete(channelName);
    } else {
      newSet.add(channelName);
    }
    setExpandedChannels(newSet);
  };

  const handleConfirm = () => {
    if (!plan) return;
    
    // Convert plan to CampaignPlanItem format
    const campaigns: CampaignPlanItem[] = plan.channels.map((ch, idx) => ({
      id: `campaign-${idx + 1}`,
      name: `${plan.summary.campaignName} - ${ch.name}`,
      platform: mapChannelToPlatform(ch.name),
      funnel: ch.funnelStage as any || 'full',
      budget: ch.monthlyBudget,
      adGroups: ch.adGroups.map((ag: any) => {
        // Handle both string and object formats
        if (typeof ag === 'string') {
          return { name: ag, keywords: [] };
        }
        return { 
          name: ag.name || ag, 
          keywords: ag.keywords || [],
          matchTypes: ag.matchTypes || [],
          theme: ag.theme || ''
        };
      }),
      status: 'planned' as const,
    }));
    
    onConfirm(campaigns, plan);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400">Generating campaign plan with AI...</p>
        <p className="text-gray-500 text-sm mt-2">Calculating budgets and building structure</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <div className="text-red-400 mb-4">⚠️ {error}</div>
        <button onClick={onBack} className="px-6 py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white">← Back</button>
      </div>
    );
  }

  if (!plan) {
    return <div className="text-gray-400 text-center py-20">No plan generated</div>;
  }

  const totalBudget = plan.channels.reduce((sum, ch) => sum + ch.monthlyBudget, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Campaign Plan</h2>
        <p className="text-gray-400">AI-generated plan with justified budgets. Review and adjust.</p>
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-white">{plan.summary.campaignName}</h3>
            <p className="text-gray-300 mt-1">{plan.summary.objective}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-green-400">${totalBudget.toLocaleString()}</p>
            <p className="text-gray-400 text-sm">monthly budget</p>
          </div>
        </div>
        
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <p className="text-gray-400 text-xs">Duration</p>
            <p className="text-white font-medium">{plan.summary.duration}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <p className="text-gray-400 text-xs">Est. Impressions</p>
            <p className="text-white font-medium">{plan.summary.expectedResults.impressions}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <p className="text-gray-400 text-xs">Est. Clicks</p>
            <p className="text-white font-medium">{plan.summary.expectedResults.clicks}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <p className="text-gray-400 text-xs">Est. Leads</p>
            <p className="text-white font-medium">{plan.summary.expectedResults.leads}</p>
          </div>
        </div>
      </div>

      {/* Channel Breakdown */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Budget Allocation by Channel</h3>
        
        {plan.channels.map((channel, idx) => (
          <div key={idx} className="bg-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleChannel(channel.name)}
              className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl">{getChannelIcon(channel.name)}</span>
                <div className="text-left">
                  <p className="text-white font-medium">{channel.name}</p>
                  <p className="text-gray-400 text-sm">{channel.funnelStage.toUpperCase()} • {channel.allocation}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-xl font-bold text-green-400">${channel.monthlyBudget.toLocaleString()}</p>
                <span className="text-gray-400">{expandedChannels.has(channel.name) ? '▲' : '▼'}</span>
              </div>
            </button>
            
            {expandedChannels.has(channel.name) && (
              <div className="px-4 pb-4 border-t border-gray-700 pt-4 space-y-4">
                {/* Calculation */}
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Budget Calculation</p>
                  <p className="text-gray-300 text-sm">{channel.calculation.method}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(channel.calculation.inputs).map(([key, val]) => (
                      <span key={key} className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">
                        {key}: {typeof val === 'number' ? val.toLocaleString() : val}
                      </span>
                    ))}
                  </div>
                </div>
                
                {/* Expected Metrics */}
                <div>
                  <p className="text-xs text-gray-500 mb-2">Expected Metrics</p>
                  <div className="grid grid-cols-5 gap-2">
                    <div className="bg-gray-900/50 rounded p-2 text-center">
                      <p className="text-white font-medium">{channel.expectedMetrics.impressions.toLocaleString()}</p>
                      <p className="text-gray-500 text-xs">Impressions</p>
                    </div>
                    <div className="bg-gray-900/50 rounded p-2 text-center">
                      <p className="text-white font-medium">{channel.expectedMetrics.clicks.toLocaleString()}</p>
                      <p className="text-gray-500 text-xs">Clicks</p>
                    </div>
                    <div className="bg-gray-900/50 rounded p-2 text-center">
                      <p className="text-white font-medium">{channel.expectedMetrics.ctr}</p>
                      <p className="text-gray-500 text-xs">CTR</p>
                    </div>
                    <div className="bg-gray-900/50 rounded p-2 text-center">
                      <p className="text-white font-medium">${channel.expectedMetrics.cpc}</p>
                      <p className="text-gray-500 text-xs">CPC</p>
                    </div>
                    <div className="bg-gray-900/50 rounded p-2 text-center">
                      <p className="text-white font-medium">{channel.expectedMetrics.conversions}</p>
                      <p className="text-gray-500 text-xs">Conversions</p>
                    </div>
                  </div>
                </div>
                
                {/* Ad Groups */}
                <div>
                  <p className="text-xs text-gray-500 mb-2">Ad Groups</p>
                  <div className="space-y-3">
                    {channel.adGroups.map((ag: any, i: number) => {
                      // Handle both string format and object format
                      const isObject = typeof ag === 'object' && ag !== null;
                      const name = isObject ? ag.name : ag;
                      const keywords = isObject ? ag.keywords : null;
                      const matchTypes = isObject ? ag.matchTypes : null;
                      const theme = isObject ? ag.theme : null;
                      
                      return (
                        <div key={i} className="bg-gray-900/50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-blue-400 font-medium">{name}</span>
                            {matchTypes && (
                              <div className="flex gap-1">
                                {matchTypes.map((mt: string, j: number) => (
                                  <span key={j} className="px-2 py-0.5 bg-gray-700 text-gray-400 rounded text-xs">{mt}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          {theme && <p className="text-gray-500 text-xs mb-2">{theme}</p>}
                          {keywords && keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {keywords.map((kw: string, j: number) => (
                                <span key={j} className="px-2 py-1 bg-indigo-600/20 text-indigo-300 rounded text-xs border border-indigo-500/30">
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Targeting */}
                <div>
                  <p className="text-xs text-gray-500 mb-2">Targeting</p>
                  <div className="flex flex-wrap gap-2">
                    {channel.targeting.map((t, i) => (
                      <span key={i} className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="bg-gray-800 rounded-xl p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Timeline</h3>
        <div className="space-y-2">
          {Object.entries(plan.timeline).map(([phase, desc]) => (
            <div key={phase} className="flex items-start gap-3">
              <span className="text-blue-400 font-mono text-sm w-24">{phase}</span>
              <span className="text-gray-300">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations & Risks */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <h3 className="text-emerald-400 font-semibold mb-2">✅ Recommendations</h3>
          <ul className="space-y-1">
            {plan.recommendations.map((rec, i) => (
              <li key={i} className="text-gray-300 text-sm">• {rec}</li>
            ))}
          </ul>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <h3 className="text-amber-400 font-semibold mb-2">⚠️ Risks</h3>
          <ul className="space-y-1">
            {plan.risks.map((risk, i) => (
              <li key={i} className="text-gray-300 text-sm">• {risk}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Success Metrics */}
      <div className="bg-gray-800 rounded-xl p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Success Metrics</h3>
        <div className="flex flex-wrap gap-2">
          {plan.successMetrics.map((metric, i) => (
            <span key={i} className="px-3 py-1.5 bg-purple-600/20 text-purple-400 rounded-lg text-sm">{metric}</span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="px-6 py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors">← Back</button>
        <button onClick={handleConfirm} className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors">Generate Ad Copy →</button>
      </div>
    </div>
  );
}

function getChannelIcon(channel: string): string {
  const icons: Record<string, string> = {
    'Google Search': '🔍',
    'Google Display': '🖼️',
    'YouTube': '▶️',
    'LinkedIn': '💼',
    'Reddit': '🤖',
    'StackAdapt': '📊',
    'Meta': '📘',
  };
  return icons[channel] || '📢';
}

function mapChannelToPlatform(channel: string): 'google_ads' | 'linkedin' | 'stackadapt' | 'reddit' {
  if (channel.toLowerCase().includes('google') || channel.toLowerCase().includes('youtube')) return 'google_ads';
  if (channel.toLowerCase().includes('linkedin')) return 'linkedin';
  if (channel.toLowerCase().includes('stackadapt')) return 'stackadapt';
  if (channel.toLowerCase().includes('reddit')) return 'reddit';
  return 'google_ads';
}
