/* Record the 11-card Naivideo collage into a seamless looping mp4.

   Source: site/naivideo-ultra.html + style.css + app.js + assets/card-0..9.png
   app.js ships a real deterministic capture hook (window.__nvUltra.seek), so
   no request interception is needed.  Math.random is seeded with an LCG so
   GSAP's random staggers and the DETONATE vectors are identical every take.

   Usage:
     node tools/record_naivideo_ultra.js --still     # static composition shot
     node tools/record_naivideo_ultra.js --preview   # sampled frames + state
     node tools/record_naivideo_ultra.js             # full mp4 + 3 posters
*/
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'screenshots');
const FRAMES = '/tmp/naivideo_ultra_frames';
const SITE_NAIVIDEO = path.join(ROOT, 'site', 'naivideo');
const META = path.join(ROOT, 'raw', 'project_images', 'naivideo.json');
const BASE = 'http://127.0.0.1:5188/naivideo-ultra';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 24;
const PREVIEW = process.argv.includes('--preview');
const STILL = process.argv.includes('--still');

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

  await page.addInitScript(() => {
    let s = 0x2f6e2b1 >>> 0;
    Math.random = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  });

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });

  const URL = BASE + (STILL ? '?still=1' : '?capture=1');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => Promise.all(
    [...document.images].map(i => i.complete ? null : i.decode().catch(() => null))));

  const info = await page.evaluate(() => {
    const fx = window.__nvUltra;
    const stage = document.getElementById('stageWrap');
    const first = document.querySelector('.card-3d');
    const s = first ? getComputedStyle(first) : {};
    return {
      duration: fx ? +fx.duration.toFixed(4) : null,
      timeline: fx ? +fx.master.duration().toFixed(4) : null,
      cards: document.querySelectorAll('.card').length,
      images: [...document.images].filter(i => i.naturalWidth > 0).length,
      gsap: window.gsap ? window.gsap.version : null,
      seekable: !!(fx && typeof fx.seek === 'function'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      stageSize: (() => { const r = stage.getBoundingClientRect();
                          return [Math.round(r.width), Math.round(r.height)]; })(),
      firstVisible: { opacity: s.opacity, visibility: s.visibility,
                      filter: s.filter, transform: s.transform },
      uiHidden: getComputedStyle(document.getElementById('console')).display,
    };
  });
  console.log('PAGE', JSON.stringify(info, null, 1));
  if (info.cards !== 11 || info.images !== 10) throw new Error('11 cards / 10 images must load');
  if (!info.gsap || !info.seekable || !info.duration) throw new Error('capture hook missing');
  if (info.bodyBg !== 'rgb(18, 18, 18)') throw new Error('background is not #121212');
  if (info.uiHidden !== 'none') throw new Error('console UI leaked into the capture');
  if (parseFloat(info.firstVisible.opacity) < .99 ||
      info.firstVisible.visibility !== 'visible') {
    throw new Error('frame 0 is not the clean composition');
  }
  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));

  if (STILL) {
    await page.screenshot({ path: path.join(OUT, 'naivideo_ultra_still.png') });
    console.log('still ->', path.join(OUT, 'naivideo_ultra_still.png'));
    await browser.close();
    return;
  }

  const DURATION = info.duration;
  const COUNT = Math.round(DURATION * FPS);
  console.log('loop duration:', DURATION, 's | frames:', COUNT, '@', FPS, 'fps');

  const seek = t => page.evaluate(sec => window.__nvUltra.seek(sec), t);

  if (PREVIEW) {
    const TS = [0, .8, 1.6, 3.6, 5.0, 6.6, 8.0, 9.3, 9.6, 10.2,
                11.4, 12.6, 14, 15.9];
    for (const t of TS.filter(x => x < DURATION)) {
      await seek(t);
      const name = 'nvu_t' + String(+t.toFixed(2)).replace('.', '_') + '.png';
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
meta = ${JSON.stringify(META)}
deck = json.load(open(meta, encoding='utf-8'))
deck[0]['source'] = 'naivideo-ultra (11-card 3D collage, GSAP)'
deck[0]['video']['duration'] = ${DURATION}
json.dump(deck, open(meta, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('meta duration', ${DURATION})
`], { stdio: 'inherit' });

  if (errs.length) console.log('page errors:', errs);
  fs.writeFileSync(path.join(ROOT, 'raw', 'naivideo_ultra_meta.json'),
    JSON.stringify({ source: '11-card 3D collage from 合集.jpg',
                     gsap: info.gsap, duration: DURATION, fps: FPS,
                     frames: COUNT, cards: 11, size: [1600, 900] }, null, 1));
  console.log('\nmp4:', mp4, (fs.statSync(mp4).size / 1048576).toFixed(2), 'MB');
  console.log('duration:', DURATION, 's | frames:', COUNT);
})().catch(e => { console.error(e); process.exit(1); });
