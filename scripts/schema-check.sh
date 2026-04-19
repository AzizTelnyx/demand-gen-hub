#!/usr/bin/env bash
# schema-check.sh — Pre-flight check for Prisma/DB drift
# Run BEFORE any hub restart or after schema changes
# Exit 1 = drift detected → run `npx prisma db push` first

set -euo pipefail
cd "$(dirname "$0")/.."

DB_URL="postgresql://localhost:5432/dghub"
PSQL="/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"
SCHEMA_FILE="prisma/schema.prisma"

echo "🔍 Checking Prisma ↔ DB schema drift..."

# Use prisma validate first
npx prisma validate --schema="$SCHEMA_FILE" > /dev/null 2>&1 || {
  echo "❌ Prisma schema validation failed"
  exit 1
}

# Check drift with prisma migrate diff
DRIFT=$(npx prisma migrate diff \
  --from-schema-datasource="$SCHEMA_FILE" \
  --to-schema-datamodel="$SCHEMA_FILE" \
  --script 2>/dev/null || true)

# Better: use prisma db push --dry-run equivalent
# Actually just check if db pull matches schema
TEMP_SCHEMA=$(mktemp)
npx prisma db pull --print 2>/dev/null > "$TEMP_SCHEMA" 2>/dev/null || true

# Compare column counts
PRISMA_COLS=$(grep -cE '^\s+\w+\s+\w+' "$SCHEMA_FILE" 2>/dev/null || echo "0")
DB_COLS=$($PSQL "$DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ' || echo "0")

echo "  Prisma schema fields: ~$PRISMA_COLS"
echo "  DB columns: $DB_COLS"

# Check for columns in Prisma but NOT in DB
MISMATCH=0
python3 -c "
import re, subprocess, sys

# Parse Prisma schema
with open('$SCHEMA_FILE') as f:
    content = f.read()

current_model = None
prisma_cols = {}
for line in content.split('\n'):
    m = re.match(r'^model (\w+)', line)
    if m:
        current_model = m.group(1)
        prisma_cols[current_model] = []
        continue
    if current_model and line.strip() == '}':
        current_model = None
        continue
    if current_model:
        fm = re.match(r'\s+(\w+)\s+\w+', line)
        if fm and fm.group(1)[0].islower():
            # Skip relation fields (uppercase type or array)
            if not re.match(r'\s+\w+\s+\[\]', line) and not re.match(r'\s+\w+\s+[A-Z]', line):
                prisma_cols[current_model].append(fm.group(1))

# Get DB columns
result = subprocess.run(['$PSQL', '$DB_URL', '-t', '-c',
    'SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = \'public\' ORDER BY table_name, column_name;'],
    capture_output=True, text=True)
db_cols = {}
for line in result.stdout.strip().split('\n'):
    if '|' in line:
        parts = [p.strip() for p in line.split('|')]
        if len(parts) >= 2 and parts[0] and parts[1]:
            tbl = parts[0]
            col = parts[1]
            db_cols.setdefault(tbl, set()).add(col)

# Find mismatches
missing_in_db = []
for model, cols in prisma_cols.items():
    db_table = model
    if db_table in db_cols:
        for col in cols:
            db_col = re.sub(r'(?<!^)(?=[A-Z])', '_', col).lower()
            if db_col not in db_cols[db_table] and col not in db_cols[db_table]:
                missing_in_db.append(f'{model}.{col}')

if missing_in_db:
    print(f'❌ DRIFT DETECTED: {len(missing_in_db)} columns in Prisma schema missing from DB:')
    for m in missing_in_db[:20]:
        print(f'  - {m}')
    if len(missing_in_db) > 20:
        print(f'  ... and {len(missing_in_db) - 20} more')
    sys.exit(1)
else:
    print('✅ No drift detected — Prisma schema matches DB')
    sys.exit(0)
" && echo "✅ All clear" || MISMATCH=1

rm -f "$TEMP_SCHEMA"

if [ "$MISMATCH" = "1" ]; then
  echo ""
  echo "🚨 FIX REQUIRED: Run these commands before restarting the hub:"
  echo "  cd $(pwd)"
  echo "  npx prisma db push --accept-data-loss"
  echo "  npm run build"
  echo "  pm2 restart dg-hub"
  exit 1
fi

exit 0
