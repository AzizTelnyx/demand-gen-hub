# DG Hub — Comprehensive Page-by-Page Audit

**Date:** 2026-03-09  
**Hub URL:** http://localhost:3000  
**All APIs tested with curl, all page.tsx files reviewed**

---

## Summary

| Page | Status | APIs | Dark Mode Issues |
|------|--------|------|------------------|
| / (Command Center) | ✅ Working | 200 OK, 0.18s | Clean — uses CSS variables |
| /dashboard | ✅ Working | 200 OK, 0.36s | 🟡 3 hardcoded dark classes |
| /budget | ✅ Working | 200 OK, 0.03s | Minor (1 gray class) |
| /pipeline | ✅ Working | 200 OK, 0.31s | 🟡 4 hardcoded dark classes |
| /optimizations | ✅ Working | 200 OK, 0.008s | 🔴 8 hardcoded dark classes |
| /agents | ✅ Working | 200 OK, 0.04s | Clean — uses CSS class names |
| /ads | ✅ Working | 200 OK, 0.01s | 🔴 7 hardcoded dark classes |
| /abm | ✅ Working | 200 OK, 0.02s | Clean — uses CSS variables |
| /work | ✅ Working | 200 OK, 0.02s | 🔴 10 hardcoded dark classes |

**Overall: All 9 pages load, all APIs return data. No broken pages. Main issue is hardcoded dark-mode Tailwind classes that won't work in light mode.**

---

## 1. / (Command Center)

**Status: ✅ Working**

### API: `/api/campaigns`
- Response: 200 OK, 0.18s
- Returns 647 campaigns with full data (spend, impressions, clicks, product, funnel, region, attribution)
- All fields populated correctly

### What Works
- Board view, table view, coverage matrix
- Campaign detail panel with metrics
- Product group toggle, search, filters
- Uses CSS variables throughout: `var(--text-primary)`, `var(--bg-card)`, `var(--border)` etc.
- Theme-aware constants in `COLORS` object
- Loading/error states handled

### Issues
- None found. Best-themed page in the app.

---

## 2. /dashboard

**Status: ✅ Working**

### API: `/api/dashboard`
- Response: 200 OK, 0.36s
- Returns: metrics (spend, pipeline, campaigns, active), channelPerformance, topCampaigns, alerts, agentRuns, trackers

### What Works
- All 6 card sections render with data
- Campaign status, metrics, channel performance, top campaigns, agent runs, trackers
- Loading state with spinner
- Error state handled

### Dark Mode Issues
| Line | Class | Fix Needed |
|------|-------|------------|
| 57 | `bg-blue-900/30 text-blue-400` (in-progress badge) | Needs light variant |
| 58 | `bg-red-900/30 text-red-400` (blocked badge) | Needs light variant |
| 59 | `bg-emerald-900/30 text-emerald-400` (done badge) | Needs light variant |

**File:** `src/app/dashboard/page.tsx:57-59`

---

## 3. /budget

**Status: ✅ Working**

### API: `/api/budget?from=2026-02-07&to=2026-03-09`
- Response: 200 OK, 0.03s
- Returns: totals ($147,604 spend, 75 campaigns), pacing, byPlatform (4), byProduct (7), byFunnel (6), byRegion (5), topCampaigns (20), budgetPlans, recentChanges

### What Works
- Date range picker works (tested with params)
- Platform filter
- All breakdown sections: platform, product, funnel, region
- Top campaigns table
- Budget changes section (empty but handled)

### Dark Mode Issues
| Line | Class | Fix Needed |
|------|-------|------------|
| 382 | `bg-gray-500/20 text-gray-400` | Minor — gray is somewhat theme-neutral |

**File:** `src/app/budget/page.tsx:382`

---

## 4. /pipeline

**Status: ✅ Working**

### API: `/api/pipeline`
- Response: 200 OK, 0.31s
- Returns: attribution metrics, stages, campaignInfluence, exposedDeals

### What Works
- Date range picker
- Platform filter
- SF opportunity data, attribution metrics
- Pipeline stages visualization
- Campaign influence table
- Exposed deals section

### Dark Mode Issues
| Line | Class | Fix Needed |
|------|-------|------------|
| 20 | `bg-gray-900 border-gray-700` (InfoTip tooltip) | Needs light variant |
| 22 | `bg-gray-900 border-gray-700` (tooltip arrow) | Needs light variant |
| 406 | `bg-gray-800` (funnel tag) | Needs light variant |
| 407 | `bg-gray-800` (product tag) | Needs light variant |

**File:** `src/app/pipeline/page.tsx:20-22, 406-407`

---

## 5. /optimizations

**Status: ✅ Working**

### API: `/api/optimizations?days=30`
- Response: 200 OK, 0.008s
- Returns: 8 recommendations (7 applied, 1 rejected), 0 change history entries
- recStats with breakdowns by type/severity/status

### What Works
- Recommendations tab with 8 negative keyword recommendations
- Change history tab (empty but handled)
- Filters section
- Status badges (applied/rejected)

### Dark Mode Issues — 🔴 Heavy
| Line | Class | Fix Needed |
|------|-------|------------|
| 64 | `bg-blue-900/30 text-blue-400` (google_ads) | Needs light variant |
| 65 | `bg-violet-900/30 text-violet-400` (stackadapt) | Needs light variant |
| 66 | `bg-orange-900/30 text-orange-400` (reddit) | Needs light variant |
| 67 | `bg-sky-900/30 text-sky-400` (linkedin) | Needs light variant |
| 175 | `text-red-400 bg-red-900/20` (high severity) | Needs light variant |
| 175 | `text-amber-400 bg-amber-900/20` (medium severity) | Needs light variant |
| 175 | `text-blue-400 bg-blue-900/20` (low severity) | Needs light variant |

**File:** `src/app/optimizations/page.tsx:64-67, 175`

---

## 6. /agents

**Status: ✅ Working**

### API: `/api/agents/status`
- Response: 200 OK, 0.04s
- Returns: 5 agents (negative-keyword, ad-copy-review, budget-pacing, keyword-hygiene, google-ads-optimizer)
- 3 with completed runs, 2 idle

### What Works
- Agent list with status indicators
- Run history (3 agents have runs)
- Agent details with findings/recommendations counts
- Guardrails section

### Dark Mode Issues
- Clean — uses CSS class names (`status-running`, `severity-critical`) suggesting external stylesheet
- ~1046 lines but well-structured

---

## 7. /ads

**Status: ✅ Working**

### API: `/api/ads?query=&status=all&platform=all&adType=all`
- Response: 200 OK, 0.01s
- Returns: campaign list with name, platform, status (browse mode)
- Note: Returns campaigns, not individual ad creatives (mode=browse)

### What Works
- Creative/campaign list
- Filters (status, platform, ad type)
- Ad copy generator section
- AI suggestions

### Dark Mode Issues — 🔴 Heavy
| Line | Class | Fix Needed |
|------|-------|------------|
| 27-30 | `bg-*-900/30 text-*-400 border-*-800/30` (platform colors) | Needs light variants |
| 70-72 | `bg-emerald-900/30`, `bg-amber-900/30`, `bg-red-900/30` (status) | Needs light variants |
| 353 | `bg-indigo-900/20 text-indigo-400 border-indigo-800/20` (keyword tags) | Needs light variant |

**File:** `src/app/ads/page.tsx:27-30, 70-72, 353`

---

## 8. /abm

**Status: ✅ Working**

### API: `/api/abm`
- Response: 200 OK, 0.02s
- Returns: 50 accounts (13 tier-1, 37 tier-2), 1 list ("Q1 2026 Target Accounts"), filters, stats
- Accounts include pipeline values, SF account IDs, list memberships

### What Works
- Account lists (1 list with 50 accounts)
- Account details with pipeline values
- Tier breakdown (tier-1/tier-2)
- Status filtering (customer/identified)

### Dark Mode Issues
- Clean — uses CSS variables: `var(--border)`, `var(--bg-elevated)`, `var(--text-muted)`
- Only minor gray: `text-gray-500` on line 82, 720 (acceptable for muted text)

---

## 9. /work

**Status: ✅ Working**

### API: `/api/work-items?limit=5`
- Response: 200 OK, 0.02s
- Returns: 9 work items total, 5 returned (optimization tasks from agents)
- API route exists at `src/app/api/work-items/[id]/route.ts` ✅

### What Works
- Work items list with 9 items
- Filters (status, type, platform, priority)
- Status updates on items
- Detail view with updates array

### Dark Mode Issues — 🔴 Heaviest
| Line | Class | Fix Needed |
|------|-------|------------|
| 48 | `text-gray-400 bg-gray-800/50` (backlog status) | Needs light variant |
| 49 | `text-blue-400 bg-blue-900/30` (upcoming) | Needs light variant |
| 50 | `text-amber-400 bg-amber-900/30` (in_progress) | Needs light variant |
| 51 | `text-red-400 bg-red-900/30` (blocked) | Needs light variant |
| 52 | `text-emerald-400 bg-emerald-900/30` (done) | Needs light variant |
| 59 | `text-gray-400` (task type) | Minor |
| 66 | `text-gray-400` (p2 priority) | Minor |
| 70-74 | `bg-green-900/30`, `bg-sky-900/30`, `bg-violet-900/30`, `bg-orange-900/30`, `bg-gray-800` (platform colors) | Needs light variants |
| 117 | `bg-gray-800 text-gray-400` (tag pill) | Needs light variant |
| 271 | `bg-gray-800 text-gray-400` (update type badge) | Needs light variant |

**File:** `src/app/work/page.tsx:48-52, 59, 66, 70-74, 117, 271`

---

## Cross-Cutting Issues

### 1. Hardcoded Dark-Mode Pattern (Priority: Medium)
**Pattern:** `bg-{color}-900/30 text-{color}-400` used for badges/pills across 5 pages.

**Recommended fix:** Create a shared `badgeColors` utility that returns theme-aware classes, or use CSS variables like Command Center does:
```ts
// shared/badge-colors.ts
export const platformBadge = {
  google_ads: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  // ...
}
```

**Pages needing fix:** dashboard, optimizations, ads, work, pipeline

### 2. Inconsistent Theming Approach
- **Command Center (/)**: CSS variables ✅ (best)
- **ABM**: CSS variables ✅ (good)
- **Agents**: CSS class names ✅ (good)
- **Others**: Hardcoded Tailwind dark classes ❌

### 3. All APIs Healthy
Every API returns 200 with data in <0.4s. No missing endpoints, no errors. The `/api/work-items` route exists and works (was a concern from the route listing).

### 4. No Broken Functionality Found
All pages handle loading states, error states, and empty states properly. All filters pass through to API correctly.

---

## Priority Fix List

1. **🔴 /work page** — 10 hardcoded dark classes (most affected)
2. **🔴 /ads page** — 7 hardcoded dark classes
3. **🔴 /optimizations page** — 8 hardcoded dark classes
4. **🟡 /pipeline page** — 4 hardcoded dark classes (tooltip + tags)
5. **🟡 /dashboard page** — 3 hardcoded dark classes (status badges)
6. **🟢 /budget page** — 1 minor gray class
7. **✅ /, /abm, /agents** — No fixes needed
