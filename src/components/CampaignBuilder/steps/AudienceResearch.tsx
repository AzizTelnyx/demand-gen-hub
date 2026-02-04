'use client';

import { useState, useEffect, useRef } from 'react';
import { ExtractedBrief, IcpAnalysis } from '../index';

interface Props {
  extractedBrief: ExtractedBrief | null;
  icpAnalysis: IcpAnalysis | null;
  onConfirm: (data: IcpAnalysis) => void;
  onBack: () => void;
}

interface ExtendedIcpAnalysis extends IcpAnalysis {
  buyingTriggers?: string[];
  objections?: string[];
  valueProps?: string[];
}

export function AudienceResearch({ extractedBrief, icpAnalysis, onConfirm, onBack }: Props) {
  // Track if we've already fetched to prevent re-fetching on back navigation
  const hasFetched = useRef(false);
  const hasCachedData = icpAnalysis !== null;
  
  const [isLoading, setIsLoading] = useState(!hasCachedData);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ExtendedIcpAnalysis>(() => {
    if (icpAnalysis) {
      return {
        ...icpAnalysis,
        buyingTriggers: (icpAnalysis as any).buyingTriggers || [],
        objections: (icpAnalysis as any).objections || [],
        valueProps: (icpAnalysis as any).valueProps || [],
      };
    }
    return {
      jobTitles: [],
      industries: [],
      companySize: '',
      painPoints: [],
      buyingStage: '',
      competitorsEvaluating: [],
      buyingTriggers: [],
      objections: [],
      valueProps: [],
    };
  });

  useEffect(() => {
    // Skip if we have cached data OR we've already fetched
    if (hasCachedData || hasFetched.current) {
      setIsLoading(false);
      return;
    }
    
    hasFetched.current = true;
    
    const runResearch = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch('/api/builder/research-audience', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product: extractedBrief?.product,
            targetAudience: extractedBrief?.targetAudience,
            regions: extractedBrief?.regions,
            isCompetitorCampaign: (extractedBrief as any)?.isCompetitorCampaign,
            competitorMentioned: (extractedBrief as any)?.competitorMentioned,
          }),
        });
        
        const data = await response.json();
        
        if (data.success && data.icpAnalysis) {
          setAnalysis({
            ...data.icpAnalysis,
            buyingTriggers: data.icpAnalysis.buyingTriggers || [],
            objections: data.icpAnalysis.objections || [],
            valueProps: data.icpAnalysis.valueProps || [],
          });
        } else {
          setError('Failed to analyze audience');
        }
      } catch (err) {
        console.error('Error researching audience:', err);
        setError('Failed to research audience. Please try again.');
      }

      setIsLoading(false);
    };

    runResearch();
  }, [extractedBrief, hasCachedData]);

  const toggleItem = (field: 'jobTitles' | 'industries' | 'competitorsEvaluating', item: string) => {
    setAnalysis(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400 text-lg">Researching target audience...</p>
        <p className="text-gray-500 text-sm mt-2">Analyzing ICPs, pain points, and buying signals</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={() => {
            hasFetched.current = false;
            setError(null);
            setIsLoading(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-white">🎯 Audience Research</h2>
        <p className="text-gray-400 text-sm mt-1">AI-generated ICP analysis based on your brief</p>
      </div>

      {/* Job Titles */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="font-semibold text-white mb-3">Job Titles</h3>
        <div className="flex flex-wrap gap-2">
          {analysis.jobTitles.map((title, idx) => (
            <span
              key={idx}
              onClick={() => toggleItem('jobTitles', title)}
              className="px-3 py-1 bg-blue-600/30 text-blue-300 rounded-full text-sm cursor-pointer hover:bg-blue-600/50"
            >
              {title}
            </span>
          ))}
        </div>
      </div>

      {/* Industries */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="font-semibold text-white mb-3">Industries</h3>
        <div className="flex flex-wrap gap-2">
          {analysis.industries.map((industry, idx) => (
            <span
              key={idx}
              onClick={() => toggleItem('industries', industry)}
              className="px-3 py-1 bg-purple-600/30 text-purple-300 rounded-full text-sm cursor-pointer hover:bg-purple-600/50"
            >
              {industry}
            </span>
          ))}
        </div>
      </div>

      {/* Company Size */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="font-semibold text-white mb-3">Company Size</h3>
        <p className="text-gray-300">{analysis.companySize}</p>
      </div>

      {/* Pain Points */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="font-semibold text-white mb-3">🔥 Pain Points</h3>
        <ul className="space-y-2">
          {analysis.painPoints.map((pain, idx) => (
            <li key={idx} className="text-gray-300 flex items-start gap-2">
              <span className="text-red-400">•</span>
              {pain}
            </li>
          ))}
        </ul>
      </div>

      {/* Buying Triggers */}
      {analysis.buyingTriggers && analysis.buyingTriggers.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold text-white mb-3">⚡ Buying Triggers</h3>
          <ul className="space-y-2">
            {analysis.buyingTriggers.map((trigger, idx) => (
              <li key={idx} className="text-gray-300 flex items-start gap-2">
                <span className="text-yellow-400">•</span>
                {trigger}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Objections */}
      {analysis.objections && analysis.objections.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold text-white mb-3">🚧 Common Objections</h3>
          <ul className="space-y-2">
            {analysis.objections.map((obj, idx) => (
              <li key={idx} className="text-gray-300 flex items-start gap-2">
                <span className="text-orange-400">•</span>
                {obj}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Value Props */}
      {analysis.valueProps && analysis.valueProps.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold text-white mb-3">✅ Value Propositions</h3>
          <ul className="space-y-2">
            {analysis.valueProps.map((val, idx) => (
              <li key={idx} className="text-gray-300 flex items-start gap-2">
                <span className="text-green-400">•</span>
                {val}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Competitors */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="font-semibold text-white mb-3">🎯 Competitors Evaluating</h3>
        <div className="flex flex-wrap gap-2">
          {analysis.competitorsEvaluating.map((comp, idx) => (
            <span
              key={idx}
              onClick={() => toggleItem('competitorsEvaluating', comp)}
              className="px-3 py-1 bg-red-600/30 text-red-300 rounded-full text-sm cursor-pointer hover:bg-red-600/50"
            >
              {comp}
            </span>
          ))}
        </div>
      </div>

      {/* Buying Stage */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="font-semibold text-white mb-3">📍 Buying Stage</h3>
        <p className="text-gray-300">{analysis.buyingStage}</p>
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
          onClick={() => onConfirm(analysis)}
          className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          Research Channels →
        </button>
      </div>
    </div>
  );
}
