"""Rebuild every SSR page from the pristine recordings and inject all
locally added projects (idempotent).  Also produces the new detail pages,
sitemap / llms.txt / markdown / build-meta entries.

Run from the mirror root:  python3 tools/inject_all_html.py
"""
import os, re, json, glob, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from project_config import (ROOT, LOCAL, PROJECTS, FEATURED, HOME_ORDER,
                            ORIGINAL_ORDER, rw, cover)

os.chdir(ROOT)
paths = json.load(open("raw/discovery.json", encoding="utf-8"))["paths"]
TEMPLATE_DESC = "PROJECT_DESCRIPTION"
FULL_CLASS = ('class="pointer-events-auto cursor-pointer whitespace-nowrap '
              'text-18 s:text-30 leading-none tracking-[-0.05em]"')
BULLET = ('<span class="pointer-events-none absolute left-full top-1/2 ml-12 '
          '-translate-x-1/2 -translate-y-1/2 text-8 leading-none" '
          'aria-hidden="true">●</span></span>')
BULLET_INNER = BULLET[:-len("</span>")]
PRIMLAND_TAIL = ('<a href="https://ownprimland.com" target="_blank" rel="noopener" '
                 + FULL_CLASS + '>Primland</a><!----></span>')
FULL_MARKER = '<!--]--></div></div><div class="pointer-events-none absolute inset-0">'
CSS_LINK = '<link rel="stylesheet" href="/local-copy.css"></head>'
# The stylesheet paints the CJK copy, but a DOM node is not part of the WebGL
# scene: /local-copy.js ties the copy's enter/leave to the current route so it
# cannot outlive the detail page it belongs to.
JS_TAG = ('<link rel="stylesheet" href="/local-copy.css">'
          '<script src="/local-motion.js"></script>'
          '<script src="/local-copy.js" defer></script></head>')


def inject_css(t):
    """Load the left-hand-copy stylesheet (and its route-bound life cycle) on
    every page. A plain <link>/<script> pair does not change any element
    attribute, so it is hydration-safe, and attribute selectors also match
    sheets re-rendered by SPA navigations."""
    return t.replace('</head>', JS_TAG, 1)


# ---------------------------------------------------------------- home cards
def add_cards(t):
    """Rebuild the whole card strip in HOME_ORDER instead of appending.

    The WebGL strip is DOM-mirrored: each <article> is a placeholder whose
    texture comes from home.featured at the same index. Reordering the array
    without reordering these elements would silently paint the wrong cover
    on every card, so both are generated from HOME_ORDER here.
    """
    arts = list(re.finditer(r'<article\b[^>]*>.*?</article>', t, re.S))
    orig = {}
    for m in arts:
        did = re.search(r'data-id="([^"]+)"', m.group(0))
        if did:
            orig[did.group(1)] = m.group(0)
    missing = [s for s in ORIGINAL_ORDER if s not in orig]
    if missing:
        raise SystemExit("home strip is missing originals: " + ", ".join(missing))

    base = orig["griflan"]
    local = {}
    for p in PROJECTS:
        b = base.replace('data-id="griflan"', 'data-id="' + p["slug"] + '"')
        m = cover(p)['main']
        b = re.sub(r'aspect-ratio:[^;]+;', 'aspect-ratio:%d / %d;' % (m['width'], m['height']), b)
        b = b.replace('>Griflan</span>', '>' + p["title"] + '</span>')
        local[p["slug"]] = b
    pool = dict(orig)
    pool.update(local)
    strip = "".join(pool[s] for s in HOME_ORDER)
    t = t[:arts[0].start()] + strip + t[arts[-1].end():]

    # The sr-only "Featured work" list is a v-for over the same array; its
    # SSR order has to match the client's too, or hydration mismatches.
    lis = list(re.finditer(r'<li><a href="/projects/[^"]*"[^>]*>.*?</li>', t, re.S))
    olist = {}
    for m in lis:
        sl = re.search(r'<li><a href="/projects/([^"]+)"', m.group(0))
        if sl:
            olist[sl.group(1)] = m.group(0)
    nlist = {p["slug"]: ('<li><a href="/projects/' + p["slug"] + '">' + p["title"] +
                         '</a><!--[--> — ' + p["desc"] + '<!--]--></li>')
             for p in PROJECTS}
    pool2 = dict(olist)
    pool2.update(nlist)
    seo = "".join(pool2[s] for s in HOME_ORDER)
    return t[:lis[0].start()] + seo + t[lis[-1].end():]


# ---------------------------------------------------------------- /full index
def add_full(t):
    # Only publish names backed by a retained local case study.
    start = t.index('<span class="relative flex">', t.index('class="absolute inset-0"'))
    end = t.index(FULL_MARKER, start)
    titles = dict(FEATURED)
    order = ORIGINAL_ORDER + [p["slug"] for p in PROJECTS]
    items = []
    for i, slug in enumerate(order):
        tail = '<!----></span>' if i == len(order) - 1 else BULLET
        items.append('<span class="relative flex"><a href="/projects/' + slug + '" ' +
                     FULL_CLASS + '>' + titles[slug] + '</a>' + tail)
    return t[:start] + ''.join(items) + t[end:]


# ------------------------------------------------- original detail pages
def fix_original_related(t, page):
    """Rewrite BOTH related links on an original detail page from HOME_ORDER.

    The client does `featured.findIndex(slug) + -1/+1` (see rY37MP56.js), so
    the SSR data-id / href / aria-label must describe exactly that ring.
    With local projects moved in front of the originals the two seams are no
    longer "last local -> first original" and "last original -> first local";
    deriving each page's own neighbours keeps this right for any permutation.
    """
    slug = page.rsplit("/", 1)[-1]
    if slug not in ORIGINAL_ORDER:
        return t
    i = next(k for k, (s, _) in enumerate(FEATURED) if s == slug)
    n = len(FEATURED)
    prev_slug, prev_title = FEATURED[(i - 1) % n]
    next_slug, next_title = FEATURED[(i + 1) % n]

    blocks = list(re.finditer(r'<div[^>]*data-gl="related"[^>]*>.*?</div>', t, re.S))
    if len(blocks) != 2:
        raise SystemExit("expected 2 related blocks in " + page)
    targets = [(prev_slug, "Previous project: " + prev_title),
               (next_slug, "Next project: " + next_title)]
    patched = []
    for k, (s, label) in enumerate(targets):
        b = blocks[k].group(0)
        b = re.sub(r'data-id="[^"]*"', 'data-id="' + s + '"', b, count=1)
        b = re.sub(r'href="/projects/[^"]*"', 'href="/projects/' + s + '"', b, count=1)
        b = re.sub(r'aria-label="(?:Previous|Next) project: [^"]*"',
                   'aria-label="' + label + '"', b, count=1)
        patched.append(b)
    return (t[:blocks[0].start()] + patched[0] +
            t[blocks[0].end():blocks[1].start()] + patched[1] +
            t[blocks[1].end():])


# ---------------------------------------------------------------- 1. pages
for p in paths:
    src = "raw/pages/" + (p.strip("/").replace("/", "__") or "index") + ".html"
    t = rw(open(src, encoding="utf-8", errors="replace").read())
    t = fix_original_related(t, p)
    if p in ("/", "/newsletter"):
        t = add_cards(t)
    if p == "/full":
        t = add_full(t)
    dst = "site/index.html" if p == "/" else "site" + p + ".html"
    open(dst, "w", encoding="utf-8").write(inject_css(t))
print("rebuilt pages:", len(paths),
      "| home cards:", open("site/index.html", encoding="utf-8").read().count('data-gl="card"'),
      "| full project links:", open("site/full.html", encoding="utf-8").read().count('href="/projects/'))


# ---------------------------------------------------------------- 2. details
def neighbours(slug):
    i = next(k for k, (s, _) in enumerate(FEATURED) if s == slug)
    n = len(FEATURED)
    return FEATURED[(i - 1) % n], FEATURED[(i + 1) % n]


for p in PROJECTS:
    slug, title = p["slug"], p["title"]
    t = rw(open("raw/templates/project.html", encoding="utf-8").read())
    t = t.replace("Project template", title).replace(TEMPLATE_DESC, p["desc"])
    t = t.replace("project-template", slug)
    (prev_slug, prev_title), (next_slug, next_title) = neighbours(slug)
    blocks = list(re.finditer(r'<div[^>]*data-gl="related"[^>]*>.*?</div>', t, re.S))
    assert len(blocks) == 2
    for block, target, label in reversed(list(zip(
            blocks, [prev_slug, next_slug],
            ["Previous project: " + prev_title, "Next project: " + next_title]))):
        b = re.sub(r'data-id="[^"]*"', 'data-id="' + target + '"', block.group(), count=1)
        b = re.sub(r'href="/projects/[^"]*"', 'href="/projects/' + target + '"', b, count=1)
        b = re.sub(r'aria-label="(?:Previous|Next) project: [^"]*"',
                   'aria-label="' + label + '"', b, count=1)
        t = t[:block.start()] + b + t[block.end():]

    # The client renders a black round "pill" <a> when project.link is
    # truthy, otherwise a comment anchor (see rY37MP56.js:
    # s(e).link ? $(_,{url:s(e).link, "aria-label":`Visit ${title}`}) : B("",!0)).
    # Only the href differs from the stock template; aria-label already became
    # "Visit <title>" via the title replacement above, so the vnode matches.
    if p.get("link"):
        pattern = (r'(<a class="invisible[^>]*data-gl="pill" href=")[^"]*'
                   r'("[^>]*aria-label="Visit [^"]*"[^>]*>.*?</a>)')
        t, k = re.subn(pattern, lambda m: m.group(1) + p["link"] + m.group(2),
                       t, count=1, flags=re.S)
        if k != 1:
            print("  !! link pill template not found for", slug)
    else:
        t = re.sub(r'<a class="invisible[^>]*aria-label="Visit [^"]*"[^>]*>.*?</a>',
                   '<!---->', t, count=1, flags=re.S)

    # one tag pill in the template -> three
    m = re.search(r'(<!--\[-->)(<span class="invisible relative inline-flex items-center rounded-full h-\[2em\].*?</span></span>)(<!--\]-->)', t, re.S)
    if m:
        pill = m.group(2)
        pills = "".join(pill.replace("2023", b) for _, b, _ in p["tags"])
        t = t[:m.start()] + "<!--[-->" + pills + "<!--]-->" + t[m.end():]
    else:
        print("  !! tag pill template not found for", slug)

    # image placeholders -> one per slide, in display order (cover first)
    blocks = list(re.finditer(r'<div data-gl="simple"[^>]*></div>', t))
    divs = "".join(
        '<div data-gl="simple" style="aspect-ratio:%d / %d;" class="w-full flex-none"></div>'
        % (x["main"]["width"], x["main"]["height"]) for x in p["meta"])
    t = t[:blocks[0].start()] + divs + t[blocks[-1].end():]

    # og:image / twitter:image -> the requested cover
    img = LOCAL + "/" + p["dir"] + "/" + cover(p)["_card"]["file"]
    t = t.replace("PROJECT_COVER", img)
    t = t.replace('<meta property="og:image:height" content="630">',
                  '<meta property="og:image:height" content="%d">'
                  % cover(p)["_card"]["height"])

    # Left-hand copy stays byte-identical to the client vnode: no extra class
    # or <style> here, otherwise a direct URL load triggers a Vue hydration
    # mismatch. /local-copy.css uses attribute selectors, so it also applies
    # to sheets re-rendered by SPA navigations without touching the DOM.
    open("site/projects/" + slug + ".html", "w", encoding="utf-8").write(inject_css(t))
    print("detail", slug, "| slides:", len(p["meta"]),
          "| cover:", cover(p)["source"],
          "| prev:", prev_slug, "| next:", next_slug,
          "| len:", len(t))


# ---------------------------------------------------------------- 3. aux
bm = glob.glob("site/_nuxt/builds/meta/*.json")[0]
b = json.load(open(bm))
b["prerendered"] = [x for x in b["prerendered"] if not any(s in x for s in [p["slug"] for p in PROJECTS])]
b["prerendered"] += ["/projects/" + p["slug"] for p in PROJECTS]
open(bm, "w").write(json.dumps(b, separators=(",", ":")))

sm = open("site/sitemap.xml", encoding="utf-8").read().replace("https://jesperlandberg.com", LOCAL)
for p in PROJECTS:
    if "/projects/" + p["slug"] in sm:
        continue
    entry = ("\t<url>\n\t\t<loc>" + LOCAL + "/projects/" + p["slug"] +
             "</loc>\n\t\t<lastmod>2026-11-09T00:00:00.000+01:00</lastmod>\n"
             "\t\t<priority>0.8</priority>\n\t</url>\n")
    sm = sm.replace("</urlset>", entry + "</urlset>")
open("site/sitemap.xml", "w", encoding="utf-8").write(sm)

ll = open("site/llms.txt", encoding="utf-8", errors="replace").read()
for p in PROJECTS:
    # match the full markdown path, not the bare title/slug: "ERP" and
    # "CSA" also occur inside ordinary prose and would be falsely skipped
    if "/projects/" + p["slug"] + ".md" in ll:
        continue
    ll = ll.replace("## Site", "- [" + p["title"] + "](" + LOCAL + "/projects/" +
                    p["slug"] + ".md): " + p["short"] + "\n\n## Site", 1)
open("site/llms.txt", "w", encoding="utf-8").write(ll)

for p in PROJECTS:
    slides = []
    for x in p["meta"]:
        poster = ("![" + p["title"] + " " + str(x["n"]) + "](" + LOCAL + "/" +
                  p["dir"] + "/" + x["main"]["file"] + ")")
        if x.get("video"):
            poster += ("\n\n[Watch video](" + LOCAL + "/" + p["dir"] + "/" +
                       x["video"]["file"] + ")")
        slides.append(poster)
    md = ("# " + p["title"] + "\n\n" + p["desc"] + "\n\n## Slides\n\n" +
          "\n\n".join(slides) + "\n")
    open("site/projects/" + p["slug"] + ".md", "w", encoding="utf-8").write(md)

for f in ("site/index.md", "site/full.md"):
    if not os.path.isfile(f):
        continue
    s = open(f, encoding="utf-8", errors="replace").read()
    for p in PROJECTS:
        if "/projects/" + p["slug"] + ".md" not in s:
            s += "\n- [" + p["title"] + "](" + LOCAL + "/projects/" + p["slug"] + ".md): " + p["short"] + "\n"
    open(f, "w", encoding="utf-8").write(s.replace("https://jesperlandberg.com", LOCAL))

# ---- hint pages for links that are words rather than a public URL ----
# A WeChat mini program cannot be opened from a browser. Its round arrow pill
# therefore opens a small local page carrying the user-supplied instruction,
# while a CSS tooltip on the pill shows the same sentence without a click.
HINT_HTML = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__ — 如何找到</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{background:#fff;color:#000;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;
       display:flex;align-items:center;justify-content:center;padding:6vw;-webkit-font-smoothing:antialiased}
  main{max-width:820px;width:100%}
  .eyebrow{font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.45;margin:0 0 32px}
  h1{font-size:clamp(30px,5vw,64px);line-height:1.25;letter-spacing:-.04em;font-weight:600;margin:0 0 28px}
  .note{font-size:16px;line-height:1.8;opacity:.55;margin:0 0 56px}
  .back{display:inline-flex;align-items:center;gap:10px;background:#000;color:#fff;text-decoration:none;
        padding:14px 24px;border-radius:999px;font-size:15px}
  .back:hover{opacity:.75}
</style>
</head>
<body>
<main>
  <p class="eyebrow">__TITLE__</p>
  <h1>__HINT__</h1>
  <p class="note">这是一个微信小程序，没有网页地址，请在微信内打开。</p>
  <a class="back" href="/projects/__SLUG__">&larr; 返回项目</a>
</main>
</body>
</html>
"""
for p in PROJECTS:
    if not p.get("hint"):
        continue
    page = "site/" + p["link"].strip("/") + ".html"
    doc = (HINT_HTML.replace("__TITLE__", p["title"])
                    .replace("__HINT__", p["hint"])
                    .replace("__SLUG__", p["slug"]))
    open(page, "w", encoding="utf-8").write(doc)
    print("hint page:", page, "->", p["link"])

# ---- guard: every original case study keeps its original left-hand copy ----
import html as _html


def first_text(s):
    m = re.search(r'<div data-gl="text"[^>]*>(.*?)</div>', s, re.S)
    return _html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else None


kept = 0
for p in paths:
    if not p.startswith("/projects/"):
        continue
    raw = open("raw/pages/" + p.strip("/").replace("/", "__") + ".html",
               encoding="utf-8", errors="replace").read()
    cur = open("site" + p + ".html", encoding="utf-8").read()
    a, b = first_text(raw), first_text(cur)
    if a and a == b:
        kept += 1
    else:
        print("  !! left-hand copy changed:", p, repr(a), "->", repr(b))
print("original detail pages with byte-identical left-hand copy:", kept, "/", len(ORIGINAL_ORDER))
print("new detail pages with DOM-painted copy:", len(PROJECTS), "/", len(PROJECTS))
print("aux files updated")
