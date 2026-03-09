"""Database helpers for Python agents to create work items and other records."""

import os
import uuid
import psycopg2
from datetime import datetime

DB_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/dghub")

def get_conn():
    return psycopg2.connect(DB_URL)

def create_work_item(
    title: str,
    type: str,
    description: str = None,
    status: str = "backlog",
    priority: str = "p1",
    platform: str = None,
    source: str = "agent",
    source_ref: str = None,
    tags: list = None,
    assignee: str = None,
) -> str:
    """Create a WorkItem and return its id."""
    item_id = _cuid()
    now = datetime.utcnow()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO "WorkItem" (id, title, description, type, status, priority, platform, assignee, source, "sourceRef", tags, "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (item_id, title, description, type, status, priority, platform, assignee, source, source_ref, tags or [], now, now),
            )
        conn.commit()
    finally:
        conn.close()
    return item_id

def _cuid():
    return str(uuid.uuid4())[:25].replace("-", "")
