'use client';

import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
  label: string;
}

const PRESETS: { label: string; days: number }[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'This month', days: -1 },
  { label: 'Last month', days: -2 },
  { label: 'This quarter', days: -3 },
  { label: 'This year', days: -4 },
  { label: 'Last year', days: -5 },
];

function getPresetRange(preset: { label: string; days: number }): DateRange {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  let from: string;

  if (preset.days > 0) {
    const d = new Date(now);
    d.setDate(d.getDate() - preset.days);
    from = d.toISOString().split('T')[0];
  } else if (preset.days === -1) {
    // This month
    from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (preset.days === -2) {
    // Last month
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    from = d.toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from, to: end.toISOString().split('T')[0], label: preset.label };
  } else if (preset.days === -3) {
    // This quarter
    const q = Math.floor(now.getMonth() / 3);
    from = `${now.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`;
  } else if (preset.days === -4) {
    // This year
    from = `${now.getFullYear()}-01-01`;
  } else if (preset.days === -5) {
    // Last year
    from = `${now.getFullYear() - 1}-01-01`;
    return { from, to: `${now.getFullYear() - 1}-12-31`, label: preset.label };
  } else {
    from = to;
  }

  return { from, to, label: preset.label };
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export default function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-gray-900/50 border border-gray-800/50 rounded-lg hover:border-gray-700 transition-colors">
        <Calendar size={13} className="text-gray-500" />
        <span className="text-xs text-gray-300">{value.label}</span>
        <span className="text-[10px] text-gray-600">{value.from} → {value.to}</span>
        <ChevronDown size={12} className="text-gray-600" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-72 overflow-hidden">
            {/* Presets */}
            <div className="p-2 border-b border-gray-800/50">
              <p className="text-[9px] text-gray-600 uppercase tracking-wider px-2 py-1">Quick Select</p>
              <div className="grid grid-cols-2 gap-1">
                {PRESETS.map(p => (
                  <button key={p.label} onClick={() => { onChange(getPresetRange(p)); setOpen(false); }}
                    className={`text-left px-2.5 py-1.5 text-[11px] rounded-lg transition-colors ${
                      value.label === p.label ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom */}
            <div className="p-3">
              <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">Custom Range</p>
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
                <span className="text-gray-600 text-xs">→</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <button onClick={() => {
                onChange({ from: customFrom, to: customTo, label: 'Custom' });
                setOpen(false);
              }}
                className="w-full mt-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function getDefaultRange(): DateRange {
  return getPresetRange({ label: 'This year', days: -4 });
}
