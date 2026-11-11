/* Open About as an accessible video-only viewer. The gallery stays muted. */
(function () {
  'use strict';
  var dialog = null, video = null, previousFocus = null, direct = false;
  function close() {
    if (!dialog) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    dialog.remove();
    dialog = video = null;
    document.documentElement.classList.remove('about-video-open');
    if (direct) { location.assign('/'); return; }
    previousFocus?.focus();
  }
  function open(fromLink) {
    if (dialog) return;
    direct = !fromLink;
    previousFocus = document.activeElement;
    dialog = document.createElement('dialog');
    dialog.className = 'about-video-viewer';
    dialog.setAttribute('aria-label', '关于我视频');
    video = document.createElement('video');
    video.src = '/showreel/showreel.mp4';
    video.poster = '/showreel/showreel.jpg';
    video.playsInline = true;
    video.controls = true;
    video.loop = true;
    video.muted = false;
    video.volume = 1;
    video.preload = 'auto';
    video.setAttribute('aria-label', '关于我');
    var exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'about-video-close';
    exit.setAttribute('aria-label', '关闭视频');
    exit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    exit.addEventListener('click', close);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
    dialog.append(video, exit);
    document.body.append(dialog);
    document.documentElement.classList.add('about-video-open');
    dialog.showModal();
    // Called within the user's click so playback with audio is permitted.
    video.play().catch(function () {
      // A direct URL has no user gesture: native Play starts video with sound.
      video.controls = true;
    });
    exit.focus();
  }
  document.addEventListener('click', function (event) {
    var target = event.target.closest?.('[data-gl="card"][data-id="showreel"], a[href="/projects/showreel"]');
    if (!target || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(true);
  }, true);
  window.addEventListener('pagehide', function () { if (video) video.pause(); });
  if (location.pathname.replace(/\/$/, '') === '/projects/showreel') open(false);
})();
