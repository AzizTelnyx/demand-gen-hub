"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "📊", href: "/dashboard" },
  { id: "campaigns", label: "Campaigns", icon: "📈", href: "/" },
  { id: "budget", label: "Budget", icon: "💰", href: "/budget" },
];

const workflowItems = [
  { id: "builder", label: "Campaign Builder", icon: "🚀", href: "/builder" },
  { id: "actions", label: "Quick Actions", icon: "⚡", href: "/actions" },
];

const agentItems = [
  { id: "audience", label: "Audience Research", icon: "👥", href: "/agents/audience" },
  { id: "budget-calc", label: "Budget Calculator", icon: "🧮", href: "/agents/budget" },
  { id: "ad-copy", label: "Ad Copy Generator", icon: "✍️", href: "/agents/copy" },
  { id: "health", label: "Health Monitor", icon: "🏥", href: "/agents/health" },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold">Demand Gen Hub</h1>
        <p className="text-gray-400 text-sm mt-1">Telnyx Marketing</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        {/* Main Nav */}
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition ${
                  isActive(item.href)
                    ? "bg-indigo-600 text-white"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Divider */}
        <div className="my-4 border-t border-gray-800" />

        {/* Workflows */}
        <p className="px-4 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Workflows
        </p>
        <ul className="space-y-1">
          {workflowItems.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition ${
                  isActive(item.href)
                    ? "bg-indigo-600 text-white"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Divider */}
        <div className="my-4 border-t border-gray-800" />

        {/* Agents */}
        <p className="px-4 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Agents
        </p>
        <ul className="space-y-1">
          {agentItems.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition ${
                  isActive(item.href)
                    ? "bg-indigo-600 text-white"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Divider */}
        <div className="my-4 border-t border-gray-800" />

        {/* Chat */}
        <Link
          href="/chat"
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition ${
            isActive("/chat")
              ? "bg-indigo-600 text-white"
              : "text-gray-300 hover:bg-gray-800"
          }`}
        >
          <span>💬</span>
          <span>Chat with Lil Aziz</span>
        </Link>
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
