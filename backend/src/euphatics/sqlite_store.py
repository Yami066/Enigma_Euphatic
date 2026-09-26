"""SQLite database store for Euphatics.

Replaces DynamoDB with a single local SQLite database file (euphatics.db).
Supports the exact same PK/SK and GSI1 interface used by service.py,
plus local user authentication.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parents[3] / "backend" / "euphatics.db"


class SqliteStore:
    def __init__(self, db_path: Path | str | None = None):
        self.db_path = str(db_path or DB_PATH)
        self._local = threading.local()
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        if not hasattr(self._local, "conn") or self._local.conn is None:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            self._local.conn = conn
        return self._local.conn

    def _init_db(self):
        conn = self._get_conn()
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS items (
                    pk TEXT NOT NULL,
                    sk TEXT NOT NULL,
                    gsi1pk TEXT,
                    data TEXT NOT NULL,
                    PRIMARY KEY (pk, sk)
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_items_gsi1 ON items(gsi1pk)")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    email TEXT PRIMARY KEY,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)

    @staticmethod
    def _hash_password(password: str) -> str:
        return hashlib.sha256(password.encode("utf-8")).hexdigest()

    # ---------------- User Management ---------------- #

    def create_user(self, email: str, password: str) -> dict:
        email = email.strip().lower()
        pwd_hash = self._hash_password(password)
        conn = self._get_conn()
        with conn:
            conn.execute(
                "INSERT OR REPLACE INTO users (email, password_hash, created_at) VALUES (?, ?, datetime('now'))",
                (email, pwd_hash),
            )
        return {"email": email}

    def verify_user(self, email: str, password: str) -> bool:
        email = email.strip().lower()
        pwd_hash = self._hash_password(password)
        conn = self._get_conn()
        cur = conn.cursor()
        cur.execute("SELECT password_hash FROM users WHERE email = ?", (email,))
        row = cur.fetchone()
        if not row:
            # Auto-create demo user on first attempt
            if email in {"demo@euphatics.example"}:
                self.create_user(email, password)
                return True
            return False
        return row["password_hash"] == pwd_hash

    # ---------------- Service Store Interface ---------------- #

    def get(self, pk: str, sk: str) -> dict | None:
        conn = self._get_conn()
        cur = conn.cursor()
        cur.execute("SELECT data FROM items WHERE pk = ? AND sk = ?", (pk, sk))
        row = cur.fetchone()
        if not row:
            return None
        return json.loads(row["data"])

    def put(self, item: dict) -> dict:
        pk = item["PK"]
        sk = item["SK"]
        gsi1pk = item.get("GSI1PK")
        data_str = json.dumps(item)
        conn = self._get_conn()
        with conn:
            conn.execute(
                "INSERT OR REPLACE INTO items (pk, sk, gsi1pk, data) VALUES (?, ?, ?, ?)",
                (pk, sk, gsi1pk, data_str),
            )
        return item

    def update(self, pk: str, sk: str, fields: dict) -> dict:
        current = self.get(pk, sk) or {"PK": pk, "SK": sk}
        current.update(fields)
        if "GSI1PK" in fields:
            gsi1pk = fields["GSI1PK"]
        else:
            gsi1pk = current.get("GSI1PK")
        data_str = json.dumps(current)
        conn = self._get_conn()
        with conn:
            conn.execute(
                "INSERT OR REPLACE INTO items (pk, sk, gsi1pk, data) VALUES (?, ?, ?, ?)",
                (pk, sk, gsi1pk, data_str),
            )
        return current

    def delete(self, pk: str, sk: str) -> None:
        conn = self._get_conn()
        with conn:
            conn.execute("DELETE FROM items WHERE pk = ? AND sk = ?", (pk, sk))

    def query_pk(self, pk: str, prefix: str | None = None) -> list[dict]:
        conn = self._get_conn()
        cur = conn.cursor()
        if prefix:
            cur.execute(
                "SELECT data FROM items WHERE pk = ? AND sk LIKE ? ORDER BY sk",
                (pk, f"{prefix}%"),
            )
        else:
            cur.execute("SELECT data FROM items WHERE pk = ? ORDER BY sk", (pk,))
        rows = cur.fetchall()
        return [json.loads(r["data"]) for r in rows]

    def query_gsi1(self, gsi1pk: str) -> list[dict]:
        conn = self._get_conn()
        cur = conn.cursor()
        cur.execute("SELECT data FROM items WHERE gsi1pk = ? ORDER BY sk", (gsi1pk,))
        rows = cur.fetchall()
        return [json.loads(r["data"]) for r in rows]

    def add(self, pk: str, sk: str, field: str, amount: int) -> int:
        current = self.get(pk, sk) or {"PK": pk, "SK": sk}
        new_val = int(current.get(field, 0)) + amount
        current[field] = new_val
        self.put(current)
        return new_val
