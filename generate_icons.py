"""
generate_icons.py
Generates extension icons at 16, 32, 48, 128px.
Design: dark square, teal ring arc (~75% fill), small centre dot.
"""

import math, os
from PIL import Image, ImageDraw

SIZES   = [16, 32, 48, 128]
OUT_DIR = "icons"

BG      = (12,  12,  16,  255)   # #0c0c10
TRACK   = (28,  28,  38,  255)   # #1c1c26
ARC     = (74, 171, 132,  255)   # #4aab84
DOT     = (216, 216, 232, 255)   # #d8d8e8

os.makedirs(OUT_DIR, exist_ok=True)

def draw_icon(size):
    # Work at 4× for anti-aliasing, downscale at end.
    scale  = 4
    canvas = size * scale
    img    = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    d      = ImageDraw.Draw(img)

    pad    = canvas * 0.04
    r_out  = (canvas / 2) - pad          # outer radius of ring
    stroke = max(2, canvas * 0.13)       # ring thickness
    r_in   = r_out - stroke              # inner radius

    cx = cy = canvas / 2

    # ── Rounded background square ────────────────────────────────────
    corner = canvas * 0.20
    d.rounded_rectangle([0, 0, canvas, canvas], radius=corner, fill=BG)

    # ── Track ring (full circle) ──────────────────────────────────────
    bb_out = [cx - r_out, cy - r_out, cx + r_out, cy + r_out]
    d.ellipse(bb_out, fill=TRACK)
    bb_in  = [cx - r_in,  cy - r_in,  cx + r_in,  cy + r_in]
    d.ellipse(bb_in,  fill=BG)

    # ── Arc (~270° starting from 7 o'clock, going clockwise) ─────────
    arc_start = 135     # degrees (PIL: 0=3 o'clock, clockwise)
    arc_end   = 135 + 270

    # PIL's arc doesn't respect line width well for thick arcs, so we
    # draw a filled pie then cut the centre — gives a clean thick arc.
    # Step 1: filled pie slice for the arc sector
    pie_img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    pie_d   = ImageDraw.Draw(pie_img)
    pie_d.pieslice(bb_out, start=arc_start, end=arc_end, fill=ARC)
    # Step 2: punch out the inner circle with BG colour
    pie_d.ellipse(bb_in, fill=(0, 0, 0, 0))
    img = Image.alpha_composite(img, pie_img)

    # ── Centre dot ───────────────────────────────────────────────────
    d2     = ImageDraw.Draw(img)
    dot_r  = max(1, canvas * 0.07)
    d2.ellipse(
        [cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
        fill=DOT
    )

    # ── Downscale with LANCZOS ────────────────────────────────────────
    result = img.resize((size, size), Image.LANCZOS)
    path   = os.path.join(OUT_DIR, f"icon{size}.png")
    result.save(path, "PNG")
    print(f"  {path}  ({size}×{size})")

print("Generating icons…")
for s in SIZES:
    draw_icon(s)
print("Done.")
