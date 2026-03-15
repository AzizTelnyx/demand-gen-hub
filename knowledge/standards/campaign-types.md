# Campaign Type Classification

## Conquest Campaigns

A campaign is a **conquest campaign** if its name contains a competitor brand name. These campaigns target users searching for a specific competitor — ads should ONLY appear for searches that include that competitor's brand name or close variants.

### Competitor Names to Detect in Campaign Names
Twilio, Vonage, Bandwidth, Plivo, Sinch, MessageBird, Nexmo, Vapi, Retell, Bland, ElevenLabs, LiveKit, Synthflow, PolyAI, Voiceflow, RingCentral, 8x8, Five9, Genesys, Sabre, Yeastar

### Detection Logic
Case-insensitive match of any competitor name within the campaign name string.

### Expected Search Term Behavior

| Campaign Example | ✅ Should Match | ❌ Should NOT Match |
|---|---|---|
| `202602 TOFU AI Agent ElevenLabs SA AMER` | "elevenlabs alternative", "elevenlabs pricing", "elevenlabs vs", "eleven labs api" | "ai voice generator", "text to speech api", "voice synthesis" |
| `202602 TOFU AI Agent Vapi SA AMER` | "vapi alternative", "vapi pricing", "vapi ai" | "voice ai platform", "build voice agent" |
| `202211 TOFU Voice API Twilio SA AMER` | "twilio alternative", "twilio pricing", "twilio vs" | "voice api", "programmable voice" |
| `202602 TOFU AI Agent LiveKit SA AMER` | "livekit alternative", "livekit pricing" | "real time audio api" |
| `202602 TOFU Retell AI Agent SA APAC` | "retell ai alternative", "retell pricing" | "ai phone agent" |

### Brand Name Variants to Accept
Some competitors have common alternate spellings:
- ElevenLabs → "elevenlabs", "eleven labs", "11labs"
- LiveKit → "livekit", "live kit"
- PolyAI → "polyai", "poly ai"
- RingCentral → "ringcentral", "ring central"
- MessageBird → "messagebird", "message bird"
- Five9 → "five9", "five 9"
- 8x8 → "8x8", "8 x 8"

## Non-Conquest Campaigns

Everything else. These target product/solution keywords (e.g., "voice api", "ai phone agent", "sip trunking provider").

## Rule for Agents

**On conquest campaigns, any search term that does NOT contain the competitor's brand name (or a close variant listed above) must be flagged as "non-branded term on conquest campaign."**

This is a **high-severity** finding. Non-branded terms on conquest campaigns waste budget on generic queries that non-conquest campaigns already handle. The keyword targeting is too broad and needs tightening (switch to exact match, add negative keywords for generic terms).

### Thresholds for Conquest Campaigns
- Flag terms with **>5 impressions** (not the standard 10)
- Flag terms with **>$5 spend** (not the standard $20)
- Keywords should be **exact or phrase match** for competitor brand terms only
- Any broad match or generic keywords on conquest campaigns should be flagged
