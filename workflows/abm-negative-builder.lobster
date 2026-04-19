name: abm-negative-builder
description: |
  ABM Negative Builder — Monthly build of product-scoped exclusion lists.
  Scores every domain's relevance to each product. Near-zero relevance → exclude.
  Fully deterministic — no LLM steps. Competitor domains auto-excluded globally.
  After DB write, creates/updates exclusion audiences in StackAdapt and attaches to campaigns.

steps:
  - id: preview
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-negative-builder-agent.py --dry-run

  - id: approve
    command: echo "Review exclusion candidates above. Approve to execute + push to StackAdapt."
    approval: required

  - id: execute
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-negative-builder-agent.py
    condition: $approve.approved

  - id: push-stackadapt
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm_push_to_stackadapt.py --negative-builder
    condition: $approve.approved
