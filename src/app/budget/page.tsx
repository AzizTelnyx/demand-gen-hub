"use client";

import { useState, useEffect } from "react";
import BudgetOverview from "@/components/BudgetOverview";

export default function BudgetPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Budget Planner</h1>
          <p className="text-gray-500 mt-1">Allocation, pacing, and planning across all channels</p>
        </div>
        <BudgetOverview />
      </div>
    </main>
  );
}
