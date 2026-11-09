/* OPPO 服务小程序 · 切图动效墙
   GSAP 3.12.5 + Flip 3.12.5 · 原生 JS
   原则：只用原始切图、纯色背景、零新增文字、动效只作用在切图上
   调试参数：?still=1 静态构图 / ?black=1 纯黑背景 / ?focus=N 打开第 N 张
   快捷键：D 引爆 · R 重置 · 空格 暂停/继续 · ←/→ 切换聚焦 · ESC 关闭
*/
(() => {
  'use strict';
  if (!window.gsap) return;
  if (window.Flip) gsap.registerPlugin(Flip);

  gsap.defaults({ ease: 'power3.out' });

  const Q = new URLSearchParams(location.search);
  const STILL = Q.has('still');
  const CAPTURE = Q.has('capture');   // deterministic frame-by-frame recording
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HAS_FLIP = !!window.Flip;
  if (Q.has('black')) document.documentElement.style.setProperty('--bg', '#000');

  /* ── 从最终合集图逐像素反推的 1:1 坐标（1920 × 1080） ── */
  const TILES = [
    { id: 'title',  src: 'oppo-service-fx/assets/Group 2117128962.png', x: 40,   y: 40,  w: 937, h: 267, r: 30,    tint: '#0e9c69', depth: 34 },
    { id: 'heart',  src: 'oppo-service-fx/assets/Group 2117128963.png', x: 1017, y: 40,  w: 267, h: 267, r: '50%', tint: '#06c873', depth: 70 },
    { id: 'ride',   src: 'oppo-service-fx/assets/Group 2117128961.png', x: 1324, y: 40,  w: 556, h: 451, r: 34,    tint: '#8d9aa3', depth: 22 },
    { id: 'desk',   src: 'oppo-service-fx/assets/Group 2117128964.png', x: 40,   y: 347, w: 556, h: 693, r: 34,    tint: '#9c6c3e', depth: 48 },
    { id: 'phone',  src: 'oppo-service-fx/assets/Group 2117128965.png', x: 636,  y: 347, w: 648, h: 693, r: 36,    tint: '#e8d0a8', depth: 82 },
    { id: 'swatch', src: 'oppo-service-fx/assets/Group 2117128966.png', x: 1324, y: 531, w: 556, h: 235, r: 32,    tint: '#2fb152', depth: 30 },
    { id: 'word',   src: 'oppo-service-fx/assets/Group 2117128968.png', x: 1324, y: 804, w: 556, h: 236, r: 32,    tint: '#0d3f31', depth: 40 }
  ];
  const N = TILES.length;
  const CX = 960, CY = 540;
  const HEART = [TILES[1].x + TILES[1].w / 2, TILES[1].y + TILES[1].h / 2];
  const centers = TILES.map(t => [t.x + t.w / 2, t.y + t.h / 2]);

  /* ── 构建 DOM：每张卡五层，各自独占一组 transform 属性 ── */
  const tilesEl = document.getElementById('tiles');
  TILES.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tile';
    const radius = typeof t.r === 'number' ? t.r + 'px' : t.r;
    el.style.cssText = `--x:${t.x}px;--y:${t.y}px;--w:${t.w}px;--h:${t.h}px;--r:${radius};--tint:${t.tint}`;
    el.innerHTML =
      '<div class="tile-depth"><div class="tile-3d"><div class="tile-face">' +
      `<img src="${t.src}" alt="" draggable="false">` +
      '<div class="tile-back"></div><div class="tile-shine"></div>' +
      '</div></div></div><div class="tile-glow"></div>';
    tilesEl.appendChild(el);
    t.el = el;
  });

  const $ = gsap.utils.selector(document);
  const EL = $('.tile');
  const DEPTH = EL.map(e => e.querySelector('.tile-depth'));
  const D3 = EL.map(e => e.querySelector('.tile-3d'));
  const FACE = EL.map(e => e.querySelector('.tile-face'));
  const IMGS = EL.map(e => e.querySelector('.tile-face > img'));
  const GLOWS = EL.map(e => e.querySelector('.tile-glow'));
  const SHINES = EL.map(e => e.querySelector('.tile-shine'));

  const clamp01 = gsap.utils.clamp(0, 1);
  const rnd = gsap.utils.random;
  const wrapIdx = gsap.utils.wrap(0, N);
  const stX = i => TILES[i].x / 1920 * .34;
  const stCenter = i => Math.hypot(centers[i][0] - CX, centers[i][1] - CY) / 1150 * .22;
  const stHeart = i => Math.hypot(centers[i][0] - HEART[0], centers[i][1] - HEART[1]) / 1350 * .26;

  /* ── 等比缩放 + 静态 Z 景深 ───────────────────────── */
  const stageScale = document.getElementById('stageScale');
  const stage = document.getElementById('stage');
  let rects = [];
  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080) * .965;
    gsap.set(stageScale, { scale: s });
    document.documentElement.style.setProperty('--s', s);
  }
  function cacheRects() { rects = EL.map(e => e.getBoundingClientRect()); }
  const onResize = () => { fit(); cacheRects(); };
  fit();
  cacheRects();
  addEventListener('resize', onResize);
  DEPTH.forEach((d, i) => gsap.set(d, { z: TILES[i].depth }));

  /* ── 常驻呼吸：让静止的墙不死（只动 y，不与招式层冲突） ── */
  if (!STILL && !REDUCE && !CAPTURE) {
    DEPTH.forEach((d, i) => gsap.to(d, {
      y: rnd(3, 7) * (i % 2 ? -1 : 1),
      duration: rnd(2.9, 4.7), delay: i * .21,
      repeat: -1, yoyo: true, ease: 'sine.inOut'
    }));
  }

  /* ── 开场：从 Z 轴深处带模糊错峰砸入 ─────────────── */
  // 显式归零，不用 clearProps:'transform'（会触发 GSAP 的 3D scale 重置警告）
  const ZERO3 = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0 };

  const intro = gsap.timeline({ paused: true });
  // fromTo 创建时会立即渲染隐藏初态，静态 / 减少动效 / 录制模式下不构建入场。
  // 模糊只放在叶子节点 img 上：给 3D 容器加 filter 会压平子层的 3D 翻面。
  if (!STILL && !REDUCE && !CAPTURE) {
    intro
      .fromTo(D3,
        { z: -720, y: 110, rotationX: -26, rotationY: i => (i % 2 ? 1 : -1) * 19, rotation: i => (i % 2 ? 1 : -1) * 9, autoAlpha: 0 },
        { z: 0, y: 0, rotationX: 0, rotationY: 0, rotation: 0, autoAlpha: 1, duration: 1.55, stagger: { each: .085, from: 'center' }, ease: 'expo.out' })
      .fromTo(IMGS,
        { filter: 'blur(18px)' },
        { filter: 'blur(0px)', duration: 1.25, stagger: { each: .085, from: 'center' }, ease: 'power2.out' }, 0)
      .set(IMGS, { clearProps: 'filter' }, 1.3)
      .to(D3, { z: 30, duration: .26, stagger: { each: .03, from: 'center' }, ease: 'power2.out' }, '-=0.35')
      .to(D3, { z: 0, duration: .75, stagger: { each: .03, from: 'center' }, ease: 'elastic.out(1,.5)' });
  }

  /* ── 九段循环招式：全部 .to 去 + .to 回，属性严格归零 ── */
  const resetLine = tl => {
    tl.set(D3, ZERO3).set(IMGS, { clearProps: 'filter' });
    return tl;
  };

  function wave() {                       // 1 横向波浪
    const t = gsap.timeline();
    t.to(D3, { y: -38, rotation: () => rnd(-3.5, 3.5), duration: .54, stagger: stX, ease: 'sine.out' })
      .to(D3, { y: 0, rotation: 0, duration: .98, stagger: stX, ease: 'elastic.out(1,.55)' });
    return resetLine(t);
  }
  function twist() {                      // 2 交错扭动 + 推近
    const t = gsap.timeline();
    t.to(D3, { rotationY: i => (i % 2 ? 1 : -1) * 18, rotation: i => (i % 2 ? -1 : 1) * 4, z: 78, duration: .7, stagger: { each: .045, from: 'center' }, ease: 'power3.inOut' })
      .to(D3, { rotationY: 0, rotation: 0, z: 0, duration: 1.08, stagger: { each: .035, from: 'random' }, ease: 'elastic.out(1,.5)' });
    return resetLine(t);
  }
  function cascade() {                    // 3 从中心逐级推近
    const t = gsap.timeline();
    t.to(D3, { z: 135, rotationX: -7, duration: .6, stagger: stCenter, ease: 'power3.out' })
      .to(D3, { z: 0, rotationX: 0, duration: .9, stagger: stCenter, ease: 'elastic.out(1,.6)' });
    return resetLine(t);
  }
  function ripple() {                     // 4 从绿圆扩散的能量波
    const t = gsap.timeline();
    t.to(D3, { y: -34, duration: .24, stagger: stHeart, ease: 'power2.out' })
      .to(IMGS, { filter: 'brightness(1.42)', duration: .13, stagger: stHeart }, '<')
      .to(IMGS, { filter: 'brightness(1)', duration: .48, stagger: stHeart }, '<0.13')
      .to(D3, { y: 0, duration: .85, stagger: stHeart, ease: 'elastic.out(1,.5)' }, '<0.02');
    return resetLine(t);
  }
  function scatter() {                    // 5 引爆四散 → 弹性归位
    const t = gsap.timeline();
    t.to(D3, {
      x: () => rnd(-260, 260), y: () => rnd(-190, 190),
      z: () => rnd(-260, 220), rotation: () => rnd(-26, 26),
      rotationY: () => rnd(-55, 55), rotationX: () => rnd(-30, 30),
      duration: .62, stagger: { each: .025, from: 'random' }, ease: 'expo.out'
    })
      .to(IMGS, { filter: 'brightness(1.55)', duration: .1 }, '<')
      .to(IMGS, { filter: 'brightness(1)', duration: .5 }, '<0.1')
      .to({}, { duration: .28 })
      .to(D3, {
        x: 0, y: 0, z: 0, rotation: 0, rotationY: 0, rotationX: 0,
        duration: 1.35, stagger: { each: .035, from: 'random' }, ease: 'elastic.out(1,.52)'
      });
    return resetLine(t);
  }
  function pulse() {                      // 6 双拍心跳
    const t = gsap.timeline();
    for (let k = 0; k < 2; k++) {
      t.to(D3, { z: 68, duration: .3, stagger: stCenter, ease: 'power2.out' })
        .to(D3, { z: -14, duration: .34, stagger: stCenter, ease: 'power2.inOut' });
    }
    t.to(D3, { z: 0, duration: .6, stagger: stCenter, ease: 'elastic.out(1,.6)' });
    return resetLine(t);
  }
  function gather() {                     // 7 向心收拢再弹开
    const t = gsap.timeline();
    t.to(D3, {
      x: i => (CX - centers[i][0]) * .58,
      y: i => (CY - centers[i][1]) * .58,
      z: -190, rotationY: i => (centers[i][0] < CX ? 1 : -1) * 22,
      duration: .85, stagger: { each: .025, from: 'edges' }, ease: 'power3.inOut'
    })
      .to(D3, {
        x: 0, y: 0, z: 0, rotationY: 0,
        duration: 1.2, stagger: { each: .03, from: 'center' }, ease: 'elastic.out(1,.55)'
      });
    return resetLine(t);
  }
  function flipWall() {                   // 8 整墙 3D 翻面（露品牌色背板）
    const t = gsap.timeline();
    t.to(D3, { rotationY: 360, duration: 1.18, stagger: { each: .055, from: 'start' }, ease: 'power2.inOut' })
      .to(D3, { z: 42, duration: .32, stagger: { each: .03, from: 'center' }, ease: 'power2.out' }, '-=0.3')
      .to(D3, { z: 0, duration: .7, stagger: { each: .03, from: 'center' }, ease: 'elastic.out(1,.6)' });
    return resetLine(t);
  }
  function shuffle() {                    // 9 交叉易位再归位
    const t = gsap.timeline();
    t.to(D3, {
      x: i => (centers[(i + 3) % N][0] - centers[i][0]) * .46,
      y: i => (centers[(i + 3) % N][1] - centers[i][1]) * .46,
      rotation: i => (i % 2 ? 1 : -1) * 7,
      duration: .8, stagger: { each: .02, from: 'random' }, ease: 'expo.inOut'
    })
      .to({}, { duration: .22 })
      .to(D3, { x: 0, y: 0, rotation: 0, duration: 1.15, stagger: { each: .025, from: 'random' }, ease: 'elastic.out(1,.55)' });
    return resetLine(t);
  }

  const MOVES = [wave, twist, cascade, ripple, scatter, pulse, gather, flipWall, shuffle];
  const master = gsap.timeline({ repeat: -1, paused: true });
  MOVES.forEach((fn, i) => {
    master.addLabel('move' + i).add(fn()).to({}, { duration: .8 });
  });

  /* ── 鼠标：整墙视差 + 邻近抬起 + 悬停全息倾斜 ────── */
  const mm = gsap.matchMedia();
  const flips = [];
  let focusIndex = -1;
  let userPaused = false;

  if (!STILL && !REDUCE && !CAPTURE) {
    mm.add('(min-width: 760px)', () => {
      const qrx = gsap.quickTo(stage, 'rotationX', { duration: .9, ease: 'power3' });
      const qry = gsap.quickTo(stage, 'rotationY', { duration: .9, ease: 'power3' });
      const qsx = gsap.quickTo(stage, 'x', { duration: 1.1, ease: 'power3' });
      const qsy = gsap.quickTo(stage, 'y', { duration: 1.1, ease: 'power3' });
      const per = FACE.map((f, i) => ({
        rx: gsap.quickTo(f, 'rotationX', { duration: .55, ease: 'power3' }),
        ry: gsap.quickTo(f, 'rotationY', { duration: .55, ease: 'power3' }),
        z: gsap.quickTo(f, 'z', { duration: .6, ease: 'power3' }),
        iz: gsap.quickTo(IMGS[i], 'z', { duration: .7, ease: 'power3' }),
        gl: gsap.quickTo(GLOWS[i], 'opacity', { duration: .5 })
      }));

      const onMove = e => {
        if (focusIndex >= 0) return;
        const mx = e.clientX, my = e.clientY;
        const nx = mx / innerWidth - .5, ny = my / innerHeight - .5;
        qry(nx * 7); qrx(-ny * 6); qsx(-nx * 14); qsy(-ny * 12);
        for (let i = 0; i < N; i++) {
          const r = rects[i];
          if (!r) continue;
          const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2);
          const near = clamp01(1 - Math.hypot(dx, dy) / 640);
          const hot = mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;
          const p = per[i];
          p.rx(hot ? -((my - r.top) / r.height - .5) * 13 : 0);
          p.ry(hot ? ((mx - r.left) / r.width - .5) * 15 : 0);
          p.z(near * 26 + (hot ? 18 : 0));
          p.iz(near * 26 + (hot ? 34 : 0));
          p.gl(near * .42 + (hot ? .38 : 0));
        }
      };
      addEventListener('pointermove', onMove, { passive: true });

      FACE.forEach((f, i) => {
        EL[i].addEventListener('pointerenter', () => {
          f.classList.remove('glitch'); void f.offsetWidth; f.classList.add('glitch');
          gsap.fromTo(SHINES[i],
            { opacity: .95, backgroundPosition: '190% 0%' },
            { backgroundPosition: '-70% 0%', duration: .85, ease: 'power2.inOut', overwrite: 'auto',
              onComplete: () => gsap.set(SHINES[i], { opacity: 0 }) });
        });
        EL[i].addEventListener('pointerleave', () => f.classList.remove('glitch'));
      });

      return () => {
        removeEventListener('pointermove', onMove);
        gsap.killTweensOf(stage);
      };
    });
  }

  /* ── 点击聚焦：Flip 精准 FLIP 到屏幕中央 ─────────── */
  const focusLayer = document.getElementById('focusLayer');
  const focusCard = document.getElementById('focusCard');
  const focusImg = document.getElementById('focusImg');

  function setBox(r) {
    focusCard.style.setProperty('--fx', r.left + 'px');
    focusCard.style.setProperty('--fy', r.top + 'px');
    focusCard.style.setProperty('--fw', r.width + 'px');
    focusCard.style.setProperty('--fh', r.height + 'px');
  }
  function bigBox(src) {
    const ratio = src.width / src.height;
    let w = innerWidth * .8, h = w / ratio;
    const maxH = innerHeight * .84;
    if (h > maxH) { h = maxH; w = h * ratio; }
    return { left: (innerWidth - w) / 2, top: (innerHeight - h) / 2, width: w, height: h };
  }
  function flipTo(r, duration) {
    if (HAS_FLIP) {
      const st = Flip.getState(focusCard);
      setBox(r);
      const f = Flip.from(st, { duration, ease: 'expo.inOut', scale: true, absolute: false });
      flips.push(f);
      return f;
    }
    return gsap.to(focusCard, {
      '--fx': r.left + 'px', '--fy': r.top + 'px',
      '--fw': r.width + 'px', '--fh': r.height + 'px',
      duration, ease: 'expo.inOut'
    });
  }

  function openFocus(i) {
    if (focusIndex >= 0 || !TILES[i]) return;
    if (!STILL && !REDUCE) master.pause();
    focusIndex = i;
    const r = EL[i].getBoundingClientRect();
    focusImg.src = IMGS[i].src;
    setBox(r);
    focusLayer.classList.add('open');
    flipTo(bigBox(r), STILL ? 0 : .9);
    gsap.to(tilesEl, { autoAlpha: 0, duration: STILL ? 0 : .5, ease: 'power2.inOut' });
  }
  function closeFocus() {
    if (focusIndex < 0) return;
    const r = EL[focusIndex].getBoundingClientRect();
    const done = () => focusLayer.classList.remove('open');
    if (HAS_FLIP) {
      const st = Flip.getState(focusCard);
      setBox(r);
      const f = Flip.from(st, { duration: STILL ? 0 : .75, ease: 'expo.inOut', scale: true, onComplete: done });
      flips.push(f);
    } else {
      gsap.to(focusCard, {
        '--fx': r.left + 'px', '--fy': r.top + 'px',
        '--fw': r.width + 'px', '--fh': r.height + 'px',
        duration: STILL ? 0 : .75, ease: 'expo.inOut', onComplete: done
      });
    }
    gsap.to(tilesEl, { autoAlpha: 1, duration: STILL ? 0 : .55, delay: STILL ? 0 : .15 });
    focusIndex = -1;
    if (!STILL && !REDUCE && !userPaused) master.play();
  }
  function switchFocus(dir) {
    if (focusIndex < 0) return;
    const next = wrapIdx(focusIndex + dir);
    const r = EL[next].getBoundingClientRect();
    focusIndex = next;
    gsap.to(focusImg, {
      opacity: 0, duration: .18, onComplete: () => {
        focusImg.src = IMGS[next].src;
        gsap.to(focusImg, { opacity: 1, duration: .3 });
      }
    });
    flipTo(bigBox(r), .7);
  }

  EL.forEach((el, i) => el.addEventListener('click', e => {
    e.stopPropagation();
    if (focusIndex < 0) openFocus(i);
  }));
  focusLayer.addEventListener('click', closeFocus);

  /* ── 键盘 / 引爆 / 重置 ──────────────────────────── */
  function detonate() {
    if (focusIndex >= 0 || userPaused || master.paused()) return;
    master.pause();
    const t = scatter();
    t.eventCallback('onComplete', () => {
      gsap.set(D3, ZERO3);
      gsap.set(IMGS, { clearProps: 'filter' });
      if (!userPaused) master.play();
    });
  }
  function reset() {
    if (focusIndex >= 0) closeFocus();
    gsap.set(D3, ZERO3);
    gsap.set(IMGS, { clearProps: 'filter', z: 0 });
    gsap.set(GLOWS, { opacity: 0 });
    gsap.set(SHINES, { opacity: 0 });
    userPaused = false;
    master.restart();
  }
  const onKey = e => {
    const k = e.key.toLowerCase();
    if (k === 'escape') closeFocus();
    else if (k === 'arrowleft') switchFocus(-1);
    else if (k === 'arrowright') switchFocus(1);
    else if (k === 'd') detonate();
    else if (k === 'r') reset();
    else if (k === ' ') { e.preventDefault(); userPaused = !userPaused; userPaused ? master.pause() : master.play(); }
  };
  addEventListener('keydown', onKey);

  /* ── 统一销毁入口 ────────────────────────────────── */
  window.__oppoDestroy = () => {
    mm.revert();
    master.kill(); intro.kill();
    flips.forEach(f => f && f.kill && f.kill());
    gsap.killTweensOf([...D3, ...DEPTH, ...FACE, ...IMGS, ...GLOWS, ...SHINES, focusCard, focusImg, tilesEl, stage]);
    removeEventListener('resize', onResize);
    removeEventListener('keydown', onKey);
  };

  /* ── 启动 ────────────────────────────────────────── */
  if (CAPTURE) {
    // Deterministic seek hook for the offline-mirror recorder: the 9-move
    // master cycle starts and ends at the exact rest state, so seeking
    // master.time(0..duration) yields a seamless loop (intro excluded).
    master.pause(0);
    master.time(0, false);
    window.__oppoSeek = {
      gsap: gsap.version, tiles: N, duration: +master.duration().toFixed(4),
      seek(t) {
        const d = master.duration();
        master.pause();
        master.time(((t % d) + d) % d, false);
      },
      state() { return { duration: master.duration(), tiles: N, gsap: gsap.version }; }
    };
  } else if (STILL) {
    document.documentElement.classList.add('still');
    master.pause(0);
    if (Q.has('focus')) setTimeout(() => openFocus(+Q.get('focus')), 60);
  } else if (Q.has('move')) {
    // 调试：正常播完入场后跳到某一招（0–8），便于逐招校验
    const n = gsap.utils.clamp(0, 8, +Q.get('move') || 0);
    intro.eventCallback('onComplete', () => master.play('move' + n));
    intro.play(0);
  } else if (!REDUCE) {
    intro.eventCallback('onComplete', () => master.play(0));
    intro.play(0);
  } else {
    master.pause(0);
  }
})();
