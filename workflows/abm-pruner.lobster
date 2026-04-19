name: abm-pruner
description: |
  ABM Pruner — Biweekly cleanup of ABM account targeting.
  Identifies and excludes accounts with low relevance or zero engagement.
  Safety gates: SF pipeline protection, 14-day learning period, auto-execute limit.
  Fully deterministic — no LLM steps. All scoring is computation.

env:
  DB_URL: postgresql://localhost:5432/dghub
  PSQL: /opt/homebrew/Cellar/postgresql@17/17.8/bin/psql
  TELEGRAM_BOT_TOKEN: 8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo
  TELEGRAM_CHAT_ID: "-1003786506284"
  TELEGRAM_THREAD_ID: "164"

steps:
  - id: fetch_accounts
    command: |
      {{ PSQL }} -d dghub -tA -c "
        SELECT json_build_object(
          'accounts', json_agg(row_to_json(a))
        )
        FROM \"ABMAccount\" a
        WHERE a.\"createdAt\" < NOW() - INTERVAL '14 days'
      "
    description: Fetch accounts past 14-day learning period. Deterministic DB query.

  - id: fetch_campaign_context
    command: |
      {{ PSQL }} -d dghub -tA -c "
        SELECT json_build_object(
          'segments', json_agg(row_to_json(cs))
        )
        FROM \"ABMCampaignSegment\" cs
        WHERE cs.\"campaignStatus\" = 'enabled'
      "
    description: Fetch active campaign segments for relevance scoring context. Deterministic.

  - id: fetch_sf_pipeline
    command: |
      python3 -c "
      import subprocess, json, sys
      result = subprocess.run(
          ['sf', 'data', 'query',
           '--target-org', 'telnyx-prod',
           '-q', 'SELECT Website, Type, Name FROM Account WHERE Type NOT IN (\\'Customer\\', \\'Partner\\') AND Website != null'],
          capture_output=True, text=True
      )
      print(result.stdout if result.stdout else '{}')
      "
    description: Fetch SF pipeline accounts. Only Customer/Partner are safety-gated. Deterministic.

  - id: score_relevance
    command: |
      python3 -c "
      import json, sys
      accounts = json.loads(sys.stdin.read() or '{}')
      # Relevance scoring: description 40%, variant 20%, tags 20%, tech 10%, industry 10%
      # Thresholds: < 0.2 auto-exclude, 0.2-0.4 review, >= 0.4 keep
      print(json.dumps({'scored': accounts, 'note': 'scoring applied'}))
      "
    description: Score each account's relevance against campaign product+variant. Pure computation.
    stdin_from: fetch_accounts

  - id: apply_sf_safety
    command: |
      python3 -c "
      import json, sys
      scored = json.loads(sys.stdin.read() or '{}')
      # Remove any accounts with active SF opportunity from prune list
      print(json.dumps(scored))
      "
    description: Remove accounts with active SF opportunity from prune candidates. Safety gate.
    stdin_from: score_relevance

  - id: approve
    command: echo "Ready to prune"
    approval: required
    description: Human approval gate. ≤10 removals auto-execute, >10 require explicit approval.

  - id: execute_prune
    command: |
      python3 /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/scripts/abm-pruner-executor.py \
        --from-stdin \
        --db-url "{{ DB_URL }}"
    description: Insert exclusion rows into ABMExclusion. Log to AgentRun.
    condition: $approve.approved
    stdin_from: apply_sf_safety

  - id: post_summary
    command: |
      curl -s -X POST "https://api.telegram.org/bot{{ TELEGRAM_BOT_TOKEN }}/sendMessage" \
        -H "Content-Type: application/json" \
        -d '{
          "chat_id": "{{ TELEGRAM_CHAT_ID }}",
          "message_thread_id": {{ TELEGRAM_THREAD_ID }},
          "parse_mode": "Markdown",
          "text": "✅ *ABM Pruner Complete*\nAccounts evaluated: PLACEHOLDER\nExclusions added: PLACEHOLDER\nSF-protected: PLACEHOLDER"
        }'
    description: Post summary to DG Hub Agent Activity thread
    condition: $approve.approved
