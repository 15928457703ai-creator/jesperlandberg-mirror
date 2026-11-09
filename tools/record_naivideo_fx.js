/* LEGACY RECORDER — retired 2026-11-09.
 * The active home cover is now the 11-card collage recorded by
 * tools/record_naivideo_ultra.js.  Running this file would overwrite
 * site/naivideo/live.mp4 (and the three posters) with the old 8-slice FX.
 * It is kept as an archive; pass --force-legacy ONLY if you really intend to
 * restore the 8-slice version.
 */
if (!process.argv.includes('--force-legacy')) {
  console.log('LEGACY: this recorder targets the retired 8-slice cover and ' +
              'would overwrite the ACTIVE live.mp4.');
  console.log('Use tools/record_naivideo_ultra.js instead. ' +
              'Pass --force-legacy to override.');
  process.exit(0);
}

/* Record the user's Naivideo motion-FX showcase into a seamless looping mp4.

   Source: site/naivideo-fx.html + site/naivideo-fx/{style.css,main.js,assets}
   The user's JS is served VERBATIM.  A Playwright route injects a tiny
   capture hook into main.js at request time (inside its IIFE) which:
     - exposes the paused GSAP master timeline,
     - finishes the one-shot intro so frame 0 is the finished composition,
     - lets the recorder seek master.time(t) deterministically.

   The master timeline is a repeat:-1 sequence of 7 "moves", each of which
   returns every tile to its rest state before a .85s breather.  t=0 and
   t=duration are therefore the same clean composition -> the exported mp4
   has no visible seam.  Math.random is seeded with an LCG so tlScatter's
   random vectors are reproducible across takes.

   Usage:
     node tools/record_naivideo_fx.js --preview   # sample frames + duration
     node tools/record_naivideo_fx.js             # full mp4 + 3 posters
*/
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'screenshots');
const FRAMES = '/tmp/naivideo_fx_frames';
const SITE_NAIVIDEO = path.join(ROOT, 'site', 'naivideo');
const URL = 'http://127.0.0.1:5188/naivideo-fx?capture=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 24;
const PREVIEW = process.argv.includes('--preview');

// This exact line lives at the end of the user's main.js IIFE.  Replacing it
// exposes the master timeline without touching the shipped file on disk.
const ANCHOR = "  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) intro.play(0);";
const HOOK = `
  window.__nvFx = {
    master: master, intro: intro, duration: master.duration(),
    tiles: tiles.length,
    seek: function (t) {
      var D = master.duration();
      master.pause();
      master.time(((t % D) + D) % D, false);
    }
  };
  if (Q.has('capture')) {
    intro.progress(1, false);       // finish the entrance -> clean composition
    master.pause();
    window.__nvFx.seek(0);
  } else if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    intro.play(0);
  }
`;

const ff = () => execFileSync('python3', ['-c',
  'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],
  { encoding: 'utf8' }).trim();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage',
           '--force-device-scale-factor=1', '--hide-scrollbars'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();

  // Deterministic GSAP random() for tlScatter / random staggers.
  await page.addInitScript(() => {
    let s = 0x2f6e2b1 >>> 0;
    Math.random = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  });

  await page.route('**/naivideo-fx/main.js', async route => {
    const r = await route.fetch();
    let body = await r.text();
    if (!body.includes(ANCHOR)) throw new Error('capture anchor missing in main.js');
    body = body.replace(ANCHOR, HOOK);
    await route.fulfill({ response: r, body });
  });

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => Promise.all(
    [...document.images].map(i => i.complete ? null : i.decode().catch(() => null))));

  const info = await page.evaluate(() => {
    const fx = window.__nvFx;
    const stage = document.querySelector('.stage');
    return {
      duration: fx ? +fx.duration.toFixed(4) : null,
      tiles: document.querySelectorAll('.tile').length,
      loaded: [...document.images].filter(i => i.naturalWidth > 0).length,
      gsap: window.gsap ? window.gsap.version : null,
      seekable: !!(fx && typeof fx.seek === 'function'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      stageSize: (() => { const r = stage.getBoundingClientRect();
                          return [Math.round(r.width), Math.round(r.height)]; })(),
      firstTileVisible: (() => {
        const el = document.querySelector('.tile-3d');
        const s = getComputedStyle(el);
        return { opacity: s.opacity, visibility: s.visibility, transform: s.transform };
      })(),
    };
  });
  console.log('PAGE', JSON.stringify(info, null, 1));
  if (info.tiles !== 8 || info.loaded !== 8) throw new Error('8 slices must load');
  if (!info.gsap || !info.seekable || !info.duration) throw new Error('capture hook missing');
  if (info.bodyBg !== 'rgb(0, 0, 0)') throw new Error('background is not pure black');
  if (parseFloat(info.firstTileVisible.opacity) < .99 ||
      info.firstTileVisible.visibility !== 'visible') {
    throw new Error('intro did not finish: frame 0 is not the clean composition');
  }
  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));

  const DURATION = info.duration;
  const COUNT = Math.round(DURATION * FPS);
  console.log('loop duration:', DURATION, 's | frames:', COUNT, '@', FPS, 'fps');

  const seek = t => page.evaluate(sec => window.__nvFx.seek(sec), t);

  if (PREVIEW) {
    const TS = [0, .4, 1.2, 2.4, 4, 6, 8, 10, 12, 14, 16, 18, DURATION - .05];
    for (const t of TS.filter(x => x < DURATION)) {
      await seek(t);
      const name = 'nv_fx_t' + String(+t.toFixed(2)).replace('.', '_') + '.png';
      await page.screenshot({ path: path.join(OUT, name) });
      console.log('preview', name);
    }
    await browser.close();
    return;
  }

  for (const f of fs.readdirSync(FRAMES)) fs.unlinkSync(path.join(FRAMES, f));
  for (let i = 0; i < COUNT; i++) {
    await seek(i / FPS);
    await page.screenshot({
      path: path.join(FRAMES, 'f' + String(i).padStart(4, '0') + '.jpg'),
      type: 'jpeg', quality: 92,
    });
    if (i % 60 === 0) console.log('  frame', i, '/', COUNT);
  }
  await browser.close();

  const ffmpeg = ff();
  const mp4 = path.join(SITE_NAIVIDEO, 'live.mp4');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES, 'f%04d.jpg'),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-movflags', '+faststart', mp4], { stdio: 'inherit' });

  // Three poster variants from the clean t=0 composition.
  execFileSync('python3', ['-c', `
from PIL import Image
import os, json
site = ${JSON.stringify(SITE_NAIVIDEO)}
im = Image.open(${JSON.stringify(path.join(FRAMES, 'f0000.jpg'))}).convert('RGB')
assert im.size == (1600, 900), im.size
for suffix, w in (('', 1600), ('_card', 1200), ('_small', 640)):
    h = round(900 * w / 1600)
    out = os.path.join(site, 'live' + suffix + '.jpg')
    im.resize((w, h), Image.LANCZOS).save(out, quality=92, optimize=True, progressive=True)
    print('poster', os.path.basename(out), w, 'x', h)
# Keep the deck metadata truthful.  Only the URL and the pixel size reach the
# Nuxt payload (see project_config.video_url), so this never needs a rebuild.
meta = ${JSON.stringify(path.join(ROOT, 'raw', 'project_images', 'naivideo.json'))}
deck = json.load(open(meta, encoding='utf-8'))
deck[0]['source'] = 'naivideo-fx (user motion FX, 8 slices / 7 GSAP moves)'
deck[0]['video']['duration'] = ${DURATION}
json.dump(deck, open(meta, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('meta duration', ${DURATION})
`], { stdio: 'inherit' });

  console.log('\nmp4:', mp4, (fs.statSync(mp4).size / 1048576).toFixed(2), 'MB');
  console.log('duration:', DURATION, 's | frames:', COUNT);
  if (errs.length) console.log('page errors:', errs);
  fs.writeFileSync(path.join(ROOT, 'raw', 'naivideo_fx_meta.json'),
    JSON.stringify({ source: 'naivideo-fx.zip (user motion FX)',
                     gsap: info.gsap, duration: DURATION, fps: FPS,
                     frames: COUNT, size: [1600, 900] }, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
