# DG Hub Deployment Checklist

**MUST follow every time you change the Prisma schema or restart the hub.**

## Before Making Schema Changes

1. **Back up the DB first:**
   ```bash
   pg_dump -Fc postgresql://localhost:5432/dghub > backups/dghub-$(date +%Y-%m-%d-%H%M).dump
   ```

2. **Run drift check:**
   ```bash
   ./scripts/schema-check.sh
   ```
   If drift detected → you MUST sync before restarting.

## After Editing `prisma/schema.prisma`

**Every schema change requires these steps in order:**

```bash
# 1. Back up
pg_dump -Fc postgresql://localhost:5432/dghub > backups/dghub-$(date +%Y-%m-%d-%H%M).dump

# 2. Check for required fields with existing data
#    If adding a required (non-nullable) field to a table with rows,
#    add @default() to the field first, then push.

# 3. Sync DB with schema
npx prisma db push --accept-data-loss

# 4. Regenerate Prisma client (auto-runs with db push)
# npx prisma generate

# 5. Rebuild Next.js
npm run build

# 6. Restart hub
pm2 restart dg-hub

# 7. Verify all APIs
curl -s http://localhost:3000/api/dashboard | head -c 100
curl -s http://localhost:3000/api/budget | head -c 100
curl -s http://localhost:3000/api/abm | head -c 100
curl -s http://localhost:3000/api/agents/status | head -c 100
curl -s http://localhost:3000/api/health | head -c 100
# All should return JSON starting with { — NOT HTML

# 8. Verify ngrok
curl -s https://telnyx-dg-hub.ngrok.app/api/health | head -c 100

# 9. Git commit
git add -A && git commit -m "schema: description of change"
```

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Column in schema but not in DB | `Prisma Error P2022: column does not exist` | `npx prisma db push` |
| Required field added to table with rows | `cannot add required column without default` | Add `@default()` to field in schema |
| FK default doesn't exist in parent | `violates foreign key constraint` | Update FK column to match existing parent row |
| Unique constraint on data with dupes | `Unique constraint failed` | Make field non-unique or dedupe first |
| HTML returned instead of JSON | API route crashed, Next.js serves error page | Check pm2 logs, fix schema mismatch |
| `prisma db push` drops a column you need | Data loss | **Always back up first** |

## Schema Check Script

`scripts/schema-check.sh` compares Prisma schema against DB columns and exits 1 if drift is detected.

Add to cron or run manually before restarts:
```bash
# Quick check
./scripts/schema-check.sh

# If drift found
pg_dump -Fc postgresql://localhost:5432/dghub > backups/pre-push.dump
npx prisma db push --accept-data-loss
npm run build && pm2 restart dg-hub
```

## Backup Retention

- Daily automated backups exist in `backups/` (pg_dump cron)
- Manual pre-change backups are in addition to automated ones
- Keep at least 7 days of automated backups
- Pre-change backups are named `dghub-YYYY-MM-DD-HHMM.dump`

## Recovery

If something goes wrong after a push:
```bash
# Stop the hub
pm2 stop dg-hub

# Restore from backup
pg_restore --clean --dbname=dghub backups/dghub-YYYY-MM-DD-HHMM.dump

# Rebuild and restart
npm run build && pm2 restart dg-hub
```
