import CampaignsDashboard from "@/components/CampaignsDashboard";

export default function Home() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Campaigns</h1>
        <p className="text-gray-400 text-sm mt-1">All campaigns across platforms</p>
      </div>
      <CampaignsDashboard />
    </div>
  );
}
