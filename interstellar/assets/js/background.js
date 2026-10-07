/* ═══════════════════════════════════════════════════════════════════════════
   background.js — the spark layer over the accretion disc
   · the disc itself is WebGL now (assets/js/accretion.js)
   · this canvas adds the infalling matter: 3D-ish particles that orbit,
     twinkle and spiral inward until they are swallowed by the middle —
     faster when you scroll
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var cv = document.getElementById('fx');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  if (!ctx) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* reduced motion: the swirl is slower and never glints hard, but it is still
     a swirl — the whole page is built around the fall into the middle */
  var CALM = reduce ? 0.34 : 1;
  var TAU = Math.PI * 2;

  var W = 0, H = 0, DPR = 1, cx = 0, cy = 0;
  var px = 0, py = 0, tpx = 0, tpy = 0;
  var scrollVel = 0, lastScroll = 0, t = 0;
  var parts = [];
  var inward = 0;        // cumulative distance every sparkle has travelled midward
  var arrivals = 0;      // sparkles that reached the middle
  var flash = 0;         // core flash, fed by arrivals

  function rmax() { return Math.hypot(W, H) * 0.62; }
  /* how fast a spark falls, and how hard it whips around, at a given radius:
     a whirlpool — calm at the rim, fast and tight at the middle */
  function radialFactor(r) { return 0.5 + (1 - r) * 1.25; }
  function swirlFactor(r) { return 0.22 + (1 - r) * 2.0; }

  /* a soft dot and a four-point star, pre-rendered once for speed */
  function makeSprite(size, draw) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    draw(g, size);
    return c;
  }
  var dotSprite = makeSprite(48, function (g, s) {
    var r = s / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(.25, 'rgba(232,244,255,.7)');
    grad.addColorStop(.55, 'rgba(170,215,255,.18)');
    grad.addColorStop(1, 'rgba(120,170,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(r, r, r, 0, TAU); g.fill();
  });
  var starSprite = makeSprite(96, function (g, s) {
    var r = s / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r * .5);
    grad.addColorStop(0, 'rgba(255,255,255,.95)');
    grad.addColorStop(.5, 'rgba(255,238,214,.22)');
    grad.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(r, r, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineCap = 'round';
    for (var i = 0; i < 2; i++) {          // the glint: a four-point flare
      g.save();
      g.translate(r, r);
      g.rotate(i * Math.PI / 2);
      for (var dir = -1; dir <= 1; dir += 2) {
        var grd = g.createLinearGradient(0, 0, dir * r, 0);
        grd.addColorStop(0, 'rgba(255,255,255,.75)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = grd;
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(dir * r, 0); g.stroke();
      }
      g.restore();
    }
  });

  function spawn(p) {
    p.a = Math.random() * TAU;
    p.r = 0.5 + Math.random() * 0.72;              // born out past the corners
    p.rr = 0.055 + Math.random() * 0.06;           // inward speed (radii / second)
    p.spin = 0.45 + Math.random() * 0.75;          // swirl, faster near the middle
    p.s = 0.34 + Math.random() * 1.25;             // size
    p.tw = Math.random() * TAU;                    // twinkle phase
    p.flare = Math.random() < 0.17;                // a few carry a glint
    var roll = Math.random();
    p.col = roll > 0.9 ? [255, 205, 158] : (roll > 0.7 ? [176, 214, 255] : [255, 255, 255]);
    return p;
  }

  function seed() {
    var n = Math.round(Math.min(460, Math.max(150, (W * H) / 5200)));
    parts = [];
    for (var i = 0; i < n; i++) {
      var p = spawn({});
      /* spread the first generation across the whole fall, so the vortex is
         already in full flow on the first frame instead of filling in from
         the edges for half a minute */
      p.r = 0.06 + Math.random() * 1.14;
      parts.push(p);
    }
  }

  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W / 2; cy = H / 2;
    seed();
  }
  size();
  window.addEventListener('resize', size);

  window.addEventListener('mousemove', function (e) {
    if (reduce) return;
    tpx = (e.clientX / W - 0.5) * 16;
    tpy = (e.clientY / H - 0.5) * 12;
  }, { passive: true });

  window.addEventListener('scroll', function () {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    scrollVel = reduce ? 0 : Math.min(70, Math.abs(y - lastScroll) * 0.9);
    lastScroll = y;
  }, { passive: true });

  var prev = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (document.hidden) return;
    t += dt;

    px += (tpx - px) * Math.min(1, dt * 2.4);
    py += (tpy - py) * Math.min(1, dt * 2.4);
    scrollVel *= 0.9;

    var R = rmax();
    var boost = (1 + scrollVel * 0.03) * CALM;     // scrolling whips the vortex up

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var was = p.r;
      p.r -= (p.rr * radialFactor(p.r)) * dt * boost;
      p.a += (p.spin * swirlFactor(p.r)) * dt * boost;
      inward += Math.max(0, was - p.r) * R;

      if (p.r <= 0.028) {                          // swallowed by the middle
        arrivals++;
        flash = Math.min(1, flash + 0.14);
        spawn(p);
        p.r = 1.15 + Math.random() * 0.12;         // re-enter from the edge
      }

      var rad = p.r * R;
      var sx = cx + Math.cos(p.a) * rad + px;
      var sy = cy + Math.sin(p.a) * rad + py;
      if (sx < -80 || sx > W + 80 || sy < -80 || sy > H + 80) continue;

      var tw = 0.34 + 0.66 * Math.abs(Math.sin(p.tw + t * (1.3 + p.s * 0.5)));
      var near = 1 - Math.min(1, p.r);             // brighter as it nears the middle
      /* fade in at the rim and out again at the very middle, so the sparks are
         visibly swallowed by the core instead of piling up into a white blob */
      var fadeIn = Math.min(1, p.r / 0.45);
      var fadeOut = Math.min(1, Math.max(0, (p.r - 0.05) / 0.18));
      var alpha = Math.min(1, (0.3 + 0.7 * near) * tw * fadeIn * fadeOut) * (reduce ? 0.8 : 1);
      var size = (2.5 + p.s * 7.4) * (0.5 + near * 0.55) * (p.flare ? 1.08 : 1);
      if (alpha < 0.02) continue;

      /* comet tail: a short step back along the spark's own spiral, so the
         direction of the fall reads even when the page is standing still.
         It lengthens automatically where the spark moves faster — near the middle. */
      var tailDt = (reduce ? 0.07 : 0.16) * (1 + Math.min(1.4, scrollVel / 26));
      var rPrev = Math.min(1.22, p.r + p.rr * radialFactor(p.r) * tailDt * boost);
      var aPrev = p.a - p.spin * swirlFactor(p.r) * tailDt * boost;
      var tRad = rPrev * R;
      ctx.globalAlpha = Math.min(0.65, alpha * 0.45);
      ctx.strokeStyle = 'rgba(' + p.col[0] + ',' + p.col[1] + ',' + p.col[2] + ',1)';
      ctx.lineWidth = Math.max(0.5, size * (scrollVel > 12 ? 0.3 : 0.22));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(aPrev) * tRad + px, cy + Math.sin(aPrev) * tRad + py);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      ctx.globalAlpha = alpha;
      ctx.drawImage(dotSprite, sx - size / 2, sy - size / 2, size, size);
      if (p.flare) {
        var fs = size * 3.4;
        ctx.globalAlpha = alpha * (0.34 + 0.4 * Math.abs(Math.sin(t * 0.9 + p.tw)));
        ctx.drawImage(starSprite, sx - fs / 2, sy - fs / 2, fs, fs);
      }

      // a whisper of colour on the brightest sparks
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = 'rgba(' + p.col[0] + ',' + p.col[1] + ',' + p.col[2] + ',1)';
      ctx.beginPath();
      ctx.arc(sx, sy, size * 0.28, 0, TAU);
      ctx.fill();
    }

    /* the middle: a glow that brightens every time a sparkle arrives */
    flash *= Math.pow(0.28, dt);
    var coreR = Math.min(W, H) * (0.17 + flash * 0.08);
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    g.addColorStop(0, 'rgba(236,246,255,' + (0.08 + flash * 0.24).toFixed(3) + ')');
    g.addColorStop(.42, 'rgba(150,196,255,' + (0.03 + flash * 0.11).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, TAU); ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
  }
  requestAnimationFrame(loop);

  /* small debug/verification handle: reports that the sparkles really travel
     toward the middle rather than merely twinkling in place */
  window.StarFX = {
    get count() { return parts.length; },
    get inwardDistance() { return inward; },
    get arrivals() { return arrivals; },
    avgRadius: function () {
      var s = 0;
      for (var i = 0; i < parts.length; i++) s += parts[i].r;
      return parts.length ? s / parts.length : 0;
    },
    probe: function (i) {
      var p = parts[i % parts.length];
      return p ? { r: p.r, a: p.a } : null;
    },
    /* advance the swirl by hand — used by the verification pass to prove that
       sparkles travel toward the middle without waiting on frame timing */
    step: function (dt) {
      var R = rmax();
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var was = p.r;
        p.r -= (p.rr * radialFactor(p.r)) * dt * CALM;
        p.a += (p.spin * swirlFactor(p.r)) * dt * CALM;
        inward += Math.max(0, was - p.r) * R;
        if (p.r <= 0.028) { arrivals++; flash = Math.min(1, flash + 0.14); spawn(p); p.r = 1.15 + Math.random() * 0.12; }
      }
    },
    reduced: reduce
  };
})();
