/* Compare native Newsletter and Profile tween/shader state, not a DOM imitation. */
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
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.querySelector('[data-gl="bar"]'),null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio.profileTextPlanes?.phone);
  await page.evaluate(async()=>{
   const f=document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
   const gsap=(await import(document.querySelector('script[type="module"]').src)).a6;
   window.__profileCalls=[];window.__profileTweens=[];
   const original=f.showText;
   f.showText=function(plane,visible,delay,options){
    const result=original.apply(this,arguments);
    if(plane&&['profile','news'].includes(plane.group)&&visible){
     const tweens=gsap.getTweensOf(plane);
     tweens.forEach(t=>{t.pause(0);window.__profileTweens.push({plane,tween:t,delay});});
     window.__profileCalls.push({group:plane.group,text:plane.el.textContent.slice(0,30),count:plane.count,delay,duration:tweens[0]?.duration()||0,window:plane.material.uniforms.u_window.value,stagger:plane.material.uniforms.u_stagger.value});
    }
    return result;
   };
  });
  await page.getByRole('button',{name:'Newsletter'}).click({force:true});await wait(1000);
  const news=await page.evaluate(()=>window.__profileCalls.find(c=>c.group==='news'&&c.text.includes('An occasional')));
  if(!news||Math.abs(news.duration-(1.1+(news.count-1)*.075))>.001)throw Error('Could not inspect Newsletter reference');
  await page.evaluate(()=>window.__profileTweens.forEach(({tween})=>tween.totalTime(tween.duration())));
  await page.getByRole('button',{name:'Profile',exact:true}).click({force:true});await wait(1000);
  const info=await page.evaluate(()=>{
   const f=document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio,p=f.profileTextPlanes;
   const n=f.overlay.find(t=>t.group==='news'&&t.el?.matches('p[class*="max-w-[30rem]"]'));
   const body=p.body.el;
   return{calls:window.__profileCalls.filter(c=>c.group==='profile'),sameRenderer:Object.values(p).every(t=>t.constructor===n.constructor&&t.group==='profile'),title:p.title.el.textContent,bold:[...body.querySelectorAll('strong')].map(e=>e.textContent),body:getComputedStyle(body).fontSize,phone:getComputedStyle(p.phone.el).fontSize,domTokens:body.querySelectorAll('.profile-reveal-token').length,shade:f.profileShade?.visible};
  });
  if(!info.sameRenderer||info.calls.length!==3||info.title!=='冯梅 资深设计师'||info.bold.length!==4||info.body!=='14px'||info.phone!=='16px'||info.domTokens)throw Error('Profile is not using native text path: '+JSON.stringify(info));
  if(mode!=='reduced'){
   info.calls.forEach(c=>{const duration=1.1+(c.count-1)*.075;if(Math.abs(c.duration-duration)>.001||Math.abs(c.window-1.1/duration)>.001||Math.abs(c.stagger-.075/duration)>.001)throw Error('Shader timing differs from Newsletter');});
   await page.evaluate(()=>window.__profileTweens.filter(t=>t.plane.group==='profile').forEach(({tween,delay})=>tween.totalTime(Math.max(0,.65-delay))));
   await page.screenshot({path:path.join(__dirname,'../screenshots/profile_motion_'+mode+'_mid.png')});
  }
  await page.evaluate(()=>window.__profileTweens.filter(t=>t.plane.group==='profile').forEach(({tween})=>tween.totalTime(tween.duration())));
  await page.screenshot({path:path.join(__dirname,'../screenshots/profile_motion_'+mode+'_complete.png')});
  await page.getByRole('button',{name:/^close$/i}).click({force:true});await wait(850);
  const closed=await page.evaluate(()=>{
   const f=document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
   return{alpha:Object.values(f.profileTextPlanes).map(t=>t.material.uniforms.u_alpha.value),shade:f.profileShade.visible,inert:f.profileTextPlanes.body.el.closest('div.fixed.z-40').hasAttribute('inert')};
  });
  if(!closed.inert||closed.shade||closed.alpha.some(a=>a>.01))throw Error('Native Profile did not close cleanly');
  await page.evaluate(()=>{window.__profileCalls=[];window.__profileTweens=[];});
  await page.getByRole('button',{name:'Profile',exact:true}).click({force:true});await wait(200);
  const reopened=await page.evaluate(()=>window.__profileCalls.filter(c=>c.group==='profile'));
  if(reopened.length!==3||Math.abs(reopened[0].delay-.2)>.001)throw Error('Native open did not restart correctly');
  await page.getByRole('button',{name:/^close$/i}).click({force:true});await wait(850);
  report.push({mode,reference:news,profile:info,closed,reopened});console.log('PASS',mode,'same native renderer, shaders, tween timing and close/reopen');
  await context.close();
 }
 if(errors.length)throw Error(JSON.stringify(errors));
 fs.writeFileSync(path.join(__dirname,'../raw/verify_profile_motion.json'),JSON.stringify({report,errors},null,2)+'\n');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
