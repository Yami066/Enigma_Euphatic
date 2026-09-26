"""Passbook first page (photo) → bank account details, from Textract text lines.

Deterministic on purpose: regexes and the bank dictionary, no model. The family confirms every field
before it is saved, so a wrong guess costs a correction, never a wrong claim.
"""
from __future__ import annotations

import re

from .detectors import match
from .statement import dictionary, norm

IFSC = re.compile(r"(?<![A-Z0-9])([A-Z]{4})\s?0\s?([A-Z0-9]{6})(?![A-Z0-9])")
ACCOUNT_LABEL = re.compile(r"\b(A\s*/\s*C|ACCOUNT|ACCT|A/C\.?)\s*(NO|NUMBER|NUM)?\.?\b", re.I)
DIGITS = re.compile(r"(?<!\d)(\d[\d ]{7,20}\d)(?!\d)")
CUSTOMER = re.compile(r"\b(CIF|CUST(?:OMER)?)\s*(?:NO|NUMBER|ID)?\.?\s*[:\-]?\s*(\d[A-Z0-9]{4,19}|[A-Z]\d{4,19})\b", re.I)
LABELLED = re.compile(r"^\s*(NAME|BRANCH|NOMINEE|NOMINATION|MODE OF OPERATION|OPERATION)\b\.?\s*[:\-]?\s*(.*)$", re.I)


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s)


def _account_number(lines: list[str]) -> str:
    # 1) a number on the same line as, or the line after, an 'A/c No' label
    for i, line in enumerate(lines):
        if ACCOUNT_LABEL.search(line) and not re.search(r"\bTYPE\b", line, re.I):
            for cand in (line, lines[i + 1] if i + 1 < len(lines) else ""):
                for m in DIGITS.finditer(cand):
                    d = _digits(m.group(1))
                    if 9 <= len(d) <= 18:
                        return d
    # 2) otherwise the longest 9-18 digit run that isn't a phone number or MICR
    best = ""
    for line in lines:
        if re.search(r"\b(MICR|MOB|PHONE|TEL|PIN)\b", line, re.I):
            continue
        for m in DIGITS.finditer(line):
            d = _digits(m.group(1))
            if 11 <= len(d) <= 18 and len(d) > len(best):
                best = d
    return best


def rows_from_words(words: list[dict]) -> list[str]:
    """Rebuild printed rows from word boxes (Textract's LINE order can run down a column, splitting
    'Branch' from ': KORAMANGALA'). Words whose vertical centres are close belong to the same row."""
    items = sorted(words, key=lambda w: w["box"]["top"] + w["box"]["height"] / 2)
    if not items:
        return []
    heights = sorted(w["box"]["height"] for w in items)
    tol = heights[len(heights) // 2] * 0.6
    rows: list[list[dict]] = []
    for w in items:
        c = w["box"]["top"] + w["box"]["height"] / 2
        if rows and abs(c - rows[-1][0]["_c"]) <= tol:
            rows[-1].append({**w, "_c": c})
        else:
            rows.append([{**w, "_c": c}])
    return [" ".join(x["text"] for x in sorted(r, key=lambda x: x["box"]["left"])) for r in rows]


def parse_passbook_lines(lines: list[str]) -> dict:
    text = "\n".join(lines)
    up = text.upper()
    out: dict = {}

    for line in lines:  # prefer the line labelled IFSC; OCR sometimes adds a space inside the code
        m = IFSC.search(line.upper())
        if m and ("IFSC" in line.upper() or "ifsc" not in out):
            out["ifsc"] = f"{m.group(1)}0{m.group(2)}"
            if "IFSC" in line.upper():
                break

    bank, _ = match("banks", norm(up), fuzzy=False)
    if bank:
        out["institution"] = bank["name"]
    else:
        cand = next((l.strip() for l in lines if re.search(r"\bBANK\b", l, re.I) and len(l.strip()) < 60), "")
        if cand:
            out["institution"] = re.sub(r"\s+", " ", cand).title()
    if any(f" {norm(mk)} " in f" {norm(up)} " for mk in dictionary()["coop_markers"]):
        out["bankType"] = "cooperative"

    acct = _account_number(lines)
    if acct:
        out["accountNumber"] = acct

    m = CUSTOMER.search(text)
    if m:
        out["customerId"] = m.group(2)

    for i, line in enumerate(lines):
        lm = LABELLED.match(line)
        if not lm:
            continue
        label, value = lm.group(1).upper(), lm.group(2).strip(" :.-")
        if not value and i + 1 < len(lines):
            value = lines[i + 1].strip()
        if label == "NAME" and value and "holderName" not in out:
            out["holderName"] = re.sub(r"^(MR|MRS|MS|SHRI|SMT)\.?\s+", "", value, flags=re.I).title()
        elif label == "BRANCH" and value and "branch" not in out:
            out["branch"] = value.title()
        elif label in {"NOMINEE", "NOMINATION"} and value:
            if re.search(r"\b(NOT|NO|NIL|NA|N/A)\b", value, re.I):
                out["nomination"] = "none"
            else:
                out["nomination"] = "nominee"
                if re.search(r"[A-Za-z]{3}", value) and not re.search(r"REGISTERED|AVAILABLE|YES", value, re.I):
                    out["nomineeName"] = value.title()
        elif label in {"MODE OF OPERATION", "OPERATION"} and re.search(r"SURVIVOR|E\s*OR\s*S|EITHER", value, re.I):
            out["nomination"] = out.get("nomination") or "survivor"

    if re.search(r"\b(FIXED|TERM)\s+DEPOSIT\b|\bFD\b|\bRECURRING\b|\bRD\b", up):
        out["assetType"], out["accountType"] = "term_deposit", "TD"
    elif re.search(r"\bCURRENT\b", up):
        out["assetType"], out["accountType"] = "bank_deposit", "CA"
    elif re.search(r"\bSAVING|\bSB\b|\bS\.B\.", up):
        out["assetType"], out["accountType"] = "bank_deposit", "SB"
    if re.search(r"EITHER\s+OR\s+SURVIVOR|E\s*OR\s*S\b", up) and "nomination" not in out:
        out["nomination"] = "survivor"
    return out
