import BudgetOverview from "@/components/BudgetOverview";
import BudgetPlanner from "@/components/BudgetPlanner";

export default function BudgetPage() {
  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Budget Planner</h1>
        <p className="text-gray-400 text-sm mt-1">
          Plan, track, and optimize your marketing budget across all channels
        </p>
      </div>

      {/* Budget Planner - Main Tool */}
      <BudgetPlanner />

      {/* Divider */}
      <div className="border-t border-gray-700 pt-8">
        <h2 className="text-xl font-semibold text-white mb-4">Current Spend Breakdown</h2>
        <p className="text-gray-400 text-sm mb-6">
          Live data from your connected ad platforms (last 30 days)
        </p>
      </div>

      {/* Current Spend Overview */}
      <BudgetOverview />
    </div>
  );
}
