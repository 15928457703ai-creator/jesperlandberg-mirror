const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const OUT = path.join(__dirname,'..','raw','captured'); fs.mkdirSync(OUT,{recursive:true});
const manifest = {}; const errors = []; const failed = [];
const BASE='https://jesperlandberg.com';
const PAGES=['/','/full','/newsletter','/projects/nathan-riley','/projects/casa-di-solare','/projects/the-lookback','/projects/book-of-happiness','/projects/dogelon-mars','/projects/gil-huybrecht','/projects/discoveryland','/projects/griflan'];
function fileFor(u){
  const p=new URL(u); const ext=(path.extname(p.pathname)||'.bin').slice(0,10).replace(/[^a-z0-9.]/gi,'');
  return crypto.createHash('sha1').update(u).digest('hex').slice(0,20)+ext;
}
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required','--enable-features=SharedArrayBuffer']});
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,ignoreHTTPSErrors:true});
 const page=await ctx.newPage();
 page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE: '+m.text().slice(0,300))});
 page.on('requestfailed',r=>failed.push(r.url()+' :: '+(r.failure()||{}).errorText));
 page.on('response',async r=>{
   const u=r.url(); if(u.startsWith('data:')||u.startsWith('blob:'))return;
   const h=r.headers();
   if(!manifest[u]) manifest[u]={file:fileFor(u),status:r.status(),mime:h['content-type']||'',size:''};
   try{ const b=await r.body(); if(b&&b.length){ fs.writeFileSync(path.join(OUT,manifest[u].file),b); manifest[u].size=b.length; } }catch(e){}
 });
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 for(const p of PAGES){
   try{
     await page.goto(BASE+p,{waitUntil:'domcontentloaded',timeout:60000});
     await wait(1800);
     // trigger scroll / drag interactions
     for(let i=0;i<6;i++){ await page.mouse.move(720,450); await page.mouse.wheel(0,420); await wait(220); }
     await wait(900);
     const cards=await page.locator('[data-gl="card"]').count();
     if(cards>0){ try{ await page.locator('[data-gl="card"]').first().hover({timeout:2000}); await wait(600);}catch(e){} }
     console.log('visited',p,'cards',cards,'requests',Object.keys(manifest).length);
   }catch(e){ console.log('ERR',p,e.message.slice(0,150)); }
 }
 // SPA navigation: click a card from home to trigger transitions + payload fetch
 try{
   await page.goto(BASE+'/',{waitUntil:'domcontentloaded'}); await wait(1500);
   await page.locator('[data-gl="card"]').first().click({force:true,timeout:5000}); await wait(2200);
   console.log('after card click url:',page.url());
   await page.goBack({waitUntil:'domcontentloaded'}); await wait(1500);
 }catch(e){console.log('click err',e.message.slice(0,150))}
 await wait(1200);
 fs.writeFileSync(path.join(__dirname,'..','raw','capture.json'),JSON.stringify({manifest,errors,failed},null,1));
 const byHost={}; for(const u of Object.keys(manifest)){const h=new URL(u).host;byHost[h]=(byHost[h]||0)+1;}
 console.log('\n=== CAPTURE SUMMARY ===');
 console.log('unique requests:',Object.keys(manifest).length);
 console.log('by host:',JSON.stringify(byHost,null,1));
 console.log('errors:',errors.length,errors.slice(0,12));
 console.log('failed:',failed.length,failed.slice(0,12));
 await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
