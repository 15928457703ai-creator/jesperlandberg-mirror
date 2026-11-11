/* Verify the ERP detail-deck reorder.
 *
 * Requested (same as CSA客服服务): move what used to be detail slide 2
 * (1.jpg, the black 制造业数字化 / ERP1.0建设 title page) to slide 1.
 * The HOME card is the animated home_cover (cover.mp4 + cover.jpg) and the
 * share image stays 2_card.jpg, pinned with `cover_index: 1` in
 * tools/project_config.py -- so neither changes when images[] is reordered.
 *
 * Checks static outputs, every payload / GraphQL / the manifest, then real
 * browser frames. The visual assertion samples the mean luminance of the
 * rendered first slide: 1.jpg is a black title page (dark), 2.jpg is the
 * white/blue 华润白酒ERP artwork (light).
 */
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const O = 'http://127.0.0.1:5188';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const REPORT = path.join(ROOT, 'raw', 'verify_erp_order.json');
const SLUG = 'erp';
const SLIDES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
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

/* Cold loads can sit on the loader for seconds under SwiftShader. Poll until
 * the artwork is painted so an all-black loader frame cannot fake a pass. */
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
  check('detail HTML: sheet belongs to erp',
    /data-id="erp" data-gl="sheet"/.test(detail));
  check('detail HTML: 11 slide placeholders',
    (detail.match(/data-gl="simple"/g) || []).length === 11);
  check('detail HTML: og:image still 2_card.jpg',
    /property="og:image" content="[^"]*\/erp\/2_card\.jpg"/.test(detail));
  check('detail HTML: prev/next ring unchanged',
    detail.includes('aria-label="Previous project: OPPO自助服务"') &&
    detail.includes('aria-label="Next project: CSA客服服务"'));

  const home = read('site/index.html');
  const ids = [...home.matchAll(/<article\b[^>]*data-id="([^"]+)"/g)].map(m => m[1]);
  check('SSR home: erp is still card #4 of 10',
    ids.length === 10 && ids[3] === SLUG, ids.slice(0, 5).join(' | '));

  const md = read('site/projects/' + SLUG + '.md');
  const mdSlides = [...md.matchAll(/\/erp\/(\d+)\.jpg/g)].map(m => +m[1]);
  check('markdown: slides listed as 1..11 (title page first)',
    JSON.stringify(mdSlides) === JSON.stringify(SLIDES), mdSlides.join(' | '));

  const cfg = read('tools/project_config.py');
  const prep = read('tools/prepare_project_images.py');
  check('config: cover_index pins og:image / manifest cover to meta[1]',
    /"cover_index":\s*1,/.test(cfg.split('"slug": "erp"')[1].split('"slug":')[0]));
  check('image prep: ERP order is [1..11], cover still 2',
    /"cover": 2,\s*"order": \[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11\]/.test(prep));

  /* ------------------------------------------------ 2. data ------------ */
  const root = loadDevalue('site/_payload.json');
  const proj = projectFrom(root);
  const media = proj ? mediaOf(root, proj) : [];
  const coverFiles = proj
    ? [root.ref(proj.src), root.ref(proj.thumb), root.ref(proj.card), root.ref(proj.video)]
    : [];
  check('payload: HOME card still paints the animated cover.mp4 / cover.jpg',
    JSON.stringify(coverFiles) === JSON.stringify(
      ['/erp/cover.jpg', '/erp/cover_small.jpg', '/erp/cover_card.jpg', '/erp/cover.mp4']),
    coverFiles.join(' | '));
  check('payload: images[] = 1..11, title page first',
    JSON.stringify(media.map(m => m.src)) ===
    JSON.stringify(SLIDES.map(n => '/erp/' + n + '.jpg')),
    media.slice(0, 3).map(m => m.src).join(' | '));
  check('payload: 11 stills, no video textures inside the deck',
    media.length === 11 && media.every(m => m.video === null));
  check('payload: home cover deliberately differs from images[0]',
    root.ref(proj.src) !== media[0].src);

  const dp = loadDevalue('site/projects/' + SLUG + '/_payload.json');
  const dproj = projectFrom(dp);
  const dmedia = dproj ? mediaOf(dp, dproj) : [];
  check('detail payload: identical 1..11 order',
    JSON.stringify(dmedia.map(m => m.src)) ===
    JSON.stringify(SLIDES.map(n => '/erp/' + n + '.jpg')));

  const g = JSON.parse(read('raw/graphql_localized.json'));
  const gp = (g.data.projects || []).find(x => x.slug === SLUG);
  check('graphql: media[] = 1..11, first is 1.jpg',
    !!gp && JSON.stringify(gp.media.map(m => m.url)) ===
    JSON.stringify(SLIDES.map(n => '/erp/' + n + '.jpg')),
    gp ? gp.media.slice(0, 3).map(m => m.url).join(' | ') : 'missing');

  const manifest = JSON.parse(read('raw/local_projects.json'));
  const rec = manifest.find(x => x.slug === SLUG);
  check('manifest: cover 2.jpg, slides[0] 1.jpg, 11 slides',
    !!rec && rec.cover === '2.jpg' && rec.slides[0].files[0] === '1.jpg' &&
    rec.slides.length === 11, rec ? rec.cover + ' / ' + rec.slides[0].files[0] : 'missing');

  /* ------------------------------------------------ 3. browser --------- */
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
      '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const perr = [], cerr = [], hyd = [], bad = [], ext = [], erpReqs = [], allErpReqs = [];
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
      if (/\/erp\//.test(u)) {
        const entry = u.replace(O, '') + ':' + r.status();
        erpReqs.push(entry);
        allErpReqs.push(entry);
      }
    });
  };

  // (a) HOME: the animated cover is untouched by the deck reorder.
  const page = await ctx.newPage();
  wire(page);
  await page.goto(O + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    if (allErpReqs.some(x => /^\/erp\/cover\.mp4:(200|206)$/.test(x)) &&
        allErpReqs.some(x => x === '/erp/cover.jpg:200')) break;
    await wait(300);
  }
  check('browser home: animated cover.mp4 + poster requested',
    allErpReqs.some(x => /^\/erp\/cover\.mp4:(200|206)$/.test(x)) &&
    allErpReqs.some(x => x === '/erp/cover.jpg:200'),
    allErpReqs.slice(0, 6).join(' | '));
  await page.screenshot({ path: path.join(OUT, 'erp_order_home.png') });

  // (b) SPA entry: first detail slide must be the dark 1.jpg title page.
  erpReqs.length = 0;
  await page.evaluate(() => {
    const c = document.querySelector('[data-gl="card"][data-id="erp"]');
    (c && (c.querySelector('a') || c)).click();
  });
  await page.waitForFunction(s => location.pathname === '/projects/' + s,
    SLUG, { timeout: 30000 }).catch(() => {});
  await wait(1800);
  const spaShot = path.join(OUT, 'erp_detail_spa.png');
  const spaLuma = await captureFirstSlide(page, spaShot);
  check('SPA entry: first slide is the DARK 1.jpg title page',
    spaLuma > 4 && spaLuma < 120, 'luma=' + spaLuma);
  check('SPA entry: detail sheet does not pull the motion cover files',
    !erpReqs.some(x => /cover\.(mp4|jpg)/.test(x)),
    erpReqs.slice(0, 6).join(' | ') || '(no /erp/ requests)');
  const spa = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    const body = sh && sh.querySelector('div[data-gl="text"]');
    return { path: location.pathname, id: sh && sh.getAttribute('data-id'),
      h1: sh && sh.querySelector('h1') && sh.querySelector('h1').textContent.trim(),
      op: body && +getComputedStyle(body).opacity,
      placeholders: document.querySelectorAll('[data-gl="simple"]').length };
  });
  check('SPA entry: sheet, Chinese copy and 11 placeholders',
    spa.path === '/projects/' + SLUG && spa.id === SLUG && spa.h1 === '华润ERP' &&
    spa.op === 1 && spa.placeholders === 11, JSON.stringify(spa));

  // (c) Direct URL load: same first slide, all 11 main stills arrive.
  erpReqs.length = 0;
  const p2 = await ctx.newPage();
  wire(p2);
  await p2.goto(O + '/projects/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p2.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 60000 }).catch(() => {});
  await wait(1800);
  const directShot = path.join(OUT, 'erp_detail_direct.png');
  const directLuma = await captureFirstSlide(p2, directShot);
  check('direct load: first slide is the DARK 1.jpg title page',
    directLuma > 4 && directLuma < 120, 'luma=' + directLuma);
  for (let i = 0; i < 8; i++) {
    await p2.mouse.move(720, 500);
    await p2.mouse.wheel(0, 700);
    await wait(200);
  }
  await wait(700);
  check('direct load: all 11 main stills fetched with 200',
    SLIDES.every(n => erpReqs.some(u => u === '/erp/' + n + '.jpg:200')),
    erpReqs.filter(u => /\/erp\/\d+\.jpg/.test(u)).join(' | '));
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
    fails: failed, results, luma: { spa: spaLuma, direct: directLuma },
    requests: erpReqs,
  }, null, 1));
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) {
    console.log('FAILED:', failed.map(f => f.name).join('; '));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
