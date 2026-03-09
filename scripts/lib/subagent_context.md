# Sub-Agent Knowledge Injection

When spawning sub-agents via OpenClaw `sessions_spawn`, prepend the task with:

```
Before starting, load operational context:
- Read knowledge base: /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/knowledge/telnyx-strategy.md
- Read brand messaging: /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/knowledge/brand/brand-messaging-q1-2026.md
- For ad copy work, also read: knowledge/standards/ad-copy-rules.md, knowledge/standards/b2b-ad-copy-guide.md
- For creative/visual work, also read: knowledge/standards/b2b-ad-creative-guide.md
- Database: postgresql://localhost:5432/dghub
- Metrics: use scripts/query_metrics.py for live platform data (never DB)
- Credentials: ~/.config/ (google-ads, stackadapt, linkedin-ads, salesforce)

Then proceed with the task:
```

This ensures every sub-agent gets the same context as the main agent.
