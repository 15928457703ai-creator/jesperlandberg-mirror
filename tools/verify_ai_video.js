/* Verify the newly added "AI短视频" case study.
 *
 * The user asked for a new project built from /Users/soul/Downloads/AI短视频
 * with "01" (1.jpg, the black title page) as its HOME cover. Checks, in order:
 *
 *   1. static build outputs: SSR card strip (16 cards, ai-video at #7),
 *      detail HTML (6 slide placeholders, DOM-painted CJK copy, prev/next),
 *      sitemap / llms.txt / markdown / /full index;
 *   2. Nuxt payloads: the project's src/thumb/card point at 1.jpg and its
 *      images[] holds all 6 stills in 1..6 order, video is null; the detail
 *      payload and the GraphQL replay agree, and home.featured is the same
 *      16-item permutation;
 *   3. browser: the home rail really requests the 1.jpg cover texture, SPA
 *      click opens the sheet, the Chinese title/description are painted,
 *      the top-down line reveal runs with 75 ms stagger, and a direct URL
 *      load fetches all 6 slides without errors / hydration mismatches.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const O = 'http://127.0.0.1:5188';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const REPORT = path.join(ROOT, 'raw', 'verify_ai_video.json');
const SLUG = 'ai-video';
const PID = 'ai-short-video-2026';
const HOME = ['oppo-service', 'naivideo', 'oppo-self-service', 'erp',
  'csa-service', 'hengxiang-advantage', 'ai-video', 'nathan-riley',
  'casa-di-solare', 'the-lookback', 'book-of-happiness', 'dogelon-mars',
  'gil-huybrecht', 'discoveryland', 'griflan', 'illustration'];
const SLIDES = [1, 2, 3, 4, 5, 6];
const wait = ms => new Promise(r => setTimeout(r, ms));

const results = [];
function check(name, ok, note) {
  results.push({ name, ok: !!ok, note: note || '' });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? '  [' + note + ']' : ''));
}
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* devalue payloads are flat arrays; every object field is an index into it. */
function loadDevalue(p) {
  const d = JSON.parse(read(p));
  const ref = i => (typeof i === 'number' && i >= 0 && i < d.length ? d[i] : i);
  const objs = d.filter(x => x && typeof x === 'object' && !Array.isArray(x));
  return { d, ref, objs };
}
function projectFrom(payload) {
  const { ref, objs } = payload;
  return objs.find(o => o.slug !== undefined && ref(o.slug) === SLUG &&
    o.images !== undefined);
}
function mediaFrom(p) {
  const { ref } = p;
  const imgs = ref(p.images) || [];
  return imgs.map(i => {
    const m = ref(i) || {};
    return {
      src: ref(m.src), thumb: ref(m.thumb), card: ref(m.card),
      width: ref(m.width), height: ref(m.height), video: ref(m.video)
    };
  });
}

(async () => {
  /* ------------------------------------------------ 1. static outputs -- */
  const home = read('site/index.html');
  const cardIds = [...home.matchAll(/<article\b[^>]*>/g)]
    .map(m => (m[0].match(/data-id="([^"]+)"/) || [])[1]).filter(Boolean);
  check('SSR home: 16 cards in HOME_ORDER',
    JSON.stringify(cardIds) === JSON.stringify(HOME),
    cardIds.join(' | '));
  check('SSR home: ai-video is card #7, titled AI短视频',
    /data-id="ai-video"[^>]*>/.test(home) && home.includes('>AI短视频</span>'));

  const detail = read('site/projects/' + SLUG + '.html');
  check('detail HTML: sheet belongs to ai-video',
    /data-id="ai-video" data-gl="sheet"/.test(detail));
  check('detail HTML: 6 slide placeholders',
    (detail.match(/data-gl="simple"/g) || []).length === 6);
  check('detail HTML: og:image is the 01 cover',
    /property="og:image" content="[^"]*\/ai-video\/1_card\.jpg"/.test(detail));
  check('detail HTML: prev/next ring',
    detail.includes('aria-label="Previous project: 横向优势"') &&
    detail.includes('aria-label="Next project: Nathan Riley"'));
  check('detail HTML: loads local-copy.css + local-copy.js',
    detail.includes('/local-copy.css') && detail.includes('/local-copy.js'));

  const sm = read('site/sitemap.xml');
  const ll = read('site/llms.txt');
  const md = read('site/projects/' + SLUG + '.md');
  const full = read('site/full.html');
  check('aux: sitemap / llms.txt / markdown / full index include the project',
    sm.includes('/projects/' + SLUG) && ll.includes('/projects/' + SLUG + '.md') &&
    md.includes('# AI短视频') && full.includes('href="/projects/' + SLUG + '"'));
  check('markdown: all 6 slides are listed in order',
    SLIDES.every(n => md.includes('/ai-video/' + n + '.jpg')));

  /* ------------------------------------------------ 2. data ------------ */
  const root = loadDevalue('site/_payload.json');
  const proj = projectFrom(root);
  check('payload: project object exists',
    !!proj, proj ? String(root.ref(proj.id)) : 'missing');
  const media = proj ? mediaFrom(Object.assign({ ref: root.ref }, proj)) : [];
  check('payload: cover src/thumb/card = 1.jpg family',
    proj && root.ref(proj.src) === '/ai-video/1.jpg' &&
    root.ref(proj.thumb) === '/ai-video/1_small.jpg' &&
    root.ref(proj.card) === '/ai-video/1_card.jpg',
    proj ? [root.ref(proj.src), root.ref(proj.thumb), root.ref(proj.card)].join(' | ') : '');
  check('payload: no video texture on the still cover',
    proj && root.ref(proj.video) === null && root.ref(proj.width) === 1600 &&
    root.ref(proj.height) === 900);
  check('payload: images[] holds all 6 stills in 1..6 order',
    JSON.stringify(media.map(m => m.src)) ===
    JSON.stringify(SLIDES.map(n => '/ai-video/' + n + '.jpg')),
    media.map(m => m.src).join(' | '));
  check('payload: all 6 slides are stills (no video)',
    media.length === 6 && media.every(m => m.video === null));

  const rootObj = root.objs.find(o => o.projects !== undefined && o.featured !== undefined);
  const featured = (root.ref(rootObj.featured) || []).map(i => {
    const o = root.ref(i) || {};
    return root.ref(o.slug);
  });
  check('payload: home.featured is the same 16-item permutation',
    JSON.stringify(featured) === JSON.stringify(HOME), featured.join(' | '));

  const dp = loadDevalue('site/projects/' + SLUG + '/_payload.json');
  const dproj = projectFrom(dp);
  const dmedia = dproj ? mediaFrom(Object.assign({ ref: dp.ref }, dproj)) : [];
  check('detail payload: 6 stills, first is 1.jpg',
    dmedia.length === 6 && dmedia[0].src === '/ai-video/1.jpg',
    dmedia.map(m => m.src).join(' | '));

  const g = JSON.parse(read('raw/graphql_localized.json'));
  const gp = (g.data.projects || []).find(x => x.slug === SLUG);
  check('graphql: project has 6 media entries, cover = 1.jpg',
    !!gp && gp.media.length === 6 && gp.media[0].url === '/ai-video/1.jpg',
    gp ? gp.media[0].url : 'missing');
  check('graphql: featured[6] points at the new project',
    g.data.home.featured.length === 16 && g.data.home.featured[6].id === PID,
    g.data.home.featured.length + ' items');

  const manifest = JSON.parse(read('raw/local_projects.json'));
  const mrec = manifest.find(x => x.slug === SLUG);
  check('verification manifest: 8 projects, cover = 1.jpg',
    manifest.length === 8 && mrec && mrec.cover === '1.jpg' &&
    mrec.slides.length === 6);
  const caps = read('site/_nuxt/DZyj3ghP.js');
  check('client caps leave room for 16 featured projects',
    /Q2=22,eI=20/.test(caps));

  /* ------------------------------------------------ 3. browser --------- */
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
      '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const perr = [], cerr = [], hyd = [], bad = [], ext = [], aiReqs = [];
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
    if (!u.startsWith(O) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u);
    if (r.status() >= 400) bad.push(r.status() + ' ' + u);
    if (/\/ai-video\//.test(u)) aiReqs.push(u.replace(O, '') + ':' + r.status());
  });

  await page.goto(O + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 60000 }).catch(() => {});
  await wait(4200);
  const homeInfo = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-gl="card"]').length,
    ids: [...document.querySelectorAll('[data-gl="card"]')].map(x => x.dataset.id),
    title: document.querySelector('[data-gl="card"][data-id="ai-video"]')?.innerText.trim()
  }));
  check('browser home: 16 cards in order',
    homeInfo.cards === 16 && JSON.stringify(homeInfo.ids) === JSON.stringify(HOME),
    homeInfo.ids.join(' | '));
  check('browser home: WebGL loads the 01 cover texture',
    aiReqs.some(u => /\/ai-video\/1(_small|_card)?\.jpg:200/.test(u)),
    aiReqs.slice(0, 6).join(' | '));
  await page.screenshot({ path: path.join(OUT, 'ai_video_home.png') });

  // Sample the reveal inside the page: SwiftShader can stall the main thread,
  // so Node-side timing is unreliable (see verify_copy_lines.js).
  await page.evaluate(() => {
    window.__aiv = { seen: false, delays: [] };
    const t0 = performance.now();
    const step = () => {
      const gs = document.querySelectorAll('[data-gl="sheet"][data-lc-state="in"] div[data-gl="text"] .lc-c');
      for (const g of gs) for (const a of g.getAnimations()) {
        if (a.id !== 'lc-reveal') continue;
        const d = Math.round(a.effect.getTiming().delay);
        if (window.__aiv.delays.indexOf(d) < 0) window.__aiv.delays.push(d);
        window.__aiv.seen = true;
      }
      if (performance.now() - t0 < 12000) setTimeout(step, 25);
    };
    step();
  });
  await page.evaluate(() => {
    const c = document.querySelector('[data-gl="card"][data-id="ai-video"]');
    (c && (c.querySelector('a') || c)).click();
  });
  await page.waitForFunction(() => location.pathname === '/projects/ai-video',
    null, { timeout: 30000 }).catch(() => {});
  await wait(4200);
  const spa = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    const h1 = sh && sh.querySelector('h1');
    const body = sh && sh.querySelector('div[data-gl="text"]');
    return {
      path: location.pathname, id: sh && sh.getAttribute('data-id'),
      h1: h1 && h1.textContent.trim(), h1Color: h1 && getComputedStyle(h1).color,
      h1Opacity: h1 && +getComputedStyle(h1).opacity,
      body: body && body.textContent.trim().slice(0, 24),
      bodyColor: body && getComputedStyle(body).color,
      bodyOpacity: body && +getComputedStyle(body).opacity,
      spans: body ? body.querySelectorAll('.lc-c').length : 0,
      delays: window.__aiv ? window.__aiv.delays.slice().sort((a, b) => a - b) : [],
      seen: !!(window.__aiv && window.__aiv.seen),
      related: [...document.querySelectorAll('[data-gl="related"]')].map(x => x.dataset.id)
    };
  });
  check('SPA entry: sheet + Chinese title/description painted',
    spa.path === '/projects/' + SLUG && spa.id === SLUG && spa.h1 === 'AI短视频' &&
    spa.h1Color === 'rgb(0, 0, 0)' && spa.bodyColor === 'rgb(0, 0, 0)' &&
    spa.body && spa.body.includes('AI 创新实验'),
    JSON.stringify({ h1: spa.h1, color: spa.h1Color, body: spa.body }));
  check('SPA entry: copy ends readable, split into glyphs',
    spa.h1Opacity === 1 && spa.bodyOpacity === 1 && spa.spans > 20,
    'spans=' + spa.spans + ' op=' + spa.h1Opacity + '/' + spa.bodyOpacity);
  check('SPA entry: top-down line reveal with 75 ms stagger',
    spa.seen && spa.delays.length >= 2 &&
    spa.delays.slice(1).every((d, i) => d - spa.delays[i] >= 55 && d - spa.delays[i] <= 95),
    spa.delays.join(' | '));
  check('SPA entry: related ring matches HOME_ORDER',
    spa.related[0] === 'hengxiang-advantage' && spa.related[1] === 'nathan-riley',
    spa.related.join(' | '));
  await page.screenshot({ path: path.join(OUT, 'ai_video_detail_spa.png') });

  // Direct URL load: all 6 slide files must arrive, nothing may 4xx.
  aiReqs.length = 0;
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => perr.push('direct ' + e.message.slice(0, 200)));
  p2.on('console', m => {
    const s = m.text();
    if (m.type() === 'error') cerr.push('direct ' + s.slice(0, 200));
    if (/hydration|mismatch/i.test(s) && !/gl-text/i.test(s)) hyd.push(s.slice(0, 200));
  });
  p2.on('response', r => {
    const u = r.url();
    if (!u.startsWith(O) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u);
    if (r.status() >= 400) bad.push(r.status() + ' ' + u);
    if (/\/ai-video\//.test(u)) aiReqs.push(u.replace(O, '') + ':' + r.status());
  });
  await p2.goto(O + '/projects/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p2.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 60000 }).catch(() => {});
  await wait(4600);
  for (let i = 0; i < 6; i++) {
    await p2.mouse.move(720, 500);
    await p2.mouse.wheel(0, 700);
    await wait(220);
  }
  await wait(700);
  const direct = await p2.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    const body = sh && sh.querySelector('div[data-gl="text"]');
    return {
      id: sh && sh.getAttribute('data-id'), lc: document.documentElement.getAttribute('data-lc'),
      op: body && +getComputedStyle(body).opacity,
      spans: body ? body.querySelectorAll('.lc-c').length : 0,
      placeholders: document.querySelectorAll('[data-gl="simple"]').length
    };
  });
  check('direct load: 6 main stills fetched with 200',
    SLIDES.every(n => aiReqs.some(u => u === '/ai-video/' + n + '.jpg:200')),
    aiReqs.filter(u => /\/ai-video\/\d\.jpg/.test(u)).join(' | '));
  check('direct load: copy revealed and split',
    direct.id === SLUG && direct.lc === 'ready' && direct.op === 1 &&
    direct.spans > 20 && direct.placeholders === 6,
    JSON.stringify(direct));
  await p2.screenshot({ path: path.join(OUT, 'ai_video_detail_direct.png') });
  await p2.close();

  check('no page/console/hydration errors', perr.length === 0 &&
    cerr.length === 0 && hyd.length === 0,
    [perr[0], cerr[0], hyd[0]].filter(Boolean).join(' | '));
  check('no 4xx / external requests', bad.length === 0 && ext.length === 0,
    [bad[0], ext[0]].filter(Boolean).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(REPORT, JSON.stringify({
    pass: results.length - failed.length, total: results.length,
    fails: failed, results, requests: aiReqs
  }, null, 1));
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) {
    console.log('FAILED:', failed.map(f => f.name).join('; '));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
