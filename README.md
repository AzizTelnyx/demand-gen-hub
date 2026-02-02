# Demand Gen Hub

Unified operations platform for Demand Generation at Telnyx.

## Features

- **Campaigns Dashboard** — View all campaigns across Google Ads, StackAdapt, LinkedIn
- **Activity Log** — Track agent and user actions
- **Chat Interface** — Talk to the DG agent for queries and workflows
- **Campaign Builder** — Create campaigns via forms or chat (coming soon)
- **Ad Review** — Review ad copy against brand guidelines (coming soon)
- **ABM Lists** — Build and manage target account lists (coming soon)

## Tech Stack

- **Frontend:** Next.js 16, React, Tailwind CSS
- **Database:** SQLite (dev) / Postgres (prod)
- **ORM:** Prisma
- **Auth:** Simple shared password
- **Hosting:** Vercel

## Getting Started

```bash
# Install dependencies
npm install

# Set up database
npx prisma generate
npx prisma db push

# Run development server
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```
DATABASE_URL="file:./dev.db"
APP_PASSWORD="your-shared-password"
```

## Deployment

Deploy to Vercel:

```bash
vercel
```

For production, use Postgres:

```
DATABASE_URL="postgresql://..."
```

## Modules

### Campaigns Dashboard
- Unified view of all campaigns
- Filter by platform, status, channel
- Budget and spend tracking
- Pacing alerts

### Activity Log
- All agent and user actions
- Timestamps and details
- Filter by actor type

### Chat (WIP)
- Natural language interface
- Trigger workflows
- Query campaign data

## Agent Integration

The hub connects to Clawdbot agents in `~/clawd/agents/`:
- `ad-review` — Ad copy review
- `ad-copy-agent` — Ad copy generation
- `campaign-orchestrator` — Campaign building
- `campaign-analysis-agent` — Performance analysis
- `budget-pacing-agent` — Pacing monitoring
- `abm-list-builder` — ABM list creation

## License

Internal use only — Telnyx Marketing
