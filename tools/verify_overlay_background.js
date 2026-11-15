const {chromium}=require('playwright-core');
const origin=process.env.PROFILE_ORIGIN||'http://127.0.0.1:5250/jesperlandberg-mirror/';
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
 try {for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.waitForFunction(()=>!document.querySelector('[data-gl="bar"]'));
  async function check(label){
   await page.waitForTimeout(1100);
   const pos=await page.locator('article[data-id="naivideo"]').evaluate(el=>{const r=el._vrect||el.getBoundingClientRect();return{x:r.left+r.width/2-innerWidth/2,y:r.top+r.height/2-innerHeight/2}});
   if(Math.abs(mobile?pos.y:pos.x)>5)throw Error(label+' Naivideo is not centered: '+JSON.stringify(pos));
   console.log('PASS',mobile?'mobile':'desktop',label,JSON.stringify(pos));
  }
  for(const label of ['Profile','Contact Me']){
   await page.mouse.move(200,300);await page.mouse.wheel(0,900);await page.waitForTimeout(1200);
   await page.getByRole('button',{name:label,exact:true}).click({force:true});await check(label);
   await page.screenshot({path:'/private/tmp/overlay-background-'+(mobile?'mobile':'desktop')+'-'+label.replaceAll(' ','')+'.png'});
   if(label==='Profile'){
    await page.getByRole('button',{name:'Contact Me',exact:true}).click({force:true});await check('Profile to Contact Me');
    await page.getByRole('button',{name:'Profile',exact:true}).click({force:true});await check('Contact Me to Profile');
   }
   await page.getByRole('button',{name:/^close$/i}).first().click({force:true});await page.waitForTimeout(900);
  }
  await page.goto(origin+'newsletter/');await page.waitForFunction(()=>!document.querySelector('[data-gl="bar"]'));await check('direct Contact Me URL');
  if(errors.length)throw Error(errors.join('\n'));
  await page.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
