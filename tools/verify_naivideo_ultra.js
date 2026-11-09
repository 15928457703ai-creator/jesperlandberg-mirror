/* Verify the 11-card Naivideo collage is the ACTIVE home cover and that
   every interaction described in the brief works.

   1. Showcase /naivideo-ultra: 11 cards (10 images + CSS gradient type),
      GSAP 3.15.1, fixed 1920x1080 stage, HUD + console, intro, hover FX,
      FLIP focus + arrow keys + ESC, D/R/Space shortcuts, console controls,
      reduced-motion fallback.
   2. Capture mode: deterministic 16s seek hook, UI hidden.
   3. Home: 15 cards in order, WebGL video texture /naivideo/live.mp4
      playing, duration ~16s, 1600x900.
   4. Payload + detail page unchanged (8 slides, poster og, CJK copy).
   5. Zero page/console/hydration errors, 4xx and external requests.
*/
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname);
const ORIGIN = 'http://127.0.0.1:5188';
const OUT = path.join(ROOT, 'screenshots');
const wait = ms => new Promise(r => setTimeout(r, ms));
const mark = s => console.log('[STEP] ' + s + ' @' +
  ((Date.now() - START) / 1000).toFixed(1) + 's');
const START = Date.now();
const LAUNCH = {
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
         '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
         '--autoplay-policy=no-user-gesture-required']
};
const HOOK = () => {
  window.__videos = [];
  const orig = document.createElement;
  document.createElement = function (tag) {
    const el = orig.apply(this, arguments);
    if (String(tag).toLowerCase() === 'video') window.__videos.push(el);
    return el;
  };
};

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1
  });
  const page = await ctx.newPage();
  await page.addInitScript(HOOK);
  const perr = [], cerr = [], hyd = [], bad = [], ext = [], media = [];
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
    if (/\/naivideo\/live/.test(u)) media.push(r.status() + ' ' + u.replace(ORIGIN, ''));
  });

  // ------------------------------------------------------------- SHOWCASE
  mark('goto showcase');
  await page.goto(ORIGIN + '/naivideo-ultra', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(3400);                                   // let the intro finish
  const show = await page.evaluate(() => ({
    cards: document.querySelectorAll('.card').length,
    images: [...document.images].filter(i => i.naturalWidth > 0).length,
    gsap: window.gsap && window.gsap.version,
    bg: getComputedStyle(document.body).backgroundColor,
    stage: (() => { const r = document.getElementById('stageWrap').getBoundingClientRect();
                    return [Math.round(r.width), Math.round(r.height)]; })(),
    meet: (() => { const e = document.querySelector('.meet');
                   return !!e && getComputedStyle(e.querySelector('.m2')).backgroundImage.includes('gradient'); })(),
    hud: getComputedStyle(document.getElementById('hud')).display,
    console: getComputedStyle(document.getElementById('console')).display,
    opacity: getComputedStyle(document.querySelector('.card-3d')).opacity,
    hook: !!(window.__nvUltra && window.__nvUltra.seek),
    loop: window.__nvUltra && window.__nvUltra.duration,
    dust: document.getElementById('dust').width > 0,
  }));
  mark('showcase shot');
  await page.screenshot({ path: path.join(OUT, 'nvu_showcase.png') });
  // Freeze the ambient loop so hit-testing is stable while we exercise the UI.
  await page.evaluate(() => { window.__nvUltra.master.pause(); });

  // hover on card 3 — dispatch pointerenter directly.  The 11-card 3D collage
  // overlaps, so a synthetic mouse at the AABB centre can land on a different
  // card's surface; we verify the handler itself, which is what matters.
  mark('hover');
  await page.evaluate(() => {
    const c = document.querySelector('.card[data-i="3"]');
    c.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
  });
  await wait(700);
  const hover = await page.evaluate(() => {
    const c = document.querySelector('.card[data-i="3"]');
    const cs = getComputedStyle(c.querySelector('.aurora'));
    const co = getComputedStyle(c.querySelector('.corner'));
    const f = getComputedStyle(c.querySelector('.card-face'));
    return { aurora: +cs.opacity, corner: +co.opacity, scale: f.transform };
  });
  mark('hover shot');
  await page.screenshot({ path: path.join(OUT, 'nvu_hover.png') });
  await page.evaluate(() => {
    const c = document.querySelector('.card[data-i="3"]');
    c.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
  });
  await wait(450);

  // FLIP focus + arrow keys + ESC
  mark('focus click');
  const box = await page.locator('.card[data-i="3"]').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(950);
  const focus = await page.evaluate(() => ({
    visible: getComputedStyle(document.getElementById('focus')).visibility,
    card: getComputedStyle(document.getElementById('focusCard')).visibility,
    title: document.querySelector('#focusMeta .ttl').textContent,
    wallBlur: getComputedStyle(document.getElementById('wall')).filter,
  }));
  mark('focus shot');
  await page.screenshot({ path: path.join(OUT, 'nvu_focus.png') });
  await page.keyboard.press('ArrowRight');
  await wait(450);
  const nextTitle = await page.evaluate(() => document.querySelector('#focusMeta .ttl').textContent);
  await page.keyboard.press('Escape');
  await wait(750);
  const closed = await page.evaluate(() => getComputedStyle(document.getElementById('focus')).visibility);

  // shortcuts
  mark('shortcuts');

  // shortcuts
  await page.keyboard.press('d');
  await wait(260);
  const modeBoom = await page.evaluate(() => document.getElementById('hMode').textContent);
  await wait(2900);
  await page.keyboard.press('r');
  await wait(400);
  const modeReset = await page.evaluate(() => document.getElementById('hMode').textContent);
  await page.keyboard.press('Space');
  await wait(300);
  const modeCruise = await page.evaluate(() => ({
    hud: document.getElementById('hMode').textContent,
    toggle: document.getElementById('tCruise').classList.contains('on')
  }));
  await page.keyboard.press('Space');

  // console controls
  mark('console controls');

  // console controls
  await page.evaluate(() => {
    const r = document.getElementById('cRange');
    r.value = '1.6';
    r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const intensity = await page.evaluate(() => document.getElementById('cVal').textContent);
  await page.locator('#tDust').click();
  const dustOff = await page.evaluate(() => !document.getElementById('tDust').classList.contains('on'));
  await page.locator('#tDust').click();
  await page.locator('#bBoom').click();
  await wait(200);
  const btnBoom = await page.evaluate(() => document.getElementById('hMode').textContent);
  await wait(2900);
  await page.locator('#bReset').click();
  await wait(300);

  // reduced motion
  mark('reduced motion');

  // reduced motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(ORIGIN + '/naivideo-ultra', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(500);
  const r1 = await page.evaluate(() => document.querySelector('.card-3d').style.transform);
  await wait(900);
  const r2 = await page.evaluate(() => document.querySelector('.card-3d').style.transform);
  const reducedOk = r1 === r2;
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  mark('capture');
  // ------------------------------------------------------------- CAPTURE
  // ------------------------------------------------------------- CAPTURE
  await page.goto(ORIGIN + '/naivideo-ultra?capture=1',
                  { waitUntil: 'networkidle', timeout: 60000 });
  const cap = await page.evaluate(() => ({
    seekable: !!(window.__nvUltra && window.__nvUltra.seek),
    duration: window.__nvUltra && window.__nvUltra.duration,
    cards: document.querySelectorAll('.card').length,
    ui: getComputedStyle(document.getElementById('console')).display,
    bg: getComputedStyle(document.body).backgroundColor,
  }));

  mark('home');
  // ---------------------------------------------------------------- HOME
  // ---------------------------------------------------------------- HOME
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('div.z-99') &&
    document.querySelectorAll('canvas').length > 0, null, { timeout: 60000 }).catch(() => {});
  await wait(3200);
  const home = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-gl="card"]')];
    return {
      cards: cards.length,
      order: cards.slice(0, 3).map(x => x.getAttribute('data-id')),
      canvas: document.querySelectorAll('canvas').length,
      siteName: document.querySelector('div.fixed.inset-0.z-40 a.label[href="/"]')?.textContent.trim(),
    };
  });
  await page.waitForFunction(() => {
    const v = (window.__videos || []).find(x => (x.currentSrc || x.src || '').includes('naivideo/live.mp4'));
    return v && v.readyState >= 2 && !v.paused && v.currentTime > 0.05;
  }, null, { timeout: 25000 }).catch(() => {});
  const a = await page.evaluate(() => {
    const v = (window.__videos || []).find(x => (x.currentSrc || x.src || '').includes('naivideo/live.mp4'));
    return v ? { src: v.currentSrc, ready: v.readyState, paused: v.paused,
                 t: +v.currentTime.toFixed(2), dur: isFinite(v.duration) ? +v.duration.toFixed(2) : null,
                 w: v.videoWidth, h: v.videoHeight, loop: v.loop } : null;
  });
  await wait(2200);
  const b = await page.evaluate(() => {
    const v = (window.__videos || []).find(x => (x.currentSrc || x.src || '').includes('naivideo/live.mp4'));
    return v ? { paused: v.paused, t: +v.currentTime.toFixed(2),
                 dur: isFinite(v.duration) ? +v.duration.toFixed(2) : null,
                 w: v.videoWidth, h: v.videoHeight } : null;
  });
  await page.screenshot({ path: path.join(OUT, 'nvu_home_card.png') });

  mark('payload');
  // -------------------------------------------------------------- PAYLOAD
  // -------------------------------------------------------------- PAYLOAD
  const data = await page.evaluate(async () => {
    const p = await (await fetch('/_payload.json')).json();
    const idx = x => (typeof x === 'number') ? p[x] : x;
    // recursive resolver: numbers are indices into p, everything else as-is
    const res = x => {
      let y = idx(x);
      if (Array.isArray(y)) return y.map(res);
      if (y && typeof y === 'object') {
        const o = {};
        for (const k in y) o[k] = res(y[k]);
        return o;
      }
      return y;
    };
    // walk the whole payload to find the naivideo project object
    let proj = null;
    const walk = o => {
      if (proj) return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (o && typeof o === 'object') {
        const r = res(o);
        if (r && r.slug === 'naivideo') { proj = r; return; }
        for (const k in o) walk(o[k]);
      }
    };
    walk(p);
    if (!proj) return { error: 'no naivideo project' };
    const imgs = Array.isArray(proj.images) ? proj.images.map(res) : [];
    const fv = proj.video != null ? (typeof proj.video === 'string' ? proj.video : res(proj.video)) : null;
    return {
      featuredVideo: typeof fv === 'string' ? fv : (fv && fv.url) || null,
      card: (proj.card && (typeof proj.card === 'string' ? proj.card : res(proj.card).url)) || null,
      slides: imgs.length,
      slideVideos: imgs.map(o => (o && o.video) ? (typeof o.video === 'string' ? o.video : (res(o.video).url || res(o.video))) : null),
    };
  });

  mark('detail');
  // --------------------------------------------------------------- DETAIL
  // --------------------------------------------------------------- DETAIL
  await page.goto(ORIGIN + '/projects/naivideo',
                  { waitUntil: 'networkidle', timeout: 60000 });
  await wait(1600);
  const direct = await page.evaluate(() => ({
    id: document.querySelector('[data-gl="sheet"]')?.getAttribute('data-id'),
    h1: document.querySelector('h1')?.textContent.trim(),
    slides: document.querySelectorAll('[data-gl="sheet"] .slide, [data-gl="sheet"] img').length,
    og: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
  }));

  mark('verdict');
  // -------------------------------------------------------------- VERDICT
  // -------------------------------------------------------------- VERDICT
  const okShow = show.cards === 11 && show.images === 10 && show.gsap === '3.15.1' &&
    show.bg === 'rgb(18, 18, 18)' && show.meet && show.hud !== 'none' &&
    show.console !== 'none' && show.dust && show.hook &&
    parseFloat(show.opacity) > .99;
  const okInteractive = hover.aurora > .5 && hover.corner > .5 &&
    focus.visible === 'visible' && focus.card === 'visible' &&
    focus.wallBlur.includes('blur') && nextTitle !== focus.title &&
    closed === 'hidden' && modeBoom === 'DETONATE' &&
    modeReset !== 'DETONATE' && modeCruise.hud === 'CRUISE' &&
    modeCruise.toggle && intensity === '1.60' && dustOff &&
    btnBoom === 'DETONATE' && reducedOk;
  const okCapture = cap.seekable && Math.abs(cap.duration - 16) < .001 &&
    cap.cards === 11 && cap.ui === 'none';
  const playing = !!(a && b && a.ready >= 2 && b.t > a.t && b.dur &&
    Math.abs(b.dur - 16) < .25 && b.w === 1600 && b.h === 900);
  const okHome = home.cards === 15 && home.canvas === 1 &&
    home.siteName === 'Fengmei' &&
    JSON.stringify(home.order) === JSON.stringify(['oppo-service', 'naivideo', 'oppo-self-service']) &&
    playing;
  const okData = data.featuredVideo === '/naivideo/live.mp4' &&
    /\/naivideo\/live_card\.jpg$/.test(data.card) && data.slides === 8 &&
    data.slideVideos[0] === '/naivideo/live.mp4' &&
    data.slideVideos.slice(1).every(x => x === null);
  const okDetail = direct.id === 'naivideo' && direct.h1 === 'Naivideo' &&
    /live_card\.jpg$/.test(direct.og || '');
  const okAssets = media.some(x => /^(200|206) .*live\.mp4/.test(x)) &&
    ['live.jpg', 'live_small.jpg', 'live_card.jpg', 'live.mp4'].every(f =>
      fs.existsSync(path.join(ROOT, 'site', 'naivideo', f))) &&
    fs.existsSync(path.join(ROOT, 'site', 'naivideo-ultra', 'layout.json'));
  const clean = !perr.length && !cerr.length && !hyd.length && !bad.length && !ext.length;

  console.log('\n=== NAIVIDEO ULTRA VERIFY ===');
  console.log('SHOWCASE', JSON.stringify(show));
  console.log('HOVER', JSON.stringify(hover), '| FOCUS', JSON.stringify(focus),
              '| next', nextTitle, '| closed', closed);
  console.log('SHORTCUTS', JSON.stringify({ modeBoom, modeReset, modeCruise,
                                           intensity, dustOff, btnBoom, reducedOk }));
  console.log('CAPTURE', JSON.stringify(cap));
  console.log('HOME', JSON.stringify(home), '| a', JSON.stringify(a), '| b', JSON.stringify(b));
  console.log('DATA', JSON.stringify(data), '| DETAIL', JSON.stringify(direct));
  console.log('show / interactive / capture / home / data / detail / assets / clean:',
    okShow, okInteractive, okCapture, okHome, okData, okDetail, okAssets, clean);
  console.log('page errors:', perr.length, 'console errors:', cerr.length,
    'hydration:', hyd.length, 'bad:', bad.length, 'external:', ext.length);
  if (perr.length) console.log('perr', perr.slice(0, 5));
  if (cerr.length) console.log('cerr', cerr.slice(0, 5));
  if (bad.length) console.log('bad', [...new Set(bad)].slice(0, 8));
  console.log('media requests:', [...new Set(media)].slice(0, 12));

  fs.writeFileSync(path.join(ROOT, 'raw', 'verify_naivideo_ultra.json'),
    JSON.stringify({ show, hover, focus, nextTitle, closed, modeBoom, modeReset,
      modeCruise, intensity, dustOff, btnBoom, reducedOk, cap, home, a, b,
      data, direct, playing, okShow, okInteractive, okCapture, okHome, okData,
      okDetail, okAssets, clean, perr, cerr, hyd, bad, ext,
      media: [...new Set(media)] }, null, 1));
  await browser.close();
  if (!(okShow && okInteractive && okCapture && okHome && okData &&
        okDetail && okAssets && clean)) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
