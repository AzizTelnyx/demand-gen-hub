# Hub UI

> **Last updated:** 2026-04-20

---

## URL

- **Local:** http://localhost:3000
- **Remote:** https://telnyx-dg-hub.ngrok.app
- **PM2 process:** `dg-hub`
- **Framework:** Next.js 15, Tailwind CSS, Lucide icons

---

## ABM Pages

| Route | Purpose | Status |
|-------|---------|--------|
| `/abm/domains` | Landing page — search-first, 2,555 domains with relevance scores | ✅ Working |
| `/abm/campaigns` | Campaigns by product with spend/impressions | ✅ Working |
| `/abm/exclusions` | 3,810 exclusions — add, push to SA, restore | ✅ Working |
| `/abm/agents` | Agent run history | ✅ Working |
| `/abm/builder` | List builder with "Copy from Product Audience" | ✅ Working |
| `/abm/docs` | System documentation (this content, rendered in UI) | ✅ Working |

---

## API Routes

### Read Routes

| Route | Purpose |
|-------|---------|
| `GET /api/abm/domains` | Search/filter ABMAccount |
| `GET /api/abm/campaigns` | List ABMCampaignSegment |
| `GET /api/abm/exclusions` | List ABMExclusion |
| `GET /api/abm/lists` | List ABMList + ABMListRule |
| `GET /api/abm/waste` | Waste analysis by domain |

### Write Routes

| Route | Purpose | Status |
|-------|---------|--------|
| `POST /api/abm/exclusions` | Add exclusion | ✅ Working |
| `POST /api/abm/exclusions/restore` | Restore exclusion | ✅ Working (SF pipeline safety check) |
| `POST /api/abm/exclusions/push` | Push exclusions to SA | ✅ Working |
| `POST /api/abm/domains` | Add domain | ✅ Working |

---

## Key Components

| Component | Purpose |
|-----------|---------|
| `DomainSlideOut` | Side panel showing domain details, scores, actions |
| `RelevanceBar` | Visual relevance score (0–1) |
| `SfBadge` | Salesforce link indicator |
| `PlatformBadge` | Platform icon (SA/LI/GAds) |
| `InfoTooltip` | ℹ️ icon with hover explanation |

---

## Design Principles

- Info icons (ℹ️) with tooltip popups for self-documentation
- Every data-modifying button has confirmation dialog
- Every action button has loading state
- All dates use relative formatting
- Matches hub design system (Tailwind + CSS vars, indigo accent)
