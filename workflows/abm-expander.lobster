name: abm-expander
description: |
  ABM Expander — Grows undersized ABM segments with relevant companies.
  7-step pipeline: find undersized → AI research → Clearbit validate →
  SF cross-check → relevance score → cross-campaign dedup → execute.
  LLM used ONLY for AI research step. All other steps are deterministic.

steps:
  - id: preview
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-expander-agent.py --dry-run

  - id: approve
    command: echo "Review candidates above. Approve to execute additions."
    approval: required

  - id: execute
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-expander-agent.py
    condition: $approve.approved
