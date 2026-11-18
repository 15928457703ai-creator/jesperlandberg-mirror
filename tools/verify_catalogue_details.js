const {chromium}=require('playwright-core'),fs=require('fs'),path=require('path');
const origin=(process.env.PROFILE_ORIGIN||'http://127.0.0.1:5250/jesperlandberg-mirror/').replace(/\/$/,'');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
 const report=[],errors=[];
 try{for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
  await page.goto(origin+'/full/');await page.waitForFunction(()=>!document.querySelector('[data-gl="bar"]'));
  const projects=await page.evaluate(async(base)=>{const data=await(await fetch(base+'/graphql.json')).json();return data.data.projects},origin);
  const links=await page.locator('main .content-center a').evaluateAll(els=>els.map(e=>({title:e.textContent.trim(),href:e.getAttribute('href')})));
  if(links.length!==9||links.some(l=>/the-lookback|griflan/.test(l.href)))throw Error('Expected 9 active catalogue projects, got '+links.length);
  for(const link of links){
   const slug=link.href.split('/').filter(Boolean).at(-1),expected=projects.find(p=>p.slug===slug);
   if(!expected||expected.title!==link.title)throw Error('List label/href mismatch '+JSON.stringify(link));
   await page.locator('main .content-center a').filter({hasText:link.title}).first().click();
   await page.waitForURL('**/projects/'+slug);await page.waitForTimeout(1900);
   const result=await page.evaluate(slug=>{
    const f=document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
    const sheet=document.querySelector('[data-gl="sheet"][data-id="'+slug+'"]');
    return{slug,title:sheet?.querySelector('h1')?.textContent.trim(),tags:[...sheet.querySelectorAll('[data-gl="pill"] [data-gl="text"]')].map(e=>e.textContent.trim()),slides:sheet.querySelectorAll('[data-gl="simple"]').length,content:f.content.filter(c=>sheet.contains(c.el)).map(c=>({detailSrc:c.mesh.userData.detailSrc,src:c.mesh.material.uniforms.u_texture.value?.image?.currentSrc||c.mesh.material.uniforms.u_texture.value?.image?.src,video:c.mesh.userData.videoSrc,alpha:c.mesh.material.uniforms.u_alpha.value})),controls:!!document.querySelector('[role="group"][aria-label="视频播放控制"]')};
   },slug);
   if(result.title!==expected.title||JSON.stringify(result.tags)!==JSON.stringify(expected.tags.map(t=>t.title))||result.slides!==expected.media.length||result.content.length!==expected.media.length)throw Error('Detail mismatch '+JSON.stringify({expected:expected.title,media:expected.media.length,result}));
   if(slug==='showreel'&&!result.controls)throw Error('Video controls missing');
   for(const [index,c]of result.content.entries()){
    const media=expected.media[index];
    const candidates=[media.url,media.tile,media.small,media.card,media.video?.mp4High,media.video?.mp4Medium,media.video?.thumbnailUrl].filter(Boolean).map(url=>new URL(url,origin).href);
    if(!c.detailSrc||!candidates.includes(new URL(c.detailSrc,origin).href))throw Error('Wrong media for '+slug+' slide '+index+' '+JSON.stringify({c,candidates}));
   }
   report.push({mobile,...result});console.log('PASS',mobile?'mobile':'desktop',link.title,'→',slug,result.slides+' slides');
   await page.locator('[aria-label="Close project"] > span').click({force:true});await page.waitForTimeout(1000);await page.getByRole('link',{name:'Full',exact:true}).click();await page.waitForURL('**/full');await page.waitForTimeout(1000);
  }
  await page.close();
 }
 if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync(path.join(__dirname,'../raw/verify_catalogue_details.json'),JSON.stringify({report,errors},null,2)+'\n');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
