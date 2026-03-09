"""
Shared knowledge base loader for all Python agents.
Single source of truth: reads from /api/context when hub is running,
falls back to direct disk reads from knowledge/ directory.

Usage:
    from lib.knowledge import load_knowledge

    # Load default context (strategy + brand + standards)
    context = load_knowledge()

    # Load specific sections
    context = load_knowledge(sections=["brand", "standards"])

    # Load specific files
    context = load_knowledge(files=["brand/brand-messaging-q1-2026.md", "standards/ad-copy-rules.md"])
"""

import json
import os
import urllib.request

KNOWLEDGE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "knowledge")
HUB_URL = os.environ.get("HUB_URL", "http://localhost:3000")

# Default files every agent should have access to
DEFAULT_FILES = [
    "telnyx-strategy.md",
    "brand/brand-messaging-q1-2026.md",
    "standards/ad-copy-rules.md",
    "standards/b2b-ad-copy-guide.md",
    "standards/b2b-ad-creative-guide.md",
    "product-groups.md",
]

# Section-specific file mappings
SECTION_FILES = {
    "brand": ["brand/brand-messaging-q1-2026.md"],
    "standards": [
        "standards/ad-copy-rules.md",
        "standards/b2b-ad-copy-guide.md",
        "standards/b2b-ad-creative-guide.md",
        "standards/google-ads-rsa-best-practices.md",
    ],
    "strategy": ["telnyx-strategy.md"],
    "messaging": [],  # populated dynamically from messaging-frameworks/
}


def _load_via_api(files=None, section=None):
    """Try loading knowledge from the hub API."""
    try:
        params = ""
        if files:
            params = f"?files={','.join(files)}"
        elif section:
            params = f"?section={section}"

        url = f"{HUB_URL}/api/context{params}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            return data.get("combined", "")
    except Exception:
        return None


def _load_from_disk(files):
    """Direct disk read fallback."""
    content = []
    for f in files:
        filepath = os.path.join(KNOWLEDGE_DIR, f)
        if os.path.exists(filepath):
            with open(filepath) as fh:
                content.append(fh.read())
    return "\n\n---\n\n".join(content)


def load_knowledge(sections=None, files=None):
    """
    Load knowledge base context.

    Priority: API > disk.
    Args:
        sections: list of section names (e.g. ["brand", "standards"])
        files: list of specific file paths relative to knowledge/
    Returns:
        Combined markdown string of all loaded knowledge.
    """
    # Determine which files to load
    if files:
        target_files = files
    elif sections:
        target_files = []
        for s in sections:
            if s in SECTION_FILES:
                target_files.extend(SECTION_FILES[s])
            else:
                # Try loading section dynamically via API
                result = _load_via_api(section=s)
                if result:
                    return result
        if not target_files:
            target_files = DEFAULT_FILES
    else:
        target_files = DEFAULT_FILES

    # Try API first
    result = _load_via_api(files=target_files)
    if result:
        return result

    # Fallback to disk
    return _load_from_disk(target_files)


def load_knowledge_for_agent(agent_type):
    """
    Load the right knowledge subset for a specific agent type.
    Keeps agents focused on what they need.
    """
    agent_files = {
        "ad_copy_review": [
            "telnyx-strategy.md",
            "brand/brand-messaging-q1-2026.md",
            "standards/ad-copy-rules.md",
            "standards/b2b-ad-copy-guide.md",
            "product-groups.md",
        ],
        "negative_keyword": [
            "telnyx-strategy.md",
            "brand/brand-messaging-q1-2026.md",
            "product-groups.md",
        ],
        "keyword_hygiene": [
            "telnyx-strategy.md",
            "brand/brand-messaging-q1-2026.md",
            "standards/ad-copy-rules.md",
        ],
        "creative": [
            "brand/brand-messaging-q1-2026.md",
            "standards/b2b-ad-creative-guide.md",
        ],
        "strategy": [
            "telnyx-strategy.md",
            "brand/brand-messaging-q1-2026.md",
        ],
        "budget": [
            "telnyx-strategy.md",
        ],
        "budget_pacing": [
            "telnyx-strategy.md",
            "product-groups.md",
        ],
        "google_ads_optimizer": [
            "telnyx-strategy.md",
            "product-groups.md",
            "brand/brand-messaging-q1-2026.md",
            "standards/google-ads-rsa-best-practices.md",
        ],
        "spend_report": [
            "telnyx-strategy.md",
            "product-groups.md",
        ],
        "budget_pacing_manager": [
            "telnyx-strategy.md",
            "product-groups.md",
        ],
        "google_search_manager": [
            "telnyx-strategy.md",
            "product-groups.md",
            "brand/brand-messaging-q1-2026.md",
            "standards/google-ads-rsa-best-practices.md",
            "standards/ad-copy-rules.md",
        ],
        "audience_targeting_optimizer": [
            "telnyx-strategy.md",
            "brand/brand-messaging-q1-2026.md",
            "product-groups.md",
        ],
        "creative_manager": [
            "brand/brand-messaging-q1-2026.md",
            "standards/b2b-ad-creative-guide.md",
            "standards/b2b-ad-copy-guide.md",
            "standards/ad-copy-rules.md",
        ],
        "domain_publisher_manager": [
            "telnyx-strategy.md",
            "product-groups.md",
        ],
        "device_geo_optimizer": [
            "telnyx-strategy.md",
            "product-groups.md",
        ],
        "frequency_reach_manager": [
            "telnyx-strategy.md",
            "product-groups.md",
        ],
    }

    files = agent_files.get(agent_type, DEFAULT_FILES)
    return load_knowledge(files=files)
