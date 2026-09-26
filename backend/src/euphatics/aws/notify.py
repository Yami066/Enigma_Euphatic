"""Email reminders through Amazon SES (sandbox: only verified addresses)."""
from __future__ import annotations

import os

from .clients import client


def send(to: str, subject: str, body: str) -> bool:
    sender = os.environ.get("NOTIFY_FROM", "")
    allowed = {e.strip().lower() for e in os.environ.get("NOTIFY_ALLOWED", sender).split(",") if e.strip()}
    if not sender or not to or to.lower() not in allowed:
        return False  # SES sandbox: only send to verified addresses
    try:
        client("sesv2").send_email(
            FromEmailAddress=sender,
            Destination={"ToAddresses": [to]},
            Content={"Simple": {"Subject": {"Data": subject}, "Body": {"Text": {"Data": body}}}},
        )
        return True
    except Exception:  # noqa: BLE001 - reminders are best effort; the in-app timeline always has them
        return False
