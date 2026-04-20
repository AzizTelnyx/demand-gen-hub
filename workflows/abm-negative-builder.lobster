name: abm-negative-builder
description: |
  ABM Negative Builder — Monthly scan for irrelevant domains across ABM audiences.
  Auto-excludes domains with relevance < 0.2, flags 0.2-0.4 for review.
  Safety: never prunes SF pipeline accounts or accounts added < 14 days ago.
  After DB write, pushes exclusions to StackAdapt.

steps:
  - id: preview
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-negative-builder-agent.py --dry-run

  - id: approve
    command: echo "Review flagged domains. Approve to execute exclusions + push to StackAdapt."
    approval: required

  - id: execute
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-negative-builder-agent.py
    condition: $approve.approved

  - id: push-stackadapt
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm_exclusion_push.py --all
    condition: $approve.approved
