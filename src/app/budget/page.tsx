import BudgetOverview from "@/components/BudgetOverview";

export default function BudgetPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Budget Planner</h1>
        <p className="text-gray-400 text-sm mt-1">Allocation, pacing, and planning across all channels</p>
      </div>
      <BudgetOverview />
    </div>
  );
}
