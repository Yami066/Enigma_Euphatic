"""Bank statement parsers: CSV and digital PDF → transactions.

No OCR here. Digital PDFs (the kind net banking produces) carry a text layer,
so pdfplumber reads them directly and cheaply. Scanned statements go through
Textract in the AWS handler and come back here as plain text lines
(parse_text_lines).
"""
from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).parent / "data"

MONTHS = {m: i for i, m in enumerate(
    ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], start=1)}

DATE_RES = [
    (re.compile(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b"), "dmy"),
    (re.compile(r"^(\d{4})-(\d{2})-(\d{2})\b"), "iso"),
    (re.compile(r"^(\d{1,2})[ \-]([A-Za-z]{3})[a-z]*[ \-,]+(\d{4})\b"), "dMy"),
    (re.compile(r"^(\d{1,2})[ \-]([A-Za-z]{3})[ \-](\d{2})\b"), "dMy2"),
    (re.compile(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})\b"), "dmy2"),
]
AMOUNT_RE = re.compile(r"^\(?-?(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{1,2}\)?(?:\s?(?:CR|DR|Cr|Dr|cr|dr))?$")
AMOUNT_ANY = re.compile(r"(?<![\w.,])(\d{1,3}(?:,\d{2,3})+\.\d{1,2}|\d+\.\d{1,2})(?:\s?(CR|DR|Cr|Dr))?(?![\w])")

HEADER_WORDS = {
    "date": {"date", "txn", "transaction"},
    "narration": {"narration", "description", "particulars", "details", "remarks", "transaction details"},
    "debit": {"withdrawal", "withdrawals", "debit", "debits", "dr", "withdrawal(dr)", "debit(dr)"},
    "credit": {"deposit", "deposits", "credit", "credits", "cr", "deposit(cr)", "credit(cr)"},
    "balance": {"balance", "closing"},
}


@dataclass
class Txn:
    date: str
    narration: str
    debit: float | None = None
    credit: float | None = None
    balance: float | None = None
    page: int | None = None

    @property
    def amount(self) -> float:
        return float(self.credit or self.debit or 0.0)

    @property
    def direction(self) -> str:
        return "credit" if self.credit else "debit"


@dataclass
class Statement:
    source: str
    bank_name: str | None = None
    bank_type: str | None = None
    holder: str | None = None
    account_last4: str | None = None
    txns: list[Txn] = field(default_factory=list)
    unparsed: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["txn_count"] = len(self.txns)
        return d


@lru_cache(maxsize=1)
def dictionary() -> dict:
    with open(DATA / "dictionary.json", encoding="utf-8") as fh:
        return json.load(fh)


def norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", s.upper()).strip()


def parse_date(s: str) -> date | None:
    s = s.strip()
    for rx, kind in DATE_RES:
        m = rx.match(s)
        if not m:
            continue
        a, b, c = m.groups()
        try:
            if kind == "iso":
                return date(int(a), int(b), int(c))
            if kind == "dmy":
                return date(int(c), int(b), int(a))
            if kind == "dmy2":
                return date(2000 + int(c), int(b), int(a))
            mon = MONTHS.get(b[:3].upper())
            if not mon:
                continue
            year = int(c) if kind == "dMy" else 2000 + int(c)
            return date(year, mon, int(a))
        except ValueError:
            continue
    return None


def parse_amount(tok: str) -> tuple[float, str | None] | None:
    t = tok.strip()
    if not AMOUNT_RE.match(t):
        return None
    suffix = None
    m = re.search(r"(CR|DR)$", t, re.I)
    if m:
        suffix = m.group(1).upper()
        t = t[: m.start()].strip()
    neg = t.startswith("-") or (t.startswith("(") and t.endswith(")"))
    t = t.strip("()-")
    val = float(t.replace(",", ""))
    return (-val if neg else val), suffix


# ---------------------------------------------------------------- metadata

BANK_NAME_RE = re.compile(r"([A-Z][A-Z&.'\- ]{1,60}?\bBANK\b(?:\s+(?:LTD|LIMITED))?\.?)")


def extract_meta(text: str, stmt: Statement) -> None:
    """Read bank name, holder and account from the statement's *header* text only.

    Callers pass the lines above the transaction table, so a narration such as
    'SBI MF SIP' can never be mistaken for the statement's own bank.
    """
    up = text.upper()
    d = dictionary()
    coop_norms = [f" {norm(mk)} " for mk in d["coop_markers"]]
    for line in up.splitlines():
        if "BANK" not in line or re.search(r"STATEMENT OF|PAGE \d", line) and "BANK" not in line.split("STATEMENT")[0]:
            continue
        m = BANK_NAME_RE.search(line)
        if not m:
            continue
        seg = " ".join(m.group(1).split()).strip(" .")
        seg_n = f" {norm(seg)} "
        for bank in d["banks"]:
            if any(f" {norm(a)} " in seg_n for a in bank["aliases"]):
                stmt.bank_name, stmt.bank_type = bank["name"], bank["type"]
                break
        if not stmt.bank_name:
            stmt.bank_name = seg.title().replace("Ltd", "Ltd.").replace("..", ".")
            stmt.bank_type = "cooperative" if any(c in seg_n for c in coop_norms) else None
        break
    m = re.search(r"(?:ACCOUNT\s+HOLDER|CUSTOMER\s+NAME|NAME)\s*[:\-]\s*([A-Z][A-Z .]{2,60})", up)
    if m:
        stmt.holder = " ".join(m.group(1).split()).title()
    m = re.search(r"(?:A/?C|ACCOUNT)\s*(?:NO\.?|NUMBER)?\s*[:\-]?\s*[X*\d\s]*?(\d{4})\b", up)
    if m:
        stmt.account_last4 = m.group(1)


# ---------------------------------------------------------------- CSV

def _col_index(header: list[str], keys: set[str]) -> int | None:
    for i, h in enumerate(header):
        hl = h.strip().lower()
        if any(k == hl or hl.startswith(k) or k in hl.split() for k in keys):
            return i
    return None


def parse_csv(data: bytes) -> Statement:
    text = data.decode("utf-8-sig", errors="ignore")
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
        delim = dialect.delimiter
    except csv.Error:
        delim = ","
    rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    stmt = Statement(source="csv")
    header_idx = None
    for i, row in enumerate(rows[:40]):
        low = [c.strip().lower() for c in row]
        if any("date" in c for c in low) and any(any(k in c for k in HEADER_WORDS["narration"]) for c in low):
            header_idx = i
            break
    preamble = "\n".join(",".join(r) for r in rows[: header_idx or 0])
    extract_meta(preamble, stmt)
    if header_idx is None:
        stmt.unparsed = [",".join(r) for r in rows]
        return stmt
    header = rows[header_idx]
    ci = {k: _col_index(header, v) for k, v in HEADER_WORDS.items()}
    amount_col = _col_index(header, {"amount"})
    type_col = _col_index(header, {"type", "dr/cr", "cr/dr"})
    for row in rows[header_idx + 1:]:
        if not row or ci["date"] is None or ci["date"] >= len(row):
            continue
        d = parse_date(row[ci["date"]])
        if not d:
            if any(c.strip() for c in row):
                stmt.unparsed.append(delim.join(row))
            continue
        narr = row[ci["narration"]].strip() if ci["narration"] is not None and ci["narration"] < len(row) else ""

        def num(idx):
            if idx is None or idx >= len(row):
                return None
            v = row[idx].replace(",", "").strip()
            try:
                return float(v) if v else None
            except ValueError:
                return None

        debit, credit, bal = num(ci["debit"]), num(ci["credit"]), num(ci["balance"])
        if debit is None and credit is None and amount_col is not None:
            amt = num(amount_col)
            kind = (row[type_col].strip().upper() if type_col is not None and type_col < len(row) else "")
            if amt is not None:
                if kind.startswith("C"):
                    credit = amt
                else:
                    debit = amt
        stmt.txns.append(Txn(date=d.isoformat(), narration=narr, debit=debit or None, credit=credit or None, balance=bal))
    return stmt


# ---------------------------------------------------------------- PDF

def _group_lines(words: list[dict], tol: float = 2.5) -> list[list[dict]]:
    lines: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if lines and abs(lines[-1][0]["top"] - w["top"]) <= tol:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(line, key=lambda w: w["x0"]) for line in lines]


def _detect_header(line: list[dict]) -> dict[str, float] | None:
    texts = [w["text"].strip().lower().strip(".:") for w in line]
    joined = " ".join(texts)
    if "date" not in joined or "balance" not in joined:
        return None
    cols: dict[str, float] = {}
    for w, t in zip(line, texts):
        cx = (w["x0"] + w["x1"]) / 2
        for key in ("debit", "credit", "balance"):
            if t in HEADER_WORDS[key] or any(t.startswith(k) for k in HEADER_WORDS[key] if len(k) > 2):
                cols.setdefault(key, cx)
    return cols if {"debit", "credit", "balance"} <= cols.keys() else None


def _assign(amounts: list[tuple[float, float, str | None]], cols: dict[str, float] | None):
    """amounts: (x_center, value, suffix). Returns debit, credit, balance."""
    debit = credit = balance = None
    if cols:
        for cx, val, suffix in amounts:
            key = min(("debit", "credit", "balance"), key=lambda k: abs(cols[k] - cx))
            if key == "debit":
                debit = abs(val)
            elif key == "credit":
                credit = abs(val)
            else:
                balance = val
        return debit, credit, balance
    if len(amounts) >= 2:
        balance = amounts[-1][1]
        val, suffix = amounts[-2][1], amounts[-2][2]
        if suffix == "CR":
            credit = abs(val)
        else:
            debit = abs(val)
    elif amounts:
        val, suffix = amounts[0][1], amounts[0][2]
        if suffix == "CR":
            credit = abs(val)
        else:
            debit = abs(val)
    return debit, credit, balance


def _fix_directions_by_balance(txns: list[Txn]) -> None:
    """If a layout had no usable header, trust the running balance for direction."""
    for prev, cur in zip(txns, txns[1:]):
        if prev.balance is None or cur.balance is None:
            continue
        delta = round(cur.balance - prev.balance, 2)
        amt = cur.amount
        if amt and abs(abs(delta) - amt) < 0.02:
            if delta > 0 and not cur.credit:
                cur.credit, cur.debit = amt, None
            elif delta < 0 and not cur.debit:
                cur.debit, cur.credit = amt, None


def parse_pdf(data: bytes) -> Statement:
    import pdfplumber  # imported lazily: heavy, and only the scan Lambda needs it

    stmt = Statement(source="pdf")
    header_cols: dict[str, float] | None = None
    current: Txn | None = None
    pre_header: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            # Drop watermarks ("COPY", "SAMPLE"): rotated or very large characters.
            clean = page.filter(lambda o: o.get("object_type") != "char"
                                or (o.get("upright", True) and float(o.get("size", 0)) < 20))
            words = clean.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False)
            for line in _group_lines(words):
                text = " ".join(w["text"] for w in line)
                cols = _detect_header(line)
                if cols:
                    if header_cols is None:
                        extract_meta("\n".join(pre_header), stmt)
                    header_cols = cols
                    current = None
                    continue
                if header_cols is None and pno == 1:
                    pre_header.append(text)
                d = parse_date(text)
                amounts = []
                narr_words = []
                seen_date = False
                for w in line:
                    parsed = parse_amount(w["text"])
                    if parsed is not None and (d is not None or current is not None):
                        amounts.append(((w["x0"] + w["x1"]) / 2, parsed[0], parsed[1]))
                        continue
                    if d is not None and not seen_date and parse_date(w["text"]):
                        seen_date = True
                        continue
                    if d is not None and parse_date(w["text"]):
                        continue  # value date column
                    narr_words.append(w["text"])
                if d is not None and amounts:
                    debit, credit, balance = _assign(amounts, header_cols)
                    current = Txn(date=d.isoformat(), narration=" ".join(narr_words).strip(),
                                  debit=debit, credit=credit, balance=balance, page=pno)
                    stmt.txns.append(current)
                elif current is not None and d is None and not amounts and text.strip() and len(text) < 120 \
                        and not re.search(r"(?i)page \d|statement|generated|opening balance|closing balance", text):
                    current.narration = f"{current.narration} {text.strip()}".strip()
                elif text.strip():
                    stmt.unparsed.append(text.strip())
    if header_cols is None:
        extract_meta("\n".join(pre_header[:15]), stmt)
        _fix_directions_by_balance(stmt.txns)
    return stmt


def parse_text_lines(lines: list[str], source: str = "textract") -> Statement:
    """Fallback for OCR output: one transaction per line with a leading date."""
    stmt = Statement(source=source)
    extract_meta("\n".join(lines[:15]), stmt)
    for raw in lines:
        d = parse_date(raw)
        if not d:
            if stmt.txns and raw.strip() and not AMOUNT_ANY.search(raw):
                stmt.txns[-1].narration += " " + raw.strip()
            else:
                stmt.unparsed.append(raw)
            continue
        found = [(m.start(), float(m.group(1).replace(",", "")), (m.group(2) or "").upper() or None)
                 for m in AMOUNT_ANY.finditer(raw)]
        body = AMOUNT_ANY.sub(" ", raw)
        body = re.sub(r"^\S+\s*", "", body)  # drop leading date
        narration = " ".join(body.split())
        if re.search(r"(?i)\b(OPENING|B/F|BROUGHT FORWARD)\b", narration) and found:
            stmt.txns.append(Txn(date=d.isoformat(), narration=narration, balance=found[-1][1]))
            continue
        debit, credit, balance = _assign([(float(pos), v, s) for pos, v, s in found], None)
        if not any(s for _, _, s in found):
            if re.search(r"\b(ACH|NACH|ECS)\s*C\b|\bCR\b|/CR/", narration.upper()) and debit:
                credit, debit = debit, None
        stmt.txns.append(Txn(date=d.isoformat(), narration=narration, debit=debit, credit=credit, balance=balance))
    _fix_directions_by_balance(stmt.txns)
    stmt.txns = [t for t in stmt.txns if t.debit or t.credit]
    return stmt


def parse_statement(data: bytes, filename: str = "", content_type: str = "") -> Statement:
    name = filename.lower()
    if name.endswith(".csv") or "csv" in content_type:
        return parse_csv(data)
    if data[:5] == b"%PDF-" or name.endswith(".pdf") or "pdf" in content_type:
        return parse_pdf(data)
    return parse_text_lines(data.decode("utf-8", errors="ignore").splitlines(), source="text")
