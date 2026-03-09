'use client';

import { useState, useEffect } from 'react';
import { CampaignPlanItem } from '../index';

interface Props {
  campaignPlan: CampaignPlanItem[];
}

interface BuildLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export function BuildProgress({ campaignPlan }: Props) {
  const [campaigns, setCampaigns] = useState<CampaignPlanItem[]>(
    campaignPlan.map(c => ({ ...c, status: 'planned' as const }))
  );
  const [logs, setLogs] = useState<BuildLog[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const buildCampaigns = async () => {
      for (let i = 0; i < campaigns.length; i++) {
        const campaign = campaigns[i];
        
        // Update status to building
        setCampaigns(prev => prev.map((c, idx) => 
          idx === i ? { ...c, status: 'building' as const } : c
        ));

        // Add log
        addLog(`Starting: ${campaign.name}`, 'info');
        
        // Simulate build time
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Simulate steps
        addLog(`Created campaign "${campaign.name}"`, 'info');
        await new Promise(resolve => setTimeout(resolve, 400));
        
        if (campaign.adGroups) {
          addLog(`Created ${campaign.adGroups.length} ad group(s)`, 'info');
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        addLog(`Set budget to $${(campaign.budget / 30).toFixed(2)}/day`, 'info');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Update status to created
        setCampaigns(prev => prev.map((c, idx) => 
          idx === i ? { ...c, status: 'created' as const } : c
        ));
        
        addLog(`✓ ${campaign.name} - Created successfully`, 'success');
      }
      
      setIsComplete(true);
      addLog('All campaigns created successfully!', 'success');
    };

    buildCampaigns();
  }, []);

  const addLog = (message: string, type: 'info' | 'success' | 'error') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const completedCount = campaigns.filter(c => c.status === 'created').length;
  const progress = (completedCount / campaigns.length) * 100;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'created': return '✅';
      case 'building': return '🔄';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'created': return 'Created';
      case 'building': return 'Building...';
      case 'error': return 'Error';
      default: return 'Pending';
    }
  };

  const getPlatformName = (platform: string) => {
    switch (platform) {
      case 'google_ads': return 'Google Ads';
      case 'linkedin': return 'LinkedIn';
      case 'stackadapt': return 'StackAdapt';
      default: return platform;
    }
  };

  // Group by platform
  const groupedCampaigns = campaigns.reduce((acc, campaign) => {
    const platform = getPlatformName(campaign.platform);
    if (!acc[platform]) acc[platform] = [];
    acc[platform].push(campaign);
    return acc;
  }, {} as Record<string, CampaignPlanItem[]>);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {isComplete ? '🎉 Campaigns Created!' : 'Building Campaigns...'}
        </h2>
        <p className="text-gray-400">
          {isComplete 
            ? 'All campaigns have been created successfully.' 
            : 'Please wait while we create your campaigns...'}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="bg-gray-800 rounded-lg p-5">
        <div className="flex justify-between mb-2">
          <span className="text-gray-400">Progress</span>
          <span className="text-white">{completedCount}/{campaigns.length} campaigns</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-4">
          <div
            className={`h-4 rounded-full transition-all duration-500 ${
              isComplete ? 'bg-green-600' : 'bg-blue-600'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Campaign Status by Platform */}
      {Object.entries(groupedCampaigns).map(([platform, platformCampaigns]) => (
        <div key={platform} className="bg-gray-800 rounded-lg p-5">
          <h3 className="text-lg font-semibold text-white mb-3">{platform}</h3>
          <div className="space-y-2">
            {platformCampaigns.map(campaign => (
              <div
                key={campaign.id}
                className={`flex items-center justify-between py-2 px-3 rounded ${
                  campaign.status === 'building' ? 'bg-blue-900/20' :
                  campaign.status === 'created' ? 'bg-green-900/20' :
                  campaign.status === 'error' ? 'bg-red-900/20' :
                  'bg-gray-900'
                }`}
              >
                <span className={`${
                  campaign.status === 'created' ? 'text-green-400' :
                  campaign.status === 'building' ? 'text-blue-400' :
                  campaign.status === 'error' ? 'text-red-400' :
                  'text-gray-400'
                }`}>
                  {getStatusIcon(campaign.status)} {campaign.name}
                </span>
                <span className="text-sm text-gray-500">
                  {getStatusText(campaign.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Build Log */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-3">📋 Build Log</h3>
        <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-sm">
          {logs.map((log, i) => (
            <div key={i} className={`py-1 ${
              log.type === 'success' ? 'text-green-400' :
              log.type === 'error' ? 'text-red-400' :
              'text-gray-400'
            }`}>
              <span className="text-gray-600">[{log.timestamp}]</span> {log.message}
            </div>
          ))}
          {!isComplete && (
            <div className="py-1 text-blue-400 animate-pulse">
              Building...
            </div>
          )}
        </div>
      </div>

      {/* Complete Actions */}
      {isComplete && (
        <div className="flex justify-center gap-4 pt-4">
          <button className="px-6 py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors">
            View in Dashboard
          </button>
          <button className="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            Create Another Campaign
          </button>
        </div>
      )}
    </div>
  );
}
