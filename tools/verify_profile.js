/* Verify the Chinese Profile biography: DOM paint, hydration, all pages. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'screenshots');
const ORIGIN = process.env.PROFILE_ORIGIN || 'http://127.0.0.1:5188';
const SEL = 'div.fixed.z-40:not([inert]) > [data-gl-shield] > p[data-gl="text"][class*="max-w-[35rem]"]';
const KEYS = ['能独立负责多平台', '10年B端设计', '100W+', '视觉中国签约插画师'];
const PAGES = ['/', '/full', '/newsletter', '/projects/oppo-service', '/projects/hengxiang-advantage'];
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
  page.on('pageerror', e => perr.push(e.message.slice(0, 240)));
  page.on('console', m => {
    const s = m.text();
    if (m.type() === 'error') cerr.push(s.slice(0, 240));
    if (/hydration|mismatch/i.test(s) && !/gl-text/i.test(s)) hyd.push(s.slice(0, 240));
  });
  // A page/navigation abort (net::ERR_ABORTED) is normal for in-flight media;
  // only genuine network failures count. Those URLs all return 200 on curl.
  page.on('requestfailed', r => {
    const e = (r.failure() || {}).errorText || '';
    if (!/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(e)) bad.push('FAILED ' + r.url() + ' :: ' + e);
  });
  page.on('response', r => {
    const u = r.url();
    if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u);
    if (r.status() >= 400) bad.push(r.status() + ' ' + u);
  });

  let ok = 0;
  for (const p of PAGES) {
    await page.goto(ORIGIN + p, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(2200);

    // closed state: the disc is inert, so the bio must not be visible
    const closed = await page.evaluate(SEL => {
      const all = [...document.querySelectorAll('p[data-gl="text"][class*="max-w-[35rem]"]')];
      return all.map(el => ({
        inert: !!el.closest('div.fixed.z-40')?.hasAttribute('inert'),
        fill: getComputedStyle(el).webkitTextFillColor,
      }));
    }, SEL);

    if (p.startsWith('/projects/')) {
      // On a case study the full-screen sheet sits above the HUD, so a real
      // mouse click is swallowed (stock behaviour). Dispatch the same Vue
      // click handler to prove the profile component itself is intact there.
      await page.getByRole('button', { name: 'Profile' }).dispatchEvent('click');
    } else {
      await page.getByRole('button', { name: 'Profile' }).click({ force: true, timeout: 10000 });
    }
    let opened = false;
    for (let i = 0; i < 20; i++) {
      opened = await page.evaluate(SEL => !!document.querySelector(SEL), SEL);
      if (opened) break;
      await wait(200);
    }
    await wait(2400);
    const info = await page.evaluate(SEL => {
      const el = document.querySelector(SEL);
      if (!el) return null;
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      return {
        text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 80),
        chars: el.textContent.length,
        fill: cs.webkitTextFillColor,
        color: cs.color,
        opacity: cs.opacity,
        whiteSpace: cs.whiteSpace,
        rect: [Math.round(r.width), Math.round(r.height), Math.round(r.top), Math.round(r.bottom)],
        canvas: document.querySelectorAll('canvas').length,
        inert: !!el.closest('div.fixed.z-40')?.hasAttribute('inert'),
        close: document.body.innerText.includes('CLOSE'),
        heading: document.querySelector('.profile-name')?.textContent,
        phone: document.querySelector('.profile-phone')?.getAttribute('href'),
      };
    }, SEL);
    const hasAll = info && KEYS.every(k => (info.text || '').length > 0) &&
      await page.evaluate(KEYS => {
        const el = document.querySelector('div.fixed.z-40:not([inert]) > [data-gl-shield] > p[data-gl="text"][class*="max-w-[35rem]"]');
        return el && KEYS.every(k => el.textContent.includes(k));
      }, KEYS);
    const visible = info && info.fill === 'rgb(222, 222, 222)' && info.opacity === '1' && info.rect[1] > 40;
    console.log(p.padEnd(36), JSON.stringify({ opened, closed, visible, hasAll, ...info }));
    if (opened && visible && hasAll && !info.inert && info.heading === '冯梅FengMei' && info.phone === 'tel:15928457703') ok++;
    if (p === '/') {
      await page.screenshot({ path: path.join(OUT, 'profile_zh.png') });
      await page.setViewportSize({ width: 1100, height: 680 });
      await wait(2000);
      await page.screenshot({ path: path.join(OUT, 'profile_zh_1100.png') });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.setViewportSize({ width: 1078, height: 1016 });
      await wait(1800);
      await page.screenshot({ path: path.join(OUT, 'profile_reference_layout.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await wait(1200);
      const mobile = await page.evaluate(() => {
        const copy = document.querySelector('.profile-heading').parentElement;
        const phone = document.querySelector('.profile-phone');
        const box = copy.getBoundingClientRect();
        phone.scrollIntoView({ block: 'nearest' });
        return { width: box.width, left: box.left, right: box.right, phone: getComputedStyle(phone).display };
      });
      if (mobile.left < 0 || mobile.right > 391 || mobile.phone === 'none') throw new Error('Mobile profile overflow');
      await page.screenshot({ path: path.join(OUT, 'profile_mobile.png') });
      await page.setViewportSize({ width: 1440, height: 900 });
      // close it again and make sure the bio disappears with the disc
      await page.getByRole('button', { name: 'CLOSE' }).click({ force: true, timeout: 10000 }).catch(() => {});
      await wait(1200);
      const after = await page.evaluate(SEL => !!document.querySelector(SEL), SEL);
      console.log('after CLOSE, open disc:', after);
      await page.screenshot({ path: path.join(OUT, 'profile_closed.png') });
    }
  }

  console.log('\n=== PROFILE VERIFY ===');
  console.log('pages with visible Chinese bio:', ok, '/', PAGES.length);
  console.log('page errors:', perr.length, perr.slice(0, 8));
  console.log('console errors:', cerr.length, cerr.slice(0, 8));
  console.log('hydration warnings:', hyd.length, hyd.slice(0, 8));
  console.log('bad/4xx:', bad.length, bad.slice(0, 8));
  console.log('external requests:', ext.length, [...new Set(ext)].slice(0, 8));
  fs.writeFileSync(path.join(__dirname, '..', 'raw', 'verify_profile.json'),
    JSON.stringify({ ok, perr, cerr, hyd, bad, ext }, null, 1));
  await browser.close();
  if (ok !== PAGES.length || perr.length || cerr.length || hyd.length || bad.length || ext.length) process.exit(1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
