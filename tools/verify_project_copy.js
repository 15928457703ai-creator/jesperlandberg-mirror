/* Verify authored titles/tags and the phone Profile backdrop lifecycle. */
const {chromium}=require('playwright-core');
const path=require('path'),fs=require('fs');
const origin=(process.env.PREVIEW_ORIGIN||'http://127.0.0.1:5250/jesperlandberg-mirror').replace(/\/$/,'');
const expected={
 'naivideo':['Naivideo-AI创作工具',['欧美市场','短剧创作','Agent']],
 'oppo-self-service':['OPPO自助服务',['交互/视觉/用研','方案探索','方案输出','方法沉淀','调研/访谈']],
 'erp':['华润ERP',['场景调研','需求分析','方案输出','组件搭建']],
 'csa-service':['CSA客服服务',['调研访谈','方案输出','组件搭建']],
 'hengxiang-advantage':['横向优势',['手绘插画','3D建模渲染','AI视频创作']],
 'ai-video':['AI短视频账号',['百万播放量','主理人','账号主理人']],
 'illustration':['动效设计',['运营动效','UI交互动效','Loading动效','Agent动效']],
 'oppo-service':['OPPO 服务小程序',['线下调研','供应商对接','方案落地']]
};
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
 const errors=[],results=[];
 const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});};
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});watch(page);
 await page.goto(origin+'/projects/naivideo/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!document.querySelector('[data-gl="bar"]'),null,{timeout:60000});
 for(const [slug,[title,tags]] of Object.entries(expected)){
  await page.evaluate(slug=>document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$router.push('/projects/'+slug),slug);
  await page.waitForTimeout(1400);
  const info=await page.evaluate(slug=>{
   const sheet=document.querySelector('[data-gl="sheet"][data-id="'+slug+'"]'),f=document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
   const tags=[...sheet.querySelectorAll('[data-gl="pill"] [data-gl="text"]')].map(e=>e.textContent.trim());
   const native=f.page.filter(t=>t.el?.closest('[data-id="'+slug+'"]')&&t.el.matches('[data-gl="pill"] [data-gl="text"]')).map(t=>({text:t.el.textContent.trim(),canvas:!!t.canvas,alpha:t.material.uniforms.u_alpha.value}));
   const h=sheet.querySelector('h1');return{title:h.textContent,tags,native,titleWidth:h.getBoundingClientRect().width,columnWidth:h.parentElement.getBoundingClientRect().width};
  },slug);
  if(info.title!==title||JSON.stringify(info.tags)!==JSON.stringify(tags)||info.native.length!==tags.length||info.native.some(t=>/[\u3400-\u9fff]/.test(t.text)&&!t.canvas)||info.titleWidth>info.columnWidth+1)throw Error('Project copy failure: '+slug+' '+JSON.stringify(info));
  results.push({slug,...info});console.log('PASS',slug,info.title,info.tags.join(' / '));
  if(slug==='naivideo'||slug==='oppo-self-service')await page.screenshot({path:path.join(__dirname,'../screenshots/project_copy_'+slug+'.png')});
 }
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});watch(mobile);
 await mobile.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await mobile.waitForFunction(()=>!document.querySelector('[data-gl="bar"]'),null,{timeout:60000});await mobile.waitForTimeout(1200);
 const read=()=>mobile.evaluate(()=>{
  const phone=document.querySelector('.profile-phone'),disc=phone.closest('div.fixed.z-40'),shield=phone.parentElement,bio=disc.querySelector('p[data-gl="text"]');
  return{inert:disc.hasAttribute('inert'),shadow:getComputedStyle(shield).boxShadow,body:getComputedStyle(bio).fontSize,phone:getComputedStyle(phone).fontSize};
 });
 const closed=await read();if(!closed.inert||closed.shadow!=='none')throw Error('Closed Profile still shades mobile homepage: '+JSON.stringify(closed));
 await mobile.screenshot({path:path.join(__dirname,'../screenshots/mobile_home_fixed.png')});
 await mobile.getByRole('button',{name:'Profile'}).click({force:true});await mobile.waitForTimeout(1000);
 const opened=await read();if(opened.inert||opened.shadow==='none'||opened.body!=='14px'||opened.phone!=='16px')throw Error('Mobile Profile mismatch: '+JSON.stringify(opened));
 await mobile.screenshot({path:path.join(__dirname,'../screenshots/mobile_profile_updated.png')});
 await mobile.getByRole('button',{name:'CLOSE'}).click({force:true});await mobile.waitForTimeout(1000);
 const after=await read();if(!after.inert||after.shadow!=='none')throw Error('Mobile backdrop survived CLOSE');
 console.log('PASS mobile backdrop lifecycle',JSON.stringify({closed,opened,after}));
 if(errors.length)throw Error(JSON.stringify(errors));
 fs.writeFileSync(path.join(__dirname,'../raw/verify_project_copy.json'),JSON.stringify({results,mobile:{closed,opened,after},errors},null,2)+'\n');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
