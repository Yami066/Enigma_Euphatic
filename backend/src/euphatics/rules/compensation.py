"""Settlement clocks and delay compensation (RBI Directions 2025, paras 31–34).

All date maths is plain Python on calendar dates, with no model involved:
  due date      = documents-complete date + 15 calendar days       (para 31 / 32)
  deposit delay = interest at (Bank Rate on the documents-complete date + 4%) p.a.
                  on the amount due, for the days of delay            (para 33)
  locker delay  = ₹5,000 per day of delay                            (para 34)
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import Any

from .engine import DATA_DIR, LOCKER_ASSETS, load_rulebook


@lru_cache(maxsize=1)
def _clocks() -> dict:
    with open(DATA_DIR / "clocks.json", encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def _bank_rates() -> dict:
    with open(DATA_DIR / "bank_rate.json", encoding="utf-8") as fh:
        return json.load(fh)


def _as_date(d: date | str | None) -> date | None:
    if d is None or isinstance(d, date) and not isinstance(d, datetime):
        return d  # type: ignore[return-value]
    if isinstance(d, datetime):
        return d.date()
    return date.fromisoformat(str(d)[:10])


def bank_rate_on(d: date | str) -> dict:
    """Bank Rate in force on a date (latest entry whose effective_from <= d)."""
    day = _as_date(d)
    history = sorted(_bank_rates()["history"], key=lambda r: r["effective_from"])
    chosen = None
    for row in history:
        if date.fromisoformat(row["effective_from"]) <= day:
            chosen = row
    if chosen is None:
        chosen = history[0]
    return {**chosen, "verify_url": _bank_rates()["verify_url"]}


def clock_for(asset_type: str) -> dict:
    c = _clocks()
    return c["locker"] if asset_type in LOCKER_ASSETS else c["deposit"]


def _citation(para: str, quote: str) -> dict:
    src = load_rulebook()["rbi"]["source"]
    return {"source_id": src["id"], "title": src["title"], "url": src["url"], "para": para, "quote": quote}


def due_date(docs_complete: date | str, asset_type: str = "bank_deposit") -> date:
    return _as_date(docs_complete) + timedelta(days=clock_for(asset_type)["days"])


def deposit_compensation(
    amount: float,
    docs_complete: date | str,
    paid_on: date | str | None = None,
    today: date | str | None = None,
) -> dict[str, Any]:
    """Interest owed for a late deposit claim.

    If paid_on is None, the claim is still open and the figure is "accrued so far".
    """
    clock = _clocks()["deposit"]
    comp = clock["compensation"]
    start = _as_date(docs_complete)
    due = start + timedelta(days=clock["days"])
    end = _as_date(paid_on) or _as_date(today) or date.today()
    delay_days = max(0, (end - due).days)
    br = bank_rate_on(start)
    rate_pct = round(br["rate_pct"] + comp["spread_pct"], 4)
    interest = round(float(amount) * rate_pct / 100 * delay_days / 365, 2)
    status = "on_time" if delay_days == 0 and paid_on else ("late" if delay_days > 0 else "running")
    return {
        "kind": "deposit",
        "docs_complete": start.isoformat(),
        "due_date": due.isoformat(),
        "end_date": end.isoformat(),
        "delay_days": delay_days,
        "amount_inr": float(amount),
        "bank_rate_pct": br["rate_pct"],
        "bank_rate_effective_from": br["effective_from"],
        "bank_rate_verified": br.get("verified", False),
        "rate_pct": rate_pct,
        "compensation_inr": interest,
        "status": status,
        "formula": f"₹{indian(float(amount))} × {rate_pct}% × {delay_days}/365",
        "citation": _citation(comp["para"], comp["quote"]),
        "reference_citation": _citation(comp["para"], comp["reference_quote"]),
        "clock_citation": _citation(clock["para"], clock["quote"]),
        "attributable_to_bank_only": True,
    }


def indian(v: float) -> str:
    """3,20,000 (Indian grouping); paise only when there are any."""
    whole, frac = f"{float(v):.2f}".split(".")
    head, tail = whole[:-3], whole[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    out = ",".join(groups + [tail]) if groups else tail
    return out if frac == "00" else f"{out}.{frac}"


def locker_compensation(
    docs_complete: date | str,
    communicated_on: date | str | None = None,
    today: date | str | None = None,
) -> dict[str, Any]:
    """₹5,000/day if the bank doesn't process the claim and fix the inventory date within 15 days."""
    clock = _clocks()["locker"]
    comp = clock["compensation"]
    start = _as_date(docs_complete)
    due = start + timedelta(days=clock["days"])
    end = _as_date(communicated_on) or _as_date(today) or date.today()
    delay_days = max(0, (end - due).days)
    amount = delay_days * comp["amount_inr"]
    return {
        "kind": "locker",
        "docs_complete": start.isoformat(),
        "due_date": due.isoformat(),
        "end_date": end.isoformat(),
        "delay_days": delay_days,
        "per_day_inr": comp["amount_inr"],
        "compensation_inr": float(amount),
        "status": "on_time" if delay_days == 0 and communicated_on else ("late" if delay_days > 0 else "running"),
        "formula": f"₹{indian(comp['amount_inr'])} × {delay_days} day{'' if delay_days == 1 else 's'}",
        "citation": _citation(comp["para"], comp["quote"]),
        "clock_citation": _citation(clock["para"], clock["quote"]),
    }


def escalation_rules() -> dict:
    return _clocks()["escalation"]
