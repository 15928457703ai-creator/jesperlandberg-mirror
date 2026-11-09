"""Replace ONLY the first slide's image of the ERP detail page.

The user supplied a revised `2.jpg` ("华润白酒ERP", replacing the earlier
"金沙白酒ERP" artwork).  `2.jpg` is both the home-card cover and slide 1 of
the detail sheet, so overwriting its three WebGL variants updates both while
leaving the 11-slide order (2, 1, 3..11), every URL, every dimension and all
payloads / SSR pages byte-identical.  No rebuild is required.

Source priority: the image attached in this conversation, then the refreshed
attachment in ~/Downloads/ERP, then the original we already archived (so a
re-run is idempotent and never depends on a temporary clipboard path).
"""
import os, json, shutil, zipfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, "site", "erp")
ORIG = os.path.join(DST, "originals")
META = os.path.join(ROOT, "raw", "project_images", "erp.json")
SIZES = {"": 1600, "_small": 640, "_card": 1200}
CANDIDATES = [
    "/Users/soul/.workbuddy/clipboard-images/clipboard-2026-11-09T06-44-49-186Z-da618d3b.jpg",
    "/Users/soul/Downloads/ERP/2.jpg",
    os.path.join(ORIG, "2.jpg"),
]
BACKUP = "/tmp/erp_first_slide_prev.zip"

meta = json.load(open(META, encoding="utf-8"))
first = meta[0]
assert first["source"] == "2.jpg" and first.get("cover"), "unexpected ERP deck head"
assert first["main"]["file"] == "2.jpg", "slide 1 is not 2.jpg"

# Keep the previous artwork / variants exactly once.
files = ["2.jpg", "2_small.jpg", "2_card.jpg"]
if not os.path.exists(BACKUP):
    with zipfile.ZipFile(BACKUP, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.write(os.path.join(DST, f), "site/erp/" + f)
        z.write(os.path.join(ORIG, "2.jpg"), "site/erp/originals/2.jpg")

src = next((p for p in CANDIDATES if os.path.isfile(p)), None)
if not src:
    raise SystemExit("no source image found: " + ", ".join(CANDIDATES))

im = Image.open(src)
if im.mode in ("RGBA", "LA", "P"):
    im = im.convert("RGBA")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    bg.paste(im, mask=im.split()[-1])
    im = bg
else:
    im = im.convert("RGB")
W, H = im.size
assert (W, H) == (first["origWidth"], first["origHeight"]), (
    "source %dx%d does not match erp.json %dx%d"
    % (W, H, first["origWidth"], first["origHeight"]))

for suffix, w in SIZES.items():
    h = round(H * w / W)
    name = "2" + suffix + ".jpg"
    expect = first["main" if not suffix else suffix]
    assert expect["file"] == name and expect["width"] == w and expect["height"] == h, (
        "erp.json variant mismatch for " + suffix)
    im.resize((w, h), Image.LANCZOS).save(
        os.path.join(DST, name), quality=90, optimize=True, progressive=True)
    print("  ->", "site/erp/" + name, w, "x", h)

shutil.copyfile(src, os.path.join(ORIG, "2.jpg"))
print("source:", src, W, "x", H)
print("deck  :", len(meta), "slides, order unchanged:",
      ", ".join(m["main"]["file"] for m in meta[:4]), "...")
print("backup:", BACKUP)
