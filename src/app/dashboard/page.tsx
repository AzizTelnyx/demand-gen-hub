'use client';

import { useState, useEffect } from 'react';

interface Metric {
  label: string;
  value: string;
  change: string;
  changeType: 'up' | 'down' | 'neutral';
}

interface CampaignAlert {
  id: string;
  type: 'warning' | 'info' | 'success';
  message: string;
  campaign: string;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: 'Total Spend (MTD)', value: '$45,230', change: '+12%', changeType: 'up' },
    { label: 'Leads Generated', value: '342', change: '+8%', changeType: 'up' },
    { label: 'Cost Per Lead', value: '$132.25', change: '-5%', changeType: 'down' },
    { label: 'SQO Conversion', value: '18.4%', change: '+2.1%', changeType: 'up' },
  ]);

  const [alerts, setAlerts] = useState<CampaignAlert[]>([
    { id: '1', type: 'warning', message: 'Budget pacing ahead of schedule', campaign: '202602 BOFU Voice AI SA US' },
    { id: '2', type: 'info', message: 'New search terms detected', campaign: '202602 MOFU Contact Center SA US' },
    { id: '3', type: 'success', message: 'Target CPA achieved', campaign: '202602 BOFU Competitors SA US/UK' },
  ]);

  const channelPerformance = [
    { channel: 'Google Ads', spend: 28500, leads: 198, cpl: 143.94, trend: 'up' },
    { channel: 'LinkedIn', spend: 12400, leads: 89, cpl: 139.33, trend: 'down' },
    { channel: 'StackAdapt', spend: 4330, leads: 55, cpl: 78.73, trend: 'up' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Overview of demand generation performance</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <div key={index} className="bg-gray-800 rounded-lg p-5">
            <p className="text-gray-400 text-sm">{metric.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{metric.value}</p>
            <p className={`text-sm mt-2 ${
              metric.changeType === 'up' ? 'text-green-400' :
              metric.changeType === 'down' ? 'text-red-400' :
              'text-gray-400'
            }`}>
              {metric.change} vs last month
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Channel Performance */}
        <div className="col-span-2 bg-gray-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Channel Performance</h2>
          <table className="w-full">
            <thead>
              <tr className="text-gray-400 text-sm">
                <th className="text-left py-2">Channel</th>
                <th className="text-right py-2">Spend</th>
                <th className="text-right py-2">Leads</th>
                <th className="text-right py-2">CPL</th>
                <th className="text-right py-2">Trend</th>
              </tr>
            </thead>
            <tbody>
              {channelPerformance.map((row, index) => (
                <tr key={index} className="border-t border-gray-700">
                  <td className="py-3 text-white">{row.channel}</td>
                  <td className="py-3 text-right text-gray-300">${row.spend.toLocaleString()}</td>
                  <td className="py-3 text-right text-gray-300">{row.leads}</td>
                  <td className="py-3 text-right text-gray-300">${row.cpl.toFixed(2)}</td>
                  <td className="py-3 text-right">
                    <span className={row.trend === 'up' ? 'text-green-400' : 'text-red-400'}>
                      {row.trend === 'up' ? '↑' : '↓'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Alerts */}
        <div className="bg-gray-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Campaign Alerts</h2>
          <div className="space-y-3">
            {alerts.map(alert => (
              <div
                key={alert.id}
                className={`p-3 rounded-lg ${
                  alert.type === 'warning' ? 'bg-yellow-900/30 border border-yellow-600/30' :
                  alert.type === 'success' ? 'bg-green-900/30 border border-green-600/30' :
                  'bg-blue-900/30 border border-blue-600/30'
                }`}
              >
                <p className={`text-sm font-medium ${
                  alert.type === 'warning' ? 'text-yellow-400' :
                  alert.type === 'success' ? 'text-green-400' :
                  'text-blue-400'
                }`}>
                  {alert.type === 'warning' ? '⚠️' : alert.type === 'success' ? '✓' : 'ℹ️'} {alert.message}
                </p>
                <p className="text-xs text-gray-500 mt-1">{alert.campaign}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="flex gap-3">
          <a href="/builder" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            🚀 New Campaign
          </a>
          <a href="/actions" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
            ⚡ Quick Actions
          </a>
          <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
            📊 Run Health Check
          </button>
          <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
            📥 Export Report
          </button>
        </div>
      </div>
    </div>
  );
}
