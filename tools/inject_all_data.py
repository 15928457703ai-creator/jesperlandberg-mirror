"""Rebuild every Nuxt payload and the DatoCMS GraphQL replay from the
pristine recordings, injecting all locally added projects (idempotent).

Run from the mirror root:  python3 tools/inject_all_data.py
"""
import os, re, json, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from project_config import ROOT, PROJECTS, FEATURED, HOME_ORDER, rwobj, cover, video_url

os.chdir(ROOT)
paths = json.load(open("raw/discovery.json", encoding="utf-8"))["paths"]
SLUGS = {p["slug"] for p in PROJECTS}
PIDS = {p["pid"] for p in PROJECTS}


def payload_src(p):
    if p == "/":
        return "raw/payloads/root.json"
    return "raw/payloads/" + p.strip("/").replace("/", "__") + "___payload.json.json"


def payload_dst(p):
    return "site/_payload.json" if p == "/" else "site" + p + "/_payload.json"


def R(d, v):
    d.append(v)
    return len(d) - 1


def inject_devalue(d, p):
    root_i = next(i for i, o in enumerate(d) if isinstance(o, dict) and "projects" in o)
    root = d[root_i]
    pidx, fidx = root["projects"], root.get("featured")

    def slug_of(i):
        o = d[i]
        if not isinstance(o, dict) or "slug" not in o:
            return None
        s = o["slug"]
        return d[s] if isinstance(s, int) and s < len(d) else s

    # idempotence: strip any previous injection of this project
    d[pidx] = [i for i in d[pidx] if slug_of(i) != p["slug"]]
    if fidx is not None:
        d[fidx] = [i for i in d[fidx] if slug_of(i) != p["slug"]]

    rid, rslug, rtitle, rdesc = R(d, p["pid"]), R(d, p["slug"]), R(d, p["title"]), R(d, p["desc"])
    rnull, rtrue, rfalse, ralt, rlink, rawards = (R(d, None), R(d, True), R(d, False),
                                                 R(d, ""), R(d, p.get("link")), R(d, None))
    tagrefs = [R(d, {"id": R(d, a), "title": R(d, b), "url": R(d, c)}) for a, b, c in p["tags"]]
    rtags = R(d, tagrefs)

    srcs, smalls, cards, imgs, vids, ratios = [], [], [], [], [], []
    for m in p["meta"]:
        main = "/" + p["dir"] + "/" + m["main"]["file"]
        small = "/" + p["dir"] + "/" + m["_small"]["file"]
        card = "/" + p["dir"] + "/" + m["_card"]["file"]
        rs, rt, rc = R(d, main), R(d, small), R(d, card)
        srcs.append(rs); smalls.append(rt); cards.append(rc)
        # A video slide is the stock shape: the poster stays in src/thumb/card
        # while `video` points at the mp4 the WebGL renderer plays as texture.
        vurl = video_url(p, m)
        rv = R(d, vurl) if vurl else rnull
        vids.append(rv)
        w, h = m["main"]["width"], m["main"]["height"]
        ratios.append((w, h))
        imgs.append(R(d, {"src": rs, "thumb": rt, "card": rc,
                          "width": R(d, w), "height": R(d, h),
                          "alt": ralt, "video": rv}))
    rimgs = R(d, imgs)
    ci = p.get("cover_index", 0)             # detail sheet may open with an
    w0, h0 = ratios[ci]                      # extra title slide before the cover
    csrc, cthumb, ccard, cvideo = srcs[ci], smalls[ci], cards[ci], vids[ci]
    hc = p.get("home_cover")
    if hc:
        # Optional HOME-card-only motion cover: the four texture fields change,
        # `images[]` (the detail sheet) and the GraphQL media array do not.
        base = "/" + p["dir"] + "/"
        csrc = R(d, base + hc["main"]["file"])
        cthumb = R(d, base + hc["_small"]["file"])
        ccard = R(d, base + hc["_card"]["file"])
        cvideo = R(d, base + hc["video"]["file"])
        w0, h0 = hc["main"]["width"], hc["main"]["height"]
    pobj = {"id": rid, "slug": rslug, "featured": rtrue, "title": rtitle,
            "description": rdesc, "awards": rawards, "link": rlink,
            "outlined": rfalse, "tags": rtags,
            "src": csrc, "thumb": cthumb, "card": ccard,          # <- cover
            "width": R(d, w0), "height": R(d, h0), "alt": ralt,
            "video": cvideo, "images": rimgs}
    d[pidx].append(R(d, pobj))
    if fidx is not None:
        fobj = dict(pobj)
        fobj["featured"] = R(d, len(d[fidx]))
        d[fidx].append(R(d, fobj))
    return d


def reorder_featured(d):
    """Permutate home.featured into HOME_ORDER (idempotent).

    Every Nuxt payload carries its own copy of this array, and the client
    derives BOTH the home card strip and the detail-page prev/next ring from
    `useAsyncData("featured")`. A payload left in the old append-at-the-end
    order would make the SSR articles/related links disagree with the client
    and trigger Vue hydration mismatches on a direct URL load.
    """
    root = next(o for o in d if isinstance(o, dict) and "projects" in o)
    fidx = root.get("featured")
    if fidx is None:
        return d
    arr = d[fidx]

    def slug_of(i):
        o = d[i] if isinstance(i, int) else i
        if not isinstance(o, dict) or "slug" not in o:
            return None
        s = o["slug"]
        return d[s] if isinstance(s, int) and s < len(d) else s

    by = {slug_of(i): i for i in arr}
    missing = [s for s in HOME_ORDER if s not in by]
    if missing:
        raise SystemExit("home.featured is missing: " + ", ".join(missing))
    extra = [i for i in arr if slug_of(i) not in HOME_ORDER]
    d[fidx] = [by[s] for s in HOME_ORDER] + extra
    return d


# ---- 1. all Nuxt payloads, rebuilt from the pristine recording ----
for p in paths:
    d = json.load(open(payload_src(p), encoding="utf-8"))
    d = rwobj(d)
    for proj in PROJECTS:
        d = inject_devalue(d, proj)
    d = reorder_featured(d)
    dst = payload_dst(p)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
print("payloads injected:", len(paths))

# ---- 2. one payload per new detail page ----
for proj in PROJECTS:
    dst = "site/projects/" + proj["slug"] + "/_payload.json"
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile("site/_payload.json", dst)
print("detail payloads:", len(PROJECTS))

# ---- 3. DatoCMS GraphQL replay (localized, idempotent) ----
G = "raw/graphql_localized.json"
g = json.load(open(G, encoding="utf-8"))
g["data"]["projects"] = [x for x in g["data"]["projects"]
                         if x.get("slug") not in SLUGS and x.get("id") not in PIDS]
g["data"]["home"]["featured"] = [x for x in g["data"]["home"]["featured"]
                                 if x.get("id") not in PIDS]
for p in PROJECTS:
    media = []
    for m in p["meta"]:
        w, h = m["main"]["width"], m["main"]["height"]
        base = "/" + p["dir"] + "/"
        vurl = video_url(p, m)
        vobj = None
        if vurl:
            # Exactly the fields the client's media mapper reads:
            #   src/thumb <- thumbnailUrl, card <- thumbnailUrl + crop query,
            #   video     <- mp4High (WebGL video texture)
            vobj = {
                "mp4High": vurl, "mp4Medium": vurl,
                "thumbnailUrl": base + m["main"]["file"],
                "width": w, "height": h,
                "duration": m["video"].get("duration", 0),
            }
        media.append({
            "url": base + m["main"]["file"], "alt": None, "title": None,
            "width": w, "height": h, "focalPoint": {"x": 0.5, "y": 0.5},
            "tile": base + m["main"]["file"],
            "small": base + m["_small"]["file"],
            "card": base + m["_card"]["file"],
            "responsiveImage": None, "video": vobj,
        })
    g["data"]["projects"].append({
        "id": p["pid"], "slug": p["slug"], "title": p["title"],
        "description": p["desc"], "link": p.get("link"),
        "tags": [{"id": a, "title": b, "url": c} for a, b, c in p["tags"]],
        "awards": None, "media": media, "outlined": False,
    })
    g["data"]["home"]["featured"].append({"id": p["pid"]})

# The GraphQL replay is consulted on SPA navigations, so its featured list
# must be the very same permutation as the SSR payloads. Rebuild it from
# HOME_ORDER rather than relying on append order (also makes this idempotent).
id_by_slug = {x["slug"]: x["id"] for x in g["data"]["projects"]}
missing = [s for s in HOME_ORDER if s not in id_by_slug]
if missing:
    raise SystemExit("GraphQL projects are missing: " + ", ".join(missing))
g["data"]["home"]["featured"] = [{"id": id_by_slug[s]} for s in HOME_ORDER]
open(G, "w", encoding="utf-8").write(json.dumps(g, ensure_ascii=False, separators=(",", ":")))
print("graphql projects:", len(g["data"]["projects"]),
      "featured:", len(g["data"]["home"]["featured"]))
for p in PROJECTS:
    rec = next(x for x in g["data"]["projects"] if x["slug"] == p["slug"])
    c = cover(p)
    print("   ", p["slug"], "media:", len(rec["media"]),
          "cover:", rec["media"][0]["url"],
          "(source:", c["source"] + ")")

# ---- 4. client-side caps -------------------------------------------------
# Q2  = images:c.slice(0,Q2)  -> detail page slide count
# eI  = featured.slice(0,eI) -> home card strip length
# Stock values are 5 and 12. With 16 slides in one deck and 13 featured
# projects both would silently truncate the newly added case studies, so
# derive both caps from the current configuration (plus headroom).
SLIDE_CAP = max(20, max(len(p["meta"]) for p in PROJECTS) + 4)
FEATURED_CAP = max(20, len(FEATURED) + 4)
for f in ("raw/nuxt/DZyj3ghP.js", "site/_nuxt/DZyj3ghP.js"):
    t = open(f, encoding="utf-8", errors="replace").read()
    n, k = re.subn(r"Q2=\d+,\s*eI=\d+",
                   "Q2=%d,eI=%d" % (SLIDE_CAP, FEATURED_CAP), t, count=1)
    if k != 1:
        raise SystemExit("cap pattern not found in " + f)
    open(f, "w", encoding="utf-8").write(n)
    print("caps", f, "Q2=%d eI=%d" % (SLIDE_CAP, FEATURED_CAP))

# ---- 5. machine-readable manifest for the browser regression scripts ----
export = [{
    "slug": p["slug"], "title": p["title"], "dir": p["dir"],
    "link": p.get("link"), "hint": p.get("hint"),
    "cover": cover(p)["source"],
    "slides": [{"n": m["n"], "files": [m["main"]["file"], m["_small"]["file"],
                                       m["_card"]["file"]],
                "video": m["video"]["file"] if m.get("video") else None}
               for m in p["meta"]],
} for p in PROJECTS]
open("raw/local_projects.json", "w", encoding="utf-8").write(
    json.dumps(export, ensure_ascii=False, indent=1))
print("verification manifest: raw/local_projects.json |", len(export), "projects")
