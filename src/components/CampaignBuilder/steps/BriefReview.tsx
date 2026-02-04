'use client';

import { useState, useEffect } from 'react';
import { BriefData, ExtractedBrief } from '../index';

interface Props {
  briefData: BriefData | null;
  onConfirm: (data: ExtractedBrief) => void;
  onBack: () => void;
}

const CAMPAIGN_TYPES = {
  lead_gen: { name: 'Lead Generation', icon: '🎯', description: 'Standard funnel campaigns' },
  brand: { name: 'Brand Awareness', icon: '✨', description: 'Brand awareness/protection' },
  competitor: { name: 'Competitor Conquest', icon: '⚔️', description: 'Target competitor users' },
  webinar: { name: 'Webinar Promotion', icon: '🎥', description: 'Drive registrations' },
  event: { name: 'Event Promotion', icon: '📅', description: 'Conferences, meetups' },
  social_boost: { name: 'Social Boost', icon: '📱', description: 'Boost organic posts' },
  commercial: { name: 'Commercial/Promo', icon: '🎉', description: 'Seasonal promotions' },
  partnership: { name: 'Partnership', icon: '🤝', description: 'Co-marketing' },
  retargeting: { name: 'Retargeting', icon: '🔄', description: 'Website visitors' },
};

const PRODUCTS = [
  'Voice AI', 'Voice API', 'Voice SDK', 'SMS API', 'MMS', 'RCS',
  'SIP Trunking', 'IoT', 'Numbers', 'Verify', 'Number Lookup',
  'Fax API', 'Video API', 'TTS API', 'STT API', 'Microsoft Teams'
];

const COMPETITORS = [
  'Twilio', 'Vonage', 'Bandwidth', 'Plivo', 'MessageBird', 'Sinch',
  'LiveKit', 'Pipecat', 'Vapi', 'Retell', 'ElevenLabs',
  'Five9', 'NICE', 'Genesys', 'Talkdesk', 'Amazon Connect', 'Hologram', 'KORE'
];

const REGION_OPTIONS = ['AMER', 'EMEA', 'APAC', 'MENA', 'LATAM', 'GLOBAL'];
const COUNTRY_OPTIONS = ['US', 'UK', 'Germany', 'France', 'Netherlands', 'UAE', 'Saudi Arabia', 'Australia', 'Singapore', 'Japan', 'India', 'Philippines', 'Thailand', 'Canada', 'Brazil'];
const CHANNEL_OPTIONS = ['Google Search', 'Google Display', 'YouTube', 'LinkedIn', 'Reddit', 'StackAdapt', 'Meta', 'Hacker News'];

interface Duration {
  type: string;
  value: number | null;
  unit: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface ExtendedBrief extends ExtractedBrief {
  campaignType?: string;
  competitor?: string;
  isCompetitorCampaign?: boolean;
  geography?: { regions: string[]; countries: string[]; cities: string[] };
  duration?: Duration;
  webinarTitle?: string | null;
  webinarDate?: string | null;
  eventName?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  postUrl?: string | null;
  promoName?: string | null;
  partnerName?: string | null;
  suggestedName?: string;
  channels?: string[];
  keyMessages?: string[];
  verticalFocus?: string | null;
}

export function BriefReview({ briefData, onConfirm, onBack }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllRegions, setShowAllRegions] = useState(false);
  const [extracted, setExtracted] = useState<ExtendedBrief>({
    campaignType: 'lead_gen',
    product: '',
    targetAudience: '',
    goal: 'leads',
    regions: [],
    channels: [],
    budget: { type: 'recommend' },
    funnelFocus: 'full',
    timeline: { start: '', durationMonths: 3 },
    abm: { type: 'broad' },
    geography: { regions: [], countries: [], cities: [] },
    duration: { type: 'indefinite', value: null, unit: null, startDate: null, endDate: null },
  });

  useEffect(() => {
    const parseBrief = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch('/api/builder/parse-brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: briefData?.notes || '' }),
        });

        const data = await response.json();
        
        if (data.success && data.extracted) {
          setExtracted({
            ...data.extracted,
            timeline: data.extracted.timeline || { start: new Date().toISOString().split('T')[0], durationMonths: null },
          });
        } else {
          setError(data.error || 'Failed to parse brief');
        }
      } catch (err) {
        console.error('Parse brief error:', err);
        setError('Failed to parse brief. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    if (briefData?.notes) {
      parseBrief();
    } else {
      setIsLoading(false);
    }
  }, [briefData]);

  const toggleCountry = (country: string) => {
    const currentCountries = extracted.geography?.countries || [];
    const newCountries = currentCountries.includes(country)
      ? currentCountries.filter(c => c !== country)
      : [...currentCountries, country];
    
    setExtracted(prev => ({
      ...prev,
      geography: { ...prev.geography!, countries: newCountries },
      regions: newCountries,
    }));
  };

  const toggleRegion = (region: string) => {
    const currentRegions = extracted.geography?.regions || [];
    const newRegions = currentRegions.includes(region)
      ? currentRegions.filter(r => r !== region)
      : [...currentRegions, region];
    
    setExtracted(prev => ({
      ...prev,
      geography: { ...prev.geography!, regions: newRegions },
    }));
  };

  const toggleChannel = (channel: string) => {
    const currentChannels = extracted.channels || [];
    setExtracted(prev => ({
      ...prev,
      channels: currentChannels.includes(channel)
        ? currentChannels.filter(c => c !== channel)
        : [...currentChannels, channel],
    }));
  };

  const setDurationType = (type: string) => {
    setExtracted(prev => ({
      ...prev,
      duration: { 
        type, 
        value: type === 'fixed' ? 3 : null, 
        unit: type === 'fixed' ? 'months' : null,
        startDate: type === 'dateRange' ? new Date().toISOString().split('T')[0] : null,
        endDate: null,
      },
    }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400">Analyzing your brief with AI...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <div className="text-red-400 mb-4">⚠️ {error}</div>
        <button onClick={onBack} className="px-6 py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white">← Try Again</button>
      </div>
    );
  }

  const campaignType = extracted.campaignType || 'lead_gen';
  const duration: Duration = extracted.duration || { type: 'indefinite', value: null, unit: null, startDate: null, endDate: null };
  const geography = extracted.geography || { regions: [], countries: [], cities: [] };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Brief Review</h2>
        <p className="text-gray-400">AI extracted the following. Confirm or edit.</p>
      </div>

      {/* Suggested Campaign Name */}
      {extracted.suggestedName && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
          <p className="text-sm text-indigo-400 mb-1">Suggested Campaign Name</p>
          <p className="text-white font-mono">{extracted.suggestedName}</p>
        </div>
      )}

      {/* Campaign Type Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">Campaign Type</label>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(CAMPAIGN_TYPES).map(([key, info]) => (
            <button
              key={key}
              onClick={() => setExtracted({ ...extracted, campaignType: key })}
              className={`p-2.5 rounded-lg text-left transition-all ${
                campaignType === key
                  ? 'bg-blue-600/20 border-2 border-blue-500'
                  : 'bg-gray-800/50 border border-gray-700/50 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{info.icon}</span>
                <span className={`text-sm font-medium ${campaignType === key ? 'text-white' : 'text-gray-300'}`}>{info.name}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Type-specific fields */}
      {campaignType === 'competitor' && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
          <label className="block text-sm font-medium text-orange-400 mb-2">Target Competitor</label>
          <select
            value={extracted.competitor || ''}
            onChange={(e) => setExtracted({ ...extracted, competitor: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            <option value="">Select competitor...</option>
            {COMPETITORS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {campaignType === 'webinar' && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 space-y-3">
          <p className="text-xs text-purple-400/70 mb-2">Optional — used for ad copy generation</p>
          <div>
            <label className="block text-sm font-medium text-purple-400 mb-2">Webinar Title <span className="text-purple-400/50 font-normal">(optional)</span></label>
            <input type="text" value={extracted.webinarTitle || ''} onChange={(e) => setExtracted({ ...extracted, webinarTitle: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" placeholder="e.g., Building Voice AI Agents with Telnyx" />
          </div>
          <div>
            <label className="block text-sm font-medium text-purple-400 mb-2">Webinar Date <span className="text-purple-400/50 font-normal">(optional)</span></label>
            <input type="date" value={extracted.webinarDate || ''} onChange={(e) => setExtracted({ ...extracted, webinarDate: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
          </div>
        </div>
      )}

      {campaignType === 'event' && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-3">
          <p className="text-xs text-emerald-400/70 mb-2">Optional — used for ad copy generation</p>
          <div>
            <label className="block text-sm font-medium text-emerald-400 mb-2">Event Name <span className="text-emerald-400/50 font-normal">(optional)</span></label>
            <input type="text" value={extracted.eventName || ''} onChange={(e) => setExtracted({ ...extracted, eventName: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" placeholder="e.g., Voice AI Connect Sydney" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-emerald-400 mb-2">Event Date <span className="text-emerald-400/50 font-normal">(optional)</span></label>
              <input type="date" value={extracted.eventDate || ''} onChange={(e) => setExtracted({ ...extracted, eventDate: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-emerald-400 mb-2">Location <span className="text-emerald-400/50 font-normal">(optional)</span></label>
              <input type="text" value={extracted.eventLocation || ''} onChange={(e) => setExtracted({ ...extracted, eventLocation: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" placeholder="e.g., Sydney, Australia" />
            </div>
          </div>
        </div>
      )}

      {campaignType === 'social_boost' && (
        <div className="bg-pink-500/10 border border-pink-500/30 rounded-xl p-4">
          <label className="block text-sm font-medium text-pink-400 mb-2">Post URL to Boost <span className="text-pink-400/50 font-normal">(optional)</span></label>
          <input type="url" value={extracted.postUrl || ''} onChange={(e) => setExtracted({ ...extracted, postUrl: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" placeholder="https://linkedin.com/posts/..." />
        </div>
      )}

      {campaignType === 'commercial' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <label className="block text-sm font-medium text-amber-400 mb-2">Promotion Name <span className="text-amber-400/50 font-normal">(optional)</span></label>
          <input type="text" value={extracted.promoName || ''} onChange={(e) => setExtracted({ ...extracted, promoName: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" placeholder="e.g., Black Friday, Product Launch" />
        </div>
      )}

      {campaignType === 'partnership' && (
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4">
          <label className="block text-sm font-medium text-cyan-400 mb-2">Partner Name <span className="text-cyan-400/50 font-normal">(optional)</span></label>
          <input type="text" value={extracted.partnerName || ''} onChange={(e) => setExtracted({ ...extracted, partnerName: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" placeholder="e.g., AWS, Google Cloud" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Product */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Product <span className="text-gray-500 font-normal">(optional)</span></label>
          <select value={extracted.product || ''} onChange={(e) => setExtracted({ ...extracted, product: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white">
            <option value="">Not specified</option>
            {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Goal */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Goal</label>
          <select value={extracted.goal} onChange={(e) => setExtracted({ ...extracted, goal: e.target.value as any })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white">
            <option value="awareness">Awareness</option>
            <option value="leads">Leads</option>
            <option value="pipeline">Pipeline</option>
            <option value="registrations">Registrations</option>
            <option value="engagement">Engagement</option>
          </select>
        </div>
      </div>

      {/* Target Audience */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Target Audience <span className="text-gray-500 font-normal">(optional — AI will research if blank)</span></label>
        <input type="text" value={extracted.targetAudience || ''} onChange={(e) => setExtracted({ ...extracted, targetAudience: e.target.value })}
          placeholder="e.g., Developers, Enterprise Contact Centers" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
      </div>

      {/* Geography - Cities (if detected) */}
      {geography.cities.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Cities Detected <span className="text-gray-500">(for geo-targeting)</span></label>
          <div className="flex flex-wrap gap-2">
            {geography.cities.map(city => (
              <span key={city} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-sm">
                📍 {city}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Geography - Countries */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-300">Countries / Regions</label>
          <button onClick={() => setShowAllRegions(!showAllRegions)} className="text-xs text-blue-400 hover:text-blue-300">
            {showAllRegions ? 'Show less' : 'Show all'}
          </button>
        </div>
        
        {/* Countries */}
        <div className="flex flex-wrap gap-2 mb-3">
          {(showAllRegions ? COUNTRY_OPTIONS : [...new Set([...geography.countries, 'US', 'UK', 'Germany', 'UAE', 'Singapore', 'Australia'])]).map(country => (
            <button key={country} onClick={() => toggleCountry(country)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                geography.countries.includes(country) ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}>
              {geography.countries.includes(country) ? '✓ ' : ''}{country}
            </button>
          ))}
        </div>
        
        {/* Meta-Regions */}
        <p className="text-xs text-gray-500 mb-1">Or select a region:</p>
        <div className="flex flex-wrap gap-2">
          {REGION_OPTIONS.map(region => (
            <button key={region} onClick={() => toggleRegion(region)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                geography.regions.includes(region) ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}>
              {geography.regions.includes(region) ? '✓ ' : ''}{region}
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Duration</label>
        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="radio" checked={duration.type === 'indefinite'} onChange={() => setDurationType('indefinite')} className="text-blue-600" />
            <span className="text-gray-300">No end date <span className="text-gray-500">(runs until paused)</span></span>
          </label>
          
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="radio" checked={duration.type === 'fixed'} onChange={() => setDurationType('fixed')} className="text-blue-600" />
            <span className="text-gray-300">Run for:</span>
            {duration.type === 'fixed' && (
              <div className="flex items-center gap-2">
                <input type="number" min="1" value={duration.value || ''} 
                  onChange={(e) => setExtracted({ ...extracted, duration: { type: 'fixed', value: parseInt(e.target.value) || null, unit: duration.unit || 'months', startDate: null, endDate: null } })}
                  className="w-20 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white" />
                <select value={duration.unit || 'months'}
                  onChange={(e) => setExtracted({ ...extracted, duration: { type: 'fixed', value: duration.value, unit: e.target.value, startDate: null, endDate: null } })}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white">
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                  <option value="months">months</option>
                </select>
              </div>
            )}
          </label>
          
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="radio" checked={duration.type === 'dateRange'} onChange={() => setDurationType('dateRange')} className="text-blue-600" />
            <span className="text-gray-300">Specific dates:</span>
          </label>
          {duration.type === 'dateRange' && (
            <div className="flex items-center gap-2 ml-6">
              <input type="date" value={duration.startDate || ''} 
                onChange={(e) => setExtracted({ ...extracted, duration: { type: 'dateRange', value: null, unit: null, startDate: e.target.value, endDate: duration.endDate || null } })}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white" />
              <span className="text-gray-400">to</span>
              <input type="date" value={duration.endDate || ''} 
                onChange={(e) => setExtracted({ ...extracted, duration: { type: 'dateRange', value: null, unit: null, startDate: duration.startDate || null, endDate: e.target.value } })}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Channels */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Channels</label>
        <div className="flex flex-wrap gap-2">
          {CHANNEL_OPTIONS.map(channel => (
            <button key={channel} onClick={() => toggleChannel(channel)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                (extracted.channels || []).includes(channel) ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}>
              {(extracted.channels || []).includes(channel) ? '✓ ' : ''}{channel}
            </button>
          ))}
        </div>
      </div>

      {/* Funnel Focus (for lead gen) */}
      {campaignType === 'lead_gen' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Funnel Focus</label>
          <div className="flex gap-2">
            {['tofu', 'mofu', 'bofu', 'full'].map(stage => (
              <button key={stage} onClick={() => setExtracted({ ...extracted, funnelFocus: stage as any })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  extracted.funnelFocus === stage ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}>
                {stage === 'full' ? 'Full Funnel' : stage.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Budget */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Budget</label>
        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="radio" checked={extracted.budget.type === 'recommend'} onChange={() => setExtracted({ ...extracted, budget: { type: 'recommend' } })} className="text-blue-600" />
            <span className="text-gray-300">Recommend based on research</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="radio" checked={extracted.budget.type === 'specified'} onChange={() => setExtracted({ ...extracted, budget: { type: 'specified', amount: 10000 } })} className="text-blue-600" />
            <span className="text-gray-300">I have a budget:</span>
            {extracted.budget.type === 'specified' && (
              <div className="flex items-center">
                <span className="text-gray-400 mr-1">$</span>
                <input type="number" value={extracted.budget.amount || ''} onChange={(e) => setExtracted({ ...extracted, budget: { type: 'specified', amount: parseInt(e.target.value) || 0 } })}
                  className="w-32 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white" />
                <span className="text-gray-400 ml-1">/month</span>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="px-6 py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors">← Back</button>
        <button onClick={() => onConfirm(extracted)} className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors">Research Audience →</button>
      </div>
    </div>
  );
}
