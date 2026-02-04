# Demand Gen Hub — Project Status

**Last Updated:** 2026-02-04  
**Owner:** Aziz Malek  
**Status:** Active Development

---

## Quick Start

```bash
# Start the hub locally
cd ~/demand-gen-hub
pm2 start npm --name "dg-hub" -- run dev

# Expose publicly via Cloudflare tunnel
pm2 start /tmp/cloudflared --name tunnel -- tunnel --url http://localhost:3000

# Check status
pm2 list

# View logs
pm2 logs dg-hub --lines 50
```

**Current tunnel URL:** Check `pm2 logs tunnel` for the trycloudflare.com URL

**Password:** `telnyx-dg-2026`

---

## Architecture

### Tech Stack
- **Framework:** Next.js 16.1.6 with Turbopack
- **Database:** PostgreSQL via Prisma (Supabase)
- **AI:** Routes through Clawdbot API (not OpenAI directly)
- **Deployment:** Local dev server + Cloudflare tunnel for remote access

### Key Files
```
~/demand-gen-hub/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── builder/
│   │   │   │   ├── parse-brief/       # AI brief extraction
│   │   │   │   ├── research-audience/ # AI ICP analysis
│   │   │   │   ├── research-channels/ # AI channel recommendations
│   │   │   │   ├── generate-plan/     # AI campaign plan
│   │   │   │   ├── generate-copy/     # AI ad copy generation
│   │   │   │   ├── review-copy/       # AI ad copy review
│   │   │   │   ├── check-overlap/     # Keyword overlap check (NEW)
│   │   │   │   └── launch-google/     # Google Ads API integration
│   │   │   ├── chat/                  # Chat interface API
│   │   │   └── campaigns/             # Campaign data API
│   │   ├── builder/                   # Campaign Builder UI
│   │   ├── budget/                    # Budget Planner UI
│   │   └── chat/                      # Chat UI
│   ├── components/
│   │   └── CampaignBuilder/
│   │       ├── index.tsx              # Main orchestrator
│   │       └── steps/
│   │           ├── BriefInput.tsx
│   │           ├── BriefReview.tsx
│   │           ├── AudienceResearch.tsx
│   │           ├── ChannelBudget.tsx
│   │           ├── CampaignPlan.tsx
│   │           ├── AdCopyReview.tsx
│   │           ├── CopyReviewAgent.tsx
│   │           └── LaunchCampaign.tsx
│   └── lib/
│       ├── ai-client.ts               # Clawdbot API wrapper
│       ├── knowledge.ts               # Telnyx knowledge base
│       └── geography.ts               # Region/country mapping
├── .env                               # Production env vars
├── .env.local                         # Local env vars (Clawdbot token)
└── prisma/
    └── schema.prisma                  # Database schema
```

### Environment Variables (.env.local)
```
CLAWDBOT_URL=http://127.0.0.1:18789/v1/chat/completions
CLAWDBOT_TOKEN=a3f136b86ed51b3f511af4a50f136e8147d4bda08f314894
```

---

## Campaign Builder Flow

1. **Brief Input** → Paste notes or link Google Docs/Sheets
2. **Brief Review** → AI extracts product, audience, goals, regions, budget
3. **Audience Research** → AI generates ICP analysis
4. **Channel Budget** → AI recommends channels + budgets + overlap check
5. **Campaign Plan** → AI generates full plan with ad groups
6. **Ad Copy Review** → AI generates ad copy variants
7. **Copy QA** → AI reviews copy against brand guidelines
8. **Launch** → Creates campaign in Google Ads (WIP)

---

## Recent Fixes (2026-02-04)

### ✅ Back Navigation Caching
**Problem:** Going back in the builder re-ran the AI step instead of showing cached results.

**Solution:** Added `useRef(hasFetched)` pattern to all step components:
- AudienceResearch.tsx
- ChannelBudget.tsx
- CampaignPlan.tsx
- AdCopyReview.tsx
- CopyReviewAgent.tsx

**How it works:**
```typescript
const hasFetched = useRef(false);
const hasCachedData = propData !== null;

useEffect(() => {
  if (hasCachedData || hasFetched.current) {
    setIsLoading(false);
    return;
  }
  hasFetched.current = true;
  // ... fetch data
}, [dependencies]);
```

### ✅ Keyword Overlap Check
**Problem:** No validation if keywords already exist in Google Ads.

**Solution:** Added `/api/builder/check-overlap` endpoint that:
1. Takes array of keywords
2. Calls Clawdbot to query Google Ads
3. Returns overlap results with warnings

**Integrated in:** ChannelBudget.tsx — auto-checks when Google Search keywords are loaded.

### ✅ Cloudflare Tunnel Access
**Problem:** Aziz couldn't SSH tunnel to access local hub.

**Solution:** Using Cloudflare quick tunnel (no auth needed):
```bash
/tmp/cloudflared tunnel --url http://localhost:3000
```

---

## Known Issues / TODO

### High Priority
1. **Ad Group Structure Display** — Plan step shows ad group names but not keywords per ad group. Need to enhance generate-plan API to return keyword groupings.

2. **Google Ads Launch** — `launch-google` API exists but needs testing. Requires proper Google Ads API credentials.

3. **Timeout Handling** — Copy review can take 2+ minutes. Need to add progress indicators and timeout handling in UI.

### Medium Priority
4. **Vercel Deployment** — Vercel version has OpenAI billing issues. Either fix billing or remove OpenAI dependency entirely (use Clawdbot only).

5. **Campaign Tracker Integration** — Should log created campaigns to `~/clawd/campaigns/tracker.md`.

6. **LinkedIn/StackAdapt Launch** — Only Google Ads launch is partially built.

### Low Priority
7. **Chat Interface** — Works but could use conversation history persistence.

8. **Budget Dashboard** — Basic charts exist, could add more visualizations.

---

## AI Integration Details

### Clawdbot API
All AI calls route through Clawdbot's OpenAI-compatible endpoint:
```
POST http://127.0.0.1:18789/v1/chat/completions
Authorization: Bearer {CLAWDBOT_TOKEN}
```

This means:
- Uses same model as Clawdbot (Claude)
- No separate OpenAI billing
- Can leverage Clawdbot's context/tools if needed

### Fallback Behavior
If AI fails, most endpoints have rule-based fallbacks:
- `parse-brief`: Regex extraction
- `review-copy`: Basic character limit checks
- `check-overlap`: Returns "please verify manually"

---

## Testing the Hub

### Quick Test
```bash
# Test brief parser
curl -X POST http://localhost:3000/api/builder/parse-brief \
  -H "Content-Type: application/json" \
  -d '{"notes": "Create a Bandwidth campaign for EMEA. Voice focus. $150/day budget."}'

# Test overlap check
curl -X POST http://localhost:3000/api/builder/check-overlap \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["bandwidth alternative", "bandwidth vs telnyx"], "region": "EMEA"}'
```

### Full Flow Test
1. Go to `/builder`
2. Enter brief: "Bandwidth Alternative campaign for EMEA, Voice only, $150/day"
3. Step through each stage
4. Verify back button shows cached data (not loading spinner)

---

## Git Status

```bash
cd ~/demand-gen-hub
git status  # Check uncommitted changes
git log --oneline -5  # Recent commits
```

**Note:** Many changes from 2026-02-04 session are uncommitted. Commit before major changes.

---

## Related Files

- **Spec doc:** `~/clawd/projects/demand-gen-hub/SPEC.md`
- **DG Copilot:** `~/clawd/agents/dg-copilot/` — Planning agent that could orchestrate the hub
- **Campaign Tracker:** `~/clawd/campaigns/tracker.md`
- **Daily memory:** `~/clawd/memory/2026-02-04.md`

---

## Session Notes (2026-02-04)

### What We Did
1. Fixed Clawdbot token in .env.local (was wrong)
2. Tested full builder flow with Bandwidth EMEA campaign
3. Added overlap check API
4. Fixed back navigation caching issue
5. Set up Cloudflare tunnel for remote access

### Bandwidth Campaign (Pending)
Ready to create but not launched yet:
- **Name:** 202602 TOFU Bandwidth SA EMEA
- **Budget:** $150/day
- **Keywords:** bandwidth alternative, bandwidth vs telnyx, switch from bandwidth, etc.
- **Landing:** https://telnyx.com/the-better-bandwidth-alternative
- **Focus:** Voice only (not SMS/10DLC)

### Aziz's Feedback
1. ❌ Didn't validate keyword overlap → Fixed
2. ❌ Didn't show ad group structure with keywords → TODO
3. ❌ Ad copy review returned HTML error → Was timeout, works now
4. ❌ Back button reloads → Fixed with useRef pattern
