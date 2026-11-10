/* Verify the Fengmei rename across all 18 pages + hydration + SPA. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'screenshots');
const ORIGIN = 'http://127.0.0.1:5188';
const OLD = /Jesper\s+Landberg|\bJesper\b|\bLandberg\b/;
const PAGES = ['/', '/full', '/newsletter',
  '/projects/the-lookback',
  '/projects/griflan',
  '/projects/oppo-service', '/projects/naivideo', '/projects/oppo-self-service',
  '/projects/erp', '/projects/csa-service', '/projects/hengxiang-advantage',
  '/projects/illustration', '/projects/ai-video'];
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
           '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const perr = [], cerr = [], hyd = [], bad = [], ext = [];
  page.on('pageerror', e => perr.push(e.message.slice(0, 200)));
  page.on('console', m => {
    const s = m.text();
    if (m.type() === 'error') cerr.push(s.slice(0, 200));
    if (/hydration|mismatch/i.test(s) && !/gl-text/i.test(s)) hyd.push(s.slice(0, 200));
  });
  page.on('requestfailed', r => {
    const e = (r.failure() || {}).errorText || '';
    if (!/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(e)) bad.push('FAILED ' + r.url());
  });
  page.on('response', r => {
    const u = r.url();
    if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u);
    if (r.status() >= 400) bad.push(r.status() + ' ' + u);
  });

  let ok = 0;
  for (const p of PAGES) {
    await page.goto(ORIGIN + p, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(1700);
    const info = await page.evaluate(() => {
      const a = document.querySelector('div.fixed.inset-0.z-40 a.label[href="/"]');
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).join('');
      const metas = [...document.querySelectorAll('meta[content]')].map(m => m.getAttribute('content')).join(' | ');
      return {
        title: document.title,
        hud: a ? a.textContent.trim() : null,
        transform: a ? getComputedStyle(a).textTransform : null,
        htmlHasOld: /Jesper\s+Landberg|\bJesper\b|\bLandberg\b/.test(document.documentElement.outerHTML),
        ldHasOld: /Jesper\s+Landberg|\bJesper\b|\bLandberg\b/.test(ld),
        metaHasOld: /Jesper\s+Landberg|\bJesper\b|\bLandberg\b/.test(metas),
        ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
        siteName: document.querySelector('meta[property="og:site_name"]')?.getAttribute('content'),
        canvas: document.querySelectorAll('canvas').length,
      };
    });
    const good = info.hud === 'Fengmei' && info.transform === 'none' &&
                 !info.htmlHasOld && !info.ldHasOld && !info.metaHasOld && info.canvas === 1;
    if (good) ok++;
    console.log(p.padEnd(38), JSON.stringify({ ...info, ldHasOld: info.ldHasOld, good }));
    if (p === '/') {
      await wait(1200);
      await page.screenshot({ path: path.join(OUT, 'brand_fengmei_home.png') });
      await page.getByRole('button', { name: 'Profile' }).click({ force: true, timeout: 10000 });
      await wait(2400);
      const bio = await page.evaluate(() => {
        const el = document.querySelector('div.fixed.z-40:not([inert]) > [data-gl-shield] > p[class*="max-w-[35rem]"]');
        return el ? { len: el.textContent.length, has4: ['能独立负责多平台', '10年B端设计', '100W+', '视觉中国签约插画师'].every(k => el.textContent.includes(k)), fill: getComputedStyle(el).webkitTextFillColor } : null;
      });
      console.log('profile bio after rename:', JSON.stringify(bio));
      await page.screenshot({ path: path.join(OUT, 'brand_fengmei_profile.png') });
      // SPA round trip: the HUD is re-rendered by the client.
      await page.getByRole('button', { name: 'CLOSE' }).click({ force: true, timeout: 10000 }).catch(() => {});
      await wait(600);
      await page.locator('[data-gl="card"]').first().click({ force: true, timeout: 10000 }).catch(() => {});
      await wait(1800);
      const spa = await page.evaluate(() => ({
        url: location.pathname,
        hud: document.querySelector('div.fixed.inset-0.z-40 a.label[href="/"]')?.textContent.trim(),
      }));
      console.log('SPA round trip:', JSON.stringify(spa));
      await page.goBack({ waitUntil: 'domcontentloaded' }); await wait(1600);
      const back = await page.evaluate(() => ({
        url: location.pathname,
        hud: document.querySelector('div.fixed.inset-0.z-40 a.label[href="/"]')?.textContent.trim(),
      }));
      console.log('back:', JSON.stringify(back));
    }
  }

  console.log('\n=== BRAND VERIFY ===');
  console.log('pages clean:', ok, '/', PAGES.length);
  console.log('page errors:', perr.length, perr.slice(0, 6));
  console.log('console errors:', cerr.length, cerr.slice(0, 6));
  console.log('hydration warnings:', hyd.length, hyd.slice(0, 6));
  console.log('bad/4xx:', bad.length, bad.slice(0, 6));
  console.log('external requests:', ext.length, [...new Set(ext)].slice(0, 6));
  fs.writeFileSync(path.join(__dirname, '..', 'raw', 'verify_brand.json'),
    JSON.stringify({ ok, perr, cerr, hyd, bad, ext }, null, 1));
  await browser.close();
  if (ok !== PAGES.length || perr.length || cerr.length || hyd.length || bad.length || ext.length) process.exit(1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
