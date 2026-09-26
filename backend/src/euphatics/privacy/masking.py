"""Black out the first 8 digits of any Aadhaar number on an ID image.

Word boxes come from Textract (DetectDocumentText → WORD blocks with a
normalised BoundingBox), or from any OCR that gives text plus boxes. Only the
first 8 digits are covered; the last 4 stay visible, like UIDAI's own
"masked Aadhaar".
"""
from __future__ import annotations

import io
import re

from .aadhaar import is_valid_aadhaar


def aadhaar_boxes(words: list[dict]) -> list[list[dict]]:
    """words: [{text, box: {left, top, width, height}}] (normalised 0..1, reading order).

    Returns one list of boxes per Aadhaar number found. Handles '1234 5678 9012'
    split into three words, or a single word '123456789012' (then the first
    two-thirds of that word's box is covered).
    """
    groups: list[list[dict]] = []
    used: set[int] = set()
    for i, w in enumerate(words):
        if i in used:
            continue
        t = w["text"].strip().replace("-", "")
        if re.fullmatch(r"\d{12}", t) and is_valid_aadhaar(t):
            b = w["box"]
            groups.append([{**b, "width": b["width"] * 8 / 12}])
            used.add(i)
        elif re.fullmatch(r"\d{4}", t) and i + 2 < len(words):
            t2, t3 = words[i + 1]["text"].strip(), words[i + 2]["text"].strip()
            if re.fullmatch(r"\d{4}", t2) and re.fullmatch(r"\d{4}", t3) and is_valid_aadhaar(t + t2 + t3):
                groups.append([w["box"], words[i + 1]["box"]])
                used.update({i, i + 1, i + 2})
    return groups


def mask_image(image_bytes: bytes, words: list[dict], pad: float = 0.004) -> tuple[bytes, int]:
    """Return (PNG bytes, number of Aadhaar numbers masked)."""
    from PIL import Image, ImageDraw

    groups = aadhaar_boxes(words)
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    W, H = img.size
    draw = ImageDraw.Draw(img)
    for group in groups:
        for b in group:
            x0 = max(0, (b["left"] - pad) * W)
            y0 = max(0, (b["top"] - pad) * H)
            x1 = min(W, (b["left"] + b["width"] + pad) * W)
            y1 = min(H, (b["top"] + b["height"] + pad) * H)
            draw.rectangle([x0, y0, x1, y1], fill=(0, 0, 0))
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue(), len(groups)


def textract_words(blocks: list[dict]) -> list[dict]:
    """Convert Textract Blocks to the word format used above."""
    out = []
    for b in blocks:
        if b.get("BlockType") != "WORD":
            continue
        bb = b["Geometry"]["BoundingBox"]
        out.append({"text": b.get("Text", ""), "box": {"left": bb["Left"], "top": bb["Top"],
                                                        "width": bb["Width"], "height": bb["Height"]}})
    return out
