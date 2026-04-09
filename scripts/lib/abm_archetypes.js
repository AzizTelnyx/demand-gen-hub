const ARCHETYPES = [
  {
    key: "ai_agent_builders",
    label: "AI agent / voice agent builders",
    description:
      "Companies building AI agents, voice agents, conversational AI, AI receptionists, AI SDRs, AI support agents, AI calling products, dialers, voicebots, or call automation products.",
    includeSignals: [
      "voice agent",
      "ai agent",
      "conversational ai",
      "voicebot",
      "call automation",
      "ai receptionist",
      "dialer",
      "phone assistant",
      "call center automation",
      "voice ai",
      "ai calling",
    ],
    promptGuidance:
      "Return companies whose product is an AI/voice/call automation product. Prefer startups and software vendors building agents, dialers, or call automation.",
    evidenceKeywords: [
      "voice agent",
      "ai agent",
      "conversational ai",
      "voicebot",
      "call automation",
      "dialer",
      "ai receptionist",
      "ai sdr",
      "contact center automation",
      "voice ai",
      "phone assistant",
    ],
  },
  {
    key: "vertical_phone_workflows",
    label: "Vertical software with phone-native workflows",
    description:
      "Healthcare, fintech, collections, patient access, scheduling, verification, concierge, service operations, or customer support software where calls are central to the workflow.",
    includeSignals: [
      "patient access",
      "appointment scheduling",
      "collections",
      "verification",
      "call center",
      "phone support",
      "service dispatch",
      "care coordination",
      "booking support",
      "reminders",
    ],
    promptGuidance:
      "Return software companies where calls are structurally central to the workflow: patient comms, collections, verification, service ops, booking/support, or contact center operations.",
    evidenceKeywords: [
      "appointment",
      "scheduling",
      "patient",
      "collections",
      "verification",
      "contact center",
      "call center",
      "phone support",
      "dispatch",
      "concierge",
      "care coordination",
      "outbound calls",
      "inbound calls",
    ],
  },
  {
    key: "cx_operators",
    label: "Contact-center / BPO / CX operators",
    description:
      "BPOs, contact-center operators, and CX outsourcers with obvious high-volume phone workflows and automation needs.",
    includeSignals: ["bpo", "contact center", "cx", "customer support", "outsourcing", "call center"],
    promptGuidance:
      "Return BPOs, contact-center operators, and CX services firms where call volume is core to the business.",
    evidenceKeywords: ["bpo", "contact center", "call center", "cx", "outsourc", "customer support"],
  },
  {
    key: "embedded_voice_platforms",
    label: "Platform builders embedding telephony / voice automation",
    description:
      "Software companies where telephony, SIP, call routing, numbers, or AI calling is a core product component.",
    includeSignals: ["telephony", "sip", "call routing", "numbers", "ivr", "voice api", "calling"],
    promptGuidance:
      "Return platform builders embedding telephony, SIP, call routing, numbers, IVR, or AI calling into a broader product.",
    evidenceKeywords: ["telephony", "sip", "call routing", "ivr", "voice api", "calling", "phone system", "numbers"],
  },
];

const NEGATIVE_CLASSES = [
  {
    key: "carriers_isps",
    label: "Carriers / ISPs / network operators",
    keywords: [
      "telecommunications",
      "telecom",
      "wireless",
      "carrier",
      "mobile network",
      "internet service provider",
      "isp",
      "broadband",
      "fiber network",
      "network operator",
      "wholesale voice",
      "wholesale sms",
    ],
  },
  {
    key: "communications_vendors",
    label: "CPaaS / UCaaS / CCaaS / communications vendors",
    keywords: [
      "cpaas",
      "communications platform",
      "ucaas",
      "ccaas",
      "contact center software",
      "voip provider",
      "sip trunk provider",
      "sms gateway",
      "programmable messaging",
      "communications api",
    ],
  },
  {
    key: "generic_software",
    label: "Generic software / marketplace / broad ecommerce",
    keywords: [
      "marketplace",
      "graphic design",
      "design platform",
      "project management",
      "accounting software",
      "ecommerce marketplace",
      "shopping platform",
      "real estate marketplace",
      "broad ecommerce",
    ],
  },
  {
    key: "broad_finance_without_signal",
    label: "Broad finance / banking without explicit voice signal",
    keywords: ["bank", "banking", "wealth management", "retail banking"],
  },
];

module.exports = { ARCHETYPES, NEGATIVE_CLASSES };
