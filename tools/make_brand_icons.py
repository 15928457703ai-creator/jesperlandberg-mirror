#!/usr/bin/env python3
"""Regenerate every brand icon from the personal portrait.

The mirror serves one face.png at 17 declared pixel widths through the
assets/ media map.  Each width has its own hashed file, so rewriting the
bytes in place keeps every URL stable and no markup has to change.

Shape policy (mirrors what each platform does with the bitmap itself):

  favicon  16 / 32 / 96 / 192   full circle, transparent corners
           Browser tabs, bookmarks, Android / PWA.  Nothing masks these,
           so the roundness has to be baked into the PNG.

  apple    57..180              opaque square
           iOS applies its own squircle mask and renders the alpha channel
           as black, so a transparent corner would show up as four black
           wedges on the home screen.

  tile     70 / 150 / 310       opaque square
           Windows live tiles are rectangular and never mask.

Usage:  python3 tools/make_brand_icons.py [--square]   (--square = roll back
        to the previous square favicons without touching anything else)
"""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SOURCE = os.environ.get(
    'BRAND_PORTRAIT', '/Users/soul/Downloads/f72bca2db2174ec597e6823deefc965a.webp')
MANIFEST = 'assets/manifest.json'
BACKUP = 'raw/brand_icons_square'          # pre-circle square portrait set
SUPERSAMPLE = 8

CIRCLE = {16, 32, 96, 192}
# tier -> crop window (side, cx, cy) measured on the 2048px source portrait.
CROPS = {
    'tight': (760, 1024, 720),   # <= 76 px, face fills the tile
    'mid': (880, 1024, 745),     # 96 - 192 px
    'wide': (1000, 1024, 760),   # 310 px, shows the shoulders
}


def crop(side, cx, cy):
    src = Image.open(SOURCE).convert('RGB')
    left = max(0, cx - side // 2)
    top = max(0, cy - side // 2)
    return src.crop((left, top, left + side, top + side))


def tier_for(size):
    if size <= 76:
        return 'tight'
    if size >= 310:
        return 'wide'
    return 'mid'


def render(size, circle):
    # The round portrait keeps the full head with background above the hair.
    img = crop(1600, 1024, 800) if circle else crop(*CROPS[tier_for(size)])
    big = img.resize((size * SUPERSAMPLE, size * SUPERSAMPLE), Image.LANCZOS)
    big = big.resize((size, size), Image.LANCZOS)
    # Small tiles get a harder contrast lift and a tighter unsharp so the face
    # still reads at 16 px; large sizes only need a gentle hint.
    if size <= 76:
        big = ImageEnhance.Contrast(big).enhance(1.10)
        big = big.filter(ImageFilter.UnsharpMask(radius=0.7, percent=80, threshold=1))
    elif size < 310:
        big = ImageEnhance.Contrast(big).enhance(1.05)
        big = big.filter(ImageFilter.UnsharpMask(radius=1.1, percent=55, threshold=1))
    else:
        big = ImageEnhance.Contrast(big).enhance(1.03)
        big = big.filter(ImageFilter.UnsharpMask(radius=1.1, percent=55, threshold=1))
    if not circle:
        return big

    mask = Image.new('L', (size * SUPERSAMPLE, size * SUPERSAMPLE), 0)
    ImageDraw.Draw(mask).ellipse(
        [0, 0, size * SUPERSAMPLE - 1, size * SUPERSAMPLE - 1], fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = big.convert('RGBA')
    out.putalpha(mask)
    return out


def main():
    square_mode = '--square' in sys.argv
    icons = []
    for key, meta in json.load(open(MANIFEST))['byPath'].items():
        if '1786371616-face.png' in key:
            size = int(key.split('h=')[1].split('&')[0])
            icons.append((size, meta['file']))

    os.makedirs(BACKUP, exist_ok=True)
    for size, fname in sorted(icons):
        dst = os.path.join('assets', fname)
        keep = os.path.join(BACKUP, fname)
        if not os.path.exists(keep):
            Image.open(dst).convert('RGB').save(keep, 'PNG', optimize=True)
        circle = (size in CIRCLE) and not square_mode
        render(size, circle).save(dst, 'PNG', optimize=True)
        print(f'{size:4d}px  {"circle" if circle else "square"}  {fname}  '
              f'{os.path.getsize(dst) / 1024:5.1f} KB')


if __name__ == '__main__':
    main()
