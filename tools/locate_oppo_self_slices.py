"""Locate the three supplied OPPO 自助服务 cover slices inside the current
static home cover (site/oppo-self/1.jpg, 1600x900).

The slices were cut out of that exact artwork, so a masked normalised
cross-correlation recovers each one's pixel position and scale.  The motion
showcase uses those coordinates, which makes its first and last frame read as
the same composition as the static cover it replaces.

Prints: name, NCC score and (left, top, width, height) in 1600x900 space.
"""
import os
import numpy as np
from PIL import Image
from scipy.signal import fftconvolve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANVAS = os.path.join(ROOT, "site", "oppo-self", "1.jpg")
SRC = "/Users/soul/Downloads/OPPO 自助服务/封面动画"
CUTS = [("intl", "切图.png"), ("cn", "切图-1.png"), ("web", "切图-2.png")]

F = 2  # work at half resolution, then scale back up
C = np.asarray(Image.open(CANVAS).convert("L").resize((1600 // F, 900 // F),
                                                      Image.LANCZOS), dtype=float)
C2 = C * C
CH, CW = C.shape

for name, fn in CUTS:
    im = Image.open(os.path.join(SRC, fn)).convert("RGBA")
    a = np.asarray(im)
    ys, xs = np.where(a[:, :, 3] > 16)
    im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    best = None
    for s in np.arange(0.30, 0.86, 0.01):
        w, h = max(8, round(im.width * s)), max(8, round(im.height * s))
        if w >= CW or h >= CH:
            continue
        t = np.asarray(im.resize((w, h), Image.LANCZOS))
        M = (t[:, :, 3] > 128).astype(float)
        if M.sum() < w * h * .12:
            continue
        T = t[:, :, 0] * .299 + t[:, :, 1] * .587 + t[:, :, 2] * .114
        TM = T * M
        n = M.sum()
        sT, sT2 = TM.sum(), (T * T * M).sum()
        sCT = fftconvolve(C, TM[::-1, ::-1], mode="valid")
        sC = fftconvolve(C, M[::-1, ::-1], mode="valid")
        sC2 = fftconvolve(C2, M[::-1, ::-1], mode="valid")
        num = sCT - sC * sT / n
        den = np.sqrt(np.maximum(0., (sC2 - sC * sC / n) * (sT2 - sT * sT / n)))
        ncc = num / np.maximum(den, 1e-6)
        iy, ix = np.unravel_index(int(np.argmax(ncc)), ncc.shape)
        score = float(ncc[iy, ix])
        if best is None or score > best[0]:
            best = (score, ix * F, iy * F, w * F, h * F, s * F)
    print("%-5s %-12s ncc=%.4f  left=%4d top=%4d w=%4d h=%4d  k=%.2f"
          % (name, fn, best[0], best[1], best[2], best[3], best[4], best[5]))
