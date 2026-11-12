/* Match the Newsletter shader's masked line timing and Profile lifecycle. */
const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path');
const origin=process.env.PROFILE_ORIGIN||'http://127.0.0.1:5250/jesperlandberg-mirror/';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
 const report=[],errors=[];
 try{
 for(const mode of ['desktop','mobile','reduced']){
  const mobile=mode==='mobile';
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,reducedMotion:mode==='reduced'?'reduce':'no-preference'});
  const page=await context.newPage();
  await page.addInitScript(()=>{
   const animate=Element.prototype.animate;
   Element.prototype.animate=function(){const animation=animate.apply(this,arguments);queueMicrotask(()=>{if(animation.id==='profile-newsletter-reveal'){animation.pause();animation.currentTime=0;}});return animation;};
  });
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.querySelector('[data-gl="bar"]'),null,{timeout:60000});
  await page.getByRole('button',{name:'Profile'}).click({force:true});
  await page.waitForSelector('[data-profile-reveal="ready"]',{state:'attached'});
  const info=await page.evaluate(()=>{
   const animations=document.getAnimations().filter(a=>a.id==='profile-newsletter-reveal');
   animations.forEach(a=>{a.pause();a.currentTime=0;});
   const bio=document.querySelector('p[data-gl="text"][class*="max-w-[35rem]"]');
   return{debug:{motion:document.documentElement.hasAttribute('data-profile-motion'),disc:{...bio.closest('div.fixed.z-40').dataset},tokens:bio.querySelectorAll('.profile-reveal-token').length,rect:bio.getBoundingClientRect().toJSON(),all:document.getAnimations().map(a=>a.id),reduced:matchMedia('(prefers-reduced-motion: reduce)').matches},timings:animations.map(a=>({duration:a.effect.getTiming().duration,delay:a.effect.getTiming().delay})),title:document.querySelector('.profile-name').textContent,copy:bio.textContent,bold:[...bio.querySelectorAll('strong')].map(e=>e.textContent),bio:getComputedStyle(bio).fontSize,phone:getComputedStyle(document.querySelector('.profile-phone')).fontSize};
  });
  if(info.title!=='冯梅 资深设计师'||info.bold.length!==4||info.bio!=='14px'||info.phone!=='16px'||!info.copy.includes('Lottie动效设计'))throw Error('Profile copy/layout changed');
  if(mode==='reduced'){
   if(info.timings.length)throw Error('Reduced motion is animated');
   const visible=await page.locator('.profile-name').evaluate(el=>getComputedStyle(el).visibility==='visible');
   if(!visible)throw Error('Reduced-motion copy was hidden');
  }else{
   const delays=[...new Set(info.timings.map(t=>t.delay))].sort((a,b)=>a-b);
   if(delays[0]!==200||delays.length<6||delays.some((d,i)=>i&&d-delays[i-1]!==75)||info.timings.some(t=>t.duration!==1100))throw Error('Newsletter timing mismatch '+JSON.stringify({delays,debug:info.debug}));
   await page.evaluate(()=>document.getAnimations().filter(a=>a.id==='profile-newsletter-reveal').forEach(a=>a.currentTime=650));
   await page.screenshot({path:path.join(__dirname,'../screenshots/profile_motion_'+mode+'_mid.png')});
   await page.evaluate(()=>document.getAnimations().filter(a=>a.id==='profile-newsletter-reveal').forEach(a=>a.finish()));
   await page.screenshot({path:path.join(__dirname,'../screenshots/profile_motion_'+mode+'_complete.png')});
  }
  await page.getByRole('button',{name:'CLOSE'}).click({force:true});await wait(100);
  const stopped=await page.evaluate(()=>document.getAnimations().every(a=>a.id!=='profile-newsletter-reveal')&&!document.querySelector('div.fixed.z-40:not([inert]) .profile-phone'));
  if(!stopped)throw Error('Animations survived close');
  await page.getByRole('button',{name:'Profile'}).click({force:true});await page.waitForSelector('[data-profile-reveal="ready"]',{state:'attached'});
  if(mode!=='reduced'&&!await page.evaluate(()=>document.getAnimations().some(a=>a.id==='profile-newsletter-reveal')))throw Error('Entrance did not replay');
  await page.getByRole('button',{name:'CLOSE'}).click({force:true});await wait(100);
  if(await page.evaluate(()=>document.getAnimations().some(a=>a.id==='profile-newsletter-reveal')))throw Error('Quick close retained reveal');
  report.push({mode,animatedTokens:info.timings.length,delays:[...new Set(info.timings.map(t=>t.delay))],bold:info.bold});
  console.log('PASS',mode,info.timings.length,'animated tokens; close/reopen clean');
  await context.close();
 }
 if(errors.length)throw Error(JSON.stringify(errors));
 fs.writeFileSync(path.join(__dirname,'../raw/verify_profile_motion.json'),JSON.stringify({report,errors},null,2)+'\n');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
