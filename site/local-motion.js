/* Gallery motion extends the existing scene so picking, videos, reflections
 * and card-to-sheet flights keep using the same geometry and clock. */
(function () {
  'use strict';
  window.PortfolioMotion = {
    // Chinese catalogue labels need native canvas glyphs too: this keeps
    // every label inside the scene's pointer field and preview mask.
    useCanvasText: function (el) {
      return el.textContent.trim() === '华润ERP' ||
        (el.matches('.content-center a') && /[\u3400-\u9fff]/.test(el.textContent));
    },
    install: function (folio) {
      if (folio.galleryMotion) return;
      var media = matchMedia('(prefers-reduced-motion: reduce)');
      var pointer = { x: .5, y: .5, sx: .5, sy: .5, active: false };
      var intro = -10000;
      var enabled = function () { return !media.matches && location.pathname === '/' && !folio.ctx.$resize?.small; };
      var clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };
      folio.galleryMotion = { pointer: pointer, get enabled() { return enabled(); } };
      window.addEventListener('pointermove', function (e) {
        pointer.x = e.clientX / innerWidth;
        pointer.y = e.clientY / innerHeight;
        pointer.active = e.pointerType !== 'touch';
      }, { passive: true });
      document.documentElement.addEventListener('pointerleave', function () { pointer.active = false; });
      window.addEventListener('blur', function () { pointer.active = false; });

      var showHome = folio.showHome;
      folio.showHome = function () {
        intro = performance.now();
        return showHome.apply(this, arguments);
      };
      var tick = folio.tick;
      folio.tick = function (dt) {
        var k = 1 - Math.exp(-Math.min(dt || .016, .05) * 7);
        pointer.sx += ((pointer.active ? pointer.x : .5) - pointer.sx) * k;
        pointer.sy += ((pointer.active ? pointer.y : .5) - pointer.sy) * k;
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
        var p = clamp((performance.now() - intro - delay) / 1450, 0, 1);
        var arrival = Math.pow(1 - p, 3);
        var h = pose.scale.y;
        var px = (pointer.sx - .5) * 2;
        var py = (pointer.sy - .5) * 2;
        var dy = h * (-.17 * arrival + (px * center * .012 - py * .014) * focus);
        var dz = h * (.045 * focus - .12 * arrival - Math.abs(this.vel || 0) * .025);
        el._galleryOffset = { y: dy, z: dz };
        pose.pos.y += dy;
        pose.pos.z += dz;
        // The same pose is sampled by native click flights, preventing a jump.
        pose.quat = this.core.camera.quaternion.clone();
        pose.quat.setFromAxisAngle({ x: 0, y: 1, z: 0 }, -.035 * center + .018 * px * focus + .10 * arrival * (index % 2 ? -1 : 1));
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
    }
  };
})();
