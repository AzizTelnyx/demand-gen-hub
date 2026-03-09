# Product Groups

Canonical product groupings for campaign analysis, agent reasoning, and budget allocation.
All agents should reference this file when making product-level decisions.

---

## Voice AI
AI-powered voice products — the growth engine.

**Products:** AI Agent
**Variants:**
- Generic (no variant)
- Vertical: Healthcare, Contact Center, Insurance, Banking, Fintech, Travel, BPO
- Feature: TTS, STT, TTS API, STT API, Accelerator
- Conquest: Vapi, LiveKit, ElevenLabs (incl. 11labs), Retell, Synthflow
- Combined conquest: ElevenLabs+Vapi, 11labs+Vapi
- Promotional: Social Boost, Meme, Halloween

**Audience:** VP Engineering, CTO, Head of Product, Head of CX, AI/ML Engineers, Contact Center Leaders
**Intent signals:** voice ai, ai agent, conversational ai, tts, stt, text to speech, speech to text, ai voice agent

---

## Voice Infrastructure
Core voice connectivity — SIP trunking and programmable voice APIs.

**Products:** Voice API, SIP
**Variants:**
- Voice API: Generic, Twilio (conquest), Bandwidth (conquest)
- SIP: Generic

**Audience:** Telecom Engineers, IT Directors, VoIP Architects, UCaaS Buyers, Developers
**Intent signals:** sip trunk, sip trunking, voice api, programmable voice, call control, webrtc

---

## Messaging
SMS, MMS, and RCS messaging APIs.

**Products:** SMS, RCS
**Variants:**
- SMS: Generic, Twilio (conquest)
- RCS: Generic

**Audience:** Product Managers, Growth Engineers, Marketing Ops, Developers building notifications/2FA
**Intent signals:** sms api, sms gateway, bulk sms, 10dlc, a2p sms, messaging api, rcs

---

## Connectivity
Phone numbers and IoT SIM connectivity.

**Products:** Numbers, IoT SIM
**Variants:** None currently

**Audience:** Telecom Buyers, IT Procurement, IoT Platform Engineers, Developers needing DIDs
**Intent signals:** phone numbers, did, toll free, virtual number, iot sim, m2m sim, esim, iot connectivity

**Note:** eSIM is part of this group. Product messaging exists (`knowledge/products/esim-messaging.md`) but no campaigns are operational yet. IoT SIM targets businesses, not individuals.

---

## Mobile (NOT OPERATIONAL)
Mobile voice and messaging — exists in knowledge base but no active campaigns.
Reference: `knowledge/products/mobile-voice-messaging.md`

**Products:** Mobile Voice, Mobile Messaging
**Status:** Not operational in marketing. Keep separate from Messaging when activated.

---

## Cross-Cutting Rules

### Conquest Variants
Conquest campaigns (targeting competitor users: Twilio, Vapi, LiveKit, ElevenLabs, Bandwidth, Retell) stay under their parent product group. They are NOT a separate group.

### Budget Boundaries
- Budget reallocation is allowed WITHIN a product group (e.g., Voice API EMEA → Voice API AMER)
- Budget reallocation ACROSS product groups requires human approval (e.g., Voice AI → Messaging = NEVER auto)
- Each product group has independent budget targets

### Agent Reasoning
When agents analyze campaigns, they should:
1. Identify the product group from `parsedProduct` + `parsedVariant`
2. Apply group-level context (audience, intent signals) for relevancy scoring
3. Compare performance within the same product group, not across groups
4. Flag cross-group cannibalization if detected (e.g., AI Agent eating Voice API traffic)
