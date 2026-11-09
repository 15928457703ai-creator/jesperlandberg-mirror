"""Replace ONLY the images of the OPPO 服务小程序 detail page.

The attachment folder contains 1.jpg .. 18.jpg.  They are written in numeric
order (1 -> 18) into `site/oppo/` as three WebGL-ready variants each, and the
resulting metadata replaces `raw/oppo_images.json` — the metadata file that
`tools/project_config.py` already reads for this project.

Nothing else is touched: title / description / tags / link pill / WeChat hint /
HOME_ORDER / the client bundle / local-copy.css all stay byte-identical.  The
detail page's slide count is derived from len(meta) by inject_all_html.py, and
the client's per-project slide cap is Q2=20 (18 fits).
"""
import os, re, json, shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/Users/soul/Downloads/OPPO 服务小程序"
DST = os.path.join(ROOT, "site", "oppo")
ORIG = os.path.join(DST, "originals")
META = os.path.join(ROOT, "raw", "oppo_images.json")
SIZES = {"": 1600, "_small": 640, "_card": 1200}

os.makedirs(ORIG, exist_ok=True)

# numeric file name -> path (ignore .DS_Store and hidden files)
by_num = {}
for f in os.listdir(SRC):
    m = re.match(r"^(\d+)", f)
    if m and f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        by_num[int(m.group(1))] = f
order = sorted(by_num)
if not order:
    raise SystemExit("no numbered images found in " + SRC)
print("source:", SRC)
print("order :", ", ".join("%d:%s" % (n, by_num[n]) for n in order))

# The previous deck is still referenced by nothing after the rebuild, but keep
# a restorable copy and clear it so originals/ mirrors the new attachment 1:1.
backup = "/tmp/oppo_service_prev_%s" % os.path.basename(SRC).replace(" ", "_")
# Keep the ORIGINAL deck only once; re-running this idempotent script must not
# overwrite the backup with an already-replaced deck.
if not os.path.exists(backup + ".zip"):
    shutil.make_archive(backup, "zip", ORIG)
for f in os.listdir(ORIG):
    p = os.path.join(ORIG, f)
    if os.path.isfile(p):
        os.remove(p)
if not os.path.exists("/tmp/oppo_images_prev.json"):
    shutil.copyfile(META, "/tmp/oppo_images_prev.json")

meta = []
for n in order:
    f = by_num[n]
    sp = os.path.join(SRC, f)
    im = Image.open(sp)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    W, H = im.size
    shutil.copyfile(sp, os.path.join(ORIG, f))

    outs = {}
    for suffix, w in SIZES.items():
        h = round(H * w / W)
        r = im.resize((w, h), Image.LANCZOS)
        name = "%d%s.jpg" % (n, suffix)
        r.save(os.path.join(DST, name), quality=88,
               optimize=True, progressive=True)
        outs[suffix or "main"] = {"file": name, "width": w, "height": h}

    meta.append({
        "n": n,
        "source": f,
        "origWidth": W,
        "origHeight": H,
        "main": outs["main"],
        "_small": outs["_small"],
        "_card": outs["_card"],
    })
    print("  %2d %-10s %4dx%-4d -> %d x %d" %
          (n, f, W, H, outs["main"]["width"], outs["main"]["height"]))

json.dump(meta, open(META, "w", encoding="utf-8"),
          indent=1, ensure_ascii=False)
print("\n-> %s (%d slides)" % (META, len(meta)))
print("-> originals backup: %s.zip" % backup)
