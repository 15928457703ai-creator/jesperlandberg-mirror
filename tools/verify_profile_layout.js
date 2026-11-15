const {chromium}=require('playwright-core');
const path=require('path');
const base=process.env.PROFILE_ORIGIN||'http://127.0.0.1:5250/jesperlandberg-mirror/';
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>!document.querySelector('[data-gl="bar"]'));
 await page.getByRole('button',{name:'Profile',exact:true}).click({force:true});await page.waitForTimeout(2300);
 for(const[width,height,name]of [[1440,900,'desktop'],[1100,680,'compact'],[390,844,'mobile'],[2048,1200,'wide']]){
  await page.setViewportSize({width,height});await page.waitForTimeout(1300);
  const info=await page.locator('.profile-resume').evaluate(resume=>{
   const box=resume.parentElement,disc=box.parentElement,bio=box.querySelector('p[data-gl="text"]');
   const f=document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
   const d=disc.getBoundingClientRect().width*.7,r=box.getBoundingClientRect();
   return {width:r.width,height:r.height,diameter:d,font:getComputedStyle(bio).fontSize,title:box.querySelector('.profile-name').textContent,headings:bio.querySelectorAll('strong').length,bodyClipped:bio.scrollHeight>bio.clientHeight+1,phone:!!box.querySelector('.profile-phone'),download:resume.textContent,glow:f.profileResumePill.glow,chroma:f.profileResumePill.chroma,alpha:f.profileResumePill.mesh.material.uniforms.u_alpha.value};
  });
  if(info.width>info.diameter||info.font!=='14px'||info.headings!==4||info.bodyClipped||info.phone||info.download!=='下载简历'||info.title!=='冯梅 资深设计师'||info.glow!==1||info.chroma!==1||info.alpha<.99)throw Error(JSON.stringify(info));
  console.log('PASS',name,JSON.stringify(info));await page.screenshot({path:path.join(__dirname,'../screenshots/profile_'+name+'_updated.png')});
 }
 if(errors.length)throw Error(errors.join('\n'));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
