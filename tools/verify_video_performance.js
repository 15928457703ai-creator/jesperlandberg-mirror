const {chromium}=require('playwright-core'),fs=require('fs'),path=require('path');
const origin=process.env.PROFILE_ORIGIN||'http://127.0.0.1:5252/jesperlandberg-mirror/';
(async()=>{const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});const report=[];try{for(const mobile of [false,true]){
const p=await b.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
await p.addInitScript(()=>{window.__fullEvents=[];for(const op of ['play','pause']){const native=HTMLMediaElement.prototype[op];HTMLMediaElement.prototype[op]=function(){if(this.src.includes('intro-v4-web'))window.__fullEvents.push({op,time:this.currentTime,at:performance.now()});return native.apply(this,arguments)}}});
await p.goto(origin);await p.waitForFunction(()=>!document.querySelector('[data-gl="bar"]'));await p.waitForTimeout(600);
const cards=await p.locator('[data-gl="card"]').evaluateAll(els=>els.map(e=>e.dataset.id));if(cards.length!==9||cards.includes('griflan')||cards.includes('the-lookback'))throw Error('Retired cards remain');
const entries=[];
for(let entry=0;entry<2;entry++){
 await p.locator('[data-gl="card"][data-id="showreel"]').dispatchEvent('click');await p.waitForURL('**/projects/showreel');await p.waitForFunction(()=>{const v=window.PortfolioMotion.getAboutVideo();return v.readyState>=3&&!v.paused});await p.waitForTimeout(900);
 const read=()=>p.evaluate(()=>{const v=window.PortfolioMotion.getAboutVideo();return{time:v.currentTime,paused:v.paused,muted:v.muted,ready:v.readyState,events:window.__fullEvents.slice(),playing:[...document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio.videos.values()].filter(x=>!x.el.paused).map(x=>x.el.src)}});
 const start=await read();await p.waitForTimeout(1800);const after=await read();if(after.time<=start.time||after.muted||after.paused)throw Error('Video failed '+JSON.stringify({start,after}));
 const extraPauses=after.events.filter(e=>e.op==='pause').length-start.events.filter(e=>e.op==='pause').length;if(extraPauses)throw Error('Repeated pauses during playback');
 const beginnings=start.events.filter(e=>e.op==='play'&&e.time<.25);if(beginnings.length<entry+1)throw Error('Video did not restart at zero');
 await p.getByRole('button',{name:'暂停视频'}).click();await p.waitForTimeout(150);if(!await p.evaluate(()=>window.PortfolioMotion.getAboutVideo().paused))throw Error('Pause failed');
 await p.getByRole('button',{name:'播放视频'}).click();await p.getByRole('slider',{name:'播放进度'}).evaluate(el=>{el.value='300';el.dispatchEvent(new Event('input',{bubbles:true}))});await p.waitForTimeout(300);
 await p.locator('[aria-label="Close project"] > span').click({force:true});await p.waitForURL(origin.replace(/\/$/,'')+'/');await p.waitForTimeout(800);
 const closed=await read();if(!closed.paused||!closed.muted||closed.time!==0)throw Error('Video not stopped after leaving '+JSON.stringify(closed));entries.push({entry,start,after,closed});
}
await p.goto(origin+'projects/oppo-service/');await p.waitForFunction(()=>!document.querySelector('[data-gl="bar"]'));await p.waitForTimeout(1700);
const loading=await p.evaluate(()=>{const f=document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;return{totalSlides:f.content.length,loadedSlides:f.content.filter(i=>i.mesh.material.uniforms.u_texture.value?.image?.src&&!i.mesh.material.uniforms.u_texture.value.image.src.startsWith('data:')).length,requests:performance.getEntriesByType('resource').length,bytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.transferSize,0)}});
if(loading.totalSlides!==18||loading.loadedSlides>5||loading.loadedSlides<1)throw Error('Lazy loading failed '+JSON.stringify(loading));
await p.mouse.move(200,300);await p.mouse.wheel(0,1600);await p.waitForTimeout(1500);
const afterScroll=await p.evaluate(()=>{const f=document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;return f.content.filter(i=>i.mesh.material.uniforms.u_texture.value?.image?.src&&!i.mesh.material.uniforms.u_texture.value.image.src.startsWith('data:')).length});if(afterScroll<=loading.loadedSlides)throw Error('Scrolling did not load further images');
if(errors.length)throw Error(errors.join('\n'));report.push({mobile,cards,entries,loading,afterScroll});console.log('PASS',mobile?'mobile':'desktop','video restarts twice at zero, no repeated pauses, controls work, inactive clip stops; lazy slides',loading.loadedSlides,'of',loading.totalSlides,'→',afterScroll);await p.close();
}fs.writeFileSync(path.join(__dirname,'../raw/verify_video_performance.json'),JSON.stringify(report,null,2)+'\n')}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
