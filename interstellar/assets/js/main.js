/* ═══════════════════════════════════════════════════════════════════════════
   main.js — พฤติกรรมของหน้าเว็บ
   ตัวอักษรเปิดเรื่อง · คำคมหมุนวน · นาฬิกาเดินจริง · อนิเมชันตามการเลื่อน
   ตัวนับตัวเลข · เครื่องคำนวณการยืดเวลา · ท่อออร์แกน · เทอร์มินัล TARS · เทสเซอแรกต์
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── 1. ชื่อเรื่องเปิด: แยกเป็นตัวอักษรแล้วบินเข้ามาทีละตัว ─────────────── */
  var title = $('[data-split]');
  if (title) {
    var word = title.textContent.trim();
    title.textContent = '';
    word.split('').forEach(function (ch, i) {
      var s = document.createElement('span');
      s.textContent = ch;
      s.style.setProperty('--i', i);
      title.appendChild(s);
    });
  }

  /* ── 2. คำคมที่หมุนวนในฉากเปิด ────────────────────────────────────────── */
  var QUOTES = [
    '“มนุษย์เกิดมาบนโลก แต่มันไม่เคยเป็นที่ที่เราควรจะตาย”',
    '“อย่าไปอย่างอ่อนโยนสู่ราตรีอันแสนดี”',
    '“เราเคยแหงนมองท้องฟ้าแล้วสงสัยว่ามนุษย์เราอยู่ตรงไหนในหมู่ดาว”',
    '“ความรักคือสิ่งเดียวที่เราสัมผัสได้ และก้าวข้ามเวลาและอวกาศไป”',
    '“มันเป็นไปไม่ได้” — “ไม่ มันจำเป็น”',
    '“เราจะหาทางได้ เราทำได้เสมอ”'
  ];
  var heroQuote = $('#heroQuote');
  if (heroQuote) {
    var qi = 0;
    setInterval(function () {
      qi = (qi + 1) % QUOTES.length;
      heroQuote.classList.add('is-fading');
      setTimeout(function () {
        heroQuote.textContent = QUOTES[qi];
        heroQuote.classList.remove('is-fading');
      }, 450);
    }, reduce ? 11000 : 7200);
  }

  /* ── 3. นาฬิกา: เวลาจริงในเครื่อง + เข็มวินาทีที่เดิน ────────────────────── */
  var clockEl = $('#clock'), secEl = $('#tickSec');
  function tick() {
    var d = new Date();
    if (clockEl) {
      clockEl.textContent = String(d.getHours()).padStart(2, '0') + ':' +
                            String(d.getMinutes()).padStart(2, '0') + ':' +
                            String(d.getSeconds()).padStart(2, '0');
    }
    if (secEl) secEl.style.transform = 'rotate(' + (d.getSeconds() * 6) + 'deg)';
  }
  tick();
  setInterval(tick, 1000);

  /* ── 4. ตัวนับตัวเลข ──────────────────────────────────────────────────── */
  function count(el) {
    var to = parseInt(el.getAttribute('data-count'), 10) || 0;
    var plainFlag = el.hasAttribute('data-plain');        // ปีต้องอ่านว่า 2014 ไม่ใช่ 2,014
    var fmt = function (n) { return plainFlag ? String(n) : n.toLocaleString(); };
    if (reduce || !to) { el.textContent = fmt(to); return; }
    var start = performance.now(), dur = 1500;
    (function step(now) {
      var p = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(to * e));
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  /* ── 5. อนิเมชันตามการเลื่อน: เปิดเผยเนื้อหา + พารัลแลกซ์ + บังคับยาน 3 มิติ ── */
  var animEls = $$('[data-anim], [data-lines], .reveal');
  var io = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add('in');
          io.unobserve(en.target);
          $$('[data-count]', en.target).forEach(count);
        });
      }, { rootMargin: '-8% 0px -12% 0px' })
    : null;
  if (io) {
    animEls.forEach(function (el) { io.observe(el); });
  } else {
    animEls.forEach(function (el) { el.classList.add('in'); });
    $$('[data-count]').forEach(count);
  }

  var parEls = $$('[data-par]');
  var PAR_LIMIT = 30;                     // ไม่ให้ภาพลอยเกินกรอบของตัวเอง
  function measure() {
    parEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      el._top = r.top + window.pageYOffset;
      el._h = r.height;
    });
  }
  measure();
  window.addEventListener('resize', function () { measure(); }, { passive: true });
  window.addEventListener('load', measure);

  var viewer = $('#viewer');
  var drive = 0;

  function scrollEngine() {
    var sy = window.pageYOffset || document.documentElement.scrollTop;
    var vh = window.innerHeight;

    /* พารัลแลกซ์: ระยะห่างจากกลางจอ × ความเร็วขององค์ประกอบนั้น
       (ปิดเมื่อผู้ใช้ขอโหมดลดการเคลื่อนไหว) */
    for (var i = 0; !reduce && i < parEls.length; i++) {
      var el = parEls[i];
      var speed = parseFloat(el.getAttribute('data-par')) || 0.08;
      var centre = (el._top + el._h / 2) - (sy + vh / 2);
      var off = Math.max(-PAR_LIMIT, Math.min(PAR_LIMIT, -centre * speed));
      el.style.setProperty('--par', off.toFixed(1) + 'px');
    }

    /* ยานเอ็นดูแรนซ์: ให้ค่าสูงสุดตอนโมเดลอยู่กลางจอ (ตอนที่คนกำลังดูอยู่จริง)
       แล้วค่อย ๆ ลดลงตอนยานเลื่อนเข้าและเลื่อนพ้นจอ */
    if (viewer && window.Endurance && window.Endurance.setScroll) {
      var r = viewer.getBoundingClientRect();
      var offset = (r.top + r.height / 2) - vh / 2;        // 0 = ตรงกลางจอ
      var span = vh / 2 + r.height / 2;
      drive = 1 - Math.min(1, Math.abs(offset) / span);
      drive = drive * drive * (3 - 2 * drive);             // smoothstep ให้ไม่กระตุก
      window.Endurance.setScroll(drive);
    }
  }

  var queue = false;
  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    var max = Math.max(1, document.body.scrollHeight - window.innerHeight);
    var bar = $('#navBar'), nav = $('#nav');
    if (bar) bar.style.width = Math.min(100, (y / max) * 100) + '%';
    if (nav) nav.classList.toggle('is-stuck', y > 40);
    if (reduce) { scrollEngine(); return; }
    if (queue) return;
    queue = true;
    requestAnimationFrame(function () { queue = false; scrollEngine(); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── 6. เครื่องคำนวณการยืดเวลา (1 ชั่วโมง = 7 ปี) ───────────────────────── */
  var HOURS_TO_YEARS = 7;                 // กฎของดาวมิลเลอร์ในหนัง
  var slider = $('#hours'), hoursOut = $('#hoursOut'),
      yearsOut = $('#yearsOut'), noteOut = $('#yearsNote'), cascade = $('#cascade');

  function fmtHours(h) {
    var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (hh === 0) return mm + ' นาที';
    return hh + ' ชม. ' + String(mm).padStart(2, '0') + ' นาที';
  }
  function fmtYears(y) {
    if (y === 0) return '0';
    if (y < 10) return (Math.round(y * 100) / 100).toString().replace(/\.?0+$/, '');
    if (y < 1000) return (Math.round(y * 10) / 10).toLocaleString();
    return Math.round(y).toLocaleString();
  }
  function noteFor(h, y) {
    if (h === 0) return 'ไม่ลงไปเลย — คูเปอร์ได้อยู่บ้านและเห็นลูกสาวเติบโต';
    if (h < 0.5) return 'แค่วินาทีเดียวสำหรับลูกเรือ แต่บนโลกเวลาผ่านไป ' + fmtYears(y) + ' ปี และลูกสาวของคุณก็ยังแก่ลงทุกวัน';
    if (h < 2)   return 'สำรวจน้ำตื้นแค่ชั่วครู่ บนโลกเวลาผ่านไป ' + fmtYears(y) + ' ปี เมิร์ฟโตจากเด็กเป็นผู้ใหญ่';
    if (h < 6)   return 'บนโลกเวลาผ่านไป ' + fmtYears(y) + ' ปี ลูกสาวคุณเรียนจบมหาวิทยาลัย แล้วก็เลิกคอยข้อความจากคุณ';
    if (h < 13)  return 'บนโลกเวลาผ่านไป ' + fmtYears(y) + ' ปี ทั้งชีวิตของทุกคนที่คุณรู้จักผ่านไปในช่วงระหว่างข้อความสองข้อความ';
    return 'บนโลกเวลาผ่านไป ' + fmtYears(y) + ' ปี อารยธรรมเกิดและตายในช่วงนั้น ไม่มีใครที่คุณทิ้งไว้จะยังมีชีวิตอยู่';
  }
  function update() {
    if (!slider) return;
    var h = parseFloat(slider.value) || 0;
    var y = h * HOURS_TO_YEARS;
    if (hoursOut) hoursOut.textContent = fmtHours(h);
    if (yearsOut) yearsOut.innerHTML = fmtYears(y) + ' <span>ปี</span>';
    if (noteOut) {
      var perSec = (HOURS_TO_YEARS * 365.25 * 24 / 3600);   // ชั่วโมงบนโลกต่อ 1 วินาทีบนผิวดาว
      noteOut.textContent = noteFor(h, y) + ' (ทุกวินาทีบนผิวดาวนั้นแลกด้วย ' + perSec.toFixed(1) + ' ชั่วโมงบนโลก)';
    }
    if (cascade) {
      var html = '';
      for (var k = 1; k <= 4; k++) {
        var stepH = Math.max(0.05, h / 4) * k;
        html += '<i style="animation-delay:' + (k * 0.55) + 's">บนผิวดาว ' + fmtHours(stepH) + ' → บนโลก ' +
                fmtYears(stepH * HOURS_TO_YEARS) + ' ปี</i>';
      }
      cascade.innerHTML = html;
    }
  }
  if (slider) {
    slider.addEventListener('input', update);
    $$('.timecalc__quick button').forEach(function (b) {
      b.addEventListener('click', function () {
        slider.value = b.getAttribute('data-hours');
        update();
      });
    });
    update();
  }

  /* ── 7. ท่อออร์แกน: คอร์ดที่ไล่ไปเรื่อย ๆ ไม่มีเสียง ─────────────────────── */
  var pipesEl = $('#pipes');
  if (pipesEl) {
    var PIPES = 24, pipes = [];
    for (var i = 0; i < PIPES; i++) {
      var p = document.createElement('div');
      p.className = 'pipe';
      var arch = Math.sin((i / (PIPES - 1)) * Math.PI);          // ท่อกลางสูงที่สุด
      p.style.setProperty('--h', (14 + arch * 62).toFixed(1) + '%');
      p._base = 14 + arch * 62;
      pipesEl.appendChild(p);
      pipes.push(p);
    }
    var CHORDS = [[0, 7, 12], [2, 9, 14], [4, 11, 16], [0, 5, 12, 19], [7, 12, 17], [3, 10, 15, 21]];
    var step = 0;
    function playChord() {
      var chord = CHORDS[step % CHORDS.length]; step++;
      chord.forEach(function (idx, n) {
        var pipe = pipes[Math.min(PIPES - 1, idx)];
        if (!pipe) return;
        setTimeout(function () {
          pipe.style.setProperty('--h', Math.min(98, pipe._base + 18 + n * 4).toFixed(1) + '%');
          pipe.classList.add('is-lit');
          setTimeout(function () {
            pipe.classList.remove('is-lit');
            pipe.style.setProperty('--h', (pipe._base + (Math.random() * 5 - 2)).toFixed(1) + '%');
          }, 420 + n * 130);
        }, n * 90);
      });
      setTimeout(playChord, 1150 + Math.random() * 500);
    }
    if (reduce) {
      [0, 7, 12, 19].forEach(function (idx) { if (pipes[idx]) pipes[idx].classList.add('is-lit'); });
    } else {
      playChord();
    }
  }

  /* ── 8. เทอร์มินัล TARS ────────────────────────────────────────────────── */
  var tarsScreen = $('#tarsScreen'), tars = $('#tars'), humEl = $('#humour'), honEl = $('#honesty');
  var typeToken = 0;
  function typeLine(text, cb) {
    if (!tarsScreen) return;
    var token = ++typeToken;
    var i = 0;
    tarsScreen.textContent = '> ';
    (function step() {
      if (token !== typeToken) return;
      tarsScreen.textContent = '> ' + text.slice(0, i);
      if (i++ < text.length) setTimeout(step, reduce ? 0 : 26 + Math.random() * 30);
      else if (cb) cb();
    })();
  }
  var tarsOpened = false;
  if (tars && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries, obs) {
      if (!entries[0].isIntersecting || tarsOpened) return;
      tarsOpened = true;
      obs.disconnect();
      typeLine('ทุกคนพร้อมจะบอกลาระบบสุริยะของเราแล้วหรือยัง ผมตั้งอารมณ์ขันไว้ที่เจ็ดสิบห้าเปอร์เซ็นต์');
    }, { rootMargin: '-20% 0px' }).observe(tars);
  } else {
    typeLine('ทุกคนพร้อมจะบอกลาระบบสุริยะของเราแล้วหรือยัง');
  }

  function dialOut(el, value) {
    if (!el) return;
    if (reduce) { el.textContent = value; return; }
    var from = parseInt(el.textContent, 10) || 0, start = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - start) / 500);
      el.textContent = Math.round(from + (value - from) * p);
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }
  $$('.tars__btns button').forEach(function (b) {
    b.addEventListener('click', function () {
      dialOut(humEl, parseInt(b.getAttribute('data-humour'), 10));
      dialOut(honEl, parseInt(b.getAttribute('data-honesty'), 10));
      typeLine(b.getAttribute('data-line'));
    });
  });

  /* ── 9. เทสเซอแรกต์: สร้างไฮเปอร์คิวบ์ด้วย CSS 3 มิติ ──────────────────── */
  var cube = $('#tessCube');
  if (cube) {
    var S = 170;
    ['translateZ(' + (S / 2) + 'px)',
     'rotateY(180deg) translateZ(' + (S / 2) + 'px)',
     'rotateY(90deg) translateZ(' + (S / 2) + 'px)',
     'rotateY(-90deg) translateZ(' + (S / 2) + 'px)',
     'rotateX(90deg) translateZ(' + (S / 2) + 'px)',
     'rotateX(-90deg) translateZ(' + (S / 2) + 'px)'].forEach(function (t) {
      var d = document.createElement('div');
      d.className = 'face';
      d.style.transform = t;
      cube.appendChild(d);
    });
    var inner = document.createElement('div');
    inner.className = 'inner';
    cube.appendChild(inner);
  }

  /* ── 10. คีย์ลัดเล็ก ๆ ─────────────────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'e' || e.key === 'E') {
      var btn = document.querySelector('.tgl[data-tgl="explode"]');
      if (btn && document.activeElement !== btn) btn.click();
    }
  });

  /* ให้ตัวตรวจสอบภายนอกเรียกใช้ได้ */
  window.ScrollFX = {
    parallaxTargets: parEls.length,
    animatedTargets: animEls.length,
    revealed: function () { return $$('.in').length; },
    drive: function () { return drive; },
    parallax: function () {
      return parEls.map(function (el) { return parseFloat(el.style.getPropertyValue('--par')) || 0; });
    }
  };
})();
