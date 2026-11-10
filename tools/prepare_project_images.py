"""Prepare WebGL-ready image sets for the locally added projects.

Each attachment directory is turned into three downsized variants (main /
_small / _card) plus a copy of the untouched originals.  The server reads the
resulting JSON metadata when rebuilding Nuxt payloads and the GraphQL replay.

The first entry in the metadata array is the project's COVER — the image that
becomes `src` / `thumb` / `card` of the project and therefore the WebGL card
texture on the home page.
"""
import os, json, re, shutil, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_META = os.path.join(ROOT, "raw", "project_images")
os.makedirs(OUT_META, exist_ok=True)

PROJECTS = [
    {
        "slug": "naivideo",
        "src": "/Users/soul/Downloads/Naivideo-01",
        # "2. 合集.jpg" is the requested cover; it goes first, the rest stay in
        # their original numeric order.
        "cover": 2,
        "order": [2, 1, 3, 4, 5, 6, 7, 8],
    },
    {
        "slug": "erp",
        "src": "/Users/soul/Downloads/ERP",
        "cover": 2,
        "order": [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    },
    {
        "slug": "oppo-self-service",
        "src": "/Users/soul/Downloads/OPPO 自助服务",
        "cover": 1,
        "order": list(range(1, 17)),
    },
    {
        "slug": "csa-service",
        "src": "/Users/soul/Downloads/CSA客服服务",
        # The detail sheet opens with 1.jpg (the black 平台重构 / CSA客户服务
        # title page), followed by 2..8.  The HOME card cover is still the
        # originally requested 2.jpg: project_config.py pins it with
        # "cover_index": 1, so only images[] / GraphQL media follow this order.
        "cover": 2,
        "order": [1, 2, 3, 4, 5, 6, 7, 8],
    },
    {
        "slug": "hengxiang-advantage",
        "src": "/Users/soul/Downloads/横向优势",
        # "2. 插画.jpg" is the requested cover. Note "1、AIGC.jpg" uses a
        # Chinese enumeration comma instead of a dot after the number.
        "cover": 2,
        "order": [2, 1, 3, 4, 5],
    },
    {
        "slug": "ai-video",
        "src": "/Users/soul/Downloads/AI短视频",
        # The user asked for "01" as the home cover: 1.jpg is the title page
        # (AI创新实验 / 儿童故事短视频). 2.png is a transparent PNG; the common
        # flatten-on-white path below handles it.
        "cover": 1,
        "order": [1, 2, 3, 4, 5, 6],
    },
]

# site/ directory name per project (kept short and unique)
DIRS = {"naivideo": "naivideo", "erp": "erp",
        "oppo-self-service": "oppo-self", "csa-service": "csa",
        "hengxiang-advantage": "hengxiang", "ai-video": "ai-video"}

SIZES = {"": 1600, "_small": 640, "_card": 1200}

# Optional slug arguments: regenerate only the named projects. Re-running all
# of them is idempotent but slow (large PNG decks), so new projects can be
# prepared alone:  python3 tools/prepare_project_images.py <slug>
ONLY = set(sys.argv[1:])

for proj in PROJECTS:
    slug, src = proj["slug"], proj["src"]
    if ONLY and slug not in ONLY:
        continue
    dst = os.path.join(ROOT, "site", DIRS[slug])
    orig = os.path.join(dst, "originals")
    os.makedirs(orig, exist_ok=True)

    by_num = {}
    for f in os.listdir(src):
        # leading number may be followed by ".", "、" or nothing at all
        m = re.match(r"^(\d+)", f)
        if m and f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            by_num[int(m.group(1))] = f

    missing = [n for n in proj["order"] if n not in by_num]
    if missing:
        raise SystemExit(f"[{slug}] missing source images: {missing}")
    print(f"[{slug}] {len(proj['order'])} slides, cover = {proj['cover']} ({by_num[proj['cover']]})")

    meta = []
    for n in proj["order"]:
        f = by_num[n]
        im = Image.open(os.path.join(src, f))
        # OPPO self-service slides are RGBA PNGs: flatten onto white so the
        # transparent areas do not turn black in the JPEG/WebGL variants.
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        W, H = im.size
        shutil.copyfile(os.path.join(src, f), os.path.join(orig, f))
        outs = {}
        for suffix, w in SIZES.items():
            h = round(H * w / W)
            r = im.resize((w, h), Image.LANCZOS)
            name = f"{n}{suffix}.jpg"
            r.save(os.path.join(dst, name), quality=88, optimize=True, progressive=True)
            outs[suffix or "main"] = {"file": name, "width": w, "height": h}
        meta.append({
            "n": n,
            "source": f,
            "cover": n == proj["cover"],
            "origWidth": W,
            "origHeight": H,
            **outs,
        })
        print(f"   {n:2d} {f[:44]:44s} {W}x{H} -> {outs['main']['width']}x{outs['main']['height']}")

    json.dump(meta, open(os.path.join(OUT_META, slug + ".json"), "w"),
              indent=1, ensure_ascii=False)
    print(f"   -> {os.path.join(OUT_META, slug + '.json')}\n")

print("done")
