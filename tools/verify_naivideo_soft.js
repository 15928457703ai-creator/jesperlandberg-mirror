/* Quantify the "softer entrance" of the Naivideo GSAP timeline.

   In capture mode the master timeline is paused and seekable, so we can
   sample tile opacity / blur / travel at exact times and assert that the
   reveal is gradual (no black frame, no pop), that the loop starts and ends
   on the same soft state, and that reduced-motion users get a static collage.
*/
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const ORIGIN = 'http://127.0.0.1:5188';
const OUT = path.join(__dirname, '..', 'screenshots');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SAMPLES = [0, .2, .4, .6, .9, 1.2, 1.8, 2.4, 3.2, 6, 9.3, 10.5, 11.9];

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage',
           '--force-device-scale-factor=1', '--hide-scrollbars']
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const perr = [], cerr = [], bad = [], ext = [];
  page.on('pageerror', e => perr.push(e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text().slice(0, 200)); });
  page.on('requestfailed', r => {
    const e = (r.failure() || {}).errorText || '';
    if (!/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(e)) bad.push('FAILED ' + r.url());
  });
  page.on('response', r => {
    const u = r.url();
    if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u);
    if (r.status() >= 400) bad.push(r.status() + ' ' + u);
  });

  // ------------------------------------------------ deterministic sampling
  await page.goto(ORIGIN + '/naivideo-live-legacy?capture=1', { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => Promise.all(
    [...document.images].map(i => i.complete ? null : i.decode().catch(() => null))));

  const env = await page.evaluate(() => ({
    gsap: window.gsap ? window.gsap.version : null,
    duration: window.__nvDuration,
    seekable: typeof window.__nvSeek === 'function',
    tiles: document.querySelectorAll('.tile').length,
    images: [...document.images].filter(i => i.naturalWidth > 0).length,
    stageBg: getComputedStyle(document.querySelector('.stage')).backgroundImage,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));
  console.log('ENV', JSON.stringify(env));

  const read = () => page.evaluate(() => [...document.querySelectorAll('.t-inner')].map(el => {
    const s = getComputedStyle(el);
    const m = s.filter.match(/blur\(([\d.]+)px\)/);
    const t = new DOMMatrixReadOnly(s.transform);
    return {
      o: +parseFloat(s.opacity).toFixed(3),
      blur: m ? +parseFloat(m[1]).toFixed(2) : 0,
      y: +t.m42.toFixed(2),
    };
  }));

  const samples = [];
  for (const t of SAMPLES) {
    await page.evaluate(sec => window.__nvSeek(sec), t);
    const tiles = await read();
    const avg = tiles.reduce((a, x) => a + x.o, 0) / tiles.length;
    const maxBlur = Math.max(...tiles.map(x => x.blur));
    samples.push({ t, avg: +avg.toFixed(3), min: Math.min(...tiles.map(x => x.o)),
                   max: Math.max(...tiles.map(x => x.o)), maxBlur,
                   first: tiles[0].o, last: tiles[8].o, maxY: Math.max(...tiles.map(x => x.y)) });
    if ([0, .6, 3.2, 11.9].includes(t)) {
      await page.screenshot({ path: path.join(OUT, 'nv_soft_t' + String(t).replace('.', '_') + '.png') });
    }
  }
  console.log('\nSAMPLES (t | avg opacity | min | max | max blur | first/last | maxY)');
  for (const s of samples) {
    console.log('  %s\t%s\t%s\t%s\t%s\t%s / %s\t%s',
      String(s.t).padEnd(5), String(s.avg).padEnd(6), String(s.min).padEnd(6),
      String(s.max).padEnd(6), String(s.maxBlur).padEnd(6),
      String(s.first).padEnd(6), String(s.last).padEnd(6), s.maxY);
  }

  const entrance = samples.filter(s => s.t <= 3.2);
  const deltas = entrance.slice(1).map((s, i) =>
    +(s.avg - entrance[i].avg).toFixed(3));
  const first = samples[0], last = samples[samples.length - 1];
  const monotonic = deltas.every(d => d >= -0.01);
  const noPop = Math.max(...deltas) < .25;
  const neverBlack = first.min >= .30;
  const softStart = first.maxBlur >= 2 && first.maxY >= 5;
  const settled = samples.find(s => s.t === 3.2).maxBlur < .05 &&
                  samples.find(s => s.t === 3.2).min >= .99;
  const seam = Math.abs(first.avg - last.avg) < .02;
  const flatBg = env.stageBg === 'none';

  console.log('\nentrance opacity deltas:', JSON.stringify(deltas));
  console.log('monotonic:', monotonic, '| no pop (<0.25):', noPop,
              '| never black:', neverBlack, '| soft start:', softStart);
  console.log('settled at 3.2s:', settled, '| loop seam:', seam, '| flat bg:', flatBg);

  // ------------------------------------------------- live page (autoplay)
  await page.goto(ORIGIN + '/naivideo-live-legacy', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(900);
  const a = await page.evaluate(() => window.__nvTimeline ? window.__nvTimeline.time() : null);
  await wait(900);
  const b = await page.evaluate(() => window.__nvTimeline ? window.__nvTimeline.time() : null);
  const autoplay = a !== null && b !== null && b > a;
  console.log('live page timeline:', a, '->', b, '| autoplay:', autoplay);

  // ------------------------------------------------- reduced motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(ORIGIN + '/naivideo-live-legacy', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(500);
  const reduced = await page.evaluate(() => ({
    timeline: !!window.__nvTimeline,
    opacities: [...document.querySelectorAll('.t-inner')]
      .map(e => +parseFloat(getComputedStyle(e).opacity).toFixed(2)),
    blurs: [...document.querySelectorAll('.t-inner')]
      .map(e => (getComputedStyle(e).filter.match(/blur\(([\d.]+)px\)/) || [0, 0])[1]),
  }));
  const reducedOk = !reduced.timeline &&
    reduced.opacities.length === 9 && reduced.opacities.every(o => o === 1) &&
    reduced.blurs.every(x => +x === 0);
  console.log('reduced motion:', JSON.stringify(reduced), '| OK:', reducedOk);

  const clean = !perr.length && !cerr.length && !bad.length && !ext.length;
  const ok = env.gsap && env.duration === 12 && env.seekable &&
             env.tiles === 9 && env.images === 9 && flatBg &&
             monotonic && noPop && neverBlack && softStart && settled && seam &&
             autoplay && reducedOk && clean;
  console.log('\n=== SOFT ENTRANCE VERIFY ===', ok ? 'PASS' : 'FAIL');
  console.log('page errors:', perr.length, 'console errors:', cerr.length,
              'bad/4xx:', bad.length, 'external:', ext.length);
  fs.writeFileSync(path.join(__dirname, '..', 'raw', 'verify_naivideo_soft.json'),
    JSON.stringify({ env, samples, deltas, monotonic, noPop, neverBlack,
                     softStart, settled, seam, flatBg, autoplay, reduced,
                     reducedOk, clean, ok, perr, cerr, bad, ext }, null, 1));
  await browser.close();
  if (!ok) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
