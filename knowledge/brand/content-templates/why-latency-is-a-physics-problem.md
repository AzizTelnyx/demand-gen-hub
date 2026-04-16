# Why Voice AI Latency is a Physics Problem, Not a Model Problem

*Technical proof page. Template archetype: technical proof. Bot replicates for per-proof-point guides: "Why Your Voice AI SLA Is Only As Good As Your Weakest Vendor", "Cross-Layer Tracing: How We Debug a Voice AI Call", "The Real Cost of Multi-Vendor Voice AI", etc.*

*Target queries: "voice AI latency", "reduce voice AI latency", "why voice AI is slow", "voice AI response time", "voice AI architecture latency"*

*Messaging mode: Bottom-up (Problem > Solution > Architecture > Category)*

---

The voice AI industry is optimizing the wrong thing.

Model providers are racing to reduce inference time. Faster STT. Faster LLM. Faster TTS. Sub-100ms component latency is marketed as a breakthrough.

It does not matter.

In a typical multi-vendor voice AI pipeline, model inference accounts for a fraction of total round-trip time. The majority of non-inference latency comes from a source that cannot be reduced by making models faster: the network path between separate providers.

This is a physics problem.

<!-- HERO IMAGE: Physics of latency -->
<!-- Visual: Globe with fiber optic lines. Callouts showing speed of light times between major cities (US East to London: 70ms RT, US East to Sydney: 150ms RT). Overlay showing additional vendor-boundary overhead at each hop. -->
<!-- Dimensions: Full-width, 16:9 -->
<!-- Alt: "Speed of light latency between global locations showing physical constraints on voice AI pipeline performance" -->

## Where the Time Goes

A voice AI round trip has two types of latency:

**Processing latency:** The time each model takes to do its work. STT converts audio to text. The LLM generates a response. TTS converts text to audio. These times are improving rapidly with better models and hardware.

**Network latency:** The time audio and data spend traveling between separate companies across the public internet. This is determined by physical distance, network routing, and the number of provider boundaries the data must cross.

In a multi-vendor pipeline:

```
Caller -> Telephony Provider (30-80ms network)
  -> STT Provider (50-150ms processing + 30-80ms network to next hop)
    -> LLM Provider (200-500ms processing + 30-80ms network to next hop)
      -> TTS Provider (50-200ms processing + 30-80ms network to next hop)
        -> Back to Telephony Provider (30-80ms network)
          -> Caller
```

Processing latency (model inference): 300-850ms. This is what vendors optimize and benchmark.

Network latency (inter-provider hops): 120-320ms. This is what nobody talks about. And it is the part that cannot be reduced by faster models.

Total round-trip: 420-1170ms. The network overhead is 15-40% of total latency, and it exists purely because the architecture routes data between separate companies.

## The Speed of Light Problem

Network latency has a hard physical floor: the speed of light in fiber optic cable.

Light in fiber travels at approximately two-thirds the speed of light in vacuum, which means:

- **~5ms per 1,000km** one way
- US East Coast to US West Coast: ~20ms one way, ~40ms round trip
- US East Coast to London: ~35ms one way, ~70ms round trip
- US East Coast to Sydney: ~75ms one way, ~150ms round trip

These are theoretical minimums. Real-world routing adds overhead from network hops, peering exchanges, and congestion. Actual latency between distant points is typically 1.5-2x the speed-of-light minimum.

In a Frankenstack, voice data travels between multiple separate networks:

1. From the telephony provider's data center to the STT provider's data center
2. From the STT provider's data center to the LLM provider's data center
3. From the LLM provider's data center to the TTS provider's data center
4. From the TTS provider's data center back to the telephony provider's data center

Even if every provider is in the same city, each hop crosses network boundaries (BGP routing, peering exchanges, load balancers, TLS handshakes). Even local inter-provider hops add 5-30ms of overhead.

If providers are in different regions, the physics gets worse. An STT provider in US-West and an LLM provider in US-East adds ~40ms of round-trip network latency for that single hop alone.

You cannot optimize the speed of light. You cannot optimize BGP routing between separate autonomous systems. You cannot optimize away the physical distance between separate data centers operated by separate companies.

## Why Faster Models Don't Fix This

Assume model inference reaches perfection: zero processing time. Total processing latency: 0ms.

In a 5-vendor pipeline, 120-320ms of network overhead remains. Even with infinitely fast models, the Frankenstack cannot get below this floor.

Humans perceive pauses above 200-300ms as unnatural. A multi-vendor pipeline burns 120-320ms just moving data between companies, leaving almost no budget for actual processing. This is why Retell AI's "industry-leading" ~600ms benchmark reveals the ceiling of what multi-vendor architectures can achieve, not how good the technology is.

<!-- DIAGRAM: Processing latency vs network latency -->
<!-- Visual: Two pipeline diagrams. Top: "Multi-vendor" with processing blocks (gray) separated by network hop blocks (red, 30-80ms each). Bottom: "Co-located" with processing blocks touching directly, no network blocks between them. Total times compared. -->
<!-- Alt: "Multi-vendor pipeline with 120-320ms network overhead vs co-located pipeline with zero inter-provider overhead" -->

## The Co-Location Solution

The solution is not faster models (though those help). The solution is eliminating the network hops between providers entirely.

When speech-to-text, language model routing, and text-to-speech all run in the same facility where voice calls terminate, the inter-provider network overhead drops to zero. Not reduced. Eliminated.

The data path becomes:

```
Caller -> Carrier switching infrastructure
  -> STT (same facility, microseconds of network time)
    -> LLM (same facility, microseconds of network time)
      -> TTS (same facility, microseconds of network time)
        -> Carrier switching infrastructure
          -> Caller
```

Total network overhead between processing stages: effectively zero. The only network latency is between the caller and the facility, which is a single path determined by the caller's physical location.

All remaining latency is processing time, which is the part that model improvements actually reduce. Every advance in model speed directly reduces end-to-end latency because there is no network overhead eating the budget.

## The Permanent Moat

A common objection: "Competitors will eventually co-locate their GPUs closer to users. Together AI, LiveKit, and others are already deploying regionally."

This misunderstands the argument.

Deploying GPUs in a data center is not the same as running inference in the same facility as the telephony switch you own.

When a voice AI company like Vapi deploys inference closer to Twilio's data centers, the call path is still:

```
Caller -> Twilio's network
  -> Vapi's inference cluster (separate network, separate company)
    -> Back to Twilio's network
      -> Caller
```

The inter-provider boundary still exists. The BGP routing between separate autonomous systems still exists. The hops between separate companies' load balancers, firewalls, and networks still exist.

Co-locating GPUs "near" a telephony provider's data center reduces distance but does not eliminate the network boundary. The provider boundary, the separate networks, the separate routing, the TLS handshakes between separate services still add 5-30ms per hop.

The only way to eliminate this overhead entirely is to own both the telephony infrastructure and the inference infrastructure. Run them in the same facility. On the same network. Under the same operational domain.

<!-- DIAGRAM: The permanent moat -->
<!-- Visual: Two scenarios. Left: "Competitor co-locates GPUs near Twilio" - shows GPU cluster NEAR but SEPARATE from Twilio's network, with a network boundary still between them (5-30ms). Right: "Telnyx: same facility, same network" - shows inference and telephony in ONE box, no boundary. -->
<!-- Alt: "Co-locating GPUs near a telephony provider still has network boundaries. Owning both eliminates them entirely." -->

That requires being a carrier. It requires owning switching infrastructure. It requires holding direct interconnects with tier-1 carriers. It requires telecom licenses.

This is a moat that cannot be closed by deploying more GPUs.

## What This Means in Production

**P99 matters, not P50.** Demo benchmarks show median latency. In production, network variability between providers makes P99 terrible even when P50 looks fine.

**Geography matters.** A Frankenstack built in San Francisco works in San Francisco. For callers in Sao Paulo, Dubai, or Sydney, every inter-provider hop adds distance-dependent latency that compounds.

**Scale amplifies it.** At 10,000 concurrent calls, worst-case network conditions between providers are happening constantly.

**The user feels it.** 200ms pause feels natural. 600ms feels distracted. 800ms feels broken. Latency determines whether the experience feels human or robotic.

## The Physics Argument in One Paragraph

Voice AI latency is primarily a network problem, not a model problem. In multi-vendor architectures, audio travels between separate companies across the public internet, adding 120-320ms of network overhead that cannot be reduced by making models faster. Co-locating inference with telephony termination on the same carrier network eliminates this overhead entirely. Competitors can deploy GPUs closer to users, but they cannot run inference in the same facility as the telephony switch they own, because they do not own a telephony switch. The physics advantage is permanent for anyone who also owns carrier infrastructure. It is temporary for everyone else.

---

*Related: [What is Voice AI Infrastructure?](what-is-voice-ai-infrastructure.md) | [The Frankenstack Problem](the-frankenstack-problem.md) | [Telnyx vs Vapi](telnyx-vs-vapi.md)*

## SEO & AEO Optimization

### Meta

```
Title: Why Voice AI Latency is a Physics Problem, Not a Model Problem
Meta Description: Voice AI latency is primarily caused by network hops between vendors, not model inference. Learn why co-locating inference with telephony eliminates 120-320ms of overhead that faster models cannot fix.
Slug: /resources/voice-ai-latency-physics-problem
Canonical: https://telnyx.com/resources/voice-ai-latency-physics-problem
```

### Target Keywords

| Priority | Keyword | Intent | Monthly Volume (est.) |
|---|---|---|---|
| Primary | voice AI latency | Informational/Problem-aware | Medium |
| Primary | reduce voice AI latency | Problem-aware | Medium |
| Secondary | why is voice AI slow | Problem-aware | Low-Medium |
| Secondary | voice AI response time | Informational | Low-Medium |
| Secondary | voice AI architecture latency | Informational | Low |
| Long-tail | how to reduce voice AI response time | Problem-aware | Emerging |
| Long-tail | voice AI co-location latency | Informational | Emerging |
| Long-tail | speed of light voice AI | Informational | Emerging |
| Long-tail | voice AI network latency vs model latency | Informational | Emerging |

### Schema Markup (JSON-LD)

```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Why Voice AI Latency is a Physics Problem, Not a Model Problem",
  "description": "In multi-vendor voice AI pipelines, 120-320ms of round-trip latency comes from network hops between providers. Co-locating inference with telephony eliminates this overhead entirely.",
  "author": {
    "@type": "Organization",
    "name": "Telnyx"
  },
  "about": [
    { "@type": "Thing", "name": "Voice AI Latency" },
    { "@type": "Thing", "name": "Network Latency" },
    { "@type": "Thing", "name": "Voice AI Infrastructure" }
  ]
}
```

### FAQ Section

---

## Frequently Asked Questions

### Why is voice AI latency a physics problem?

Each vendor boundary in a multi-vendor voice AI pipeline adds 30-80ms of network overhead from routing audio across the public internet between separate companies. This is determined by physical distance, network routing, and the speed of light in fiber (~5ms per 1,000km). These are physical constraints that cannot be optimized with better code or faster models.

### How much latency do network hops add to voice AI?

In a typical 5-vendor pipeline, inter-provider network overhead adds 120-320ms of round-trip latency. This is before any model processes anything. Even with zero processing time (infinitely fast models), the multi-vendor pipeline cannot get below this floor.

### What is co-located inference?

Co-located inference means running speech-to-text, language model routing, and text-to-speech in the same facility where voice calls terminate on carrier infrastructure. This eliminates inter-provider network hops entirely, reducing the network overhead between processing stages to effectively zero.

### Can competitors eliminate the latency advantage by deploying GPUs closer?

Deploying GPUs in a data center near a telephony provider reduces distance but does not eliminate the network boundary between separate companies. The provider boundary, separate networks, routing, and TLS handshakes still add overhead. The only way to eliminate this entirely is to own both the telephony infrastructure and the inference infrastructure and run them on the same network.

### What is the speed of light limitation in voice AI?

Light in fiber optic cable travels at approximately 5ms per 1,000km one way. US East to Sydney is approximately 150ms round trip at the speed of light. In a multi-vendor pipeline, data crosses multiple separate networks, each adding distance-dependent and routing-dependent latency on top of the physics minimum.

### How much latency can humans perceive in conversation?

Humans perceive conversational pauses above 200-300ms as unnatural. Multi-vendor voice AI pipelines typically have 600ms+ round-trip latency. A co-located architecture eliminates 120-320ms of network overhead, keeping more latency budget available for actual model processing and staying closer to natural conversational pacing.
