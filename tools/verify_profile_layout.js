const {chromium}=require('playwright-core');
const path=require('path');
const base=process.env.PROFILE_ORIGIN||'http://127.0.0.1:5250/jesperlandberg-mirror/';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base,{waitUntil:'domcontentloaded'});await wait(8500);
 await page.getByRole('button',{name:'Profile'}).click({force:true});await wait(2200);
 for(const [width,height,name] of [[1440,900,'desktop'],[1100,680,'compact'],[390,844,'mobile']]){
  await page.setViewportSize({width,height});await wait(1200);
  const info=await page.evaluate(()=>{
   const phone=document.querySelector('.profile-phone'),disc=phone.closest('div.fixed.z-40'),bio=disc.querySelector('p[data-gl="text"]');
   return {bio:getComputedStyle(bio).fontSize,phone:getComputedStyle(phone).fontSize,text:phone.textContent,disc:disc.getBoundingClientRect().width,phoneWidth:phone.getBoundingClientRect().width,copyWidth:phone.parentElement.getBoundingClientRect().width,copy:bio.textContent,headings:[...bio.querySelectorAll('strong')].map(e=>e.textContent),newsletter:document.querySelector('p[class*="max-w-[30rem]"]').closest('div.fixed.z-40').getBoundingClientRect().width};
  });
  console.log(name,JSON.stringify(info));
  if(!info.copy.includes('PC/App/小程序')||!info.copy.includes('GPT、MJ、SD、Workbuddy')||info.headings.length!==4||!info.copy.includes('Lottie动效设计')||info.bio!=='14px'||info.phone!=='16px'||info.text!=='call me 15928457703'||info.disc!==info.newsletter||info.phoneWidth>info.copyWidth)throw Error('Profile layout failed');
  await page.screenshot({path:path.join(__dirname,'../screenshots/profile_'+name+'_updated.png')});
 }
 await page.getByRole('button',{name:'CLOSE'}).click({force:true});await wait(1000);
 if(await page.locator('div.fixed.z-40:not([inert]) .profile-phone').count())throw Error('Profile close failed');
 if(errors.length)throw Error(JSON.stringify(errors));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
