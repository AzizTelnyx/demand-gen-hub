# Build a Voice AI Agent with Telnyx in 5 Minutes

*Developer/bot quickstart. Template archetype: developer acquisition. Bot replicates for per-framework quickstarts: "LangChain + Telnyx: First Call in 5 Minutes", "CrewAI + Telnyx Voice", "Vocode + Telnyx", "LiveKit + Telnyx Telephony", etc.*

*Target queries: "voice AI quickstart", "build voice AI agent", "voice AI tutorial", "telnyx voice AI getting started", "AI phone agent tutorial"*

*Messaging mode: Bottom-up (Problem > Solution > Architecture > Category)*

---

This guide gets you from zero to a working voice AI agent that can answer phone calls. No Frankenstack. No five-vendor integration. One infrastructure, one API key.

## What You'll Build

A voice AI agent that:
- Answers inbound phone calls on a real phone number
- Transcribes the caller's speech in real time (STT)
- Sends the transcript to a language model for a response (LLM)
- Speaks the response back to the caller (TTS)
- Runs entirely on Telnyx infrastructure with zero inter-provider hops

<!-- HERO IMAGE: 5-minute quickstart -->
<!-- Visual: Clean timeline/flow showing 4 steps: Get Number (30s) -> Create Agent (60s) -> Connect (30s) -> Call. Total: under 5 minutes. Phone icon at the end. -->
<!-- Style: Minimal, developer-friendly, Telnyx brand colors -->
<!-- Dimensions: Full-width, 4:1 ratio (wide banner) -->
<!-- Alt: "Voice AI agent quickstart: four steps from zero to a working agent in under 5 minutes" -->

## Prerequisites

- A Telnyx account ([sign up at telnyx.com](https://telnyx.com))
- A Telnyx API key
- Python 3.9+ or Node.js 18+

That's it. No Twilio account. No Deepgram account. No ElevenLabs account. No orchestration platform. One account, one API key.

## Step 1: Get a Phone Number (30 seconds)

### Python

```python
import telnyx

telnyx.api_key = "YOUR_API_KEY"

# Search for available numbers
available = telnyx.AvailablePhoneNumber.list(
    filter={"country_code": "US", "features": ["voice"]},
    page={"size": 1}
)

# Order the first available number
number = available.data[0]
order = telnyx.NumberOrder.create(
    phone_numbers=[{"phone_number": number.phone_number}]
)

print(f"Your number: {number.phone_number}")
```

### Node.js

```javascript
const telnyx = require('telnyx')('YOUR_API_KEY');

// Search for available numbers
const available = await telnyx.availablePhoneNumbers.list({
  filter: { country_code: 'US', features: ['voice'] },
  page: { size: 1 }
});

// Order the first available number
const number = available.data[0];
const order = await telnyx.numberOrders.create({
  phone_numbers: [{ phone_number: number.phoneNumber }]
});

console.log(`Your number: ${number.phoneNumber}`);
```

## Step 2: Create a Voice AI Agent (60 seconds)

Configure your AI agent with a system prompt and model preferences.

### Python

```python
# Create a Voice AI agent
agent = telnyx.VoiceAIAgent.create(
    name="My First Agent",
    system_prompt="""You are a helpful assistant answering phone calls 
    for Acme Corp. Be concise, friendly, and professional. 
    If you don't know the answer, say so.""",
    voice="female-1",  # TTS voice selection
    language="en-US",
    model="gpt-4o",  # LLM selection
    first_message="Hello! Thanks for calling Acme Corp. How can I help you today?"
)

print(f"Agent ID: {agent.id}")
```

### Node.js

```javascript
const agent = await telnyx.voiceAIAgents.create({
  name: 'My First Agent',
  system_prompt: `You are a helpful assistant answering phone calls 
    for Acme Corp. Be concise, friendly, and professional. 
    If you don't know the answer, say so.`,
  voice: 'female-1',
  language: 'en-US',
  model: 'gpt-4o',
  first_message: "Hello! Thanks for calling Acme Corp. How can I help you today?"
});

console.log(`Agent ID: ${agent.id}`);
```

## Step 3: Connect the Number to the Agent (30 seconds)

### Python

```python
# Assign the phone number to the agent
telnyx.PhoneNumber.update(
    number.phone_number,
    voice_ai_agent_id=agent.id
)

print(f"Done! Call {number.phone_number} to talk to your agent.")
```

### Node.js

```javascript
await telnyx.phoneNumbers.update(number.phoneNumber, {
  voice_ai_agent_id: agent.id
});

console.log(`Done! Call ${number.phoneNumber} to talk to your agent.`);
```

## Step 4: Call Your Agent

Pick up your phone. Dial the number. Talk to your AI agent.

That's it. Four steps. One API key. No vendor stitching. No webhook orchestration. No five separate accounts.

<!-- DIAGRAM: Under the hood -->
<!-- Visual: Numbered flow diagram showing the 5 internal steps (call arrives, STT, LLM, TTS, audio returned) all inside a single "Telnyx Infrastructure" box. Contrast with a grayed-out Frankenstack diagram showing the same flow crossing 5 vendor boundaries. -->
<!-- Alt: "How a voice AI call flows through Telnyx infrastructure: all processing stages on one network vs multi-vendor alternative" -->

## What's Happening Under the Hood

When someone calls your number:

1. The call arrives on Telnyx's carrier network. Telnyx is the carrier, not a reseller. The call is authenticated with A-level STIR/SHAKEN attestation.

2. Audio streams to Telnyx STT in the same facility. Speech is transcribed in real time. No audio leaves the network to reach a third-party STT provider.

3. The transcript routes to the LLM through Telnyx's LLM Router, in the same facility. The model generates a response based on your system prompt.

4. The response goes to Telnyx TTS, in the same facility. Natural-sounding speech is synthesized.

5. The audio is delivered back to the caller through Telnyx's carrier network.

Total inter-provider network hops: zero. The call never leaves Telnyx infrastructure.

Compare this to the Frankenstack equivalent:

```
Traditional approach (5 vendors, weeks of integration):
  Twilio account + Deepgram account + OpenAI account + ElevenLabs account + Vapi account
  Webhook server to handle call events
  Orchestration logic to manage STT -> LLM -> TTS flow
  Error handling across 5 APIs
  5 API keys, 5 billing relationships, 5 support contacts
  Months to production

Telnyx approach (1 vendor, minutes to first call):
  Telnyx account
  3 API calls
  Done
```

## Next Steps

### Add Function Calling

Let your agent take actions during calls: look up account information, schedule appointments, transfer to a human.

```python
agent = telnyx.VoiceAIAgent.update(
    agent.id,
    tools=[
        {
            "type": "function",
            "function": {
                "name": "lookup_account",
                "description": "Look up a customer account by phone number or account ID",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "identifier": {
                            "type": "string",
                            "description": "Phone number or account ID"
                        }
                    },
                    "required": ["identifier"]
                }
            }
        }
    ],
    tool_webhook_url="https://your-server.com/tools"
)
```

### Handle Outbound Calls

Your agent can also make calls, not just answer them.

```python
call = telnyx.Call.create(
    to="+12125559999",
    from_=number.phone_number,
    voice_ai_agent_id=agent.id
)
```

### Monitor Performance

Track call quality, latency, and agent performance.

```python
# Get call analytics
calls = telnyx.VoiceAICall.list(
    filter={"agent_id": agent.id},
    page={"size": 10}
)

for call in calls.data:
    print(f"Call {call.id}: duration={call.duration_secs}s, "
          f"latency_p50={call.latency_p50_ms}ms, "
          f"status={call.status}")
```

### Scale to Production

The same infrastructure that handles your first test call handles your ten-thousandth concurrent call. No architecture changes. No new vendors. No new integration work.

Production considerations:
- **Number provisioning:** Provision numbers in bulk across regions
- **SLA:** Enterprise SLA with dedicated support
- **Compliance:** HIPAA, PCI, GDPR configurations available
- **Analytics:** Call-level and agent-level performance dashboards
- **Failover:** Built-in redundancy across Telnyx's multi-site infrastructure

## Why This Matters

When one infrastructure handles everything, getting started is three API calls. When five vendors must be stitched together, getting started is weeks of integration work.

The simplicity is not a UX feature. It is the architecture proving itself. The same design that makes setup simple makes production reliable and latency low.

---

*Note: Code samples above illustrate the Telnyx Voice AI API pattern. Verify exact API endpoints, parameter names, and SDK methods against the current [Telnyx API documentation](https://developers.telnyx.com) before publishing. The API design may have evolved since this template was written.*

---

*For framework-specific variants, the bot replicates this template with adjusted integration details:*
- *LangChain + Telnyx: Show TelnyxVoiceTool integration within a LangChain agent*
- *CrewAI + Telnyx: Show telephony capability added to CrewAI agents*
- *Vocode + Telnyx: Show Telnyx as the telephony backend for Vocode agents*
- *LiveKit + Telnyx: Show Telnyx carrier connectivity for LiveKit-based voice agents*

---

*Related: [What is Voice AI Infrastructure?](what-is-voice-ai-infrastructure.md) | [The Frankenstack Problem](the-frankenstack-problem.md) | [Telnyx vs Vapi](telnyx-vs-vapi.md)*

## SEO & AEO Optimization

### Meta

```
Title: Build a Voice AI Agent in 5 Minutes | Telnyx Quickstart
Meta Description: Get from zero to a working voice AI agent that answers phone calls in 5 minutes. One API key, one infrastructure, no vendor stitching. Python and Node.js code samples.
Slug: /resources/build-voice-ai-agent-quickstart
Canonical: https://telnyx.com/resources/build-voice-ai-agent-quickstart
```

### Target Keywords

| Priority | Keyword | Intent | Monthly Volume (est.) |
|---|---|---|---|
| Primary | build voice AI agent | Transactional | Medium |
| Primary | voice AI quickstart | Transactional | Low-Medium |
| Secondary | voice AI tutorial | Informational | Medium |
| Secondary | AI phone agent tutorial | Informational | Medium |
| Secondary | voice AI getting started | Informational | Low-Medium |
| Long-tail | build AI agent that answers phone calls | Transactional | Emerging |
| Long-tail | voice AI agent python | Transactional | Emerging |
| Long-tail | voice AI agent nodejs | Transactional | Emerging |
| Long-tail | how to make AI answer phone calls | Informational | Emerging |
| Long-tail | telnyx voice AI tutorial | Branded | Low |

### Bot Replication Keywords (for framework variants)

- LangChain: "langchain phone calls", "langchain voice AI", "langchain telnyx"
- CrewAI: "crewai voice", "crewai phone calls", "crewai telephony"
- Vocode: "vocode telnyx", "vocode PSTN", "vocode phone calls"
- LiveKit: "livekit telnyx", "livekit PSTN", "livekit telephony integration"

### Schema Markup (JSON-LD)

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Build a Voice AI Agent with Telnyx in 5 Minutes",
  "description": "Get from zero to a working voice AI agent that answers phone calls. One API key, no vendor stitching.",
  "totalTime": "PT5M",
  "tool": [
    { "@type": "HowToTool", "name": "Telnyx Account" },
    { "@type": "HowToTool", "name": "Python 3.9+ or Node.js 18+" }
  ],
  "step": [
    {
      "@type": "HowToStep",
      "name": "Get a Phone Number",
      "text": "Search for and provision a phone number via the Telnyx API.",
      "position": 1
    },
    {
      "@type": "HowToStep",
      "name": "Create a Voice AI Agent",
      "text": "Configure your agent with a system prompt, voice, and model preferences.",
      "position": 2
    },
    {
      "@type": "HowToStep",
      "name": "Connect the Number to the Agent",
      "text": "Assign the phone number to your agent with one API call.",
      "position": 3
    },
    {
      "@type": "HowToStep",
      "name": "Call Your Agent",
      "text": "Dial the number from any phone. Your AI agent answers.",
      "position": 4
    }
  ]
}
```

### FAQ Section

---

## Frequently Asked Questions

### How long does it take to build a voice AI agent with Telnyx?

Five minutes from signup to a working agent that answers phone calls. Three API calls: provision a number, create an agent, connect them. No separate accounts for telephony, STT, LLM, or TTS. One API key.

### What do I need to build a voice AI agent?

A Telnyx account, a Telnyx API key, and Python 3.9+ or Node.js 18+. No Twilio account, no Deepgram account, no ElevenLabs account, no orchestration platform. One vendor.

### Can my voice AI agent make outbound calls?

Yes. Use the same agent configuration for outbound calls. Specify the destination number and your agent's number, and the agent initiates the call with the same voice AI pipeline.

### How do I add function calling to my voice AI agent?

Define tools in your agent configuration with function names, descriptions, and parameters. Set a webhook URL where Telnyx sends function call requests during the conversation. Your server executes the function and returns the result.

### How does Telnyx voice AI scale to production?

The same infrastructure that handles your first test call handles thousands of concurrent calls. No architecture changes, no new vendors, no new integrations. Production features include enterprise SLA, HIPAA/PCI/GDPR configurations, call-level analytics, and built-in multi-site redundancy.

### What programming languages does Telnyx support for voice AI?

Telnyx provides SDKs for Python, Node.js, and Go. The REST API can be used from any language. The quickstart provides code samples in Python and Node.js.

### How is this different from using Vapi or Retell?

Vapi and Retell are orchestration layers that connect 4-6 third-party services. The Telnyx quickstart uses one infrastructure: telephony, STT, LLM routing, and TTS all run on the same carrier-owned network. This means lower latency (zero inter-provider hops), higher reliability (one system, not five), and simpler integration (three API calls, not five vendor accounts).
