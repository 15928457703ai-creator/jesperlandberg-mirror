import os,re,json,hashlib,urllib.request,urllib.parse,urllib.error,concurrent.futures,glob,sys
BASE="https://jesperlandberg.com"
UA={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36","Accept":"*/*"}
paths=json.load(open("raw/discovery.json"))["paths"]
os.makedirs("assets",exist_ok=True); os.makedirs("site",exist_ok=True)
def get(url,retries=3):
    last=None
    for i in range(retries):
        try:
            req=urllib.request.Request(url,headers=UA)
            with urllib.request.urlopen(req,timeout=120) as r: return r.read(),r.headers.get("content-type","")
        except Exception as e: last=e
    raise last
def save_site(path):
    dest="site"+path
    if os.path.isfile(dest) and os.path.getsize(dest)>0: return path,os.path.getsize(dest),"cached"
    os.makedirs(os.path.dirname(dest),exist_ok=True)
    try:
        b,ct=get(BASE+path); open(dest,"wb").write(b); return path,len(b),ct
    except Exception as e: return path,0,"ERR "+str(e)[:90]

# ---------- site static resources ----------
tm=json.load(open("raw/misc/_textures_manifest.json"))
site_paths=set(tm.values()) | {"/textures/manifest.json"}
site_paths |= {"/basis/basis_transcoder.js","/basis/basis_transcoder.wasm",
               "/models/award.glb","/models/llama.glb",
               "/_nuxt/builds/meta/dae78082-791f-45e5-83d8-7af79c012859.json",
               "/llms.txt","/robots.txt","/sitemap.xml","/index.md","/full.md","/newsletter.md"}
for w in (300,400,500,600,700,800):
    site_paths |= {f"/glyphs/sans-{w}.json",f"/glyphs/sans-{w}.bin"}
for p in paths:
    if p!="/": site_paths.add(p.rstrip("/")+".md")
# from capture
cap=json.load(open("raw/capture.json"))["manifest"]
for u in cap:
    q=urllib.parse.urlparse(u)
    if q.netloc=="jesperlandberg.com" and not q.path.endswith(("_payload.json",)) \
       and q.path not in ("/","/full","/newsletter") and not (q.path.startswith("/projects/") and "." not in q.path.rsplit("/",1)[-1]) \
       and not q.path.startswith("/cdn-cgi/"):
        site_paths.add(q.path)
print("site static paths:",len(site_paths))
with concurrent.futures.ThreadPoolExecutor(10) as ex:
    sres=list(ex.map(save_site,sorted(site_paths)))
ok=[r for r in sres if r[1]>0]; bad=[r for r in sres if r[1]==0]
print("site files ok:",len(ok),"total %.1f MB"%(sum(r[1] for r in ok)/1024/1024),"failed:",len(bad))
for r in bad[:25]: print("   FAIL",r[0],r[2])

# ---------- external media ----------
urls=set()
pat=re.compile(r'https?://[^\s"\'`<>\\)]+')
for f in glob.glob("raw/pages/*.html")+glob.glob("raw/payloads/*.json")+glob.glob("raw/nuxt/*.js"):
    t=open(f,encoding="utf-8",errors="replace").read().replace("\\u002F","/")
    for u in pat.findall(t):
        u=u.rstrip('"\'`,;').replace("\\u0026","&")
        if any(h in u for h in ("www.datocms-assets.com","image.mux.com","stream.mux.com")): urls.add(u)
for u in cap:
    if any(h in u for h in ("www.datocms-assets.com","image.mux.com","stream.mux.com")): urls.add(u)
# add runtime-generated variants: mux thumbnail card params
for u in list(urls):
    if "image.mux.com" in u and "thumbnail.jpg" in u and "?" not in u:
        urls.add(u+"?width=1200&height=630&fit_mode=crop")
def ext_of(p):
    e=os.path.splitext(urllib.parse.urlparse(p).path)[1].lower()
    return e if e in ('.jpg','.jpeg','.png','.webp','.avif','.mp4','.webm','.woff','.woff2','.svg','.gif','.ktx2','.json','.wasm','.js','.css','.bin','.glb') else '.bin'
def save_media(url):
    fn=hashlib.sha1(url.encode()).hexdigest()[:20]+ext_of(url)
    fp="assets/"+fn
    if os.path.isfile(fp) and os.path.getsize(fp)>0: return url,fn,os.path.getsize(fp),"cached"
    try:
        b,ct=get(url); open(fp,"wb").write(b); return url,fn,len(b),ct
    except Exception as e: return url,fn,0,"ERR "+str(e)[:90]
print("\nexternal media urls:",len(urls))
with concurrent.futures.ThreadPoolExecutor(10) as ex:
    mres=list(ex.map(save_media,sorted(urls)))
mok=[r for r in mres if r[1] and r[2]>0]; mbad=[r for r in mres if r[2]==0]
print("media ok:",len(mok),"total %.1f MB"%(sum(r[2] for r in mok)/1024/1024),"failed:",len(mbad))
for r in mbad[:25]: print("   FAIL",r[0][:120],r[3])
man={u:{"file":fn,"size":n,"mime":ct} for u,fn,n,ct in mres if n>0}
byPath={}
for u,meta in man.items():
    q=urllib.parse.urlparse(u); key=q.path+(("?"+q.query) if q.query else "")
    byPath.setdefault(key,meta)
json.dump({"byUrl":man,"byPath":byPath},open("assets/manifest.json","w"),indent=1)
print("byPath keys:",len(byPath))
