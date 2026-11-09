"""Insert `封面.jpg` as the FIRST slide of the OPPO自助服务 detail page.

Only this project's media deck is touched:
  * the attachment is written to site/oppo-self/0.jpg (+ _small / _card),
    a name that cannot collide with the existing 1.jpg .. 16.jpg deck;
  * raw/project_images/oppo-self-service.json gets one new entry at index 0,
    the original 16 slides keep their order, names and metadata verbatim.

The home card / og:image cover stays the originally requested `1.png`:
project_config.py sets `"cover_index": 1` for this project, so the payload's
src/thumb/card are taken from that entry while `images[]` (the detail sheet)
starts with 0.jpg.  Re-running this script is idempotent.
"""
import os, json, shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/Users/soul/Downloads/OPPO 自助服务/封面.jpg"
DST = os.path.join(ROOT, "site", "oppo-self")
ORIG = os.path.join(DST, "originals")
META = os.path.join(ROOT, "raw", "project_images", "oppo-self-service.json")
SIZES = {"": 1600, "_small": 640, "_card": 1200}
STEM = "0"

if not os.path.isfile(SRC):
    raise SystemExit("missing attachment: " + SRC)
os.makedirs(ORIG, exist_ok=True)

# Keep a restorable copy of the pristine deck metadata exactly once.
backup = "/tmp/oppo_self_service_meta_prev.json"
if not os.path.exists(backup):
    shutil.copyfile(META, backup)

meta = json.load(open(META, encoding="utf-8"))
before = len(meta)
meta = [m for m in meta if m.get("source") != "封面.jpg"]  # idempotent re-run

im = Image.open(SRC)
if im.mode in ("RGBA", "LA", "P"):
    im = im.convert("RGBA")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    bg.paste(im, mask=im.split()[-1])
    im = bg
else:
    im = im.convert("RGB")
W, H = im.size
shutil.copyfile(SRC, os.path.join(ORIG, "封面.jpg"))

outs = {}
for suffix, w in SIZES.items():
    h = round(H * w / W)
    r = im.resize((w, h), Image.LANCZOS)
    name = STEM + suffix + ".jpg"
    r.save(os.path.join(DST, name), quality=90, optimize=True, progressive=True)
    outs[suffix or "main"] = {"file": name, "width": w, "height": h}

meta.insert(0, {
    "n": 0,
    "source": "封面.jpg",
    "cover": False,               # home cover is still entry 1 (`1.png`)
    "origWidth": W,
    "origHeight": H,
    "main": outs["main"],
    "_small": outs["_small"],
    "_card": outs["_card"],
})

json.dump(meta, open(META, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("source:", SRC, W, "x", H)
print("files :", ", ".join(v["file"] for v in outs.values()))
print("meta  :", before, "->", len(meta), "slides; first =", meta[0]["source"],
      "| home cover =", meta[1]["source"])
print("backup:", backup)
