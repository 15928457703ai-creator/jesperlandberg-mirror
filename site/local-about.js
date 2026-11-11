/* Unlock sound during the user gesture without intercepting native routing.
 * Rendering, clipping, close and previous/next flights all stay in WebGL. */
(function () {
  'use strict';
  document.addEventListener('click', function (event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var entering = event.target.closest?.('[data-gl="card"][data-id="showreel"], a[href="/projects/showreel"]');
    if (entering || location.pathname.replace(/\/$/, '') === '/projects/showreel') {
      window.PortfolioMotion?.playAboutAudio?.();
    }
  }, true);
})();
