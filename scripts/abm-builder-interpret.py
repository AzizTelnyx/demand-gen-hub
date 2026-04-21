#!/usr/bin/env python3
"""
ABM Builder Step 1: Interpret
Converts a natural language research brief into structured search criteria.
Uses Gemini Flash (cheap, fast) via LiteLLM.

Input: --brief "Find AI agent companies in APAC"
Output: JSON criteria to stdout (consumed by next Lobster step)
"""

import argparse
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from abm_builder_lib import LITELLM_URL, LITELLM_KEY

MODEL = "gemini/gemini-2.0-flash"

SYSTEM_PROMPT = """You are an ABM research brief interpreter for Telnyx (cloud communications: Voice API, SIP, SMS, IoT SIM, AI voice agents).

Convert the user's brief into structured search criteria. Output ONLY valid JSON, no markdown.

JSON format:
{
  "listName": "Short name for this list",
  "description": "One line description",
  "regions": ["AMER", "EMEA", "APAC", "MENA"],
  "products": ["voice-ai", "sip-trunking", "sms-api", "contact-center", "iot", "programmable-voice"],
  "targetCompanyProfile": "Detailed description of ideal target — what they do, why they need Telnyx",
  "searchQueries": ["search query 1", "search query 2", "search query 3"],
  "estimatedTarget": 200,
  "minScore": 0.15
}

Rules:
- searchQueries: 3-5 specific web search queries that would find these companies (not generic). Include product terms, competitor names, industry keywords.
- regions: use AMER/EMEA/APAC/MENA
- products: must be from the valid list above
- targetCompanyProfile: be specific about what SIGNALS to look for (not "AI companies" but "companies building voice AI agents for customer service")
- If the brief is vague, make reasonable assumptions and note them in description"""

def interpret(brief: str) -> dict:
    prompt = f"Research brief: {brief}"
    payload = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 1500,
        "temperature": 0.2,
    }).encode("utf-8")

    req = urllib.request.Request(
        LITELLM_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LITELLM_KEY}",
        },
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"].strip()

        # Strip markdown fences if present
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        try:
            criteria = json.loads(content)
        except json.JSONDecodeError:
            # Try to find JSON in response
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                criteria = json.loads(content[start:end])
            else:
                print(json.dumps({"error": "Failed to parse criteria", "raw": content[:500]}))
                sys.exit(1)

        return criteria


def main():
    parser = argparse.ArgumentParser(description="ABM Builder: Interpret research brief")
    parser.add_argument("--brief", required=True, help="Natural language research brief")
    args = parser.parse_args()

    criteria = interpret(args.brief)
    print(json.dumps(criteria, indent=2))


if __name__ == "__main__":
    main()
