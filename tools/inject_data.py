import os,json,glob,re,shutil
LOCAL="http://127.0.0.1:__PORT__"
RULES=[("https://graphql.datocms.com/",LOCAL+"/__graphql"),("https://graphql.datocms.com",LOCAL+"/__graphql"),
 ("https://static.cloudflareinsights.com",LOCAL+"/__noop"),("https://www.datocms-assets.com",LOCAL),
 ("https://image.mux.com",LOCAL),("https://stream.mux.com",LOCAL),
 ("https://jesperlandberg.com",LOCAL),("http://jesperlandberg.com",LOCAL)]
def rw(s):
    for a,b in RULES: s=s.replace(a,b)
    return s
def rwobj(o):
    if isinstance(o,str): return rw(o)
    if isinstance(o,list): return [rwobj(x) for x in o]
    if isinstance(o,dict): return {k:rwobj(v) for k,v in o.items()}
    return o

SLUG="oppo-service"; TITLE="OPPO 服务小程序"; PID="oppo-service-miniapp-2026"
DESC="OPPO 服务小程序 UI 体验升级：从现状与目标出发重构信息架构，建立品牌色与设计系统，统一服务预约、门店查询与进度追踪等核心流程，关键指标提升 6.74× 与 4.89×。"
DESC_SHORT="OPPO 服务小程序 UI 体验升级，重构服务流程与品牌设计系统。"
TAGS=[("oppo-tag-ux","UI / UX",None),("oppo-tag-brand","OPPO",None),("oppo-tag-year","2026",None)]
META=json.load(open("raw/oppo_images.json"))
paths=json.load(open("raw/discovery.json"))["paths"]

def payload_src(p):
    if p=="/": return "raw/payloads/root.json"
    return "raw/payloads/"+p.strip("/").replace("/","__")+"___payload.json.json"
def payload_dst(p):
    return "site/_payload.json" if p=="/" else "site"+p+"/_payload.json"

def R(d,v):
    d.append(v); return len(d)-1

def inject_devalue(d):
    root_i=next(i for i,o in enumerate(d) if isinstance(o,dict) and 'projects' in o)
    root=d[root_i]; pidx=root['projects']; fidx=root.get('featured')
    # idempotence: drop any earlier injection
    def slug_of(i):
        o=d[i]
        if not isinstance(o,dict) or 'slug' not in o: return None
        s=o['slug']; return d[s] if isinstance(s,int) and s<len(d) else s
    d[pidx]=[i for i in d[pidx] if slug_of(i)!=SLUG]
    if fidx is not None: d[fidx]=[i for i in d[fidx] if slug_of(i)!=SLUG]
    rid=R(d,PID); rslug=R(d,SLUG); rtitle=R(d,TITLE); rdesc=R(d,DESC)
    rnull=R(d,None); rtrue=R(d,True); rfalse=R(d,False); ralt=R(d,"")
    rlink=R(d,None); rawards=R(d,None)
    tagrefs=[]
    for tid,tt,turl in TAGS:
        tagrefs.append(R(d,{"id":R(d,tid),"title":R(d,tt),"url":R(d,turl)}))
    rtags=R(d,tagrefs)
    srcs=[]; smalls=[]; cards=[]; imgs=[]; ratios=[]
    for m in META:
        main="/oppo/"+m["main"]["file"]; small="/oppo/"+m["_small"]["file"]; card="/oppo/"+m["_card"]["file"]
        rs,rt,rc=R(d,main),R(d,small),R(d,card)
        srcs.append(rs); smalls.append(rt); cards.append(rc)
        w,h=m["main"]["width"],m["main"]["height"]; ratios.append((w,h))
        img={"src":rs,"thumb":rt,"card":rc,"width":R(d,w),"height":R(d,h),"alt":ralt,"video":rnull}
        imgs.append(R(d,img))
    rimgs=R(d,imgs)
    w0,h0=ratios[0]
    pobj={"id":rid,"slug":rslug,"featured":rtrue,"title":rtitle,"description":rdesc,
          "awards":rawards,"link":rlink,"outlined":rfalse,"tags":rtags,
          "src":srcs[0],"thumb":smalls[0],"card":cards[0],
          "width":R(d,w0),"height":R(d,h0),"alt":ralt,"video":rnull,"images":rimgs}
    d[pidx].append(R(d,pobj))
    if fidx is not None:
        fobj=dict(pobj); fobj["featured"]=R(d,len(d[fidx]))
        d[fidx].append(R(d,fobj))
    return d

# ---- 1. all Nuxt payloads (fresh from raw, so idempotent) ----
for p in paths:
    src=payload_src(p)
    d=json.load(open(src,encoding="utf-8"))
    d=rwobj(d)
    d=inject_devalue(d)
    dst=payload_dst(p); os.makedirs(os.path.dirname(dst),exist_ok=True)
    open(dst,"w",encoding="utf-8").write(json.dumps(d,ensure_ascii=False,separators=(",",":")))
print("payloads injected:",len(paths))

# ---- 2. new detail-page payload ----
os.makedirs("site/projects/"+SLUG,exist_ok=True)
shutil.copyfile("site/_payload.json","site/projects/"+SLUG+"/_payload.json")
print("detail payload:", "site/projects/"+SLUG+"/_payload.json")

# ---- 3. DatoCMS GraphQL replay ----
G="raw/graphql_localized.json"
g=json.load(open(G,encoding="utf-8"))
g["data"]["projects"]=[x for x in g["data"]["projects"] if x.get("slug")!=SLUG]
media=[]
for m in META:
    w,h=m["main"]["width"],m["main"]["height"]
    media.append({"url":"/oppo/"+m["main"]["file"],"alt":None,"title":None,"width":w,"height":h,
      "focalPoint":{"x":0.5,"y":0.5},"tile":"/oppo/"+m["main"]["file"],
      "small":"/oppo/"+m["_small"]["file"],"card":"/oppo/"+m["_card"]["file"],
      "responsiveImage":None,"video":None})
g["data"]["projects"].append({"id":PID,"slug":SLUG,"title":TITLE,"description":DESC,
  "link":None,"tags":[{"id":a,"title":b,"url":c} for a,b,c in TAGS],"awards":None,
  "media":media,"outlined":False})
g["data"]["home"]["featured"]=[x for x in g["data"]["home"]["featured"] if x.get("id")!=PID]
g["data"]["home"]["featured"].append({"id":PID})
open(G,"w",encoding="utf-8").write(json.dumps(g,ensure_ascii=False,separators=(",",":")))
print("graphql projects:",len(g["data"]["projects"]),"featured:",len(g["data"]["home"]["featured"]),"media:",len(media))

# ---- 4. allow 10 detail images instead of the default 5 ----
for f in ("raw/nuxt/DZyj3ghP.js","site/_nuxt/DZyj3ghP.js"):
    t=open(f,encoding="utf-8",errors="replace").read()
    n=t.replace("Q2=5,","Q2=12,")
    open(f,"w",encoding="utf-8").write(n)
    print("media cap in",f,":", "Q2=12" in n)
