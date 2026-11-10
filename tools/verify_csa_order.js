/* Verify the CSA客服服务 deck order change.
 *
 * Requested: move what used to be detail slide 2 (1.jpg, the black
 * 平台重构 / CSA客户服务 title page) to slide 1.  The HOME card cover stays
 * the originally requested 2.jpg, pinned with `cover_index: 1` in
 * tools/project_config.py -- the same "extra title slide" mechanism used by
 * oppo-self-service.  So cover != images[0] is intentional here.
 *
 * Checks: static build outputs, every Nuxt payload / the GraphQL replay /
 * the verification manifest, then real browser frames.  Visual assertions
 * sample the mean luminance of the rendered artwork: 1.jpg is a black title
 * page (dark), 2.jpg is a white content page (light).
 */
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const O = 'http://127.0.0.1:5188';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const REPORT = path.join(ROOT, 'raw', 'verify_csa_order.json');
const SLUG = 'csa-service';
const SLIDES = [1, 2, 3, 4, 5, 6, 7, 8];
const wait = ms => new Promise(r => setTimeout(r, ms));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const results = [];
function check(name, ok, note) {
  results.push({ name, ok: !!ok, note: note || '' });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? '  [' + note + ']' : ''));
}

/* Mean greyscale value of a rectangle in a PNG (PIL is available locally). */
function luma(file, box) {
  const py = 'from PIL import Image,ImageStat\n' +
    'im=Image.open(' + JSON.stringify(file) + ').convert("L").crop((' +
    box.join(',') + '))\nprint(round(ImageStat.Stat(im).mean[0],1))';
  return +execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim();
}

/* Cold loads can sit on the site's loader for several seconds under
 * SwiftShader. A single fixed wait produced an all-black frame that would
 * falsely satisfy "dark title page", so poll until the artwork is painted
 * (luma > 4) before asserting it is the dark slide. */
async function captureFirstSlide(page, file) {
  let v = 0;
  for (let i = 0; i < 24; i++) {
    await page.screenshot({ path: file });
    v = luma(file, [750, 230, 1150, 400]);
    if (v > 4) return v;
    await wait(600);
  }
  return v;
}

/* devalue payloads are flat arrays; object fields are indices into it. */
function loadDevalue(p) {
  const d = JSON.parse(read(p));
  const ref = i => (typeof i === 'number' && i >= 0 && i < d.length ? d[i] : i);
  return { d, ref, objs: d.filter(x => x && typeof x === 'object' && !Array.isArray(x)) };
}
function projectFrom(payload) {
  return payload.objs.find(o => o.slug !== undefined &&
    payload.ref(o.slug) === SLUG && o.images !== undefined);
}
function mediaOf(payload, proj) {
  return (payload.ref(proj.images) || []).map(i => {
    const m = payload.ref(i) || {};
    return { src: payload.ref(m.src), thumb: payload.ref(m.thumb),
      card: payload.ref(m.card), video: payload.ref(m.video) };
  });
}

(async () => {
  /* ------------------------------------------------ 1. static outputs -- */
  const detail = read('site/projects/' + SLUG + '.html');
  check('detail HTML: sheet belongs to csa-service',
    /data-id="csa-service" data-gl="sheet"/.test(detail));
  check('detail HTML: 8 slide placeholders',
    (detail.match(/data-gl="simple"/g) || []).length === 8);
  check('detail HTML: og:image is still the 2.jpg home cover',
    /property="og:image" content="[^"]*\/csa\/2_card\.jpg"/.test(detail));
  check('detail HTML: prev/next ring unchanged',
    detail.includes('aria-label="Previous project: ERP"') &&
    detail.includes('aria-label="Next project: 横向优势"'));

  const home = read('site/index.html');
  const ids = [...home.matchAll(/<article\b[^>]*data-id="([^"]+)"/g)].map(m => m[1]);
  check('SSR home: csa-service is still card #5 of 16',
    ids.length === 16 && ids[4] === SLUG, ids.join(' | '));

  const md = read('site/projects/' + SLUG + '.md');
  const mdSlides = [...md.matchAll(/\/csa\/(\d+)\.jpg/g)].map(m => +m[1]);
  check('markdown: slides listed as 1..8 (title page first)',
    JSON.stringify(mdSlides) === JSON.stringify(SLIDES), mdSlides.join(' | '));

  const cfg = read('tools/project_config.py');
  const prep = read('tools/prepare_project_images.py');
  check('config: cover_index pins the home cover to meta[1] (2.jpg)',
    /"cover_index":\s*1,/.test(cfg.split('"slug": "csa-service"')[1].split('"slug":')[0]));
  check('image prep: CSA order is [1..8], cover still 2',
    /"cover": 2,\s*"order": \[1, 2, 3, 4, 5, 6, 7, 8\]/.test(prep));

  /* ------------------------------------------------ 2. data ------------ */
  const root = loadDevalue('site/_payload.json');
  const proj = projectFrom(root);
  const media = proj ? mediaOf(root, proj) : [];
  const coverFiles = proj ? [root.ref(proj.src), root.ref(proj.thumb), root.ref(proj.card)] : [];
  check('payload: home cover src/thumb/card = 2.jpg family',
    JSON.stringify(coverFiles) ===
    JSON.stringify(['/csa/2.jpg', '/csa/2_small.jpg', '/csa/2_card.jpg']),
    coverFiles.join(' | '));
  check('payload: images[] = 1..8, title page first',
    JSON.stringify(media.map(m => m.src)) ===
    JSON.stringify(SLIDES.map(n => '/csa/' + n + '.jpg')),
    media.map(m => m.src).join(' | '));
  check('payload: 8 stills, no video textures',
    media.length === 8 && media.every(m => m.video === null));
  check('payload: cover deliberately differs from images[0]',
    root.ref(proj.src) !== media[0].src);

  const dp = loadDevalue('site/projects/' + SLUG + '/_payload.json');
  const dproj = projectFrom(dp);
  const dmedia = dproj ? mediaOf(dp, dproj) : [];
  check('detail payload: identical 1..8 order',
    JSON.stringify(dmedia.map(m => m.src)) ===
    JSON.stringify(SLIDES.map(n => '/csa/' + n + '.jpg')));

  const g = JSON.parse(read('raw/graphql_localized.json'));
  const gp = (g.data.projects || []).find(x => x.slug === SLUG);
  check('graphql: media[] = 1..8, first is 1.jpg',
    !!gp && JSON.stringify(gp.media.map(m => m.url)) ===
    JSON.stringify(SLIDES.map(n => '/csa/' + n + '.jpg')),
    gp ? gp.media.slice(0, 3).map(m => m.url).join(' | ') : 'missing');

  const manifest = JSON.parse(read('raw/local_projects.json'));
  const rec = manifest.find(x => x.slug === SLUG);
  check('manifest: cover 2.jpg, slides[0] 1.jpg',
    !!rec && rec.cover === '2.jpg' && rec.slides[0].files[0] === '1.jpg' &&
    rec.slides.length === 8, rec ? rec.cover + ' / ' + rec.slides[0].files[0] : 'missing');

  /* ------------------------------------------------ 3. browser --------- */
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
      '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const perr = [], cerr = [], hyd = [], bad = [], ext = [], csaReqs = [], allCsaReqs = [];
  const wire = page => {
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
      if (/\/csa\//.test(u)) {
        const entry = u.replace(O, '') + ':' + r.status();
        csaReqs.push(entry);
        allCsaReqs.push(entry);
      }
    });
  };

  // (a) HOME: the CSA card must still paint the light 2.jpg cover.
  const page = await ctx.newPage();
  wire(page);
  await page.goto(O + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 60000 }).catch(() => {});
  await wait(4000);
  check('browser home: WebGL loads the 2.jpg cover texture',
    csaReqs.some(u => /\/csa\/2(_small|_card)?\.jpg:200/.test(u)),
    csaReqs.slice(0, 6).join(' | '));

  let box = null;
  for (let i = 0; i < 90; i++) {
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, 220);
    await wait(80);
    box = await page.evaluate(() => {
      const e = document.querySelector('[data-gl="card"][data-id="csa-service"]');
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { cx: Math.round((b.left + b.right) / 2), top: Math.round(b.top),
        bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) };
    });
    if (box && Math.abs(box.cx - 720) < 80) break;
  }
  await wait(120);
  const homeShot = path.join(OUT, 'csa_home_card.png');
  await page.screenshot({ path: homeShot });
  // centre of the card, well inside the artwork (avoid the rounded corners)
  const hb = box && box.right - box.left > 300
    ? [Math.max(0, box.left + 150), Math.max(0, box.top + 90),
       Math.min(1440, box.right - 150), Math.min(900, box.bottom - 90)]
    : [640, 240, 1000, 560];
  const homeLuma = luma(homeShot, hb);
  check('browser home: CSA card shows the LIGHT 2.jpg cover',
    homeLuma > 150, 'luma=' + homeLuma + ' box=' + hb.join(','));

  // (b) SPA entry: first detail slide must be the dark 1.jpg title page.
  csaReqs.length = 0;
  await page.evaluate(() => {
    const c = document.querySelector('[data-gl="card"][data-id="csa-service"]');
    (c && (c.querySelector('a') || c)).click();
  });
  await page.waitForFunction(s => location.pathname === '/projects/' + s,
    SLUG, { timeout: 30000 }).catch(() => {});
  await wait(1800);
  const spaShot = path.join(OUT, 'csa_detail_spa.png');
  const spaLuma = await captureFirstSlide(page, spaShot);
  check('SPA entry: first slide is the DARK 1.jpg title page',
    spaLuma > 4 && spaLuma < 120, 'luma=' + spaLuma);
  check('1.jpg title-page texture loaded (home prefetch or detail entry)',
    allCsaReqs.some(u => u === '/csa/1.jpg:200'),
    allCsaReqs.slice(0, 8).join(' | '));
  const spa = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    const body = sh && sh.querySelector('div[data-gl="text"]');
    return { path: location.pathname, id: sh && sh.getAttribute('data-id'),
      h1: sh && sh.querySelector('h1') && sh.querySelector('h1').textContent.trim(),
      op: body && +getComputedStyle(body).opacity,
      placeholders: document.querySelectorAll('[data-gl="simple"]').length };
  });
  check('SPA entry: sheet, Chinese copy and 8 placeholders',
    spa.path === '/projects/' + SLUG && spa.id === SLUG && spa.h1 === 'CSA客服服务' &&
    spa.op === 1 && spa.placeholders === 8, JSON.stringify(spa));

  // (c) Direct URL load: same first slide, all 8 main stills arrive.
  csaReqs.length = 0;
  const p2 = await ctx.newPage();
  wire(p2);
  await p2.goto(O + '/projects/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p2.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 60000 }).catch(() => {});
  await wait(1800);
  const directShot = path.join(OUT, 'csa_detail_direct.png');
  const directLuma = await captureFirstSlide(p2, directShot);
  check('direct load: first slide is the DARK 1.jpg title page',
    directLuma > 4 && directLuma < 120, 'luma=' + directLuma);
  for (let i = 0; i < 6; i++) {
    await p2.mouse.move(720, 500);
    await p2.mouse.wheel(0, 700);
    await wait(200);
  }
  await wait(700);
  check('direct load: all 8 main stills fetched with 200',
    SLIDES.every(n => csaReqs.some(u => u === '/csa/' + n + '.jpg:200')),
    csaReqs.filter(u => /\/csa\/\d\.jpg/.test(u)).join(' | '));
  check('direct load: sheet copy revealed',
    (await p2.evaluate(() => {
      const b = document.querySelector('[data-gl="sheet"] div[data-gl="text"]');
      return b ? +getComputedStyle(b).opacity : 0;
    })) === 1);
  await p2.close();

  check('no page/console/hydration errors',
    perr.length === 0 && cerr.length === 0 && hyd.length === 0,
    [perr[0], cerr[0], hyd[0]].filter(Boolean).join(' | '));
  check('no 4xx / external requests', bad.length === 0 && ext.length === 0,
    [bad[0], ext[0]].filter(Boolean).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(REPORT, JSON.stringify({
    pass: results.length - failed.length, total: results.length,
    fails: failed, results, luma: { home: homeLuma, spa: spaLuma, direct: directLuma },
    requests: csaReqs,
  }, null, 1));
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) {
    console.log('FAILED:', failed.map(f => f.name).join('; '));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
