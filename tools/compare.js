const { chromium } = require('playwright-core');
const fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'..','screenshots','compare'); fs.mkdirSync(OUT,{recursive:true});
const PAGES=['/','/full','/projects/the-lookback'];
const VW=1440,VH=900;
async function shoot(browser,base,p,name){
  const ctx=await browser.newContext({viewport:{width:VW,height:VH},deviceScaleFactor:1,ignoreHTTPSErrors:true});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(base+p,{waitUntil:'domcontentloaded',timeout:60000});
  await new Promise(r=>setTimeout(r,3000));
  const info=await page.evaluate(()=>({
    title:document.title,
    cards:document.querySelectorAll('[data-gl="card"]').length,
    canvas:(()=>{const c=document.querySelector('canvas');return c?{w:c.width,h:c.height,css:c.getBoundingClientRect().width+'x'+c.getBoundingClientRect().height}:null})(),
    h1:document.querySelector('h1')?.textContent||'',
    textLen:document.body.innerText.length,
    links:[...document.querySelectorAll('a[href^="/projects/"]')].map(a=>a.getAttribute('href')).slice(0,12),
  }));
  await page.screenshot({path:path.join(OUT,name+'_'+(p==='/'?'home':p.replace(/\//g,'_'))+'.png')});
  await ctx.close(); return {info,errs};
}
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const result={};
 for(const p of PAGES){
   const a=await shoot(browser,'https://jesperlandberg.com',p,'original');
   const b=await shoot(browser,'http://127.0.0.1:5188',p,'mirror');
   result[p]={original:a,mirror:b};
   console.log('\nPAGE',p);
   console.log('  original:',JSON.stringify(a.info));
   console.log('  mirror  :',JSON.stringify(b.info));
   console.log('  errors  :',a.errs.length,b.errs.length);
 }
 fs.writeFileSync(path.join(OUT,'dom.json'),JSON.stringify(result,null,1));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
