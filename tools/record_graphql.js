const { chromium } = require('playwright-core');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const OUT=path.join(__dirname,'..','raw','graphql'); fs.mkdirSync(OUT,{recursive:true});
const PAGES=['/','/full','/newsletter','/projects/nathan-riley','/projects/the-lookback','/projects/dogelon-mars'];
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const posts=[];
 page.on('request',r=>{ if(r.method()==='POST') posts.push({url:r.url(),body:r.postData()||'',headers:r.headers()}); });
 page.on('response',async r=>{
   const req=r.request(); if(req.method()!=='POST')return;
   const body=req.postData()||''; const key=crypto.createHash('sha1').update(req.url()+'|'+body).digest('hex').slice(0,20);
   try{const b=await r.body(); fs.writeFileSync(path.join(OUT,key+'.json'),JSON.stringify({url:req.url(),postBody:body,headers:req.headers(),status:r.status(),responseHeaders:r.headers(),response:b.toString('base64')},null,1));}catch(e){}
 });
 for(const p of PAGES){
   try{ await page.goto('https://jesperlandberg.com'+p,{waitUntil:'domcontentloaded',timeout:60000}); await new Promise(r=>setTimeout(r,2200)); }catch(e){}
 }
 console.log('POST requests:',posts.length);
 const seen=new Set();
 for(const p of posts){const k=p.url+' | '+(p.body||'').slice(0,160); if(!seen.has(k)){seen.add(k);console.log('  ',p.url,'body:',(p.body||'').slice(0,220));}}
 console.log('cached files:',fs.readdirSync(OUT).length);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
