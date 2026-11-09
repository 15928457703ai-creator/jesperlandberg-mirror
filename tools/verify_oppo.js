const { chromium } = require('playwright-core');
const fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'..','screenshots');
const ORIGIN='http://127.0.0.1:5188';
const bad=[],ext=[],perr=[],cerr=[],media=[];
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const page=await ctx.newPage();
 page.on('pageerror',e=>perr.push(e.message.slice(0,260)));
 page.on('console',m=>{if(m.type()==='error')cerr.push(m.text().slice(0,260))});
 page.on('requestfailed',r=>{if(!r.url().includes('.mp4'))bad.push('FAILED '+r.url()+' :: '+(r.failure()||{}).errorText)});
 page.on('response',r=>{
   const u=r.url();
   if(!u.startsWith(ORIGIN)&&!u.startsWith('data:')&&!u.startsWith('blob:')) ext.push(u);
   if(r.status()>=400) bad.push(r.status()+' '+u);
   if(u.includes('/oppo/')) media.push({u:u.replace(ORIGIN,''),s:r.status()});
 });
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 // home
 await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'}); await wait(2600);
 let info=await page.evaluate(()=>({cards:document.querySelectorAll('[data-gl="card"]').length,
   ids:[...document.querySelectorAll('[data-gl="card"]')].map(x=>x.dataset.id),
   gl:!!document.querySelector('canvas')?.getContext('webgl2')||!!document.querySelector('canvas')?.getContext('webgl')}));
 console.log('HOME:',JSON.stringify(info));
 await page.screenshot({path:path.join(OUT,'oppo_home.png')});
 // click the OPPO card -> SPA transition
 try{
   await page.locator('[data-gl="card"][data-id="oppo-service"]').click({force:true,timeout:8000});
   await wait(2600);
   console.log('AFTER CLICK:',page.url());
 }catch(e){console.log('CLICK ERR',e.message.slice(0,200))}
 let det=await page.evaluate(()=>({
   title:document.title,h1:document.querySelector('h1')?.textContent,
   placeholders:document.querySelectorAll('[data-gl="simple"]').length,
   sheet:document.querySelector('[data-gl="sheet"]')?.dataset.id,
   canvas:document.querySelectorAll('canvas').length,
   body:document.body.innerText.slice(0,120)}));
 console.log('DETAIL:',JSON.stringify(det));
 await page.screenshot({path:path.join(OUT,'oppo_detail_top.png')});
 // scroll through the 10 slides
 for(let i=0;i<8;i++){ await page.mouse.move(720,500); await page.mouse.wheel(0,700); await wait(300); }
 await wait(1200);
 await page.screenshot({path:path.join(OUT,'oppo_detail_scrolled.png')});
 // hover / back
 await page.goBack({waitUntil:'domcontentloaded'}); await wait(1500);
 console.log('BACK:',page.url());
 // full + newsletter
 await page.goto(ORIGIN+'/full',{waitUntil:'domcontentloaded'}); await wait(1800);
 const full=await page.evaluate(()=>({oppo:!!document.querySelector('a[href="/projects/oppo-service"]'),
   links:document.querySelectorAll('a[href^="/projects/"]').length}));
 console.log('FULL:',JSON.stringify(full));
 await page.screenshot({path:path.join(OUT,'oppo_full.png')});
 await page.goto(ORIGIN+'/newsletter',{waitUntil:'domcontentloaded'}); await wait(1500);
 console.log('NEWSLETTER cards:',await page.locator('[data-gl="card"]').count());
 // all 10 oppo image assets
 for(let i=1;i<=10;i++){
   const r=await page.request.get(ORIGIN+'/oppo/'+i+'.jpg'); if(r.status()!==200) bad.push('oppo '+i+' -> '+r.status());
 }
 console.log('\n=== SUMMARY ===');
 console.log('oppo media requests:',media.length,'statuses:',[...new Set(media.map(m=>m.s))]);
 console.log('bad/4xx/failed:',bad.length,bad.slice(0,12));
 console.log('external requests:',ext.length,[...new Set(ext)].slice(0,8));
 console.log('page errors:',perr.length,perr.slice(0,8));
 console.log('console errors:',cerr.length,cerr.slice(0,8));
 fs.writeFileSync(path.join(__dirname,'..','raw','verify_oppo.json'),JSON.stringify({bad,ext,perr,cerr,media},null,1));
 await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
