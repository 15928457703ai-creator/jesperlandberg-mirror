"""Install the user-supplied Naivideo motion FX as the new home-cover source.

Input : /Users/soul/WorkBuddy/2026-11-09-10-56-49/naivideo-fx.zip
        (index.html + main.js + style.css + assets/gsap.min.js + 8 PNG slices)

Output (all inside the offline mirror, no payload/SSR/GraphQL changes):
    site/naivideo-fx.html               interactive showcase page
    site/naivideo-live.html             same page on the historical URL
    site/naivideo-live-legacy.html      the previous 9-tile soft-entrance page
    site/naivideo-fx/style.css          verbatim
    site/naivideo-fx/main.js            verbatim
    site/naivideo-fx/assets/gsap.min.js verbatim (GSAP 3.12.5)
    site/naivideo-fx/assets/slice-0..7.png

Why rename the slices: the ZIP stores CJK filenames with mixed NFC/NFD
forms, which makes the browser's percent-encoded requests miss the file on
macOS.  ASCII names keep the offline server's decodeURIComponent() path
lookup unambiguous.  The HTML is rewritten accordingly; every other byte of
the user's CSS/JS is preserved.

The old mp4/posters are backed up to /tmp/naivideo_fx_prev/ before the
recorder overwrites them.
"""
import os
import re
import shutil
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
ZIP = "/Users/soul/WorkBuddy/2026-11-09-10-56-49/naivideo-fx.zip"
DEST = os.path.join(SITE, "naivideo-fx")
BACKUP = "/tmp/naivideo_fx_prev"


def read_zip():
    """Return {ascii-or-original relative path: bytes}, fixing CJK names."""
    out = {}
    with zipfile.ZipFile(ZIP) as z:
        for info in z.infolist():
            name = info.filename
            try:
                name = name.encode("cp437").decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
            if info.is_dir():
                continue
            rel = name.split("naivideo-fx/", 1)[-1]
            out[rel] = z.read(info)
    return out


def main():
    files = read_zip()
    html = files["index.html"].decode("utf-8")
    os.makedirs(os.path.join(DEST, "assets"), exist_ok=True)

    # ---- 1. copy the JS/CSS verbatim ----------------------------------
    for rel in ("style.css", "main.js", "assets/gsap.min.js"):
        with open(os.path.join(DEST, rel), "wb") as fh:
            fh.write(files[rel])
        print("verbatim  site/naivideo-fx/" + rel)

    # ---- 2. rename slices in the exact order the HTML references them --
    srcs = re.findall(r'<img\s+src="([^"]+)"', html)
    assert len(srcs) == 8, "expected 8 slices, got %d" % len(srcs)
    mapping = {}
    for i, src in enumerate(srcs):
        ascii_name = "slice-%d.png" % i
        with open(os.path.join(DEST, "assets", ascii_name), "wb") as fh:
            fh.write(files[src])                         # src == assets/切图-3.png
        mapping[src] = "/naivideo-fx/assets/" + ascii_name
        print("slice %-24s -> %s" % (src, ascii_name))
    for old, new in mapping.items():
        html = html.replace('src="' + old + '"', 'src="' + new + '"')

    # ---- 3. absolute asset URLs + a local favicon (no 404s) -----------
    html = html.replace('href="style.css"', 'href="/naivideo-fx/style.css"')
    html = html.replace('src="main.js"', 'src="/naivideo-fx/main.js"')
    html = html.replace('src="assets/gsap.min.js"',
                        'src="/naivideo-fx/assets/gsap.min.js"')
    html = html.replace("<title></title>",
                        "<title>Naivideo — Motion FX | Fengmei</title>\n"
                        '<link rel="icon" href="data:,">')
    assert 'href="/naivideo-fx/style.css"' in html
    assert 'src="/naivideo-fx/main.js"' in html
    assert '/naivideo-fx/assets/gsap.min.js' in html
    assert "slice-7.png" in html

    with open(os.path.join(SITE, "naivideo-fx.html"), "w", encoding="utf-8") as fh:
        fh.write(html)
    print("page      site/naivideo-fx.html")

    # ---- 4. historical URL now serves the new FX; keep the old page ---
    old_page = os.path.join(SITE, "naivideo-live.html")
    legacy = os.path.join(SITE, "naivideo-live-legacy.html")
    if os.path.exists(old_page) and "t-hero" in open(old_page, encoding="utf-8").read():
        shutil.copy2(old_page, legacy)
        print("archive   site/naivideo-live-legacy.html")
    shutil.copyfile(os.path.join(SITE, "naivideo-fx.html"), old_page)
    print("page      site/naivideo-live.html -> new FX")

    # ---- 5. back up the media the recorder is about to overwrite ------
    os.makedirs(BACKUP, exist_ok=True)
    for name in ("live.mp4", "live.jpg", "live_small.jpg", "live_card.jpg"):
        src = os.path.join(SITE, "naivideo", name)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(BACKUP, name))
    print("backup    " + BACKUP)
    print("\nDone. Next: node tools/record_naivideo_fx.js")
    print("Preview : http://127.0.0.1:5188/naivideo-fx  (also /naivideo-live)")


if __name__ == "__main__":
    main()
