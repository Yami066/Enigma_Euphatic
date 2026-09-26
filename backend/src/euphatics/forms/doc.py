"""Tiny layout helper on top of reportlab's canvas.

Keeps a cursor, wraps text, breaks pages, and numbers them "Page x of y".
Deliberately plain: forms have to print well on any office printer.
"""
from __future__ import annotations

import io
from typing import Iterable

from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas as rl_canvas

INK = HexColor("#1C1917")
MUTED = HexColor("#57534E")
LINE = HexColor("#A8A29E")
TEAL = HexColor("#0F766E")
TINT = HexColor("#F0FDFA")
AMBER = HexColor("#B45309")
AMBER_TINT = HexColor("#FFFBEB")

W, H = A4
LM, RM, TM, BM = 48, 48, 52, 56
CONTENT_W = W - LM - RM


class _NumberedCanvas(rl_canvas.Canvas):
    def __init__(self, *args, footer: str = "", **kwargs):
        super().__init__(*args, **kwargs)
        self._saved = []
        self._footer = footer

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self.setFont("Helvetica", 7.5)
            self.setFillColor(MUTED)
            self.drawString(LM, 28, self._footer[:150])
            self.drawRightString(W - RM, 28, f"Page {self._pageNumber} of {total}")
            super().showPage()
        super().save()


class Doc:
    def __init__(self, footer: str = ""):
        self.buf = io.BytesIO()
        self.c = _NumberedCanvas(self.buf, pagesize=A4, footer=footer)
        self.y = H - TM
        self.page_started = True

    # ------------------------------------------------------------ basics
    def new_page(self) -> None:
        self.c.showPage()
        self.y = H - TM

    def ensure(self, height: float) -> None:
        if self.y - height < BM:
            self.new_page()

    def space(self, h: float = 8) -> None:
        self.y -= h

    def text(self, s: str, size: float = 10, bold: bool = False, color=INK, indent: float = 0,
             leading: float | None = None, width: float | None = None) -> None:
        font = "Helvetica-Bold" if bold else "Helvetica"
        leading = leading or size * 1.35
        lines = simpleSplit(s, font, size, (width or CONTENT_W) - indent)
        for line in lines:
            self.ensure(leading)
            self.c.setFont(font, size)
            self.c.setFillColor(color)
            self.c.drawString(LM + indent, self.y - size, line)
            self.y -= leading

    def title(self, s: str, sub: str | None = None) -> None:
        self.ensure(40)
        self.text(s, size=15, bold=True, color=INK)
        if sub:
            self.text(sub, size=9, color=MUTED)
        self.space(4)
        self.c.setStrokeColor(TEAL)
        self.c.setLineWidth(1.2)
        self.c.line(LM, self.y, W - RM, self.y)
        self.space(10)

    def heading(self, s: str, keep_with: float = 0) -> None:
        """keep_with: space the following block needs, so a heading is never left alone at a page end."""
        self.ensure(30 + keep_with)
        self.space(4)
        self.text(s, size=11, bold=True, color=TEAL)
        self.space(2)

    def para(self, s: str, size: float = 9.5) -> None:
        self.text(s, size=size)
        self.space(3)

    def bullet(self, items: Iterable[str], size: float = 9.5) -> None:
        for it in items:
            lines = simpleSplit(it, "Helvetica", size, CONTENT_W - 16)
            self.ensure(len(lines) * size * 1.35)
            self.c.setFillColor(TEAL)
            self.c.circle(LM + 4, self.y - size * 0.6, 1.8, fill=1, stroke=0)
            for i, line in enumerate(lines):
                self.c.setFillColor(INK)
                self.c.setFont("Helvetica", size)
                self.c.drawString(LM + 14, self.y - size, line)
                self.y -= size * 1.35
            self.space(1)

    def note_box(self, s: str, color=TEAL, fill=TINT, size: float = 9) -> None:
        lines = simpleSplit(s, "Helvetica", size, CONTENT_W - 20)
        h = len(lines) * size * 1.35 + 12
        self.ensure(h + 4)
        self.c.setFillColor(fill)
        self.c.setStrokeColor(color)
        self.c.setLineWidth(0.8)
        self.c.roundRect(LM, self.y - h, CONTENT_W, h, 4, fill=1, stroke=1)
        yy = self.y - 6 - size
        for line in lines:
            self.c.setFillColor(INK)
            self.c.setFont("Helvetica", size)
            self.c.drawString(LM + 10, yy, line)
            yy -= size * 1.35
        self.y -= h + 6

    def field(self, label: str, value: str | None, label_w: float = 170, size: float = 9.5) -> None:
        value = value or ""
        lines = simpleSplit(value, "Helvetica-Bold", size, CONTENT_W - label_w - 6) or [""]
        h = max(1, len(lines)) * size * 1.4 + 4
        self.ensure(h)
        self.c.setFont("Helvetica", size)
        self.c.setFillColor(MUTED)
        self.c.drawString(LM, self.y - size, label)
        self.c.setFillColor(INK)
        self.c.setFont("Helvetica-Bold", size)
        yy = self.y - size
        for line in lines:
            self.c.drawString(LM + label_w, yy, line)
            yy -= size * 1.4
        self.c.setStrokeColor(LINE)
        self.c.setLineWidth(0.5)
        self.c.line(LM + label_w - 2, self.y - h + 2, W - RM, self.y - h + 2)
        self.y -= h + 3

    def table(self, headers: list[str], rows: list[list[str]], widths: list[float], size: float = 8.5) -> None:
        def row_h(cells):
            n = max(len(simpleSplit(str(c), "Helvetica", size, w - 8)) or 1 for c, w in zip(cells, widths))
            return n * size * 1.3 + 8

        def draw_row(cells, bold=False, fill=None):
            h = row_h(cells)
            self.ensure(h)
            x = LM
            if fill:
                self.c.setFillColor(fill)
                self.c.rect(LM, self.y - h, sum(widths), h, fill=1, stroke=0)
            for cell, w in zip(cells, widths):
                self.c.setStrokeColor(LINE)
                self.c.setLineWidth(0.5)
                self.c.rect(x, self.y - h, w, h, fill=0, stroke=1)
                yy = self.y - 4 - size
                for line in simpleSplit(str(cell), "Helvetica-Bold" if bold else "Helvetica", size, w - 8):
                    self.c.setFillColor(INK)
                    self.c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
                    self.c.drawString(x + 4, yy, line)
                    yy -= size * 1.3
                x += w
            self.y -= h

        draw_row(headers, bold=True, fill=TINT)
        for r in rows:
            draw_row(r)
        self.space(6)

    def checkbox_line(self, label: str, checked: bool = False, size: float = 9.5) -> None:
        lines = simpleSplit(label, "Helvetica", size, CONTENT_W - 20)
        self.ensure(len(lines) * size * 1.35 + 2)
        self.c.setStrokeColor(INK)
        self.c.setLineWidth(0.7)
        self.c.rect(LM, self.y - size - 1, 9, 9, fill=0, stroke=1)
        if checked:
            self.c.setFillColor(INK)
            self.c.setFont("Helvetica-Bold", 9)
            self.c.drawString(LM + 1.5, self.y - size + 0.5, "X")
        for i, line in enumerate(lines):
            self.c.setFont("Helvetica", size)
            self.c.setFillColor(INK)
            self.c.drawString(LM + 16, self.y - size, line)
            self.y -= size * 1.35
        self.space(2)

    def signature_boxes(self, people: list[dict], cols: int = 2, place_date: bool = True) -> None:
        box_w = (CONTENT_W - (cols - 1) * 12) / cols
        box_h = 70
        for i in range(0, len(people), cols):
            self.ensure(box_h + 10)
            for j, p in enumerate(people[i:i + cols]):
                x = LM + j * (box_w + 12)
                self.c.setStrokeColor(LINE)
                self.c.setDash(3, 2)
                self.c.rect(x, self.y - box_h, box_w, box_h, fill=0, stroke=1)
                self.c.setDash()
                self.c.setFont("Helvetica", 7.5)
                self.c.setFillColor(MUTED)
                self.c.drawString(x + 6, self.y - 11, "Signature")
                self.c.setFont("Helvetica-Bold", 8.5)
                self.c.setFillColor(INK)
                self.c.drawString(x + 6, self.y - box_h + 18, (p.get("fullName") or "")[:48])
                self.c.setFont("Helvetica", 7.5)
                self.c.setFillColor(MUTED)
                role = p.get("role") or p.get("relation") or ""
                extra = "   Place: ________  Date: ________" if place_date else ""
                self.c.drawString(x + 6, self.y - box_h + 7, f"{role}{extra}"[:80])
            self.y -= box_h + 10

    def image_page(self, label: str, data: bytes, note: str = "", new: bool = True) -> None:
        if new:
            self.new_page()
        self.title(label, note or None)
        img = ImageReader(io.BytesIO(data))
        iw, ih = img.getSize()
        max_w, max_h = CONTENT_W, self.y - BM - 90
        scale = min(max_w / iw, max_h / ih, 1.0 if iw > 900 else 2.0)
        dw, dh = iw * scale, ih * scale
        x = LM + (CONTENT_W - dw) / 2
        self.c.drawImage(img, x, self.y - dh, dw, dh, preserveAspectRatio=True, mask="auto")
        self.y -= dh + 16
        self.signature_boxes([{"fullName": "", "role": "Self-attested: name and signature"}], cols=1, place_date=True)

    def finish(self) -> bytes:
        self.c.showPage()  # queue the last page so it gets its "Page x of y" footer
        self.c.save()
        return self.buf.getvalue()


def rupees(v) -> str:
    if v is None or v == "":
        return ""
    v = float(v)
    s = f"{v:,.2f}"
    whole, frac = s.split(".")
    digits = whole.replace(",", "")
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"Rs. {whole}.{frac}"
