#!/bin/bash
# Daily DB backup — keeps 14 days
BACKUP_DIR="/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub/backups"
PSQL="/opt/homebrew/Cellar/postgresql@17/17.8/bin"
DATE=$(date +%Y-%m-%d_%H%M)

$PSQL/pg_dump -Fc dghub > "$BACKUP_DIR/dghub_$DATE.dump"

# Keep only last 14 days
find "$BACKUP_DIR" -name "dghub_*.dump" -mtime +14 -delete

echo "Backup complete: dghub_$DATE.dump ($(du -h "$BACKUP_DIR/dghub_$DATE.dump" | cut -f1))"

# Push to GitHub
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/backup-to-github.sh"
