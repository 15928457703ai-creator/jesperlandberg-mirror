const { chromium } = require('playwright-core');
const O='http://127.0.0.1:5188';
const P=['/','/full','/newsletter','/projects/griflan','/projects/oppo-service'];
(async()=>{
 const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 for(const p of P){
  const c=await b.newContext({viewport:{width:1440,height:900}}); const pg=await c.newPage();
  const errs=[]; pg.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200))});
  await pg.goto(O+p,{waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,2200));
  console.log(p.padEnd(32),'errors:',errs.length,errs.slice(0,2));
  await c.close();
 }
 await b.close();
})();
