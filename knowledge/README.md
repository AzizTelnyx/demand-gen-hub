# Knowledge Base

36 files organized by category. Loaded by agents via `src/lib/knowledge-loader.ts`.

## Directory Structure

```
knowledge/
├── brand/
│   └── brand-messaging-q1-2026.md        → Ad Copy Generator, Ad Review, Creative
├── campaigns/
│   ├── contact-center-ccaas-campaign.md   → Example campaign briefs
│   ├── livekit-voice-ai-campaign.md
│   └── clawdtalk-influencer-brief.md
├── competitors/
│   └── voice-ai-landscape.md             → Ad Copy Generator, Ad Review
├── icps/
│   ├── developer.md                       → Reference for targeting
│   ├── enterprise-contact-center.md
│   └── TODO.md
├── messaging-frameworks/
│   ├── contact-center-framework.md        → Vertical-specific messaging
│   ├── healthcare-framework.md
│   └── voice-api-framework.md
├── playbooks/
│   ├── channel-benchmarks.md              → Campaign Deep Dive, Budget Calculator
│   ├── google-ads-playbook.md             → Reference
│   ├── linkedin-playbook.md               → Reference
│   └── stackadapt-playbook.md             → Reference
├── products/
│   ├── esim-messaging.md                  → Ad Copy Generator, Ad Review, Keyword Researcher
│   ├── iot-messaging.md
│   ├── mobile-voice-messaging.md
│   ├── voice-ai-dev-messaging.md
│   └── voice-api-messaging.md
├── standards/
│   ├── ad-copy-rules.md                   → Ad Copy Generator, Ad Review
│   ├── campaign-naming-conventions.md     → Campaign Orchestrator (validation)
│   ├── conversion-framework.md            → Reference
│   ├── geo-targeting-rules.md             → Campaign Orchestrator (validation)
│   ├── google-ads-rsa-best-practices.md   → Ad Copy Generator, Ad Review
│   ├── google-ads-standards.md            → Reference
│   ├── telnyx-icp.md                      → Keyword Researcher (seed terms)
│   └── utm-tagging-2025.md                → Campaign Orchestrator (validation)
├── verticals/
│   ├── contact-center-messaging.md        → Vertical campaigns
│   ├── healthcare-messaging.md
│   └── voice-ai-financial.md
├── workflows/
│   └── campaign-orchestration.md          → Campaign Optimizer (rules), Orchestrator
└── telnyx-strategy.md                     → General reference
```

## Agent → Knowledge File Mapping

| Agent | Files Used |
|-------|-----------|
| **Ad Copy Generator** | brand-messaging, ad-copy-rules, rsa-best-practices, voice-ai-landscape, products/{product} |
| **Keyword Researcher** | products/{product}, telnyx-icp |
| **Ad Review** | brand-messaging, ad-copy-rules, rsa-best-practices, products/{product} |
| **Campaign Deep Dive** | channel-benchmarks |
| **Campaign Optimizer** | campaign-orchestration |
| **Campaign Orchestrator** | campaign-orchestration, campaign-naming, geo-targeting, utm-tagging |
| **Creative Review** | brand-messaging, products/*, voice-ai-landscape |
| **Reporting** | (data-driven, no KB) |
| **Health Check** | (data-driven, no KB) |
| **Budget Calculator** | channel-benchmarks (hardcoded) |
| **Overlap Checker** | (data-driven, no KB) |
