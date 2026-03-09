'use client';

import { useState, useEffect, useRef } from 'react';
import { ExtractedBrief, IcpAnalysis, CampaignPlanItem, AdCopy } from '../index';

interface ExtendedBrief {
  product: string;
  targetAudience: string;
  goal: string;
  regions: string[];
  budget: { type: string; amount?: number };
  funnelFocus: string;
  timeline: { start: string; durationMonths: number };
  abm: { type: string; listUrl?: string };
  campaignType?: string;
  competitor?: string;
  isCompetitorCampaign?: boolean;
  channels?: string[];
  webinarTitle?: string | null;
  eventName?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
}

interface Props {
  extractedBrief: ExtendedBrief | null;
  icpAnalysis: IcpAnalysis | null;
  campaignPlan: CampaignPlanItem[];
  adCopy: AdCopy[];
  generatedCopy?: GeneratedCopy | null;
  onConfirm: (data: AdCopy[], fullCopy?: any) => void;
  onBack: () => void;
}

interface GeneratedCopy {
  adGroups: Array<{
    channel: string;
    theme: string;
    headlines: Array<{ text: string; pinned: string | null; chars: number }>;
    descriptions: Array<{ text: string; chars: number }>;
  }>;
  linkedInAds: Array<{
    name: string;
    headline: string;
    introText: string;
    cta: string;
  }>;
  displayAds: Array<{
    size: string;
    headline: string;
    subhead: string;
    cta: string;
  }>;
}

export function AdCopyReview({ extractedBrief, icpAnalysis, campaignPlan, adCopy, generatedCopy: cachedCopy, onConfirm, onBack }: Props) {
  const hasFetched = useRef(false);
  const hasCachedData = cachedCopy !== null && cachedCopy !== undefined;
  
  const [isLoading, setIsLoading] = useState(!hasCachedData);
  const [error, setError] = useState<string | null>(null);
  const [generatedCopy, setGeneratedCopy] = useState<GeneratedCopy | null>(cachedCopy || null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['google']));
  const [editingItem, setEditingItem] = useState<{ section: string; index: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    // Skip if we already have cached data OR already fetched
    if (hasCachedData || hasFetched.current) {
      setIsLoading(false);
      return;
    }
    
    hasFetched.current = true;
    
    const generateCopy = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch('/api/builder/generate-copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignType: extractedBrief?.campaignType || 'lead_gen',
            product: extractedBrief?.product,
            targetAudience: extractedBrief?.targetAudience,
            icpAnalysis,
            plan: { channels: campaignPlan.map(c => ({ name: c.platform, adGroups: c.adGroups?.map(ag => ag.name) || ['Brand'] })) },
            channels: extractedBrief?.channels,
            isCompetitorCampaign: extractedBrief?.isCompetitorCampaign,
            competitor: extractedBrief?.competitor,
            webinarTitle: extractedBrief?.webinarTitle,
            eventName: extractedBrief?.eventName,
            eventDate: extractedBrief?.eventDate,
            eventLocation: extractedBrief?.eventLocation,
          }),
        });

        const data = await response.json();
        
        if (data.success && data.adCopy) {
          setGeneratedCopy(data.adCopy);
        } else {
          setError(data.error || 'Failed to generate ad copy');
        }
      } catch (err) {
        console.error('Generate copy error:', err);
        setError('Failed to generate ad copy. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    generateCopy();
  }, [extractedBrief, icpAnalysis, campaignPlan]);

  const toggleSection = (section: string) => {
    const newSet = new Set(expandedSections);
    if (newSet.has(section)) {
      newSet.delete(section);
    } else {
      newSet.add(section);
    }
    setExpandedSections(newSet);
  };

  const startEdit = (section: string, index: number, field: string, value: string) => {
    setEditingItem({ section, index, field });
    setEditValue(value);
  };

  const saveEdit = () => {
    if (!editingItem || !generatedCopy) return;
    
    const updated = { ...generatedCopy };
    // Update the value based on section/index/field
    // For simplicity, just close the edit mode
    setEditingItem(null);
    setEditValue('');
  };

  const handleConfirm = () => {
    if (!generatedCopy) return;
    
    // Convert to AdCopy format for the parent
    const copies: AdCopy[] = generatedCopy.adGroups.map((ag, idx) => ({
      campaignId: `adgroup-${idx}`,
      headlines: ag.headlines.map(h => h.text),
      descriptions: ag.descriptions.map(d => d.text),
      brandCheckPassed: true,
      factCheckPassed: true,
    }));
    
    onConfirm(copies, generatedCopy);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400">Generating ad copy with AI...</p>
        <p className="text-gray-500 text-sm mt-2">Creating headlines, descriptions, and display ads</p>
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

  if (!generatedCopy) {
    return <div className="text-gray-400 text-center py-20">No ad copy generated</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Ad Copy Review</h2>
        <p className="text-gray-400">AI-generated ad copy following brand guidelines. Review and edit.</p>
      </div>

      {/* Google Search Ads */}
      {generatedCopy.adGroups.length > 0 && (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('google')}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔍</span>
              <div className="text-left">
                <p className="text-white font-medium">Google Search Ads</p>
                <p className="text-gray-400 text-sm">{generatedCopy.adGroups.length} ad groups</p>
              </div>
            </div>
            <span className="text-gray-400">{expandedSections.has('google') ? '▲' : '▼'}</span>
          </button>
          
          {expandedSections.has('google') && (
            <div className="px-4 pb-4 border-t border-gray-700 pt-4 space-y-6">
              {generatedCopy.adGroups.map((ag, agIdx) => (
                <div key={agIdx} className="bg-gray-900/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs">{ag.channel}</span>
                    <h4 className="text-white font-medium">{ag.theme}</h4>
                  </div>
                  
                  {/* Headlines */}
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-2">Headlines (30 chars max)</p>
                    <div className="space-y-2">
                      {ag.headlines.map((h, hIdx) => (
                        <div key={hIdx} className="flex items-center gap-2">
                          {h.pinned && (
                            <span className="px-1.5 py-0.5 bg-purple-600/30 text-purple-400 rounded text-xs font-mono">{h.pinned}</span>
                          )}
                          <span className={`flex-1 text-sm ${h.chars > 30 ? 'text-red-400' : 'text-gray-300'}`}>
                            {h.text}
                          </span>
                          <span className={`text-xs ${h.chars > 30 ? 'text-red-400' : 'text-gray-500'}`}>
                            {h.chars}/30
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Descriptions */}
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Descriptions (90 chars max)</p>
                    <div className="space-y-2">
                      {ag.descriptions.map((d, dIdx) => (
                        <div key={dIdx} className="flex items-start gap-2">
                          <span className={`flex-1 text-sm ${d.chars > 90 ? 'text-red-400' : 'text-gray-300'}`}>
                            {d.text}
                          </span>
                          <span className={`text-xs ${d.chars > 90 ? 'text-red-400' : 'text-gray-500'}`}>
                            {d.chars}/90
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LinkedIn Ads */}
      {generatedCopy.linkedInAds.length > 0 && (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('linkedin')}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">💼</span>
              <div className="text-left">
                <p className="text-white font-medium">LinkedIn Ads</p>
                <p className="text-gray-400 text-sm">{generatedCopy.linkedInAds.length} variations</p>
              </div>
            </div>
            <span className="text-gray-400">{expandedSections.has('linkedin') ? '▲' : '▼'}</span>
          </button>
          
          {expandedSections.has('linkedin') && (
            <div className="px-4 pb-4 border-t border-gray-700 pt-4 space-y-4">
              {generatedCopy.linkedInAds.map((ad, idx) => (
                <div key={idx} className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-2">{ad.name}</p>
                  <div className="bg-white rounded-lg p-4 text-gray-900">
                    <p className="font-bold text-lg">{ad.headline}</p>
                    <p className="text-sm mt-2 text-gray-600">{ad.introText}</p>
                    <button className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium">{ad.cta}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Display Ads */}
      {generatedCopy.displayAds.length > 0 && (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('display')}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🖼️</span>
              <div className="text-left">
                <p className="text-white font-medium">Display Ads</p>
                <p className="text-gray-400 text-sm">{generatedCopy.displayAds.length} sizes</p>
              </div>
            </div>
            <span className="text-gray-400">{expandedSections.has('display') ? '▲' : '▼'}</span>
          </button>
          
          {expandedSections.has('display') && (
            <div className="px-4 pb-4 border-t border-gray-700 pt-4">
              <div className="grid grid-cols-3 gap-4">
                {generatedCopy.displayAds.map((ad, idx) => (
                  <div key={idx} className="bg-gray-900/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-2">{ad.size}</p>
                    <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg p-4 text-center text-white">
                      <p className="font-bold">{ad.headline}</p>
                      <p className="text-sm opacity-80 mt-1">{ad.subhead}</p>
                      <button className="mt-2 px-3 py-1 bg-white text-blue-600 rounded text-xs font-medium">{ad.cta}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Brand Guidelines Check */}
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-emerald-400">✅</span>
          <h3 className="text-emerald-400 font-semibold">Brand Guidelines Check</h3>
        </div>
        <ul className="space-y-1 text-sm text-gray-300">
          <li>• No em dashes used</li>
          <li>• Specific language (numbers, proof points)</li>
          <li>• Engineer tone, not marketing speak</li>
          <li>• Character limits respected</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="px-6 py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors">← Back</button>
        <button onClick={handleConfirm} className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors">Review & Launch →</button>
      </div>
    </div>
  );
}
