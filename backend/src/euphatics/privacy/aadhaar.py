"""Aadhaar number detection with the Verhoeff checksum UIDAI uses.

A 12-digit number on an ID photo is only treated as Aadhaar if its checksum is
valid and it doesn't start with 0 or 1, which keeps phone and account numbers
from being mistaken for it.
"""
from __future__ import annotations

import re

_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def verhoeff_valid(num: str) -> bool:
    c = 0
    for i, ch in enumerate(reversed(num)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


def verhoeff_check_digit(num: str) -> str:
    """Digit to append so that num + digit passes Verhoeff (used to make test data)."""
    inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]
    c = 0
    for i, ch in enumerate(reversed(num)):
        c = _D[c][_P[(i + 1) % 8][int(ch)]]
    return str(inv[c])


def is_valid_aadhaar(num: str) -> bool:
    digits = re.sub(r"\D", "", num)
    return len(digits) == 12 and digits[0] not in "01" and verhoeff_valid(digits)


AADHAAR_RE = re.compile(r"(?<!\d)(\d{4})[ \-]?(\d{4})[ \-]?(\d{4})(?!\d)")


def find_aadhaar_numbers(text: str) -> list[tuple[int, int, str]]:
    """(start, end, digits) for every valid Aadhaar number in text."""
    out = []
    for m in AADHAAR_RE.finditer(text):
        digits = "".join(m.groups())
        if is_valid_aadhaar(digits):
            out.append((m.start(), m.end(), digits))
    return out
