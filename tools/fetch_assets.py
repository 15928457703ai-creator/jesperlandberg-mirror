import os,re,json,hashlib,urllib.request,urllib.parse,concurrent.futures,glob
BASE="https://jesperlandberg.com"
os.makedirs("assets",exist_ok=True); os.makedirs("raw/payloads",exist_ok=True)
UA={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36","Accept":"*/*"}
paths=json.load(open("raw/discovery.json"))["paths"]

def get(url):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=90) as r: return r.read(),r.headers.get("content-type","")

def saveone(url):
    fn=hashlib.sha1(url.encode()).hexdigest()[:20]
    p=urllib.parse.urlparse(url); ext=os.path.splitext(p.pathname)[1].lower()
    if ext not in ('.jpg','.jpeg','.png','.webp','.avif','.mp4','.webm','.woff','.woff2','.svg','.gif','.ktx2','.json','.wasm','.js','.css'): ext='.bin'
    fn+=ext
    fp="assets/"+fn
    if os.path.exists(fp) and os.path.getsize(fp)>0: return url,fn,os.path.getsize(fp),"cached"
    try:
        b,ct=get(url); open(fp,"wb").write(b)
        return url,fn,len(b),ct
    except Exception as e: return url,fn,0,"ERR "+str(e)[:80]

# 1. per-page payloads
pls=[BASE+(p.rstrip("/")+"/" if p!="/" else "")+"_payload.json" for p in paths]
pls=[u.replace(BASE+"//",BASE+"/") for u in pls]
def dl_payload(u):
    try:
        b,ct=get(u); name=urllib.parse.urlparse(u).path.strip("/").replace("/","__") or "root"
        open("raw/payloads/"+name+".json","wb").write(b); return u,len(b),""
    except Exception as e: return u,0,str(e)[:80]
with concurrent.futures.ThreadPoolExecutor(8) as ex:
    for u,n,e in ex.map(dl_payload,pls): print("payload",u.replace(BASE,""),n,e)
# root payload
b,_=get(BASE+"/_payload.json"); open("raw/payloads/root.json","wb").write(b)

# 2. collect every media URL from all HTML + all payloads + all JS + capture manifest
urls=set()
media_hosts=("www.datocms-assets.com","image.mux.com","stream.mux.com","www.datocms-assets.com")
pat=re.compile(r'https?://[^\s"\'`<>\\)]+')
for f in glob.glob("raw/pages/*.html")+glob.glob("raw/payloads/*.json")+glob.glob("raw/nuxt/*.js"):
    t=open(f,encoding="utf-8",errors="replace").read()
    # handle devalue escaped slashes in JSON
    t2=t.replace("\\u002F","/")
    for u in pat.findall(t)+pat.findall(t2):
        u=u.rstrip('"\'`,;').replace("\\u0026","&")
        if any(h in u for h in media_hosts): urls.add(u)
if os.path.exists("raw/capture.json"):
    for u in json.load(open("raw/capture.json"))["manifest"]:
        if any(h in u for h in media_hosts): urls.add(u)
# also og/meta images and all datocms assets referenced with query variants
print("\ntotal media urls:",len(urls))
with concurrent.futures.ThreadPoolExecutor(10) as ex:
    res=list(ex.map(saveone,sorted(urls)))
man={}; tot=0; bad=[]
for u,fn,n,ct in res:
    man[u]={"file":fn,"size":n,"mime":ct}; tot+=n
    if n==0: bad.append((u,ct))
json.dump(man,open("assets/manifest.json","w"),indent=1)
print("downloaded %.1f MB in %d files"%(tot/1024/1024,len(man)))
print("failures:",len(bad))
for u,e in bad[:20]: print("  ",e,u[:140])
