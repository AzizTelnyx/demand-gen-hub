'use client';

import { useState, useEffect } from 'react';
import { BriefData, ExtractedBrief } from '../index';

interface Props {
  briefData: BriefData | null;
  onConfirm: (data: ExtractedBrief) => void;
  onBack: () => void;
}

export function BriefReview({ briefData, onConfirm, onBack }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [extracted, setExtracted] = useState<ExtractedBrief>({
    product: '',
    targetAudience: '',
    goal: 'leads',
    regions: [],
    budget: { type: 'recommend' },
    funnelFocus: 'full',
    timeline: { start: '', durationMonths: 3 },
    abm: { type: 'broad' },
  });

  useEffect(() => {
    // Simulate API call to parse brief
    const parseBrief = async () => {
      setIsLoading(true);
      // TODO: Call actual API
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock extracted data based on brief
      const notes = briefData?.notes || '';
      setExtracted({
        product: notes.includes('voice') ? 'Voice AI' : notes.includes('SMS') ? 'SMS API' : 'Voice AI',
        targetAudience: notes.includes('contact center') ? 'Enterprise contact centers' : 'Developers',
        goal: notes.includes('demo') ? 'leads' : notes.includes('awareness') ? 'awareness' : 'leads',
        regions: ['US', 'UK'],
        budget: notes.includes('$') ? { type: 'specified', amount: 15000 } : { type: 'recommend' },
        funnelFocus: notes.includes('awareness') ? 'tofu' : 'bofu',
        timeline: { start: new Date().toISOString().split('T')[0], durationMonths: 3 },
        abm: { type: 'broad' },
      });
      setIsLoading(false);
    };

    parseBrief();
  }, [briefData]);

  const toggleRegion = (region: string) => {
    setExtracted(prev => ({
      ...prev,
      regions: prev.regions.includes(region)
        ? prev.regions.filter(r => r !== region)
        : [...prev.regions, region],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400">Analyzing your brief...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Brief Review</h2>
        <p className="text-gray-400">I extracted the following. Please confirm or edit.</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Product */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Product</label>
          <input
            type="text"
            value={extracted.product}
            onChange={(e) => setExtracted({ ...extracted, product: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Goal */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Goal</label>
          <div className="flex gap-2">
            {(['awareness', 'leads', 'pipeline'] as const).map(goal => (
              <button
                key={goal}
                onClick={() => setExtracted({ ...extracted, goal })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  extracted.goal === goal
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {goal.charAt(0).toUpperCase() + goal.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Target Audience */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Target Audience</label>
        <input
          type="text"
          value={extracted.targetAudience}
          onChange={(e) => setExtracted({ ...extracted, targetAudience: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Regions */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Regions</label>
        <div className="flex flex-wrap gap-2">
          {['US', 'UK', 'Canada', 'Germany', 'France', 'Australia', 'APAC', 'LATAM', 'Global'].map(region => (
            <button
              key={region}
              onClick={() => toggleRegion(region)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                extracted.regions.includes(region)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Timeline */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Timeline</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={extracted.timeline.start}
              onChange={(e) => setExtracted({
                ...extracted,
                timeline: { ...extracted.timeline, start: e.target.value }
              })}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            />
            <select
              value={extracted.timeline.durationMonths}
              onChange={(e) => setExtracted({
                ...extracted,
                timeline: { ...extracted.timeline, durationMonths: parseInt(e.target.value) }
              })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value={1}>1 month</option>
              <option value={2}>2 months</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </div>
        </div>

        {/* Funnel Focus */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Funnel Focus</label>
          <select
            value={extracted.funnelFocus}
            onChange={(e) => setExtracted({ ...extracted, funnelFocus: e.target.value as ExtractedBrief['funnelFocus'] })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="tofu">TOFU-heavy (awareness)</option>
            <option value="mofu">MOFU-heavy (consideration)</option>
            <option value="bofu">BOFU-heavy (conversion)</option>
            <option value="full">Full funnel (balanced)</option>
          </select>
        </div>
      </div>

      {/* Budget */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Budget</label>
        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={extracted.budget.type === 'recommend'}
              onChange={() => setExtracted({ ...extracted, budget: { type: 'recommend' } })}
              className="text-blue-600"
            />
            <span className="text-gray-300">Recommend for me (based on research)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={extracted.budget.type === 'specified'}
              onChange={() => setExtracted({ ...extracted, budget: { type: 'specified', amount: 10000 } })}
              className="text-blue-600"
            />
            <span className="text-gray-300">I have a budget:</span>
            {extracted.budget.type === 'specified' && (
              <div className="flex items-center">
                <span className="text-gray-400 mr-1">$</span>
                <input
                  type="number"
                  value={extracted.budget.amount || ''}
                  onChange={(e) => setExtracted({
                    ...extracted,
                    budget: { type: 'specified', amount: parseInt(e.target.value) || 0 }
                  })}
                  className="w-32 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white focus:outline-none focus:border-blue-500"
                  placeholder="10000"
                />
                <span className="text-gray-400 ml-1">/month</span>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* ABM */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">ABM</label>
        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={extracted.abm.type === 'broad'}
              onChange={() => setExtracted({ ...extracted, abm: { type: 'broad' } })}
              className="text-blue-600"
            />
            <span className="text-gray-300">Broad prospecting (no account list)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={extracted.abm.type === 'list'}
              onChange={() => setExtracted({ ...extracted, abm: { type: 'list' } })}
              className="text-blue-600"
            />
            <span className="text-gray-300">I have a target account list</span>
          </label>
          {extracted.abm.type === 'list' && (
            <input
              type="url"
              value={extracted.abm.listUrl || ''}
              onChange={(e) => setExtracted({
                ...extracted,
                abm: { type: 'list', listUrl: e.target.value }
              })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              placeholder="Google Sheet URL or upload CSV..."
            />
          )}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={extracted.abm.type === 'build'}
              onChange={() => setExtracted({ ...extracted, abm: { type: 'build' } })}
              className="text-blue-600"
            />
            <span className="text-gray-300">Build me an account list based on criteria</span>
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
          onClick={() => onConfirm(extracted)}
          className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Research Audience →
        </button>
      </div>
    </div>
  );
}
