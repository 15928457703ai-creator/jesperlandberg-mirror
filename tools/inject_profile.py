"""Write the Chinese biography into the Profile disc (idempotent).

Sources of truth: tools/profile_config.py.  Outputs:
  * raw/pages/*.html              - SSR text node of every page (11 sources)
  * raw/nuxt, site/_nuxt bundle   - the matching client vnode string
  * site/local-copy.css           - DOM painting for CJK (no hydration change)

After running this, re-run inject_all_html.py so the 17 built pages pick up
the new SSR sources.  Run from the mirror root:
    python3 tools/inject_profile.py && python3 tools/inject_all_html.py
"""
import glob
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from profile_config import INTRO, INTRO_CLASS, CSS_BEGIN, CSS_END, LINES
from project_config import ROOT

os.chdir(ROOT)

HTML_INTRO = html.escape(INTRO, quote=False)
JS_NEW = json.dumps(INTRO, ensure_ascii=False)
# Locate the intro vnode by its ref instead of by its old text: the brand name
# in that stock paragraph can be rewritten independently (inject_brand.py).
VN = re.compile(r'(ct\("p",\{ref_key:"intro"[^}]*\},)("(?:[^"\\]|\\.)*")(,512\))')

# ---------------------------------------------------------------- SSR pages
PAT = re.compile(
    r'(<p data-gl="text" ' + re.escape(INTRO_CLASS) + r'>)(.*?)(</p>)',
    re.S)

pages = sorted(glob.glob("raw/pages/*.html"))
assert pages, "no raw SSR pages found"
for f in pages:
    t = open(f, encoding="utf-8").read()
    m = PAT.search(t)
    if not m:
        raise SystemExit("profile intro <p> not found in " + f)
    t = t[:m.start(2)] + HTML_INTRO + t[m.end(2):]
    open(f, "w", encoding="utf-8").write(t)
print("SSR sources updated:", len(pages))

# ------------------------------------------------------------ client bundle
for f in ("raw/nuxt/DZyj3ghP.js", "site/_nuxt/DZyj3ghP.js"):
    t = open(f, encoding="utf-8", errors="replace").read()
    if JS_NEW in t:
        print("bundle already up to date:", f)
        continue
    m = VN.search(t)
    if not m:
        raise SystemExit("intro vnode not found in " + f)
    open(f, "w", encoding="utf-8").write(t[:m.start(2)] + JS_NEW + t[m.end(2):])
    print("client vnode updated:", f)

# ------------------------------------------------------------------- styling
CSS = CSS_BEGIN + """
/* Vue toggles the `inert` attribute on the disc, so this selector follows
 * the open/close state without adding classes or inline styles (which would
 * break hydration, and which SPA navigations would re-render anyway).
 * CJK has no glyphs in the baked MSDF atlas, so the WebGL text renderer
 * leaves this paragraph to the DOM; credits + social links keep their
 * original WebGL treatment and hover/reveal animation. */
div.fixed.z-40:not([inert]) > [data-gl-shield] > p[data-gl="text"][class*="max-w-[35rem]"] {
  -webkit-text-fill-color: #fff !important;
  color: #fff !important;
  opacity: 1 !important;
  white-space: pre-line;
  text-align: left;
  letter-spacing: 0;
  font-size: 13px;
  line-height: 1.8;
  /* Keep the copy inside the inner hole, away from the bright WebGL ring. */
  width: min(480px, calc(100vw - 96px));
  max-width: none;
  text-shadow: 0 1px 8px rgba(0, 0, 0, .95), 0 0 3px rgba(0, 0, 0, .9);
  animation: profileBioIn .6s cubic-bezier(.22, 1, .36, 1) both;
}
@keyframes profileBioIn {
  from { transform: translateY(10px); }
  to   { transform: translateY(0); }
}
@media (max-width: 640px) {
  div.fixed.z-40:not([inert]) > [data-gl-shield] > p[data-gl="text"][class*="max-w-[35rem]"] {
    font-size: 12px;
    line-height: 1.7;
  }
}
""" + CSS_END

css_file = "site/local-copy.css"
t = open(css_file, encoding="utf-8").read()
if CSS_BEGIN in t and CSS_END in t:
    a = t.index(CSS_BEGIN)
    b = t.index(CSS_END) + len(CSS_END)
    t = t[:a] + CSS.strip() + t[b:]
else:
    t = t.rstrip() + "\n\n" + CSS
open(css_file, "w", encoding="utf-8").write(t)
print("stylesheet updated:", css_file)

print("bio lines:", len(LINES), "| chars:", len(INTRO))
for i, line in enumerate(LINES, 1):
    print("  %d. %s" % (i, line[:34] + "…"))
