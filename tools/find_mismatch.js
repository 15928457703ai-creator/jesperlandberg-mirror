const { chromium } = require('playwright-core');
const fs=require('fs'),path=require('path');
const O='http://127.0.0.1:5188'; const OUT=path.join(__dirname,'..','raw','mismatch'); fs.mkdirSync(OUT,{recursive:true});
const PAGES=['/','/newsletter','/projects/oppo-service'];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 for(const p of PAGES){
   const name=p==='/'?'home':p.replace(/\//g,'_');
   // SSR only
   let c=await b.newContext({viewport:{width:1440,height:900},javaScriptEnabled:false});
   let pg=await c.newPage(); await pg.goto(O+p,{waitUntil:'domcontentloaded'}); await wait(400);
   const ssr=await pg.evaluate(()=>document.querySelector('#__nuxt').innerHTML); await c.close();
   // hydrated, with Vue mismatch details flag
   c=await b.newContext({viewport:{width:1440,height:900}});
   await c.addInitScript(()=>{ try{ globalThis.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__=true; }catch(e){} });
   pg=await c.newPage(); const logs=[];
   pg.on('console',m=>{if(m.type()==='error'||m.type()==='warning'||m.type()==='warn')logs.push(m.type()+': '+m.text().slice(0,600))});
   await pg.goto(O+p,{waitUntil:'domcontentloaded'}); await wait(2600);
   const hyd=await pg.evaluate(()=>document.querySelector('#__nuxt').innerHTML);
   fs.writeFileSync(path.join(OUT,name+'_ssr.html'),ssr);
   fs.writeFileSync(path.join(OUT,name+'_hyd.html'),hyd);
   fs.writeFileSync(path.join(OUT,name+'_logs.txt'),logs.join('\n'));
   console.log('\n==',p,'== ssr',ssr.length,'hyd',hyd.length,'logs:',logs.length);
   logs.slice(0,4).forEach(l=>console.log('   ',l.slice(0,300)));
   await c.close();
 }
 await b.close();
})();
