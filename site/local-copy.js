/* Left-hand copy life cycle for the locally added case studies.
 *
 * Why this exists
 * ---------------
 * The stock site paints detail-page copy with a WebGL MSDF text renderer: the
 * DOM node is only a measuring placeholder (class [-webkit-text-fill-color:
 * transparent]) and the visible glyphs are a mesh animated by the scene. That
 * atlas is Latin-only, so /local-copy.css lets the DOM paint the Chinese copy
 * instead -- and a DOM node is not part of the scene graph. Two things then
 * have to be reproduced by hand so the local pages feel identical to the
 * stock ones:
 *
 *   1. the life cycle (copy must not survive the sheet it belongs to), and
 *   2. the copy motion -- the stock renderer's top-down line reveal plus the
 *      magnetic skew the glyph meshes get from the pointer
 *      (|pointer.x - glyph.x| leans the glyph, falling off with distance).
 *
 * What it does
 * ------------
 * Tracks the active route slug and tags every local sheet:
 *
 *     data-lc-state="in"   sheet belongs to the current URL -> reveal once
 *     data-lc-state="out"  any other local sheet -> hidden immediately
 *
 * /local-copy.css hides the "out" state and holds the "in" state at opacity 0
 * until this runtime has taken over (so a cold load does not paint the copy
 * before the WebGL intro even starts). The reveal is driven through the Web
 * Animations API on one inline-block span per glyph.
 *
 * The stock text shader (_nuxt bundle, "Line reveal") is the reference:
 *
 *     lp      = clamp((progress - line * stagger) / window, 0, 1)
 *     lp      = 1 - 2^(-10 * lp)                       // expo out, per line
 *     slide   = (1 - lp) * pitch                      // pitch = 1.15 line h
 *     travel  = (1 - lp) * u_riseIn * pitch           // u_riseIn = 1
 *     window  = [inkTop, inkTop + pitch]              // fixed per-line mask
 *
 * i.e. lines start 75 ms apart, each taking 1.1 s to rise 2.3 line heights
 * into a mask window pinned to its resting box; the top of a glyph enters the
 * window first, so the ink reads as arriving from the top down. The DOM cannot
 * have a fixed mask without restructuring the paragraph, so each glyph keeps
 * its own window: clip-path's bottom inset is animated to (offset - slack),
 * which leaves the visible band's bottom edge pinned in page space while the
 * glyph translates up. Both share the same expo-out clock, exactly like the
 * shader's slide / window / travel.
 *
 * Entrance times are the stock choreography (Kp / BF in the bundle):
 *     SPA entry   title +250 ms, paragraph +350 ms (pills +500 ms, WebGL)
 *     cold load   the same offsets from the loader's release
 *
 * Hydration safety: no SSR markup changes (no extra attributes nor nodes). The
 * state attribute is only written after `load`, i.e. after Vue hydrated, and
 * the reveal writes no inline styles (WAAPI keeps its own animation record).
 * Splitting into glyph spans happens at the same point, and the runtime
 * re-splits whenever Vue rewrites the copy (SPA re-use of the same sheet node
 * replaces our spans with a plain text node).
 */
(function () {
  'use strict';

  var LOCAL = {
    'oppo-service': 1,
    'naivideo': 1,
    'oppo-self-service': 1,
    'erp': 1,
    'csa-service': 1,
    'hengxiang-advantage': 1,
    'illustration': 1
  };

  // Only these sheets have their CJK title painted by the DOM (see
  // /local-copy.css). Latin titles stay WebGL-drawn, and they carry an inline
  // opacity: 0 on the DOM <h1> -- animating those would make the DOM copy pop
  // over the mesh for half a second.
  var CJK_TITLE = {
    'oppo-service': 1,
    'oppo-self-service': 1,
    'csa-service': 1,
    'hengxiang-advantage': 1,
    'illustration': 1
  };

  var root = document.documentElement;
  var revealed = new WeakSet();
  var known = new WeakSet();
  var seenId = new WeakMap();
  var lastSlug = null;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var supportsWAAPI = typeof Element.prototype.animate === 'function';
  var supportsClip = !window.CSS || !CSS.supports ||
    CSS.supports('clip-path', 'inset(0px 0px 10px 0px)');
  var useTranslate = !window.CSS || !CSS.supports ||
    CSS.supports('translate', '0px 1px');

  /* Stock text choreography, in ms. Kp = {title:{at:.25,dur:1.25},
   * text:{at:.35,dur:1.1,stagger:.075,step:.09}} and the shader's
   * timing(dur, stagger) gives every line its own 1.1 s expo-out window. */
  var LINE_DUR = 1100;
  var LINE_STAGGER = 75;
  var TITLE_AT = 250;
  var TEXT_AT = 350;
  var PITCH = 1.15;      // aPitch = line height * 1.15
  var TRAVEL = 1;        // u_riseIn, extra pitch of entrance travel

  // Cold-load choreography. The site removes its three [data-gl="bar"] loader
  // pills 0.5 s after bootRelease(); the stock copy starts at bootRelease +
  // 0.75 / 0.85 s, i.e. 250 / 350 ms after that signal. If the loader never
  // resolves (headless/software WebGL), the fallback below releases the copy
  // so it can never be stranded invisible.
  var bootHold = true;
  var bootClock = 0;
  var bootQueued = false;
  var bootDone = false;
  var bootStarted = false;
  var bootFallback = 0;
  var routeClock = 0;
  var navPending = false;   // a real pushState / popstate happened
  var lastPath = null;      // last pathname seen by sync()

  /* === glyph splitting ---------------------------------------------------
   * One inline-block span per glyph (latin words stay unbreakable) so each
   * glyph can carry its own skew. Text nodes are preserved as-is between
   * words, so line breaking is unchanged.
   * ==================================================================== */
  var CJK = /[\u2e80-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/;
  // East-Asian line breaking must survive the split: a closing mark may never
  // start a line and an opening mark may never end one. Inline-block spans
  // drop those pair rules, so they are glued by hand.
  var CLOSE_MARK = /[、。，．,.!?！？；：;:）)］\]｝\}」』】》〉”’…—～·%‰℃]/;
  var OPEN_MARK = /[（(［\[｛\{「『【《〈“‘]/;
  var records = [];              // records of the copy currently on screen
  var splitIndex = new WeakMap(); // element -> record
  var revealCtx = new WeakMap();  // element -> entrance still in flight

  function makeSpan(cls, text) {
    var s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }

  function addGlyph(rec, parent, ch) {
    var span = makeSpan('lc-c', ch);
    parent.appendChild(span);
    rec.chars.push(span);
    rec.cx.push(0);
    rec.cy.push(0);
    rec.skew.push(0);
    rec.lift.push(0);
  }

  function splitElement(el) {
    var old = splitIndex.get(el);
    if (old) {
      var k;
      for (k = 0; k < records.length; k++) {
        if (records[k] === old) { records.splice(k, 1); break; }
      }
    }
    var text = el.textContent;
    var rec = {
      el: el,
      text: text,
      chars: [],
      cx: [],
      cy: [],
      skew: [],
      lift: [],
      dirty: true,
      bx: 0, by: 0, bw: 0, bh: 0
    };
    splitIndex.set(el, rec);

    var frag = document.createDocumentFragment();
    var word = null;      // current unbreakable run
    var pending = null;   // opening mark waiting for its glyph
    var i = 0;
    var len = text.length;
    while (i < len) {
      var ch = text.charAt(i);
      if (/\s/.test(ch)) {
        word = null;
        frag.appendChild(document.createTextNode(ch));
        i++;
        continue;
      }
      var isCJK = CJK.test(ch);
      if (isCJK) {
        word = null;
        if (OPEN_MARK.test(ch)) {
          pending = (pending || '') + ch;
          i++;
          continue;
        }
        if (CLOSE_MARK.test(ch) && !pending && rec.chars.length) {
          // glue to the previous glyph so the line can only break before it
          rec.chars[rec.chars.length - 1].textContent += ch;
          i++;
          continue;
        }
        addGlyph(rec, frag, pending ? pending + ch : ch);
        pending = null;
        i++;
        continue;
      }
      if (!word) {
        word = makeSpan('lc-w', '');
        frag.appendChild(word);
      }
      addGlyph(rec, word, ch);
      i++;
    }

    if (pending) frag.appendChild(makeSpan('lc-c', pending));

    el.textContent = '';
    el.appendChild(frag);
    return rec;
  }

  function dropRecord(rec) {
    var i;
    for (i = 0; i < records.length; i++) {
      if (records[i] === rec) { records.splice(i, 1); break; }
    }
    if (splitIndex.get(rec.el) === rec) splitIndex['delete'](rec.el);
  }

  function measure(rec) {
    var base = rec.el.getBoundingClientRect();
    rec.bx = base.left;
    rec.by = base.top;
    rec.bw = base.width;
    rec.bh = base.height;
    rec.at = Date.now();
    for (var i = 0; i < rec.chars.length; i++) {
      var r = rec.chars[i].getBoundingClientRect();
      rec.cx[i] = r.left - base.left + r.width / 2;
      rec.cy[i] = r.top - base.top + r.height / 2;
    }
    rec.dirty = false;
  }

  /* === magnetic skew (mirrors the WebGL glyph lean) ----------------------
   * A glyph leans away from the pointer, the lean decaying with distance.
   * Motion is eased per frame so the copy springs back after the pointer
   * leaves -- the same "magnetic" feel the stock text has.
   * ==================================================================== */
  var RADIUS = 220;      // px of influence
  var MAX_SKEW = 20;     // deg, right at the pointer
  var MAX_LIFT = 4;      // px
  var TAU = 90;          // ms, exponential approach constant
  var EPS = 0.02;
  var pointer = { x: -1e4, y: -1e4, inside: false };
  var rafId = 0;
  var lastFrame = 0;

  function apply(rec, k) {
    var base = rec.el.getBoundingClientRect();
    var px = pointer.x - base.left;
    var py = pointer.y - base.top;
    var moving = false;

    for (var i = 0; i < rec.chars.length; i++) {
      var targetSkew = 0;
      var targetLift = 0;
      if (pointer.inside) {
        var dx = px - rec.cx[i];
        var dy = py - rec.cy[i];
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < RADIUS) {
          // lean away from the pointer, decaying with distance: glyphs to the
          // right of the cursor tip one way, glyphs to the left the other,
          // which is the "magnetic" wave the stock glyph meshes show.
          var f = 1 - d / RADIUS;
          f = f * f * (1.25 - 0.25 * f);
          targetSkew = (dx < 0 ? 1 : -1) * MAX_SKEW * f;
          targetLift = -MAX_LIFT * f;
        }
      }
      var skew = rec.skew[i] + (targetSkew - rec.skew[i]) * k;
      var lift = rec.lift[i] + (targetLift - rec.lift[i]) * k;
      if (Math.abs(skew - targetSkew) < EPS && Math.abs(lift - targetLift) < EPS) {
        skew = targetSkew;
        lift = targetLift;
      } else {
        moving = true;
      }
      rec.skew[i] = skew;
      rec.lift[i] = lift;
      if (skew === 0 && lift === 0) {
        rec.chars[i].style.transform = '';
      } else {
        rec.chars[i].style.transform =
          'translate3d(0,' + lift.toFixed(2) + 'px,0) skewX(' + skew.toFixed(2) + 'deg)';
      }
    }
    return moving;
  }

  function tick(now) {
    rafId = 0;
    // Frame-rate independent easing: the lean has to settle in the same
    // wall-clock time on a 120 Hz display and on a struggling GPU.
    var dt = lastFrame ? Math.min(80, now - lastFrame) : 16.7;
    lastFrame = now;
    var k = 1 - Math.exp(-dt / TAU);
    var moving = false;
    for (var i = 0; i < records.length; i++) {
      if (apply(records[i], k)) moving = true;
    }
    if (moving) scheduleTick();
    else lastFrame = 0;
  }

  function scheduleTick() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function onPointer(e) {
    if (!records.length) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    var i;
    var hit = false;
    for (i = 0; i < records.length; i++) {
      var rec = records[i];
      var r = rec.el.getBoundingClientRect();
      // generous margin: the lean starts before the pointer touches the text
      if (e.clientX > r.left - RADIUS && e.clientX < r.right + RADIUS &&
          e.clientY > r.top - RADIUS && e.clientY < r.bottom + RADIUS) hit = true;
      // The sheet (and the page under it) moves while it animates in, so the
      // cached glyph centres are only valid for the box they were read in.
      // Webfonts land after boot and reflow the copy, so the cache is also
      // refreshed on a slow timer while the pointer is around.
      if (rec.dirty || Math.abs(r.left - rec.bx) > 1 || Math.abs(r.top - rec.by) > 1 ||
          Math.abs(r.width - rec.bw) > 1 || !rec.at || Date.now() - rec.at > 600) {
        measure(rec);
      }
    }
    pointer.inside = hit;
    scheduleTick();
  }

  function onLeave() {
    pointer.inside = false;
    pointer.x = -1e4;
    pointer.y = -1e4;
    scheduleTick();
  }

  function mountCopy(el) {
    if (reduce) return null;
    // Splitting is needed for the line reveal too, not just for the pointer
    // skew, so it runs on touch devices as well. The skew loop is idle there.
    // Vue may have rewritten the copy (SPA re-use) -- our spans are gone and
    // the element holds a plain text node again.
    var rec = splitIndex.get(el);
    // The text check alone is not enough: Vue re-rendering the copy restores
    // the very same string as a plain text node, which would leave the old
    // record looking valid while its spans are detached.
    var intact = rec && rec.chars.length > 0 && rec.chars[0].isConnected && el.contains(rec.chars[0]);
    if (rec && intact && rec.text === el.textContent) {
      rec.dirty = true;
      if (records.indexOf(rec) < 0) records.push(rec);
      return rec;
    }
    if (rec) dropRecord(rec);
    var fresh = splitElement(el);
    records.push(fresh);
    // Vue may replace the copy with a plain text node while the entrance is
    // still running (SPA re-use of the sheet). The new spans would otherwise
    // paint at rest and lose the top-down reveal, so re-issue it with the
    // remaining delay.
    var ctx = revealCtx.get(el);
    if (ctx && performance.now() < ctx.end) {
      animateRec(fresh, Math.max(0, ctx.clock + ctx.at - performance.now()));
    }
    return fresh;
  }

  /* === arrival: ordered top-to-bottom line reveal ------------------------
   * Mirrors the stock text shader. Each visual line gets its own expo-out
   * clock, offset by LINE_STAGGER, and its glyphs rise into a mask window
   * whose bottom edge stays pinned in page space.
   * ==================================================================== */
  function cancelReveal(el) {
    if (!el || !el.getAnimations) return;
    var anims = el.getAnimations();
    for (var i = 0; i < anims.length; i++) {
      if (anims[i].id === 'lc-reveal') anims[i].cancel();
    }
  }

  function buildLines(rec) {
    // Group glyph spans by the visual line they landed on. Glyph centres are
    // used (not tops) because CJK and Latin glyph boxes have different ascent.
    var lines = [];
    var cur = null;
    var cy = null;
    for (var i = 0; i < rec.chars.length; i++) {
      var g = rec.chars[i];
      var r = g.getBoundingClientRect();
      if (!r.height) continue;
      var mid = r.top + r.height / 2;
      if (!cur || Math.abs(mid - cy) > Math.max(7, r.height * 0.7)) {
        cur = [];
        lines.push(cur);
        cy = mid;
      }
      cur.push(g);
    }
    return lines;
  }

  function lineHeightOf(el) {
    var cs = getComputedStyle(el);
    var lh = parseFloat(cs.lineHeight);
    if (isFinite(lh) && lh > 0) return lh;
    return (parseFloat(cs.fontSize) || 16) * 1.4;
  }

  function framesFor(h, lh) {
    // d = (1 - lp) * (slide + travel); the window's bottom inset keeps the
    // visible band's lower edge at the line's resting bottom (lh * PITCH).
    var pitch = lh * PITCH;
    var d0 = pitch * (1 + TRAVEL);
    var slack = Math.max(0, pitch - h);
    var frames = [];
    for (var k = 0; k <= 12; k++) {
      var p = k / 12;
      var lp = 1 - Math.pow(2, -10 * p);
      var d = d0 * (1 - lp);
      var bottom = Math.max(0, d - slack);
      var f = { offset: p, opacity: 1 };
      if (useTranslate) f.translate = '0px ' + d.toFixed(2) + 'px';
      else f.transform = 'translate3d(0,' + d.toFixed(2) + 'px,0)';
      f.clipPath = 'inset(0px 0px ' + bottom.toFixed(2) + 'px 0px)';
      frames.push(f);
    }
    return frames;
  }

  function animateRec(rec, delay) {
    if (!rec || !supportsWAAPI || !supportsClip) return;
    // Cancel first: a still-running reveal translates the glyphs, which would
    // corrupt the line grouping and the height measurement below.
    for (var k = 0; k < rec.chars.length; k++) cancelReveal(rec.chars[k]);
    var lines = buildLines(rec);
    var lh = lineHeightOf(rec.el);
    for (var i = 0; i < lines.length; i++) {
      var glyphs = lines[i];
      for (var j = 0; j < glyphs.length; j++) {
        var g = glyphs[j];
        var h = g.getBoundingClientRect().height || lh;
        var anim = g.animate(framesFor(h, lh), {
          duration: LINE_DUR,
          delay: Math.max(0, delay + i * LINE_STAGGER),
          easing: 'linear',       // expo out is baked into the keyframes
          fill: 'backwards'       // stay hidden during the per-line delay
        });
        anim.id = 'lc-reveal';
      }
    }
  }

  // Fallback for browsers without clip-path animation support: the old
  // whole-block wipe. Not used in Chromium/WebKit/Firefox today.
  function wipe(node, delay, duration) {
    if (!node || !supportsWAAPI) return;
    node.animate(
      [
        { opacity: 0.001, clipPath: 'inset(0 0 100% 0)' },
        { opacity: 1, clipPath: 'inset(0 0 42% 0)', offset: 0.62 },
        { opacity: 1, clipPath: 'inset(0 0 0 0)' }
      ],
      { duration: duration, delay: delay, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'none' }
    );
  }

  function markReady() {
    if (root.getAttribute('data-lc') !== 'ready') root.setAttribute('data-lc', 'ready');
  }

  function reveal(sheet, clock) {
    if (reduce) { markReady(); return; }
    var id = sheet.getAttribute('data-id');
    var hasTitle = Object.prototype.hasOwnProperty.call(CJK_TITLE, id);
    var title = hasTitle ? sheet.querySelector('h1') : null;
    var body = sheet.querySelector('div[data-gl="text"]');
    var now = performance.now();
    var tDelay = Math.max(0, clock + TITLE_AT - now);
    var bDelay = Math.max(0, clock + TEXT_AT - now);
    var end = clock + TEXT_AT + LINE_DUR + 12 * LINE_STAGGER;

    var recT = title ? mountCopy(title) : null;
    var recB = body ? mountCopy(body) : null;
    if (title) revealCtx.set(title, { clock: clock, at: TITLE_AT, end: end });
    if (body) revealCtx.set(body, { clock: clock, at: TEXT_AT, end: end });

    if (!supportsWAAPI || !supportsClip) {
      wipe(title, tDelay, 440);
      wipe(body, bDelay, 480);
    } else {
      animateRec(recT, tDelay);
      animateRec(recB, bDelay);
    }
    // Remove the CSS hold only after the animations exist: they carry the
    // hidden first keyframe backwards through their per-line delay, so the
    // copy cannot flash at full opacity in between.
    markReady();
    if (canHover) scheduleTick();
  }

  function currentSlug() {
    var m = /^\/projects\/([^\/?#]+)/.exec(location.pathname || '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function sync() {
    var slug = currentSlug();
    var path = location.pathname;
    var changed = slug !== lastSlug;
    // Nuxt calls replaceState() several times with the SAME url while
    // hydrating. Those must not be mistaken for an entrance: only a real
    // pushState / popstate that actually changed the pathname is one.
    var entering = bootDone && navPending && path !== lastPath;
    if (entering) {
      navPending = false;
      routeClock = performance.now();
      endBootHold();
    }
    var sheets = document.querySelectorAll('[data-gl="sheet"][data-id]');
    var i;

    for (i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var id = sheet.getAttribute('data-id');
      if (!Object.prototype.hasOwnProperty.call(LOCAL, id)) continue;

      // The SPA often re-uses the very same sheet node for the next project
      // and only swaps its data-id, so a stale "already revealed" mark has to
      // be dropped on an id change as well as on a route change.
      var prevId = seenId.get(sheet);
      var idChanged = prevId !== undefined && prevId !== id;
      if (prevId !== id) seenId.set(sheet, id);

      var want = id === slug ? 'in' : 'out';
      if (sheet.getAttribute('data-lc-state') !== want) {
        sheet.setAttribute('data-lc-state', want);
      }
      if (want !== 'in') {
        var stale = sheet.querySelector('div[data-gl="text"]');
        var staleTitle = sheet.querySelector('h1');
        if (stale && splitIndex.get(stale)) dropRecord(splitIndex.get(stale));
        if (staleTitle && splitIndex.get(staleTitle)) dropRecord(splitIndex.get(staleTitle));
        continue;
      }

      // A sheet mounted after boot is a genuine entrance (the route change was
      // already consumed by an earlier sync, so `changed` alone would miss it).
      var isNew = !known.has(sheet);
      if (isNew) known.add(sheet);

      // During the cold-load hold the intro choreography owns the entrance;
      // sync() only keeps the states correct and must not reveal.
      if (!bootHold && (isNew || changed || idChanged)) revealed['delete'](sheet);

      if (!bootHold && !revealed.has(sheet)) {
        revealed.add(sheet);
        if (isNew || changed || idChanged) reveal(sheet, routeClock || performance.now());
      }

      // Hydration (and any later Vue re-render) replaces our glyph spans with
      // a plain text node, so the split is re-asserted on every pass; the
      // check is a single string comparison when nothing changed.
      if (!reduce) {
        var body = sheet.querySelector('div[data-gl="text"]');
        if (body) mountCopy(body);
        if (Object.prototype.hasOwnProperty.call(CJK_TITLE, id)) {
          var title = sheet.querySelector('h1');
          if (title) mountCopy(title);
        }
      }
    }

    lastSlug = slug;
    lastPath = path;
  }

  // Run synchronously: the state has to be correct in the very frame the new
  // sheet lands, otherwise its copy paints at full opacity for one frame
  // before the reveal starts. The work is a single attribute-selected query on
  // one or two nodes, so calling it from every mutation is cheap.
  function schedule() {
    sync();
  }

  // Nuxt drives SPA navigation through the history API; wrap it so the copy
  // reacts in the same frame the route changes rather than a tick later.
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function () {
      var out = original.apply(this, arguments);
      if (name === 'pushState') navPending = true;
      schedule();
      return out;
    };
  });
  window.addEventListener('popstate', function () { navPending = true; schedule(); });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('resize', function () {
    for (var i = 0; i < records.length; i++) records[i].dirty = true;
  });

  if (!reduce && canHover) {
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerleave', onLeave, { passive: true });
    document.addEventListener('mouseleave', onLeave, { passive: true });
  }

  /* === cold-load choreography ==========================================
   * The stock WebGL copy does not paint on first frame either: it waits for
   * bootRelease() (loader off + 0.25 / 0.35 s). The DOM copy is held by
   * /local-copy.css until the same moment, then revealed with the same
   * top-down line stagger. The loader's three [data-gl="bar"] pills are the
   * observable signal: Vue removes them 0.5 s after bootRelease().
   * ==================================================================== */
  function endBootHold() {
    if (!bootHold) return;
    bootHold = false;
    bootStarted = true;
    clearTimeout(bootFallback);
    markReady();
  }

  function onLoaderRelease() {
    if (bootQueued) return;
    bootQueued = true;
    bootClock = performance.now();
    if (bootDone) startBootReveal(bootClock);
  }

  function startBootReveal(clock) {
    if (bootStarted || !bootDone) return;
    bootStarted = true;
    clearTimeout(bootFallback);
    bootHold = false;
    if (reduce) { markReady(); return; }
    var slug = currentSlug();
    var sheets = document.querySelectorAll('[data-gl="sheet"][data-lc-state="in"][data-id]');
    for (var i = 0; i < sheets.length; i++) {
      var id = sheets[i].getAttribute('data-id');
      if (id !== slug || !Object.prototype.hasOwnProperty.call(LOCAL, id)) continue;
      revealed['delete'](sheets[i]);
      reveal(sheets[i], clock);
      revealed.add(sheets[i]);
    }
    markReady();   // home / stock pages have no local sheet to reveal
  }

  function watchLoader() {
    if (!window.MutationObserver) return;
    var seen = document.querySelectorAll('[data-gl="bar"]').length > 0;
    var obs = new MutationObserver(function () {
      var n = document.querySelectorAll('[data-gl="bar"]').length;
      if (n > 0) seen = true;
      if (seen && n === 0) {
        obs.disconnect();
        onLoaderRelease();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // Software WebGL / a stalled preload may never resolve the loader. Never
    // leave the copy hidden: release it on this generous fallback instead.
    setTimeout(function () { obs.disconnect(); }, 12000);
  }

  function boot() {
    // Prime the states without revealing: the intro choreography owns the
    // entrance on a cold load and will call startBootReveal() itself.
    var sheets = document.querySelectorAll('[data-gl="sheet"][data-id]');
    var slug = currentSlug();
    for (var i = 0; i < sheets.length; i++) {
      var id = sheets[i].getAttribute('data-id');
      if (!Object.prototype.hasOwnProperty.call(LOCAL, id)) continue;
      sheets[i].setAttribute('data-lc-state', id === slug ? 'in' : 'out');
      known.add(sheets[i]);
      revealed.add(sheets[i]);
      if (id === slug && !reduce) {
        var body = sheets[i].querySelector('div[data-gl="text"]');
        var title = sheets[i].querySelector('h1');
        if (body) mountCopy(body);
        if (title && Object.prototype.hasOwnProperty.call(CJK_TITLE, id)) mountCopy(title);
      }
    }
    lastSlug = slug;
    lastPath = location.pathname;
    bootDone = true;

    if (reduce) { endBootHold(); markReady(); }
    else {
      watchLoader();
      if (bootQueued && !bootStarted) startBootReveal(bootClock);
      // Fallback for a loader that never resolves (see watchLoader).
      bootFallback = setTimeout(function () {
        if (!bootStarted) { onLoaderRelease(); startBootReveal(bootClock); }
      }, 2500);
    }

    if (window.MutationObserver) {
      // A sheet can be mounted a few frames after the URL changed (the SPA
      // swaps the whole subtree), so watch the tree as well.
      new MutationObserver(schedule).observe(document.body, {
        childList: true,
        subtree: true,
        attributeFilter: ['data-id']
      });
    }
    // Cheap safety net for changes that produce no mutation at all.
    setInterval(schedule, 400);
  }

  if (document.readyState === 'complete') {
    requestAnimationFrame(boot);
  } else {
    window.addEventListener('load', function () { requestAnimationFrame(boot); });
  }
})();
