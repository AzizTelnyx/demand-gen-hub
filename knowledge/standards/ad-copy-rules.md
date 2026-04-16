# Ad Copy Rules

## Brand Voice
- Sound like an engineer, not a marketer
- Be specific — use numbers
- Proof points over promises
- Never use em dashes (— or –), use hyphens (-) only
- No filler phrases ("leading", "best-in-class", "cutting-edge") — see BANNED WORDS below
- NEVER use "platform" — sounds like 2010. Use "stack", "infrastructure", or just the product
- NEVER check the "political content" or "election ads" box when creating campaigns. Telnyx is a tech company, not a political advertiser
- NEVER use "Talk to Sales" or "Speak to Sales" — use "Talk to an Engineer" or "Get Expert Help"
- No specific latency numbers (sub-200ms, sub-300ms) — use "real-time", "co-located", "carrier-grade"
- Sitelink text max 25 chars — test before creating to avoid truncation

## Canonical Positioning (NEW — as of April 2026)
**Source:** `knowledge/brand/narrative-positioning-constitution.md`
**Repo:** https://github.com/team-telnyx/telnyx-narrative-positioning-system

### Category: Real-time AI infrastructure
- **One-line thesis:** Real-time AI requires three layers working together, and Telnyx is the only company that owns all three
- **Application frame:** Built for bots that talk to humans
- **Enemy:** The Frankenstack (multi-vendor voice AI stacks)
- **Scaling thesis:** Most platforms get worse globally. Telnyx gets better.

### The Three Layers (use INSTEAD of old 4-pillar framework for ALL new copy):
1. **Global Communications (Trust)** — Carrier identity, compliance, economics. Enemy: Twilio. ICP: ISVs, enterprise
2. **Voice AI Platform (Infrastructure)** — Kill the Frankenstack. Win at cost. Enemy: ElevenLabs, Vapi, Retell, Bland, LiveKit. ICP: Creators, ISVs, BPOs
3. **Edge Compute (Physics)** — Win on speed, cost, global access. Enemy: Together.ai, Fireworks, Cloudflare. ICP: Developers, ISVs

### BANNED WORDS (from positioning constitution):
leverage, unlock, empower, best-in-class, cutting-edge, game-changing, synergy, holistic

### Language Rules:
- **Always lead with:** Real-time AI infrastructure, three layers working together, compute/voice/telecom in one system, built for bots that talk to humans, voice AI infrastructure, AI communications infrastructure, trust infrastructure for voice AI
- **Never lead with:** CPaaS, telecom APIs, developer communications tools, better voice AI / better inference / better communications APIs
- **Voice:** Infrastructure company voice. Technical precision over marketing polish. When better, say it plainly with proof. When no proof, say "benchmark pending"
- **Numbers discipline:** Every stat must have verifiable source or be marked [INTERNAL ESTIMATE] or [BENCHMARK PENDING]

### Messaging Hierarchy (communicate in this order):
1. Category: Real-time AI infrastructure — three layers, one system
2. Core value: Built for bots that talk to humans. Lower latency. Lower cost. Global by default.
3. Structural proof: The only company that owns edge compute, voice AI platform, and global communications
4. Platform proof: Carrier network, global routing, co-located inference, identity attestation
5. Product proof: Voice API, STT Router, TTS Router, LLM Router, Hosted LiveKit, ClawdTalk

### Two Messaging Modes:
- **Top-Down** (exec/social/category): Category → Value → Proof → Product
- **Bottom-Up** (developer/technical/problem): Problem → Solution → Architecture → Category

## Ad Review Framework
For every ad variant, map to:
1. **Official messaging pillar** - does it align?
2. **Fact-check** - can we prove the claim?
3. **PPC fit** - is this a search pattern or an SEO pattern?

### Output Format for Reviews
```
CURRENT: "Top Vapi Alternative"
ISSUE: SEO pattern, not PPC. Doesn't address friction.
USE THIS: "Migrate from Vapi in Minutes"
PILLAR: Performance (co-located infrastructure, real-time, production-grade - NO specific latency numbers like "sub-200ms" or "sub-300ms")
```

Always provide exact replacement copy. Never give vague feedback.

## RSA Headline Strategy
**CRITICAL: Only pin position 1, NEVER pin position 2.**
- Pin multiple headlines to Position 1 - Google rotates through them (brand headlines)
- Position 2 must be UNPINNED - each headline must work as a combo with ANY Pin 1 headline
- If you pin both 1 and 2, only 2 headlines show (kills rotation and testing)
- Position 3: CTA headlines, usually unpinned

**Structure:**
- Pin 1: Brand headlines ("Telnyx Voice AI Platform", "Telnyx | Voice AI", etc.)
- Position 2 (unpinned): Value props that work with any brand headline
- Position 3 (unpinned): CTAs
- Each ad group gets copy tailored to its keyword theme

**For competitor campaigns:**
- Do NOT mention competitor brand names in ad copy
- Lead with Telnyx positioning
- Keywords capture competitor search intent, ad copy sells Telnyx

## Common Mistakes
- Generic headlines that could be any SaaS company
- SEO-style headlines in PPC context ("Best X", "Top X")
- Feature-heavy copy without addressing pain points
- Duplicate creative across ad groups (dilutes signal)
- Missing UTMs on final URLs

## Product-Specific Copy Rules

### Voice AI / API Products
- **NEVER use dollar signs, prices, or cost mentions** - these are B2B API products billed per minute/API call
- Don't use consumer app language ("free trial", "download now")
- Focus on developer pain points: performance, reliability, integration, scale
- Use performance language: "co-located", "production-grade", "real-time", "built for scale", "enterprise-ready"
- NEVER use specific latency numbers (e.g., "sub-200ms", "sub-300ms") - these are arguable metrics
- Use technical proof points: co-located infrastructure, global network, API, SDK

### Landing Pages
- Competitor campaigns → home page (telnyx.com) with UTMs, UNLESS there's a dedicated competitor landing page (e.g., /the-best-vapi-alternative)
- Do NOT use /products/voice-ai-agents as landing page for competitor campaigns
- Always preserve UTMs when changing landing pages

### Headline Combinations (H1 + H2 story)
- Think of H1 + H2 as a pair that tells a story
- H1 (pinned): Hook or brand statement ("Telnyx Voice AI Platform")
- H2 (unpinned): Value prop that flows from H1 ("We Own the Infrastructure")
- Every H2 must make sense next to EVERY H1 in the same ad group
- Target audience: engineers in scaling or enterprise businesses, NOT all customers

### Contact Center
- Can mention "save" or "reduce costs" (proven ROI)
- Mention specific use cases: support automation, IVR, agent assist
