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
 *   2. the copy motion -- the top-down wipe on arrival plus the magnetic
 *      skew the stock glyph meshes get from the pointer
 *      (|pointer.x - glyph.x| leans the glyph, falling off with distance).
 *
 * What it does
 * ------------
 * Tracks the active route slug and tags every local sheet:
 *
 *     data-lc-state="in"   sheet belongs to the current URL -> reveal once
 *     data-lc-state="out"  any other local sheet -> hidden immediately
 *
 * /local-copy.css hides the "out" state. The "in" reveal is a 460 ms wipe
 * (title first, then the paragraph 70 ms later) driven through the Web
 * Animations API, and the copy of the active sheet is then split into one
 * inline-block span per glyph so the pointer can skew it. Direct page loads
 * are not re-animated: the first paint already belongs to that route.
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
    if (reduce || !canHover) return null;
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
    return fresh;
  }

  /* === arrival wipe ------------------------------------------------------
   * The stock copy is wiped in from the top with the sheet, title first and
   * the paragraph a beat later. A hard clip reads as the same gesture; the
   * opacity ramp is kept short so the copy does not look like it fades.
   * ==================================================================== */
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

  function reveal(sheet) {
    if (reduce) return;
    var id = sheet.getAttribute('data-id');
    var hasTitle = Object.prototype.hasOwnProperty.call(CJK_TITLE, id);
    var title = hasTitle ? sheet.querySelector('h1') : null;
    var body = sheet.querySelector('div[data-gl="text"]');

    wipe(title, 0, 440);
    wipe(body, 70, 480);

    if (canHover) {
      mountCopy(body);
      if (title) mountCopy(title);
      scheduleTick();
    }
  }

  function currentSlug() {
    var m = /^\/projects\/([^\/?#]+)/.exec(location.pathname || '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function sync() {
    var slug = currentSlug();
    var changed = slug !== lastSlug;
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

      if (isNew || changed || idChanged) revealed['delete'](sheet);

      if (!revealed.has(sheet)) {
        revealed.add(sheet);
        if (isNew || changed || idChanged) reveal(sheet);
      }

      // Hydration (and any later Vue re-render) replaces our glyph spans with
      // a plain text node, so the split is re-asserted on every pass; the
      // check is a single string comparison when nothing changed.
      if (canHover) {
        var body = sheet.querySelector('div[data-gl="text"]');
        if (body) mountCopy(body);
        if (Object.prototype.hasOwnProperty.call(CJK_TITLE, id)) {
          var title = sheet.querySelector('h1');
          if (title) mountCopy(title);
        }
      }
    }

    lastSlug = slug;
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
      schedule();
      return out;
    };
  });
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  window.addEventListener('resize', function () {
    for (var i = 0; i < records.length; i++) records[i].dirty = true;
  });

  if (!reduce && canHover) {
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerleave', onLeave, { passive: true });
    document.addEventListener('mouseleave', onLeave, { passive: true });
  }

  function boot() {
    root.setAttribute('data-lc', 'ready');
    // Prime the states without animating: on a direct page load the copy is
    // already on screen and belongs to this route.
    var sheets = document.querySelectorAll('[data-gl="sheet"][data-id]');
    var slug = currentSlug();
    for (var i = 0; i < sheets.length; i++) {
      var id = sheets[i].getAttribute('data-id');
      if (!Object.prototype.hasOwnProperty.call(LOCAL, id)) continue;
      sheets[i].setAttribute('data-lc-state', id === slug ? 'in' : 'out');
      known.add(sheets[i]);
      revealed.add(sheets[i]);
      if (id === slug && !reduce && canHover) {
        var body = sheets[i].querySelector('div[data-gl="text"]');
        var title = sheets[i].querySelector('h1');
        if (body) mountCopy(body);
        if (title && Object.prototype.hasOwnProperty.call(CJK_TITLE, id)) mountCopy(title);
      }
    }
    lastSlug = slug;

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
