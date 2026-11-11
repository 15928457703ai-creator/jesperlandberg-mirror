const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path');
const base=process.env.PREVIEW_ORIGIN||'http://127.0.0.1:5200';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const payload=JSON.parse(fs.readFileSync(path.join(__dirname,'../site/_payload.json')));
 const item=payload.find(x=>x&&typeof x==='object'&&!Array.isArray(x)&&Number.isInteger(x.slug)&&payload[x.slug]==='naivideo');
 const images=payload[item.images].map(i=>payload[i]);
 if(payload[images[0].src]!=='/naivideo/1.jpg'||payload[images[0].video]!==null||payload[images[1].video]!=='/naivideo/live.mp4'||payload[item.video]!=='/naivideo/live.mp4')throw Error('Incorrect slide order or home cover');
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.goto(base+'/projects/naivideo',{waitUntil:'domcontentloaded'});await wait(7500);
 if(await page.locator('[data-gl="sheet"][data-id="naivideo"] [data-gl="simple"]').count()!==8)throw Error('Expected 8 detail slides');
 await page.screenshot({path:path.join(__dirname,'../screenshots/naivideo_intro_first.png')});
 await page.setViewportSize({width:390,height:844});await wait(1500);
 await page.screenshot({path:path.join(__dirname,'../screenshots/naivideo_intro_mobile.png')});
 if(errors.length)throw Error(JSON.stringify(errors));
 console.log('PASS: updated introduction first, live slide second, home motion cover retained, desktop/mobile clean');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
