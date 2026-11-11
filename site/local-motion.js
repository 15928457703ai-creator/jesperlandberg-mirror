/* Gallery motion extends the existing scene so picking, videos, reflections
 * and card-to-sheet flights keep using the same geometry and clock. */
(function () {
  'use strict';
  window.PortfolioMotion = {
    // Chinese catalogue labels need native canvas glyphs too: this keeps
    // every label inside the scene's pointer field and preview mask.
    useCanvasText: function (el) {
      return el.textContent.trim() === '华润ERP' ||
        ((el.matches('.content-center a, [data-gl="sheet"] h1') || el.hasAttribute('data-title')) && /[\u3400-\u9fff]/.test(el.textContent));
    },
    install: function (folio) {
      if (folio.galleryMotion) return;
      var media = matchMedia('(prefers-reduced-motion: reduce)');
      var elapsed = 0;
      var pressed = null;
      var states = new WeakMap();
      var intro = -10000;
      var enabled = function () { return !media.matches && location.pathname === '/' && !folio.ctx.$resize?.small; };
      var clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };
      function stateFor(el) {
        var state = states.get(el);
        if (!state) { state = { focus: 0, press: 0, x: .5, y: .5 }; states.set(el, state); }
        return state;
      }
      folio.galleryMotion = { autoplay: true, get enabled() { return enabled(); } };
      function release() { pressed = null; }
      window.addEventListener('pointerdown', function (e) { if (e.button === 0) pressed = e.target.closest?.('[data-gl="card"]'); }, { passive: true });
      window.addEventListener('pointerup', release, { passive: true });
      window.addEventListener('pointercancel', release, { passive: true });
      window.addEventListener('blur', release);
      // Home card motion follows its own clock; hover remains native on
      // navigation and the catalogue, without driving the home presentation.
      var tone = folio.tone;
      folio.tone = function () {
        if (location.pathname !== '/') return tone.apply(this, arguments);
      };

      // Light is evaluated on the existing card surface: no overlay can
      // intercept clicks or cover the four corner navigation controls.
      var plane = folio.plane;
      folio.plane = function () {
        var mesh = plane.apply(this, arguments), material = mesh.material;
        var end = 'gl_FragColor = vec4(tex.rgb, alpha);';
        if (material.fragmentShader.includes(end)) {
          material.uniforms.u_galleryFocus = { value: 0 };
          material.uniforms.u_galleryPoint = { value: material.uniforms.u_res.value.clone().set(.5, .5) };
          material.fragmentShader = 'uniform float u_galleryFocus;\nuniform vec2 u_galleryPoint;\n' + material.fragmentShader.replace(end,
            'vec2 galleryDelta = (vUv - u_galleryPoint) * vec2(u_res.x / max(u_res.y, 0.001), 1.0);\n' +
            'float galleryLight = exp(-dot(galleryDelta, galleryDelta) * 5.0);\n' +
            'float gallerySweep = pow(max(0.0, 1.0 - abs(vUv.x + vUv.y * 0.25 - u_galleryPoint.x - 0.12)), 16.0);\n' +
            'tex.rgb += (vec3(0.07, 0.085, 0.11) * galleryLight + vec3(0.035) * gallerySweep) * u_galleryFocus * (1.0 - u_white);\n' + end);
          material.needsUpdate = true;
        }
        return mesh;
      };

      var showHome = folio.showHome;
      folio.showHome = function () {
        intro = performance.now();
        elapsed = 0;
        return showHome.apply(this, arguments);
      };
      var tick = folio.tick;
      folio.tick = function (dt) {
        var k = 1 - Math.exp(-Math.min(dt || .016, .05) * 7);
        var active = enabled() && this.hole.p < .02 && !document.hidden;
        if (active) elapsed += Math.min(dt || .016, .05);
        for (var card of this.reg.all()) {
          var el = card.el, uniforms = card.mesh.material.uniforms;
          if (!el?.isConnected || el.dataset.gl !== 'card' || !active) {
            if (uniforms.u_galleryFocus) uniforms.u_galleryFocus.value = 0;
            if (el?.dataset.gl === 'card' && uniforms.u_hover) uniforms.u_hover.value = 0;
            continue;
          }
          var state = stateFor(el);
          var index = Math.max(0, this.cards.findIndex(function (c) { return c.el === el; }));
          var phase = elapsed * .85 + index * .8;
          state.focus += ((.68 + .22 * Math.sin(phase)) - state.focus) * k;
          state.press += ((el === pressed ? 1 : 0) - state.press) * Math.min(1, k * 2);
          var x = .5 + .36 * Math.sin(elapsed * .55 + index * .65);
          var y = .5 + .24 * Math.cos(elapsed * .45 + index * .5);
          state.x += (x - state.x) * k;
          state.y += (y - state.y) * k;
          if (uniforms.u_hover) uniforms.u_hover.value = state.focus * .4;
          if (uniforms.u_galleryFocus) {
            uniforms.u_galleryFocus.value = state.focus;
            uniforms.u_galleryPoint.value.set(state.x, 1 - state.y);
          }
        }
        return tick.apply(this, arguments);
      };
      var sheet = folio.sheet;
      folio.sheet = function () {
        var pose = sheet.apply(this, arguments);
        if (enabled()) {
          // A shallow exhibition arc replaces the deep elastic ribbon.
          pose.D *= .36;
          pose.A *= .32;
          pose.V *= .55;
        }
        return pose;
      };
      var cardPose = folio.cardPose;
      folio.cardPose = function (el) {
        var pose = cardPose.apply(this, arguments);
        if (!pose || !enabled() || el.dataset.gl !== 'card') return pose;
        var box = el._vrect || el.getBoundingClientRect();
        if (box.right < -box.width || box.left > innerWidth + box.width) return pose;
        var index = this.cards.findIndex(function (card) { return card.el === el; });
        var cx = (box.left + box.width / 2) / innerWidth;
        var center = clamp((cx - .5) * 2, -1.5, 1.5);
        var focus = Math.exp(-Math.pow(center * 1.55, 2));
        var delay = Math.min(Math.max(index, 0), 5) * 70;
        var p = clamp((performance.now() - intro - delay) / 1650, 0, 1);
        var arrival = Math.pow(1 - p, 4);
        var state = stateFor(el);
        var hover = this.hole.p < .02 ? state.focus : 0;
        var press = this.hole.p < .02 ? state.press : 0;
        var h = pose.scale.y;
        var px = Math.sin(elapsed * .35) * .4;
        var py = Math.cos(elapsed * .3) * .3;
        var dy = h * (-.20 * arrival + (px * center * .012 - py * .014) * focus + .018 * hover + .007 * Math.sin(elapsed * .9 + index * .5));
        var dz = h * (.045 * focus - .15 * arrival - Math.abs(this.vel || 0) * .045 + .06 * hover - .035 * press);
        el._galleryOffset = { y: dy, z: dz };
        pose.pos.y += dy;
        pose.pos.z += dz;
        var scale = 1 + .012 * hover - .01 * press;
        pose.scale.x *= scale;
        pose.scale.y *= scale;
        // The same pose is sampled by native click flights, preventing a jump.
        pose.quat = this.core.camera.quaternion.clone();
        pose.quat.setFromAxisAngle({ x: 0, y: 1, z: 0 }, -.035 * center + .018 * px * focus + .12 * arrival * (index % 2 ? -1 : 1) + (state.x - .5) * .09 * hover);
        var tiltX = this.core.camera.quaternion.clone().setFromAxisAngle({ x: 1, y: 0, z: 0 }, (state.y - .5) * .07 * hover);
        pose.quat.multiply(tiltX);
        return pose;
      };
      var syncTitles = folio.syncTitles;
      folio.syncTitles = function () {
        syncTitles.apply(this, arguments);
        if (!enabled()) return;
        for (var text of this.texts) {
          var offset = text.card?._galleryOffset;
          if (!offset || !text.card?.isConnected) continue;
          text.mesh.position.y += offset.y;
          text.mesh.position.z += offset.z;
        }
      };

      // Motion collection: play only the clips actually inside the detail
      // viewport. Preloaded/parked media must never start in the background.
      var detailPointer = { x: -10000, y: -10000, fine: false };
      var visibleClips = new Set(), startedClips = new WeakSet();
      var detailWasActive = false;
      var lastMediaFrame = 0;
      var mediaStates = new WeakMap();
      window.addEventListener('pointermove', function (e) {
        detailPointer.x = e.clientX; detailPointer.y = e.clientY;
        detailPointer.fine = e.pointerType !== 'touch';
      }, { passive: true });
      document.documentElement.addEventListener('pointerleave', function () { detailPointer.fine = false; });
      var playVideo = folio.playVideo;
      folio.playVideo = function (video, wantsPlay) {
        if (video && location.pathname.replace(/\/$/, '') === '/projects/illustration') {
          var path = new URL(video.el.currentSrc || video.el.src, location.href).pathname;
          if (path.startsWith('/illustration/')) {
            wantsPlay = wantsPlay && visibleClips.has(path);
            if (wantsPlay && !startedClips.has(video)) {
              startedClips.add(video);
              video.el.currentTime = 0;
            }
          }
        }
        return playVideo.call(this, video, wantsPlay);
      };
      var syncContent = folio.syncContent;
      folio.syncContent = function () {
        var active = location.pathname.replace(/\/$/, '') === '/projects/illustration';
        if (active && !detailWasActive) startedClips = new WeakSet();
        detailWasActive = active;
        visibleClips.clear();
        var motionMedia = [];
        for (var item of this.content) {
          var el = item.el, source = item.mesh.userData.videoSrc;
          if (!el?.isConnected || !source || !source.startsWith('/illustration/')) continue;
          var panel = el.closest('[data-gl="sheet"][data-id="illustration"]');
          if (!panel) continue;
          var box = el._vrect || el.getBoundingClientRect();
          var bounds = panel.getBoundingClientRect();
          var top = Math.max(0, bounds.top), bottom = Math.min(innerHeight, bounds.bottom);
          var overlapY = Math.min(box.bottom ?? box.top + box.height, bottom) - Math.max(box.top, top);
          var overlapX = Math.min(box.right ?? box.left + box.width, bounds.right, innerWidth) - Math.max(box.left, bounds.left, 0);
          var visible = active && !document.hidden && !el._parked && item.p > .95 && overlapX > 0 &&
            overlapY >= Math.min(box.height * .3, Math.max(0, bottom - top) * .4);
          if (visible) visibleClips.add(new URL(source, location.href).pathname);
          motionMedia.push({ item: item, box: box, visible: visible });
        }
        syncContent.apply(this, arguments);
        var now = performance.now();
        var k = 1 - Math.exp(-Math.min(lastMediaFrame ? (now - lastMediaFrame) / 1000 : .016, .12) * 8);
        lastMediaFrame = now;
        for (var entry of motionMedia) {
          var mesh = entry.item.mesh, box = entry.box;
          var state = mediaStates.get(entry.item);
          if (!state) { state = { x: 0, y: 0 }; mediaStates.set(entry.item, state); }
          var inside = entry.visible && detailPointer.fine && this.ctx.$resize?.mouse && !media.matches &&
            detailPointer.x >= box.left && detailPointer.x <= box.left + box.width &&
            detailPointer.y >= box.top && detailPointer.y <= box.top + box.height;
          var x = inside ? ((detailPointer.x - box.left) / box.width - .5) * 2 : 0;
          var y = inside ? ((detailPointer.y - box.top) / box.height - .5) * 2 : 0;
          state.x += (x - state.x) * k;
          state.y += (y - state.y) * k;
          mesh.quaternion.identity();
          if (!active || media.matches) continue;
          mesh.position.x += mesh.scale.x * state.x * .008;
          mesh.position.y -= mesh.scale.y * state.y * .008;
          mesh.quaternion.setFromAxisAngle({ x: 0, y: 1, z: 0 }, state.x * .016);
          var qx = this.core.camera.quaternion.clone().setFromAxisAngle({ x: 1, y: 0, z: 0 }, state.y * .012);
          mesh.quaternion.multiply(qx);
          if (Math.abs(x - state.x) + Math.abs(y - state.y) > .002) this.core.wake();
        }
      };
    }
  };
})();
