'use client';

import { useState, useEffect } from 'react';

interface LaunchCampaignProps {
  plan: any;
  adCopy: any;
  channelResearch: any;
  review: any;
  onComplete: (result: any) => void;
  onBack: () => void;
}

export default function LaunchCampaign({
  plan,
  adCopy,
  channelResearch,
  review,
  onComplete,
  onBack
}: LaunchCampaignProps) {
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [launchResult, setLaunchResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landingPage, setLandingPage] = useState('https://telnyx.com/products/voice-ai');
  const [selectedAccount, setSelectedAccount] = useState('235-665-0573');

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const response = await fetch('/api/builder/launch-google');
      const data = await response.json();
      setConnectionStatus(data);
    } catch (err) {
      setConnectionStatus({ connected: false, error: 'Failed to check connection' });
    }
  };

  const loadPreview = async () => {
    setLoadingPreview(true);
    setError(null);
    
    try {
      const response = await fetch('/api/builder/launch-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          plan,
          adCopy,
          channelResearch,
          landingPage,
          customerId: selectedAccount
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setPreview(data);
      } else {
        setError(data.error || 'Failed to generate preview');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const launchCampaign = async () => {
    if (!confirm('Are you sure you want to create this campaign in Google Ads? It will be created in PAUSED state.')) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/builder/launch-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'launch',
          plan,
          adCopy,
          channelResearch,
          landingPage,
          customerId: selectedAccount
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setLaunchResult(data);
      } else {
        setError(data.error || data.details?.message || 'Failed to launch campaign');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">🚀 Launch to Google Ads</h2>
        <p className="text-gray-400 text-sm mt-1">
          Create your campaign directly in Google Ads
        </p>
      </div>

      {/* Connection Status */}
      <div className={`p-4 rounded-lg border ${
        connectionStatus?.connected 
          ? 'bg-green-500/20 border-green-500/50' 
          : 'bg-red-500/20 border-red-500/50'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{connectionStatus?.connected ? '✅' : '❌'}</span>
          <div>
            <h3 className={connectionStatus?.connected ? 'text-green-300' : 'text-red-300'}>
              {connectionStatus?.connected ? 'Google Ads Connected' : 'Connection Issue'}
            </h3>
            <p className="text-sm text-gray-300">{connectionStatus?.message || connectionStatus?.error}</p>
          </div>
        </div>
      </div>

      {/* Review Warning */}
      {review?.overallScore !== 'approved' && (
        <div className="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-300">
            <span>⚠️</span>
            <span>Ad copy has issues that should be addressed before launching</span>
          </div>
        </div>
      )}

      {/* Configuration */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-white">Configuration</h3>
        
        <div>
          <label className="block text-sm text-gray-400 mb-1">Google Ads Account</label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
          >
            {connectionStatus?.accounts?.map((acc: any) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.id}) - {acc.currency}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm text-gray-400 mb-1">Landing Page URL</label>
          <input
            type="url"
            value={landingPage}
            onChange={(e) => setLandingPage(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
            placeholder="https://telnyx.com/..."
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
          {error}
        </div>
      )}

      {/* Preview Section */}
      {!preview && !launchResult && (
        <div className="flex justify-center">
          <button
            onClick={loadPreview}
            disabled={loadingPreview || !connectionStatus?.connected}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            {loadingPreview ? 'Generating Preview...' : '👀 Preview Campaign'}
          </button>
        </div>
      )}

      {preview && !launchResult && (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-4">📋 Campaign Preview</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-500">Campaign Name</p>
                <p className="text-white">{preview.campaign?.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Type</p>
                <p className="text-white">{preview.campaign?.type}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Daily Budget</p>
                <p className="text-white">${preview.campaign?.dailyBudget?.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Monthly Budget</p>
                <p className="text-white">${preview.campaign?.monthlyBudget?.toLocaleString()}</p>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">Ad Groups to Create:</p>
              <div className="space-y-2">
                {preview.adGroups?.map((ag: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-900 p-2 rounded">
                    <span className="text-white">{ag.name}</span>
                    <span className="text-xs text-gray-400">
                      {ag.headlines} headlines • {ag.descriptions} descriptions
                      {ag.rsa ? ' ✅ RSA ready' : ' ⚠️ Missing assets'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {preview.warnings?.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                <p className="text-xs text-yellow-400 font-medium mb-2">⚠️ Warnings:</p>
                <ul className="space-y-1">
                  {preview.warnings.map((w: string, idx: number) => (
                    <li key={idx} className="text-xs text-yellow-300">• {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => setPreview(null)}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Edit Configuration
            </button>
            <button
              onClick={launchCampaign}
              disabled={loading}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Creating Campaign...' : '🚀 Launch Campaign'}
            </button>
          </div>
        </div>
      )}

      {/* Launch Result */}
      {launchResult && (
        <div className="space-y-4">
          <div className={`p-6 rounded-lg border ${
            launchResult.success 
              ? 'bg-green-500/20 border-green-500/50' 
              : 'bg-red-500/20 border-red-500/50'
          }`}>
            <div className="text-center">
              <span className="text-4xl mb-4 block">{launchResult.success ? '🎉' : '❌'}</span>
              <h3 className={`text-xl font-semibold ${launchResult.success ? 'text-green-300' : 'text-red-300'}`}>
                {launchResult.success ? 'Campaign Created!' : 'Launch Failed'}
              </h3>
              <p className="text-gray-300 mt-2">{launchResult.message}</p>
            </div>
          </div>

          {launchResult.success && (
            <>
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-3">Created Resources</h4>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center bg-gray-900 p-2 rounded">
                    <span className="text-gray-400">Campaign</span>
                    <span className="text-white">{launchResult.campaign?.name}</span>
                  </div>
                  
                  {launchResult.adGroups?.map((ag: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-900 p-2 rounded">
                      <span className="text-gray-400">Ad Group</span>
                      <span className="text-white">{ag.name}</span>
                    </div>
                  ))}
                  
                  <div className="flex justify-between items-center bg-gray-900 p-2 rounded">
                    <span className="text-gray-400">Ads Created</span>
                    <span className="text-white">{launchResult.ads?.length || 0}</span>
                  </div>
                  
                  <div className="flex justify-between items-center bg-gray-900 p-2 rounded">
                    <span className="text-gray-400">Keywords Added</span>
                    <span className="text-white">{launchResult.keywords?.length || 0}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-4">
                <a
                  href={launchResult.googleAdsUrl || 'https://ads.google.com'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Open in Google Ads →
                </a>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-yellow-300 text-sm">
                  <strong>⚠️ Important:</strong> Your campaign was created in PAUSED state. 
                  Review it in Google Ads and enable it when ready to go live.
                </p>
              </div>
            </>
          )}

          {!launchResult.success && launchResult.errors && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="font-semibold text-red-300 mb-3">Errors</h4>
              <ul className="space-y-2">
                {launchResult.errors.map((err: any, idx: number) => (
                  <li key={idx} className="text-red-300 text-sm">
                    • {err.message} {err.code && `(${err.code})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-gray-700">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          ← Back to Review
        </button>
        
        {launchResult?.success && (
          <button
            onClick={() => onComplete(launchResult)}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            Complete Setup ✓
          </button>
        )}
      </div>
    </div>
  );
}
