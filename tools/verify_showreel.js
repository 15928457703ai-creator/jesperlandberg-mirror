/* Check the homepage clip, playback, navigation and mobile layout. */
const {chromium}=require('playwright-core');
const fs=require('fs'), path=require('path');
const origin=process.env.PREVIEW_ORIGIN||'http://127.0.0.1:5200';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'||/hydration.*mismatch/i.test(m.text()))errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{window.__clips=[];const create=document.createElement;document.createElement=function(tag){const el=create.apply(this,arguments);if(String(tag).toLowerCase()==='video')window.__clips.push(el);return el;};});
 await page.goto(origin,{waitUntil:'domcontentloaded'}); await wait(9000);
 const cards=await page.locator('[data-gl="card"]').evaluateAll(els=>els.map(e=>e.dataset.id));
 if(cards.length!==11||cards[1]!=='showreel')throw Error('Homepage video card missing or misplaced');
 const read=()=>page.evaluate(()=>{const v=window.__clips.find(v=>v.src.includes('/showreel/showreel.mp4'));return v&&{time:v.currentTime,paused:v.paused,muted:v.muted,loop:v.loop,ready:v.readyState,width:v.videoWidth,height:v.videoHeight};});
 const before=await read(); await wait(1400); const after=await read();
 if(!after||after.paused||!after.muted||!after.loop||after.time<=before.time)throw Error('Video is not looping and advancing: '+JSON.stringify({before,after}));
 await page.screenshot({path:path.join(__dirname,'../screenshots/home_showreel.png')});
 await page.locator('[data-gl="card"][data-id="showreel"]').evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 await wait(2600);
 if(!page.url().includes('/projects/showreel')||!await page.locator('[data-gl="sheet"][data-id="showreel"]').count())throw Error('Video card navigation failed');
 await page.screenshot({path:path.join(__dirname,'../screenshots/showreel_detail.png')});
 await page.goto(origin+'/projects/showreel',{waitUntil:'domcontentloaded'});await wait(3000);
 await page.setViewportSize({width:390,height:844});await page.goto(origin,{waitUntil:'domcontentloaded'});await wait(5000);
 await page.screenshot({path:path.join(__dirname,'../screenshots/home_showreel_mobile.png')});
 if(!await page.locator('[data-gl="card"][data-id="showreel"]').count())throw Error('Mobile card missing');
 if(errors.length)throw Error(JSON.stringify(errors));
 const report={cards,before,after,errors};fs.writeFileSync(path.join(__dirname,'../raw/verify_showreel.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
