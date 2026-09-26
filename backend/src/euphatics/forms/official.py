"""The RBI standard claim forms, filled on the official pages themselves.

RBI's 2025 Directions (para 27) prescribe standard forms, Annex I-A to I-H. We keep a blank copy of those pages
(templates/rbi_annex_forms.pdf, published by SBI, identical to RBI's annex, no bank branding) and print the
family's details onto it: the wording, tables, fonts and layout are the official ones, not a look-alike.

Positions come from templates/rbi_annex_layout.json (scripts/build_form_layout.py measures the template once):
blanks are underscore runs, boxes are the form's tick boxes, cells are table cells. Values are printed in a
dark blue "ink" so it's obvious what was filled in; anything we don't know stays blank for handwriting.
"""
from __future__ import annotations

import hashlib
import io
import json
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas as rl_canvas

from .annex import payee_account

HERE = Path(__file__).resolve().parent / "templates"
TEMPLATE = HERE / "rbi_annex_forms.pdf"
LAYOUT = HERE / "rbi_annex_layout.json"
INKC = HexColor("#0B2E6B")
FONT = "Helvetica"

# 1-based template pages of each annex
PAGES = {"I-A": [1, 2, 3, 4], "I-B": [5, 6, 7, 8, 9, 10], "I-C": [11, 12, 13], "I-D": [14, 15], "I-E": [16, 17],
         "I-F": [18, 19, 20], "I-G": [21, 22], "I-H": [23, 24]}


@lru_cache(maxsize=1)
def layout() -> dict:
    data = json.loads(LAYOUT.read_text(encoding="utf-8"))
    if hashlib.sha256(TEMPLATE.read_bytes()).hexdigest() != data["sha256"]:
        raise RuntimeError("Form template changed: re-run scripts/build_form_layout.py")
    return data


def available() -> bool:
    return TEMPLATE.exists() and LAYOUT.exists()


# ------------------------------------------------------------------ drawing on one page

@dataclass
class Page:
    n: int
    ops: list = field(default_factory=list)

    @property
    def spec(self) -> dict:
        return layout()["pages"][self.n - 1]

    def blank(self, i: int, value, size: float = 10, pad: float = 2, min_size: float = 6.0) -> "Page":
        if value not in (None, ""):
            b = self.spec["blanks"][i]
            self.ops.append(("line", b["x0"] + pad, b["x1"] - 1, b["base"] - 1.6, str(value), size, min_size))
        return self

    def after_word(self, word: str, value, width: float = 110, size: float = 10, nth: int = 0) -> "Page":
        """Text right after a printed word, e.g. 'Date:' in the letter heading (no underscores there)."""
        if value in (None, ""):
            return self
        hits = [w for w in self.spec["words"] if w["t"] == word]
        if len(hits) > nth:
            w = hits[nth]
            self.ops.append(("line", w["x1"] + 4, w["x1"] + 4 + width, w["base"], str(value), size, 6.0))
        return self

    def cell(self, t: int, row: int, col: int, value, size: float = 8.5) -> "Page":
        if value in (None, ""):
            return self
        rows = self.spec["tables"][t]
        if row >= len(rows) or col >= len(rows[row]) or not rows[row][col]:
            return self
        x0, top, x1, bottom = rows[row][col]
        self.ops.append(("box", x0 + 2.5, top + 1.5, x1 - 2.5, bottom - 1.5, str(value), size))
        return self

    def rows(self, t: int, first_row: int, values: list[list], cols: list[int], size: float = 8.5) -> "Page":
        for r, vals in enumerate(values):
            for c, v in zip(cols, vals):
                self.cell(t, first_row + r, c, v, size)
        return self

    def tick_box(self, i: int, on: bool = True) -> "Page":
        if on:
            b = self.spec["boxes"][i]
            self.ops.append(("tick", b["x0"], b["top"], b["x1"], b["bottom"]))
        return self

    def tick_glyph(self, i: int, on: bool = True) -> "Page":
        if on:
            g = self.spec["glyphs"][i]  # the drawn square sits on the baseline, about 0.72 em tall
            self.ops.append(("tick", g["x0"] + 0.6, g["base"] - 0.74 * g["size"], g["x1"] - 0.6, g["base"] + 0.02 * g["size"]))
        return self

    def strike(self, *phrase: str, nth: int = 0) -> "Page":
        """Strike through a printed phrase (the forms say '*Delete whichever is not applicable')."""
        ws = self.spec["words"]
        found = 0
        for i in range(len(ws) - len(phrase) + 1):
            if all(ws[i + k]["t"] == phrase[k] for k in range(len(phrase))):
                if found == nth:
                    a, b = ws[i], ws[i + len(phrase) - 1]
                    self.ops.append(("strike", a["x0"] - 0.5, b["x1"] + 0.5, a["base"] - 0.27 * a["size"]))
                    return self
                found += 1
        return self


def _fit(text: str, width: float, size: float, min_size: float = 6.0) -> tuple[str, float]:
    s = size
    while s > min_size and stringWidth(text, FONT, s) > width:
        s -= 0.25
    if stringWidth(text, FONT, s) <= width:
        return text, s
    while text and stringWidth(text + "…", FONT, s) > width:
        text = text[:-1]
    return text + "…", s


def _wrap(text: str, width: float, size: float) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if stringWidth(trial, FONT, size) <= width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _overlay(pages: list[Page]) -> bytes:
    L = layout()
    buf = io.BytesIO()
    first = L["pages"][pages[0].n - 1]
    c = rl_canvas.Canvas(buf, pagesize=(first["w"], first["h"]))
    for pg in pages:
        spec = L["pages"][pg.n - 1]
        H = spec["h"]
        c.setPageSize((spec["w"], H))
        c.setFillColor(INKC)
        c.setStrokeColor(INKC)
        for op in pg.ops:
            kind = op[0]
            if kind == "line":
                _, x0, x1, base, text, size, min_size = op
                t, s = _fit(text, x1 - x0, size, min_size)
                c.setFont(FONT, s)
                c.drawString(x0, H - base, t)
            elif kind == "box":
                _, x0, top, x1, bottom, text, size = op
                width, height = x1 - x0, bottom - top
                s = size
                lines = _wrap(text, width, s)
                while s > 5.0 and (len(lines) * s * 1.12 > height or any(stringWidth(l, FONT, s) > width for l in lines)):
                    s -= 0.25
                    lines = _wrap(text, width, s)
                fit = max(1, int(height // (s * 1.12)))
                if len(lines) > fit:  # the official box is small: keep what fits and mark the cut
                    lines = lines[:fit]
                    lines[-1] = _fit(lines[-1] + " …", width, s, s)[0]
                lead = s * 1.12
                y = top + (height - len(lines) * lead) / 2 + s * 0.85
                c.setFont(FONT, s)
                for line in lines:
                    t, _ = _fit(line, width, s, s)
                    c.drawString(x0, H - y, t)
                    y += lead
            elif kind == "tick":
                _, x0, top, x1, bottom = op
                c.setLineWidth(1.3)
                inset = 2.4
                c.line(x0 + inset, H - (bottom - inset), x1 - inset, H - (top + inset))
                c.line(x0 + inset, H - (top + inset), x1 - inset, H - (bottom - inset))
            elif kind == "strike":
                _, x0, x1, y = op
                c.setLineWidth(0.9)
                c.line(x0, H - y, x1, H - y)
        c.showPage()
    c.save()
    return buf.getvalue()


def render(pages: list[Page]) -> bytes:
    """Official template pages, in the order given, with our values printed on them."""
    if not pages:
        return b""
    template = PdfReader(str(TEMPLATE))
    over = PdfReader(io.BytesIO(_overlay(pages)))
    out = PdfWriter()
    for i, pg in enumerate(pages):
        base = template.pages[pg.n - 1]
        out.add_page(base)
        out.pages[-1].merge_page(over.pages[i])
    buf = io.BytesIO()
    out.write(buf)
    return buf.getvalue()


# ------------------------------------------------------------------ values shared by the annexes

def _d(iso: str | None) -> str:
    """DD-MM-YYYY, as Indian bank forms are filled."""
    if not iso:
        return ""
    try:
        return date.fromisoformat(str(iso)[:10]).strftime("%d-%m-%Y")
    except ValueError:
        return str(iso)


def _age_at_death(c: dict) -> str:
    try:
        b, d = date.fromisoformat(c["dob"]), date.fromisoformat(c["dod"])
        return str(d.year - b.year - ((d.month, d.day) < (b.month, b.day)))
    except (KeyError, TypeError, ValueError):
        return ""


def _money(v) -> str:
    from .doc import rupees

    return rupees(v).replace("Rs. ", "") if v not in (None, "") else ""


def _nature(a: dict) -> str:
    t = a.get("accountType") or ""
    if t in ("SB", "CA", "TD", "RD"):
        return {"SB": "SB", "CA": "CA", "TD": "TD", "RD": "RD"}[t]
    return {"bank_deposit": "SB", "term_deposit": "TD"}.get(a.get("assetType"), "")


def _accounts(a: dict) -> tuple[list[list], str]:
    nums = a.get("accountNumbers") or [""]
    amount = a.get("amount")
    rows = []
    for i, n in enumerate(nums[:4]):
        rows.append([f"{i + 1}.", _nature(a), n, _money(amount) if i == 0 and len(nums) == 1 else "",
                     _d(a.get("maturityDate")) if a.get("assetType") == "term_deposit" else ""])
    total = _money(amount) if amount not in (None, "") else ""
    return rows, total


def _law(law: str) -> str:
    """The form asks for the law in a short blank: '(Hindu, Mohammedan, etc.)'."""
    low = (law or "").lower()
    if "hindu" in low:
        return "Hindu"
    if "muslim" in low or "shariat" in low or "mohammedan" in low:
        return "Mohammedan"
    if "parsi" in low:
        return "Parsi (Indian Succession Act)"
    if "indian succession" in low:
        return "Indian Succession Act"
    return law or ""


def _addr(c: dict) -> str:
    return c.get("deceasedAddress") or ""


def _marital_strikes(pg: Page, status: str) -> None:
    s = (status or "").lower()
    if not s:
        return
    options = {"married": ("Married",), "unmarried": ("Unmarried/",), "widow": ("Widow(er)",)}
    keep = "unmarried" if "unmarried" in s else "widow" if "widow" in s else "married" if "married" in s else ""
    if not keep:
        return
    for k, phrase in options.items():
        if k != keep:
            pg.strike(*phrase)


ORDER = {"wife": 0, "husband": 0, "spouse": 0, "son": 1, "daughter": 1, "mother": 2, "father": 2}


def ordered_heirs(people: list[dict]) -> list[dict]:
    """Spouse, then children (eldest first), then parents, then others: the order forms usually list heirs."""
    def key(p):
        age = p.get("age")
        return (ORDER.get(str(p.get("relation", "")).lower(), 3), -(int(age) if str(age or "").isdigit() else 0))
    return sorted(people, key=key)


def _is_locker(a: dict) -> bool:
    return a.get("assetType") in ("locker", "safe_custody")


def _first_page_common(pg: Page, ctx: dict, name_blanks: list[int], claimants_blank: int) -> None:
    c, a = ctx["case"], ctx["asset"]
    pg.after_word("Date:", _d(ctx.get("generatedAt")))
    pg.blank(0, a.get("institution"))
    pg.blank(1, a.get("branch"))
    for i in name_blanks:
        pg.blank(i, c.get("deceasedName"))
    names = ", ".join(p.get("fullName", "") for p in ctx.get("claimants") or [])
    pg.blank(claimants_blank, names)


# ------------------------------------------------------------------ Annex I-A (nominee / survivor)

def annex_I_A(ctx: dict) -> list[Page]:
    c, a = ctx["case"], ctx["asset"]
    nominees = ctx.get("nominees") or ctx.get("claimants") or []
    p1, p2, p3 = Page(1), Page(2), Page(3)
    p1.after_word("Date:", _d(ctx.get("generatedAt")))
    p1.blank(0, a.get("institution")).blank(1, a.get("branch")).blank(2, c.get("deceasedName"))
    p1.blank(3, ", ".join(p.get("fullName", "") for p in nominees))
    p1.blank(4, c.get("deceasedName")).blank(5, _d(c.get("dod")))
    p1.strike("is", "missing/", "not", "traceable", "since")
    p1.blank(7, ", ".join(x for x in [_d(c.get("dod")), c.get("placeOfDeath")] if x))
    p1.blank(8, c.get("deathCertNo"), size=8.5, min_size=4.8).blank(9, _d(c.get("deathCertDate")), size=8.5).blank(10, c.get("deathCertAuthority"), size=8.5)
    p1.blank(11, _age_at_death(c))
    _marital_strikes(p1, c.get("maritalStatus"))
    p1.blank(12, _addr(c)).blank(13, c.get("deceasedCity")).blank(14, c.get("deceasedPin")).blank(15, c.get("deceasedState"))
    p1.blank(16, "India" if c.get("deceasedState") else "")

    rows, total = _accounts(a)
    if not _is_locker(a):
        p2.rows(0, 1, [r[1:] for r in rows], [1, 2, 3, 4]).cell(0, 5, 3, total)
    else:
        p2.blank(0, a.get("lockerNo")).blank(1, "Jointly" if a.get("joint") else "Singly")
        p2.blank(3, a.get("receiptNo"))
    pay = ctx.get("payment") or {}
    pay_rows = []
    for i, p in enumerate(nominees[:4]):
        acct = payee_account(p, pay, i == 0)
        bank = " ".join(x for x in [acct.get("bankName"), acct.get("accountNumber"), acct.get("ifsc") and f"IFSC {acct['ifsc']}"] if x)
        pay_rows.append([p.get("fullName", ""), p.get("address", ""), p.get("phone", ""), p.get("email", ""), bank])
    if _is_locker(a):
        p2.rows(2, 2, [[r[0], r[1], r[2], r[3]] for r in pay_rows], [1, 2, 3, 4])
    else:
        p2.rows(1, 2, pay_rows, [1, 2, 3, 4, 5])
    p3.rows(1, 1, [[p.get("fullName", "")] for p in nominees[:4]], [1])
    return [p1, p2, p3, Page(4)]


# ------------------------------------------------------------------ Annex I-B (legal heirs)

def annex_I_B(ctx: dict) -> list[Page]:
    c, a, route = ctx["case"], ctx["asset"], ctx["route"]
    claimants = ctx.get("claimants") or []
    non_claimants = ctx.get("nonClaimants") or []
    heirs = ordered_heirs(ctx.get("heirs") or (claimants + non_claimants))
    p5, p6, p7, p8, p9 = Page(5), Page(6), Page(7), Page(8), Page(9)
    _first_page_common(p5, ctx, [2, 4], 3)
    p5.blank(5, _d(c.get("dod")))
    p5.strike("is", "missing/", "not", "traceable", "since")
    p5.blank(7, ", ".join(x for x in [_d(c.get("dod")), c.get("placeOfDeath")] if x))
    p5.blank(8, c.get("deathCertNo"), size=8.5, min_size=4.8).blank(9, _d(c.get("deathCertDate")), size=8.5).blank(10, c.get("deathCertAuthority"), size=8.5)
    p5.blank(11, _age_at_death(c))
    _marital_strikes(p5, c.get("maritalStatus"))
    p5.blank(12, _addr(c)).blank(13, c.get("deceasedCity")).blank(14, c.get("deceasedPin")).blank(15, c.get("deceasedState"))
    p5.blank(16, "India" if c.get("deceasedState") else "")
    p5.blank(17, c.get("religion")).blank(18, _law(c.get("successionLaw")), size=9)
    heir_rows = []
    for p in heirs[:4]:
        contact = " / ".join(x for x in [p.get("phone"), p.get("email")] if x)
        signs = "Yes" if p.get("isNonClaimantHeir") else "No"
        heir_rows.append([f"{p.get('fullName', '')}, {p.get('address', '')}".strip(", "), p.get("age", ""), p.get("relation", ""), contact, signs])
    p5.rows(0, 1, heir_rows, [1, 2, 3, 4, 5])

    minors = [p for p in heirs if str(p.get("age") or "").isdigit() and int(p["age"]) < 18]
    p6.rows(0, 1, [[p.get("fullName", ""), _d(p.get("dob")), p.get("guardianName", ""), p.get("guardianRelation", ""), p.get("address", ""), p.get("phone", "")] for p in minors[:2]], [1, 2, 3, 4, 5, 6])
    rows, total = _accounts(a)
    if _is_locker(a):
        p6.blank(0, a.get("lockerNo")).blank(1, "Jointly" if a.get("joint") else "Singly").blank(3, a.get("receiptNo"))
    else:
        p6.rows(1, 1, [r[1:] for r in rows], [1, 2, 3, 4]).cell(1, 5, 3, total)

    lhc = bool(a.get("legalHeirCertificate"))
    will = c.get("will") == "yes" or bool(a.get("will"))
    documents = {d.get("id") for d in route.get("documents") or []}
    # 4.2: declare "no will" only when the family said so; 4.3: the basis of the claim
    p7.tick_box(0, c.get("will") == "no" and not a.get("will")).tick_box(1, will)
    if lhc:
        p7.tick_box(7)
    elif "succession_certificate" in documents:
        p7.tick_box(5)
    elif documents & {"heirship_declaration_I_E", "heirship_affidavit_I_E"}:
        p7.tick_box(8)
    pay = ctx.get("payment") or {}
    pay_rows = []
    for i, p in enumerate(claimants[:4]):
        acct = payee_account(p, pay, i == 0)
        if acct:
            pay_rows.append([p.get("fullName", ""), " ".join(x for x in [acct.get("bankName"), acct.get("accountNumber")] if x), acct.get("ifsc", ""), acct.get("branch", "")])
    p7.rows(0, 1, pay_rows, [1, 2, 3, 4])

    if _is_locker(a):
        p8.rows(1, 1, [[p.get("fullName", "")] for p in claimants[:4]], [1])
    p8.tick_glyph(0).tick_glyph(1)
    p8.tick_glyph(2, will).tick_glyph(4, "succession_certificate" in documents)
    p8.tick_glyph(6, lhc).tick_glyph(7, not lhc and bool(documents & {"heirship_declaration_I_E", "heirship_affidavit_I_E"}))
    p8.tick_glyph(8, "indemnity_I_C" in documents)
    p8.tick_glyph(10, bool(non_claimants))
    p9.rows(0, 1, [[p.get("fullName", "")] for p in claimants[:4]], [1])
    p9.blank(2, c.get("deceasedCity"))
    return [p5, p6, p7, p8, p9, Page(10)]


# ------------------------------------------------------------------ Annex I-C (indemnity / surety)

def annex_I_C(ctx: dict, with_surety: bool = False) -> list[Page]:
    c, a = ctx["case"], ctx["asset"]
    claimants = ctx.get("claimants") or []
    p11, p12 = Page(11), Page(12)
    p11.after_word("Date:", _d(ctx.get("generatedAt")))
    p11.blank(0, a.get("institution")).blank(1, a.get("branch"))
    for i, p in enumerate(claimants[:4]):
        p11.blank(2 + i, f"{p.get('fullName', '')}, {p.get('address', '')}".strip(", "))
    amount = a.get("amount")
    if amount not in (None, ""):
        p11.blank(6, f"{_money(amount)} ({_words(amount)} only)", size=8.5)
    p11.blank(8, c.get("deceasedName"))  # the name blank wraps onto the next line; use the wide part
    rows, total = _accounts(a)
    p11.rows(0, 1, [r[1:] for r in rows], [1, 2, 3, 4]).cell(0, 5, 3, total)
    p11.blank(9, ", ".join(p.get("fullName", "") for p in claimants))
    for i, p in enumerate(claimants[:4]):
        p12.blank(i, p.get("fullName", ""))
    pages = [p11, p12]
    if with_surety:
        pages.append(Page(13))
    return pages


# ------------------------------------------------------------------ Annex I-D (no objection)

def annex_I_D(ctx: dict) -> list[Page]:
    c, a = ctx["case"], ctx["asset"]
    claimants = ctx.get("claimants") or []
    others = ctx.get("nonClaimants") or []
    p14, p15 = Page(14), Page(15)
    p14.after_word("Date:", _d(ctx.get("generatedAt")))
    p14.blank(0, a.get("institution")).blank(1, a.get("branch")).blank(2, c.get("deceasedName"))
    rows, total = _accounts(a)
    if _is_locker(a):
        p14.blank(3, a.get("lockerNo")).blank(5, a.get("receiptNo"))
    else:
        p14.rows(0, 1, [r[1:] for r in rows], [1, 2, 3, 4]).cell(0, 5, 3, total)
    p14.blank(7, c.get("deceasedName")).blank(8, c.get("deceasedName"))
    for i, p in enumerate(claimants[:4]):
        p14.blank(9 + i, p.get("fullName", ""))
    p15.rows(0, 1, [[p.get("fullName", ""), p.get("age", "")] for p in others[:4]], [1, 2])
    return [p14, p15]


# ------------------------------------------------------------------ Annex I-E (independent declaration)

def annex_I_E(ctx: dict) -> list[Page]:
    c, a = ctx["case"], ctx["asset"]
    decl = ctx.get("declarant") or {}
    heirs = ordered_heirs(ctx.get("heirs") or ((ctx.get("claimants") or []) + (ctx.get("nonClaimants") or [])))
    p16 = Page(16)
    p16.blank(0, decl.get("fullName")).blank(1, decl.get("sdo")).blank(2, decl.get("address"), size=9)
    p16.blank(3, c.get("deceasedName")).blank(4, _d(c.get("dod"))).blank(5, c.get("placeOfDeath"))
    p16.blank(6, decl.get("yearsKnown"))
    p16.rows(0, 1, [[p.get("fullName", ""), p.get("age", ""), p.get("relation", "")] for p in heirs[:4]], [1, 2, 3])
    bank = (a.get("institution") or "").removesuffix(" Bank").removesuffix(" bank")
    p16.blank(7, bank).blank(8, a.get("branch")).blank(9, bank).blank(10, a.get("branch"))
    return [p16, Page(17)]


FILLERS = {"I-A": annex_I_A, "I-B": annex_I_B, "I-C": annex_I_C, "I-D": annex_I_D, "I-E": annex_I_E}


def _words(amount) -> str:
    """Rupees in words, Indian system (lakh, crore)."""
    n = int(round(float(amount)))
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
            "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def two(x):
        return ones[x] if x < 20 else (tens[x // 10] + (" " + ones[x % 10] if x % 10 else ""))

    def three(x):
        h, r = divmod(x, 100)
        return ((ones[h] + " Hundred" + (" " if r else "")) if h else "") + (two(r) if r else "")

    if n == 0:
        return "Rupees Zero"
    parts = []
    crore, n = divmod(n, 10_000_000)
    lakh, n = divmod(n, 100_000)
    thousand, n = divmod(n, 1000)
    if crore:
        parts.append(three(crore) + " Crore")
    if lakh:
        parts.append(two(lakh) + " Lakh")
    if thousand:
        parts.append(two(thousand) + " Thousand")
    if n:
        parts.append(three(n))
    return "Rupees " + " ".join(parts)


def fill(forms: list[str], ctx: dict, with_surety: bool = False) -> bytes:
    """Official pages for the given annexes, in order, with the case filled in."""
    pages: list[Page] = []
    for f in forms:
        if f == "I-D" and not ctx.get("nonClaimants"):
            continue
        if f == "I-C":
            pages += annex_I_C(ctx, with_surety=with_surety)
        elif f in FILLERS:
            pages += FILLERS[f](ctx)
        elif f in PAGES:  # I-F, I-G, I-H are filled at the branch (inventory, delivery); include them blank
            pages += [Page(n) for n in PAGES[f]]
    return render(pages)
