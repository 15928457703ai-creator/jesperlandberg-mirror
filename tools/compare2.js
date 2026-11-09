const { chromium } = require('playwright-core');
const fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'..','screenshots','compare'); fs.mkdirSync(OUT,{recursive:true});
const PAGES=['/','/full','/projects/nathan-riley'];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function shoot(browser,base,p,name){
  const c=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,ignoreHTTPSErrors:true});
  const pg=await c.newPage();
  await pg.goto(base+p,{waitUntil:'domcontentloaded',timeout:60000});
  await wait(1800);
  for(let i=0;i<5;i++){ await pg.mouse.move(720,450); await pg.mouse.wheel(0,380); await wait(180); }
  await wait(900);
  await pg.screenshot({path:path.join(OUT,name+'_'+(p==='/'?'home':p.replace(/\//g,'_'))+'.png')});
  await c.close();
}
(async()=>{
 const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 for(const p of PAGES){ await shoot(b,'https://jesperlandberg.com',p,'after_original'); await shoot(b,'http://127.0.0.1:5188',p,'after_mirror'); console.log('shot',p); }
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
