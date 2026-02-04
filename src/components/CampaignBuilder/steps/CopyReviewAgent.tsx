'use client';

import { useState } from 'react';

interface CopyReviewAgentProps {
  adCopy: any;
  product: string;
  targetAudience: string;
  funnelStage: string;
  channels: string[];
  cachedReview?: any;
  onComplete: (review: any) => void;
  onBack: () => void;
}

export default function CopyReviewAgent({
  adCopy,
  product,
  targetAudience,
  funnelStage,
  channels,
  cachedReview,
  onComplete,
  onBack
}: CopyReviewAgentProps) {
  // Use cached review if available
  const [review, setReview] = useState<any>(cachedReview || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runReview = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/builder/review-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adCopy,
          product,
          targetAudience,
          funnelStage,
          channels
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setReview(data.review);
      } else {
        setError(data.error || 'Failed to review copy');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return '✅';
      case 'needs_edit': return '⚠️';
      case 'rewrite': return '❌';
      default: return '•';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-green-400';
      case 'needs_edit': return 'text-yellow-400';
      case 'rewrite': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 border-red-500/50 text-red-300';
      case 'warning': return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300';
      case 'suggestion': return 'bg-blue-500/20 border-blue-500/50 text-blue-300';
      default: return 'bg-gray-500/20 border-gray-500/50 text-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">🔍 Ad Copy Review Agent</h2>
          <p className="text-gray-400 text-sm mt-1">
            AI reviews your copy against brand guidelines, pillars, and character limits
          </p>
        </div>
        
        {!review && (
          <button
            onClick={runReview}
            disabled={loading}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? 'Reviewing...' : 'Run Review'}
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Analyzing ad copy against brand guidelines...</p>
          </div>
        </div>
      )}

      {review && (
        <div className="space-y-6">
          {/* Overall Score */}
          <div className={`p-4 rounded-lg border ${
            review.overallScore === 'approved' ? 'bg-green-500/20 border-green-500/50' :
            review.overallScore === 'needs_edits' ? 'bg-yellow-500/20 border-yellow-500/50' :
            'bg-red-500/20 border-red-500/50'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {review.overallScore === 'approved' ? '✅' : 
                 review.overallScore === 'needs_edits' ? '⚠️' : '❌'}
              </span>
              <div>
                <h3 className={`font-semibold ${
                  review.overallScore === 'approved' ? 'text-green-300' :
                  review.overallScore === 'needs_edits' ? 'text-yellow-300' :
                  'text-red-300'
                }`}>
                  {review.overallScore === 'approved' ? 'Approved' :
                   review.overallScore === 'needs_edits' ? 'Needs Edits' :
                   'Requires Rewrite'}
                </h3>
                <p className="text-sm text-gray-300">{review.summary}</p>
              </div>
            </div>
          </div>

          {/* Priority Fixes */}
          {review.priorityFixes?.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-3">🎯 Priority Fixes</h3>
              <ol className="list-decimal list-inside space-y-2">
                {review.priorityFixes.map((fix: string, idx: number) => (
                  <li key={idx} className="text-gray-300">{fix}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Detailed Reviews */}
          <div className="space-y-4">
            <h3 className="font-semibold text-white">📋 Detailed Review</h3>
            
            {review.reviews?.map((item: any, idx: number) => (
              <div key={idx} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span>{getStatusIcon(item.status)}</span>
                    <span className="font-medium text-white">{item.variant}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400">
                      {item.channel} • {item.element}
                    </span>
                  </div>
                  <span className={`text-xs ${item.withinLimit ? 'text-green-400' : 'text-red-400'}`}>
                    {item.charCount}/{item.charLimit} chars
                  </span>
                </div>

                {/* Current Text */}
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1">Current:</p>
                  <p className="text-gray-300 bg-gray-900 p-2 rounded text-sm font-mono">
                    "{item.currentText}"
                  </p>
                </div>

                {/* Pillar Mapping */}
                <p className="text-xs text-gray-500 mb-2">
                  Maps to: <span className="text-purple-400">{item.pillarMapping}</span>
                </p>

                {/* Issues */}
                {item.issues?.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {item.issues.map((issue: any, iIdx: number) => (
                      <div key={iIdx} className={`p-2 rounded border ${getSeverityColor(issue.severity)}`}>
                        <p className="text-sm font-medium">{issue.description}</p>
                        <p className="text-xs mt-1 opacity-75">{issue.citation}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Suggested Text */}
                {item.suggestedText && (
                  <div className="mt-3">
                    <p className="text-xs text-green-500 mb-1">✅ Use This:</p>
                    <p className="text-green-300 bg-green-500/10 p-2 rounded text-sm font-mono border border-green-500/30">
                      "{item.suggestedText}"
                    </p>
                    {item.reasoning && (
                      <p className="text-xs text-gray-500 mt-1">{item.reasoning}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Action Items */}
          {review.actionItems?.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-3">✅ Action Items</h3>
              <ul className="space-y-2">
                {review.actionItems.map((item: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 text-gray-300">
                    <span className="text-gray-500">□</span>
                    <span>{item}</span>
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
          ← Back to Ad Copy
        </button>
        
        <button
          onClick={() => onComplete(review)}
          disabled={!review}
          className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {review?.overallScore === 'approved' ? 'Proceed to Launch →' : 'Proceed Anyway →'}
        </button>
      </div>
    </div>
  );
}
