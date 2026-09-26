"""Display name and disclaimer, from config/brand.json (copied here at deploy time)."""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def brand() -> dict:
    p = Path(__file__).with_name("brand.json")
    if not p.exists():
        p = Path(__file__).resolve().parents[3] / "config" / "brand.json"
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {
            "appName": os.environ.get("APP_NAME", "Euphatics"),
            "disclaimer": "Not legal advice. Rules are cited from official sources; confirm with the bank or "
                          "institution before signing.",
        }
