name: abm-expander
description: |
  ABM Expander — AI-powered discovery of new qualified accounts.
  Researches companies matching Telnyx ICP, scores relevance, and adds to ABM audiences.
  Pushes new domains to StackAdapt targeting audiences after approval.

steps:
  - id: preview
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-expander-agent.py --dry-run

  - id: approve
    command: echo "Review newly discovered accounts. Approve to add to audiences + push to StackAdapt."
    approval: required

  - id: execute
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-expander-agent.py
    condition: $approve.approved

  - id: push-stackadapt
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm_push_to_stackadapt.py --expander
    condition: $approve.approved
