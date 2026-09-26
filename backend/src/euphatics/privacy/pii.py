"""PII firewall for anything that leaves our region (web-grounded questions).

Deterministic regexes run first. Amazon Comprehend (IN_AADHAAR, PAN, NAME, ...)
adds a second pass in the AWS handler. Names we already know from the case
(the deceased and the family) are replaced by roles such as "my father", so
the question keeps its meaning without identifying anyone.
"""
from __future__ import annotations

import re

from .aadhaar import find_aadhaar_numbers

PATTERNS = [
    ("PAN", re.compile(r"\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b", re.I)),
    ("EMAIL", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")),
    ("PHONE", re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)")),
    ("IFSC", re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b", re.I)),
    ("UAN_OR_ACCOUNT", re.compile(r"(?<!\d)\d{9,18}(?!\d)")),
    ("POLICY_OR_FOLIO", re.compile(r"\b(?:policy|folio|pran|uan|a/?c|account)\s*(?:no\.?|number|#)?\s*[:\-]?\s*[A-Z0-9/\-]{5,}\b", re.I)),
]


def scrub(text: str, known_names: dict[str, str] | None = None) -> tuple[str, list[dict]]:
    """Return (clean text, findings). known_names maps a real name to a role, e.g. {"Ramesh Kumar Sharma": "my father"}."""
    findings: list[dict] = []
    out = text
    for start, end, digits in reversed(find_aadhaar_numbers(out)):
        findings.append({"type": "AADHAAR", "value": f"XXXX XXXX {digits[-4:]}"})
        out = out[:start] + "[Aadhaar removed]" + out[end:]
    for kind, rx in PATTERNS:
        def repl(m, kind=kind):
            findings.append({"type": kind, "value": _preview(m.group(0))})
            return f"[{kind.lower().replace('_', ' ')} removed]"
        out = rx.sub(repl, out)
    for name, role in sorted((known_names or {}).items(), key=lambda kv: -len(kv[0])):
        if not name or len(name.strip()) < 3:
            continue
        parts = [re.escape(p) for p in name.split() if len(p) >= 3]
        variants = [re.escape(name)] + parts
        for v in variants:
            rx = re.compile(rf"\b{v}\b", re.I)
            if rx.search(out):
                findings.append({"type": "NAME", "value": role})
                out = rx.sub(role, out)
    return out, findings


def _preview(v: str) -> str:
    v = v.strip()
    return (v[:2] + "…" + v[-2:]) if len(v) > 6 else "…"
