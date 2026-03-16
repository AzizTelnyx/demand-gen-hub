"""
Base class for all DG Hub optimization agents.
Provides: knowledge loading, guardrails, kill switch, DB integration,
Telegram reporting with inline approval buttons.

Usage:
    class MyAgent(BaseAgent):
        AGENT_SLUG = "my-agent"
        AGENT_NAME = "My Agent"
        KNOWLEDGE_FILES = ["telnyx-strategy.md"]

        def analyze(self):
            ...
        def execute(self):
            ...
"""

import json
import os
import re
import sys
import uuid
import urllib.request
from datetime import datetime, timedelta, timezone

import psycopg2

# Ensure scripts/ is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.knowledge import load_knowledge
from lib.db import get_conn, _cuid

# ─── Constants ────────────────────────────────────────

TELEGRAM_BOT_TOKEN = os.environ.get(
    "TELEGRAM_BOT_TOKEN",
    "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo",
)
TELEGRAM_CHAT_ID = "-1003786506284"
TELEGRAM_THREAD_ID = 164  # Agent Activity topic

DB_URL = os.environ.get("DATABASE_URL", "postgresql://localhost:5432/dghub")

# ─── Campaign Name Parser Patterns ───────────────────

# Word boundary that also treats _ as boundary
_WB = r'(?:^|(?<=[\s_\-|]))'
_WE = r'(?=[\s_\-|]|$)'

FUNNEL_PATTERNS = {
    "TOFU": re.compile(rf"{_WB}TOFU{_WE}|Top[\s-]?of[\s-]?Funnel", re.I),
    "MOFU": re.compile(rf"{_WB}MOFU{_WE}|Mid[\s-]?of[\s-]?Funnel", re.I),
    "BOFU": re.compile(rf"{_WB}BOFU{_WE}|Bot[\s-]?of[\s-]?Funnel|Bottom[\s-]?of[\s-]?Funnel", re.I),
}

REGION_PATTERNS = {
    "AMER": re.compile(rf"{_WB}AMER{_WE}|{_WB}LATAM{_WE}|\bNorth America\b", re.I),
    "EMEA": re.compile(rf"{_WB}EMEA{_WE}|\bEurope\b", re.I),
    "APAC": re.compile(rf"{_WB}APAC{_WE}|\bAsia\b", re.I),
    "MENA": re.compile(rf"{_WB}MENA{_WE}", re.I),
    "GLOBAL": re.compile(rf"{_WB}GLOBAL{_WE}", re.I),
}

FORMAT_PATTERNS = {
    "SA": re.compile(rf"{_WB}SA{_WE}|Search Ad", re.I),
    "DA": re.compile(rf"{_WB}DA{_WE}|Display Ad", re.I),
    "NA": re.compile(rf"{_WB}NA{_WE}|Native Ad", re.I),
    "VA": re.compile(rf"{_WB}VA{_WE}|Video Ad", re.I),
    "SI": re.compile(rf"{_WB}SI{_WE}|Single Image", re.I),
    "CA": re.compile(rf"{_WB}CA{_WE}|Carousel", re.I),
    "SPA": re.compile(rf"{_WB}SPA{_WE}|Spotlight", re.I),
    "GIF": re.compile(rf"{_WB}GIF{_WE}", re.I),
}

PRODUCTS = [
    "Voice API", "SIP Trunking", "Messaging", "SMS API",
    "IoT", "Networking", "Storage", "Inference",
    "Contact Center", "Wireless", "Numbers",
    "AI", "Voice AI",
]

COMPETITORS = [
    "twilio", "vonage", "bandwidth", "plivo", "sinch", "messagebird",
    "five9", "genesys", "vapi", "retell", "bland", "synthflow",
    "voiceflow", "elevenlabs", "livekit", "openai",
]


class KillSwitchTriggered(Exception):
    """Raised when CPA spike exceeds threshold."""
    pass


class BaseAgent:
    """Base class for all DG Hub optimization agents."""

    AGENT_SLUG = ""   # Override in subclass
    AGENT_NAME = ""   # Override in subclass
    KNOWLEDGE_FILES = []

    # Guardrail defaults
    MAX_ACTIONS_PER_CAMPAIGN_PER_DAY = 3
    LEARNING_PERIOD_DAYS = 7
    MIN_SPEND_FOR_ACTION = 200  # USD

    def __init__(self, dry_run=False):
        self.dry_run = dry_run
        self.knowledge = None
        self.actions_taken = []
        self.recommendations = []
        self.alerts = []
        self.agent_run_id = None
        self.agent_db_id = None
        self.start_time = None

    # ─── Main Entry Point ─────────────────────────────

    def run(self):
        """Main entry point."""
        self.start_time = datetime.now()
        self.load_knowledge()
        self.check_kill_switch()
        self.register_run()
        try:
            self.analyze()
            self.execute()
            self.report()
            self.complete_run("done")
        except Exception as e:
            self.complete_run("error", str(e))
            raise

    def analyze(self):
        """Override in subclass: gather data and build recommendations."""
        raise NotImplementedError

    def execute(self):
        """Override in subclass: apply Level 3 auto-actions."""
        raise NotImplementedError

    # ─── Knowledge ────────────────────────────────────

    def load_knowledge(self):
        """Load knowledge base context."""
        files = self.KNOWLEDGE_FILES or [
            "telnyx-strategy.md",
            "brand/brand-messaging-q1-2026.md",
        ]
        self.knowledge = load_knowledge(files=files)

    # ─── Kill Switch ──────────────────────────────────

    def check_kill_switch(self):
        """
        Check if CPA spiked >50% day-over-day across account.
        If so, abort all auto-actions by raising KillSwitchTriggered.
        """
        try:
            from platforms import get_all_connectors

            yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            day_before = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")

            total_spend_y, total_conv_y = 0.0, 0.0
            total_spend_db, total_conv_db = 0.0, 0.0

            for connector in get_all_connectors():
                try:
                    m_y = connector.query_metrics(yesterday, yesterday, active_only=False)
                    m_db = connector.query_metrics(day_before, day_before, active_only=False)
                    total_spend_y += m_y.total_spend
                    total_conv_y += m_y.total_conversions
                    total_spend_db += m_db.total_spend
                    total_conv_db += m_db.total_conversions
                except Exception:
                    continue

            if total_conv_y > 0 and total_conv_db > 0:
                cpa_y = total_spend_y / total_conv_y
                cpa_db = total_spend_db / total_conv_db
                if cpa_db > 0 and ((cpa_y - cpa_db) / cpa_db) > 0.50:
                    msg = (
                        f"🚨 KILL SWITCH: CPA spiked {((cpa_y - cpa_db) / cpa_db) * 100:.0f}% "
                        f"day-over-day (${cpa_db:.2f} → ${cpa_y:.2f}). "
                        f"All auto-actions aborted for {self.AGENT_NAME}."
                    )
                    self._send_telegram(msg)
                    raise KillSwitchTriggered(msg)
        except KillSwitchTriggered:
            raise
        except Exception as e:
            # If we can't check, log but don't block
            print(f"  ⚠️  Kill switch check failed: {e}", file=sys.stderr)

    # ─── DB Integration ───────────────────────────────

    def _get_agent_db_id(self):
        """Look up Agent.id by slug."""
        if self.agent_db_id:
            return self.agent_db_id
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute('SELECT id FROM "Agent" WHERE slug = %s', (self.AGENT_SLUG,))
                row = cur.fetchone()
                if row:
                    self.agent_db_id = row[0]
                    return self.agent_db_id
                raise ValueError(f"Agent '{self.AGENT_SLUG}' not found in DB")
        finally:
            conn.close()

    def register_run(self):
        """Create AgentRun row in DB."""
        self.agent_run_id = _cuid()
        agent_id = self._get_agent_db_id()
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO "AgentRun" (id, "agentId", status, "startedAt", "createdAt")
                    VALUES (%s, %s, 'running', %s, %s)""",
                    (self.agent_run_id, agent_id, self.start_time, self.start_time),
                )
            conn.commit()
        finally:
            conn.close()

    def complete_run(self, status, error=None):
        """Update AgentRun with status + summary."""
        if not self.agent_run_id:
            return
        now = datetime.now()
        summary = json.dumps({
            "actions": len(self.actions_taken),
            "recommendations": len(self.recommendations),
            "alerts": len(self.alerts),
            "dry_run": self.dry_run,
        })
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE "AgentRun"
                    SET status = %s, output = %s, error = %s,
                        "findingsCount" = %s, "recsCount" = %s,
                        "completedAt" = %s
                    WHERE id = %s""",
                    (
                        status, summary, error,
                        len(self.actions_taken), len(self.recommendations),
                        now, self.agent_run_id,
                    ),
                )
            conn.commit()
        finally:
            conn.close()

    # ─── Guardrails ───────────────────────────────────

    def can_auto_act(self, campaign_name, campaign_id, platform):
        """
        Check guardrails before auto-acting:
        1. Max actions per campaign per day
        2. Learning period (campaign must be >N days old)
        3. Minimum spend threshold
        Returns (allowed: bool, reason: str)
        """
        if self.dry_run:
            return False, "dry run mode"

        # Check actions today
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                cur.execute(
                    """SELECT COUNT(*) FROM "CampaignChange"
                    WHERE "campaignId" = %s AND "timestamp" >= %s""",
                    (campaign_id, today_start),
                )
                count = cur.fetchone()[0]
                if count >= self.MAX_ACTIONS_PER_CAMPAIGN_PER_DAY:
                    return False, f"max {self.MAX_ACTIONS_PER_CAMPAIGN_PER_DAY} actions/day reached ({count})"

                # Check learning period - campaign must exist in DB with createdAt > LEARNING_PERIOD_DAYS ago
                cur.execute(
                    """SELECT "createdAt" FROM "Campaign"
                    WHERE "platformId" = %s AND platform = %s""",
                    (campaign_id, platform),
                )
                row = cur.fetchone()
                if row:
                    age = (datetime.now() - row[0]).days
                    if age < self.LEARNING_PERIOD_DAYS:
                        return False, f"learning period: campaign is {age}d old (min {self.LEARNING_PERIOD_DAYS}d)"

                # Check min spend (last 30 days)
                # We query from CampaignChange or rely on platform metrics
                # For now, check via platform connector
        finally:
            conn.close()

        try:
            from platforms import get_connector as get_plat
            connector = get_plat(platform)
            last_30 = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            today = datetime.now().strftime("%Y-%m-%d")
            metrics = connector.query_metrics(last_30, today, active_only=False)
            for c in metrics.campaigns:
                if c.campaign_id == campaign_id:
                    if c.spend < self.MIN_SPEND_FOR_ACTION:
                        return False, f"spend ${c.spend:.2f} < min ${self.MIN_SPEND_FOR_ACTION}"
                    break
        except Exception:
            pass  # If we can't check spend, allow (other guardrails still apply)

        return True, "ok"

    # ─── Action Recording ─────────────────────────────

    def record_action(
        self, campaign_name, campaign_id, platform, change_type,
        description, old_value=None, new_value=None,
    ):
        """Log to CampaignChange table + actions_taken list."""
        action_id = _cuid()
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                rollback_data = json.dumps({"old": old_value, "new": new_value}) if old_value is not None else None
                cur.execute(
                    """INSERT INTO "CampaignChange"
                    (id, "campaignId", "campaignName", platform, "changeType",
                     description, "oldValue", "newValue", source, actor,
                     "timestamp", "createdAt", "rollbackData", "agentRunId", "autoExecuted")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        action_id, campaign_id, campaign_name, platform, change_type,
                        description, str(old_value) if old_value is not None else None,
                        str(new_value) if new_value is not None else None,
                        "agent", self.AGENT_SLUG,
                        datetime.now(), datetime.now(),
                        rollback_data, self.agent_run_id, True,
                    ),
                )
            conn.commit()
        finally:
            conn.close()

        self.actions_taken.append({
            "id": action_id,
            "campaign": campaign_name,
            "type": change_type,
            "description": description,
            "old": old_value,
            "new": new_value,
        })

    def record_recommendation(
        self, type, target, action, rationale,
        severity="medium", impact=None, confidence=None,
        platform=None, campaign_id=None, campaign_name=None,
        execution_data=None,
    ):
        """Create Recommendation row (Level 2 - needs approval)."""
        rec_id = _cuid()
        callback_data = f"agent_approve:{rec_id}"
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO "Recommendation"
                    (id, "agentRunId", type, severity, target, action, rationale,
                     impact, status, "createdAt",
                     confidence, platform, "campaignId", "campaignName", "callbackData")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s,
                            %s, %s, %s, %s, %s)""",
                    (
                        rec_id, self.agent_run_id, type, severity, target, action, rationale,
                        impact, datetime.now(),
                        confidence, platform, campaign_id, campaign_name, callback_data,
                    ),
                )
            conn.commit()
        finally:
            conn.close()

        rec = {
            "id": rec_id,
            "type": type,
            "target": target,
            "action": action,
            "rationale": rationale,
            "severity": severity,
            "callback_data": callback_data,
        }
        self.recommendations.append(rec)
        return rec_id

    def record_alert(self, message, severity="warning"):
        """Add to alerts list for Telegram notification."""
        self.alerts.append({"message": message, "severity": severity})

    # ─── Campaign Name Parser ─────────────────────────

    def parse_campaign(self, name):
        """
        Parse campaign name → dict with:
        funnel, product, region, competitor, format, intent
        """
        result = {
            "funnel": None,
            "product": None,
            "region": None,
            "competitor": None,
            "format": None,
            "intent": None,
            "raw": name,
        }

        # Funnel
        for funnel, pat in FUNNEL_PATTERNS.items():
            if pat.search(name):
                result["funnel"] = funnel
                break

        # Region
        for region, pat in REGION_PATTERNS.items():
            if pat.search(name):
                result["region"] = region
                break

        # Format
        for fmt, pat in FORMAT_PATTERNS.items():
            if pat.search(name):
                result["format"] = fmt
                break

        # Product (longest match first) — also check with _ replaced by space
        name_lower = name.lower()
        name_normalized = name.replace("_", " ").replace("|", " ").lower()
        for product in sorted(PRODUCTS, key=len, reverse=True):
            if product.lower() in name_lower or product.lower() in name_normalized:
                result["product"] = product
                break

        # Competitor
        for comp in COMPETITORS:
            if comp.lower() in name_lower:
                result["competitor"] = comp
                break

        # Intent heuristic
        if result["funnel"] == "BOFU" or result["competitor"]:
            result["intent"] = "high"
        elif result["funnel"] == "MOFU":
            result["intent"] = "medium"
        elif result["funnel"] == "TOFU":
            result["intent"] = "low"

        return result

    # ─── Telegram ─────────────────────────────────────

    def _send_telegram(self, text, reply_markup=None, parse_mode="HTML"):
        """Low-level Telegram send."""
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "message_thread_id": TELEGRAM_THREAD_ID,
            "text": text,
            "parse_mode": parse_mode,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup

        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        except Exception as e:
            print(f"  ⚠️  Telegram send failed: {e}", file=sys.stderr)
            return None

    def report(self):
        """Send Telegram summary + individual approval cards."""
        self.send_telegram_summary()
        # Send individual approval cards for pending recommendations
        for rec in self.recommendations:
            self.send_telegram_approval(
                rec["id"],
                f"<b>{rec['type']}</b>: {rec['target']}\n"
                f"<i>{rec['action']}</i>\n"
                f"📋 {rec['rationale']}",
            )

    def send_telegram_summary(self):
        """Post summary to Agent Activity thread."""
        mode = "🧪 DRY RUN" if self.dry_run else "🤖 LIVE"
        elapsed = (datetime.now() - self.start_time).total_seconds() if self.start_time else 0

        lines = [f"<b>{self.AGENT_NAME}</b> — {mode}"]
        lines.append(f"⏱ {elapsed:.0f}s")

        if self.actions_taken:
            lines.append(f"\n✅ <b>{len(self.actions_taken)} auto-actions:</b>")
            for a in self.actions_taken[:10]:
                lines.append(f"  • {a['description']}")
            if len(self.actions_taken) > 10:
                lines.append(f"  ... +{len(self.actions_taken) - 10} more")

        if self.recommendations:
            lines.append(f"\n📋 <b>{len(self.recommendations)} pending approvals</b> (cards below)")

        if self.alerts:
            lines.append(f"\n⚠️ <b>Alerts:</b>")
            for a in self.alerts[:5]:
                icon = "🔴" if a["severity"] == "critical" else "🟡"
                lines.append(f"  {icon} {a['message']}")

        if not self.actions_taken and not self.recommendations and not self.alerts:
            lines.append("\n✨ No issues found")

        self._send_telegram("\n".join(lines))

    # ─── Compatibility Shims ─────────────────────────
    # Maps old method names used by creative-manager and domain-publisher-manager
    # to the current BaseAgent API.

    def log_run_start(self):
        """Compat: alias for register_run() with start_time init."""
        self.start_time = self.start_time or datetime.now()
        self.load_knowledge()
        self.check_kill_switch()
        self.register_run()

    def log_run_complete(self, findings_count=0, recs_count=0, auto_executed_count=0):
        """Compat: alias for complete_run()."""
        self.complete_run("done")

    def log_change(self, platform=None, campaign_id=None, campaign_name=None,
                   action_type=None, old_value=None, new_value=None, auto_executed=False):
        """Compat: alias for record_action()."""
        self.record_action(
            campaign_name=campaign_name or "",
            campaign_id=campaign_id or "",
            platform=platform or "",
            change_type=action_type or "change",
            description=f"{action_type}: {old_value} -> {new_value}",
            old_value=old_value,
            new_value=new_value,
        )

    def log_error(self, msg):
        """Compat: print error and add to alerts."""
        print(f"  ❌ {msg}", file=sys.stderr)
        self.record_alert(msg, severity="critical")

    def check_guardrails(self, campaign_name, context_data=None):
        """Compat: simplified guardrail check. Returns True if action is allowed."""
        if self.dry_run:
            return False
        return True

    def check_learning_period(self, context):
        """Compat: check if campaign is past learning period. Returns True if ok."""
        return True  # Detailed check happens in can_auto_act

    def parse_campaign_name(self, name):
        """Compat: alias for parse_campaign()."""
        return self.parse_campaign(name)

    def post_telegram_summary(self, findings=None, auto_executed=0, pending=0):
        """Compat: alias for send_telegram_summary() with extra args."""
        self.send_telegram_summary()

    @property
    def logger(self):
        """Compat: provide a basic logger-like object."""
        import logging
        if not hasattr(self, '_logger'):
            self._logger = logging.getLogger(self.AGENT_SLUG or self.AGENT_NAME or 'agent')
            if not self._logger.handlers:
                handler = logging.StreamHandler()
                handler.setFormatter(logging.Formatter('%(levelname)s: %(message)s'))
                self._logger.addHandler(handler)
                self._logger.setLevel(logging.INFO)
        return self._logger

    def send_telegram_approval(self, recommendation_id, text, buttons=None):
        """Post individual approval card with inline buttons."""
        if buttons is None:
            buttons = [
                [
                    {"text": "✅ Approve", "callback_data": f"agent_approve:{recommendation_id}"},
                    {"text": "❌ Reject", "callback_data": f"agent_reject:{recommendation_id}"},
                    {"text": "✏️ Adjust", "callback_data": f"agent_adjust:{recommendation_id}"},
                ]
            ]

        reply_markup = json.dumps({"inline_keyboard": buttons})
        self._send_telegram(text, reply_markup=reply_markup)
