/* ═══════════════════════════════════════════════
   PURE BLACK STAGE — GSAP 3.12.5
   Only the 8 original artworks exist on this page.
   All motion is applied to those artworks, nothing else.
   ═══════════════════════════════════════════════ */
(() => {
  'use strict';
  const gsap = window.gsap;
  if (!gsap) return;

  const $ = s => document.querySelector(s);
  const Q = new URLSearchParams(location.search);
  const rand = gsap.utils.random;
  const clamp = gsap.utils.clamp;

  const stage     = $('#stage');
  const wrap      = $('#stageWrap');
  const tilesEl   = $('#tiles');
  const flash     = $('#flash');
  const focusEl   = $('#focus');
  const focusCard = $('#focusCard');

  const tiles  = gsap.utils.toArray('.tile');
  const d3     = tiles.map(t => t.querySelector('.tile-3d'));
  const faces  = tiles.map(t => t.querySelector('.tile-face'));
  const imgs   = tiles.map(t => t.querySelector('img'));
  const glows  = tiles.map(t => t.querySelector('.glow'));
  const glares = tiles.map(t => t.querySelector('.glare'));
  const sweeps = tiles.map(t => t.querySelector('.sweep'));
  const rgbs   = tiles.map(t => t.querySelector('.rgb'));
  const N = tiles.length;

  const META = tiles.map(t => {
    const cs = getComputedStyle(t);
    const px = k => parseFloat(cs.getPropertyValue(k)) || 0;
    return { x: px('--x'), y: px('--y'), w: px('--w'), h: px('--h'), d: px('--d') };
  });

  gsap.defaults({ ease: 'power3.out' });

  /* ── 等比适配：保持最终版合集的构图 ── */
  let SCALE = 1;
  function fit() {
    SCALE = Math.min(innerWidth / 1920, innerHeight / 1080) * 0.9;
    wrap.style.setProperty('--s', SCALE);
  }
  fit();
  addEventListener('resize', fit);

  /* ── 静态预览：不播放任何动效，仅用于截图 / 排版校验 ── */
  if (Q.has('still')) {
    document.documentElement.classList.add('still');
    const hv = Q.get('hover');
    if (hv !== null && tiles[+hv]) gsap.to(glows[+hv], { opacity: .75, duration: 0 });
    return;
  }

  /* ── 每张卡独立的 Z 深度，配合舞台旋转产生真实 3D 视差 ── */
  gsap.set(tiles, { z: i => META[i].d * 16, force3D: true });
  gsap.set(d3, { force3D: true });
  gsap.set(faces, { force3D: true });

  /* ═════════ 招式库：只动 .tile-3d，hover 只动 .tile-face，互不打架 ═════════ */
  function tlWave() {
    const tl = gsap.timeline();
    tl.to(d3, { y: -44, z: 120, scale: 1.05, duration: .44, stagger: { each: .055, from: 'start' }, ease: 'power3.out' }, 0)
      .to(d3, { y: 0, z: 0, scale: 1, duration: .95, stagger: { each: .055, from: 'end' }, ease: 'elastic.out(1,.55)' }, .9)
      .to(glows, { opacity: .85, duration: .3, stagger: .05 }, 0)
      .to(glows, { opacity: 0, duration: .75, stagger: .05 }, .7);
    return tl;
  }

  function tlTwist() {
    const tl = gsap.timeline();
    tl.to(d3, {
        rotation: i => (i % 2 ? 1 : -1) * 10,
        skewX: i => (i % 2 ? -1 : 1) * 7,
        scale: .92, duration: .42, stagger: .025, ease: 'power2.in'
      }, 0)
      .to(d3, { rotation: 0, skewX: 0, scale: 1, duration: 1.05, stagger: .025, ease: 'elastic.out(1,.42)' }, .62)
      .to(rgbs, { opacity: .75, duration: .07, repeat: 5, yoyo: true, stagger: .03 }, 0)
      .set(rgbs, { opacity: 0 });
    return tl;
  }

  function tlCascade() {
    const tl = gsap.timeline();
    tl.to(d3, { scale: 1.18, z: 190, duration: .36, stagger: { each: .06, from: 'random' }, ease: 'back.out(2.2)' }, 0)
      .to(d3, { scale: 1, z: 0, duration: .62, stagger: { each: .06, from: 'random' }, ease: 'power2.inOut' }, .82)
      .fromTo(sweeps, { xPercent: -160, opacity: 0 },
        { xPercent: 160, opacity: .9, duration: .9, stagger: .05, ease: 'power2.inOut' }, .1)
      .set(sweeps, { opacity: 0, xPercent: -160 });
    return tl;
  }

  function tlScatter() {
    const R = d3.map(() => ({
      x: rand(-640, 640), y: rand(-430, 430), z: rand(-820, 420),
      rx: rand(-165, 165), ry: rand(-165, 165), rr: rand(-110, 110), s: rand(.26, .6)
    }));
    const tl = gsap.timeline();
    tl.to(d3, {
        x: i => R[i].x, y: i => R[i].y, z: i => R[i].z,
        rotationX: i => R[i].rx, rotationY: i => R[i].ry,
        rotation: i => R[i].rr, scale: i => R[i].s,
        duration: .64, ease: 'power3.in', stagger: { each: .012, from: 'random' }
      }, 0)
      .to(flash, { opacity: .3, duration: .05 }, .44)
      .to(flash, { opacity: 0, duration: .3 }, .49)
      .to(glows, { opacity: 1, duration: .18 }, .42)
      .to(glows, { opacity: 0, duration: .9 }, 1.15)
      .to(d3, {
        x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotation: 0, scale: 1,
        duration: 1.4, ease: 'elastic.out(1,.55)', stagger: { each: .028, from: 'center' }
      }, .78);
    return tl;
  }

  function tlPulse() {
    const tl = gsap.timeline();
    tl.to(stage, { scale: 1.065, duration: .2, ease: 'power2.out' }, 0)
      .to(stage, { scale: 1, duration: .9, ease: 'elastic.out(1,.38)' }, .2)
      .to(d3, { filter: 'brightness(1.8) saturate(1.5)', duration: .18, stagger: .02, ease: 'none' }, 0)
      .to(d3, { filter: 'brightness(1) saturate(1)', duration: .75, stagger: .02 }, .35)
      .to(glows, { opacity: .9, duration: .15 }, 0)
      .to(glows, { opacity: 0, duration: .85 }, .35);
    return tl;
  }

  function tlGather() {
    const tl = gsap.timeline();
    tl.to(d3, {
        x: i => (960 - (META[i].x + META[i].w / 2)) * .42,
        y: i => (540 - (META[i].y + META[i].h / 2)) * .42,
        scale: .72, rotation: i => (i % 2 ? 1 : -1) * 14,
        duration: .6, stagger: .018, ease: 'power3.inOut'
      }, 0)
      .to(d3, { x: 0, y: 0, scale: 1, rotation: 0, duration: 1.15, stagger: .018, ease: 'elastic.out(1,.5)' }, .75);
    return tl;
  }

  function tlFlip() {
    const tl = gsap.timeline();
    tl.to(d3, { rotationX: 360, duration: .92, stagger: { each: .055, from: 'center' }, ease: 'power2.inOut' }, 0)
      .set(d3, { rotationX: 0 }, 1.32)
      .fromTo(sweeps, { xPercent: -160, opacity: 0 },
        { xPercent: 160, opacity: .85, duration: .8, stagger: .045, ease: 'power2.inOut' }, .15)
      .set(sweeps, { opacity: 0, xPercent: -160 });
    return tl;
  }

  /* ── 主时间线：招式循环播放 ── */
  const MOVES = [tlWave, tlTwist, tlCascade, tlScatter, tlPulse, tlGather, tlFlip];
  const master = gsap.timeline({ repeat: -1, paused: true });
  MOVES.forEach((fn, i) => {
    master.addLabel('move' + i);
    master.add(fn());
    master.to({}, { duration: .85 });
  });
  master.addLabel('scatter', master.labels['move3']);

  /* ── 入场：从 Z 轴深处带着模糊与 3D 旋转砸入 ── */
  const intro = gsap.timeline({ paused: true, onComplete: () => master.play(0) });
  gsap.set(d3, {
    z: -1000, autoAlpha: 0, scale: .32, filter: 'blur(16px)',
    rotationX: () => rand(-75, 75), rotationY: () => rand(-75, 75),
    x: () => rand(-360, 360), y: () => rand(-260, 260)
  });
  gsap.set(stage, { scale: .8 });
  intro.to(d3, {
      z: 0, autoAlpha: 1, scale: 1, filter: 'blur(0px)',
      rotationX: 0, rotationY: 0, x: 0, y: 0,
      duration: 1.45, stagger: { each: .08, from: 'random' }, ease: 'expo.out'
    }, 0)
    .to(stage, { scale: 1, duration: 1.75, ease: 'expo.out' }, 0)
    .to(flash, { opacity: .28, duration: .05 }, .95)
    .to(flash, { opacity: 0, duration: .35 }, 1.0);

  /* ── 鼠标：舞台 3D 视差（quickTo 复用单个 tween） ── */
  const stRX = gsap.quickTo(stage, 'rotationX', { duration: .8, ease: 'power3' });
  const stRY = gsap.quickTo(stage, 'rotationY', { duration: .8, ease: 'power3' });
  const tsX  = gsap.quickTo(tilesEl, 'x', { duration: 1, ease: 'power3' });
  const tsY  = gsap.quickTo(tilesEl, 'y', { duration: 1, ease: 'power3' });

  addEventListener('pointermove', e => {
    const nx = (e.clientX / innerWidth - .5) * 2;
    const ny = (e.clientY / innerHeight - .5) * 2;
    stRX(-ny * 7); stRY(nx * 7);
    tsX(nx * 12);  tsY(ny * 12);
  }, { passive: true });

  /* ── 悬停：全息倾斜 + 光晕 + 高光扫过 + 色差闪 ── */
  const q = faces.map((f, i) => ({
    rx: gsap.quickTo(f, 'rotationX', { duration: .55, ease: 'power3' }),
    ry: gsap.quickTo(f, 'rotationY', { duration: .55, ease: 'power3' }),
    sc: gsap.quickTo(f, 'scale',    { duration: .55, ease: 'power3' })
  }));

  tiles.forEach((tile, i) => {
    let rect = null;
    const sweepTl = gsap.timeline({ paused: true })
      .set(sweeps[i], { xPercent: -160, opacity: 0 })
      .to(sweeps[i], { opacity: 1, duration: .12 }, .04)
      .to(sweeps[i], { xPercent: 160, duration: .82, ease: 'power2.inOut' }, 0)
      .to(sweeps[i], { opacity: 0, duration: .22 }, .62)
      .set(sweeps[i], { opacity: 0, xPercent: -160 });

    tile.addEventListener('pointerenter', () => {
      if (focusIdx >= 0) return;
      rect = tile.getBoundingClientRect();
      q[i].sc(1.06);
      gsap.to(glows[i], { opacity: .9, duration: .35, overwrite: 'auto' });
      gsap.to(glares[i], { opacity: .7, duration: .4, overwrite: 'auto' });
      gsap.to(imgs[i], { scale: 1.07, duration: .8, ease: 'power2.out', overwrite: 'auto' });
      sweepTl.restart();
      gsap.fromTo(rgbs[i], { opacity: 0 },
        { opacity: .8, duration: .07, repeat: 5, yoyo: true, onComplete: () => gsap.set(rgbs[i], { opacity: 0 }) });
    });

    tile.addEventListener('pointermove', e => {
      if (!rect) rect = tile.getBoundingClientRect();
      const px = clamp(0, 1, (e.clientX - rect.left) / rect.width);
      const py = clamp(0, 1, (e.clientY - rect.top) / rect.height);
      q[i].rx((.5 - py) * 20);
      q[i].ry((px - .5) * 20);
      glares[i].style.setProperty('--gx', (px * 100).toFixed(1) + '%');
      glares[i].style.setProperty('--gy', (py * 100).toFixed(1) + '%');
    }, { passive: true });

    tile.addEventListener('pointerleave', () => {
      rect = null;
      q[i].rx(0); q[i].ry(0); q[i].sc(1);
      gsap.to(glows[i], { opacity: 0, duration: .5, overwrite: 'auto' });
      gsap.to(glares[i], { opacity: 0, duration: .4, overwrite: 'auto' });
      gsap.to(imgs[i], { scale: 1, duration: .9, ease: 'elastic.out(1,.6)', overwrite: 'auto' });
    });

    tile.addEventListener('click', () => openFocus(i));
  });

  /* ── 点击聚焦：纯图放大，背景淡出为纯黑 ── */
  let focusIdx = -1;
  function openFocus(i) {
    if (focusIdx >= 0) return;
    focusIdx = i;
    master.pause();
    const tile = tiles[i], r = tile.getBoundingClientRect();
    const im = document.createElement('img');
    im.src = imgs[i].src; im.alt = '';
    focusCard.replaceChildren(im);
    gsap.set(focusCard, {
      left: r.left, top: r.top, width: r.width, height: r.height,
      x: 0, y: 0, scale: 1, transformOrigin: '50% 50%',
      autoAlpha: 1, borderRadius: 30, visibility: 'visible'
    });
    focusEl.style.pointerEvents = 'auto';
    const s = Math.min(innerWidth * .64 / r.width, innerHeight * .8 / r.height);
    gsap.to(focusCard, {
      x: innerWidth / 2 - (r.left + r.width / 2),
      y: innerHeight / 2 - (r.top + r.height / 2),
      scale: s, duration: .9, ease: 'expo.inOut'
    });
    gsap.to(tilesEl, { autoAlpha: 0, duration: .5 });
    gsap.to(tile, { autoAlpha: 0, duration: .35, delay: .15 });
    gsap.fromTo(flash, { opacity: 0 }, { opacity: .28, duration: .06, yoyo: true, repeat: 1 });
  }
  function closeFocus() {
    if (focusIdx < 0) return;
    const tile = tiles[focusIdx];
    focusIdx = -1;
    focusEl.style.pointerEvents = 'none';
    gsap.to(focusCard, {
      x: 0, y: 0, scale: 1, duration: .7, ease: 'expo.inOut',
      onComplete: () => gsap.set(focusCard, { autoAlpha: 0, visibility: 'hidden' })
    });
    gsap.to(tilesEl, { autoAlpha: 1, duration: .6 });
    gsap.to(tile, { autoAlpha: 1, duration: .5 });
    master.resume();
  }
  focusEl.addEventListener('click', closeFocus);

  /* ── 键盘（无 UI，纯快捷键） ── */
  addEventListener('keydown', e => {
    if (e.key === 'Escape') closeFocus();
    else if (e.key === 'd' || e.key === 'D') { if (focusIdx < 0) master.play('scatter'); }
    else if (e.key === 'r' || e.key === 'R') { master.pause(0); master.play(0); }
    else if (e.code === 'Space') { e.preventDefault(); master.paused() ? master.play() : master.pause(); }
  });

  /* ── 可访问性：减少动态效果时只保留静态构图 ── */
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: reduce)', () => {
    intro.pause(0);
    master.pause(0);
    gsap.set(d3, { clearProps: 'all', autoAlpha: 1 });
    gsap.set(stage, { clearProps: 'scale' });
    return () => { /* matchMedia 自动回滚本次上下文创建的动画 */ };
  });

  /* ── 清理入口 ── */
  window.__naivideoDestroy = () => {
    intro.kill(); master.kill(); mm.revert();
    gsap.killTweensOf([stage, wrap, tilesEl, focusCard, flash, ...tiles, ...d3, ...faces, ...imgs, ...glows, ...glares, ...sweeps, ...rgbs]);
    [stRX, stRY, tsX, tsY].forEach(fn => fn.tween && fn.tween.kill());
    q.forEach(o => Object.values(o).forEach(fn => fn.tween && fn.tween.kill()));
    removeEventListener('resize', fit);
  };

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) intro.play(0);
})();
