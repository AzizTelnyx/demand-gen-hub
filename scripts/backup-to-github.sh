#!/bin/bash
# Push latest DB backup to GitHub
BACKUP_DIR="/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/backups"
PSQL="/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"
cd "$BACKUP_DIR"

# Find latest backup
LATEST=$(ls -t dghub_*.dump 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  echo "No backup files found"
  exit 1
fi

# Also export guardrails and agent configs as readable JSON
$PSQL -d dghub -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM \"AgentGuardrail\") t" -t > guardrails.json 2>/dev/null
$PSQL -d dghub -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM \"Agent\") t" -t > agents.json 2>/dev/null
$PSQL -d dghub -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM \"RegionalPriority\") t" -t > regional-priorities.json 2>/dev/null

# Git add, commit, push
git add -A
git commit -m "backup: $(date '+%Y-%m-%d %H:%M') - $LATEST" --allow-empty
git push origin main 2>&1 || git push origin master 2>&1

echo "Pushed $LATEST to GitHub"
