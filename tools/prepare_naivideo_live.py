"""Swap the Naivideo static collage cover for the animated bento showcase.

tools/record_naivideo_live.js renders site/naivideo-live.html into a seamless
12s mp4 plus a clean still poster.  This script turns that into the exact
`video` media shape the original site already understands (see the 插画
project), so the home card AND the first detail slide become the animated
collage while every original WebGL interaction stays untouched.

The pristine 8-image deck is kept in raw/project_images/naivideo_static.json
so this is fully idempotent and reversible.  Re-run it after
prepare_project_images.py if that ever regenerates the stills.

Outputs under site/naivideo/:
    live.jpg / live_card.jpg / live_small.jpg   poster variants
    live.mp4                                  (already written by recorder)
"""
import json, os, sys
from PIL import Image

# LEGACY GUARD — the active cover is the user's naivideo-fx motion, written by
# tools/record_naivideo_fx.js.  Running this script would overwrite live.jpg /
# live_small.jpg / live_card.jpg and the first entry of naivideo.json with the
# retired 9-tile collage.  Set ALLOW_LEGACY_NAIVIDEO=1 only for a rollback.
if os.environ.get("ALLOW_LEGACY_NAIVIDEO") != "1":
    raise SystemExit(
        "LEGACY: this rebuilds the retired 9-tile Naivideo cover.\n"
        "Active cover: tools/record_naivideo_fx.js (naivideo-fx.zip).\n"
        "Re-run with ALLOW_LEGACY_NAIVIDEO=1 only to roll back.")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site", "naivideo")
META = os.path.join(ROOT, "raw", "project_images", "naivideo.json")
STATIC = os.path.join(ROOT, "raw", "project_images", "naivideo_static.json")
STILL = os.path.join(ROOT, "screenshots", "naivideo_live_still.png")
MP4 = os.path.join(SITE, "live.mp4")

for f in (STILL, MP4):
    if not os.path.exists(f):
        raise SystemExit("missing %s — run tools/record_naivideo_live.js first" % f)

# ---- keep a pristine copy of the original still deck -------------------
if not os.path.exists(STATIC):
    with open(META, encoding="utf-8") as fh:
        json.dump(json.load(fh), open(STATIC, "w", encoding="utf-8"),
                  indent=1, ensure_ascii=False)
    print("backed up original still deck ->", os.path.relpath(STATIC, ROOT))

with open(STATIC, encoding="utf-8") as fh:
    base = json.load(fh)

# ---- three poster variants ---------------------------------------------
im = Image.open(STILL).convert("RGB")
W, H = im.size
assert (W, H) == (1600, 900), "still poster must be 1600x900, got %s" % ((W, H),)
SIZES = {"": 1600, "_card": 1200, "_small": 640}
outs = {}
for suffix, w in SIZES.items():
    h = round(H * w / W)
    name = "live" + suffix + ".jpg"
    im.resize((w, h), Image.LANCZOS).save(
        os.path.join(SITE, name), quality=90, optimize=True, progressive=True)
    outs[suffix or "main"] = {"file": name, "width": w, "height": h}
    print("poster %-16s %dx%d" % (name, w, h))

# ---- replace the cover entry -------------------------------------------
# The old cover (2. 合集.jpg) is *replaced*, not duplicated: the user asked
# for the static collage page to become an animated showcase.  The original
# JPEG stays on disk and in naivideo_static.json, so nothing is lost.
cover = {
    "n": 2,
    "source": "naivideo-live (motion showcase)",
    "kind": "video",
    "cover": True,
    "origWidth": W, "origHeight": H,
    **outs,
    "video": {"file": "live.mp4", "width": W, "height": H, "duration": 12},
}
deck = [cover] + base[1:]
with open(META, "w", encoding="utf-8") as fh:
    json.dump(deck, fh, indent=1, ensure_ascii=False)
print("\nslides:", len(deck), "| cover:", deck[0]["source"],
      "| video:", deck[0]["video"]["file"],
      "%.2f MB" % (os.path.getsize(MP4) / 1048576))
print("->", os.path.relpath(META, ROOT))
