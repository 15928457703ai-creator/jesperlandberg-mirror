const { chromium } = require('playwright-core');
const fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'..','screenshots');
const ORIGIN='http://127.0.0.1:5188';
const PAGES=['/','/full','/newsletter','/projects/nathan-riley','/projects/casa-di-solare','/projects/the-lookback','/projects/book-of-happiness','/projects/dogelon-mars','/projects/gil-huybrecht','/projects/discoveryland','/projects/griflan'];
const bad=[],ext=[],perr=[],cerr=[],stats={};
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const page=await ctx.newPage();
 page.on('pageerror',e=>perr.push(e.message.slice(0,240)));
 page.on('console',m=>{if(m.type()==='error')cerr.push(m.text().slice(0,240))});
 // A page transition cancels in-flight media requests; ERR_ABORTED is the
 // browser doing that, not a missing asset (curl re-checks confirm 200).
 page.on('requestfailed',r=>{const e=(r.failure()||{}).errorText||'';
   if(!/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(e)) bad.push('FAILED '+r.url()+' :: '+e)});
 page.on('response',r=>{
   const u=r.url();
   if(!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u);
   if(r.status()>=400) bad.push(r.status()+' '+u);
   const h=new URL(u).host; stats[h]=(stats[h]||0)+1;
 });
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 for(const p of PAGES){
   await page.goto(ORIGIN+p,{waitUntil:'domcontentloaded',timeout:60000});
   await wait(1700);
   for(let i=0;i<5;i++){ await page.mouse.move(720,450); await page.mouse.wheel(0,380); await wait(180); }
   await wait(700);
   const info=await page.evaluate(()=>({canvas:document.querySelectorAll('canvas').length,
     gl:!!document.querySelector('canvas')?.getContext('webgl2')||!!document.querySelector('canvas')?.getContext('webgl'),
     cards:document.querySelectorAll('[data-gl="card"]').length,
     title:document.title, body:document.body.innerText.slice(0,80)}));
   console.log(p.padEnd(34),JSON.stringify(info));
   if(['/','/full','/projects/nathan-riley','/newsletter'].includes(p)){
     await page.screenshot({path:path.join(OUT,(p==='/'?'home':p.replace(/\//g,'_'))+'.png')});
   }
 }
 // SPA transition test
 await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'}); await wait(1600);
 try{
   await page.locator('[data-gl="card"]').first().click({force:true,timeout:6000});
   await wait(2200);
   console.log('SPA click ->',page.url());
   await page.screenshot({path:path.join(OUT,'spa_transition.png')});
   await page.goBack({waitUntil:'domcontentloaded'}); await wait(1400);
   console.log('back ->',page.url());
 }catch(e){console.log('SPA click error',e.message.slice(0,150))}
 console.log('\n=== VERIFY SUMMARY ===');
 console.log('request hosts:',JSON.stringify(stats,null,1));
 console.log('bad/4xx/failed:',bad.length,bad.slice(0,15));
 console.log('external requests:',ext.length,[...new Set(ext)].slice(0,15));
 console.log('page errors:',perr.length,perr.slice(0,10));
 console.log('console errors:',cerr.length,cerr.slice(0,10));
 fs.writeFileSync(path.join(__dirname,'..','raw','verify.json'),JSON.stringify({bad,ext,perr,cerr,stats},null,1));
 await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
