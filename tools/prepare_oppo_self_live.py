"""Produce the three poster stills for the OPPO 自助服务 home-cover motion.

tools/record_oppo_self_live.js already wrote site/oppo-self/motion.mp4 and
screenshots/oppo_self_live_still.png (a clean, un-animated composition).  The
poster is what the WebGL card shows before the clip is ready; using the clean
still keeps it identical to the original static cover at a glance.

`project_config.py` reads these paths via the `home_cover` override, which
changes ONLY the payload's src/thumb/card/video (i.e. the home card).  The
project's 17 detail slides and the GraphQL media array are untouched.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site", "oppo-self")
STILL = os.path.join(ROOT, "screenshots", "oppo_self_live_still.png")
MP4 = os.path.join(SITE, "motion.mp4")

for f in (STILL, MP4):
    if not os.path.isfile(f):
        raise SystemExit("missing %s — run tools/record_oppo_self_live.js first" % f)

im = Image.open(STILL).convert("RGB")
W, H = im.size
assert (W, H) == (1600, 900), "still poster must be 1600x900, got %s" % ((W, H),)

for suffix, w in {"": 1600, "_small": 640, "_card": 1200}.items():
    h = round(H * w / W)
    name = "motion" + suffix + ".jpg"
    im.resize((w, h), Image.LANCZOS).save(
        os.path.join(SITE, name), quality=90, optimize=True, progressive=True)
    print("poster %-22s %dx%d" % (name, w, h))
print("clip    motion.mp4 %.2f MB" % (os.path.getsize(MP4) / 1048576))
