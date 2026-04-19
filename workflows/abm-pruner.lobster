name: abm-pruner
description: |
  ABM Pruner — Biweekly cleanup of ABM account targeting.
  Identifies and excludes accounts with low relevance or zero engagement.
  Safety gates: SF pipeline protection, 14-day learning period, auto-execute limit (≤10).
  Fully deterministic — no LLM steps.
  After DB write, pushes exclusions to live StackAdapt campaigns.

steps:
  - id: preview
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-pruner-agent.py --dry-run

  - id: approve
    command: echo "Review pruned accounts above. Approve to execute exclusions + push to StackAdapt."
    approval: required

  - id: execute
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-pruner-agent.py
    condition: $approve.approved

  - id: push-stackadapt
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm_push_to_stackadapt.py --pruner
    condition: $approve.approved
