"use client";

import { useState, useEffect } from "react";

interface Activity {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  entityType: string;
  entityName: string | null;
  details: string | null;
}

const actionIcons: Record<string, string> = {
  synced: "🔄",
  flagged: "⚠️",
  created: "✨",
  reviewed: "✍️",
  health_check: "🏥",
  updated: "📝",
  approved: "✅",
};

const actorColors: Record<string, string> = {
  agent: "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30",
  user: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
};

export default function ActivityLog() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const res = await fetch(`/api/activity?actor=${filter}&limit=50`);
        const data = await res.json();
        setActivities(data.activities || []);
      } catch (error) {
        console.error("Error fetching activities:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [filter]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const parseDetails = (details: string | null): Record<string, unknown> => {
    if (!details) return {};
    try {
      return JSON.parse(details);
    } catch {
      return { message: details };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading activity...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Activity</option>
          <option value="agent">Agent Only</option>
          <option value="user">User Only</option>
        </select>
      </div>

      {/* Activity List */}
      <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50">
        {activities.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No activity yet</p>
            <p className="text-sm mt-1">Actions will appear here as you and agents work</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-700/50">
            {activities.map((activity) => {
              const details = parseDetails(activity.details);
              
              return (
                <li key={activity.id} className="p-4 hover:bg-gray-700/30 transition">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="text-2xl">{actionIcons[activity.action] || "📌"}</div>

                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actorColors[activity.actor] || "bg-gray-500/20 text-gray-400 border border-gray-500/30"}`}>
                          {activity.actor}
                        </span>
                        <span className="text-sm font-medium text-white">{activity.action}</span>
                        <span className="text-sm text-gray-400">{activity.entityType}</span>
                      </div>
                      {activity.entityName && (
                        <p className="text-sm text-white font-medium">{activity.entityName}</p>
                      )}
                      {details && Object.keys(details).length > 0 && (
                        <p className="text-sm text-gray-400 mt-1">
                          {details.message || details.count ? `${details.count} items` : JSON.stringify(details)}
                        </p>
                      )}
                    </div>

                    {/* Time */}
                    <div className="text-sm text-gray-500">{formatTime(activity.timestamp)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
