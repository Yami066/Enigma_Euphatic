"""Prove the rules: every quote must appear word for word in its hashed source.

Run from the repo root:
    python -m euphatics.rules.verify            (with backend/src on PYTHONPATH)

It prints each check and exits non-zero on any failure, so it can gate CI and
be shown in the demo video ("one command re-checks every citation").
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from .engine import DATA_DIR, load_rulebook

REPO_ROOT = Path(__file__).resolve().parents[4]
MANIFEST = DATA_DIR / "sources.json"


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def collect_quotes() -> list[tuple[str, str, str]]:
    """(where, para, quote) for every quote in the rule files."""
    book = load_rulebook()["rbi"]
    out: list[tuple[str, str, str]] = []
    t = book["thresholds"]
    out.append(("thresholds", t["para"], t["quote"]))
    for r in book["routes"]:
        out.append((r["id"], r["para"], r["quote"]))
        for n in r.get("notes", []):
            out.append((f"{r['id']}.note", n["para"], n["quote"]))
    for key, n in book["extra_notes"].items():
        out.append((f"extra.{key}", n["para"], n["quote"]))
    with open(DATA_DIR / "clocks.json", encoding="utf-8") as fh:
        clocks = json.load(fh)
    for kind in ("deposit", "locker"):
        c = clocks[kind]
        out.append((f"clock.{kind}", c["para"], c["quote"]))
        comp = c["compensation"]
        out.append((f"comp.{kind}", comp["para"], comp["quote"]))
        for extra in ("reference_quote", "reasons_quote"):
            if extra in comp:
                out.append((f"comp.{kind}.{extra}", comp["para"], comp[extra]))
    return out


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(root: Path = REPO_ROOT, write_manifest: bool = False) -> tuple[bool, list[str]]:
    book = load_rulebook()["rbi"]
    lines: list[str] = []
    ok = True
    src_path = root / book["source"]["file"]
    if not src_path.exists():
        return False, [f"FAIL source file missing: {src_path}"]
    text = _norm(src_path.read_text(encoding="utf-8"))
    digest = sha256_file(src_path)

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    recorded = manifest.get(book["source"]["file"], {}).get("sha256")
    if write_manifest or recorded is None:
        manifest[book["source"]["file"]] = {"sha256": digest, "url": book["source"]["url"]}
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        lines.append(f"HASH recorded {digest[:16]}… for {book['source']['file']}")
    elif recorded != digest:
        ok = False
        lines.append(f"FAIL source changed: recorded {recorded[:16]}… now {digest[:16]}…")
    else:
        lines.append(f"PASS source hash {digest[:16]}… matches manifest")

    quotes = collect_quotes()
    for where, para, quote in quotes:
        if _norm(quote) in text:
            lines.append(f"PASS para {para:<8} {where}")
        else:
            ok = False
            lines.append(f"FAIL para {para:<8} {where}: quote not found in source")
    lines.append(f"{'OK' if ok else 'FAILED'}: {len(quotes)} citations checked against {book['source']['file']}")
    return ok, lines


def main() -> int:
    write = "--write-manifest" in sys.argv
    ok, lines = verify(write_manifest=write)
    for line in lines:
        print(line)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
