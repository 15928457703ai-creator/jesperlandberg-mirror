"""Stage the four supplied slices for the OPPO 自助服务 home-cover motion.

* trims each RGBA slice to its non-transparent bounding box (the exact same
  crop used by locate_oppo_self_slices.py, so the recovered coordinates apply);
* flattens the bubble background onto white and exports a 1600x900 jpg;
* copies the already local GSAP build so the offline mirror stays offline.

Output: site/oppo-self-live/{bg.jpg,intl.png,cn.png,web.png,gsap.min.js}
"""
import os, shutil
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/Users/soul/Downloads/OPPO 自助服务/封面动画"
DST = os.path.join(ROOT, "site", "oppo-self-live")
os.makedirs(DST, exist_ok=True)

for out, fn in [("intl", "切图.png"), ("cn", "切图-1.png"), ("web", "切图-2.png")]:
    im = Image.open(os.path.join(SRC, fn)).convert("RGBA")
    a = np.asarray(im)
    ys, xs = np.where(a[:, :, 3] > 16)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    im.crop(box).save(os.path.join(DST, out + ".png"), optimize=True)
    print(out, fn, "crop", box, "->", (box[2] - box[0], box[3] - box[1]))

bg = Image.open(os.path.join(SRC, "背景.png")).convert("RGBA")
flat = Image.new("RGB", bg.size, (255, 255, 255))
flat.paste(bg, mask=bg.split()[-1])
flat.resize((1600, 900), Image.LANCZOS).save(
    os.path.join(DST, "bg.jpg"), quality=90, optimize=True, progressive=True)
print("bg.jpg 1600x900")

src_gsap = os.path.join(ROOT, "site", "naivideo-live", "gsap.min.js")
shutil.copyfile(src_gsap, os.path.join(DST, "gsap.min.js"))
print("gsap.min.js", os.path.getsize(os.path.join(DST, "gsap.min.js")), "bytes")
