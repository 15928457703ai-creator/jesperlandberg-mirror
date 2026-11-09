import os,re,json,glob,shutil
LOCAL="http://127.0.0.1:__PORT__"
RULES=[
 ("https://graphql.datocms.com/", LOCAL+"/__graphql"),
 ("https://graphql.datocms.com",  LOCAL+"/__graphql"),
 ("https://static.cloudflareinsights.com", LOCAL+"/__noop"),
 ("https://www.datocms-assets.com", LOCAL),
 ("https://image.mux.com", LOCAL),
 ("https://stream.mux.com", LOCAL),
 ("https://jesperlandberg.com", LOCAL),
 ("http://jesperlandberg.com", LOCAL),
]
def rw(s):
    if not isinstance(s,str): return s
    for a,b in RULES: s=s.replace(a,b)
    return s
def rwobj(o):
    if isinstance(o,str): return rw(o)
    if isinstance(o,list): return [rwobj(x) for x in o]
    if isinstance(o,dict): return {k:rwobj(v) for k,v in o.items()}
    return o

# ---- pages ----
paths=json.load(open("raw/discovery.json"))["paths"]
for p in paths:
    src="raw/pages/"+(p.strip("/").replace("/","__") or "index")+".html"
    html=open(src,encoding="utf-8",errors="replace").read()
    html=rw(html)
    if p=="/": dst="site/index.html"
    else: dst="site"+p+".html"
    os.makedirs(os.path.dirname(dst),exist_ok=True)
    open(dst,"w",encoding="utf-8").write(html)
print("pages rewritten:",len(paths))

# ---- payloads ----
for p in paths:
    if p=="/": src="raw/payloads/root.json"; dst="site/_payload.json"
    else:
        name=p.strip("/").replace("/","__")+"___payload.json.json"
        src="raw/payloads/"+name
        dst="site"+p+"/_payload.json"
    if not os.path.exists(src): print("MISSING payload",src); continue
    data=json.load(open(src,encoding="utf-8"))
    out=rwobj(data)
    os.makedirs(os.path.dirname(dst),exist_ok=True)
    open(dst,"w",encoding="utf-8").write(json.dumps(out,ensure_ascii=False,separators=(",",":")))
print("payloads rewritten:",len(paths))

# ---- nuxt js / fonts / wasm ----
os.makedirs("site/_nuxt",exist_ok=True)
for f in glob.glob("raw/nuxt/*"):
    b=os.path.basename(f); dst="site/_nuxt/"+b
    if b.endswith(".js"):
        t=open(f,encoding="utf-8",errors="replace").read()
        open(dst,"w",encoding="utf-8").write(rw(t))
    else: shutil.copyfile(f,dst)
print("nuxt assets:",len(glob.glob("site/_nuxt/*")))

# ---- markdown / text extras ----
for f in glob.glob("site/**/*.md",recursive=True)+glob.glob("site/*.txt")+["site/llms.txt"]:
    if os.path.isfile(f):
        t=open(f,encoding="utf-8",errors="replace").read()
        open(f,"w",encoding="utf-8").write(rw(t))
open("site/__noop.js","w").write("/* analytics blocked in local mirror */\n")

# ---- verify no external media host remains ----
hits={}
for f in glob.glob("site/**/*",recursive=True):
    if not os.path.isfile(f) or os.path.splitext(f)[1] not in (".html",".js",".json",".md",".txt"): continue
    t=open(f,encoding="utf-8",errors="replace").read()
    for h in ("www.datocms-assets.com","image.mux.com","stream.mux.com","graphql.datocms.com","jesperlandberg.com"):
        if h in t: hits.setdefault(h,[]).append(f)
print("remaining external host refs:",{k:len(v) for k,v in hits.items()})
for k,v in hits.items(): print("  ",k,v[:3])
