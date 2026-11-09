import os,re,json,hashlib,urllib.request,urllib.parse,concurrent.futures
SRC="raw/captured/61cee4fe57ae89e61690.bin"
OUT="raw/graphql_localized.json"
UA={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36","Accept":"*/*"}
t=open(SRC,encoding="utf-8",errors="replace").read()
norm=t.replace("\\u0026","&").replace("\\u002F","/")
urls=sorted(set(re.findall(r'https?://(?:www\.datocms-assets\.com|image\.mux\.com|stream\.mux\.com)[^\s"\'`,]+',norm)))
DB=json.load(open("assets/manifest.json"))
def ext_of(u):
    e=os.path.splitext(urllib.parse.urlparse(u).path)[1].lower()
    return e if e in ('.jpg','.jpeg','.png','.webp','.avif','.mp4','.webm','.woff2','.svg','.gif','.bin') else '.bin'
def dl(u):
    if u in DB["byUrl"]: return u,0,"cached"
    fn=hashlib.sha1(u.encode()).hexdigest()[:20]+ext_of(u)
    try:
        req=urllib.request.Request(u,headers=UA)
        with urllib.request.urlopen(req,timeout=120) as r: b=r.read(); ct=r.headers.get("content-type","")
        open("assets/"+fn,"wb").write(b)
        return u,len(b),ct,fn
    except Exception as e: return u,0,"ERR "+str(e)[:70],fn
print("urls in DatoCMS response:",len(urls))
new=0; tot=0; bad=[]
with concurrent.futures.ThreadPoolExecutor(12) as ex:
    for r in ex.map(dl,urls):
        if len(r)==3: continue
        u,n,ct,fn=r
        if n>0:
            if u not in DB["byUrl"]: new+=1
            DB["byUrl"][u]={"file":fn,"size":n,"mime":ct}
            q=urllib.parse.urlparse(u); key=q.path+(("?"+q.query) if q.query else "")
            DB["byPath"][key]=DB["byUrl"][u]; DB["byPath"].setdefault(q.path,DB["byUrl"][u])
            tot+=n
        else: bad.append((u,ct))
print("newly downloaded:",new,"%.1f MB"%(tot/1024/1024),"failed:",len(bad))
for u,e in bad[:10]: print("  FAIL",e,u[:130])
json.dump(DB,open("assets/manifest.json","w"),indent=1)
# localize the response itself
out=t
for h in ("https://www.datocms-assets.com","https://image.mux.com","https://stream.mux.com","https://graphql.datocms.com"):
    out=out.replace(h,"http://127.0.0.1:__PORT__")
open(OUT,"w",encoding="utf-8").write(out)
print("localized response:",OUT,len(out),"bytes; remaining external media hosts:",
      sum(out.count(h) for h in ("datocms-assets.com","image.mux.com","stream.mux.com")))
print("byPath keys:",len(DB["byPath"]))
