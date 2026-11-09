"""Stage the assets for the animated ERP home cover (site/erp-fx).

Inputs
  ~/Downloads/ERP/动画/切图-1.png   grid screen phone  (754x906, alpha)
  ~/Downloads/ERP/动画/切图.png     生产详情 phone      (809x603, alpha)
  ~/Library/Fonts/HYQiHeiY2-*.otf   the cover's typeface (HYQiHei 85W/75W/55W)

Outputs
  site/erp-fx/assets/phone-grid.png
  site/erp-fx/assets/phone-detail.png
  site/erp-fx/assets/hy-85.woff2   title / subtitle   (85W Heavy)
  site/erp-fx/assets/hy-75.woff2   pills / meta values (75W Bold)
  site/erp-fx/assets/hy-55.woff2   paragraph / labels (55W Regular)
  site/erp-fx/assets/gsap.min.js

Why subset: the three OTFs are ~2.2 MB each and carry the full CJK set.  The
cover only needs ~150 glyphs, so each weight shrinks to a few tens of KB and
the stage renders identically on any machine (no dependency on a locally
installed 汉仪旗黑).
"""
import os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, "site", "erp-fx", "assets")
SLICES = {
    "phone-grid.png": "/Users/soul/Downloads/ERP/动画/切图-1.png",
    "phone-detail.png": "/Users/soul/Downloads/ERP/动画/切图.png",
}
FONTS = {
    "hy-85.woff2": ("/Users/soul/Library/Fonts/HYQiHeiY2-85W-6.otf", 400),
    "hy-75.woff2": ("/Users/soul/Library/Fonts/HYQiHeiY2-75W-5.otf", 400),
    "hy-55.woff2": ("/Users/soul/Library/Fonts/HYQiHeiY2-55W-3.otf", 400),
}

# Every character that appears anywhere on the cover, plus a latin/digit/punct
# margin so a copy edit does not silently fall back to a system font.
TEXT = (
    "APPExperience 1.0"
    "华润白酒ERP"
    "主设 UX/UI | 0-1建设"
    "白酒移动端ERP是为仓管员/操作员提供日常物料领、发、入库、退货等服务，"
    "改善线下“办公场景转移，电脑无法移动”的作业不便捷甚至受阻的问题；"
    "通过移动端ERP的建设提高处理效率及相应速度"
    "从0-1建设线下作业刚需全面提升作业效率"
    "使用角色：仓管员、操作员、组长"
    "本期范围：生产、采购、库存"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    " ./|·—－、，。；：（）“”‘’-+%&"
)
CHARS = "".join(sorted(set(TEXT)))


def main():
    os.makedirs(DST, exist_ok=True)
    for name, src in SLICES.items():
        if not os.path.isfile(src):
            raise SystemExit("missing slice: " + src)
        shutil.copyfile(src, os.path.join(DST, name))
        print("slice", name, os.path.getsize(os.path.join(DST, name)), "bytes")

    textfile = "/tmp/erp_fx_chars.txt"
    open(textfile, "w", encoding="utf-8").write(CHARS)
    for name, (src, _w) in FONTS.items():
        if not os.path.isfile(src):
            raise SystemExit("missing font: " + src)
        out = os.path.join(DST, name)
        subprocess.run([
            "pyftsubset", src,
            "--text-file=" + textfile,
            "--flavor=woff2",
            "--layout-features=kern,liga,vert,vrt2,locl",
            "--no-hinting",
            "--desubroutinize",
            "--output-file=" + out,
        ], check=True)
        print("font", name, os.path.getsize(out), "bytes")

    gsap_src = os.path.join(ROOT, "site", "oppo-service-fx", "assets", "gsap.min.js")
    shutil.copyfile(gsap_src, os.path.join(DST, "gsap.min.js"))
    print("gsap", os.path.getsize(os.path.join(DST, "gsap.min.js")), "bytes")
    print("chars", len(CHARS))


if __name__ == "__main__":
    main()
