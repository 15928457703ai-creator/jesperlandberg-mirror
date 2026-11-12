/* Verify the static export under a non-root GitHub Pages base path. */
const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path');
const root=(process.env.PAGES_URL||'http://127.0.0.1:5250/jesperlandberg-mirror/').replace(/\/$/,'');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)requests.push(r.status()+' '+r.url());});
 await page.goto(root+'/',{waitUntil:'domcontentloaded'});await wait(10000);
 const cards=await page.locator('[data-gl="card"]').evaluateAll(els=>els.map(e=>e.dataset.id));
 console.log('Cards:',cards);
 if(cards.length!==11)throw Error('Missing static home cards');
 await page.screenshot({path:path.join(__dirname,'../screenshots/pages_home.png')});
 await page.locator('[data-gl="card"][data-id="showreel"]').click({force:true});await wait(3500);
 if(!page.url().includes('/projects/showreel'))throw Error('Static card navigation failed');
 if(!await page.getByRole('group',{name:'视频播放控制'}).count())throw Error('Playback controls missing');
 await page.getByRole('button',{name:'暂停视频'}).click();
 await page.getByRole('button',{name:'播放视频'}).click();
 await page.locator('[data-gl="related"][data-id="naivideo"] a').dispatchEvent('click');await wait(3500);
 if(!page.url().includes('/projects/naivideo'))throw Error('Static related navigation failed');
 await page.goto(root+'/projects/naivideo/',{waitUntil:'domcontentloaded'});await wait(7000);
 if(!await page.locator('[data-gl="sheet"][data-id="naivideo"]').count())throw Error('Direct detail failed');
 await page.screenshot({path:path.join(__dirname,'../screenshots/pages_detail.png')});
 console.log(JSON.stringify({errors,requests},null,2));
 if(errors.length||requests.length)throw Error('Static publication has browser errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
