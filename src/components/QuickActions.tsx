'use client';

import { useState } from 'react';

type ActionType = 'budget' | 'regions' | 'pause' | 'copy' | 'targeting' | 'keywords' | 'health' | null;

interface Campaign {
  id: string;
  name: string;
  platform: string;
  budget: number;
  status: 'enabled' | 'paused';
}

// Mock campaigns
const mockCampaigns: Campaign[] = [
  { id: '1', name: '202602 BOFU Voice AI Contact Center SA US', platform: 'google_ads', budget: 66, status: 'enabled' },
  { id: '2', name: '202602 BOFU Voice AI Competitors SA US/UK', platform: 'google_ads', budget: 50, status: 'enabled' },
  { id: '3', name: '202602 MOFU AI Customer Service SA US/UK', platform: 'google_ads', budget: 33, status: 'paused' },
  { id: '4', name: '202602 MOFU Voice AI LinkedIn US', platform: 'linkedin', budget: 67, status: 'enabled' },
  { id: '5', name: '202602 TOFU Voice AI DA US/UK', platform: 'stackadapt', budget: 50, status: 'enabled' },
];

export function QuickActions() {
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [budgetChange, setBudgetChange] = useState({ type: 'increase', value: 20 });
  const [campaigns] = useState<Campaign[]>(mockCampaigns);

  const actions = [
    { id: 'budget', icon: '💰', label: 'Adjust Budget' },
    { id: 'regions', icon: '🌍', label: 'Change Regions' },
    { id: 'pause', icon: '⏸️', label: 'Pause / Enable' },
    { id: 'copy', icon: '📝', label: 'Update Copy' },
    { id: 'targeting', icon: '🎯', label: 'Update Targeting' },
    { id: 'keywords', icon: '🔍', label: 'Add Keywords' },
    { id: 'health', icon: '📊', label: 'Check Health' },
  ];

  const toggleCampaign = (id: string) => {
    setSelectedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedCampaigns.size === campaigns.length) {
      setSelectedCampaigns(new Set());
    } else {
      setSelectedCampaigns(new Set(campaigns.map(c => c.id)));
    }
  };

  const getPreviewBudget = (campaign: Campaign) => {
    if (budgetChange.type === 'set') return budgetChange.value;
    if (budgetChange.type === 'increase') return Math.round(campaign.budget * (1 + budgetChange.value / 100));
    if (budgetChange.type === 'decrease') return Math.round(campaign.budget * (1 - budgetChange.value / 100));
    return campaign.budget;
  };

  const renderActionPanel = () => {
    if (!activeAction) return null;

    switch (activeAction) {
      case 'budget':
        return (
          <div className="bg-gray-800 rounded-lg p-5 mt-4">
            <h3 className="text-lg font-semibold text-white mb-4">Adjust Budget</h3>
            
            {/* Campaign Selection */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Select campaigns:</span>
                <button
                  onClick={toggleAll}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {selectedCampaigns.size === campaigns.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {campaigns.map(campaign => (
                  <label
                    key={campaign.id}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                      selectedCampaigns.has(campaign.id) ? 'bg-blue-900/30' : 'hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedCampaigns.has(campaign.id)}
                        onChange={() => toggleCampaign(campaign.id)}
                        className="text-blue-600"
                      />
                      <span className="text-gray-300 text-sm">{campaign.name}</span>
                    </div>
                    <span className="text-gray-500 text-sm">${campaign.budget}/day</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Action Type */}
            <div className="mb-4">
              <span className="text-sm text-gray-400 block mb-2">Action:</span>
              <div className="flex gap-2">
                {[
                  { id: 'increase', label: 'Increase by %' },
                  { id: 'decrease', label: 'Decrease by %' },
                  { id: 'set', label: 'Set to $' },
                ].map(option => (
                  <button
                    key={option.id}
                    onClick={() => setBudgetChange({ ...budgetChange, type: option.id as any })}
                    className={`flex-1 py-2 rounded text-sm transition-colors ${
                      budgetChange.type === option.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Value Input */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                {budgetChange.type === 'set' && <span className="text-gray-400">$</span>}
                <input
                  type="number"
                  value={budgetChange.value}
                  onChange={(e) => setBudgetChange({ ...budgetChange, value: parseInt(e.target.value) || 0 })}
                  className="w-24 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                {budgetChange.type !== 'set' && <span className="text-gray-400">%</span>}
                <span className="text-gray-500 text-sm">/day</span>
              </div>
            </div>

            {/* Preview */}
            {selectedCampaigns.size > 0 && (
              <div className="mb-4 p-3 bg-gray-900 rounded-lg">
                <span className="text-sm text-gray-400 block mb-2">Preview:</span>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left py-1">Campaign</th>
                      <th className="text-right py-1">Current</th>
                      <th className="text-right py-1">→</th>
                      <th className="text-right py-1">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns
                      .filter(c => selectedCampaigns.has(c.id))
                      .map(campaign => (
                        <tr key={campaign.id} className="text-gray-300 border-t border-gray-700">
                          <td className="py-1 truncate max-w-[200px]">{campaign.name}</td>
                          <td className="text-right">${campaign.budget}/day</td>
                          <td className="text-right text-gray-500">→</td>
                          <td className="text-right text-green-400">${getPreviewBudget(campaign)}/day</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Apply Button */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setActiveAction(null)}
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={selectedCampaigns.size === 0}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  selectedCampaigns.size > 0
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                Apply Changes
              </button>
            </div>
          </div>
        );

      case 'pause':
        return (
          <div className="bg-gray-800 rounded-lg p-5 mt-4">
            <h3 className="text-lg font-semibold text-white mb-4">Pause / Enable Campaigns</h3>
            
            <div className="space-y-2 mb-4">
              {campaigns.map(campaign => (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between p-3 bg-gray-900 rounded-lg"
                >
                  <span className="text-gray-300">{campaign.name}</span>
                  <button
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      campaign.status === 'enabled'
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-gray-600 hover:bg-gray-500 text-white'
                    }`}
                  >
                    {campaign.status === 'enabled' ? '✓ Enabled' : '⏸ Paused'}
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setActiveAction(null)}
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        );

      case 'health':
        return (
          <div className="bg-gray-800 rounded-lg p-5 mt-4">
            <h3 className="text-lg font-semibold text-white mb-4">Campaign Health Check</h3>
            
            <div className="space-y-3 mb-4">
              {campaigns.slice(0, 3).map(campaign => (
                <div key={campaign.id} className="p-3 bg-gray-900 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-300">{campaign.name}</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-green-900 text-green-400">
                      Healthy
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 block">CTR</span>
                      <span className="text-white">4.2%</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">CPC</span>
                      <span className="text-white">$8.50</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Conv. Rate</span>
                      <span className="text-white">3.1%</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Spend</span>
                      <span className="text-white">92%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setActiveAction(null)}
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Close
              </button>
              <button className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                Run Full Health Check
              </button>
            </div>
          </div>
        );

      default:
        return (
          <div className="bg-gray-800 rounded-lg p-5 mt-4 text-center">
            <p className="text-gray-400">Coming soon...</p>
            <button
              onClick={() => setActiveAction(null)}
              className="mt-4 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            >
              Close
            </button>
          </div>
        );
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-white mb-2">Quick Actions</h2>
      <p className="text-gray-400 mb-6">Make quick changes without the full workflow</p>

      {/* Action Grid */}
      <div className="grid grid-cols-4 gap-4">
        {actions.map(action => (
          <button
            key={action.id}
            onClick={() => setActiveAction(activeAction === action.id ? null : action.id as ActionType)}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-colors ${
              activeAction === action.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <span className="text-2xl mb-2">{action.icon}</span>
            <span className="text-sm">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Action Panel */}
      {renderActionPanel()}
    </div>
  );
}
