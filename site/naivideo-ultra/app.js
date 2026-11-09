/* Naivideo — 11-card 3D collage
 * GSAP 3.15.1, no plugins.  Every effect owns exactly one transform layer:
 *   #wall        pointer parallax            #wallInner  timeline breathing
 *   .card-3d     intro / wave / detonate     .card-face  hover tilt + push
 *   .glow/.fx    light only (no transform conflicts)
 *
 * ?capture=1  deterministic, UI hidden, exposes window.__nvUltra.seek(t)
 * ?still=1    static composition for pixel comparison
 */
(() => {
  'use strict';
  const gsap = window.gsap;
  if (!gsap) return;

  /* Pixel positions recovered from 5760x3240 合集.jpg on a 1920x1080 canvas.
     Two compound slices were split at their internal seams (x=252 / x=265). */
  const LAYOUT = [
    { label: 'Portrait',        src: '/naivideo-ultra/assets/card-0.png', x:   59, y:  41, w: 350, h: 675, d: 1.6, r: 40 },
    { label: 'AI Effects',      src: '/naivideo-ultra/assets/card-1.png', x:  434, y:  41, w: 361, h: 325, d: 2.5, r: 34 },
    { label: 'Color Face',      src: '/naivideo-ultra/assets/card-2.png', x:  812, y:  41, w: 252, h: 324, d: 2.0, r: 34 },
    { label: 'Create Your Vision', src: '/naivideo-ultra/assets/card-3.png', x: 1077, y: 41, w: 380, h: 324, d: 2.0, r: 34 },
    { label: 'Episode 1',       src: '/naivideo-ultra/assets/card-4.png', x: 1485, y:  41, w: 358, h: 682, d: 1.3, r: 40 },
    { label: 'Navigate AI Video', src: '/naivideo-ultra/assets/card-5.png', x: 428, y: 390, w: 657, h: 326, d: 2.8, r: 34 },
    { label: 'New Version',     src: '/naivideo-ultra/assets/card-6.png', x: 1111, y: 366, w: 358, h: 682, d: 1.8, r: 40 },
    { label: 'AI Music',        src: '/naivideo-ultra/assets/card-7.png', x:   59, y: 739, w: 350, h: 301, d: 2.2, r: 34 },
    { label: 'Holo Face',       src: '/naivideo-ultra/assets/card-8.png', x:  434, y: 739, w: 252, h: 301, d: 2.6, r: 34 },
    { label: 'Mobile App',      src: '/naivideo-ultra/assets/card-9.png', x:  696, y: 739, w: 394, h: 301, d: 2.6, r: 34 },
    { label: 'Meet Naivideo',   src: null,                              x: 1485, y: 739, w: 358, h: 301, d: 1.5, r: 34 }
  ];
  // offset that snaps each card's centre onto the stage centre (960,540)
  const CENTER = LAYOUT.map(c => ({ x: 960 - (c.x + c.w / 2), y: 540 - (c.y + c.h / 2) }));

  const Q = new URLSearchParams(location.search);
  const CAPTURE = Q.has('capture');
  const STILL = Q.has('still');
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = gsap.utils.random;

  const $ = id => document.getElementById(id);
  const wall = $('wall'), wallInner = $('wallInner'), shaker = $('shaker');
  const flash = $('flash'), shock = $('shock'), dust = $('dust');
  const focus = $('focus'), focusCard = $('focusCard'), focusMeta = $('focusMeta');
  const navPrev = $('navPrev'), navNext = $('navNext');
  if (CAPTURE || STILL) document.documentElement.classList.add('capture');
  if (STILL) document.documentElement.classList.add('still');

  /* ── build the 11 independent cards ───────────────────────────────── */
  wallInner.innerHTML = LAYOUT.map((c, i) => {
    const art = c.src
      ? '<img src="' + c.src + '" alt="" draggable="false">'
      : '<div class="meet"><b class="m1">Meet</b><b class="m2">Naivideo</b></div>';
    const imgVar = c.src ? 'url(' + c.src + ')' : 'none';
    return '<div class="card" data-i="' + i + '" style="--x:' + c.x + 'px;--y:' + c.y +
      'px;--w:' + c.w + 'px;--h:' + c.h + 'px;--r:' + c.r + 'px">' +
        '<div class="glow"></div>' +
        '<div class="card-3d"><div class="card-face">' + art +
          '<i class="fx aurora"></i><i class="fx glare"></i>' +
          '<i class="fx pulse"></i>' +
          '<i class="fx rgb" style="--img:' + imgVar + '"></i>' +
          '<i class="corner c1"></i><i class="corner c2"></i>' +
          '<i class="corner c3"></i><i class="corner c4"></i>' +
        '</div></div>' +
      '</div>';
  }).join('');

  const cards = gsap.utils.toArray('.card');
  const d3 = cards.map(c => c.querySelector('.card-3d'));
  const faces = cards.map(c => c.querySelector('.card-face'));
  const glows = cards.map(c => c.querySelector('.glow'));
  const auroras = cards.map(c => c.querySelector('.aurora'));
  const glares = cards.map(c => c.querySelector('.glare'));
  const pulses = cards.map(c => c.querySelector('.pulse'));
  const rgbs = cards.map(c => c.querySelector('.rgb'));
  const corners = cards.map(c => gsap.utils.toArray(c.querySelectorAll('.corner')));
  const N = cards.length;

  /* ── fixed stage, uniform fit ─────────────────────────────────────── */
  let W = innerWidth, H = innerHeight;
  function fit() {
    W = innerWidth; H = innerHeight;
    const s = Math.min(W / 1920, H / 1080);
    document.documentElement.style.setProperty('--s', s);
    resizeDust();
  }

  /* ── state ────────────────────────────────────────────────────────── */
  const S = {
    intensity: 1, wave: true, dustOn: true, cruise: false,
    mode: 'IDLE', mx: 960, my: 540, focus: -1, burstAt: -999
  };
  gsap.defaults({ ease: 'power2.out' });
  gsap.set(cards, { z: i => LAYOUT[i].d * 16, force3D: true });
  gsap.set(d3.concat(faces), { force3D: true });

  function resetRest() {
    gsap.set(d3, { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotation: 0,
                   scale: 1, autoAlpha: 1, filter: 'blur(0px)' });
    gsap.set(faces, { x: 0, y: 0, rotationX: 0, rotationY: 0, scale: 1,
                      filter: 'blur(0px)' });
    gsap.set(wallInner, { rotationX: 0, rotationY: 0, rotation: 0, scale: 1 });
    gsap.set(wall, { rotationX: 0, rotationY: 0, scale: 1, opacity: 1,
                     filter: 'blur(0px)' });
    gsap.set(glows, { opacity: 0 });
    gsap.set(auroras, { opacity: 0 });
    gsap.set(pulses, { opacity: 0 });
    gsap.set(rgbs, { opacity: 0, x: 0 });
    gsap.set(glares, { xPercent: -160, opacity: 0 });
    corners.forEach(cs => gsap.set(cs, { opacity: 0, scale: 1.6 }));
    gsap.set(flash, { opacity: 0 });
    gsap.set(shock, { scale: .1, opacity: 0 });
    gsap.set(shaker, { x: 0, y: 0 });
  }
  resetRest();

  /* ── deterministic star dust (pure function of loop time) ─────────── */
  const cx = dust.getContext('2d');
  const P = [];
  for (let i = 0; i < 92; i++) {
    P.push({
      bx: ((i * 0.61803398875) % 1), by: ((i * 0.38196601125) % 1),
      ph: (i * 2.399963) % (Math.PI * 2),
      amp: 12 + (i % 7) * 5, sp: 1 + (i % 3),
      r: .7 + (i % 4) * .35
    });
  }
  const BURST = [];
  for (let i = 0; i < 54; i++) {
    const a = i * 2.399963, v = 180 + (i % 9) * 46;
    BURST.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1 + (i % 4) * .7 });
  }
  function resizeDust() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    dust.width = Math.round(W * dpr); dust.height = Math.round(H * dpr);
    dust.style.width = W + 'px'; dust.style.height = H + 'px';
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function drawDust(t, DUR, burstAt) {
    cx.clearRect(0, 0, W, H);
    if (!S.dustOn) return;
    const phase = 2 * Math.PI * (t / DUR);
    // capture uses a fixed Lissajous "cursor" so the repulsion is reproducible
    const px = CAPTURE || S.cruise ? W * (.5 + .30 * Math.sin(phase))
                                   : S.mx;
    const py = CAPTURE || S.cruise ? H * (.5 + .23 * Math.cos(phase * 2))
                                   : S.my;
    const pts = [];
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      let x = p.bx * W + Math.sin(phase * p.sp + p.ph) * p.amp;
      let y = p.by * H + Math.cos(phase * p.sp + p.ph * 1.3) * p.amp;
      const dx = x - px, dy = y - py, d = Math.hypot(dx, dy) || 1;
      if (d < 132) { const f = (1 - d / 132) * 46; x += dx / d * f; y += dy / d * f; }
      pts.push([x, y, p.r]);
      cx.beginPath(); cx.arc(x, y, p.r, 0, 6.2832);
      cx.fillStyle = 'rgba(186,206,255,' + (.24 + .28 * Math.abs(Math.sin(phase * p.sp + p.ph))) + ')';
      cx.fill();
    }
    cx.lineWidth = .6;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
        const d2 = dx * dx + dy * dy;
        if (d2 < 10800) {
          cx.strokeStyle = 'rgba(140,170,255,' + (.13 * (1 - d2 / 10800)) + ')';
          cx.beginPath(); cx.moveTo(pts[i][0], pts[i][1]);
          cx.lineTo(pts[j][0], pts[j][1]); cx.stroke();
        }
      }
    }
    const k = (t - burstAt) / 2.8;
    if (k > 0 && k < 1) {
      cx.fillStyle = 'rgba(255,236,200,' + (1 - k) * .9 + ')';
      for (let i = 0; i < BURST.length; i++) {
        const b = BURST[i];
        cx.beginPath();
        cx.arc(W / 2 + b.vx * k, H / 2 + b.vy * k * .68, b.r * (1 - k * .55), 0, 6.2832);
        cx.fill();
      }
    }
  }

  /* ── the seamless loop ────────────────────────────────────────────── */
  const DUR = CAPTURE ? 16 : 8;
  let master = null;

  function buildMaster() {
    if (master) master.kill();
    resetRest();
    const I = CAPTURE ? 1 : S.intensity;
    const tl = gsap.timeline({ paused: true, repeat: -1 });
    const order = LAYOUT.map((c, i) => ({ i, k: c.x + c.y }))
                        .sort((a, b) => a.k - b.k).map(o => o.i);

    function wave(at, rev) {
      const seq = rev ? order.slice().reverse() : order;
      seq.forEach((idx, n) => {
        const t = at + n * .072;
        tl.to(d3[idx], { z: 74 * I, scale: 1.028, duration: .32, ease: 'power2.out' }, t)
          .to(d3[idx], { z: 0, scale: 1, duration: .72, ease: 'elastic.out(1,.62)' }, t + .32);
        tl.to(glows[idx], { opacity: S.wave ? 1 : 0, duration: .2 }, t)
          .to(glows[idx], { opacity: 0, duration: .72 }, t + .24);
        tl.to(pulses[idx], { opacity: S.wave ? .95 : 0, duration: .22 }, t)
          .to(pulses[idx], { opacity: 0, duration: .82 }, t + .26);
      });
    }
    /* ── opener: every card implodes to centre, then explodes out to grid ── */
    tl.to(d3, {
      x: i => CENTER[i].x, y: i => CENTER[i].y, scale: .16, z: 0,
      duration: .85, ease: 'power2.in', stagger: { each: .02, from: 'center' }
    }, 0.15)
      .to(flash, { opacity: .7, duration: .12 }, 1.0)
      .to(flash, { opacity: 0, duration: .5 }, 1.12)
      .set(shock, { scale: .1, opacity: .9 }, 1.05)
      .to(shock, { scale: 3.4, opacity: 0, duration: 1.0, ease: 'power2.out' }, 1.05)
      .set(shock, { scale: .1, opacity: 0 }, 2.05)
      .to(d3, {
        x: 0, y: 0, scale: 1,
        duration: 1.0, ease: 'back.out(1.5)', stagger: { each: .045, from: 'edges' }
      }, 1.05)
      .to(glows, { opacity: .9, duration: .2, stagger: .012 }, 1.05)
      .to(glows, { opacity: 0, duration: 1.0, stagger: .012 }, 2.0);
    wave(2.7, false);
    tl.to(wallInner, { rotationY: 3.2 * I, rotationX: -2.1 * I,
                       duration: 1.0, ease: 'sine.inOut' }, 5.3)
      .to(wallInner, { rotationY: -3.2 * I, rotationX: 2.1 * I,
                       duration: 1.2, ease: 'sine.inOut' }, 6.3)
      .to(wallInner, { rotationY: 0, rotationX: 0,
                       duration: 1.0, ease: 'sine.inOut' }, 7.5);
    wave(8.4, true);

    if (CAPTURE) {
      const R = cards.map(() => ({
        x: rand(-690, 690), y: rand(-440, 440), z: rand(-880, 460),
        rx: rand(-155, 155), ry: rand(-155, 155), rr: rand(-105, 105),
        s: rand(.3, .62)
      }));
      tl.to(d3, {
        x: i => R[i].x, y: i => R[i].y, z: i => R[i].z,
        rotationX: i => R[i].rx, rotationY: i => R[i].ry,
        rotation: i => R[i].rr, scale: i => R[i].s,
        duration: .64, ease: 'power3.in', stagger: { each: .014, from: 'random' }
      }, 11.0)
        .to(flash, { opacity: .48, duration: .1 }, 11.4)
        .to(flash, { opacity: 0, duration: .5 }, 11.5)
        .set(shock, { scale: .1, opacity: .95 }, 11.4)
        .to(shock, { scale: 3.7, opacity: 0, duration: 1.15, ease: 'power2.out' }, 11.4)
        .set(shock, { scale: .1, opacity: 0 }, 12.6)
        .to(shaker, { x: 7, y: -5, duration: .05, repeat: 9, yoyo: true, ease: 'none' }, 11.42)
        .set(shaker, { x: 0, y: 0 }, 11.95)
        .to(d3, { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotation: 0,
                  scale: 1, duration: 1.8, ease: 'elastic.out(1,.56)',
                  stagger: { each: .028, from: 'center' } }, 11.85);
    }
    // force the exact loop length; everything above returns to rest before it.
    tl.to({ _pad: 0 }, { _pad: 1, duration: .001 }, DUR - .001);
    master = tl;
    return tl;
  }
  buildMaster();

  /* ── one-shot entrance (interactive preview only) ─────────────────── */
  const intro = gsap.timeline({ paused: true });
  intro.fromTo(d3,
    { x: i => CENTER[i].x, y: i => CENTER[i].y, scale: .16, z: 0, autoAlpha: 0 },
    { x: 0, y: 0, scale: 1, z: 0, autoAlpha: 1, duration: 1.5,
      ease: 'back.out(1.5)', stagger: { each: .05, from: 'center' },
      immediateRender: false }, 0)
    .fromTo(flash, { opacity: 0 }, { opacity: .7, duration: .1,
      immediateRender: false }, 1.35)
    .to(flash, { opacity: 0, duration: .5 }, 1.54)
    .fromTo(shock, { scale: .1, opacity: 1 },
      { scale: 3.9, opacity: 0, duration: 1.2, ease: 'power2.out',
        immediateRender: false }, 1.45)
    .to(glows, { opacity: .95, duration: .2, stagger: .012 }, 1.45)
    .to(glows, { opacity: 0, duration: 1.05, stagger: .012 }, 1.8);

  /* ── manual detonate (D / console) ────────────────────────────────── */
  function detonate() {
    if (S.mode === 'DETONATE') return;
    S.mode = 'DETONATE'; setMode('DETONATE');
    const I = S.intensity;
    const R = cards.map(() => ({
      x: rand(-690, 690) * I, y: rand(-440, 440) * I, z: rand(-880, 460),
      rx: rand(-155, 155), ry: rand(-155, 155), rr: rand(-105, 105),
      s: rand(.3, .62)
    }));
    S.burstAt = master.time();
    const tl = gsap.timeline({ onComplete: () => { S.mode = 'IDLE'; setMode('IDLE'); } });
    master.pause();
    tl.to(d3, {
      x: i => R[i].x, y: i => R[i].y, z: i => R[i].z,
      rotationX: i => R[i].rx, rotationY: i => R[i].ry,
      rotation: i => R[i].rr, scale: i => R[i].s,
      duration: .64, ease: 'power3.in', stagger: { each: .014, from: 'random' }
    }, 0)
      .to(flash, { opacity: .48, duration: .1 }, .4)
      .to(flash, { opacity: 0, duration: .5 }, .5)
      .fromTo(shock, { scale: .1, opacity: .95 },
        { scale: 3.7, opacity: 0, duration: 1.15, ease: 'power2.out',
          immediateRender: false }, .42)
      .to(shaker, { x: 7 * I, y: -5 * I, duration: .05, repeat: 9,
                    yoyo: true, ease: 'none' }, .42)
      .set(shaker, { x: 0, y: 0 }, .95)
      .to(d3, { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotation: 0,
                scale: 1, duration: 1.75, ease: 'elastic.out(1,.56)',
                stagger: { each: .028, from: 'center' } }, .82)
      .add(() => { resetRest(); master.play(); }, 2.7);
  }

  function resetAll() {
    S.mode = 'IDLE'; setMode('IDLE'); S.burstAt = -999;
    gsap.killTweensOf(d3.concat(faces, glows, pulses, glares, auroras, rgbs,
                                [flash, shock, shaker, wall, wallInner]));
    corners.forEach(cs => gsap.killTweensOf(cs));
    closeFocus(true);
    buildMaster();
    master.play(0);
  }

  /* ── focus / FLIP ─────────────────────────────────────────────────── */
  function focusRect(i) {
    const c = LAYOUT[i];
    let w = Math.min(W * .52, 760), h = w * c.h / c.w;
    const maxH = H * .64;
    if (h > maxH) { h = maxH; w = h * c.w / c.h; }
    return { l: (W - w) / 2, t: (H - h) / 2, w, h };
  }
  function focusHTML(i) {
    const c = LAYOUT[i], r = focusRect(i), k = r.w / c.w;
    if (c.src) return '<img src="' + c.src + '" alt="">';
    return '<div class="meet" style="font-size:' + (64 * k) + 'px;padding-left:' +
      (58 * k) + 'px;transform:none;border-radius:0">' +
      '<b class="m1">Meet</b><b class="m2">Naivideo</b></div>';
  }
  function updateMeta(i) {
    focusMeta.querySelector('.idx').textContent =
      String(i + 1).padStart(2, '0') + ' / ' + String(N).padStart(2, '0') + '  ·  FOCUS';
    focusMeta.querySelector('.ttl').textContent = LAYOUT[i].label;
  }
  function openFocus(i) {
    const first = S.focus < 0;
    const src = cards[i].getBoundingClientRect(), dst = focusRect(i);
    focusCard.innerHTML = focusHTML(i);
    gsap.set(focusCard, {
      visibility: 'visible', left: dst.l, top: dst.t, width: dst.w, height: dst.h,
      borderRadius: Math.min(34 * dst.w / LAYOUT[i].w, 48) + 'px',
      transformOrigin: 'top left'
    });
    if (first) {
      gsap.fromTo(focusCard,
        { x: src.left - dst.l, y: src.top - dst.t,
          scaleX: src.width / dst.w, scaleY: src.height / dst.h, opacity: .7 },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1,
          duration: .72, ease: 'power3.inOut' });
      gsap.to(focus, { autoAlpha: 1, duration: .35 });
      gsap.to('#wall', { filter: 'blur(9px)', scale: .9, opacity: .4, duration: .6 });
      gsap.to([focusMeta, navPrev, navNext], { autoAlpha: 1, duration: .4, delay: .22 });
    } else {
      gsap.fromTo(focusCard, { x: 34, opacity: .35 },
        { x: 0, opacity: 1, duration: .34 });
    }
    S.focus = i; S.mode = 'FOCUS'; setMode('FOCUS'); updateMeta(i);
  }
  function closeFocus(instant) {
    if (S.focus < 0) return;
    const i = S.focus;
    if (!instant) {
      const src = cards[i].getBoundingClientRect(), dst = focusRect(i);
      gsap.to(focusCard, {
        x: src.left - dst.l, y: src.top - dst.t,
        scaleX: src.width / dst.w, scaleY: src.height / dst.h,
        opacity: .4, duration: .5, ease: 'power3.inOut',
        onComplete: () => gsap.set(focusCard, { visibility: 'hidden' })
      });
    } else {
      gsap.set(focusCard, { visibility: 'hidden' });
    }
    gsap.to(focus, { autoAlpha: 0, duration: instant ? 0 : .4 });
    gsap.to('#wall', { filter: 'blur(0px)', scale: 1, opacity: 1,
                       duration: instant ? 0 : .6 });
    gsap.to([focusMeta, navPrev, navNext],
            { autoAlpha: 0, duration: instant ? 0 : .2 });
    S.focus = -1; S.mode = 'IDLE'; setMode('IDLE');
  }

  /* ── HUD ──────────────────────────────────────────────────────────── */
  function setMode(m) { const e = $('hMode'); if (e) e.textContent = m; }
  let fpsT = performance.now(), fpsN = 0;
  function hudTick() {
    fpsN++;
    const now = performance.now();
    if (now - fpsT > 500) {
      $('hFps').textContent = Math.round(fpsN * 1000 / (now - fpsT));
      fpsN = 0; fpsT = now;
    }
    $('hXY').textContent = Math.round(S.mx) + ' / ' + Math.round(S.my);
    if (S.mode !== 'FOCUS' && S.mode !== 'DETONATE') {
      const t = master.time();
      let m = 'IDLE';
      if (S.cruise) m = 'CRUISE';
      else if ((t > 2.6 && t < 4.8) || (t > 8.3 && t < 10.4)) m = 'WAVE';
      else if (t > 5.2 && t < 8.6) m = 'BREATHE';
      setMode(m);
    }
    if (!CAPTURE) drawDust(master.time(), DUR, S.burstAt);
  }

  /* ── interaction (skipped entirely in capture / still mode) ───────── */
  function bindUI() {
    const qx = gsap.quickTo('#wall', 'rotationY', { duration: .7, ease: 'power2.out' });
    const qy = gsap.quickTo('#wall', 'rotationX', { duration: .7, ease: 'power2.out' });
    addEventListener('pointermove', e => {
      S.mx = e.clientX; S.my = e.clientY;
      if (!S.cruise) {
        qx(((e.clientX / W) - .5) * 10 * S.intensity);
        qy(-((e.clientY / H) - .5) * 8 * S.intensity);
      }
    });
    addEventListener('resize', fit);

    cards.forEach((card, i) => {
      const qrx = gsap.quickTo(faces[i], 'rotationY', { duration: .34, ease: 'power2.out' });
      const qry = gsap.quickTo(faces[i], 'rotationX', { duration: .34, ease: 'power2.out' });
      let glitch = null;
      card.addEventListener('pointerenter', () => {
        gsap.to(faces[i], { scale: 1.055, duration: .45, ease: 'power3.out' });
        gsap.to(auroras[i], { opacity: 1, duration: .3 });
        gsap.to(corners[i], { opacity: 1, scale: 1, duration: .4, stagger: .04 });
        gsap.fromTo(glares[i], { xPercent: -160, opacity: .9 },
          { xPercent: 160, opacity: 0, duration: .85, ease: 'power2.inOut' });
        glitch = gsap.to(rgbs[i], { opacity: .62, x: 3, duration: .075,
          repeat: 7, yoyo: true, ease: 'steps(1)' });
      });
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        qrx(((e.clientX - r.left) / r.width - .5) * 17);
        qry(-((e.clientY - r.top) / r.height - .5) * 15);
      });
      card.addEventListener('pointerleave', () => {
        gsap.to(faces[i], { scale: 1, rotationX: 0, rotationY: 0, duration: .6 });
        gsap.to(auroras[i], { opacity: 0, duration: .3 });
        gsap.to(corners[i], { opacity: 0, scale: 1.6, duration: .3 });
        gsap.to(rgbs[i], { opacity: 0, x: 0, duration: .2 });
        if (glitch) { glitch.kill(); glitch = null; }
      });
      card.addEventListener('click', () => openFocus(i));
    });

    navPrev.addEventListener('click', () => openFocus((S.focus - 1 + N) % N));
    navNext.addEventListener('click', () => openFocus((S.focus + 1) % N));
    focus.addEventListener('click', e => { if (e.target === focus) closeFocus(); });

    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === 'd') detonate();
      else if (k === 'r') resetAll();
      else if (k === ' ' || k === 'spacebar') {
        e.preventDefault(); S.cruise = !S.cruise;
        toggleUI($('tCruise'), S.cruise); setMode(S.cruise ? 'CRUISE' : 'IDLE');
      } else if (k === 'escape') closeFocus();
      else if (k === 'arrowleft' && S.focus >= 0) openFocus((S.focus - 1 + N) % N);
      else if (k === 'arrowright' && S.focus >= 0) openFocus((S.focus + 1) % N);
    });

    function toggleUI(el, on) { el.classList.toggle('on', on); }
    const range = $('cRange');
    range.addEventListener('input', () => {
      S.intensity = parseFloat(range.value);
      $('cVal').textContent = S.intensity.toFixed(2);
    });
    range.addEventListener('change', () => { buildMaster(); master.play(master.time()); });
    [['tWave', 'wave'], ['tDust', 'dustOn'], ['tCruise', 'cruise']].forEach(([id, key]) => {
      $(id).addEventListener('click', () => {
        S[key] = !S[key]; toggleUI($(id), S[key]);
        if (key === 'wave') { buildMaster(); master.play(master.time()); }
        if (key === 'cruise') setMode(S.cruise ? 'CRUISE' : 'IDLE');
      });
    });
    $('bBoom').addEventListener('click', detonate);
    $('bReset').addEventListener('click', resetAll);
  }

  /* ── boot ─────────────────────────────────────────────────────────── */
  fit();
  if (CAPTURE || STILL || REDUCE) {
    intro.progress(1, false);          // land on the finished composition
    master.pause(0);
    resetRest();
    master.time(0, false);
    drawDust(0, DUR, CAPTURE ? 9.4 : -999);
  } else {
    bindUI();
    intro.eventCallback('onComplete', () => master.play(0));
    intro.play(0);
    gsap.ticker.add(hudTick);
  }

  /* deterministic recording hook — never touches the shipped timelines */
  window.__nvUltra = {
    gsap: gsap.version,
    duration: DUR,
    cards: N,
    master: master,
    seek(t) {
      const tt = ((t % DUR) + DUR) % DUR;
      master.pause();
      master.time(tt, false);
      drawDust(tt, DUR, 9.4);
    },
    state() {
      return { mode: S.mode, cards: N, duration: DUR,
               timeline: master.duration(), gsap: gsap.version };
    }
  };
})();
