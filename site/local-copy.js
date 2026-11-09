/* Left-hand copy life cycle for the locally added case studies.
 *
 * Why this exists
 * ---------------
 * The stock site paints detail-page copy with a WebGL MSDF text renderer: the
 * DOM node is only a measuring placeholder (class [-webkit-text-fill-color:
 * transparent]) and the visible glyphs are a mesh animated by the scene. That
 * atlas is Latin-only, so /local-copy.css lets the DOM paint the Chinese copy
 * instead -- but a DOM node is not part of the scene graph, so it used to sit
 * at full opacity while the WebGL sheet slid away. Result: the copy from the
 * page you just left stayed floating over the home strip, and during a
 * project-to-project switch two paragraphs were painted on top of each other.
 *
 * What it does
 * ------------
 * Tracks the active route slug and tags every local sheet:
 *
 *     data-lc-state="in"   sheet belongs to the current URL -> reveal once
 *     data-lc-state="out"  any other local sheet -> hidden immediately
 *
 * /local-copy.css hides the "out" state, and the "in" reveal uses the Web
 * Animations API so the copy wipes in with the sheet (~0.5 s, same easing
 * family as the reveal) instead of popping in before it. Direct page loads are
 * not re-animated: the first paint already belongs to that route.
 *
 * Hydration safety: no SSR markup changes (no extra attributes nor nodes). The
 * state attribute is only written after `load`, i.e. after Vue hydrated, and
 * the reveal writes no inline styles (WAAPI keeps its own animation record).
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

  function currentSlug() {
    var m = /^\/projects\/([^\/?#]+)/.exec(location.pathname || '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function reveal(nodes) {
    if (!nodes.length || reduce) return;
    if (typeof Element.prototype.animate !== 'function') return;
    var i;
    for (i = 0; i < nodes.length; i++) {
      nodes[i].animate(
        [
          { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
          { opacity: 1, clipPath: 'inset(0 0 0 0)' }
        ],
        { duration: 520, delay: i * 70, easing: 'cubic-bezier(.22, 1, .36, 1)' }
      );
    }
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
      if (want !== 'in') continue;

      // A sheet mounted after boot is a genuine entrance (the route change was
      // already consumed by an earlier sync, so `changed` alone would miss it).
      var isNew = !known.has(sheet);
      if (isNew) known.add(sheet);

      if (isNew || changed || idChanged) revealed['delete'](sheet);

      if (!revealed.has(sheet)) {
        revealed.add(sheet);
        if (isNew || changed || idChanged) {
          var targets = sheet.querySelectorAll('div[data-gl="text"]');
          if (Object.prototype.hasOwnProperty.call(CJK_TITLE, id)) {
            var title = sheet.querySelector('h1');
            if (title) targets = [].slice.call(targets).concat([title]);
          }
          reveal(targets);
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
