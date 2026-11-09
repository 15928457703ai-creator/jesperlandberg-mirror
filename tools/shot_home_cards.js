/* Scroll the 3D home strip all the way to the two newly added cards and
   capture the covers actually rendered by WebGL. */
const { chromium } = require('playwright-core');
const path = require('path');
const O = 'http://127.0.0.1:5188';
const OUT = path.join(__dirname, '..', 'screenshots');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
      '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(O + '/', { waitUntil: 'domcontentloaded' }); await wait(2600);
  for (let i = 0; i < 45; i++) {
    await page.mouse.move(720, 500);
    await page.mouse.wheel(0, 2600);
    await wait(90);
  }
  await wait(3000);
  await page.screenshot({ path: path.join(OUT, 'new_home_cards_end.png') });
  // hover far right for the site's pointer-driven parallax
  await page.mouse.move(1390, 460); await wait(1800);
  await page.screenshot({ path: path.join(OUT, 'new_home_cards_hover.png') });
  console.log('saved new_home_cards_end.png / new_home_cards_hover.png');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
