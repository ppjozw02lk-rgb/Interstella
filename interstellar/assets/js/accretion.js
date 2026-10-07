/* ═══════════════════════════════════════════════════════════════════════════
   accretion.js — BACKGROUND: “Accretion Disc 3” (Originkit)

   The React/WebGL component ported to plain JavaScript, one-to-one:
   · every constant, GLSL source, helper (compile / link / parseColor /
     mulberry32 / gauss / buildCloud / merge) and default prop is unchanged
   · useEffect → init(), refs → locals, `live` → a module-level object that the
     render loop reads each frame (so props can still be changed at runtime)
   · one extra thing the React version did not need: the first frame is painted
     synchronously, so a build that never gets a requestAnimationFrame callback
     (a background tab, a paused webview) still shows the disc, not a blank box

   Console handle: window.AccretionDisc  (stats(), set(), pause(), resume(), step())
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var DPR_CAP = 2;

  var ROUT = 100;

  var FOV_DEG = 34;
  var FOCAL = 1 / Math.tan((FOV_DEG * Math.PI) / 180 / 2);

  var RIN_FLOOR = 1.0;

  var THICKNESS = 2.4;

  var WIND = 3.40;

  var ARM_SHARPNESS = 2.6;

  var ARM_PULL = 0.45;
  var ARM_SPIN = 0.06;
  var JET_FLOW = 0.09;
  var JET_HELIX = 0.0055;
  var JET_SHARE = 0.32;
  var FOCUS_MULT = 1.75;

  var HALO = 1.7;
  var ORBIT_REF = 0.449;

  var DOT_REF = 0.16;
  var BLUR_REF = 0.64;

  var COUNT_BASE = 20000;
  var COUNT_PER = 3600;

  var TIME_WRAP = 1e5;

  var PARTICLE_VERT = `
precision highp float;

attribute vec4 aSeed;

attribute float aKind;

uniform float uTime;
uniform float uTilt;
uniform float uDist;
uniform float uAspect;
uniform float uHalfH;
uniform float uDotSize;
uniform float uBlur;
uniform float uScatter;
uniform float uCore;
uniform float uArms;
uniform float uJetAmount;
uniform float uJetLen;
uniform float uJetSpread;

varying float vAlpha;
varying float vRamp;

const float FOCAL = ${FOCAL.toFixed(6)};
const float ROUT = ${ROUT.toFixed(1)};
const float WIND = ${WIND.toFixed(3)};
const float THICKNESS = ${THICKNESS.toFixed(2)};

const float ORBIT = ${ORBIT_REF.toFixed(4)};

void kill() {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    vRamp = 0.0;
}

void main() {
    float rIn = max(uCore * 1.32, ${RIN_FLOOR.toFixed(1)});
    vec3 p;
    float bright;
    float ramp;

    if (aKind == 0.0) {
        float r = sqrt(mix(0.0, ROUT * ROUT, aSeed.x));
        float f = clamp(r / max(ROUT, 1e-3), 0.0, 1.0);

        float th = aSeed.y + ORBIT * pow(max(rIn, 0.1) / max(r, 0.1), 1.5) * uTime;

        float armAngle = uArms * (th - WIND * log(max(r, 0.1) / max(rIn, 0.1)))
                       - ${ARM_SPIN.toFixed(3)} * uTime * min(uArms, 1.0);

        th -= ${ARM_PULL.toFixed(2)} * sin(armAngle) / max(uArms, 1.0);
        float arm = pow(0.5 + 0.5 * cos(armAngle), ${ARM_SHARPNESS.toFixed(1)});

        float flare = 0.30 + 0.70 * pow(f, 1.2);
        float y = aSeed.z * THICKNESS * uScatter * flare;
        p = vec3(r * cos(th), y, r * sin(th));

        float radial = 1.0 - smoothstep(0.45, 1.0, f);
        radial *= 1.0 + 1.4 * exp(-pow((f - 0.32) / 0.20, 2.0));

        float farSide = 0.5 - 0.5 * (p.z / max(r, 1e-3));

        bright = radial * (0.34 + 0.75 * arm) * mix(0.62, 1.0, farSide) * 1.45;
        ramp = clamp((1.0 - f) * 0.55 + arm * 0.55, 0.0, 1.0);
    } else {
        if (aSeed.w > uJetAmount) { kill(); return; }

        float u = fract(aSeed.x + ${JET_FLOW.toFixed(3)} * uTime);
        float climb = pow(u, 1.35) * uJetLen;
        float cone = tan(uJetSpread) * climb * (0.30 + 0.70 * u) + uCore * 0.35;
        float rr = aSeed.z * cone;
        float az = aSeed.y + climb * ${JET_HELIX.toFixed(4)};
        p = vec3(rr * cos(az), aKind * climb, rr * sin(az));

        bright = mix(1.0, 0.20, smoothstep(0.0, 1.0, u)) * (0.28 + 0.72 * (1.0 - aSeed.z)) * 1.75;
        ramp = 0.30 + 0.40 * (1.0 - u);
    }

    float c = cos(uTilt);
    float s = sin(uTilt);
    vec3 camPos = vec3(0.0, uDist * s, uDist * c);
    vec3 rel = p - camPos;

    vec3 q = vec3(rel.x, c * rel.y - s * rel.z, s * rel.y + c * rel.z);
    float depth = -q.z;
    if (depth < 1.0) { kill(); return; }

    gl_Position = vec4(q.x * FOCAL / (depth * uAspect), q.y * FOCAL / depth, 0.0, 1.0);

    float ppw = FOCAL * uHalfH / depth;
    float focusD = uDist * ${FOCUS_MULT.toFixed(2)};
    float coc = uBlur * max(0.0, focusD - depth) / focusD;
    float px = (uDotSize + coc) * ppw * ${HALO.toFixed(2)};

    vAlpha = bright * pow(uDotSize / max(uDotSize + coc, 1e-5), 1.6);

    float optical = px / ${HALO.toFixed(2)};
    if (optical < 1.0) vAlpha *= optical * optical;
    vRamp = ramp;
    gl_PointSize = clamp(px, 1.0, 96.0);
}
`;

  var PARTICLE_FRAG = `
precision highp float;

uniform vec3 uBase;
uniform vec3 uAccent;

varying float vAlpha;
varying float vRamp;

void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) * 4.0;
    if (r2 > 1.0) discard;
    float core = max(0.0, exp(-r2 * 9.25) - 0.0000961);
    float skirt = max(0.0, exp(-r2 * 1.80) - 0.165299);
    float g = core + 0.30 * skirt;
    float e = g * vAlpha;
    vec3 col = mix(uBase, uAccent, vRamp);
    gl_FragColor = vec4(col * e, e);
}
`;

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('AccretionDisc shader:', gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  function link(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('AccretionDisc link:', gl.getProgramInfoLog(p));
    }
    return p;
  }

  function parseColor(input) {
    if (!input) return [0, 0, 0];
    var s = String(input).trim();

    var token = s.match(/^var\(\s*--[^,)]+\s*,\s*(.+)\)\s*$/is);
    if (token) s = token[1].trim();

    var rgb = s.match(/rgba?\(([^)]+)\)/i);
    if (rgb) {
      var p = rgb[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
      return [(p[0] || 0) / 255, (p[1] || 0) / 255, (p[2] || 0) / 255];
    }

    var hsl = s.match(/hsla?\(([^)]+)\)/i);
    if (hsl) {
      var q = hsl[1].split(/[,\s/]+/).filter(Boolean);
      var h = ((parseFloat(q[0]) || 0) % 360) / 360;
      var sat = (parseFloat(q[1]) || 0) / 100;
      var li = (parseFloat(q[2]) || 0) / 100;
      var qq = li < 0.5 ? li * (1 + sat) : li + sat - li * sat;
      var pp = 2 * li - qq;
      var chan = function (t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return pp + (qq - pp) * 6 * t;
        if (t < 1 / 2) return qq;
        if (t < 2 / 3) return pp + (qq - pp) * (2 / 3 - t) * 6;
        return pp;
      };
      return [chan(h + 1 / 3), chan(h), chan(h - 1 / 3)];
    }

    var hx = s.replace('#', '');
    if (hx.length === 3 || hx.length === 4) {
      hx = hx.split('').map(function (ch) { return ch + ch; }).join('');
    }
    hx = hx.padEnd(6, '0');
    var v = function (i) {
      var n = parseInt(hx.slice(i, i + 2), 16);
      return Number.isFinite(n) ? n / 255 : 0;
    };
    return [v(0), v(2), v(4)];
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(rnd) {
    var u1 = Math.max(1e-9, rnd());
    var u2 = rnd();
    var g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2);
    return Math.max(-3, Math.min(3, g));
  }

  function buildCloud(count) {
    var seed = new Float32Array(count * 4);
    var kind = new Float32Array(count);
    var rnd = mulberry32(0x9e3779b9);
    for (var i = 0; i < count; i++) {
      var o = i * 4;
      if (rnd() >= JET_SHARE) {
        seed[o] = rnd();
        seed[o + 1] = rnd() * TAU;
        seed[o + 2] = gauss(rnd);
        seed[o + 3] = rnd();
        kind[i] = 0;
      } else {
        seed[o] = rnd();
        seed[o + 1] = rnd() * TAU;
        seed[o + 2] = Math.sqrt(rnd());
        seed[o + 3] = rnd();
        kind[i] = rnd() < 0.5 ? 1 : -1;
      }
    }
    return { seed: seed, kind: kind };
  }

  var FIELD_DEFAULTS = { scatter: 44, blur: 0 };
  var DISC_DEFAULTS = { tilt: 16, core: 0, arms: 5 };
  var JETS_DEFAULTS = { amount: 40, length: 300, spread: 34 };

  function merge(defaults, group) {
    var out = {};
    for (var k in defaults) if (Object.prototype.hasOwnProperty.call(defaults, k)) out[k] = defaults[k];
    if (!group) return out;
    for (var j in group) if (Object.prototype.hasOwnProperty.call(group, j) && group[j] !== undefined) out[j] = group[j];
    return out;
  }

  /* the component's props — exactly the values the site is built with */
  var CONFIG = {
    background: '#000000',
    baseColor: '#1900FF',
    accentColor: '#A0C0FF',
    density: 61,
    dotSize: 127,
    speed: 100,
    distance: 220,
    field: { blur: 0, scatter: 0 },
    disc: { arms: 4, core: 7, tilt: 14 },
    jets: { amount: 0, length: 200, spread: 34 },
  };

  /* the component's `live` ref: recomputed from CONFIG and read every frame */
  var live = {
    base: parseColor(CONFIG.baseColor),
    accent: parseColor(CONFIG.accentColor),
    count: 0,
    dotSize: 0,
    speed: 0,
    distance: 0,
    scatter: 0,
    blur: 0,
    tilt: 0,
    core: 0,
    arms: 0,
    jetAmount: 0,
    jetLen: 0,
    jetSpread: 0,
  };

  function syncLive(cfg) {
    var f = merge(FIELD_DEFAULTS, cfg.field);
    var d = merge(DISC_DEFAULTS, cfg.disc);
    var j = merge(JETS_DEFAULTS, cfg.jets);

    live.base = parseColor(cfg.baseColor);
    live.accent = parseColor(cfg.accentColor);
    live.count = Math.round(COUNT_BASE + cfg.density * COUNT_PER);
    live.dotSize = (DOT_REF * cfg.dotSize) / 100;
    live.speed = cfg.speed;
    live.distance = cfg.distance;
    live.scatter = f.scatter / 100;
    live.blur = (BLUR_REF * f.blur) / 100;
    live.tilt = (d.tilt * Math.PI) / 180;
    live.core = (d.core / 100) * ROUT;
    live.arms = d.arms;
    live.jetAmount = j.amount / 100;
    live.jetLen = (j.length / 100) * ROUT;
    live.jetSpread = (j.spread * Math.PI) / 180;
  }
  syncLive(CONFIG);

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* the site never freezes its background for reduced motion — the disc keeps
     turning, it just turns slowly, the way the galaxy spiral did */
  var CALM = reduce ? 0.26 : 1;

  var canvas = null;
  var gl = null;
  var prog = null;
  var pu = null;
  var seedBuf = null;
  var kindBuf = null;
  var aSeed = 0;
  var aKind = 0;
  var built = 0;
  var bw = 1;
  var bh = 1;
  var t = 0;
  var frames = 0;
  var raf = 0;
  var last = 0;
  var paused = false;
  var ok = false;

  /* pointer + scroll, the way the rest of the background reacts */
  var px = 0, py = 0, tpx = 0, tpy = 0;
  var scrollVel = 0, lastScroll = 0;

  function resize() {
    if (!gl) return;
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    var cw = canvas.clientWidth || window.innerWidth || 0;
    var ch = canvas.clientHeight || window.innerHeight || 0;
    var w = Math.max(1, Math.round(cw * dpr));
    var h = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    bw = w;
    bh = h;
    gl.viewport(0, 0, w, h);
  }

  function rebuild(count) {
    var cloud = buildCloud(count);
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cloud.seed, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, kindBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cloud.kind, gl.STATIC_DRAW);
    built = count;
  }

  /* one frame of the component's `frame()`, plus the site's pointer/scroll feel */
  function paint(dt) {
    if (!ok || !gl) return;
    var s = live;
    var speedScale = (s.speed / 50) * CALM * (1 + Math.min(1.1, scrollVel * 0.012));
    t = (t + dt * speedScale) % TIME_WRAP;
    if (built !== s.count) rebuild(s.count);

    var aspect = bw / Math.max(bh, 1);
    var halfH = bh * 0.5;

    glide(dt, 1);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(prog);
    gl.uniform1f(pu.uTime, t);
    gl.uniform1f(pu.uTilt, s.tilt + py * 0.0022);
    gl.uniform1f(pu.uDist, s.distance);
    gl.uniform1f(pu.uAspect, aspect);
    gl.uniform1f(pu.uHalfH, halfH);
    gl.uniform1f(pu.uDotSize, s.dotSize);
    gl.uniform1f(pu.uBlur, s.blur);
    gl.uniform1f(pu.uScatter, s.scatter);
    gl.uniform1f(pu.uCore, s.core);
    gl.uniform1f(pu.uArms, s.arms);
    gl.uniform1f(pu.uJetAmount, s.jetAmount);
    gl.uniform1f(pu.uJetLen, s.jetLen);
    gl.uniform1f(pu.uJetSpread, s.jetSpread);
    gl.uniform3fv(pu.uBase, s.base);
    gl.uniform3fv(pu.uAccent, s.accent);
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.enableVertexAttribArray(aSeed);
    gl.vertexAttribPointer(aSeed, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, kindBuf);
    gl.enableVertexAttribArray(aKind);
    gl.vertexAttribPointer(aKind, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, built);
    frames++;
  }

  function glide(dt, k) {
    var e = Math.min(1, dt * 2.4 * k);
    px += (tpx - px) * e;
    py += (tpy - py) * e;
    scrollVel *= 0.9;
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    var dt = last === 0 ? 0 : Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (document.hidden) return;
    paint(dt);
  }

  function init() {
    canvas = document.getElementById('accretion');
    if (!canvas) return;
    gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      canvas.parentNode.classList.add('is-fallback');
      return;
    }

    prog = link(gl, PARTICLE_VERT, PARTICLE_FRAG);
    pu = {
      uTime: gl.getUniformLocation(prog, 'uTime'),
      uTilt: gl.getUniformLocation(prog, 'uTilt'),
      uDist: gl.getUniformLocation(prog, 'uDist'),
      uAspect: gl.getUniformLocation(prog, 'uAspect'),
      uHalfH: gl.getUniformLocation(prog, 'uHalfH'),
      uDotSize: gl.getUniformLocation(prog, 'uDotSize'),
      uBlur: gl.getUniformLocation(prog, 'uBlur'),
      uScatter: gl.getUniformLocation(prog, 'uScatter'),
      uCore: gl.getUniformLocation(prog, 'uCore'),
      uArms: gl.getUniformLocation(prog, 'uArms'),
      uJetAmount: gl.getUniformLocation(prog, 'uJetAmount'),
      uJetLen: gl.getUniformLocation(prog, 'uJetLen'),
      uJetSpread: gl.getUniformLocation(prog, 'uJetSpread'),
      uBase: gl.getUniformLocation(prog, 'uBase'),
      uAccent: gl.getUniformLocation(prog, 'uAccent'),
    };
    aSeed = gl.getAttribLocation(prog, 'aSeed');
    aKind = gl.getAttribLocation(prog, 'aKind');

    seedBuf = gl.createBuffer();
    kindBuf = gl.createBuffer();

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);

    resize();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(resize).observe(canvas);
    }
    window.addEventListener('resize', resize);

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      ok = false;
      cancelAnimationFrame(raf);
      canvas.parentNode.classList.add('is-fallback');
    });

    window.addEventListener('mousemove', function (e) {
      if (reduce) return;
      tpx = (e.clientX / window.innerWidth - 0.5) * 12;
      tpy = (e.clientY / window.innerHeight - 0.5) * 10;
    }, { passive: true });

    window.addEventListener('scroll', function () {
      var y = window.pageYOffset || document.documentElement.scrollTop;
      scrollVel = reduce ? 0 : Math.min(60, Math.abs(y - lastScroll) * 0.8);
      lastScroll = y;
    }, { passive: true });

    ok = true;
    /* first frame by hand: if requestAnimationFrame never fires (hidden tab,
       a webview that pauses compositing) the disc is still on screen */
    resize();
    paint(0);
    raf = requestAnimationFrame(loop);
  }

  window.AccretionDisc = {
    init: init,
    get ok() { return ok; },
    get count() { return live.count; },
    get built() { return built; },
    get time() { return t; },
    get frames() { return frames; },
    get reduced() { return reduce; },
    get canvas() { return canvas; },
    get size() { return { w: bw, h: bh }; },
    config: CONFIG,
    /* change any prop at runtime, e.g. AccretionDisc.set({ speed: 40 }) */
    set: function (patch) {
      for (var k in patch) {
        if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
        CONFIG[k] = patch[k];
      }
      syncLive(CONFIG);
      return CONFIG;
    },
    get: function () { return JSON.parse(JSON.stringify(CONFIG)); },
    /* advance by hand — used by the verification pass, like StarFX.step() */
    step: function (dt) { paint(dt); },
    pause: function () { paused = true; cancelAnimationFrame(raf); },
    resume: function () {
      if (!paused) return;
      paused = false;
      last = 0;
      raf = requestAnimationFrame(loop);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
