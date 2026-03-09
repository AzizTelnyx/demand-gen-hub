#!/usr/bin/env python3
"""Hub Doctor — Daily health monitor for DG Hub.

Usage:
    python3 scripts/hub-doctor.py          # human-readable output
    python3 scripts/hub-doctor.py --json   # structured JSON
    python3 scripts/hub-doctor.py --notify # JSON + Telegram notification
"""

import json, os, subprocess, sys, time, uuid, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────
PSQL = "/opt/homebrew/Cellar/postgresql@17/17.8/bin/psql"
DB_URL = "postgresql://localhost:5432/dghub"
DB_NAME = "dghub"
HUB_URL = "http://localhost:3000"
PROJECT_DIR = Path("/Users/azizalsinafi/.openclaw/workspace/demand-gen-hub")
BACKUP_DIR = PROJECT_DIR / "backups"
GATEWAY_TOKEN_FILE = Path("/Users/azizalsinafi/.openclaw/workspace/.gateway-token")
GATEWAY_URL = "http://127.0.0.1:18789"
TG_BOT_TOKEN = "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo"
TG_CHAT_ID = "-1003786506284"
TG_THREAD_ID = 164

KEY_TABLES = ["Campaign", "AdImpression", "AgentRun", "Recommendation", "CampaignChange"]
API_ENDPOINTS = ["/api/campaigns", "/api/budget", "/api/agents"]
SYNC_STALE_HOURS = 12
AGENT_SUCCESS_THRESHOLD = 0.9
API_SLOW_THRESHOLD = 5.0
BACKUP_MAX_AGE_HOURS = 24

# ── Helpers ─────────────────────────────────────────────────────────────
def run(cmd, timeout=15):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip(), r.stderr.strip(), r.returncode
    except subprocess.TimeoutExpired:
        return "", "timeout", -1

def psql(query):
    try:
        r = subprocess.run([PSQL, "-d", DB_NAME, "-t", "-A", "-c", query],
                           capture_output=True, text=True, timeout=15)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None

def http_get(url, headers=None, timeout=10):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode()
            return resp.status, body, time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, "", 0
    except Exception as e:
        return 0, str(e), 0

now = datetime.now(timezone.utc)

# ── Checks ──────────────────────────────────────────────────────────────
def check_pm2():
    out, err, rc = run("pm2 jlist")
    if rc != 0:
        return {"name": "pm2", "status": "critical", "details": f"pm2 jlist failed: {err}"}
    try:
        procs = json.loads(out)
    except json.JSONDecodeError:
        return {"name": "pm2", "status": "critical", "details": "Failed to parse pm2 output"}
    
    dg = next((p for p in procs if p.get("name") == "dg-hub"), None)
    if not dg:
        return {"name": "pm2", "status": "critical", "details": "dg-hub process not found"}
    
    env = dg.get("pm2_env", {})
    status = env.get("status", "unknown")
    restarts = env.get("restart_time", 0)
    uptime_ms = env.get("pm_uptime", 0)
    uptime_h = round((time.time() * 1000 - uptime_ms) / 3600000, 1) if uptime_ms else 0
    
    issues = []
    if status != "online":
        issues.append(f"status={status}")
    if restarts > 10:
        issues.append(f"restarts={restarts}")
    
    s = "critical" if status != "online" else ("warning" if restarts > 10 else "ok")
    return {"name": "pm2", "status": s,
            "details": f"status={status}, uptime={uptime_h}h, restarts={restarts}",
            "issues": issues}

def check_crons():
    token_path = GATEWAY_TOKEN_FILE
    if not token_path.exists():
        return {"name": "crons", "status": "warning", "details": "No gateway token file", "issues": ["no token"]}
    
    token = token_path.read_text().strip()
    code, body, _ = http_get(f"{GATEWAY_URL}/api/cron/jobs",
                             headers={"Authorization": f"Bearer {token}"})
    if code != 200:
        return {"name": "crons", "status": "warning", "details": f"Cron API returned {code}", "issues": [f"http {code}"]}
    
    try:
        data = json.loads(body)
        jobs = data if isinstance(data, list) else data.get("jobs", data.get("data", []))
    except json.JSONDecodeError:
        return {"name": "crons", "status": "warning", "details": "Bad JSON from cron API", "issues": ["parse error"]}
    
    issues = []
    for j in jobs:
        name = j.get("name", j.get("id", "?"))
        last_status = j.get("lastStatus", "")
        consec_err = j.get("consecutiveErrors", 0)
        last_run = j.get("lastRunAtMs", 0)
        schedule = j.get("schedule", "")
        
        if consec_err and consec_err > 0:
            issues.append(f"{name}: {consec_err} consecutive errors")
        if last_status and last_status not in ("ok", "success", "completed", ""):
            issues.append(f"{name}: lastStatus={last_status}")
        if last_run:
            age_h = (time.time() * 1000 - last_run) / 3600000
            # If schedule looks like it should run at least daily, flag if >48h stale
            if age_h > 48:
                issues.append(f"{name}: last ran {age_h:.0f}h ago")
    
    s = "critical" if any("error" in i.lower() for i in issues) else ("warning" if issues else "ok")
    return {"name": "crons", "status": s,
            "details": f"{len(jobs)} jobs, {len(issues)} issues",
            "issues": issues}

def check_database():
    issues = []
    counts = {}
    for t in KEY_TABLES:
        val = psql(f'SELECT count(*) FROM "{t}"')
        counts[t] = int(val) if val and val.isdigit() else "error"
        if counts[t] == "error":
            issues.append(f"{t}: count failed")
    
    db_size = psql("SELECT pg_size_pretty(pg_database_size('dghub'))") or "unknown"
    
    # Check backups
    backup_status = "no backups dir"
    if BACKUP_DIR.exists():
        backups = sorted(BACKUP_DIR.glob("*.dump"), key=lambda f: f.stat().st_mtime, reverse=True)
        if not backups:
            backups = sorted(BACKUP_DIR.glob("*.sql*"), key=lambda f: f.stat().st_mtime, reverse=True)
        if backups:
            age_h = (time.time() - backups[0].stat().st_mtime) / 3600
            backup_status = f"latest {backups[0].name} ({age_h:.0f}h ago)"
            if age_h > BACKUP_MAX_AGE_HOURS:
                issues.append(f"backup stale: {age_h:.0f}h old")
        else:
            backup_status = "no backup files found"
            issues.append("no backups found")
    else:
        issues.append("backups directory missing")
    
    count_str = ", ".join(f"{t}={v}" for t, v in counts.items())
    s = "critical" if any("error" in str(v) for v in counts.values()) else ("warning" if issues else "ok")
    return {"name": "database", "status": s,
            "details": f"size={db_size} | {count_str} | backup: {backup_status}",
            "issues": issues, "counts": counts}

def check_sync_freshness():
    raw = psql('SELECT platform, MAX("lastSyncedAt") FROM "AdImpression" GROUP BY platform')
    if not raw:
        return {"name": "sync", "status": "warning", "details": "Could not query sync times", "issues": ["query failed"]}
    
    issues = []
    platforms = {}
    for line in raw.strip().split("\n"):
        parts = line.split("|")
        if len(parts) == 2:
            plat, ts = parts[0].strip(), parts[1].strip()
            if ts:
                try:
                    dt = datetime.fromisoformat(ts.replace(" ", "T")).replace(tzinfo=timezone.utc)
                    age_h = (now - dt).total_seconds() / 3600
                    platforms[plat] = f"{age_h:.1f}h ago"
                    if age_h > SYNC_STALE_HOURS:
                        issues.append(f"{plat}: last sync {age_h:.0f}h ago")
                except ValueError:
                    platforms[plat] = ts
    
    s = "critical" if len(issues) >= 3 else ("warning" if issues else "ok")
    detail = ", ".join(f"{k}={v}" for k, v in platforms.items())
    return {"name": "sync", "status": s, "details": detail, "issues": issues}

def check_agent_runs():
    raw = psql("""
        SELECT a.slug, 
               count(*) AS total,
               count(*) FILTER (WHERE r.status='completed') AS ok,
               round(avg(EXTRACT(EPOCH FROM (r.\"completedAt\" - r.\"startedAt\")))::numeric, 1) AS avg_sec
        FROM "AgentRun" r JOIN "Agent" a ON r."agentId"=a.id
        WHERE r."createdAt" > now() - interval '7 days'
        GROUP BY a.slug
    """.replace("\n", " "))
    
    if not raw:
        return {"name": "agents", "status": "warning", "details": "No agent runs in 7 days or query failed", "issues": ["no data"]}
    
    issues = []
    details = []
    for line in raw.strip().split("\n"):
        parts = [p.strip() for p in line.split("|")]
        if len(parts) >= 4:
            slug, total, ok, avg_sec = parts[0], int(parts[1]), int(parts[2]), parts[3]
            rate = ok / total if total > 0 else 0
            details.append(f"{slug}: {ok}/{total} ({rate:.0%}), avg {avg_sec}s")
            if rate < AGENT_SUCCESS_THRESHOLD:
                issues.append(f"{slug}: success rate {rate:.0%} < 90%")
    
    s = "critical" if any("success rate" in i for i in issues) else ("warning" if issues else "ok")
    return {"name": "agents", "status": s, "details": "; ".join(details), "issues": issues}

def check_hub_api():
    issues = []
    results = []
    for ep in API_ENDPOINTS:
        code, _, elapsed = http_get(f"{HUB_URL}{ep}", timeout=10)
        results.append(f"{ep}: {code} ({elapsed:.1f}s)")
        if code != 200:
            issues.append(f"{ep}: HTTP {code}")
        elif elapsed > API_SLOW_THRESHOLD:
            issues.append(f"{ep}: slow ({elapsed:.1f}s)")
    
    s = "critical" if any("HTTP" in i and "0" in i for i in issues) else ("warning" if issues else "ok")
    return {"name": "api", "status": s, "details": ", ".join(results), "issues": issues}

# ── Main ────────────────────────────────────────────────────────────────
def run_all_checks():
    checks = [check_pm2(), check_crons(), check_database(),
              check_sync_freshness(), check_agent_runs(), check_hub_api()]
    
    alerts = []
    for c in checks:
        for issue in c.get("issues", []):
            prefix = "🔴" if c["status"] == "critical" else "🟡"
            alerts.append(f"{prefix} [{c['name']}] {issue}")
    
    statuses = [c["status"] for c in checks]
    overall = "critical" if "critical" in statuses else ("warning" if "warning" in statuses else "healthy")
    
    n_issues = len(alerts)
    if overall == "healthy":
        summary = "All systems healthy ✅"
    else:
        summary = f"{n_issues} issue(s) found — {overall.upper()}"
    
    return {
        "timestamp": now.isoformat(),
        "overall": overall,
        "checks": checks,
        "alerts": alerts,
        "summary": summary,
        "issueCount": n_issues,
    }

def log_to_db(result):
    """Insert AgentRun for hub-doctor."""
    agent_id = psql("SELECT id FROM \"Agent\" WHERE slug='hub-doctor'")
    if not agent_id:
        return
    run_id = str(uuid.uuid4())
    status = "completed"
    findings = result["issueCount"]
    output_json = json.dumps(result).replace("'", "''")
    psql(f"""
        INSERT INTO "AgentRun" (id, "agentId", status, "findingsCount", output, "startedAt", "completedAt", "createdAt")
        VALUES ('{run_id}', '{agent_id}', '{status}', {findings}, '{output_json}', now(), now(), now())
    """.replace("\n", " "))

def send_telegram(result):
    emoji = {"ok": "✅", "warning": "⚠️", "critical": "🔴"}
    overall_emoji = {"healthy": "✅", "warning": "⚠️", "critical": "🔴"}
    
    lines = [f"{overall_emoji.get(result['overall'], '❓')} <b>Hub Doctor — {result['overall'].upper()}</b>"]
    lines.append(f"<i>{datetime.now().strftime('%Y-%m-%d %H:%M %Z')}</i>\n")
    
    for c in result["checks"]:
        e = emoji.get(c["status"], "❓")
        lines.append(f"{e} <b>{c['name']}</b>: {c['details'][:120]}")
    
    if result["alerts"]:
        lines.append("\n<b>Alerts:</b>")
        for a in result["alerts"][:10]:
            lines.append(f"  {a}")
    
    lines.append(f"\n<b>{result['summary']}</b>")
    text = "\n".join(lines)
    
    payload = json.dumps({
        "chat_id": TG_CHAT_ID,
        "message_thread_id": TG_THREAD_ID,
        "text": text,
        "parse_mode": "HTML",
    }).encode()
    
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"Telegram send failed: {e}", file=sys.stderr)

def print_human(result):
    emoji = {"ok": "✅", "warning": "⚠️", "critical": "🔴"}
    overall_emoji = {"healthy": "✅", "warning": "⚠️", "critical": "🔴"}
    
    print(f"\n{overall_emoji.get(result['overall'], '?')} Hub Doctor — {result['overall'].upper()}")
    print(f"  {result['timestamp']}\n")
    
    for c in result["checks"]:
        e = emoji.get(c["status"], "?")
        print(f"  {e} {c['name']:10s} {c['details']}")
        for issue in c.get("issues", []):
            print(f"     ↳ {issue}")
    
    if result["alerts"]:
        print(f"\n  Alerts ({len(result['alerts'])}):")
        for a in result["alerts"]:
            print(f"    {a}")
    
    print(f"\n  {result['summary']}\n")

def main():
    args = set(sys.argv[1:])
    result = run_all_checks()
    log_to_db(result)
    
    if "--json" in args:
        print(json.dumps(result, indent=2))
    else:
        print_human(result)
    
    if "--notify" in args:
        send_telegram(result)

if __name__ == "__main__":
    main()
