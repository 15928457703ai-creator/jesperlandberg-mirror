const { chromium } = require('playwright-core');
const OUT=require('path').join(__dirname,'..','screenshots','compare');
const PAGES=['/','/full','/projects/nathan-riley'];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function shoot(b,base,p,name){
  const c=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,ignoreHTTPSErrors:true});
  const pg=await c.newPage();
  await pg.goto(base+p,{waitUntil:'domcontentloaded',timeout:60000});
  await wait(2500);
  for(let i=0;i<5;i++){ await pg.mouse.move(720,450); await pg.mouse.wheel(0,380); await wait(180); }
  await wait(6000); // let all GSAP easing settle
  await pg.screenshot({path:OUT+'/stable_'+name+'_'+(p==='/'?'home':p.replace(/\//g,'_'))+'.png'});
  await c.close();
}
(async()=>{
 const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 for(const p of PAGES){ await shoot(b,'https://jesperlandberg.com',p,'original'); await shoot(b,'http://127.0.0.1:5188',p,'mirror'); console.log('stable shot',p); }
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
