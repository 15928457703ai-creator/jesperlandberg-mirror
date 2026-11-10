/* Verify the animated Naivideo cover.

   1. Home: the WebGL card strip must create a detached <video> for
      /naivideo/live.mp4 and actually advance currentTime while the Naivideo
      card is in view (i.e. the static collage really became a moving cover).
   2. Detail: SPA + direct load keep the original sheet, 8 slides, CJK copy,
      pills and related ring, with the cover clip playing.
   3. /naivideo-live-legacy: the retired nine-slice soft-entrance page is
      still served and still works (regression + rollback reference).  The
      active home cover is verified separately by verify_naivideo_fx.js.
   4. No page/console/hydration errors, no 4xx, no external requests.
*/
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const ORIGIN = 'http://127.0.0.1:5188';
const OUT = path.join(__dirname, '..', 'screenshots');
const SLUG = 'naivideo';
const CLIP = 'live.mp4';
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
    if (/\.mp4|\/naivideo\/(live|live_)/.test(u)) media.push(r.status() + ' ' + u.replace(ORIGIN, ''));
  });

  const vids = () => page.evaluate(() => (window.__videos || []).map(v => ({
    src: (v.currentSrc || v.src || '').split('/').pop().split('?')[0],
    ready: v.readyState, paused: v.paused, t: +v.currentTime.toFixed(2),
    w: v.videoWidth, h: v.videoHeight, loop: v.loop
  })));
  const sheetReady = async () => {
    try {
      await page.waitForFunction(() => {
        const sh = document.querySelector('[data-gl="sheet"]');
        return sh && sh.getAttribute('data-id') === 'naivideo' &&
          (sh.querySelector('[data-gl="text"]')?.textContent || '').trim().length > 0;
      }, null, { timeout: 30000 });
      return true;
    } catch (e) { return false; }
  };

  // ------------------------------------------------------------------ home
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('div.z-99') &&
    document.querySelectorAll('canvas').length > 0,
    null, { timeout: 60000 }).catch(() => {});
  await wait(3600);
  const home = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-gl="card"]')];
    const c = cards.find(x => x.getAttribute('data-id') === 'naivideo');
    return {
      cards: cards.length,
      order: cards.slice(0, 3).map(x => x.getAttribute('data-id')),
      title: c?.querySelector('[data-title]')?.textContent.trim(),
      canvas: document.querySelectorAll('canvas').length,
      siteName: document.querySelector('div.fixed.inset-0.z-40 a.label[href="/"]')?.textContent.trim(),
    };
  });
  console.log('HOME', JSON.stringify(home));

  // Naivideo is card #2 and centered on the DEFAULT first screen, so the
  // stock visibility scheduler starts live.mp4 at boot.  No wheeling: large
  // wheel bursts used to wrap the infinite rail all the way to illustration,
  // which made the later SPA click land on the wrong project.
  await page.waitForFunction(() => {
    const v = (window.__videos || []).find(x =>
      (x.currentSrc || x.src || '').includes('live.mp4'));
    return v && v.readyState >= 2 && !v.paused && v.currentTime > 0.05;
  }, null, { timeout: 25000 }).catch(() => {});

  let homeCover = null, steps = 0;
  for (let i = 0; i < 8 && !homeCover; i++) {
    const a = (await vids()).find(x => x.src === CLIP);
    await wait(700);
    const b = (await vids()).find(x => x.src === CLIP);
    if (a && b && b.ready >= 2 && !b.paused && b.t > a.t) { homeCover = b; break; }
    // tiny nudge only if the clip is not running yet
    await page.mouse.move(720, 500);
    await page.mouse.wheel(0, 220);
    await wait(150);
    steps = i + 1;
  }
  const homeAdvance = !!homeCover;
  const homePlaying = !!(homeCover && homeCover.ready >= 2 && !homeCover.paused && homeAdvance);
  const cardRect = await page.evaluate(() => {
    const c = document.querySelector('[data-gl="card"][data-id="naivideo"]');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right),
             cx: Math.round(r.left + r.width / 2), w: Math.round(r.width) };
  });
  console.log('nudge steps:', steps, '| naivideo card rect:', JSON.stringify(cardRect));
  console.log('home cover playing + advancing:', homePlaying, JSON.stringify(homeCover));
  const homeVids = await vids();
  await page.screenshot({ path: path.join(OUT, 'naivideo_live_home_card.png') });

  // ---------------------------------------------------- SPA into the detail
  // Return to a pristine first screen so the click is deterministic.
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('div.z-99') &&
    document.querySelectorAll('canvas').length > 0,
    null, { timeout: 60000 }).catch(() => {});
  await wait(2600);
  const card = page.locator('[data-gl="card"][data-id="naivideo"]');
  let navigated = false;
  for (let i = 0; i < 3 && !navigated; i++) {
    try {
      if (i === 0) await card.click({ force: true, timeout: 12000 });
      else await card.dispatchEvent('click');
      navigated = await sheetReady();
    } catch (e) { console.log('click attempt', i, e.message.slice(0, 90)); }
  }
  await wait(2600);
  const spa = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    const d = sh?.querySelector('[data-gl="text"]');
    return {
      url: location.pathname, id: sh?.getAttribute('data-id'),
      title: sh?.querySelector('h1')?.textContent.trim(),
      copy: d?.textContent.trim().slice(0, 60),
      fill: d ? getComputedStyle(d).webkitTextFillColor : null,
      slides: sh?.querySelectorAll('[data-gl="simple"]').length,
      pills: [...(sh?.querySelectorAll('[data-gl="pill"]') || [])].map(x => x.textContent.trim()),
    };
  });
  console.log('SPA SHEET', navigated, JSON.stringify(spa));
  await page.screenshot({ path: path.join(OUT, 'naivideo_live_detail_spa.png') });
  // The renderer holds one detached <video> per home card AND one for the
  // detail sheet. After an SPA entry both live.mp4 elements are alive: the
  // home card is idle (poster, paused) while the sheet's clip plays. A plain
  // `.find()` picks whichever was created first and reports a false negative
  // as soon as another card shifts the creation order. Sample them all and
  // follow the most advanced (i.e. actually playing) element instead.
  await page.mouse.move(900, 420);   // keep the detail cover engaged
  await wait(350);
  const a1 = (await vids()).filter(v => v.src === CLIP);
  await wait(1600);
  const a2 = (await vids()).filter(v => v.src === CLIP);
  const t1 = a1.slice().sort((x, y) => y.t - x.t)[0];
  const t2 = a2.slice().sort((x, y) => y.t - x.t)[0];
  console.log('cover timeline:', JSON.stringify({ before: t1, after: t2, all: a2 }));
  const playing = !!(t1 && t2 && t2.ready >= 2 && !t2.paused && t2.t > t1.t);
  await page.screenshot({ path: path.join(OUT, 'naivideo_live_detail_video.png') });

  // ------------------------------------------------------- direct URL load
  await page.goto(ORIGIN + '/projects/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const direct = await sheetReady();
  await wait(2400);
  for (let i = 0; i < 4; i++) { await page.mouse.move(720, 450); await page.mouse.wheel(0, 460); await wait(190); }
  await wait(1000);
  const directInfo = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    const d = sh?.querySelector('[data-gl="text"]');
    return {
      url: location.pathname, id: sh?.getAttribute('data-id'), title: document.title,
      copy: d?.textContent.trim().slice(0, 50),
      fill: d ? getComputedStyle(d).webkitTextFillColor : null,
      slides: sh?.querySelectorAll('[data-gl="simple"]').length,
      og: document.querySelector('meta[property="og:image"]')?.content,
    };
  });
  console.log('DIRECT', direct, JSON.stringify(directInfo));
  await page.screenshot({ path: path.join(OUT, 'naivideo_live_detail_direct.png') });

  // ------------------------------------------- standalone interactive page
  await page.goto(ORIGIN + '/naivideo-live-legacy', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(1200);
  const live = await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const b = getComputedStyle(document.body);
    const tl = window.__nvTimeline;
    return {
      tiles: document.querySelectorAll('.tile').length,
      imagesLoaded: [...document.images].filter(i => i.naturalWidth > 0).length,
      gsap: window.gsap ? window.gsap.version : null,
      timelineDuration: tl ? +tl.duration().toFixed(2) : null,
      timelineActive: tl ? tl.isActive() : false,
      timelineTime: tl ? +tl.time().toFixed(2) : null,
      bg: b.backgroundColor,
      stageBg: getComputedStyle(stage).backgroundColor,
      stageImage: getComputedStyle(stage).backgroundImage,
    };
  });
  await wait(1100);
  const time2 = await page.evaluate(() =>
    window.__nvTimeline ? +window.__nvTimeline.time().toFixed(2) : null);
  const timelineAdvance = time2 !== null && live.timelineTime !== null &&
                          time2 > live.timelineTime;
  console.log('LIVE PAGE', JSON.stringify(live), '| time after 1.1s:', time2,
              '| advancing:', timelineAdvance);
  await page.screenshot({ path: path.join(OUT, 'naivideo_live_page.png') });

  const target = page.locator('.t-effects');
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await wait(900);
  const hover = await page.evaluate(() => {
    const hovered = document.querySelector('.t-effects');
    const other = document.querySelector('.t-hero');
    const f = getComputedStyle(hovered.querySelector('.t-face'));
    return {
      translate: f.translate, scale: f.scale, filter: f.filter,
      otherOpacity: getComputedStyle(other).opacity,
      hoveredOpacity: getComputedStyle(hovered).opacity,
    };
  });
  console.log('HOVER', JSON.stringify(hover));
  await page.screenshot({ path: path.join(OUT, 'naivideo_live_hover.png') });
  const hoverOk = /-14px|0px -14px/.test(hover.translate) &&
                  parseFloat(hover.scale) > 1.04 &&
                  parseFloat(hover.otherOpacity) < .6;

  // -------------------------------------------------------------- summary
  const okHome = home.cards === 10 && home.title === 'Naivideo' && home.canvas === 1 &&
                 home.siteName === 'Fengmei' && homePlaying &&
                 JSON.stringify(home.order) === JSON.stringify(['oppo-service', 'naivideo', 'oppo-self-service']);
  const okSheet = navigated && spa.url === '/projects/' + SLUG && spa.title === 'Naivideo' &&
                  spa.slides === 8 && spa.fill === 'rgb(0, 0, 0)' && (spa.copy || '').length > 20;
  const okDirect = direct && directInfo.id === SLUG && directInfo.slides === 8 &&
                   /live_card\.jpg$/.test(directInfo.og || '');
  const okLive = live.tiles === 9 && live.imagesLoaded === 9 && !!live.gsap &&
                 live.timelineDuration === 12 && live.timelineActive &&
                 timelineAdvance && live.stageImage === 'none' && hoverOk;
  const clean = !perr.length && !cerr.length && !hyd.length && !bad.length && !ext.length;
  const result = { home, homeVids, homePlaying, spa, t1, t2, playing, directInfo,
                   live, time2, timelineAdvance, hover, hoverOk,
                   okHome, okSheet, okDirect, okLive, clean,
                   perr, cerr, hyd, bad, ext, media: [...new Set(media)] };
  console.log('\n=== NAIVIDEO LIVE VERIFY ===');
  console.log('home / spa / direct / live+hover / playing / clean:',
              okHome, okSheet, okDirect, okLive, playing, clean);
  console.log('page errors:', perr.length, 'console errors:', cerr.length,
              'hydration:', hyd.length, 'bad:', bad.length, 'external:', ext.length);
  console.log('media requests:', result.media.slice(0, 10));
  fs.writeFileSync(path.join(__dirname, '..', 'raw', 'verify_naivideo_live.json'),
    JSON.stringify(result, null, 1));
  await browser.close();
  if (!(okHome && okSheet && okDirect && okLive && playing && clean)) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
