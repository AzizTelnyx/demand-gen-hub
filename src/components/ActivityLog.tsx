"use client";

import { useState } from "react";

interface Activity {
  id: string;
  timestamp: string;
  actor: "agent" | "user";
  action: string;
  entityType: string;
  entityName: string;
  details: string;
}

const mockActivities: Activity[] = [
  {
    id: "1",
    timestamp: "2026-02-02T21:30:00Z",
    actor: "agent",
    action: "synced",
    entityType: "campaigns",
    entityName: "StackAdapt",
    details: "Synced 16 live campaigns from StackAdapt",
  },
  {
    id: "2",
    timestamp: "2026-02-02T21:00:00Z",
    actor: "agent",
    action: "flagged",
    entityType: "campaign",
    entityName: "MOFU AI Agent DA Global",
    details: "Campaign at 72% spend with 2 weeks remaining - pacing ahead",
  },
  {
    id: "3",
    timestamp: "2026-02-02T19:30:00Z",
    actor: "user",
    action: "created",
    entityType: "campaign",
    entityName: "202602 BOFU AI Agent LiveKit SA GLOBAL",
    details: "Created new competitor campaign targeting LiveKit",
  },
  {
    id: "4",
    timestamp: "2026-02-02T18:00:00Z",
    actor: "agent",
    action: "reviewed",
    entityType: "ad_copy",
    entityName: "Voice AI Headlines v2",
    details: "Reviewed 12 ad variants, approved 8, flagged 4 for revision",
  },
  {
    id: "5",
    timestamp: "2026-02-02T16:30:00Z",
    actor: "agent",
    action: "health_check",
    entityType: "campaigns",
    entityName: "Google Ads",
    details: "Health check completed: 0 critical, 5 warnings, 0 healthy",
  },
];

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
  agent: "bg-indigo-100 text-indigo-800",
  user: "bg-green-100 text-green-800",
};

export default function ActivityLog() {
  const [activities] = useState<Activity[]>(mockActivities);
  const [filter, setFilter] = useState<string>("all");

  const filteredActivities = activities.filter((a) => {
    if (filter === "all") return true;
    return a.actor === filter;
  });

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm"
        >
          <option value="all">All Activity</option>
          <option value="agent">Agent Only</option>
          <option value="user">User Only</option>
        </select>
      </div>

      {/* Activity List */}
      <div className="bg-white rounded-lg shadow">
        <ul className="divide-y divide-gray-100">
          {filteredActivities.map((activity) => (
            <li key={activity.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="text-2xl">{actionIcons[activity.action] || "📌"}</div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actorColors[activity.actor]}`}>
                      {activity.actor}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{activity.action}</span>
                    <span className="text-sm text-gray-500">{activity.entityType}</span>
                  </div>
                  <p className="text-sm text-gray-900 font-medium">{activity.entityName}</p>
                  <p className="text-sm text-gray-500 mt-1">{activity.details}</p>
                </div>

                {/* Time */}
                <div className="text-sm text-gray-400">{formatTime(activity.timestamp)}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
