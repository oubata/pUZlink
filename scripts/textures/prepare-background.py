#!/usr/bin/env python3
"""
Re-encode the background artwork for the app, losslessly.

    python3 scripts/textures/prepare-background.py [--check]

The source is Tob's file in `../Specs/images/`, used **exactly as supplied**:
this crops nothing, lightens nothing and darkens nothing. It only swaps the
container — a 2.2 MB PNG becomes a WebP a fraction of the size — because the
whole bundle is precached for offline play and shipped inside the APK.

The encode is `lossless=True`, and the script decodes what it wrote and
compares it pixel for pixel with the source before it will overwrite anything.
If that comparison ever fails, nothing is written.

Needs Pillow (`pip install pillow`); nothing at runtime depends on it, and the
committed .webp is what ships. `--check` verifies the committed file against
the source without rewriting it.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
SOURCE = ROOT.parent / "Specs" / "images" / "Backg image1.png"
OUT = ROOT / "public" / "textures" / "backdrop.webp"


def identical(a: Image.Image, b: Image.Image) -> bool:
    if a.size != b.size:
        return False
    return bool(
        np.array_equal(
            np.asarray(a.convert("RGB")),
            np.asarray(b.convert("RGB")),
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="compare the committed file with the source and write nothing",
    )
    args = parser.parse_args()

    if not SOURCE.exists():
        print(f"No source artwork at {SOURCE}", file=sys.stderr)
        return 1
    source = Image.open(SOURCE).convert("RGB")

    if args.check:
        if not OUT.exists():
            print(f"No {OUT.name} to check", file=sys.stderr)
            return 1
        same = identical(source, Image.open(OUT))
        print(
            f"{OUT.relative_to(ROOT)} is "
            + ("pixel-identical to the source" if same else "NOT the source artwork")
        )
        return 0 if same else 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".webp.tmp")
    source.save(tmp, format="WEBP", lossless=True, quality=100, method=6)

    if not identical(source, Image.open(tmp)):
        tmp.unlink()
        print("The re-encode changed pixels; nothing written.", file=sys.stderr)
        return 1

    tmp.replace(OUT)
    before = SOURCE.stat().st_size / 1024
    after = OUT.stat().st_size / 1024
    print(
        f"{OUT.relative_to(ROOT)}  {source.width}x{source.height}  "
        f"{after:.0f} KB (from {before:.0f} KB), pixel-identical"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
