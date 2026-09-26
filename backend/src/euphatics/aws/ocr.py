"""Amazon Textract for scanned documents and ID photos."""
from __future__ import annotations

import io

from .clients import client
from ..privacy.masking import textract_words


def to_png(data: bytes, content_type: str = "") -> bytes:
    """Images pass through; PDFs are rendered (first page) so Textract's sync API can read them."""
    if data[:5] == b"%PDF-" or "pdf" in content_type:
        import pypdfium2 as pdfium

        page = pdfium.PdfDocument(data)[0]
        img = page.render(scale=2).to_pil()
        out = io.BytesIO()
        img.convert("RGB").save(out, format="PNG")
        return out.getvalue()
    return data


def detect_words(image: bytes) -> list[dict]:
    r = client("textract").detect_document_text(Document={"Bytes": image})
    return textract_words(r.get("Blocks", []))


def detect_lines(image: bytes) -> list[str]:
    r = client("textract").detect_document_text(Document={"Bytes": image})
    return [b["Text"] for b in r.get("Blocks", []) if b.get("BlockType") == "LINE"]


def detect_all(image: bytes) -> tuple[list[str], list[dict]]:
    """One Textract call → (lines, words with geometry), for passbooks that need both parsing and masking."""
    r = client("textract").detect_document_text(Document={"Bytes": image})
    blocks = r.get("Blocks", [])
    return [b["Text"] for b in blocks if b.get("BlockType") == "LINE"], textract_words(blocks)
