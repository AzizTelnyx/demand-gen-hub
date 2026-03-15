#!/usr/bin/env bash
# Hub Doctor — system health check (no LLM needed)
# Checks: Hub API, PostgreSQL, PM2, disk, stuck agent runs
# Cron: daily at 6 AM PST
# Reports to Telegram thread 951 (Hub Health)

set -euo pipefail

BOT_TOKEN=$(cat ~/.config/telegram/bot-token 2>/dev/null || echo "")
CHAT_ID="-1003786506284"
THREAD_ID="951"
PSQL="/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"
DB="dghub"

issues=()
checks=()

# --- Hub API ---
hub_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 5 2>/dev/null || echo "000")
if [[ "$hub_status" == "200" || "$hub_status" == "307" ]]; then
  checks+=("✅ Hub API: HTTP $hub_status")
else
  checks+=("❌ Hub API: HTTP $hub_status")
  issues+=("Hub API returned $hub_status")
fi

# --- Gateway ---
gw_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:18789/ --max-time 5 2>/dev/null || echo "000")
if [[ "$gw_status" == "200" ]]; then
  checks+=("✅ Gateway: HTTP $gw_status")
else
  checks+=("❌ Gateway: HTTP $gw_status")
  issues+=("Gateway returned $gw_status")
fi

# --- PostgreSQL ---
db_check=$($PSQL -d "$DB" -tAc "SELECT count(*) FROM \"Campaign\"" 2>/dev/null || echo "ERROR")
if [[ "$db_check" != "ERROR" ]]; then
  checks+=("✅ PostgreSQL: $db_check campaigns")
else
  checks+=("❌ PostgreSQL: connection failed")
  issues+=("PostgreSQL connection failed")
fi

# --- PM2 ---
pm2_errors=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
errors = [p['name'] for p in procs if p.get('pm2_env', {}).get('status') != 'online']
restarts = [(p['name'], p.get('pm2_env', {}).get('restart_time', 0)) for p in procs if p.get('pm2_env', {}).get('restart_time', 0) > 10]
if errors:
    print('ERRORED:' + ','.join(errors))
if restarts:
    print('RESTARTS:' + ','.join(f'{n}({r})' for n,r in restarts))
if not errors and not restarts:
    print('OK:' + str(len(procs)))
" 2>/dev/null || echo "CHECK_FAILED")

if [[ "$pm2_errors" == OK:* ]]; then
  count="${pm2_errors#OK:}"
  checks+=("✅ PM2: $count processes, all online")
elif [[ "$pm2_errors" == ERRORED:* ]]; then
  names="${pm2_errors#ERRORED:}"
  checks+=("❌ PM2: errored processes: $names")
  issues+=("PM2 errored: $names")
elif [[ "$pm2_errors" == RESTARTS:* ]]; then
  names="${pm2_errors#RESTARTS:}"
  checks+=("⚠️ PM2: high restarts: $names")
  issues+=("PM2 high restarts: $names")
else
  checks+=("❌ PM2: check failed")
  issues+=("PM2 check failed")
fi

# --- Disk ---
disk_pct=$(df -h / | awk 'NR==2 {gsub(/%/,""); print $5}')
if (( disk_pct < 80 )); then
  checks+=("✅ Disk: ${disk_pct}% used")
elif (( disk_pct < 90 )); then
  checks+=("⚠️ Disk: ${disk_pct}% used")
  issues+=("Disk at ${disk_pct}%")
else
  checks+=("❌ Disk: ${disk_pct}% used — critical")
  issues+=("Disk at ${disk_pct}% — critical")
fi

# --- Stuck Agent Runs ---
stuck=$($PSQL -d "$DB" -tAc "
  SELECT count(*) FROM \"AgentRun\"
  WHERE status = 'running'
  AND \"startedAt\" < NOW() - INTERVAL '2 hours'
" 2>/dev/null || echo "0")
if [[ "$stuck" == "0" ]]; then
  checks+=("✅ Agent runs: no stuck jobs")
else
  checks+=("❌ Agent runs: $stuck stuck >2h")
  issues+=("$stuck agent runs stuck >2 hours")
fi

# --- Build report ---
now=$(date "+%b %-d, %-I:%M %p")
report="<b>🏥 Hub Doctor</b> — $now\n"
for c in "${checks[@]}"; do
  report+="$c\n"
done

if [[ ${#issues[@]} -gt 0 ]]; then
  report+="\n<b>⚠️ Issues (${#issues[@]}):</b>\n"
  for i in "${issues[@]}"; do
    report+="• $i\n"
  done
fi

# --- Send to Telegram ---
if [[ -n "$BOT_TOKEN" ]]; then
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d chat_id="$CHAT_ID" \
    -d message_thread_id="$THREAD_ID" \
    -d parse_mode="HTML" \
    -d text="$report" > /dev/null 2>&1
  echo "Report sent to Telegram"
else
  echo "No bot token found, printing report:"
  echo -e "$report"
fi

# Exit with error if issues found (for cron alerting)
if [[ ${#issues[@]} -gt 0 ]]; then
  exit 1
fi
