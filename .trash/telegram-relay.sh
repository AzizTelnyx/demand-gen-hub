#!/bin/bash
# Quick test: relay a message to the hub orchestrator
# Usage: ./telegram-relay.sh "how many active campaigns?"

MESSAGE="$1"
if [ -z "$MESSAGE" ]; then
  echo "Usage: $0 \"message\""
  exit 1
fi

curl -s -X POST http://127.0.0.1:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d "{\"message\": $(echo "$MESSAGE" | jq -Rs .)}" | jq -r '.result.answer // .result.summary // .error // "No response"'
