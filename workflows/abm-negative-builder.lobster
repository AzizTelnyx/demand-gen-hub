name: abm-negative-builder
description: |
  ABM Negative Builder — Monthly build of product-scoped exclusion lists.
  Scores every domain's relevance to each product. Near-zero relevance → exclude.
  Fully deterministic — no LLM steps. Competitor domains auto-excluded globally.

steps:
  - id: preview
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-negative-builder-agent.py --dry-run

  - id: approve
    command: echo "Review exclusion candidates above. Approve to execute."
    approval: required

  - id: execute
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-negative-builder-agent.py
    condition: $approve.approved
