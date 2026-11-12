/* DOM-painted Chinese Profile copy follows the Newsletter shader's timing:
 * 200 ms start, 75 ms between visual lines, 1.1 s expo-out masked rise. */
(function () {
  'use strict';
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!Element.prototype.animate || !CSS.supports('clip-path', 'inset(0px)')) return;
  var selector = 'p[data-gl="text"][class*="max-w-[35rem]"]';
  var disc = null, wasOpen = false, animations = [], records = new WeakMap();
  var pending = false;
  var closeMark = /[、。，．,.!?！？；：;:）)］\]｝}」』】》〉”’…—～·%‰℃]/;
  var openMark = /[（(［\[｛{「『【《〈“‘]/;
  function cancel() { animations.forEach(function (animation) { animation.cancel(); }); animations = []; }
  function prepare(el) {
    var record = records.get(el);
    if (record && record.text === el.textContent && record.glyphs.every(function (g) { return g.isConnected; })) return record.glyphs;
    var glyphs = [];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [], node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(function (text) {
      var parts = text.textContent.match(/[A-Za-z0-9]+(?:[./+_-][A-Za-z0-9]+)*|\s+|[^\s]/gu) || [];
      var fragment = document.createDocumentFragment(), previous = null, opening = '';
      parts.forEach(function (part) {
        if (/^\s+$/.test(part)) { fragment.append(document.createTextNode(opening + part)); opening = ''; previous = null; return; }
        if (openMark.test(part) && part.length === 1) { opening += part; return; }
        if (closeMark.test(part) && part.length === 1 && previous && !opening) { previous.textContent += part; return; }
        var span = document.createElement('span');
        span.className = 'profile-reveal-token'; span.textContent = opening + part; opening = '';
        fragment.append(span); glyphs.push(span); previous = span;
      });
      if (opening) fragment.append(document.createTextNode(opening));
      text.replaceWith(fragment);
    });
    records.set(el, {text: el.textContent, glyphs: glyphs});
    return glyphs;
  }
  function visualLines(glyphs) {
    var lines = [], current, y;
    glyphs.forEach(function (glyph) {
      var rect = glyph.getBoundingClientRect();
      if (!rect.height) return;
      var center = rect.top + rect.height / 2;
      if (!current || Math.abs(center - y) > Math.max(7, rect.height * .7)) {
        current = []; lines.push(current); y = center;
      }
      current.push(glyph);
    });
    return lines;
  }
  function frames(height, lineHeight) {
    var pitch = lineHeight * 1.15, travel = pitch * 2, slack = Math.max(0, pitch - height), result = [];
    for (var step = 0; step <= 20; step++) {
      var progress = step / 20;
      var ease = step === 20 ? 1 : 1 - Math.pow(2, -10 * progress);
      var offset = travel * (1 - ease);
      result.push({offset: progress, transform: 'translateY(' + offset + 'px)', clipPath: 'inset(0 0 ' + Math.max(0, offset - slack) + 'px 0)', opacity: 1});
    }
    return result;
  }
  function reveal() {
    cancel();
    if (!disc) return;
    if (reduced.matches) { disc.setAttribute('data-profile-reveal', 'ready'); return; }
    var bio = disc.querySelector(selector);
    var elements = [disc.querySelector('.profile-name'), bio, disc.querySelector('.profile-phone')].filter(Boolean);
    var folio = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt.$folio;
    // The baked Latin atlas cannot render the Chinese paragraph; avoid a
    // second, differently-timed layer of Latin fragments behind the DOM.
    folio?.overlay?.forEach(function (text) { if (text.el === bio && text.mesh) text.mesh.visible = false; });
    var delay = folio?.holeFrom?.isConnected ? 350 : 200;
    var lineIndex = 0, plan = [];
    // Measure all rows before animating; interleaving reads and animation
    // creation would make a long Chinese paragraph drift out of sync.
    elements.forEach(function (el) {
      var glyphs = el === bio ? prepare(el) : [el];
      var lineHeight = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.4;
      visualLines(glyphs).forEach(function (line) {
        var start = delay + lineIndex++ * 75;
        line.forEach(function (glyph) {
          plan.push({glyph: glyph, height: glyph.getBoundingClientRect().height, lineHeight: lineHeight, delay: start});
        });
      });
    });
    var clock = document.timeline.currentTime;
    plan.forEach(function (item) {
      var animation = item.glyph.animate(frames(item.height, item.lineHeight), {
        delay: item.delay, duration: 1100, easing: 'linear', fill: 'backwards'
      });
      animation.startTime = clock;
      animation.id = 'profile-newsletter-reveal'; animations.push(animation);
    });
    disc.setAttribute('data-profile-reveal', 'ready');
  }
  function sync() {
    pending = false;
    var bio = document.querySelector(selector), next = bio?.closest('div.fixed.z-40');
    if (next !== disc) { cancel(); disc = next; wasOpen = false; }
    if (!disc) return;
    var open = !disc.hasAttribute('inert');
    if (open && !wasOpen) reveal();
    if (!open && wasOpen) { cancel(); disc.removeAttribute('data-profile-reveal'); }
    wasOpen = open;
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(sync); } }
  if (!reduced.matches) document.documentElement.setAttribute('data-profile-motion', 'ready');
  new MutationObserver(function (changes) {
    // Closing and reopening can happen before the next animation frame.
    // Consume inert changes immediately so every new open gets a fresh clock.
    if (changes.some(function (change) { return change.attributeName === 'inert'; })) sync();
    else schedule();
  }).observe(document.body, {attributes: true, attributeFilter: ['inert'], childList: true, subtree: true});
  window.addEventListener('resize', function () { cancel(); });
  reduced.addEventListener('change', function () {
    cancel(); document.documentElement.toggleAttribute('data-profile-motion', !reduced.matches);
    if (wasOpen && !reduced.matches) reveal();
  });
  window.addEventListener('pagehide', cancel);
  schedule();
})();
