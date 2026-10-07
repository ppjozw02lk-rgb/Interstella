# INTERSTELLAR — an interactive presentation

A one-page presentation of Christopher Nolan's *Interstellar* (2014) with a **real-time
3D model of the Endurance**, a procedural **Gargantua**, and the **Accretion Disc 3** WebGL
particle disc running as the **moving background**.

## Run it

```bash
node serve.js          # → http://127.0.0.1:8787
```

Or just double-click **index.html**. There is no build step, no bundler and no module
loading, so it also works straight off the filesystem (`file://`). three.js r155 is
vendored locally in `assets/vendor/`, so nothing is fetched from the network at runtime.

## ภาษาไทย / Language

The whole interface is in Thai (`<html lang="th">`) — navigation, headings, body copy, the 3D
readout and hotspot labels, the calculator, the TARS terminal, credits and the footer. The
font stack leads with **Leelawadee UI** (ships with Windows) and falls back through Noto Sans
Thai / IBM Plex Sans Thai / Sarabun / Sukhumvit Set / Tahoma. Three typography rules keep Thai
readable: `line-height` is 1.95 in body text and 1.55 on headings (tone marks above, vowel signs
below), letter-spacing is **off** for Thai and kept only for Latin labels (the title, kickers,
buttons), and the poster image carries `width`/`height` plus `aspect-ratio` so the layout never
jumps when it loads.

### Display face — KcSweet

Headings, the navigation and the buttons are set in **KcSweet** (`assets/fonts/KcSweetDemo.ttf`,
the Thai display face you supplied, served locally so the page keeps working offline). It is
applied by the *last* rule block in `style.css`, on purpose: paragraphs, numeric read-outs and
the mono micro-labels keep the body stack, because a soft display cut set solid in long Thai
prose is harder to read than it is pretty. Two caveats worth knowing:

- the demo cut has 208 glyphs and covers 42 of the 44 Thai consonants — **ค** and **ว** are
  missing, so those two letters fall back to Leelawadee UI inside display text (e.g. *ของเวลา*,
  *การ์กันชัว*, *ดาวมิลเลอร์*);
- its Thai marks stack higher than the body face, which is why headings moved from 1.5 to 1.55
  line-height. Checked against the `data-lines` reveal, whose `clip-path` ends at
  `inset(0 0 -8% 0)`: the glyph ink starts ~26 px inside the top of the heading box, so nothing is
  shaved.

## Scroll animation

- **Reveal on entry** — anything marked `data-anim="up|left|right|zoom"` (and `data-lines`
  headings, which unclip top-down) fades and slides in via IntersectionObserver; `data-d="1..5"`
  staggers children.
- **Parallax** — elements marked `data-par="0.06"` drift by (distance from screen centre ×
  speed, clamped to ±30 px) while you scroll. The hero rings take it through a `--par` CSS
  variable so the drift rides along with each ring's own rotation instead of replacing it.
- **The model is scroll-driven** — `main.js` computes how centred the 3D viewer is
  (`smoothstep`, peak 1 when the ship sits mid-screen) and feeds it to `Endurance.setScroll()`.
  At full drive the ring spins 5.5× faster and the camera pulls 20 % closer; both fade back to
  normal as the section leaves. Rendering pauses entirely while the section is off-screen.
- **The numbers count up** when the fact row scrolls into view, and the nav bar tracks progress.

## What is on the page

| Section | What it does |
|---|---|
| **Hero** | Letter-by-letter title, rotating quotes, a live local clock with a ticking second hand, and the film's rule (1 hour = 7 years) as a graphic |
| **Mission** | Story, the flight manifest, Plan A / Plan B / the bulk |
| **Endurance 3D** | The model — drag to orbit, scroll to zoom, click markers to inspect subsystems, plus Ring spin / Auto-orbit / Wireframe / Exploded / Starfield / Markers toggles |
| **Physics** | Kip Thorne's time dilation: slide the mission clock and watch Earth age (0.25 h → 1.75 y … 12 h → 84 y) |
| **Music** | Hans Zimmer and the Temple Church organ, with 24 pipes playing a chord progression in CSS |
| **Tesseract** | A CSS 3D hypercube with its inner lattice — no WebGL needed |
| **ข้อมูลภาพยนตร์** | The 2014 theatrical poster, Thai release dates (5 and 7 November 2014, 70 mm IMAX), animated counters (169 นาที · 2014 · 5 nominations · 1 Oscar), full Thai credits and cast, and the TARS terminal |

## How the background works — an accretion disc, and matter falling into it

The page background is the **Accretion Disc 3** component (Originkit), ported from React to
plain JavaScript in `assets/js/accretion.js`. The port is one-to-one: every constant, the GLSL
sources, `compile` / `link` / `parseColor` / `mulberry32` / `gauss` / `buildCloud` / `merge`, the
prop defaults and the additive `blendFunc(ONE, ONE)` draw are unchanged — `useEffect` became
`init()`, the refs became locals, and the `live` ref became a module object read every frame. One
thing was added that React never needed: the first frame is painted **synchronously**, so a tab or
webview that never delivers a `requestAnimationFrame` callback still shows the disc instead of a
blank box.

What it draws, with the props you supplied — `density 61`, `dotSize 127`, `speed 100`,
`distance 220`, `field{blur:0, scatter:0}`, `disc{arms:4, core:7, tilt:14}`, `jets{amount:0}`,
`baseColor #1900FF`, `accentColor #A0C0FF`:

- **239,600 particles** (`COUNT_BASE 20000 + 61 × COUNT_PER 3600`) in one `POINTS` draw, each one
  placed by a seed: radius from a square-root distribution, an angle wound by the Keplerian
  `pow(rIn/r, 1.5)` term, four spiral arms sharpened by `cos^2.6`, pulled `0.45` rad off-centre and
  spun at `0.06` rad/s
- a **flat 14° tilt** (`scatter 0` keeps the cloud in the plane, so the disc reads as the thin
  Interstellar line rather than a puffy doughnut), viewed at `distance 220` with a 34° vertical
  FOV — the 100-unit disc overflows the frame, so it is a background, not an object
- the shader's own **depth-of-field pedal**: the near half is sharp and the far half is blurred
  by `FOCUS_MULT 1.75`; the black background is the component's own `background: #000000` prop
- console handle `window.AccretionDisc` — `set({ speed: 40 })` to change any prop at runtime,
  `pause()` / `resume()` / `step(dt)`, and getters for `ok`, `count`, `built`, `frames`, `time`,
  `canvas` and `size`

The disc replaces the galaxy-image background, which is why `assets/img/galaxy.png` and
`galaxy-glow.png` are still on disk but no longer loaded — nothing in the page references them
any more (the CSS spiral keyframes went with them).

### The sparks falling into the middle

`assets/js/background.js` still runs over the disc, and is still built around the fall into the
centre: ~275 glinting particles orbit and spiral inward like a whirlpool — calm at the rim, then
falling and whipping faster the closer they get (`v ∝ (1-r)`, `ω ∝ (1-r)`). Each spark leaves a
short comet tail so the direction of travel reads even when the page is still; they brighten as
they fall, fade out as the middle **swallows them**, and flash the core glow. About one in six
carries a four-point glint. Scrolling whips the vortex up and lengthens the tails, and it slows to
`CALM = 0.34` under reduced motion. `window.StarFX` exposes `count`, `inwardDistance`, `arrivals`,
`avgRadius()`, `probe(i)` and `step(dt)` for measurement.

## How the Endurance is built

`assets/js/endurance.js` generates the ship in code — there is no `.glb` to load:

- **12 mission modules** (one per hour on a watch face, as in the film's design brief) in a
  65 m ring, joined by tunnels, each with windows, RCS blocks, antennas and deployable radiators
- **4 struts + 4 diagonal braces** to a pressurised **hub**, threaded on a long axial **spine**
- Forward **docking assembly** with a docked **Ranger**; a **Lander** docked radially on the ring
- Aft **engine cluster** (main bell + four outboard nozzles) with additive plumes, navigation
  beacons, comms dish, and a procedural environment map so the metals have something to reflect
- **Gargantua**: black event-horizon sphere, accretion disk (canvas-rendered with a polar-mapped
  radial gradient and hot filaments), a dim outer disk, the lensed ring above and below, and a
  glow sprite. It lives in a *backdrop* group that tracks the camera azimuth, so the black hole
  and its warm rim light stay in frame no matter how you orbit
- `Ring spin` rotates the ring for artificial gravity; `Exploded` separates the modules and makes
  the hulls translucent; `Wireframe` switches every hull material
- 5 markers are projected from 3D each frame and can be clicked to inspect a subsystem

Rendering pauses when the section is off-screen or the tab is hidden.

## Reduced motion

The page is built around movement, so `prefers-reduced-motion: reduce` does **not** freeze it:
the accretion disc still turns and the sparkles still fall toward the middle, both at a fraction
of the speed (`CALM = 0.26` on the disc's time step, `0.34` on the swirl) and without the pointer
parallax, while the grain, marker pings, glints and blink patterns are switched off. Everything
revealed by scroll is forced visible with `!important`, so content can never depend on an
animation or an observer that a reduced-motion visitor has asked us to hold back.

## Files

```
interstellar/
├── index.html
├── serve.js                     tiny static server (no dependencies)
└── assets/
    ├── css/style.css
    ├── js/accretion.js          the background: Accretion Disc 3, ported to plain JS
    ├── js/background.js         the sparks falling into the middle
    ├── js/endurance.js          three.js model + Gargantua + hotspots + camera
    ├── js/main.js               hero, quotes, clock, reveals, counters, calculator,
    │                            organ pipes, TARS terminal, tesseract
    ├── fonts/KcSweetDemo.ttf    the display face (headings, nav, buttons)
    ├── img/galaxy.png           your download.png — kept on disk, no longer loaded
    ├── img/galaxy-glow.png      its transparent copy — also no longer loaded
    ├── img/poster.png           the 2014 theatrical poster you supplied
    └── vendor/three.min.js      three.js r155 (local copy)
```

Fan-made design study. Not affiliated with Paramount Pictures, Warner Bros., Syncopy or
Legendary Pictures.
