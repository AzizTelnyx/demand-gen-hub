'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Plus, Filter, ChevronDown, ChevronRight,
  CheckCircle2, Circle, Loader2, AlertTriangle, Ban,
  Rocket, Settings2, Flag, ListTodo, X,
  ArrowUp, ArrowRight, ArrowDown,
  LayoutGrid, List, Download, Clock,
} from 'lucide-react';

/* ─── Types ───────────────────────────────────────────── */

interface WorkItemUpdate {
  id: string;
  author: string;
  type: string;
  content: string;
  metadata?: string;
  createdAt: string;
}

interface WorkItem {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  priority: string;
  platform?: string;
  assignee?: string;
  source: string;
  sourceRef?: string;
  dueDate?: string;
  tags: string[];
  parentId?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  updates: WorkItemUpdate[];
  children?: WorkItem[];
  _count?: { children: number };
}

/* ─── Constants ───────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; order: number }> = {
  backlog:      { label: 'Backlog',     color: 'text-gray-400 bg-gray-800/50',      icon: Circle,         order: 0 },
  upcoming:     { label: 'Upcoming',    color: 'text-blue-400 bg-blue-900/30',      icon: Clock,          order: 1 },
  in_progress:  { label: 'In Progress', color: 'text-amber-400 bg-amber-900/30',    icon: Loader2,        order: 2 },
  blocked:      { label: 'Blocked',     color: 'text-red-400 bg-red-900/30',        icon: Ban,            order: 3 },
  done:         { label: 'Done',        color: 'text-emerald-400 bg-emerald-900/30', icon: CheckCircle2,  order: 4 },
};

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  launch:       { label: 'Launch',       icon: Rocket,    color: 'text-blue-400' },
  optimization: { label: 'Optimization', icon: Settings2, color: 'text-amber-400' },
  initiative:   { label: 'Initiative',   icon: Flag,      color: 'text-purple-400' },
  task:         { label: 'Task',         icon: ListTodo,  color: 'text-gray-400' },
  blocker:      { label: 'Blocker',      icon: Ban,       color: 'text-red-400' },
};

const PRIORITY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  p0: { label: 'P0', icon: ArrowUp,    color: 'text-red-400' },
  p1: { label: 'P1', icon: ArrowRight, color: 'text-amber-400' },
  p2: { label: 'P2', icon: ArrowDown,  color: 'text-gray-400' },
};

const PLATFORM_COLORS: Record<string, string> = {
  google_ads: 'bg-green-900/30 text-green-400',
  linkedin:   'bg-sky-900/30 text-sky-400',
  stackadapt: 'bg-violet-900/30 text-violet-400',
  reddit: 'bg-orange-900/30 text-orange-400',
  all:        'bg-gray-800 text-gray-300',
};

const BOARD_COLUMNS = ['upcoming', 'in_progress', 'blocked', 'done'];

/* ─── Badge Components ────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.backlog;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${cfg.color}`}>
      <Icon size={12} className={status === 'in_progress' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.task;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cfg.color}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

function PriorityIcon({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.p1;
  const Icon = cfg.icon;
  return <Icon size={14} className={cfg.color} title={cfg.label} />;
}

import PlatformIcon from "@/components/PlatformIcon";

function PlatformBadge({ platform }: { platform?: string }) {
  if (!platform) return null;
  return <PlatformIcon platform={platform} size={14} showLabel />;
}

function TagBadge({ tag }: { tag: string }) {
  return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{tag}</span>;
}

/* ─── Card Component ──────────────────────────────────── */

function WorkItemCard({ item, onStatusChange, onExpand }: {
  item: WorkItem;
  onStatusChange: (id: string, status: string) => void;
  onExpand: (item: WorkItem) => void;
}) {
  return (
    <div
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 hover:border-[var(--border-hover)] transition-colors cursor-pointer"
      onClick={() => onExpand(item)}
    >
      <div className="flex items-start gap-2 mb-2">
        <PriorityIcon priority={item.priority} />
        <h4 className="text-sm font-medium text-[var(--text-primary)] flex-1 leading-tight">{item.title}</h4>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <TypeBadge type={item.type} />
        <PlatformBadge platform={item.platform || undefined} />
        {item.assignee && (
          <span className="text-xs text-[var(--text-muted)]">@{item.assignee}</span>
        )}
      </div>

      {item.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-2">
          {item.tags.slice(0, 3).map(t => <TagBadge key={t} tag={t} />)}
          {item.tags.length > 3 && <span className="text-xs text-[var(--text-muted)]">+{item.tags.length - 3}</span>}
        </div>
      )}

      {item.updates?.[0] && (
        <p className="text-xs text-[var(--text-muted)] line-clamp-2 mt-1">
          {item.updates[0].content}
        </p>
      )}

      {(item._count?.children ?? 0) > 0 && (
        <div className="text-xs text-[var(--text-muted)] mt-2 flex items-center gap-1">
          <ListTodo size={12} />
          {item._count!.children} subtask{item._count!.children > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

/* ─── Detail Panel ────────────────────────────────────── */

function DetailPanel({ item, onClose, onStatusChange }: {
  item: WorkItem;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-[var(--bg-card)] border-l border-[var(--border)] shadow-2xl z-50 overflow-y-auto">
      <div className="sticky top-0 bg-[var(--bg-card)] border-b border-[var(--border)] p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate pr-4">{item.title}</h2>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <X size={20} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-[var(--text-muted)] text-xs block mb-1">Status</span>
            <select
              value={item.status}
              onChange={(e) => onStatusChange(item.id, e.target.value)}
              className="bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] w-full"
            >
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-[var(--text-muted)] text-xs block mb-1">Type</span>
            <TypeBadge type={item.type} />
          </div>
          <div>
            <span className="text-[var(--text-muted)] text-xs block mb-1">Priority</span>
            <div className="flex items-center gap-1">
              <PriorityIcon priority={item.priority} />
              <span className="text-sm text-[var(--text-primary)]">{item.priority.toUpperCase()}</span>
            </div>
          </div>
          <div>
            <span className="text-[var(--text-muted)] text-xs block mb-1">Assignee</span>
            <span className="text-sm text-[var(--text-primary)]">{item.assignee || '—'}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] text-xs block mb-1">Platform</span>
            <PlatformBadge platform={item.platform || undefined} />
          </div>
          <div>
            <span className="text-[var(--text-muted)] text-xs block mb-1">Source</span>
            <span className="text-sm text-[var(--text-primary)]">{item.source}</span>
          </div>
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div>
            <span className="text-[var(--text-muted)] text-xs block mb-1">Tags</span>
            <div className="flex gap-1 flex-wrap">
              {item.tags.map(t => <TagBadge key={t} tag={t} />)}
            </div>
          </div>
        )}

        {/* Description */}
        {item.description && (
          <div>
            <span className="text-[var(--text-muted)] text-xs block mb-1">Description</span>
            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{item.description}</p>
          </div>
        )}

        {/* Children */}
        {item.children && item.children.length > 0 && (
          <div>
            <span className="text-[var(--text-muted)] text-xs block mb-2">Subtasks</span>
            <div className="space-y-1">
              {item.children.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-sm p-2 rounded bg-[var(--bg-base)]">
                  <StatusBadge status={c.status} />
                  <span className="text-[var(--text-primary)] flex-1">{c.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity log */}
        <div>
          <span className="text-[var(--text-muted)] text-xs block mb-2">Activity</span>
          <div className="space-y-3">
            {item.updates?.map(u => (
              <div key={u.id} className="border-l-2 border-[var(--border)] pl-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-[var(--text-primary)]">@{u.author}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' '}
                    {new Date(u.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {u.type !== 'note' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{u.type}</span>
                  )}
                </div>
                <p className="text-sm text-[var(--text-secondary)]">{u.content}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Timestamps */}
        <div className="text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border)]">
          Created {new Date(item.createdAt).toLocaleDateString()} · Updated {new Date(item.updatedAt).toLocaleDateString()}
          {item.completedAt && ` · Completed ${new Date(item.completedAt).toLocaleDateString()}`}
        </div>
      </div>
    </div>
  );
}

/* ─── Create Modal ────────────────────────────────────── */

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('task');
  const [status, setStatus] = useState('backlog');
  const [priority, setPriority] = useState('p1');
  const [platform, setPlatform] = useState('');
  const [assignee, setAssignee] = useState('');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await fetch('/api/work-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        type,
        status,
        priority,
        platform: platform || null,
        assignee: assignee || null,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        description: description || null,
        source: 'manual',
        initialUpdate: description ? { author: 'aziz', content: description } : undefined,
      }),
    });
    setSaving(false);
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-[520px] max-h-[80vh] overflow-y-auto"
      >
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">New Work Item</h2>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <input
            autoFocus
            placeholder="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
          />

          <div className="grid grid-cols-2 gap-3">
            <select value={type} onChange={e => setType(e.target.value)} className="bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)]">
              {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={status} onChange={e => setStatus(e.target.value)} className="bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)]">
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)]">
              <option value="p0">P0 — Urgent</option>
              <option value="p1">P1 — Normal</option>
              <option value="p2">P2 — Low</option>
            </select>
            <select value={platform} onChange={e => setPlatform(e.target.value)} className="bg-[var(--bg-base)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)]">
              <option value="">No platform</option>
              <option value="google_ads">Google Ads</option>
              <option value="linkedin">LinkedIn</option>
              <option value="stackadapt">StackAdapt</option>
              <option value="reddit">Reddit</option>
              <option value="all">All platforms</option>
            </select>
          </div>

          <input
            placeholder="Assignee (aziz, ares, etc.)"
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
          />

          <input
            placeholder="Tags (comma-separated)"
            value={tags}
            onChange={e => setTags(e.target.value)}
            className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
          />

          <textarea
            placeholder="Description / notes"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none"
          />
        </div>

        <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="px-4 py-1.5 text-sm font-medium rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Board View ──────────────────────────────────────── */

function BoardView({ items, onStatusChange, onExpand }: {
  items: WorkItem[];
  onStatusChange: (id: string, status: string) => void;
  onExpand: (item: WorkItem) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-4 min-h-[60vh]">
      {BOARD_COLUMNS.map(col => {
        const cfg = STATUS_CONFIG[col];
        const colItems = items.filter(i => i.status === col);
        return (
          <div key={col} className="flex flex-col">
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={`text-sm font-medium ${cfg.color.split(' ')[0]}`}>{cfg.label}</span>
              <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-base)] px-1.5 rounded">{colItems.length}</span>
            </div>
            <div className="space-y-2 flex-1">
              {colItems.map(item => (
                <WorkItemCard key={item.id} item={item} onStatusChange={onStatusChange} onExpand={onExpand} />
              ))}
              {colItems.length === 0 && (
                <div className="text-xs text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-lg">
                  No items
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── List View ───────────────────────────────────────── */

function ListView({ items, onStatusChange, onExpand }: {
  items: WorkItem[];
  onStatusChange: (id: string, status: string) => void;
  onExpand: (item: WorkItem) => void;
}) {
  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--bg-card)] border-b border-[var(--border)]">
            <th className="text-left px-3 py-2 text-xs text-[var(--text-muted)] font-medium w-8"></th>
            <th className="text-left px-3 py-2 text-xs text-[var(--text-muted)] font-medium">Title</th>
            <th className="text-left px-3 py-2 text-xs text-[var(--text-muted)] font-medium w-28">Type</th>
            <th className="text-left px-3 py-2 text-xs text-[var(--text-muted)] font-medium w-28">Status</th>
            <th className="text-left px-3 py-2 text-xs text-[var(--text-muted)] font-medium w-24">Platform</th>
            <th className="text-left px-3 py-2 text-xs text-[var(--text-muted)] font-medium w-20">Assignee</th>
            <th className="text-left px-3 py-2 text-xs text-[var(--text-muted)] font-medium w-24">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr
              key={item.id}
              onClick={() => onExpand(item)}
              className="border-b border-[var(--border)] hover:bg-[var(--bg-card)] cursor-pointer transition-colors"
            >
              <td className="px-3 py-2"><PriorityIcon priority={item.priority} /></td>
              <td className="px-3 py-2 text-[var(--text-primary)] font-medium">{item.title}</td>
              <td className="px-3 py-2"><TypeBadge type={item.type} /></td>
              <td className="px-3 py-2"><StatusBadge status={item.status} /></td>
              <td className="px-3 py-2"><PlatformBadge platform={item.platform || undefined} /></td>
              <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{item.assignee || '—'}</td>
              <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                {new Date(item.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Summary Cards ───────────────────────────────────── */

function SummaryCards({ items }: { items: WorkItem[] }) {
  const counts = {
    total: items.length,
    in_progress: items.filter(i => i.status === 'in_progress').length,
    blocked: items.filter(i => i.status === 'blocked').length,
    done: items.filter(i => i.status === 'done').length,
    upcoming: items.filter(i => i.status === 'upcoming' || i.status === 'backlog').length,
  };

  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {[
        { label: 'Total', value: counts.total, color: 'text-[var(--text-primary)]' },
        { label: 'In Progress', value: counts.in_progress, color: 'text-amber-400' },
        { label: 'Blocked', value: counts.blocked, color: 'text-red-400' },
        { label: 'Upcoming', value: counts.upcoming, color: 'text-blue-400' },
        { label: 'Done', value: counts.done, color: 'text-emerald-400' },
      ].map(c => (
        <div key={c.label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
          <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
          <div className="text-xs text-[var(--text-muted)]">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────── */

export default function WorkPage() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);

  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');

  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterType) params.set('type', filterType);
    if (filterPlatform) params.set('platform', filterPlatform);
    params.set('includeChildren', 'true');
    params.set('limit', '200');

    const res = await fetch(`/api/work-items?${params}`);
    const data = await res.json();
    setItems(data.items || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [filterType, filterStatus, filterPlatform]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleStatusChange = async (id: string, status: string) => {
    await fetch(`/api/work-items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        update: {
          author: 'aziz',
          type: 'status_change',
          content: `Status changed to ${STATUS_CONFIG[status]?.label || status}`,
        },
      }),
    });
    fetchItems();
    if (selectedItem?.id === id) {
      // Refresh detail panel
      const res = await fetch(`/api/work-items/${id}`);
      setSelectedItem(await res.json());
    }
  };

  const handleExpand = async (item: WorkItem) => {
    const res = await fetch(`/api/work-items/${item.id}`);
    setSelectedItem(await res.json());
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList size={24} className="text-[var(--accent)]" />
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Work Tracker</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex border border-[var(--border)] rounded overflow-hidden">
            <button
              onClick={() => setView('board')}
              className={`p-1.5 ${view === 'board' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-1.5 ${view === 'list' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              <List size={16} />
            </button>
          </div>

          {/* Export */}
          <a
            href="/api/work-items/export"
            target="_blank"
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded"
            title="Export JSON"
          >
            <Download size={16} />
          </a>

          {/* Create */}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded bg-[var(--accent)] text-white hover:opacity-90"
          >
            <Plus size={16} />
            New Item
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={14} className="text-[var(--text-muted)]" />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="">All types</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select
          value={filterPlatform}
          onChange={e => setFilterPlatform(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="">All platforms</option>
          <option value="google_ads">Google Ads</option>
          <option value="linkedin">LinkedIn</option>
          <option value="stackadapt">StackAdapt</option>
              <option value="reddit">Reddit</option>
          <option value="all">Cross-platform</option>
        </select>
        {(filterType || filterStatus || filterPlatform) && (
          <button
            onClick={() => { setFilterType(''); setFilterStatus(''); setFilterPlatform(''); }}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Summary */}
      <SummaryCards items={items} />

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : view === 'board' ? (
        <BoardView items={items} onStatusChange={handleStatusChange} onExpand={handleExpand} />
      ) : (
        <ListView items={items} onStatusChange={handleStatusChange} onExpand={handleExpand} />
      )}

      {/* Detail panel */}
      {selectedItem && (
        <DetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={fetchItems} />
      )}
    </div>
  );
}
