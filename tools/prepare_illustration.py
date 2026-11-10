"""Prepare the 插画 (Illustration) case study.

Unlike the other local projects this one is video-led: the user asked for the
video to be the project cover.  The original site already has a first-class
video-texture path (a media item carrying `video.mp4High` becomes a looping
WebGL texture, with `thumbnailUrl` as its poster), so we reproduce that data
shape instead of inventing a new player.

Outputs (all under site/illustration/):
  cover.mp4   <- /Users/soul/Downloads/插画/插画1.mov   (COVER)
  cover*.jpg  <- poster frame of that video
  frame1..9* <- the nine stills from the same attachment folder
  reel.mp4    <- /Users/soul/Downloads/插画/插画.mov    (closing demo)
  reel*.jpg   <- its poster frame
  originals/  <- untouched source files

and raw/project_images/illustration.json, whose first entry is the cover.
Re-running is idempotent; pass --force to re-encode.

Run from the mirror root: python3 tools/prepare_illustration.py
"""
import os, json, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/Users/soul/Downloads/插画"
DST = os.path.join(ROOT, "site", "illustration")
ORIG = os.path.join(DST, "originals")
META = os.path.join(ROOT, "raw", "project_images", "illustration.json")
FORCE = "--force" in sys.argv

os.makedirs(ORIG, exist_ok=True)
os.makedirs(os.path.dirname(META), exist_ok=True)

try:
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
except Exception as e:  # pragma: no cover - environment dependent
    raise SystemExit("ffmpeg (imageio-ffmpeg) is required: %s" % e)

from PIL import Image

# name, source file, poster timestamp
VIDEOS = [("cover", "插画1.mov", 4), ("reel", "插画.mov", 3)]
FRAMES = ["Frame %d.jpg" % i for i in range(1, 10)]

# keep native resolution for the main variant; never upscale a small still
SIZES = {"": 1600, "_card": 1200, "_small": 640}


def run(args):
    r = subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y"] + args,
                       capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("ffmpeg failed: %s\n%s" % (" ".join(args), r.stderr[-800:]))


def backup(name):
    s, d = os.path.join(SRC, name), os.path.join(ORIG, name)
    if not os.path.exists(d) or os.path.getsize(d) != os.path.getsize(s):
        shutil.copyfile(s, d)


def duration(src):
    r = subprocess.run([FF, "-hide_banner", "-i", src], capture_output=True, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", r.stderr)
    if not m:
        return 0
    return round(int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)))


def variants(src_path, stem):
    """Three WebGL-ready JPEGs from one still; returns the size dict."""
    im = Image.open(src_path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    W, H = im.size
    out = {}
    for suffix, target in SIZES.items():
        w = min(target, W)
        h = round(H * w / W)
        name = stem + suffix + ".jpg"
        im.resize((w, h), Image.LANCZOS).save(
            os.path.join(DST, name), quality=88, optimize=True, progressive=True)
        out[suffix or "main"] = {"file": name, "width": w, "height": h}
    return (W, H), out


meta = []
existing = json.load(open(META, encoding="utf-8")) if os.path.exists(META) else []


def add_video(stem, src_name, at, cover):
    src = os.path.join(SRC, src_name)
    backup(src_name)
    mp4 = stem + ".mp4"
    mp4_path = os.path.join(DST, mp4)
    if FORCE or not os.path.exists(mp4_path) or os.path.getsize(mp4_path) < 10000:
        # ReplayKit screen recordings are H.264 in a .mov container. Re-encode
        # at 30fps so the two clips are light enough to stream into a WebGL
        # texture, and +faststart so playback starts before the full download.
        run(["-i", src, "-an", "-c:v", "libx264", "-preset", "veryfast",
             "-crf", "25", "-pix_fmt", "yuv420p", "-r", "30",
             "-movflags", "+faststart", mp4_path])
    poster = os.path.join(DST, stem + "_poster.jpg")
    run(["-ss", str(at), "-i", src, "-frames:v", "1", "-q:v", "2", poster])
    (W, H), outs = variants(poster, stem)
    os.remove(poster)
    meta.append({
        "n": len(meta) + 1,
        "source": src_name,
        "kind": "video",
        "cover": cover,
        "origWidth": W, "origHeight": H,
        **outs,
        "video": {"file": mp4, "width": W, "height": H,
                  "duration": duration(src)},
    })
    print("video %-6s %-14s %dx%d -> %s (%.1f MB)" %
          (stem, src_name, W, H, mp4, os.path.getsize(mp4_path) / 1048576))


# 1. the user-attached video is the cover / first slide
add_video("cover", VIDEOS[0][1], VIDEOS[0][2], True)

# 2. the nine illustration stills
for i, f in enumerate(FRAMES, 1):
    if not os.path.exists(os.path.join(SRC, f)):
        raise SystemExit("missing still: " + f)
    backup(f)
    (W, H), outs = variants(os.path.join(SRC, f), "frame%d" % i)
    meta.append({
        "n": len(meta) + 1,
        "source": f,
        "kind": "image",
        "cover": False,
        "origWidth": W, "origHeight": H,
        **outs,
    })
    print("still %-6s %-14s %dx%d -> %s" %
          ("frame%d" % i, f, W, H, outs["main"]["file"]))

# 3. the longer demo closes the deck
add_video("reel", VIDEOS[1][1], VIDEOS[1][2], False)

# Keep separately imported motion studies when rebuilding the original deck.
base_sources = {m["source"] for m in meta}
for item in existing:
    if item["source"] not in base_sources:
        item["n"] = len(meta) + 1
        meta.append(item)

json.dump(meta, open(META, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("\nslides:", len(meta), "| cover:", meta[0]["source"],
      "| ->", os.path.relpath(META, ROOT))
