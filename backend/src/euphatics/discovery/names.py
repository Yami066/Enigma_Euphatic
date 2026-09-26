"""Name spellings a person's records might use.

Indian records often differ only in initials and order: "Ramesh Kumar Sharma",
"R K Sharma", "Sharma Ramesh Kumar", or South-Indian style "K. Ramesh" where the
initial is a family or place name. Official searches match on exact text, so we
give the family every sensible variant to try.
"""
from __future__ import annotations

import re


def _clean(name: str) -> list[str]:
    name = re.sub(r"[^A-Za-z\s.]", " ", name).replace(".", " ")
    parts = [p for p in name.upper().split() if p not in {"MR", "MRS", "MS", "SHRI", "SMT", "LATE", "DR", "KUM"}]
    return parts


def name_variants(full_name: str, limit: int = 8) -> list[str]:
    parts = _clean(full_name)
    if not parts:
        return []
    out: list[str] = []

    def add(v: list[str]) -> None:
        s = " ".join(v).strip()
        if s and s not in out:
            out.append(s)

    add(parts)
    if len(parts) >= 2:
        first, last, middle = parts[0], parts[-1], parts[1:-1]
        initials = [p[0] for p in parts[:-1]]
        add(initials + [last])                       # R K SHARMA
        add([first] + [m[0] for m in middle] + [last])  # RAMESH K SHARMA
        add([first, last])                           # RAMESH SHARMA
        add([last] + parts[:-1])                     # SHARMA RAMESH KUMAR
        add([last, first])                           # SHARMA RAMESH
        if len(first) == 1:                          # K RAMESH  ->  RAMESH K
            add(parts[1:] + [first])
        if len(last) == 1:                           # RAMESH K  ->  K RAMESH
            add([last] + parts[:-1])
    return out[:limit]
