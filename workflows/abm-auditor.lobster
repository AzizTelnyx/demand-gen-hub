name: abm-auditor
description: |
  ABM Auditor — Weekly health scorecard for ABM campaign segments.
  Fully deterministic. Reports segment health, waste detection, and undersized alerts.
  Posts summary to Telegram Agent Activity topic.

steps:
  - id: run
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /Users/azizalsinafi/.venv/bin/python3 scripts/abm-auditor-agent.py
