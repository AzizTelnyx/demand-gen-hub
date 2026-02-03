"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import CampaignsDashboard from "@/components/CampaignsDashboard";
import BudgetOverview from "@/components/BudgetOverview";
import CampaignBuilder from "@/components/CampaignBuilder";
import ActivityLog from "@/components/ActivityLog";
import ChatPanel from "@/components/ChatPanel";

export default function Home() {
  const [activeTab, setActiveTab] = useState("campaigns");
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {activeTab === "campaigns" && "Campaigns"}
                {activeTab === "budget" && "Budget Planner"}
                {activeTab === "activity" && "Activity Log"}
                {activeTab === "builder" && "Campaign Builder"}
                {activeTab === "review" && "Ad Review"}
                {activeTab === "abm" && "ABM Lists"}
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                {activeTab === "campaigns" && "All campaigns across platforms"}
                {activeTab === "budget" && "Allocation, pacing, and planning across all channels"}
                {activeTab === "activity" && "Agent and user actions"}
                {activeTab === "builder" && "Create new campaigns"}
                {activeTab === "review" && "Review ad copy"}
                {activeTab === "abm" && "Build and manage account lists"}
              </p>
            </div>
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Chat with Agent
            </button>
          </div>

          {/* Content */}
          {activeTab === "campaigns" && <CampaignsDashboard />}
          {activeTab === "budget" && <BudgetOverview />}
          {activeTab === "activity" && <ActivityLog />}
          {activeTab === "builder" && <CampaignBuilder />}
          {activeTab === "review" && (
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-500">Ad Review coming soon...</p>
            </div>
          )}
          {activeTab === "abm" && (
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-500">ABM Lists coming soon...</p>
            </div>
          )}
        </div>
      </main>

      {/* Chat Panel */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
    </div>
  );
}
