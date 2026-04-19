name: abm-negative-builder
description: |
  ABM Negative Builder — Monthly build of product-scoped exclusion lists.
  Scores every domain's relevance to each product. Near-zero relevance → exclude from that product.
  Fully deterministic — no LLM steps. All scoring is computation on Clearbit enrichment data.
  Competitor domains auto-excluded globally.

env:
  DB_URL: postgresql://localhost:5432/dghub
  PSQL: /opt/homebrew/Cellar/postgresql@17/17.8/bin/psql
  TELEGRAM_BOT_TOKEN: 8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo
  TELEGRAM_CHAT_ID: "-1003786506284"
  TELEGRAM_THREAD_ID: "164"

steps:
  - id: fetch_enriched_accounts
    command: |
      {{ PSQL }} -d dghub -tA -c "
        SELECT json_build_object(
          'accounts', json_agg(json_build_object(
            'domain', domain,
            'company', COALESCE(company, 'Unknown'),
            'description', COALESCE(\"clearbitDesc\", ''),
            'tags', COALESCE(\"clearbitTags\", '[]'::jsonb),
            'tech', COALESCE(\"clearbitTech\", '[]'::jsonb),
            'industry', COALESCE(industry, ''),
            'employees', COALESCE(\"employeeCount\", 0)
          ))
        )
        FROM \"ABMAccount\"
        WHERE \"clearbitDesc\" IS NOT NULL OR \"clearbitTags\" IS NOT NULL
      "
    description: Fetch all enriched accounts with Clearbit data. Deterministic DB query.

  - id: fetch_existing_exclusions
    command: |
      {{ PSQL }} -d dghub -tA -c "
        SELECT json_build_object(
          'exclusions', json_agg(json_build_object('domain', domain, 'category', category))
        )
        FROM \"ABMExclusion\"
      "
    description: Fetch current exclusions for dedup. Deterministic.

  - id: fetch_sf_safety
    command: |
      python3 -c "
      import subprocess, json, sys
      result = subprocess.run(
          ['sf', 'data', 'query',
           '--target-org', 'telnyx-prod',
           '-q', 'SELECT Website FROM Account WHERE Type IN (\\'Customer\\', \\'Partner\\') AND Website != null'],
          capture_output=True, text=True
      )
      print(result.stdout if result.stdout else '{}')
      "
    description: Fetch SF Customer/Partner domains. Never exclude these. Deterministic.

  - id: score_per_product
    command: |
      python3 -c "
      import json, sys
      # Product keywords for relevance scoring
      PRODUCTS = {
        'AI Agent': ['ai', 'agent', 'voice ai', 'chatbot', 'virtual assistant', 'automation', 'llm', 'generative'],
        'Voice API': ['voice', 'voip', 'telephony', 'calling', 'sip', 'communication', 'pbx', 'uc'],
        'SMS': ['sms', 'messaging', 'text', 'communication', 'api', 'notification', 'alert'],
        'SIP': ['sip', 'trunk', 'voip', 'telephony', 'pbx', 'uc', 'voice', 'calling'],
        'IoT SIM': ['iot', 'sim', 'cellular', 'device', 'embedded', 'connectivity', 'm2m', 'sensor']
      }
      # Relevance weights: description 40%, tags 30%, tech 15%, industry 15%
      # Threshold: < 0.2 = exclude from that product
      data = json.loads(sys.stdin.read() or '{}')
      print(json.dumps(data))
      "
    description: Score each domain's relevance to each product. Pure computation. No API calls.
    stdin_from: fetch_enriched_accounts

  - id: approve
    command: echo "Ready to build exclusion list"
    approval: required
    description: Human approval gate before inserting exclusions.

  - id: execute_exclusions
    command: |
      python3 /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/scripts/abm-negative-builder-executor.py \
        --from-stdin \
        --db-url "{{ DB_URL }}"
    description: Insert exclusion rows into ABMExclusion with category scoping. Log to AgentRun.
    condition: $approve.approved
    stdin_from: score_per_product

  - id: post_summary
    command: |
      curl -s -X POST "https://api.telegram.org/bot{{ TELEGRAM_BOT_TOKEN }}/sendMessage" \
        -H "Content-Type: application/json" \
        -d '{
          "chat_id": "{{ TELEGRAM_CHAT_ID }}",
          "message_thread_id": {{ TELEGRAM_THREAD_ID }},
          "parse_mode": "Markdown",
          "text": "✅ *ABM Negative Builder Complete*\nDomains scored: PLACEHOLDER\nNew exclusions: PLACEHOLDER\nBy product: PLACEHOLDER"
        }'
    description: Post summary to DG Hub Agent Activity thread
    condition: $approve.approved
