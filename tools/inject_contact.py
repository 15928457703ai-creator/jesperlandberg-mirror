"""Replace Newsletter content with WeChat, retaining its native animated rim."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OLD = ' An occasional newsletter with insights and thoughts from a design engineer, drawn from over a decade of freelancing. '
COPY = '扫码微信联系我\n15928457703/345434367@qq.com'
BOX_CLASS = 'contact-qr invisible relative bg-black'
IMAGE = '<div class="contact-qr-crop"><img src="/contact/wechat.jpg" alt="微信二维码，扫码添加好友" class="contact-qr-image"></div>'
MARKUP = '<div class="' + BOX_CLASS + '" role="img" aria-label="微信二维码">' + IMAGE + '</div>'
COMPONENT = '''Nz={__name:"WeChatQR",setup(n,{expose:e}){const{$folio:s}=gt(),r=rt(null);let resolve;const ready=new Promise(done=>resolve=done);Rn(async()=>{await ti();await s.booted;if(!r.value?.isConnected)return resolve(null);const box=s.pill(r.value,{over:!0,group:"news",glow:!0});box.chroma=1;s.contactQR=box;resolve({box})});e({ready,email:"",focus:()=>{},refreshGhost:()=>{},reset:()=>{}});return()=>ct("div",{ref:r,class:"contact-qr invisible relative bg-black",role:"img","aria-label":"微信二维码"},[ct("div",{class:"contact-qr-crop"},[ct("img",{src:"/contact/wechat.jpg",alt:"微信二维码，扫码添加好友",class:"contact-qr-image"})])])}},'''
for file in [ROOT/'raw/nuxt/DZyj3ghP.js', ROOT/'site/_nuxt/DZyj3ghP.js']:
    text=file.read_text()
    start=text.index('Nz={__name:')
    end=text.index('Oz=["disabled"]',start)
    text=text[:start]+COMPONENT+text[end:]
    text=text.replace('微信联系\\n159', '扫码微信联系我\\n159')
    text=text.replace(' Scan the QR code to connect on WeChat. ',COPY.replace('\n','\\n')).replace(OLD,COPY.replace('\n','\\n'))
    blurb=re.search(r'ct\("p",\{ref_key:"blurb".*?,512\)',text).group(0)
    replacement=blurb.replace('class:"text-14 ', 'class:"contact-details text-14 ')
    # Insert below the QR form while keeping the original native text ref.
    text=text.replace(blurb+',','').replace('],40,zz),ct("p",Hz','],40,zz),'+replacement+',ct("p",Hz')
    text=text.replace(OLD,COPY.replace('\n','\\n')).replace('De(d)?"Close":"Newsletter"','De(d)?"Close":"Contact Me"').replace('{title:"Newsletter"}','{title:"Contact Me"}')
    text=text.replace('Mt(Je,{ref_key:"send",ref:u,busy:De(_)||De(v)},null,8,["busy"]),','')
    file.write_text(text)
for file in list((ROOT/'raw/pages').glob('*.html'))+list((ROOT/'raw/templates').glob('*.html')):
    text=file.read_text().replace('微信联系\n159','扫码微信联系我\n159').replace(' Scan the QR code to connect on WeChat. ',COPY).replace(OLD,COPY).replace('>Newsletter</button>','>Contact Me</button>')
    text=re.sub(r'<div class="invisible relative flex h-40 s:h-45.*?</div>(?=<button type="submit")',lambda _:MARKUP,text,flags=re.S)
    text=re.sub(r'<button type="submit" aria-label="Subscribe".*?</button>','',text,flags=re.S)
    blurb=re.search(r'<p data-gl="text" class="(?:contact-details )?text-14 leading-14 tracking-\[-0.02em\] max-w-\[30rem\].*?</p>',text,re.S)
    if blurb:
        block=blurb.group(0).replace('class="text-14 ', 'class="contact-details text-14 ')
        text=text[:blurb.start()]+text[blurb.end():]
        text=text.replace('</form><p role="status"','</form>'+block+'<p role="status"')
    file.write_text(text)
css_path=ROOT/'site/local-copy.css'
text=css_path.read_text()
start='/* === Contact Me QR === */'
if start in text:text=text[:text.index(start)].rstrip()+'\n'
text+='''
/* === Contact Me QR === */
div.fixed.inset-0.z-40 button.absolute.bottom-0.right-0 { text-transform: none; }
[data-gl-shield]:has(.contact-qr) form {
  justify-content: center; margin-top: 0; max-width: 100%;
}
[data-gl-shield]:has(.contact-qr) > p[role="status"] { display: none; }
.contact-details {
  margin-top: 20px; white-space: pre-line; text-align: center;
  font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px; line-height: 1.8; color: white;
}
.contact-qr {
  width: min(300px, calc(100vw - 88px), calc(100svh - 220px));
  height: min(300px, calc(100vw - 88px), calc(100svh - 220px));
  flex: none; border-radius: 28px; padding: 12px; box-sizing: border-box;
}
.contact-qr-crop {
  position: relative; width: 100%; height: 100%; overflow: hidden;
  border-radius: 18px; background: white; visibility: hidden;
  opacity: 0; transform: scale(.8); transition: opacity .22s, transform .35s;
}
/* Display only the QR region, retaining the original image and its quiet zone. */
.contact-qr-image {
  position: absolute; width: 134.545455%; max-width: none; height: auto;
  left: -17.272727%; top: -42.727273%; visibility: inherit;
}
div.fixed.z-40:not([inert]) .contact-qr-crop {
  opacity: 1; visibility: visible; transform: scale(1); transition-delay: .2s;
}
@media (prefers-reduced-motion: reduce) {
  .contact-qr-crop { transition: none; transform: none; }
}
'''
css_path.write_text(text)
print('Contact Me sources updated; original native pill shader retained')
