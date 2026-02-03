"use client";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const navItems = [
  { id: "campaigns", label: "Campaigns", icon: "📊" },
  { id: "budget", label: "Budget", icon: "💰" },
  { id: "activity", label: "Activity", icon: "📋" },
  { id: "builder", label: "Builder", icon: "🔧" },
  { id: "review", label: "Ad Review", icon: "✍️" },
  { id: "abm", label: "ABM Lists", icon: "🎯" },
];

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold">Demand Gen Hub</h1>
        <p className="text-gray-400 text-sm mt-1">Telnyx Marketing</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  activeTab === item.id
                    ? "bg-indigo-600 text-white"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span>Agent Online</span>
        </div>
      </div>
    </aside>
  );
}
