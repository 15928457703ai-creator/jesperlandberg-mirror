/* Keep the native project sheet, related-project rail and close navigation.
 * Only the About sheet's content becomes a viewport-sized, audible video. */
(function () {
  'use strict';
  var video = null, pending = false;
  function prepare() {
    if (video) return video;
    video = document.createElement('video');
    video.className = 'about-project-video';
    video.src = '/showreel/showreel.mp4';
    video.poster = '/showreel/showreel.jpg';
    video.playsInline = true;
    video.controls = true;
    video.loop = true;
    video.muted = false;
    video.volume = 1;
    video.setAttribute('aria-label', '关于我视频');
    return video;
  }
  function sync() {
    pending = false;
    var active = location.pathname.replace(/\/$/, '') === '/projects/showreel';
    var slot = active && document.querySelector('[data-gl="sheet"][data-id="showreel"] [data-gl="simple"]');
    if (slot) {
      var player = prepare();
      if (player.parentElement !== slot) {
        slot.append(player);
        player.play().catch(function () { /* Direct visits use native Play. */ });
      }
    } else if (!active && video && video.isConnected) {
      video.pause();
      video.remove();
      video.removeAttribute('src');
      video.load();
      video = null;
    }
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(sync); }
  }
  // Unlock audio during the click, while leaving the native Vue handler intact.
  document.addEventListener('click', function (event) {
    var target = event.target.closest?.('[data-gl="card"][data-id="showreel"], a[href="/projects/showreel"]');
    if (target && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      prepare().play().catch(function () {});
    }
    schedule();
  }, true);
  new MutationObserver(schedule).observe(document.body, {childList:true, subtree:true});
  window.addEventListener('popstate', schedule);
  window.addEventListener('pagehide', function () { if (video) video.pause(); });
  schedule();
})();
