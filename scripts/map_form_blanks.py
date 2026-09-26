"""Lists the blanks (underscore runs) and table cells on each page of the official RBI Annex template.

Used once while writing backend/src/euphatics/forms/official_spec.py: every field there points at a blank or a
cell found here, so the family's details land exactly on the official form's lines and boxes.

    python scripts/map_form_blanks.py [first_page] [last_page]
"""
from __future__ import annotations

import sys
from pathlib import Path

import pdfplumber

TEMPLATE = Path(__file__).resolve().parents[1] / "backend/src/euphatics/forms/templates/rbi_annex_forms.pdf"


def blanks(page) -> list[dict]:
    """Runs of '_' characters on one text line, with the text just before them."""
    chars = sorted(page.chars, key=lambda c: (round(c["top"]), c["x0"]))
    runs, cur = [], None
    for c in chars:
        if c["text"] == "_":
            if cur and abs(c["top"] - cur["top"]) < 2 and c["x0"] - cur["x1"] < 2.5:
                cur["x1"] = c["x1"]
            else:
                cur = {"x0": c["x0"], "x1": c["x1"], "top": c["top"], "bottom": c["bottom"]}
                runs.append(cur)
    words = page.extract_words(keep_blank_chars=False)
    for r in runs:
        line = [w for w in words if abs(w["top"] - r["top"]) < 3 and "_" not in w["text"]]
        before = " ".join(w["text"] for w in line if w["x1"] <= r["x0"] + 1)[-45:]
        after = " ".join(w["text"] for w in line if w["x0"] >= r["x1"] - 1)[:30]
        r.update(before=before, after=after, width=round(r["x1"] - r["x0"]))
    return runs


def boxes(page) -> list[dict]:
    """Small squares drawn as rectangles or as four lines: the form's tick boxes."""
    out = []
    for r in page.rects:
        w, h = r["x1"] - r["x0"], r["bottom"] - r["top"]
        if 6 <= w <= 16 and 6 <= h <= 16 and abs(w - h) < 3:
            out.append({"x0": r["x0"], "x1": r["x1"], "top": r["top"], "bottom": r["bottom"]})
    return sorted(out, key=lambda b: (round(b["top"]), b["x0"]))


def main(first: int = 1, last: int = 17) -> None:
    with pdfplumber.open(TEMPLATE) as pdf:
        for n in range(first, min(last, len(pdf.pages)) + 1):
            page = pdf.pages[n - 1]
            print(f"\n=========== page {n} ===========")
            for i, b in enumerate(blanks(page)):
                print(f"  b{i:<2} x={b['x0']:6.1f}-{b['x1']:6.1f} top={b['top']:6.1f}  [{b['before']}] ____ [{b['after']}]")
            words = page.extract_words()
            for bi, r in enumerate(boxes(page)):
                label = " ".join(w["text"] for w in words if abs(w["top"] - r["top"]) < 6 and w["x0"] > r["x1"])[:60]
                print(f"  box{bi:<2} x={r['x0']:6.1f} top={r['top']:6.1f} size={r['x1'] - r['x0']:.1f}  [{label}]")
            for ti, tb in enumerate(page.find_tables()):
                rows = tb.rows
                print(f"  table t{ti}: {len(rows)} rows, bbox={tuple(round(v) for v in tb.bbox)}")
                for ri, row in enumerate(rows[:8]):
                    cells = [tuple(round(v) for v in c) if c else None for c in row.cells]
                    texts = []
                    for c in row.cells:
                        if not c:
                            texts.append("-")
                            continue
                        txt = (page.crop(c).extract_text() or "").replace("\n", " ")[:18]
                        texts.append(txt)
                    print(f"    r{ri}: {cells}  {texts}")


if __name__ == "__main__":
    args = [int(a) for a in sys.argv[1:3]]
    main(*args)
