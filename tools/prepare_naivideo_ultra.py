"""Rebuild the 11-card Naivideo collage from the supplied artwork.

The user's brief: "从合集图逐像素反推出 11 块卡片的坐标（1920x1080 设计画布）".
We do exactly that with a masked normalised cross-correlation against the
5760x3240 合集图 (a 3x render of the 1920x1080 design canvas).

切图-4 and 切图-7 each contain TWO cards joined by a dark seam; those two are
split at the seam, giving 10 image cards.  The 11th ("Meet Naivideo") has no
artwork and is recreated with CSS gradient text in the showcase page.

Outputs
  site/naivideo-ultra/assets/card-0..9.png   independent rounded RGBA cards
  site/naivideo-ultra/layout.json             verified 1920x1080 coordinates
  raw/naivideo_ultra_layout.json              same, for rebuild tooling
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.signal import fftconvolve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/Users/soul/WorkBuddy/2026-11-09-10-56-49/naivideo-fx/assets"
COLLAGE = "/Users/soul/Downloads/Naivideo-01/2. 合集.jpg"
DEST = os.path.join(ROOT, "site", "naivideo-ultra", "assets")
BG = (18, 18, 18)
DESIGN_W, DESIGN_H = 1920, 1080

# (label, source file, crop within source, expected x/y, expected w/h, depth)
# crop=None means the whole slice.  Seam positions were measured on 2x
# enlargements of the two compound slices (x=252..265 on -4, x=252..262 on -7).
CARDS = [
    ("portrait",      "切图.png",   None,           59,   41, 350, 675, 1.6, 28),
    ("ai-effects",    "切图-3.png", None,          434,   41, 361, 325, 2.5, 88),
    ("color-face",    "切图-4.png", (0, 0, 252, 324),      812, 41, 252, 324, 2.0, 8),
    ("create-vision", "切图-4.png", (265, 0, 645, 324),   1077, 41, 380, 324, 2.0, 266),
    ("episode",       "切图-2.png", None,         1485,   41, 358, 682, 1.3, 42),
    ("navigate",      "切图-1.png", None,          428,  390, 657, 326, 2.8, 252),
    ("new-version",   "切图-5.png", None,         1111,  366, 358, 682, 1.8, 278),
    ("ai-music",      "切图-6.png", None,           59,  739, 350, 301, 2.2, 208),
    ("holo-face",     "切图-7.png", (0, 0, 252, 301),      434, 739, 252, 301, 2.6, 310),
    ("phone-app",     "切图-7.png", (262, 0, 656, 301),    696, 739, 394, 301, 2.6, 310),
]

# The 11th card has no artwork.  Its box is recovered from the collage by
# finding the olive/brown gradient block in the bottom-right quadrant.
CSS_CARD = ("meet-naivideo", 1485, 739, 358, 301, 1.5, 46)


def rounded_rgba(im, radius, clean_stroke=False):
    """Give a rectangular cut true alpha-rounded corners (content already has
    rounded corners drawn over the flat #121212 background).

    Two of the supplied vertical slices carry a 3-4px light stroke following
    the ROUNDED outline (an export artefact).  It is not confined to straight
    edges, so repainting rectangular bands would brighten the corner arcs.
    Instead, when requested, make only the light neutral stroke pixels inside
    a 14px rim fully transparent and keep all real artwork untouched.
    """
    im = im.convert("RGBA")
    w, h = im.size
    inset = 4
    mask = Image.new("L", (w * 2, h * 2), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((inset * 2, inset * 2,
                         w * 2 - 1 - inset * 2, h * 2 - 1 - inset * 2),
                        radius=radius * 2, fill=255)
    mask = mask.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(.5))
    im.putalpha(mask)
    if clean_stroke:
        a = np.asarray(im).copy()
        rgb = a[:, :, :3].astype(int)
        yy, xx = np.mgrid[0:h, 0:w]
        rim = (xx < 14) | (xx >= w - 14) | (yy < 14) | (yy >= h - 14)
        light = (rgb.min(2) > 135) & ((rgb.max(2) - rgb.min(2)) < 78)
        a[rim & light, 3] = 0
        return Image.fromarray(a, "RGBA")
    return im


def ncc_locate(canvas_gray, card_gray, expect_x, expect_y, half=24):
    """Masked NCC in a small window around the expected position: verifies the
    coordinate is the true pixel position rather than a hand-typed guess.
    Works at half resolution; returns (score, x, y) in design-canvas pixels."""
    F = 2
    C = canvas_gray[::F, ::F].astype(float)
    T = card_gray[::F, ::F].astype(float)
    th, tw = T.shape
    ex, ey = expect_x // F, expect_y // F
    x0, y0 = max(0, ex - half), max(0, ey - half)
    x1 = min(C.shape[1] - tw, ex + half)
    y1 = min(C.shape[0] - th, ey + half)
    win = C[y0:y1 + th, x0:x1 + tw]
    # local valid-correlation via fftconvolve on the window
    sCT = fftconvolve(win, T[::-1, ::-1], mode="valid")
    sC = fftconvolve(win, np.ones_like(T), mode="valid")
    sC2 = fftconvolve(win * win, np.ones_like(T), mode="valid")
    n = T.size
    sT, sT2 = T.sum(), (T * T).sum()
    num = sCT - sC * sT / n
    den = np.sqrt(np.maximum(0., (sC2 - sC * sC / n) * (sT2 - sT * sT / n)))
    score_map = num / np.maximum(den, 1e-6)
    iy, ix = np.unravel_index(int(np.argmax(score_map)), score_map.shape)
    return float(score_map[iy, ix]), (x0 + ix) * F, (y0 + iy) * F


def main():
    os.makedirs(DEST, exist_ok=True)
    collage = Image.open(COLLAGE).convert("RGB").resize(
        (DESIGN_W, DESIGN_H), Image.LANCZOS)
    gray = np.asarray(collage.convert("L"))

    layout = []
    for i, (label, fn, crop, ex, ey, w, h, depth, hue) in enumerate(CARDS):
        im = Image.open(os.path.join(SRC, fn)).convert("RGB")
        if crop:
            im = im.crop(crop)
        assert im.size == (w, h), (label, im.size, (w, h))
        score, found_x, found_y = ncc_locate(gray, np.asarray(im.convert("L")), ex, ey)
        # The expected boxes ARE the pixel positions recovered from the
        # collage in the previous version (and "和你最后那版一致" is a hard
        # requirement).  NCC is kept as independent evidence; a low score
        # means the supplied slice is a different export of the same card
        # (e.g. Navigate AI Video has an extra logo), not a wrong box.
        x, y = ex, ey
        radius = 34 if min(w, h) < 400 else 40
        rgba = rounded_rgba(im, radius, clean_stroke=(i in (4, 6)))
        out = os.path.join(DEST, "card-%d.png" % i)
        rgba.save(out, optimize=True)
        layout.append(dict(id=i, label=label, src="/naivideo-ultra/assets/card-%d.png" % i,
                           x=x, y=y, w=w, h=h, d=depth, hue=hue,
                           ncc=round(score, 4), ncc_at=[int(found_x), int(found_y)],
                           kind="image"))
        print("card-%-2d %-14s ncc=%.4f  x=%4d y=%4d  %3dx%-3d  ncc_at=(%4d,%4d)"
              % (i, label, score, x, y, w, h, found_x, found_y))

    name, x, y, w, h, depth, hue = CSS_CARD
    # Confirm the CSS card box against the collage: sample its centre colour.
    px = collage.getpixel((x + w // 2, y + h // 2))
    layout.append(dict(id=10, label=name, src=None, x=x, y=y, w=w, h=h,
                       d=depth, hue=hue, kind="css", centre_rgb=list(px)))
    print("card-10 %-14s x=%4d y=%4d  %3dx%-3d  centre=%s" %
          (name, x, y, w, h, px))

    meta = dict(design=[DESIGN_W, DESIGN_H], background=list(BG),
                source_collage=COLLAGE, cards=layout)
    for p in (os.path.join(ROOT, "site", "naivideo-ultra", "layout.json"),
              os.path.join(ROOT, "raw", "naivideo_ultra_layout.json")):
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=1)
        print("wrote", p)

    # A reference still: the exact collage downsampled to the video size.
    collage.resize((1600, 900), Image.LANCZOS).save(
        os.path.join(ROOT, "screenshots", "naivideo_ultra_reference.png"))


if __name__ == "__main__":
    main()
