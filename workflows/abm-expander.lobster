name: abm-expander
description: |
  ABM Expander — Deal-informed expansion of ABM segments.
  Reads closed-won deal patterns from SF → AI research for lookalikes →
  Clearbit validate → SF cross-check → relevance score → add to audiences.
  After DB write, pushes new domains to live StackAdapt audiences.

steps:
  - id: preview
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-expander-agent.py --dry-run

  - id: approve
    command: echo "Review candidate additions above. Approve to execute + push to StackAdapt."
    approval: required

  - id: execute
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-expander-agent.py
    condition: $approve.approved

  - id: push-stackadapt
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm_push_to_stackadapt.py --expander
    condition: $approve.approved
