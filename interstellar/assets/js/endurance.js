/* ═══════════════════════════════════════════════════════════════════════════
   endurance.js — real-time WebGL model of the Endurance + Gargantua
   Everything is generated in code: no .glb, no external assets.
   Ring: 12 detachable mission modules joined by tunnels, hung on a central
   core; the ring spins for artificial gravity.  three.js r155 (local copy).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var stage   = document.getElementById('stage');
  var canvas  = document.getElementById('shipCanvas');
  var wrapEl  = document.getElementById('viewer');
  var hostEl  = document.getElementById('hotspots');
  var readout = document.getElementById('readout');
  var hintEl  = document.getElementById('viewerHint');
  var fallEl  = document.getElementById('viewerFallback');

  function fail() {
    if (fallEl) fallEl.hidden = false;
    if (canvas) canvas.style.display = 'none';
  }
  if (!stage || !canvas) return;
  if (!window.THREE) { fail(); return; }

  var T = window.THREE;
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { fail(); return; }
  if (!renderer || !renderer.getContext()) { fail(); return; }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Reduced motion here means “calmer”, not “frozen”: the model still turns,
     just slowly, and the flashing/flickering extras are switched off. */
  var calm = reduce ? 0.22 : 1;

  /* ── renderer / scene / camera ─────────────────────────────────────────── */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if ('outputColorSpace' in renderer && T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;

  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(40, 1, 0.1, 900);

  /* orbital camera state (damped) */
  var CAM0 = { theta: -0.85, phi: 1.02, radius: 42 };
  var cam = {
    theta: CAM0.theta, phi: CAM0.phi, radius: CAM0.radius,
    tTheta: CAM0.theta, tPhi: CAM0.phi, tRadius: CAM0.radius,
    target: new T.Vector3(0, 0, 0),
    tTarget: new T.Vector3(0, 0, 0)
  };

  /* ── materials ────────────────────────────────────────────────────────────
     metals need something to reflect or they read as black, so the scene gets
     a small procedural environment: cold starlight with Gargantua's warm glow */
  function envTexture() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0d1a2c');
    grad.addColorStop(.42, '#060a12');
    grad.addColorStop(.72, '#0d0f14');
    grad.addColorStop(1, '#020306');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
    var warm = g.createRadialGradient(150, 152, 4, 150, 152, 155);
    warm.addColorStop(0, 'rgba(255,196,130,.95)');
    warm.addColorStop(.35, 'rgba(255,140,60,.34)');
    warm.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = warm; g.fillRect(0, 0, 512, 256);
    var cool = g.createRadialGradient(380, 66, 6, 380, 66, 175);
    cool.addColorStop(0, 'rgba(196,224,255,.8)');
    cool.addColorStop(.45, 'rgba(120,170,255,.16)');
    cool.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cool; g.fillRect(0, 0, 512, 256);
    for (var i = 0; i < 170; i++) {                     // pinpoint specular stars
      g.fillStyle = 'rgba(255,255,255,' + (0.18 + Math.random() * 0.5).toFixed(2) + ')';
      g.beginPath();
      g.arc(Math.random() * 512, Math.random() * 256, Math.random() * 1.2, 0, 6.283);
      g.fill();
    }
    var tex = new T.CanvasTexture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  var envSrc = envTexture();
  if (T.PMREMGenerator) {
    try {
      var pmrem = new T.PMREMGenerator(renderer);
      if (pmrem.compileEquirectangularShader) pmrem.compileEquirectangularShader();
      scene.environment = pmrem.fromEquirectangular(envSrc).texture;
      envSrc.dispose();
      pmrem.dispose();
    } catch (e) { scene.environment = envSrc; }
  } else {
    scene.environment = envSrc;
  }
  var matHull   = new T.MeshStandardMaterial({ color: 0xc2ccd9, metalness: .58, roughness: .42, envMapIntensity: 1.05 });
  var matPanel  = new T.MeshStandardMaterial({ color: 0x707a87, metalness: .45, roughness: .58, envMapIntensity: .85 });
  var matDark   = new T.MeshStandardMaterial({ color: 0x39404a, metalness: .4,  roughness: .7,  envMapIntensity: .7 });
  var matDetail = new T.MeshStandardMaterial({ color: 0xd8e0ea, metalness: .72, roughness: .3,  envMapIntensity: 1.15 });
  var matGlow   = new T.MeshBasicMaterial({ color: 0xa9d8ff });
  var matGlowW  = new T.MeshBasicMaterial({ color: 0xffd0a0 });
  var matBeacon = new T.MeshBasicMaterial({ color: 0xff5a4a });
  var matPlume  = new T.MeshBasicMaterial({ color: 0x8fd2ff, transparent: true, opacity: .55, blending: T.AdditiveBlending, depthWrite: false });
  var wireMats  = [matHull, matPanel, matDetail, matDark];

  /* ── groups ───────────────────────────────────────────────────────────── */
  var root     = new T.Group();            // everything that bobs
  root.rotation.x = 0.2;                   // 3/4 stance: the ring reads as a wheel
  var spinner  = new T.Group();            // spins around the ring axis (Z)
  var backdrop = new T.Group();            // Gargantua + its light, locked to the
  scene.add(backdrop);                     // camera azimuth so it never leaves frame
  var ship     = new T.Group();            // static body: hub, core, ports
  var ringGrp  = new T.Group();            // 12 modules + tunnels
  var craftGrp = new T.Group();            // docked Ranger / Lander
  spinner.add(ship); spinner.add(ringGrp); spinner.add(craftGrp);
  root.add(spinner);
  scene.add(root);

  var R = 16;               // ring radius  (~65 m across in-universe)
  var N = 12;               // twelve modules — one per hour on a watch face

  /* ── the 12 mission modules ───────────────────────────────────────────── */
  var modules = [];
  for (var i = 0; i < N; i++) {
    var a = (i / N) * Math.PI * 2;
    var m = new T.Group();
    m.rotation.z = a;
    m.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);

    // main pressurised box (radial x, tangential y, axial z)
    var hull = new T.Mesh(new T.BoxGeometry(2.2, 5.5, 2.6), matHull);
    m.add(hull);

    // darker radiator caps fore and aft
    var capF = new T.Mesh(new T.BoxGeometry(2.26, 5.56, 0.22), matPanel);
    capF.position.z = 1.36; m.add(capF);
    var capA = capF.clone(); capA.position.z = -1.36; m.add(capA);

    // spine rib across the outer face
    var rib = new T.Mesh(new T.BoxGeometry(0.1, 5.7, 0.34), matDetail);
    rib.position.x = 1.12; m.add(rib);

    // lit windows on the outboard face
    for (var w = -1; w <= 1; w++) {
      var win = new T.Mesh(new T.BoxGeometry(0.06, 1.35, 0.42), matGlow);
      win.position.set(1.13, w * 1.75, 0);
      m.add(win);
    }

    // RCS thruster blocks
    var q1 = new T.Mesh(new T.BoxGeometry(0.42, 0.42, 0.42), matDark);
    q1.position.set(0.7, 2.55, 1.5); m.add(q1);
    var q2 = q1.clone(); q2.position.z = -1.5; m.add(q2);

    // deployable radiator on a few modules only (adds asymmetry like the film)
    if (i % 4 === 1) {
      var panel = new T.Mesh(new T.BoxGeometry(0.07, 4.1, 1.1), matPanel);
      panel.position.set(-1.5, 0, 0); m.add(panel);
      var arm = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.9, 8), matDetail);
      arm.rotation.z = Math.PI / 2; arm.position.set(-1.15, 0, 0); m.add(arm);
    }

    // attitude antenna
    if (i % 3 === 0) {
      var ant = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.5, 6), matDetail);
      ant.position.set(0, -2.7, 1.1); ant.rotation.x = -0.4; m.add(ant);
    }

    ringGrp.add(m);
    modules.push({ g: m, base: m.position.clone(), hull: hull });
  }

  /* ── tunnels linking module to module ─────────────────────────────────── */
  var tunnels = new T.Group();
  for (var j = 0; j < N; j++) {
    var am = ((j + .5) / N) * Math.PI * 2;
    var t = new T.Group();
    t.rotation.z = am;
    t.position.set(Math.cos(am) * R, Math.sin(am) * R, 0);
    var tube = new T.Mesh(new T.CylinderGeometry(0.44, 0.44, 3.5, 14), matHull);
    t.add(tube);
    var collar = new T.Mesh(new T.TorusGeometry(0.52, 0.11, 8, 18), matDetail);
    collar.rotation.x = Math.PI / 2;
    t.add(collar);
    tunnels.add(t);
  }
  ringGrp.add(tunnels);

  /* ── spokes: 4 main struts + 4 diagonal braces ────────────────────────── */
  var spokes = new T.Group();
  for (var s = 0; s < 4; s++) {
    var ang = s * Math.PI / 2, len = R - 1.1;
    var g = new T.Group();
    g.rotation.z = ang;
    var beam = new T.Mesh(new T.BoxGeometry(len, 0.52, 0.78), matHull);
    beam.position.set(len / 2 + 0.9, 0, 0);
    g.add(beam);
    var rail = new T.Mesh(new T.BoxGeometry(len, 0.1, 0.1), matDetail);
    rail.position.set(len / 2 + 0.9, 0.42, 0.44);
    g.add(rail);
    var rail2 = rail.clone(); rail2.position.y = -0.42; g.add(rail2);
    spokes.add(g);
  }
  for (var b = 0; b < 4; b++) {
    var ab = b * Math.PI / 2 + Math.PI / 4;
    var gb = new T.Group();
    gb.rotation.z = ab;
    var brace = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, R - 3.4, 8), matPanel);
    brace.rotation.z = Math.PI / 2;
    brace.position.set((R + 2.4) / 2, 0, 0);
    gb.add(brace);
    spokes.add(gb);
  }
  ship.add(spokes);

  /* ── central core, hub, docking port, engine cluster ──────────────────── */
  var hub = new T.Mesh(new T.CylinderGeometry(2.7, 2.7, 4.6, 32), matHull);
  hub.rotation.x = Math.PI / 2;
  ship.add(hub);

  var hubRing = new T.Mesh(new T.TorusGeometry(2.75, 0.2, 10, 40), matDetail);
  ship.add(hubRing);
  var hubRing2 = new T.Mesh(new T.TorusGeometry(2.75, 0.12, 8, 40), matPanel);
  hubRing2.position.z = 2.2; ship.add(hubRing2);

  // long axial spine
  var spine = new T.Mesh(new T.CylinderGeometry(1.35, 1.35, 15.5, 26), matHull);
  spine.rotation.x = Math.PI / 2;
  spine.position.z = -2.4;
  ship.add(spine);

  // amidships equipment pods
  for (var p = 0; p < 4; p++) {
    var pa = p * Math.PI / 2 + Math.PI / 4;
    var pod = new T.Mesh(new T.BoxGeometry(1.05, 1.05, 3.4), matPanel);
    pod.position.set(Math.cos(pa) * 1.9, Math.sin(pa) * 1.9, -1.4);
    ship.add(pod);
  }

  // forward docking assembly
  var dockRing = new T.Mesh(new T.TorusGeometry(2.0, 0.26, 10, 32), matDetail);
  dockRing.position.z = 5.2; ship.add(dockRing);
  var dockRing2 = new T.Mesh(new T.TorusGeometry(2.0, 0.16, 8, 32), matPanel);
  dockRing2.position.z = 6.4; ship.add(dockRing2);
  var dockCone = new T.Mesh(new T.CylinderGeometry(1.15, 2.15, 2.6, 20, 1, true), matHull);
  dockCone.rotation.x = -Math.PI / 2;
  dockCone.position.z = 7.6; ship.add(dockCone);
  var dockHatch = new T.Mesh(new T.CircleGeometry(1.1, 24), matDark);
  dockHatch.position.z = 8.8; ship.add(dockHatch);

  // comms dish + mast
  var mast = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 4.2, 8), matDetail);
  mast.position.set(0, 3.6, 1.2); ship.add(mast);
  var dish = new T.Mesh(new T.SphereGeometry(1.5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2.4), matDetail);
  dish.material = new T.MeshStandardMaterial({ color: 0xd6dee8, metalness: .35, roughness: .85, side: T.DoubleSide });
  dish.position.set(0, 5.7, 1.2);
  dish.rotation.set(-0.55, 0, 0);
  ship.add(dish);
  var feed = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.5, 6), matDark);
  feed.position.set(0, 5.0, 0.9); ship.add(feed);

  // aft engine cluster: 1 main + 4 outboard nozzles
  var engMain = new T.Mesh(new T.CylinderGeometry(1.05, 1.75, 2.6, 24, 1, true), matPanel);
  engMain.rotation.x = Math.PI / 2; engMain.position.z = -10.9; ship.add(engMain);
  var engGlow = new T.Mesh(new T.CircleGeometry(0.95, 20), matGlow);
  engGlow.position.z = -12.1; engGlow.rotation.y = Math.PI; ship.add(engGlow);
  for (var e = 0; e < 4; e++) {
    var ea = e * Math.PI / 2 + Math.PI / 4;
    var noz = new T.Mesh(new T.CylinderGeometry(0.5, 0.82, 1.7, 16, 1, true), matPanel);
    noz.rotation.x = Math.PI / 2;
    noz.position.set(Math.cos(ea) * 1.7, Math.sin(ea) * 1.7, -9.4);
    ship.add(noz);
  }

  // engine plumes (additive cones)
  var plumes = [];
  var plumeGeo = new T.ConeGeometry(0.85, 5.2, 16, 1, true);
  for (var pl = 0; pl < 5; pl++) {
    var ee = pl === 0 ? { x: 0, y: 0 } : { x: Math.cos((pl - 1) * Math.PI / 2 + Math.PI / 4) * 1.7, y: Math.sin((pl - 1) * Math.PI / 2 + Math.PI / 4) * 1.7 };
    var plume = new T.Mesh(plumeGeo, matPlume);
    plume.rotation.x = Math.PI / 2;
    plume.position.set(ee.x, ee.y, -(pl === 0 ? 14.6 : 12.4));
    ship.add(plume);
    plumes.push(plume);
  }

  // navigation beacons
  var beaconA = new T.Mesh(new T.SphereGeometry(0.18, 10, 8), matBeacon);
  beaconA.position.set(0, 3.1, 0); ship.add(beaconA);
  var beaconB = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), new T.MeshBasicMaterial({ color: 0x9fffb5 }));
  beaconB.position.set(0, -3.1, 0); ship.add(beaconB);

  /* ── docked Ranger at the forward port ────────────────────────────────── */
  function buildRanger(scale) {
    var g = new T.Group();
    var body = new T.Mesh(new T.BoxGeometry(1.45, 1.05, 4.4), matHull); g.add(body);
    var belly = new T.Mesh(new T.BoxGeometry(1.0, 0.34, 3.4), matPanel);
    belly.position.y = -0.66; g.add(belly);
    var nose = new T.Mesh(new T.CylinderGeometry(0.32, 0.74, 1.5, 6), matDetail);
    nose.rotation.x = Math.PI / 2; nose.position.z = 2.85; g.add(nose);
    var cock = new T.Mesh(new T.BoxGeometry(0.95, 0.1, 0.5), matGlow);
    cock.position.set(0, 0.55, 1.7); g.add(cock);
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      var wing = new T.Mesh(new T.BoxGeometry(2.5, 0.12, 1.5), matPanel);
      wing.position.set(sgn * 1.5, -0.1, -0.5);
      wing.rotation.z = sgn * 0.06; wing.rotation.y = sgn * 0.24;
      g.add(wing);
      var fin = new T.Mesh(new T.BoxGeometry(0.1, 1.05, 1.25), matPanel);
      fin.position.set(sgn * 0.78, 0.62, -1.5); fin.rotation.z = sgn * 0.22;
      g.add(fin);
      var tip = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), matBeacon);
      tip.position.set(sgn * 2.6, -0.1, -0.5); g.add(tip);
    }
    var bell = new T.Mesh(new T.CylinderGeometry(0.45, 0.6, 0.8, 14, 1, true), matPanel);
    bell.rotation.x = Math.PI / 2; bell.position.z = -2.5; g.add(bell);
    var plume = new T.Mesh(new T.ConeGeometry(0.42, 2.1, 12, 1, true), matPlume);
    plume.rotation.x = -Math.PI / 2; plume.position.z = -3.9; g.add(plume);
    plumes.push(plume);
    g.scale.setScalar(scale || 1);
    return g;
  }

  var ranger = buildRanger(1);
  ranger.position.set(0, 0, 10.6);
  craftGrp.add(ranger);

  /* Lander, docked radially on the ring (module 3) */
  var lander = new T.Group();
  var lBody = new T.Mesh(new T.BoxGeometry(1.7, 1.5, 3.4), matHull); lander.add(lBody);
  var lTop = new T.Mesh(new T.BoxGeometry(1.2, 0.5, 2.2), matPanel); lTop.position.y = 0.95; lander.add(lTop);
  var lNose = new T.Mesh(new T.CylinderGeometry(0.4, 0.85, 1.4, 6), matDetail);
  lNose.rotation.x = Math.PI / 2; lNose.position.z = 2.3; lander.add(lNose);
  for (var lg = 0; lg < 4; lg++) {
    var lx = (lg % 2 ? 1 : -1), lz = (lg < 2 ? 1 : -1);
    var leg = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 1.6, 6), matDetail);
    leg.position.set(lx * 0.75, -0.95, lz * 1.1);
    leg.rotation.z = lx * 0.35; leg.rotation.x = lz * 0.28;
    lander.add(leg);
    var foot = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 0.12, 10), matPanel);
    foot.position.set(lx * 1.12, -1.65, lz * 1.42); lander.add(foot);
    var bell2 = new T.Mesh(new T.CylinderGeometry(0.28, 0.4, 0.6, 10, 1, true), matPanel);
    bell2.rotation.x = Math.PI / 2; bell2.position.set(lx * 0.45, -0.5, -1.9); lander.add(bell2);
  }
  var lPort = new T.Group();
  lPort.rotation.z = (3 / N) * Math.PI * 2;
  lPort.position.set(Math.cos((3 / N) * Math.PI * 2) * R, Math.sin((3 / N) * Math.PI * 2) * R, 2.6);
  lander.rotation.x = Math.PI / 2;          // stand it on the ring plane
  lander.scale.setScalar(1.05);
  lPort.add(lander);
  craftGrp.add(lPort);

  /* ── Gargantua: black hole + accretion disk + lensed ring ─────────────── */
  function diskTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 512;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(256, 256, 30, 256, 256, 254);
    grad.addColorStop(0.00, 'rgba(255,255,255,0)');
    grad.addColorStop(0.24, 'rgba(255,244,224,0.92)');
    grad.addColorStop(0.34, 'rgba(255,205,140,0.80)');
    grad.addColorStop(0.50, 'rgba(255,150,70,0.46)');
    grad.addColorStop(0.70, 'rgba(196,88,32,0.20)');
    grad.addColorStop(0.88, 'rgba(120,54,24,0.07)');
    grad.addColorStop(1.00, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    // hot filaments so the disk is not a perfect gradient
    g.globalCompositeOperation = 'lighter';
    for (var k = 0; k < 900; k++) {
      var ang = Math.random() * Math.PI * 2;
      var r0 = 74 + Math.random() * 170;
      var wob = 6 + Math.random() * 40;
      g.beginPath();
      g.strokeStyle = 'rgba(255,' + (200 + Math.floor(Math.random() * 55)) + ',' + (150 + Math.floor(Math.random() * 90)) + ',' + (0.02 + Math.random() * 0.10).toFixed(3) + ')';
      g.lineWidth = 0.6 + Math.random() * 2.4;
      g.arc(256, 256, r0, ang, ang + 0.05 + Math.random() * 0.5);
      g.stroke();
      if (wob) { /* keeps the loop cheap but varied */ }
    }
    var tex = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;
    return tex;
  }

  function glowTexture(inner, outer) {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    var tex = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  var garg = new T.Group();
  /* placed in backdrop space: ~13° off the view axis on the ship's left, so at
     every orbit angle the ring is seen against the accretion disk — and the dish
     stays inside the ~25° horizontal half-field of view */
  garg.position.set(-102, 15, 24);
  backdrop.add(garg);

  // the hole itself: pure black, so stars vanish behind it
  var hole = new T.Mesh(new T.SphereGeometry(5.4, 48, 32), new T.MeshBasicMaterial({ color: 0x000000 }));
  garg.add(hole);

  // accretion disk — mapped with polar UVs so the radial gradient becomes a ring
  var diskTex = diskTexture();
  var diskMat = new T.MeshBasicMaterial({ map: diskTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, opacity: 0.95 });
  var disk = new T.Mesh(new T.RingGeometry(6.6, 15.4, 128, 1), diskMat);
  disk.rotation.x = -Math.PI / 2 + 0.16;
  garg.add(disk);
  var diskFar = disk.clone();
  diskFar.material = diskMat.clone();
  diskFar.material.opacity = 0.13;
  diskFar.scale.setScalar(1.5);
  garg.add(diskFar);

  // lensed ring: light from behind the hole bent up and over it
  var lensMat = new T.MeshBasicMaterial({ color: 0xffc890, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false });
  var lens = new T.Mesh(new T.TorusGeometry(6.1, 0.3, 10, 128), lensMat);
  lens.rotation.x = Math.PI / 2 + 0.16;
  lens.scale.set(1, 1, 1.12);
  garg.add(lens);

  var halo = new T.Sprite(new T.SpriteMaterial({
    map: glowTexture('rgba(255,186,120,0.85)', 'rgba(255,120,40,0)'),
    transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.5
  }));
  halo.scale.set(26, 26, 1);
  halo.material.opacity = 0.22;
  garg.add(halo);

  /* ── starfield + drifting dust ────────────────────────────────────────── */
  var stars = new T.Group();
  (function buildStars() {
    var count = 3400;
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    var c = new T.Color();
    for (var i2 = 0; i2 < count; i2++) {
      var r = 150 + Math.random() * 190;
      var th = Math.random() * Math.PI * 2;
      var ph = Math.acos(2 * Math.random() - 1);
      pos[i2 * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i2 * 3 + 1] = r * Math.cos(ph);
      pos[i2 * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      var roll = Math.random();
      if (roll > 0.9)      c.setHex(0xffd7b0);
      else if (roll > 0.75) c.setHex(0xbcd8ff);
      else                  c.setHex(0xffffff);
      var b = 0.55 + Math.random() * 0.45;
      col[i2 * 3] = c.r * b; col[i2 * 3 + 1] = c.g * b; col[i2 * 3 + 2] = c.b * b;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    var mat = new T.PointsMaterial({ size: 1.5, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: .95, depthWrite: false, blending: T.AdditiveBlending });
    stars.add(new T.Points(geo, mat));
  })();
  scene.add(stars);

  var dust = (function buildDust() {
    var count = 700;
    var pos = new Float32Array(count * 3);
    for (var i3 = 0; i3 < count; i3++) {
      pos[i3 * 3] = (Math.random() - .5) * 130;
      pos[i3 * 3 + 1] = (Math.random() - .5) * 95;
      pos[i3 * 3 + 2] = (Math.random() - .5) * 130;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var mat = new T.PointsMaterial({ size: .38, color: 0xcfe4ff, transparent: true, opacity: .5, depthWrite: false, blending: T.AdditiveBlending });
    var pts = new T.Points(geo, mat);
    scene.add(pts);
    return pts;
  })();

  /* ── lights: cold key from the stars, warm rim from Gargantua ─────────── */
  scene.add(new T.AmbientLight(0x2b3c52, .8));
  scene.add(new T.HemisphereLight(0x5d7ba1, 0x0a0d14, .5));
  var key = new T.DirectionalLight(0xe8f2ff, 2.6); key.position.set(28, 36, 24); scene.add(key);
  var fill = new T.DirectionalLight(0x7d9cc4, 1.0); fill.position.set(-30, -14, -18); scene.add(fill);
  var bottom = new T.DirectionalLight(0x8fb6ff, .5); bottom.position.set(6, -34, 12); scene.add(bottom);
  /* Gargantua is the key *warm* source, and it lives in the backdrop group, so the
     amber rim on the hull always comes from the side the disk is on */
  var rimWarm = new T.DirectionalLight(0xffb976, 1.55); rimWarm.position.copy(garg.position); backdrop.add(rimWarm);
  var rimSoft = new T.DirectionalLight(0xffd8ae, .5); rimSoft.position.set(-52, -10, 30); backdrop.add(rimSoft);
  /* the targets ride along in the same group, so the light direction stays put
     relative to the camera instead of sweeping around with the orbit */
  backdrop.add(rimWarm.target);
  backdrop.add(rimSoft.target);

  /* ── hotspots ─────────────────────────────────────────────────────────── */
  var HOTSPOTS = [
    {
      key: 'module', label: 'โมดูลภารกิจ ×12',
      pos: new T.Vector3(R * Math.cos(Math.PI / 6), R * Math.sin(Math.PI / 6), 1.8),
      title: 'โมดูลภารกิจ',
      body: 'กล่องอัดความดันสิบสองกล่อง แต่ละกล่องเป็นทั้งที่อยู่ ห้องแล็บ และคลังเสบียงในตัว ประกอบกันเป็นวงแหวน แต่ถ้าถอดออก ก็ลงจอดตั้งอาณานิคมบนดาวที่เลือกไว้ได้ทีละกล่อง แผน บี จึงอยู่ในกล่องเหล่านี้',
      specs: [['จำนวน', '12 กล่อง'], ['วงแหวน', 'กว้าง 65 ม.'], ['สถานะ', 'ถอดแยกได้'], ['ลูกเรือ', '2–4 คน/กล่อง']]
    },
    {
      key: 'hub', label: 'แกนกลาง',
      pos: new T.Vector3(0, 0, 0),
      title: 'แกนกลางและสันยาน',
      body: 'หัวใจของโครงสร้าง: แกนอัดความดันที่แขนทั้งสี่มาบรรจบ แล้วต่อกับสันยานยาวที่พาเครื่องยนต์ไปด้านท้ายและชุดเทียบยานไปด้านหน้า พอวงแหวนหมุน แกนนี้ก็กลายเป็นแกนของแรงโน้มถ่วงเทียม',
      specs: [['แขนรับ', '4 เส้น + เสาเฉียง 4'], ['แรงโน้มถ่วง', 'จากการหมุนวงแหวน'], ['สันยาน', 'ท่อส่งกำลัง'], ['ทางเดิน', 'อัดความดัน']]
    },
    {
      key: 'dock', label: 'ช่องเทียบยาน',
      pos: new T.Vector3(0, 0, 10.5),
      title: 'ชุดเทียบยานด้านหน้า',
      body: 'ช่องด้านหน้ารับยานเรนเจอร์ ยานสองท่อนที่บินได้ทั้งในบรรยากาศและในสุญญากาศ การเทียบกับวงแหวนที่เครื่องดับสนิทต้องหมุนให้ตรงจังหวะ — ท่าที่คูเปอร์ต้องจ่ายราคาแพงที่สุดในองก์ที่สาม',
      specs: [['เรนเจอร์', 'ยานสำรวจบรรยากาศ'], ['วิธีเข้าเทียบ', 'หมุนตามจังหวะเดียวกัน'], ['แลนเดอร์', 'ติดตั้งที่วงแหวน'], ['ผู้ช่วย', 'TARS ประจำยาน']]
    },
    {
      key: 'engine', label: 'ชุดเครื่องยนต์',
      pos: new T.Vector3(0, 0, -13),
      title: 'ระบบขับเคลื่อน',
      body: 'หัวจรวดแกนหลักล้อมด้วยหัวฉีดด้านนอกอีกสี่ตัว กำลังพอจะดันเอ็มบริโอ 5,000 ฟองกับมนุษย์ไม่กี่คนข้ามรูหนอน และเบิร์นหนักพอจะหมุนตามการ์กันชัวเพื่อสลิงช็อต',
      specs: [['หัวจรวดหลัก', '1 ตัวที่แกน'], ['หัวฉีดนอก', '4 ตัว'], ['เชื้อเพลิง', 'ไฮโดรเจน เสริมจากดาว'], ['การเบิร์น', 'สลิงช็อต 2 นาที']]
    },
    {
      key: 'radiator', label: 'ระบายความร้อน/สื่อสาร',
      pos: new T.Vector3(R * Math.cos(Math.PI * 1.17), R * Math.sin(Math.PI * 1.17), 2.4),
      title: 'ระบายความร้อนและสายสื่อสาร',
      body: 'ครีบระบายความร้อนแผ่ความร้อนจากเครื่องปฏิกรณ์ออกสู่ท้องฟ้าสีดำสนิท ส่วนจานสายอากาศแลกสัญญาณกับโลกผ่านช่องทางที่ใช้เวลาหลายปีกว่าจะปิดรอบ ข้อความแรกที่เมิร์ฟส่งมาคือข้อความที่คูเปอร์พลาดไปถึงยี่สิบสามปี',
      specs: [['ครีบ', '4 แผ่นกางได้'], ['จาน', 'เกนสูง'], ['ดีเลย์', 'หลายปีต่อเที่ยว'], ['สัญญาณนำทาง', '1 เฮิรตซ์']]
    }
  ];

  var spotEls = {};
  if (hostEl) {
    HOTSPOTS.forEach(function (h) {
      var btn = document.createElement('button');
      btn.className = 'hotspot';
      btn.type = 'button';
      btn.innerHTML = '<i></i><span>' + h.label + '</span>';
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        select(h);
      });
      hostEl.appendChild(btn);
      spotEls[h.key] = btn;
    });
  }

  function dlFrom(specs) {
    return '<dl class="dl dl--mono">' + specs.map(function (s) {
      return '<div><dt>' + s[0] + '</dt><dd>' + s[1] + '</dd></div>';
    }).join('') + '</dl>';
  }

  function select(h) {
    if (!readout) return;
    readout.innerHTML = '<h3>' + h.title + '</h3><p>' + h.body + '</p>' + dlFrom(h.specs);
    for (var k in spotEls) spotEls[k].classList.remove('is-active');
    if (spotEls[h.key]) spotEls[h.key].classList.add('is-active');
    // gently pull the camera toward the subsystem
    cam.tTarget.copy(h.pos).multiplyScalar(0.55);
    cam.tRadius = Math.min(cam.tRadius, 38);
    focusKey = h.key;
  }

  function resetReadout() {
    if (!readout) return;
    for (var k in spotEls) spotEls[k].classList.remove('is-active');
    readout.innerHTML =
      '<h3>ยานเอ็นดูแรนซ์</h3>' +
      '<p>คลิกจุดบนโมเดลเพื่อดูระบบย่อยของยาน</p>' +
      '<dl class="dl dl--mono">' +
      '<div><dt>เส้นผ่านศูนย์กลางวงแหวน</dt><dd>65 ม.</dd></div>' +
      '<div><dt>จำนวนโมดูล</dt><dd>12 (ถอดได้)</dd></div>' +
      '<div><dt>แรงโน้มถ่วง</dt><dd>จากการหมุนวงแหวน</dd></div>' +
      '<div><dt>แรงบันดาลใจ</dt><dd>หน้าปัดนาฬิกา 12 ชั่วโมง</dd></div>' +
      '<div><dt>ยานที่บรรทุก</dt><dd>เรนเจอร์ · แลนเดอร์</dd></div>' +
      '</dl>';
  }

  /* ── scroll drive: how far the visitor has scrolled through this section ──
     0 = section entering, 1 = section leaving. The ring spins harder and the
     camera pulls in as you pass through, so the model animates with the scroll */
  var scrollDrive = 0;
  function setScroll(p) {
    scrollDrive = Math.max(0, Math.min(1, isNaN(p) ? 0 : p));
  }

  /* ── toggles ──────────────────────────────────────────────────────────── */
  var flags = { spin: true, orbit: true, wire: false, explode: false, stars: true, labels: true };
  var explT = 0;

  function syncToggle(key, on) {
    var el = document.querySelector('.tgl[data-tgl="' + key + '"]');
    if (el) el.classList.toggle('is-on', !!on);
  }

  Array.prototype.forEach.call(document.querySelectorAll('.tgl[data-tgl]'), function (btn) {
    btn.addEventListener('click', function () {
      var k = btn.getAttribute('data-tgl');
      flags[k] = !flags[k];
      syncToggle(k, flags[k]);
      if (k === 'stars') stars.visible = flags.stars;
      if (k === 'labels' && hostEl) hostEl.style.display = flags.labels ? '' : 'none';
      if (k === 'wire') {
        wireMats.forEach(function (m) { m.wireframe = flags.wire; });
      }
      if (k === 'explode') {
        wireMats.forEach(function (m) {
          m.transparent = flags.explode;
          m.needsUpdate = true;
        });
        if (flags.explode) resetReadout();
      }
    });
  });

  var resetBtn = document.getElementById('btnResetView');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      cam.tTheta = CAM0.theta; cam.tPhi = CAM0.phi; cam.tRadius = CAM0.radius; cam.tTarget.set(0, 0, 0);
      flags.explode = false; syncToggle('explode', false);
      wireMats.forEach(function (m) { m.wireframe = false; m.transparent = false; });
      syncToggle('wire', false); flags.wire = false;
      resetReadout();
    });
  }

  /* ── pointer orbit + zoom ─────────────────────────────────────────────── */
  var dragging = false, lastX = 0, lastY = 0, interacted = false;
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('.hotspot')) return;  // let markers be clicked
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    if (stage.setPointerCapture) { try { stage.setPointerCapture(e.pointerId); } catch (err) {} }
  });
  window.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    cam.tTheta -= (e.clientX - lastX) * 0.0062;
    cam.tPhi = Math.max(0.22, Math.min(2.75, cam.tPhi - (e.clientY - lastY) * 0.0055));
    lastX = e.clientX; lastY = e.clientY;
    noteInteraction();
  });
  window.addEventListener('pointerup', function () { dragging = false; });
  window.addEventListener('pointercancel', function () { dragging = false; });
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.tRadius = Math.max(20, Math.min(96, cam.tRadius * (1 + e.deltaY * 0.0011)));
    noteInteraction();
  }, { passive: false });

  function noteInteraction() {
    if (interacted || !hintEl) return;
    interacted = true;
    hintEl.classList.add('is-hidden');
  }
  if (hintEl) setTimeout(function () { hintEl.classList.add('is-hidden'); }, 9000);

  /* ── sizing ───────────────────────────────────────────────────────────── */
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    if (renderer.getSize(new T.Vector2()).width === w && canvas.height === Math.round(h * renderer.getPixelRatio())) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);

  /* ── render loop ──────────────────────────────────────────────────────── */
  var visible = true;
  if (window.IntersectionObserver && wrapEl) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }, { rootMargin: '120px' }).observe(wrapEl);
  }
  var clock = new T.Clock();
  var tmp = new T.Vector3();
  var focusKey = null;

  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    var t = clock.elapsedTime;

    // camera damping (scroll adds a gentle push inward and lifts the view a little)
    if (flags.orbit && !dragging) cam.tTheta += dt * 0.075 * calm * (1 + scrollDrive * 2.2);
    cam.theta += (cam.tTheta - cam.theta) * Math.min(1, dt * 4);
    cam.phi += (cam.tPhi - cam.phi) * Math.min(1, dt * 4);
    cam.radius += (cam.tRadius - cam.radius) * Math.min(1, dt * 3);
    cam.target.lerp(cam.tTarget, Math.min(1, dt * 2.2));
    var effRadius = cam.radius * (1 - scrollDrive * 0.2);
    var effPhi = cam.phi + scrollDrive * 0.2;
    var sp = Math.sin(effPhi);
    camera.position.set(
      effRadius * sp * Math.cos(cam.theta),
      effRadius * Math.cos(effPhi),
      effRadius * sp * Math.sin(cam.theta)
    );
    camera.lookAt(cam.target);

    // ring spin = artificial gravity (and it spins 4.5x faster while scrolling)
    if (flags.spin) spinner.rotation.z += dt * 0.115 * calm * (1 + scrollDrive * 4.5);
    root.position.y = Math.sin(t * 0.42 * calm) * (reduce ? 0.18 : 0.55);
    root.rotation.x = Math.sin(t * 0.23 * calm) * 0.02 * calm;
    root.rotation.y = Math.cos(t * 0.19 * calm) * 0.02 * calm;

    // exploded view: modules drift outward, hulls go translucent
    var target = flags.explode ? 1 : 0;
    explT += (target - explT) * Math.min(1, dt * 3.2);
    for (var i = 0; i < modules.length; i++) {
      var m = modules[i];
      m.g.position.copy(m.base).multiplyScalar(1 + explT * 0.2);
      m.g.position.z = m.base.z + explT * (i % 2 ? 2.4 : -2.4);
    }
    tunnels.scale.setScalar(1 + explT * 0.08);
    tunnels.visible = explT < 0.85;
    var op = 1 - explT * 0.62;
    matHull.opacity = op; matPanel.opacity = Math.max(0.3, op); matDetail.opacity = op;

    // engine plume flicker (steady when the visitor asked for reduced motion)
    for (var pI = 0; pI < plumes.length; pI++) {
      var fl = reduce ? 0.86 : 0.72 + Math.sin(t * 11 + pI * 1.7) * 0.12 + Math.random() * 0.1;
      plumes[pI].scale.set(1, fl * (0.9 + explT * 0.1), 1);
      plumes[pI].material.opacity = reduce ? 0.42 : 0.35 + Math.sin(t * 7 + pI) * 0.12;
    }

    // beacons (held steady rather than blinking for reduced motion)
    var blink = reduce ? 0.85 : ((Math.sin(t * 3.1) > 0.4) ? 1 : 0.12);
    beaconA.material.color.setRGB(1 * blink, 0.35 * blink, 0.3 * blink);
    var blink2 = reduce ? 0.85 : ((Math.sin(t * 3.1 + 2) > 0.4) ? 1 : 0.12);
    beaconB.material.color.setRGB(0.62 * blink2, 1 * blink2, 0.7 * blink2);

    // Gargantua: the disk turns, light from the far side climbs over the hole
    disk.rotation.z -= dt * 0.22 * calm;
    diskFar.rotation.z += dt * 0.06 * calm;
    lens.material.opacity = 0.46 + (reduce ? 0 : Math.sin(t * 0.9) * 0.08);
    halo.material.opacity = 0.45 + (reduce ? 0 : Math.sin(t * 0.7 + 1) * 0.06);
    stars.rotation.y += dt * 0.006 * calm;
    stars.rotation.x += dt * 0.0022 * calm;
    dust.rotation.y -= dt * 0.012 * calm;
    dust.rotation.z += dt * 0.004 * calm;

    // keep Gargantua + its light at a fixed angle behind the camera
    backdrop.rotation.y = -cam.theta;

    // hotspot projection
    spinner.updateMatrixWorld();
    for (var hI = 0; hI < HOTSPOTS.length; hI++) {
      var hs = HOTSPOTS[hI], el = spotEls[hs.key];
      if (!el) continue;
      if (!flags.labels) { el.classList.remove('is-visible'); continue; }
      tmp.copy(hs.pos);
      spinner.localToWorld(tmp);
      var dist = tmp.distanceTo(camera.position);
      tmp.project(camera);
      var onScreen = tmp.z < 1 && tmp.x > -1.25 && tmp.x < 1.25 && tmp.y > -1.25 && tmp.y < 1.25 && dist < 90;
      if (onScreen) {
        el.style.left = ((tmp.x * 0.5 + 0.5) * 100) + '%';
        el.style.top = ((-tmp.y * 0.5 + 0.5) * 100) + '%';
        el.classList.add('is-visible');
      } else {
        el.classList.remove('is-visible');
      }
    }

    renderer.render(scene, camera);
  }
  frame();

  // keep the readout consistent if the user resizes into a "focus" state
  window.addEventListener('resize', function () {
    if (!focusKey) resetReadout();
  });

  // expose a tiny API for the rest of the page / debugging
  window.Endurance = {
    select: select, reset: resetReadout, flags: flags,
    // debug handles: lets tooling assert that the scene is really being drawn
    setScroll: setScroll,
    _renderer: renderer, _scene: scene, _camera: camera, _spinner: spinner,
    _backdrop: backdrop, _garg: garg, _disk: disk,
    renderOnce: function () { renderer.render(scene, camera); },
    info: function () {
      return {
        ok: true,
        modules: modules.length,
        hotspots: HOTSPOTS.length,
        scrollDrive: +scrollDrive.toFixed(3),
        frames: renderer.info.render.frame,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles
      };
    }
  };
})();
