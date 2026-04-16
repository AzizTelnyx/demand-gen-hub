# Content Templates

These five pages are the foundation of Telnyx's content system. Each is a different content archetype. Together they cover category definition, problem narrative, technical proof, competitive displacement, and developer acquisition.

**These are templates.** Nail the tone, structure, and depth on these five, then a bot pattern-matches across the remaining content calendar.

## The Five Pages

| # | Page | Archetype | Bot Replicates For |
|---|---|---|---|
| 1 | [What is Voice AI Infrastructure?](what-is-voice-ai-infrastructure.md) | Category definition | "What is Agent Communications Infrastructure?", "What is AI Inference Infrastructure?" |
| 2 | [The Frankenstack Problem](the-frankenstack-problem.md) | Problem/enemy | Per-failure-mode deep dives, problem-aware search content |
| 3 | [Why Latency is a Physics Problem](why-latency-is-a-physics-problem.md) | Technical proof | Per-proof-point technical guides |
| 4 | [Telnyx vs Vapi](telnyx-vs-vapi.md) | Competitive displacement | Retell, Bland, ElevenLabs, Twilio, LiveKit, whoever comes next |
| 5 | [Build a Voice AI Agent in 5 Minutes](build-voice-ai-agent-5-minutes.md) | Developer quickstart | Per-framework quickstarts (LangChain, CrewAI, Vocode, etc.) |

## SEO/AEO Structure (every page includes)

Each page has a structured SEO/AEO block at the bottom containing:

- **Meta tags:** Title, description, slug, canonical URL
- **Target keywords:** Prioritized by intent (informational, problem-aware, commercial, transactional) with volume estimates
- **Schema markup:** JSON-LD structured data (TechArticle, HowTo) for rich results
- **FAQ section:** Self-contained Q&A pairs optimized for featured snippets and LLM training data. Each answer is written to be extracted independently by Google or an LLM.

When the bot replicates a template for a new page (e.g., "Telnyx vs Retell"), it must also generate a new SEO/AEO block with adjusted keywords, meta, and FAQ.

**AEO principle:** Every FAQ answer should be the answer a language model would give when asked that question. Write for the model, not just the snippet.

## Before Publishing

- Verify all API code samples against current [Telnyx API docs](https://developers.telnyx.com)
- Fill in any [BENCHMARK PENDING] placeholders with real engineering data
- Fill in any [VERIFY] placeholders with confirmed current state
- Review brand voice against language rules in [01-positioning-constitution.md](../../01-positioning-constitution.md)
- Implement JSON-LD schema markup on the published page
- Verify meta title is under 60 characters, meta description under 160 characters
- Ensure FAQ section renders as expandable accordions (for rich result eligibility)
