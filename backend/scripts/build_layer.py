"""Build the Lambda dependency layer with Linux (manylinux x86_64, CPython 3.13) wheels.

Works on Windows without Docker: pip downloads the Linux binary wheels instead
of building for the host.  Output: backend/layer/python/…
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
OUT = HERE / "layer" / "python"


def main() -> int:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    cmd = [
        sys.executable, "-m", "pip", "install",
        "--quiet", "--disable-pip-version-check",
        "--platform", "manylinux2014_x86_64", "--platform", "manylinux_2_17_x86_64", "--platform", "manylinux_2_28_x86_64",
        "--implementation", "cp", "--python-version", "3.13", "--only-binary=:all:",
        "--target", str(OUT), "-r", str(HERE / "requirements.txt"),
    ]
    print("pip:", " ".join(cmd[3:]))
    subprocess.check_call(cmd)
    # trim weight: tests, caches and the huge botocore docs aren't needed at runtime
    removed = 0
    for pattern in ["**/__pycache__", "**/tests", "**/*.dist-info/RECORD"]:
        for p in OUT.glob(pattern):
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
            else:
                p.unlink(missing_ok=True)
            removed += 1
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file()) / 1e6
    print(f"layer ready: {OUT} ({size:.1f} MB unzipped, trimmed {removed} paths)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
