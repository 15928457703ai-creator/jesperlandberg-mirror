/* Controls operate the same native WebGL video, preserving project flights. */
(function () {
  'use strict';
  var bar = null, player = null, dispose = null, scheduled = false;
  var icons = {
    play: '<path d="m8 5 11 7-11 7Z"/>',
    pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 8q5 4 0 8" fill="none" stroke="currentColor" stroke-width="2"/>',
    muted: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="2"/>',
    full: '<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" fill="none" stroke="currentColor" stroke-width="2"/>'
  };
  function icon(button, name) { button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[name] + '</svg>'; }
  function time(value) { value = Math.max(0, Math.floor(value || 0)); return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0'); }
  function remove() {
    if (dispose) dispose();
    if (bar) bar.remove();
    bar = player = dispose = null;
  }
  function sync() {
    scheduled = false;
    var sheet = location.pathname.replace(/\/$/, '') === '/projects/showreel' && document.querySelector('[data-gl="sheet"][data-id="showreel"]');
    if (!sheet) { remove(); return; }
    if (!window.PortfolioMotion?.getAboutVideo) return;
    var clip = window.PortfolioMotion.getAboutVideo();
    if (bar?.parentElement === sheet && player === clip) return;
    remove(); player = clip;
    bar = document.createElement('div');
    bar.className = 'about-playback';
    bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '视频播放控制');
    var play = document.createElement('button'), sound = document.createElement('button'), full = document.createElement('button');
    for (var button of [play, sound, full]) button.type = 'button';
    var seek = document.createElement('input');
    seek.type = 'range'; seek.min = 0; seek.max = 1000; seek.value = 0; seek.step = 1;
    seek.setAttribute('aria-label', '播放进度');
    var clock = document.createElement('span'); clock.className = 'about-playback-time';
    full.setAttribute('aria-label', '全屏播放'); icon(full, 'full');
    play.addEventListener('click', function () { if (clip.paused) clip.play().catch(function () {}); else clip.pause(); });
    // The scene's visibility controller respects an explicit user pause.
    play.addEventListener('click', function () { clip.dataset.userPaused = clip.paused ? 'true' : 'false'; });
    sound.addEventListener('click', function () { clip.dataset.userMuted = clip.muted ? 'false' : 'true'; clip.muted = !clip.muted; update(); });
    seek.addEventListener('input', function () { if (Number.isFinite(clip.duration)) clip.currentTime = clip.duration * Number(seek.value) / 1000; });
    full.addEventListener('click', function () { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(function () {}); });
    function update() {
      play.setAttribute('aria-label', clip.paused ? '播放视频' : '暂停视频'); icon(play, clip.paused ? 'play' : 'pause');
      sound.setAttribute('aria-label', clip.muted ? '开启声音' : '静音'); icon(sound, clip.muted ? 'muted' : 'sound');
      seek.value = clip.duration ? String(clip.currentTime / clip.duration * 1000) : '0';
      clock.textContent = time(clip.currentTime) + ' / ' + time(clip.duration);
    }
    for (var event of ['timeupdate', 'play', 'pause', 'volumechange', 'loadedmetadata']) clip.addEventListener(event, update);
    dispose = function () { for (var event of ['timeupdate', 'play', 'pause', 'volumechange', 'loadedmetadata']) clip.removeEventListener(event, update); };
    bar.append(play, seek, clock, sound, full);
    sheet.append(bar); update();
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(sync); } }
  document.addEventListener('click', function (event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var entering = event.target.closest?.('[data-gl="card"][data-id="showreel"], a[href="/projects/showreel"]');
    if (entering) window.PortfolioMotion?.playAboutAudio?.();
    if (event.target.closest?.('[data-gl="related"], a[aria-label="Close project"]')) remove();
    setTimeout(schedule, 1100);
  }, true);
  new MutationObserver(schedule).observe(document.body, {childList:true, subtree:true});
  window.addEventListener('popstate', schedule);
  schedule();
})();
