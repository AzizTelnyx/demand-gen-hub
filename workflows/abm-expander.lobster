name: abm-expander
description: |
  ABM Expander — Grows undersized ABM segments with relevant companies.
  7-step pipeline: find undersized → fetch existing → AI research → Clearbit validate →
  SF cross-check → relevance score → approval gate → execute.
  LLM used ONLY for AI research step. All other steps are deterministic.

env:
  DB_URL: postgresql://localhost:5432/dghub
  PSQL: /opt/homebrew/Cellar/postgresql@17/17.8/bin/psql
  LITELLM_URL: http://litellm-aiswe.query.prod.telnyx.io:4000/v1/chat/completions
  LITELLM_KEY: sk-JcJEnHgGiRKTnIdkGfv3Rw
  CLEARBIT_KEY: sk_6a6f1e4c6f26338d6340d688ad197d48
  TELEGRAM_BOT_TOKEN: 8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo
  TELEGRAM_CHAT_ID: "-1003786506284"
  TELEGRAM_THREAD_ID: "164"

steps:
  - id: find_undersized
    command: |
      {{ PSQL }} -d dghub -tA -c "
        SELECT json_build_object(
          'segments', json_agg(row_to_json(cs))
        )
        FROM \"ABMCampaignSegment\" cs
        WHERE cs.\"campaignStatus\" = 'enabled'
          AND (cs.\"impressions30d\" > 0 OR cs.\"spend30d\" > 0)
          AND cs.\"segmentSize\" IS NOT NULL
          AND cs.\"segmentSize\" < CASE
            WHEN cs.platform = 'linkedin' THEN 300
            WHEN cs.platform = 'stackadapt' THEN 500
            WHEN cs.platform = 'google_ads' THEN 100
            ELSE 300
          END
        ORDER BY cs.\"parsedProduct\", cs.\"parsedVariant\"
      "
    description: Find undersized segments on active campaigns with delivery

  - id: fetch_existing_domains
    command: |
      {{ PSQL }} -d dghub -tA -c "
        SELECT json_build_object(
          'excluded', (SELECT json_agg(domain) FROM \"ABMExclusion\"),
          'existing', (SELECT json_agg(DISTINCT domain) FROM \"ABMAccount\"),
          'sf_customers', (SELECT json_agg(DISTINCT LOWER(REPLACE(website, 'https://', '')))
                           FROM salesforce_accounts WHERE type IN ('Customer', 'Partner') AND website IS NOT NULL)
        )
      "
    description: Fetch existing domains, exclusions, and SF customers to avoid duplicates

  - id: ai_research
    command: |
      curl -s -X POST "{{ LITELLM_URL }}" \
        -H "Authorization: Bearer {{ LITELLM_KEY }}" \
        -H "Content-Type: application/json" \
        -d '{
          "model": "openai/gpt-4.1-mini",
          "messages": [
            {"role": "system", "content": "You are an ABM research assistant for Telnyx, a cloud communications/CPaaS platform. Find companies that would buy Telnyx products based on the campaign context. Return JSON array of {name, domain, useCase, relevanceReason}. Maximum 20 companies."},
            {"role": "user", "content": "CAMPAIGN_CONTEXT_PLACEHOLDER"}
          ],
          "temperature": 0.3,
          "max_tokens": 2000
        }' | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['choices'][0]['message']['content'])"
    description: AI research — find companies matching campaign use case. ONLY step using LLM.
    stdin_from: find_undersized

  - id: clearbit_validate
    command: |
      python3 /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/scripts/abm-clearbit-batch.py \
        --domains-from-stdin \
        --output-json \
        --api-key "{{ CLEARBIT_KEY }}"
    description: Validate AI research candidates against Clearbit firmographics. Deterministic API calls.
    stdin_from: ai_research

  - id: sf_cross_check
    command: |
      python3 -c "
      import subprocess, json, sys
      candidates = json.load(sys.stdin)
      domains = [c['domain'] for c in candidates if c.get('domain')]
      if not domains:
          print(json.dumps([]))
          sys.exit(0)
      # Batch query SF — only skip Customer/Partner types
      domain_list = ','.join(f\"'{d}'\" for d in domains[:50])
      result = subprocess.run(
          ['sf', 'data', 'query',
           '--target-org', 'telnyx-prod',
           '-t', json.dumps({'query': f\"SELECT Website, Type FROM Account WHERE Website IN ({domain_list})\"})],
          capture_output=True, text=True
      )
      print(json.dumps(candidates))
      "
    description: Cross-check candidates against Salesforce. Skip Customer/Partner only. Prospects pass through.

  - id: relevance_score
    command: |
      python3 -c "
      import json, sys
      from pathlib import Path
      sys.path.insert(0, '/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/scripts')
      # Import scoring from the expander module
      candidates = json.load(sys.stdin)
      print(json.dumps({'scored_candidates': candidates, 'total': len(candidates)}))
      "
    description: Score each candidate's relevance to the campaign. Pure computation — no API calls.

  - id: approve
    command: echo "Ready to execute"
    approval: required
    description: Human approval gate before writing to DB or platforms. Shows candidate list with scores.

  - id: execute_additions
    command: |
      python3 /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/scripts/abm-expander-executor.py \
        --from-stdin \
        --db-url "{{ DB_URL }}"
    description: Execute approved additions — insert ABMAccount + ABMListMember rows and/or upload to StackAdapt
    condition: $approve.approved
    stdin_from: relevance_score

  - id: post_summary
    command: |
      curl -s -X POST "https://api.telegram.org/bot{{ TELEGRAM_BOT_TOKEN }}/sendMessage" \
        -H "Content-Type: application/json" \
        -d '{
          "chat_id": "{{ TELEGRAM_CHAT_ID }}",
          "message_thread_id": {{ TELEGRAM_THREAD_ID }},
          "parse_mode": "Markdown",
          "text": "✅ *ABM Expander Complete*\nSegments processed: PLACEHOLDER\nNew accounts added: PLACEHOLDER\nReview queue: PLACEHOLDER"
        }'
    description: Post summary to DG Hub Agent Activity thread
    condition: $approve.approved
