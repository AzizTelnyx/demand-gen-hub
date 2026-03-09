"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, BarChart3, Wallet, MessageSquare,
  Sword, Crosshair, History, Image, TrendingUp,
  Sun, Moon, PanelLeftClose, PanelLeftOpen, Bot, Workflow,
  ClipboardList, Target, Radar,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "campaigns", label: "Command Center", icon: Radar, href: "/" },
  { id: "pipeline", label: "Pipeline", icon: TrendingUp, href: "/pipeline" },
  { id: "optimizations", label: "Optimizations", icon: History, href: "/optimizations" },
  { id: "ads", label: "Ads Library", icon: Image, href: "/ads" },
  { id: "budget", label: "Budget & Spend", icon: Wallet, href: "/budget" },
  { id: "abm", label: "ABM", icon: Crosshair, href: "/abm" },
  { id: "agents", label: "Agents", icon: Bot, href: "/agents" },
  { id: "work", label: "Work Tracker", icon: ClipboardList, href: "/work" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('dg-sidebar');
    if (stored === 'collapsed') setCollapsed(true);
  }, []);

  const handleToggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('dg-sidebar', next ? 'collapsed' : 'expanded');
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside data-sidebar className={`${collapsed ? 'w-16' : 'w-60'} bg-[var(--bg-sidebar)] border-r border-[var(--border-primary)] text-[var(--text-primary)] flex flex-col transition-all duration-200`}>
      {/* Logo */}
      <div className={`${collapsed ? 'px-3' : 'px-5'} py-5 border-b border-[var(--border-primary)]`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
            <img
              src="/telnyx-logo-dark.jpg"
              alt="Telnyx"
              className="w-full h-full object-cover"
            />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sm font-semibold tracking-tight">Demand Gen Hub</h1>
              <p className="text-[11px] text-[var(--text-muted)]">Telnyx Marketing</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.id}>
                <Link href={item.href} title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                    active
                      ? "sidebar-active"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]"
                  }`}>
                  <Icon size={16} strokeWidth={active ? 2 : 1.5} className="shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className={`${collapsed ? 'px-2' : 'px-4'} py-4 border-t border-[var(--border-primary)] space-y-3`}>
        {/* Collapse toggle */}
        <button onClick={handleToggle}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-2.5 px-3'} py-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors`}>
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          {!collapsed && <span className="text-[12px]">Collapse</span>}
        </button>

        {/* Theme toggle */}
        <button onClick={toggle}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-2.5 px-3'} py-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors`}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          {!collapsed && <span className="text-[12px]">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        {/* Ares status */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Sword size={12} className="text-emerald-400" />
          </div>
          {!collapsed && (
            <div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[12px] font-medium text-[var(--text-secondary)]">Ares</span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">Online · Opus 4</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
