/* ------------------------------------------------------------------
   华润白酒 ERP — auto-playing home cover.

   Two independent timelines, so nothing fights over a transform:
     intro  (once)   -> slot boxes, masked lines, panel entrances
     loop   (14 s, seamless) -> the phone bodies, badge, light sweeps

   `?capture=1` skips the intro and exposes window.__erpSeek(t): every frame
   is a pure function of t, which is what tools/record_erp_fx.js records.
   `?still=1` freezes the rest state for the poster frame.
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var q = new URLSearchParams(location.search);
  var CAPTURE = q.has('capture');
  var STILL = q.has('still');
  var DURATION = 14;

  var stage = document.getElementById('stage');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fit() {
    var s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    stage.style.transform = 'scale(' + s + ')';
  }
  fit();
  addEventListener('resize', fit);

  /* ---------------- loop: 14 s, frame 0 === frame 14 ---------------- */
  var loop = gsap.timeline({ paused: true, repeat: -1 });

  // front phone leans in while the back phone settles, then they trade places
  loop.to('#gridPhone',
      { y: -30, x: 12, rotation: -1.4, scale: 1.015, duration: 3.4, ease: 'sine.inOut' }, 0)
    .to('#gridPhone',
      { y: 8, x: -5, rotation: 0.6, scale: 0.995, duration: 3.2, ease: 'sine.inOut' }, 3.4)
    .to('#gridPhone',
      { y: -14, x: 7, rotation: -0.8, scale: 1.008, duration: 3.4, ease: 'sine.inOut' }, 6.6)
    .to('#gridPhone',
      { y: 0, x: 0, rotation: 0, scale: 1, duration: 4, ease: 'sine.inOut' }, 10)

    .to('#detailPhone',
      { y: 16, x: -8, rotation: 0.8, scale: 0.993, duration: 2.6, ease: 'sine.inOut' }, 0)
    .to('#detailPhone',
      { y: -26, x: 9, rotation: -1.2, scale: 1.018, duration: 3.2, ease: 'sine.inOut' }, 2.6)
    .to('#detailPhone',
      { y: 10, x: -4, rotation: 0.5, scale: 0.997, duration: 3.4, ease: 'sine.inOut' }, 5.8)
    .to('#detailPhone',
      { y: 0, x: 0, rotation: 0, scale: 1, duration: 4.8, ease: 'sine.inOut' }, 9.2);

  // the lime mark breathes and rocks a few degrees
  loop.to('#badge', { rotation: 9, duration: 5, ease: 'sine.inOut' }, 0)
    .to('#badge', { rotation: -7, duration: 5.2, ease: 'sine.inOut' }, 5)
    .to('#badge', { rotation: 0, duration: 3.8, ease: 'sine.inOut' }, 10.2)
    .to('#badge', { scale: 1.07, duration: 0.6, ease: 'power2.out' }, 5.2)
    .to('#badge', { scale: 1, duration: 1.4, ease: 'power2.inOut' }, 5.8);

  // two light bands cross the blue field; both are transparent at both ends
  loop.fromTo('#sweep', { x: -160, opacity: 0 },
        { x: 1000, opacity: 1, duration: 1.7, ease: 'sine.out' }, 4.1)
    .to('#sweep', { x: 2800, opacity: 0, duration: 2.4, ease: 'sine.in' }, 5.8)
    .fromTo('#sweep2', { x: -160, opacity: 0 },
        { x: 1200, opacity: 1, duration: 1.4, ease: 'sine.out' }, 10.8)
    .to('#sweep2', { x: 2800, opacity: 0, duration: 2.1, ease: 'sine.in' }, 12.2);

  // specular glints run across the glass of each phone
  glint('#gridPhone .glare i', 2.2, 1.5, 0.85);
  glint('#detailPhone .glare i', 8.2, 1.7, 0.7);

  function glint(sel, at, dur, peak) {
    loop.fromTo(sel, { xPercent: -180, opacity: 0 },
          { xPercent: 120, opacity: peak, duration: dur * 0.45, ease: 'power1.out' }, at)
        .to(sel, { xPercent: 430, opacity: 0, duration: dur * 0.55, ease: 'power1.in' },
           at + dur * 0.45);
  }

  // the three pills pick up the light band one after another
  loop.to('#pills span', { backgroundColor: 'rgba(255,255,255,.55)',
        duration: 0.55, stagger: 0.16, ease: 'sine.out' }, 4.7)
    .to('#pills span', { backgroundColor: 'rgba(255,255,255,.19)',
        duration: 0.95, stagger: 0.16, ease: 'sine.inOut' }, 5.6);

  /* ---------------------------- intro ---------------------------- */
  function intro() {
    var tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: function () { loop.play(); }
    });

    tl.from('#cardWhite', { scale: 1.035, opacity: 0, duration: 0.9, ease: 'power2.out' }, 0)
      .from('#cardBlue', { y: 110, opacity: 0, duration: 1.0, ease: 'power3.out' }, 0.08)

      .from('#eyebrow .ln i', { yPercent: 110, duration: 0.7, stagger: 0.1 }, 0.5)
      .from('#title .g i', { yPercent: 114, duration: 1.05, stagger: 0.06, ease: 'expo.out' }, 0.55)
      .from('#sub .w i', { yPercent: 112, duration: 0.85, stagger: 0.07, ease: 'expo.out' }, 0.82)

      .from('#ruleTop', { scaleX: 0, duration: 0.9, ease: 'power3.inOut' }, 1.0)
      .from('#copy .ln i', { yPercent: 106, duration: 0.8, stagger: 0.07, ease: 'expo.out' }, 1.14)
      .from('#pills span', { y: 12, scale: 0.9, opacity: 0, duration: 0.6, stagger: 0.08 }, 1.44)
      .from('.meta', { y: 12, opacity: 0, duration: 0.6, stagger: 0.1 }, 1.6)
      .from('#ruleBottom', { scaleX: 0, duration: 0.9, ease: 'power3.inOut' }, 1.72)

      .from('#slotGrid', { x: 140, y: -70, scale: 0.94, rotation: 3,
                           opacity: 0, duration: 1.25, ease: 'expo.out' }, 0.3)
      .from('#slotDetail', { x: -140, y: 100, scale: 0.92, rotation: -4,
                             opacity: 0, duration: 1.35, ease: 'expo.out' }, 0.5)
      .from('#badge', { scale: 0, rotation: -140, duration: 0.95,
                        ease: 'back.out(1.7)' }, 0.72)

      .fromTo('#gridPhone .glare i', { xPercent: -180, opacity: 0 },
              { xPercent: 430, opacity: 0.8, duration: 1.6, ease: 'power1.inOut' }, 1.5)
      .to('#gridPhone .glare i', { opacity: 0, duration: 0.3 }, 2.9);

    return tl;
  }

  /* ------------------------- pointer parallax ------------------------- */
  function parallax() {
    var mk = function (el, depth) {
      var rx = gsap.quickTo(el, 'rotationY', { duration: 0.9, ease: 'power2.out' });
      var ry = gsap.quickTo(el, 'rotationX', { duration: 0.9, ease: 'power2.out' });
      var tx = gsap.quickTo(el, 'x', { duration: 0.9, ease: 'power2.out' });
      return function (nx, ny) {
        rx(nx * depth);
        ry(-ny * depth * 0.7);
        tx(nx * depth * 0.9);
      };
    };
    var a = mk(stage.querySelector('.slot-grid'), 2.2);
    var b = mk(stage.querySelector('.slot-detail'), 3.2);
    addEventListener('pointermove', function (e) {
      var nx = (e.clientX / window.innerWidth) * 2 - 1;
      var ny = (e.clientY / window.innerHeight) * 2 - 1;
      a(nx, ny);
      b(nx, ny);
    });
  }

  /* ------------------------------ boot ------------------------------ */
  var introTl = null;

  if (STILL) {
    // rest state, no animation at all
    gsap.set('#sweep, #sweep2, .glare i', { opacity: 0 });
  } else if (CAPTURE) {
    loop.pause(0);
  } else if (reduce) {
    loop.play();
  } else {
    introTl = intro();
    // ?introseek keeps the entrance parked at its first frame so the intro can
    // be inspected / recorded frame by frame instead of in real time
    if (q.has('introseek')) introTl.pause(0);
    parallax();
  }

  window.__erpSeek = {
    duration: DURATION,
    intro: function () { return introTl; },
    seek: function (t) {
      loop.pause();
      loop.time(t);
    },
    reset: function () {
      loop.pause(0);
      gsap.set(['#gridPhone', '#detailPhone', '#badge'],
        { clearProps: 'transform' });
      gsap.set('#badge', { scale: 1, rotation: 0 });
    }
  };
})();
