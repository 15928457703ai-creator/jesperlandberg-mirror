/* Profile uses the same native text planes and reveal shader as Newsletter.
 * This hook only paints the mixed-weight Chinese source into its texture. */
(function () {
  'use strict';
  document.documentElement.setAttribute('data-profile-native', 'ready');
  window.PortfolioProfile = {
    paintRichText: function (plane) {
      if (!plane?.canvas || !plane.el?.isConnected) return;
      var el = plane.el, box = el.getBoundingClientRect(), ctx = plane.ctx2d;
      var scale = Math.min(2, window.devicePixelRatio || 1) * plane.ss;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, plane.canvas.width / scale, plane.canvas.height / scale);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), range = document.createRange(), node;
      while ((node = walker.nextNode())) {
        var style = getComputedStyle(node.parentElement);
        ctx.font = style.fontStyle + ' ' + style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
        if ('letterSpacing' in ctx) ctx.letterSpacing = style.letterSpacing;
        var metrics = ctx.measureText('Hg'), size = parseFloat(style.fontSize) || 14;
        var ascent = metrics.fontBoundingBoxAscent ?? size * .8;
        var descent = metrics.fontBoundingBoxDescent ?? size * .25;
        for (var offset = 0; offset < node.nodeValue.length; offset++) {
          var char = node.nodeValue[offset];
          if (/\s/.test(char)) continue;
          range.setStart(node, offset); range.setEnd(node, offset + 1);
          var rect = Array.from(range.getClientRects()).find(function (r) { return r.width && r.height; });
          if (!rect) continue;
          ctx.fillText(char, plane.padX + rect.left - box.left,
            plane.padY + rect.top - box.top + rect.height / 2 + (ascent - descent) / 2);
        }
      }
      plane.texture.needsUpdate = true;
    }
  };
})();
