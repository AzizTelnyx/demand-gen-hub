"""
Competitor & domain blocklists for DG Hub agents.
Auto-exclude from ABM lists, audience targeting, and domain reports.
"""

COMPETITOR_DOMAINS = [
    "twilio.com", "vonage.com", "bandwidth.com", "plivo.com", "five9.com",
    "genesys.com", "vapi.ai", "elevenlabs.io", "retellai.com", "synthflow.ai",
    "openai.com", "livekit.io", "sinch.com", "messagebird.com", "bird.com",
]

TECH_GIANT_DOMAINS = [
    "google.com", "amazon.com", "aws.amazon.com", "microsoft.com", "meta.com",
    "facebook.com", "apple.com", "cisco.com",
]

EMAIL_PROVIDER_DOMAINS = [
    "hotmail.com", "gmail.com", "yahoo.com", "outlook.com", "aol.com",
]

BROAD_IRRELEVANT = [
    "linkedin.com",
]

# Company name → domain mapping for fuzzy matching
_COMPANY_NAME_MAP = {
    "twilio": "twilio.com",
    "vonage": "vonage.com",
    "bandwidth": "bandwidth.com",
    "plivo": "plivo.com",
    "five9": "five9.com",
    "genesys": "genesys.com",
    "vapi": "vapi.ai",
    "elevenlabs": "elevenlabs.io",
    "eleven labs": "elevenlabs.io",
    "retell": "retellai.com",
    "retell ai": "retellai.com",
    "synthflow": "synthflow.ai",
    "openai": "openai.com",
    "open ai": "openai.com",
    "livekit": "livekit.io",
    "sinch": "sinch.com",
    "messagebird": "messagebird.com",
    "bird": "bird.com",
    "google": "google.com",
    "amazon": "amazon.com",
    "aws": "aws.amazon.com",
    "microsoft": "microsoft.com",
    "meta": "meta.com",
    "facebook": "facebook.com",
    "apple": "apple.com",
    "cisco": "cisco.com",
}

_ALL_BLOCKED = COMPETITOR_DOMAINS + TECH_GIANT_DOMAINS + EMAIL_PROVIDER_DOMAINS + BROAD_IRRELEVANT

_CATEGORY_MAP = {}
for d in COMPETITOR_DOMAINS:
    _CATEGORY_MAP[d] = "competitor"
for d in TECH_GIANT_DOMAINS:
    _CATEGORY_MAP[d] = "tech_giant"
for d in EMAIL_PROVIDER_DOMAINS:
    _CATEGORY_MAP[d] = "email_provider"
for d in BROAD_IRRELEVANT:
    _CATEGORY_MAP[d] = "irrelevant"


def is_blocked_domain(domain: str) -> tuple[bool, str]:
    """Returns (blocked, reason) for a domain."""
    domain = domain.lower().strip()
    # Check exact match and subdomain match
    for blocked in _ALL_BLOCKED:
        if domain == blocked or domain.endswith("." + blocked):
            return True, _CATEGORY_MAP.get(blocked, "blocked")
    return False, ""


def is_blocked_company(company_name: str) -> tuple[bool, str]:
    """Fuzzy match company names against blocklists."""
    name_lower = company_name.lower().strip()
    # Direct match
    if name_lower in _COMPANY_NAME_MAP:
        domain = _COMPANY_NAME_MAP[name_lower]
        return True, _CATEGORY_MAP.get(domain, "blocked")
    # Substring match (e.g. "Twilio Inc" contains "twilio")
    for company, domain in _COMPANY_NAME_MAP.items():
        if company in name_lower or name_lower in company:
            return True, _CATEGORY_MAP.get(domain, "blocked")
    return False, ""


def get_all_blocked() -> dict:
    """Return full blocklist organized by category."""
    return {
        "competitor": COMPETITOR_DOMAINS,
        "tech_giant": TECH_GIANT_DOMAINS,
        "email_provider": EMAIL_PROVIDER_DOMAINS,
        "irrelevant": BROAD_IRRELEVANT,
    }
