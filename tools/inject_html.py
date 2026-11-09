import os,re,json
LOCAL="http://127.0.0.1:__PORT__"
RULES=[("https://graphql.datocms.com/",LOCAL+"/__graphql"),("https://graphql.datocms.com",LOCAL+"/__graphql"),
 ("https://static.cloudflareinsights.com",LOCAL+"/__noop"),("https://www.datocms-assets.com",LOCAL),
 ("https://image.mux.com",LOCAL),("https://stream.mux.com",LOCAL),
 ("https://jesperlandberg.com",LOCAL),("http://jesperlandberg.com",LOCAL)]
def rw(s):
    for a,b in RULES: s=s.replace(a,b)
    return s
SLUG="oppo-service"; TITLE="OPPO 服务小程序"; PID="oppo-service-miniapp-2026"
DESC="OPPO 服务小程序 UI 体验升级：从现状与目标出发重构信息架构，建立品牌色与设计系统，统一服务预约、门店查询与进度追踪等核心流程，关键指标提升 6.74× 与 4.89×。"
DESC_SHORT="OPPO 服务小程序 UI 体验升级，重构服务流程与品牌设计系统。"
TAGS=["UI / UX","OPPO","2026"]
NATHAN_DESC="Nathan is a UK-based digital creative specializing in art direction, surrealist 3D visuals, interactive experiences, and motion design."
META=json.load(open("raw/oppo_images.json"))
paths=json.load(open("raw/discovery.json"))["paths"]

def add_card(t):
    arts=list(re.finditer(r'<article\b[^>]*>.*?</article>',t,re.S))
    last=arts[-1]; block=last.group(0)
    new=block.replace('data-id="griflan"','data-id="'+SLUG+'"')
    new=re.sub(r'aspect-ratio:[^;]+;','aspect-ratio:1600 / 900;',new)
    new=new.replace('>Griflan</span>','>'+TITLE+'</span>')
    t=t[:last.end()]+new+t[last.end():]
    m=re.search(r'<li><a href="/projects/griflan"[^>]*>.*?</li>',t,re.S)
    if m:
        li='<li><a href="/projects/'+SLUG+'">'+TITLE+'</a><!--[--> — '+DESC+'<!--]--></li>'
        t=t[:m.end()]+li+t[m.end():]
    return t

def add_full(t):
    # The original last item (Primland) has no bullet. OPPO becomes the new last
    # item, so Primland must gain a bullet and OPPO must be the bullet-less tail —
    # otherwise Vue reuses v-for DOM by position and hydration mismatches.
    last_a=('<a href="https://ownprimland.com" target="_blank" rel="noopener" '
            'class="pointer-events-auto cursor-pointer whitespace-nowrap text-18 s:text-30 leading-none '
            'tracking-[-0.05em]">Primland</a><!----></span>')
    bullet=('<span class="pointer-events-none absolute left-full top-1/2 ml-12 -translate-x-1/2 '
            '-translate-y-1/2 text-8 leading-none" aria-hidden="true">●</span></span>')
    if last_a in t: t=t.replace(last_a,last_a.replace('<!----></span>',bullet),1)
    item=('<span class="relative flex"><a href="/projects/'+SLUG+'" '
          'class="pointer-events-auto cursor-pointer whitespace-nowrap text-18 s:text-30 leading-none '
          'tracking-[-0.05em]">'+TITLE+'</a><!----></span>')
    marker='<!--]--></div></div><div class="pointer-events-none absolute inset-0">'
    return t.replace(marker,item+marker,1)

# ---- 1. rebuild all existing pages (idempotent) ----
for p in paths:
    src="raw/pages/"+(p.strip("/").replace("/","__") or "index")+".html"
    t=rw(open(src,encoding="utf-8",errors="replace").read())
    if p in ("/","/newsletter"): t=add_card(t)
    if p=="/full": t=add_full(t)
    dst="site/index.html" if p=="/" else "site"+p+".html"
    open(dst,"w",encoding="utf-8").write(t)
print("rebuilt pages:",len(paths),"| cards:",open('site/index.html',encoding='utf-8').read().count('data-gl="card"'))

# ---- 2. new detail page ----
t=rw(open("raw/pages/projects__nathan-riley.html",encoding="utf-8",errors="replace").read())
t=t.replace("Nathan Riley",TITLE).replace(NATHAN_DESC,DESC)
t=t.replace("/projects/nathan-riley","/projects/"+SLUG)
t=t.replace('data-id="nathan-riley" data-gl="sheet"','data-id="'+SLUG+'" data-gl="sheet"')
# featured list wraps around: the next project after the newly appended one is nathan-riley
t=t.replace('data-id="casa-di-solare" data-gl="related"><a href="/projects/casa-di-solare"',
            'data-id="nathan-riley" data-gl="related"><a href="/projects/nathan-riley"')
t=t.replace('aria-label="Next project: Casa Di Solare"','aria-label="Next project: Nathan Riley"')
# external-link pill is absent when project.link is null
t=re.sub(r'<a class="invisible[^>]*aria-label="Visit [^"]*"[^>]*>.*?</a>','<!---->',t,count=1,flags=re.S)
# tag pills: one -> three
m=re.search(r'(<!--\[-->)(<span class="invisible relative inline-flex items-center rounded-full h-\[2em\] px-\[1\.25em\].*?</span></span>)(<!--\]-->)',t,re.S)
if m:
    pill=m.group(2)
    pills=''.join(pill.replace('2023',tag) for tag in TAGS)
    t=t[:m.start()]+'<!--[-->'+pills+'<!--]-->'+t[m.end():]
    print("tag pills:",len(TAGS))
# image placeholders: 4 -> 10
blocks=list(re.finditer(r'<div data-gl="simple"[^>]*></div>',t))
if blocks:
    newdivs=''.join('<div data-gl="simple" style="aspect-ratio:%d / %d;" class="w-full flex-none"></div>'%(x["main"]["width"],x["main"]["height"]) for x in META)
    t=t[:blocks[0].start()]+newdivs+t[blocks[-1].end():]
    print("detail image placeholders:",len(META))
# og image -> first OPPO card
t=re.sub(r'http://127\.0\.0\.1:__PORT__/qmEPTzOaDQBZL5258j01i2mMBkGh3G9BI/thumbnail\.jpg\?width=1200&height=630&fit_mode=crop',
         'http://127.0.0.1:__PORT__/oppo/1_card.jpg',t)
os.makedirs("site/projects",exist_ok=True)
open("site/projects/"+SLUG+".html","w",encoding="utf-8").write(t)
print("detail page written, length",len(t))

# ---- 3. build meta / sitemap / llms / markdown ----
bm=glob="site/_nuxt/builds/meta/dae78082-791f-45e5-83d8-7af79c012859.json"
b=json.load(open(bm))
if "/projects/"+SLUG not in b["prerendered"]: b["prerendered"].append("/projects/"+SLUG)
open(bm,"w").write(json.dumps(b,separators=(",",":")))
# sitemap
sm=open("site/sitemap.xml",encoding="utf-8").read().replace("https://jesperlandberg.com",LOCAL)
if SLUG not in sm:
    entry=("\t<url>\n\t\t<loc>"+LOCAL+"/projects/"+SLUG+"</loc>\n\t\t<lastmod>2026-11-08T00:00:00.000+01:00</lastmod>\n"
           "\t\t<priority>0.8</priority>\n\t</url>\n")
    sm=sm.replace("</urlset>",entry+"</urlset>")
open("site/sitemap.xml","w",encoding="utf-8").write(sm)
# llms.txt
ll=open("site/llms.txt",encoding="utf-8",errors="replace").read()
if SLUG not in ll:
    ll=ll.replace("## Site", "- ["+TITLE+"]("+LOCAL+"/projects/"+SLUG+".md): "+DESC_SHORT+"\n\n## Site")
open("site/llms.txt","w",encoding="utf-8").write(ll)
# markdown content
md="# "+TITLE+"\n\n"+DESC+"\n\n## Slides\n\n"+"\n".join(
    "!["+TITLE+" "+str(x['n'])+"]("+LOCAL+"/oppo/"+x['main']['file']+")" for x in META)+"\n"
open("site/projects/"+SLUG+".md","w",encoding="utf-8").write(md)
for f in ("site/index.md","site/full.md"):
    if os.path.isfile(f):
        s=open(f,encoding="utf-8",errors="replace").read()
        if SLUG not in s:
            s+="\n- ["+TITLE+"]("+LOCAL+"/projects/"+SLUG+".md): "+DESC_SHORT+"\n"
        open(f,"w",encoding="utf-8").write(s.replace("https://jesperlandberg.com",LOCAL))
print("aux files updated")
