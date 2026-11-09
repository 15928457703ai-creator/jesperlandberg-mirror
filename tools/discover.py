import os,re,json,urllib.request,urllib.parse,concurrent.futures,collections
BASE="https://jesperlandberg.com"
ROOT=os.getcwd()
os.makedirs("raw/pages",exist_ok=True); os.makedirs("raw/nuxt",exist_ok=True)
UA={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36","Accept":"*/*"}
def get(url, binary=False):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=60) as r:
        b=r.read()
        return b if binary else b.decode("utf-8","replace")
def fetch(url):
    try:
        return url,get(url,True),None
    except Exception as e:
        return url,None,str(e)

# 1. sitemap pages
sm=get(BASE+"/sitemap.xml")
pages=[m.group(1) for m in re.finditer(r"<loc>(.*?)</loc>",sm)]
paths=[urllib.parse.urlparse(p).path for p in pages]
print("pages:",len(paths),paths)

# 2. fetch all page html
def save_html(path):
    url=BASE+path
    fn="raw/pages/"+(path.strip("/").replace("/","__") or "index")+".html"
    try:
        b=get(url,True); open(fn,"wb").write(b); return fn,len(b),None
    except Exception as e: return fn,0,str(e)
with concurrent.futures.ThreadPoolExecutor(8) as ex:
    for fn,n,e in ex.map(save_html,paths): print("html",fn,n,e or "")

# 3. collect all nuxt js / payload urls from html
html="\n".join(open("raw/pages/"+f,encoding="utf-8",errors="replace").read() for f in os.listdir("raw/pages"))
js=set(re.findall(r'/_nuxt/[A-Za-z0-9_.\-]+\.(?:js|css|woff2?|png|svg|webp)',html))
print("\ninitial nuxt assets:",len(js))
for u in sorted(js): print("  ",u)

# 4. recursively resolve chunk references inside JS
seen=set(); queue=list(js); allurls=set(re.findall(r'https?://[^\s"\'`<>\\)]+',html))
pat=re.compile(r'(?:/_nuxt/)?[A-Za-z0-9_\-.]+\.(?:js|css|wasm|ktx2|woff2|png|jpg|webp|svg|glsl|json)')
while queue:
    batch=[u for u in queue if u not in seen]; queue=[]
    if not batch: break
    seen.update(batch)
    with concurrent.futures.ThreadPoolExecutor(10) as ex:
        results=list(ex.map(lambda u:(u,)+fetch(BASE+u)[1:],batch))
    for u,body,err in results:
        if err or not body: print("FAIL",u,err); continue
        name=u.split("/")[-1]
        open("raw/nuxt/"+name,"wb").write(body)
        txt=body.decode("utf-8","replace")
        for m in pat.finditer(txt):
            s=m.group(0)
            cand=s if s.startswith("/_nuxt/") else "/_nuxt/"+s
            if cand not in seen and cand not in queue and re.match(r'^/_nuxt/[A-Za-z0-9_.\-]+\.(js|css|wasm|ktx2|woff2|png|jpg|webp|svg|glsl|json)$',cand):
                queue.append(cand)
        allurls.update(re.findall(r'https?://[^\s"\'`<>\\)]+',txt))
    print("round: fetched",len(batch),"queue next",len(queue),"total seen",len(seen))

print("\nTOTAL nuxt assets:",len(seen))
print("\nHTTP URLs found in JS/HTML (non-jesper, sample):")
other=sorted({u.rstrip('"\'`,;') for u in allurls if 'jesperlandberg.com' not in u})
print(len(other))
for u in other[:60]: print("  ",u[:180])
json.dump({"paths":paths,"nuxt":sorted(seen),"httpurls":sorted(other)},open("raw/discovery.json","w"),indent=1)
