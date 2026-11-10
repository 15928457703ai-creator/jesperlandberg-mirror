/* Regression for the video-led 插画 case study.
 *
 * The original site's WebGL renderer creates detached <video> elements for
 * media items carrying a `video` field, then uses them as looping textures.
 * An init script records those elements so we can prove the cover clip is
 * really playing (not just a still poster), alongside the usual checks for
 * hydration, CJK copy, slide count, SPA navigation and network isolation.
 */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const ORIGIN = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:5189';
const OUT = path.join(__dirname, '..', 'screenshots');
const SLUG = 'illustration';
const wait = ms => new Promise(r => setTimeout(r, ms));
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
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
    if (/\.mp4|\/illustration\//.test(u)) media.push(r.status() + ' ' + u.replace(ORIGIN, ''));
  });

  const vids = () => page.evaluate(() => (window.__videos || []).map(v => ({
    src: (v.currentSrc || v.src || '').split('/').pop().split('?')[0],
    path: new URL(v.currentSrc || v.src, location.href).pathname,
    ready: v.readyState, paused: v.paused, t: +v.currentTime.toFixed(2),
    w: v.videoWidth, h: v.videoHeight
  })));
  const sheetReady = async () => {
    try {
      await page.waitForFunction(() => {
        const sh = document.querySelector('[data-gl="sheet"]');
        return sh && sh.getAttribute('data-id') === 'illustration' &&
          (sh.querySelector('[data-gl="text"]')?.textContent || '').trim().length > 0;
      }, null, { timeout: 30000 });
      return true;
    } catch (e) { return false; }
  };

  // ---------------------------------------------------------------- home
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 45000 }).catch(() => {});
  await wait(2600);
  const home = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-gl="card"]')];
    const c = cards.find(x => x.getAttribute('data-id') === 'illustration');
    return {
      cards: cards.length, last: cards.at(-1)?.getAttribute('data-id'),
      title: c?.querySelector('[data-title]')?.textContent.trim(),
      hasCss: !!document.querySelector('link[href="/local-copy.css"]'),
      canvas: document.querySelectorAll('canvas').length,
      siteName: document.querySelector('div.fixed.inset-0.z-40 a.label[href="/"]')?.textContent.trim(),
    };
  });
  console.log('HOME', JSON.stringify(home));
  const card = page.locator('[data-gl="card"][data-id="illustration"]');
  // The 3D card strip is wheel-driven (its rail is a transform, so DOM
  // scrollIntoView does not move it) AND loops infinitely.  Stop the moment
  // the last card enters the viewport and sample the clips immediately:
  // wheel inertia wraps the rail back to card #1 within ~1s, so the old
  // fixed 68-wheel + 2.6s wait read the FIRST screen's playing videos and
  // falsely reported illustration's cover.mp4 as paused.
  let reached = false;
  for (let i = 0; i < 95 && !reached; i++) {
    await page.mouse.move(720, 500);
    await page.mouse.wheel(0, 2600);
    await wait(90);
    const r = await page.evaluate(() => {
      const c = document.querySelector('[data-gl="card"][data-id="illustration"]');
      if (!c) return null;
      const b = c.getBoundingClientRect();
      return { left: b.left, right: b.right, vw: innerWidth };
    });
    reached = !!(r && r.right > 0 && r.left < r.vw);
  }
  await wait(220);
  await page.screenshot({ path: path.join(OUT, 'illustration_home_card.png') });
  const homeVids = await vids();
  const homeCover = homeVids.find(v => v.path === '/illustration/cover.mp4');
  const homePlaying = !!(homeCover && homeCover.ready >= 2 &&
                         !homeCover.paused && homeCover.t > 0);
  console.log('home video elements:', JSON.stringify(homeVids));
  console.log('home cover playing when visible:', homePlaying);

  // ------------------------------------------------- SPA into the detail
  let navigated = false;
  for (let i = 0; i < 3 && !navigated; i++) {
    try {
      if (i === 0) await card.click({ force: true, timeout: 12000 });
      else await card.dispatchEvent('click');
      navigated = await sheetReady();
    } catch (e) { console.log('click attempt', i, e.message.slice(0, 90)); }
  }
  console.log('SPA navigation reached sheet:', navigated);
  await wait(3000);
  const spa = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    const h1 = sh?.querySelector('h1');
    const d = sh?.querySelector('[data-gl="text"]');
    const cs = d ? getComputedStyle(d) : null;
    const hcs = h1 ? getComputedStyle(h1) : null;
    return {
      url: location.pathname, id: sh?.getAttribute('data-id'),
      title: h1?.textContent.trim(), copy: d?.textContent.trim().slice(0, 90),
      fill: cs?.webkitTextFillColor, hFill: hcs?.webkitTextFillColor,
      slides: sh?.querySelectorAll('[data-gl="simple"]').length,
      tags: [...(sh?.querySelectorAll('[data-gl="pill"]') || [])].map(x => x.textContent.trim()),
      prev: sh?.querySelector('[data-gl="related"]')?.getAttribute('data-id'),
    };
  });
  console.log('SPA SHEET', JSON.stringify(spa));
  const t1 = await vids();
  await wait(1500);
  const t2 = await vids();
  const cover1 = t1.find(v => v.path === '/illustration/cover.mp4');
  const cover2 = t2.find(v => v.path === '/illustration/cover.mp4');
  console.log('cover video:', JSON.stringify({ before: cover1, after: cover2 }));
  await page.screenshot({ path: path.join(OUT, 'illustration_detail_spa.png') });
  await wait(1400);
  await page.screenshot({ path: path.join(OUT, 'illustration_detail_video.png') });

  // scroll through the deck so the closing reel is exercised too
  for (let i = 0; i < 6; i++) { await page.mouse.move(720, 450); await page.mouse.wheel(0, 520); await wait(220); }
  await wait(1400);
  await page.screenshot({ path: path.join(OUT, 'illustration_detail_scrolled.png') });
  const afterScroll = await vids();
  console.log('videos after scroll:', JSON.stringify(afterScroll));

  // ------------------------------------------------------ direct URL load
  await page.goto(ORIGIN + '/projects/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const direct = await sheetReady();
  await wait(2600);
  for (let i = 0; i < 4; i++) { await page.mouse.move(720, 450); await page.mouse.wheel(0, 460); await wait(190); }
  await wait(1200);
  const directInfo = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    const d = sh?.querySelector('[data-gl="text"]');
    return {
      url: location.pathname, id: sh?.getAttribute('data-id'),
      title: document.title,
      copy: d?.textContent.trim().slice(0, 60),
      fill: d ? getComputedStyle(d).webkitTextFillColor : null,
      slides: sh?.querySelectorAll('[data-gl="simple"]').length,
    };
  });
  console.log('DIRECT', direct, JSON.stringify(directInfo));
  const directVids = await vids();
  console.log('direct video elements:', JSON.stringify(directVids));
  await page.screenshot({ path: path.join(OUT, 'illustration_detail_direct.png') });

  const frames = () => page.evaluate(() => (window.__videos || [])
    .filter(v => /\/(gift-motion|launch-motion)\.mp4$/.test(v.src))
    .map(v => ({ src: v.src, ready: v.readyState, frames: v.getVideoPlaybackQuality().totalVideoFrames })));
  const motionBefore = await frames();
  await wait(650);
  var motionAfter = await frames();
  const progressed = new Set();
  for (let step = 0; step < 8; step++) {
    for (const v of motionAfter) if (v.ready >= 2 && v.frames > motionBefore.find(b => b.src === v.src).frames) progressed.add(v.src);
    if (progressed.size === 2) break;
    await page.mouse.wheel(0, 260);
    await wait(400);
    motionAfter = await frames();
  }
  const newClipsPlaying = progressed.size === 2;
  console.log('new motion clips playing:', newClipsPlaying, motionBefore, motionAfter);

  await page.goto(ORIGIN + '/full', { waitUntil: 'domcontentloaded' });
  await wait(3500);
  const catalogue = await page.evaluate(() => [...document.querySelectorAll('main .content-center a')]
    .map(a => ({ title: a.textContent, href: a.getAttribute('href'), fill: getComputedStyle(a).webkitTextFillColor })));
  await page.screenshot({ path: path.join(OUT, 'full_catalogue_fixed.png') });
  const catalogueOk = catalogue.length === 10 && catalogue.every(a => a.title.trim() && a.href.startsWith('/projects/')) &&
    catalogue.filter(a => /[\u3400-\u9fff]/.test(a.title)).every(a => a.fill === 'rgb(255, 255, 255)');
  console.log('catalogue:', catalogueOk, catalogue);

  // ------------------------------------------------------------- summary
  const playing = !!(cover1 && cover2 && cover2.ready >= 2 && !cover2.paused && cover2.t > cover1.t);
  const okHome = home.cards === 10 && home.last === SLUG && home.title === '插画' &&
                 home.hasCss && home.canvas === 1 && home.siteName === 'Fengmei' &&
                 reached && homePlaying;
  const okSheet = navigated && spa.url === '/projects/' + SLUG && spa.title === '插画' &&
                  spa.fill === 'rgb(0, 0, 0)' && spa.hFill === 'rgb(0, 0, 0)' &&
                  spa.slides === 4 && (spa.copy || '').length > 40;
  const okDirect = direct && directInfo.id === SLUG && directInfo.slides === 4 &&
                   directInfo.fill === 'rgb(0, 0, 0)';
  const clean = !perr.length && !cerr.length && !hyd.length && !bad.length && !ext.length;
  const result = { home, homeVids, homePlaying, spa, cover1, cover2, afterScroll, directInfo,
                   directVids, playing, okHome, okSheet, okDirect, clean,
                   motionBefore, motionAfter, newClipsPlaying, catalogue, catalogueOk,
                   perr, cerr, hyd, bad, ext, media: [...new Set(media)] };
  console.log('\n=== ILLUSTRATION VERIFY ===');
  console.log('home(+video) / spa / direct / playing / clean:',
              okHome, okSheet, okDirect, playing, clean);
  console.log('page errors:', perr.length, 'console errors:', cerr.length,
              'hydration:', hyd.length, 'bad:', bad.length, 'external:', ext.length);
  console.log('media requests:', result.media.slice(0, 12));
  fs.writeFileSync(path.join(__dirname, '..', 'raw', 'verify_illustration.json'),
    JSON.stringify(result, null, 1));
  await browser.close();
  if (!(okHome && okSheet && okDirect && playing && clean && newClipsPlaying && catalogueOk)) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
