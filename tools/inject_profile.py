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
from profile_config import INTRO, INTRO_CLASS, CSS_BEGIN, CSS_END, LINES, PHONE, SECTIONS
from project_config import ROOT

os.chdir(ROOT)

HTML_INTRO = " " + "\n\n".join("<strong>" + html.escape(heading) + "</strong>：" + html.escape(body) for heading, body in SECTIONS) + " "
# Locate the intro vnode by its ref instead of by its old text: the brand name
# in that stock paragraph can be rewritten independently (inject_brand.py).
VN = re.compile(r'(ct\("p",\{ref_key:"intro"[^}]*)(\},(?:"(?:[^"\\]|\\.)*"|null),512\))')

# Shared static tree keeps server markup and Vue hydration identical.
HEADER = ("header", {"class": "profile-heading"}, [
    ("h1", {"class": "profile-name"}, "冯梅 资深设计师"),
])
CONTACT = ("a", {"class": "profile-phone", "href": "tel:15928457703", "aria-label": "拨打电话 15928457703"}, PHONE)
def markup(node):
    tag, attrs, children = node
    body = html.escape(children) if isinstance(children, str) else "".join(map(markup, children))
    return "<" + tag + "".join(' ' + k + '=\"' + html.escape(v, quote=True) + '\"' for k, v in attrs.items()) + ">" + body + "</" + tag + ">"
def vnode(node):
    tag, attrs, children = node
    body = json.dumps(children, ensure_ascii=False) if isinstance(children, str) else "[" + ",".join(map(vnode, children)) + "]"
    return "ct(" + json.dumps(tag) + "," + json.dumps(attrs, ensure_ascii=False) + "," + body + ")"

def replace_header_vnode(text):
    """Replace a generated nested header vnode while respecting JS strings."""
    match = re.search(r'ct\("header",\s*\{"class":\s*"profile-heading"\}', text)
    if not match:
        raise SystemExit("profile header vnode not found")
    depth, quote, escaped = 0, None, False
    for end in range(match.start(), len(text)):
        char = text[end]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char in ('"', "'", "`"):
            quote = char
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return text[:match.start()] + vnode(HEADER) + text[end + 1:]
    raise SystemExit("unbalanced profile header vnode")

# ---------------------------------------------------------------- SSR pages
PAT = re.compile(
    r'(<p data-gl="text" ' + re.escape(INTRO_CLASS) + r'>)(.*?)(</p>)',
    re.S)

pages = sorted(glob.glob("raw/pages/*.html") + glob.glob("raw/templates/*.html"))
assert pages, "no raw SSR pages found"
for f in pages:
    t = open(f, encoding="utf-8").read()
    m = PAT.search(t)
    if not m:
        raise SystemExit("profile intro <p> not found in " + f)
    t = t[:m.start(2)] + HTML_INTRO + t[m.end(2):]
    if 'class="profile-heading"' not in t:
        m = PAT.search(t)
        t = t[:m.start()] + markup(HEADER) + t[m.start():m.end()] + markup(CONTACT) + t[m.end():]
    t = re.sub(r'<header class="profile-heading">.*?</header>', lambda _: markup(HEADER), t, flags=re.S)
    t = re.sub(r'<a class="profile-phone"[^>]*>.*?</a>', lambda _: markup(CONTACT), t, flags=re.S)
    open(f, "w", encoding="utf-8").write(t)
print("SSR sources updated:", len(pages))

# ------------------------------------------------------------ client bundle
for f in ("raw/nuxt/DZyj3ghP.js", "site/_nuxt/DZyj3ghP.js"):
    t = open(f, encoding="utf-8", errors="replace").read()
    m = VN.search(t)
    if not m:
        raise SystemExit("intro vnode not found in " + f)
    attrs = re.sub(r',innerHTML:"(?:[^"\\]|\\.)*"', '', m.group(1))
    rendered = attrs + ',innerHTML:' + json.dumps(HTML_INTRO, ensure_ascii=False) + '},null,512)'
    t = t[:m.start()] + rendered + t[m.end():]
    if '"profile-heading"' not in t:
        m = VN.search(t)
        t = t[:m.start()] + vnode(HEADER) + "," + t[m.start():m.end()] + "," + vnode(CONTACT) + t[m.end():]
    t = replace_header_vnode(t)
    t = re.sub(r'ct\("a",\s*\{[^{}]*"class":\s*"profile-phone"[^{}]*\},\s*"(?:[^"\\]|\\.)*"\)', lambda _: vnode(CONTACT), t)
    open(f, "w", encoding="utf-8").write(t)
    print("client vnode updated:", f)

# ------------------------------------------------------------------- styling
CSS = CSS_BEGIN + """ */
/* Keep the native animated disc and characters behind the profile copy. */
/* Both discs retain the same native w-420 / s:w-600 dimensions. */
div.fixed.z-40 > [data-gl-shield]:has(> p[class*="max-w-[35rem]"]) {
  inset-inline: 0;
  width: 100%;
  padding: 0 36px;
  box-sizing: border-box;
  font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
}
div.fixed.z-40 > [data-gl-shield]:has(> p[class*="max-w-[35rem]"]) > .label,
div.fixed.z-40 > [data-gl-shield]:has(> p[class*="max-w-[35rem]"]) > ul {
  display: none;
}
div.fixed.z-40:not([inert]) > [data-gl-shield] > p[data-gl="text"][class*="max-w-[35rem]"] {
  -webkit-text-fill-color: #dedede !important;
  color: #dedede !important;
  opacity: 1 !important;
  white-space: pre-line;
  text-align: left;
  letter-spacing: 0;
  font-size: 14px;
  line-height: 1.45;
  width: 100%;
  max-width: none;
  text-shadow: 0 1px 8px #000;
}
.profile-heading, .profile-phone {
  display: none;
}
div.fixed.z-40:not([inert]) .profile-heading,
div.fixed.z-40:not([inert]) .profile-phone {
  display: block;
  -webkit-text-fill-color: #f5f5f5;
  color: #f5f5f5;
  flex-shrink: 0;
  text-shadow: 0 2px 12px #000;
}
.profile-heading { margin-bottom: 18px; text-align: left; }
.profile-name { margin: 0 0 14px; font-size: 40px; font-weight: 700; line-height: 1.1; letter-spacing: -.02em; }
.profile-roles { display: flex; align-items: start; gap: 20px; }
.profile-role { display: flex; flex-direction: column; gap: 4px; }
.profile-role strong { font-size: 16px; line-height: 1.2; }
.profile-role small { color: #666; -webkit-text-fill-color: #666; font-size: 11px; letter-spacing: .02em; }
.profile-cross { color: #666; -webkit-text-fill-color: #666; font-size: 18px; font-weight: 200; }
.profile-phone { margin-top: 20px; font-size: 16px; max-width: 100%; white-space: normal; font-weight: 700; letter-spacing: .02em; line-height: 1.2; text-decoration: none; pointer-events: auto; }
@media (max-width: 640px) {
  div.fixed.z-40:not([inert]) > [data-gl-shield]:has(> p[class*="max-w-[35rem]"]) { padding-inline: 30px; max-height: calc(100svh - 130px); overflow-y: auto; pointer-events: auto; padding-block: 24px; background: rgba(0,0,0,.96); border-radius: 28px; box-shadow: 0 0 0 100vmax rgba(0,0,0,.92); }
  body:has(div.fixed.z-40:not([inert]) .profile-heading) div.fixed.inset-0.z-40 button { color: #fff; -webkit-text-fill-color: #fff; }
  .profile-heading { margin-bottom: 24px; }
  .profile-roles { gap: 12px; }
  .profile-phone { margin-top: 36px; margin-bottom: 10px; }
}
/* Keep the compact newsletter-sized disc readable on shorter displays. */
@media (min-width: 641px) and (max-height: 800px) {
  .profile-name { font-size: 32px; margin-bottom: 10px; }
  .profile-role strong { font-size: 14px; }
  .profile-role small { font-size: 10px; }
  .profile-heading { margin-bottom: 12px; }
  .profile-phone { margin-top: 16px; }
}
/* Keep measurable DOM placeholders; Newsletter's native renderer paints
 * Profile's text, preserving its clipping, reveal and hide choreography. */
html[data-profile-native] .profile-heading,
html[data-profile-native] .profile-phone { display: block; color: #f5f5f5; -webkit-text-fill-color: transparent !important; }
html[data-profile-native] .profile-name { -webkit-text-fill-color: transparent !important; }
html[data-profile-native] div.fixed.z-40 > [data-gl-shield] > p[data-gl="text"][class*="max-w-[35rem]"] {
  color: #dedede !important; -webkit-text-fill-color: transparent !important;
}
@media (max-width: 640px) {
  html[data-profile-native] div.fixed.z-40 > [data-gl-shield]:has(> p[class*="max-w-[35rem]"]) {
    background: transparent !important; box-shadow: none !important;
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
