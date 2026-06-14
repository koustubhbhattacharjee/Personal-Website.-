#!/usr/bin/env python3
"""Asset compression step for the device screenshots.

The screen textures were captured at 1600-2532px, far larger than they ever
render now that the devices are small on screen. This caps the long edge at
MAX px (re-optimising the PNG), which cuts both download size and — more
importantly on a machine without a GPU — decoded texture memory on the GPU.

The mac-drill-seq/ subfolder is intentionally skipped (it is unused).

Run:  python3 scripts/optimize-shots.py
"""
import glob
import os
from PIL import Image

MAX = 1280
SHOTS = os.path.join(os.path.dirname(__file__), "..", "public", "shots")

total_before = total_after = 0
for path in sorted(glob.glob(os.path.join(SHOTS, "*.png"))):  # top level only
    before = os.path.getsize(path)
    im = Image.open(path)
    w, h = im.size
    scale = MAX / max(w, h)
    if scale < 1:
        im = im.convert("RGBA").resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    im.save(path, optimize=True)
    after = os.path.getsize(path)
    total_before += before
    total_after += after
    if scale < 1:
        print(f"  {os.path.basename(path):32s} {w}x{h} -> {im.size[0]}x{im.size[1]}  {before//1024}K -> {after//1024}K")

print(f"\nTotal: {total_before/1e6:.1f}MB -> {total_after/1e6:.1f}MB")
