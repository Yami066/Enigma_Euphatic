"""Measures the official RBI Annex template once and stores the positions as data.

Output: backend/src/euphatics/forms/templates/rbi_annex_layout.json with, per page, the blanks (underscore runs),
tick boxes (drawn squares and '☐' glyphs), table cells and words. forms/official.py prints each value onto one of
these, so the pack uses the official pages themselves: same wording, layout, tables and fonts.

    python scripts/build_form_layout.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "backend/src/euphatics/forms/templates/rbi_annex_forms.pdf"
OUT = TEMPLATE.with_name("rbi_annex_layout.json")
SOURCE = ("https://sbi.bank.in/documents/16012/22770835/"
          "18122025_Revised+Deceased+Claim+Forms+for+Deposits+and+Safe+Deposit+Lockers.pdf")


def r1(v: float) -> float:
    return round(float(v), 1)


def base(page, c) -> float:
    """Baseline (from the page top) from the glyph's text matrix. The template's font reports glyph boxes
    that sit well below the drawn glyphs, so top/bottom alone would put our text on top of the rules."""
    return page.height - c["matrix"][5]


def blanks(page) -> list[dict]:
    chars = sorted(page.chars, key=lambda c: (round(c["top"]), c["x0"]))
    runs, cur = [], None
    for c in chars:
        if c["text"] == "_":
            if cur and abs(c["top"] - cur["top"]) < 2 and c["x0"] - cur["x1"] < 2.5:
                cur["x1"] = c["x1"]
            else:
                cur = {"x0": c["x0"], "x1": c["x1"], "top": c["top"], "bottom": c["bottom"], "base": base(page, c),
                       "size": c["size"]}
                runs.append(cur)
    return [{k: r1(v) for k, v in r.items()} for r in runs]


def boxes(page) -> list[dict]:
    out = []
    for r in page.rects:
        w, h = r["x1"] - r["x0"], r["bottom"] - r["top"]
        if 6 <= w <= 16 and 6 <= h <= 16 and abs(w - h) < 3:
            out.append({"x0": r1(r["x0"]), "x1": r1(r["x1"]), "top": r1(r["top"]), "bottom": r1(r["bottom"])})
    return sorted(out, key=lambda b: (round(b["top"]), b["x0"]))


def glyphs(page) -> list[dict]:
    """'☐' characters used as tick boxes, with the text that follows on the same line."""
    lines = page.extract_text_lines()
    out = []
    for c in page.chars:
        if c["text"] == "☐":
            line = next((l["text"] for l in lines if abs(l["top"] - c["top"]) < 3), "")
            out.append({"x0": r1(c["x0"]), "x1": r1(c["x1"]), "top": r1(c["top"]), "bottom": r1(c["bottom"]),
                        "base": r1(base(page, c)), "size": r1(c["size"]), "line": line.replace("☐", "").strip()})
    return sorted(out, key=lambda b: (round(b["top"]), b["x0"]))


def tables(page) -> list[list[list]]:
    out = []
    for tb in page.find_tables():
        out.append([[[r1(v) for v in c] if c else None for c in row.cells] for row in tb.rows])
    return out


def words(page) -> list[dict]:
    out = []
    for w in page.extract_words():
        first = next((c for c in page.chars if abs(c["x0"] - w["x0"]) < 0.5 and abs(c["top"] - w["top"]) < 0.5), None)
        out.append({"t": w["text"], "x0": r1(w["x0"]), "x1": r1(w["x1"]), "top": r1(w["top"]), "bottom": r1(w["bottom"]),
                    "base": r1(base(page, first)) if first else r1(w["top"] + 0.313 * (w["bottom"] - w["top"])),
                    "size": r1(first["size"]) if first else r1(w["bottom"] - w["top"])})
    return out


def main() -> None:
    data = TEMPLATE.read_bytes()
    layout = {"template": TEMPLATE.name, "sha256": hashlib.sha256(data).hexdigest(), "source": SOURCE,
              "note": "RBI standard formats (Annex I-A to I-H of the 2025 Directions), blank copy published by SBI.",
              "pages": []}
    with pdfplumber.open(TEMPLATE) as pdf:
        for n, page in enumerate(pdf.pages, 1):
            layout["pages"].append({"n": n, "w": r1(page.width), "h": r1(page.height), "blanks": blanks(page),
                                    "boxes": boxes(page), "glyphs": glyphs(page), "tables": tables(page),
                                    "words": words(page)})
    OUT.write_text(json.dumps(layout, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(layout['pages'])} pages, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
