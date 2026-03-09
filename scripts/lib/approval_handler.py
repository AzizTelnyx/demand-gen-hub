"""
Unified approval handler for all DG Hub agents.
Processes Telegram inline button callbacks (approve/reject/adjust).

Usage:
    from lib.approval_handler import handle_callback

    # In your webhook handler:
    handle_callback(callback_data, user_name)
"""

import json
import os
import sys
import urllib.request
from datetime import datetime

import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.db import get_conn, _cuid

TELEGRAM_BOT_TOKEN = os.environ.get(
    "TELEGRAM_BOT_TOKEN",
    "8579443521:AAEtEBNZlUEq22joa_BnDf3bjD3paLAWSVo",
)
TELEGRAM_CHAT_ID = "-1003786506284"
TELEGRAM_THREAD_ID = 164


def handle_callback(callback_data: str, user_name: str = "unknown") -> dict:
    """
    Process a Telegram callback button press.
    
    callback_data formats:
        agent_approve:{rec_id}
        agent_reject:{rec_id}
        agent_adjust:{rec_id}
    
    Returns dict with status and message.
    """
    parts = callback_data.split(":", 1)
    if len(parts) != 2:
        return {"ok": False, "error": "Invalid callback format"}

    action, rec_id = parts[0], parts[1]

    if action == "agent_approve":
        return _approve(rec_id, user_name)
    elif action == "agent_reject":
        return _reject(rec_id, user_name)
    elif action == "agent_adjust":
        return _adjust(rec_id, user_name)
    else:
        return {"ok": False, "error": f"Unknown action: {action}"}


def _get_recommendation(rec_id: str) -> dict | None:
    """Fetch recommendation from DB."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, "agentRunId", type, severity, target, action,
                          rationale, impact, status, platform, "campaignId",
                          "campaignName"
                   FROM "Recommendation" WHERE id = %s""",
                (rec_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            cols = [
                "id", "agentRunId", "type", "severity", "target", "action",
                "rationale", "impact", "status", "platform", "campaignId",
                "campaignName",
            ]
            return dict(zip(cols, row))
    finally:
        conn.close()


def _update_recommendation_status(rec_id: str, status: str):
    """Update recommendation status in DB."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE "Recommendation"
                   SET status = %s, "appliedAt" = %s
                   WHERE id = %s""",
                (status, datetime.now() if status == "applied" else None, rec_id),
            )
        conn.commit()
    finally:
        conn.close()


def _execute_recommendation(rec: dict) -> dict:
    """Execute an approved recommendation via platform connector."""
    platform = rec.get("platform")
    if not platform:
        return {"ok": False, "error": "No platform specified"}

    try:
        from platforms import get_connector
        connector = get_connector(platform)
    except Exception as e:
        return {"ok": False, "error": f"Platform connector error: {e}"}

    action = rec.get("action", "")
    campaign_id = rec.get("campaignId", "")

    # Parse action type from the recommendation
    action_lower = action.lower()
    try:
        if "pause" in action_lower:
            result = connector.pause_campaign(campaign_id)
        elif "enable" in action_lower or "unpause" in action_lower:
            result = connector.enable_campaign(campaign_id)
        elif "budget" in action_lower:
            # Try to extract budget value from action text
            import re
            match = re.search(r'\$?([\d,]+(?:\.\d+)?)', action)
            if match:
                budget = float(match.group(1).replace(",", ""))
                result = connector.update_budget(campaign_id, budget)
            else:
                return {"ok": False, "error": "Could not parse budget value from action"}
        elif "negative keyword" in action_lower or "block" in action_lower:
            # Extract keyword from action
            import re
            match = re.search(r'"([^"]+)"', action)
            keyword = match.group(1) if match else action
            result = connector.add_negative_keyword(campaign_id, keyword)
        else:
            return {"ok": False, "error": f"Don't know how to execute: {action}"}

        if result.success:
            # Log the change
            _log_change(rec)
            return {"ok": True, "message": f"Executed: {action}"}
        else:
            return {"ok": False, "error": result.error}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _log_change(rec: dict):
    """Log an executed recommendation as a CampaignChange."""
    change_id = _cuid()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO "CampaignChange"
                   (id, "campaignId", "campaignName", platform, "changeType",
                    description, source, actor, "timestamp", "createdAt",
                    "agentRunId", "autoExecuted")
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    change_id,
                    rec.get("campaignId", ""),
                    rec.get("campaignName", rec.get("target", "")),
                    rec.get("platform", ""),
                    rec.get("type", "recommendation"),
                    rec.get("action", ""),
                    "agent_approved",
                    rec.get("agentRunId", ""),
                    datetime.now(), datetime.now(),
                    rec.get("agentRunId"), False,
                ),
            )
        conn.commit()
    finally:
        conn.close()


def _send_telegram(text: str):
    """Send message to Agent Activity thread."""
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "message_thread_id": TELEGRAM_THREAD_ID,
        "text": text,
        "parse_mode": "HTML",
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass


def _approve(rec_id: str, user_name: str) -> dict:
    """Approve and execute a recommendation."""
    rec = _get_recommendation(rec_id)
    if not rec:
        return {"ok": False, "error": "Recommendation not found"}
    if rec["status"] != "pending":
        return {"ok": False, "error": f"Already {rec['status']}"}

    # Execute
    result = _execute_recommendation(rec)
    if result["ok"]:
        _update_recommendation_status(rec_id, "applied")
        _send_telegram(
            f"✅ <b>Approved</b> by {user_name}\n"
            f"{rec['type']}: {rec['target']}\n"
            f"<i>{rec['action']}</i>"
        )
    else:
        _update_recommendation_status(rec_id, "failed")
        _send_telegram(
            f"⚠️ <b>Approval failed</b>\n"
            f"{rec['type']}: {rec['target']}\n"
            f"Error: {result['error']}"
        )

    return result


def _reject(rec_id: str, user_name: str) -> dict:
    """Reject a recommendation."""
    rec = _get_recommendation(rec_id)
    if not rec:
        return {"ok": False, "error": "Recommendation not found"}
    if rec["status"] != "pending":
        return {"ok": False, "error": f"Already {rec['status']}"}

    _update_recommendation_status(rec_id, "rejected")
    _send_telegram(
        f"❌ <b>Rejected</b> by {user_name}\n"
        f"{rec['type']}: {rec['target']}"
    )
    return {"ok": True, "message": "Rejected"}


def _adjust(rec_id: str, user_name: str) -> dict:
    """Flag for adjustment — user will provide custom value."""
    rec = _get_recommendation(rec_id)
    if not rec:
        return {"ok": False, "error": "Recommendation not found"}

    _update_recommendation_status(rec_id, "adjusting")
    _send_telegram(
        f"✏️ <b>Adjustment requested</b> by {user_name}\n"
        f"{rec['type']}: {rec['target']}\n"
        f"Reply with your preferred value."
    )
    return {"ok": True, "message": "Awaiting adjustment value"}
