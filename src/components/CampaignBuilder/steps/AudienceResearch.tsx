'use client';

import { useState, useEffect } from 'react';
import { ExtractedBrief, IcpAnalysis } from '../index';

interface Props {
  extractedBrief: ExtractedBrief | null;
  icpAnalysis: IcpAnalysis | null;
  onConfirm: (data: IcpAnalysis) => void;
  onBack: () => void;
}

export function AudienceResearch({ extractedBrief, icpAnalysis, onConfirm, onBack }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState('Analyzing ICP...');
  const [analysis, setAnalysis] = useState<IcpAnalysis>({
    jobTitles: [],
    industries: [],
    companySize: '',
    painPoints: [],
    buyingStage: '',
    competitorsEvaluating: [],
  });

  useEffect(() => {
    const runResearch = async () => {
      setIsLoading(true);
      
      // Simulate research stages
      setLoadingStage('Analyzing ICP...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setLoadingStage('Loading knowledge base...');
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setLoadingStage('Identifying decision makers...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setLoadingStage('Mapping pain points...');
      await new Promise(resolve => setTimeout(resolve, 600));

      // Mock analysis based on extracted brief
      const audience = extractedBrief?.targetAudience?.toLowerCase() || '';
      
      if (audience.includes('contact center') || audience.includes('enterprise')) {
        setAnalysis({
          jobTitles: ['VP Customer Experience', 'Contact Center Director', 'CIO', 'CTO', 'VP Operations'],
          industries: ['Insurance', 'Healthcare', 'Banking', 'Retail', 'Financial Services'],
          companySize: '500+ employees',
          painPoints: [
            'High agent costs and turnover (30-50% annually)',
            'Long wait times affecting CSAT',
            'Legacy IVR frustrating customers',
            'Difficulty scaling for peak periods',
          ],
          buyingStage: 'Evaluating solutions',
          competitorsEvaluating: ['Five9', 'NICE', 'Genesys', 'Talkdesk', 'Twilio Flex'],
        });
      } else {
        setAnalysis({
          jobTitles: ['Software Engineer', 'Backend Developer', 'Full Stack Developer', 'DevOps Engineer', 'CTO'],
          industries: ['Technology', 'SaaS', 'FinTech', 'HealthTech', 'Startups'],
          companySize: '50-5000 employees',
          painPoints: [
            'Poor API documentation',
            'High costs with current provider',
            'Reliability issues',
            'Complex pricing',
          ],
          buyingStage: 'Comparing alternatives',
          competitorsEvaluating: ['Twilio', 'Vonage', 'Bandwidth', 'Plivo'],
        });
      }

      setIsLoading(false);
    };

    runResearch();
  }, [extractedBrief]);

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
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400">{loadingStage}</p>
        <div className="mt-6 w-64 bg-gray-800 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  // Additional options for toggling
  const additionalTitles = ['IT Director', 'Customer Service Manager', 'Head of Digital', 'VP Technology'];
  const additionalIndustries = ['Telecom', 'Travel', 'Hospitality', 'E-commerce', 'Manufacturing'];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Audience Research</h2>
        <p className="text-gray-400">
          Based on "{extractedBrief?.targetAudience}", here's the ICP analysis:
        </p>
      </div>

      {/* Job Titles */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-3">👤 Job Titles (Decision Makers)</h3>
        <div className="flex flex-wrap gap-2">
          {[...analysis.jobTitles, ...additionalTitles].map(title => (
            <button
              key={title}
              onClick={() => toggleItem('jobTitles', title)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                analysis.jobTitles.includes(title)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {analysis.jobTitles.includes(title) ? '✓ ' : ''}{title}
            </button>
          ))}
        </div>
      </div>

      {/* Industries */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-3">🏢 Industries</h3>
        <div className="flex flex-wrap gap-2">
          {[...analysis.industries, ...additionalIndustries].map(industry => (
            <button
              key={industry}
              onClick={() => toggleItem('industries', industry)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                analysis.industries.includes(industry)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {analysis.industries.includes(industry) ? '✓ ' : ''}{industry}
            </button>
          ))}
        </div>
      </div>

      {/* Company Size */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-3">📊 Company Size</h3>
        <div className="flex flex-wrap gap-2">
          {['1-50', '51-200', '201-500', '501-1000', '1001-5000', '5001+'].map(size => (
            <button
              key={size}
              onClick={() => setAnalysis({ ...analysis, companySize: size })}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                analysis.companySize.includes(size.split('-')[0]) || analysis.companySize === size
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {size} employees
            </button>
          ))}
        </div>
      </div>

      {/* Pain Points */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-3">😤 Pain Points Identified</h3>
        <ul className="space-y-2">
          {analysis.painPoints.map((pain, index) => (
            <li key={index} className="flex items-start gap-2 text-gray-300">
              <span className="text-red-400">•</span>
              {pain}
            </li>
          ))}
        </ul>
      </div>

      {/* Competitors */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-3">🎯 Competitors They're Evaluating</h3>
        <div className="flex flex-wrap gap-2">
          {analysis.competitorsEvaluating.map(competitor => (
            <span
              key={competitor}
              className="px-3 py-1.5 bg-red-900/30 text-red-400 rounded-lg text-sm"
            >
              {competitor}
            </span>
          ))}
        </div>
      </div>

      {/* Buying Stage */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-3">📍 Buying Stage</h3>
        <div className="flex gap-2">
          {['Problem aware', 'Solution aware', 'Evaluating solutions', 'Ready to buy'].map(stage => (
            <button
              key={stage}
              onClick={() => setAnalysis({ ...analysis, buyingStage: stage })}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                analysis.buyingStage === stage
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {stage}
            </button>
          ))}
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
          onClick={() => onConfirm(analysis)}
          className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Research Channels →
        </button>
      </div>
    </div>
  );
}
