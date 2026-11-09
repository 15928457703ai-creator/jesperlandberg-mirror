import os,json,shutil,re
from PIL import Image
SRC="/Users/soul/Downloads/OPPO 服务小程序"
DST="site/oppo"; ORIG=os.path.join(DST,"originals")
os.makedirs(ORIG,exist_ok=True)
files=sorted([f for f in os.listdir(SRC) if re.match(r'^\d+\.(jpg|png)$',f)],key=lambda x:int(re.search(r'\d+',x).group()))
print("source files:",files)
meta=[]
for f in files:
    im=Image.open(os.path.join(SRC,f)).convert("RGB")
    W,H=im.size
    shutil.copyfile(os.path.join(SRC,f),os.path.join(ORIG,f))
    n=int(re.search(r'\d+',f).group())
    sizes={"":1600,"_small":640,"_card":1200}
    outs={}
    for suffix,w in sizes.items():
        h=round(H*w/W)
        r=im.resize((w,h),Image.LANCZOS)
        name=f"{n}{suffix}.jpg"
        r.save(os.path.join(DST,name),quality=88,optimize=True,progressive=True)
        outs[suffix or "main"]={"file":name,"width":w,"height":h}
    meta.append({"n":n,"source":f,"origWidth":W,"origHeight":H,**outs})
    print(f"  {n:2d}: {W}x{H} -> main {outs['main']['width']}x{outs['main']['height']}, sizes ok")
json.dump(meta,open("raw/oppo_images.json","w"),indent=1,ensure_ascii=False)
print("total generated:",sum(len(os.listdir(DST))-0 for _ in [1]),"files in",DST)
