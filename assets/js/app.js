/* ============================================================
   app.js — ตรรกะทั้งหมดของ por Doujin
   ============================================================
   เงื่อนไขหลัก: ผู้ใช้สั่ง "เอาทุกแนว ไม่ต้องค้น" → รับทุกอย่างที่ต้นทางส่งมา
   ตัวกรองเดียวที่ยังอยู่คือ SRC.isAllowed() = ตัดแนว furry (SRC.isFemboy() เป็นตัวช่วย ยังใช้อ้างอิงได้)
   ไม่มีข้อมูลตัวอย่าง/สำรองอีกแล้ว — ถ้าต้นทางล่มก็บอกตรง ๆ ว่าล่ม ไม่แต่งข้อมูลขึ้นมา
   ============================================================ */
(function () {
  'use strict';

  const { tagColors, langLabel, sorts } = window.FEMBOY;
  const SRC = window.VAULT_SOURCES;
  const adapters = SRC.adapters;

  /* ---------- ข้อมูลจริงจากต้นทางภายนอก ---------- */
  /* library คือคลังที่แสดงอยู่ตอนนี้ (จากเว็บต้นทางเท่านั้น ไม่มีข้อมูลตัวอย่าง)
     detailCache เก็บรายละเอียด/URL รูปที่โหลดเพิ่มเมื่อเปิดการ์ด */
  let library = [];
  let usingLive = false;
  let sourceNote = '';
  let inflight = null;
  const detailCache = new Map();

  /* ป้ายบอกผู้ใช้ว่าตอนนี้ข้อมูลมาจากไหน (รับได้ทั้ง id และ object) */
  const srcName = (s) => (SRC.list[s] && SRC.list[s].name) || String(s || '?');
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const PER_PAGE = 24;

  /* ---------------- สถานะ ---------------- */
  const state = {
    q: '',
    tags: [],
    lang: 'all',
    group: 'all',
    orientation: 'all',
    date: 'all',
    sort: 'newest',
    view: 'grid',
    andMode: false,
    favsOnly: false,
  };

  const FAV_KEY = 'femboy-vault:favs';
  let favs = new Set();
  try { favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (e) { favs = new Set(); }
  const saveFavs = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch (e) { /* ignore */ } };

  /* ---------------- ปก SVG สร้างเอง (ไม่พึ่งภาพภายนอก) ---------------- */
  const hueOf = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
  };

  /* CDN บางครั้งค้างไม่ error (TCP timeout ~21 วิ) ทำให้ปกว่างนานเกินไป
     → ถ้าภาพยังไม่ขึ้นภายใน COVER_TIMEOUT_MS ให้สลับเป็นปกสำรองเอง
     ใช้ data-fb เก็บปกสำรอง แล้วค่อยสลับใน loadArtFallbacks() */
  const COVER_TIMEOUT_MS = 6000;

  function loadArtFallbacks(root) {
    (root || document).querySelectorAll('img[data-fb]:not([data-fb-checked])').forEach((img) => {
      img.setAttribute('data-fb-checked', '1');
      if (img.complete && img.naturalWidth > 0) return;
      setTimeout(() => {
        if (img.complete && img.naturalWidth > 0) return;
        img.src = img.getAttribute('data-fb');
      }, COVER_TIMEOUT_MS);
    });
  }

  function coverArt(d) {
    /* ถ้ามีรูปจริงจากต้นทาง ให้ใช้รูปนั้นเลย (อ้างตรง ๆ ไม่ดาวน์โหลดซ้ำ) */
    return d.cover || d.thumb || fallbackArt(d);
  }

  /* ปกสำรองสร้างเอง กรณีต้นทางโหลดรูปไม่ขึ้น */
  function fallbackArt(d) {
    const h = hueOf(d.id + d.title);
    const h2 = (h + 40) % 360;
    const initials = d.title_jp || d.characters[0] || d.artist || '?';
    const jp = /[\u3040-\u30ff\u4e00-\u9faf]/.test(initials);
    const label = jp ? [...initials][0] : initials
      .replace(/[^A-Za-z0-9 ]/g, '')
      .split(/\s+/).filter(Boolean).slice(0, 2)
      .map((w) => w[0].toUpperCase()).join('') || '♥';
    const bars = Array.from({ length: 7 }, (_, i) =>
      `<rect x="${60 + i * 26}" y="${430 - ((d.pages * (i + 3)) % 180) - 40}" width="12" height="200" rx="6" fill="rgba(255,255,255,0.09)"/>`).join('');
    const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 480" role="img" aria-label="ปก ${esc(clip(shortTitle(d), 40))}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${h},62%,42%)"/><stop offset="1" stop-color="hsl(${h2},55%,22%)"/>
</linearGradient></defs>
<rect width="320" height="480" fill="url(#g)"/>
${bars}
<circle cx="160" cy="196" r="76" fill="rgba(255,255,255,0.10)"/>
<text x="160" y="222" font-family="Segoe UI,system-ui,sans-serif" font-size="${jp ? 96 : 70}" font-weight="700"
 fill="rgba(255,255,255,0.92)" text-anchor="middle">${esc(label)}</text>
<text x="160" y="300" font-family="Segoe UI,system-ui,sans-serif" font-size="14" font-weight="600"
 fill="rgba(255,255,255,0.95)" text-anchor="middle">${esc(clip(shortTitle(d), 30))}</text>
<text x="160" y="326" font-family="Segoe UI,system-ui,sans-serif" font-size="11"
 fill="rgba(255,255,255,0.62)" text-anchor="middle">${esc(clip(d.circle, 24))} · ${d.pages}p</text>
<rect x="0" y="440" width="320" height="40" fill="rgba(0,0,0,0.32)"/>
<text x="160" y="465" font-family="Segoe UI,system-ui,sans-serif" font-size="13" letter-spacing="2"
 fill="rgba(255,255,255,0.80)" text-anchor="middle">por Doujin</text>
</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  /* ชื่อเรื่องที่อ่านออก: ตัด prefix [Circle xxx] ทิ้ง แล้วเอาส่วนก่อน | เป็นภาษาหลัก */
  function shortTitle(d) {
    const withoutPrefix = d.title.replace(/^\s*\[[^\]]+\]\s*/, '');
    const t = (withoutPrefix.split('|')[0] || d.title).trim();
    return t.length > 34 ? t.slice(0, 33) + '…' : t;
  }

  const tagColor = (t) => tagColors[t] || '#4a4a55';

  /* ---------------- ค้นหา / กรอง ---------------- */
  function hay(d) {
    return [d.title, d.title_jp, d.circle, d.artist, d.description,
      (d.characters || []).join(' '), (d.tags || []).join(' ')]
      .join(' ').toLowerCase();
  }

  const daysAgo = (date) => {
    const t = new Date(date + 'T00:00:00').getTime();
    return Number.isFinite(t) ? (Date.now() - t) / 86400000 : 9999;
  };

  function filtered() {
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    // ถ้าข้อมูลมาจากการค้นหาสด ต้นทางเป็นคนกรองคำค้นมาให้แล้ว
    // ถ้ากรองซ้ำด้วย hay() อีกรอบ รายการจะหายหมด เพราะหน้า listing ของต้นทางไม่มีแท็ก
    const skipText = usingLive && terms.length > 0;
    return library.filter((d) => {
      if (state.lang !== 'all' && d.language !== state.lang) return false;
      if (state.group !== 'all' && d.group !== state.group) return false;
      if (state.orientation !== 'all' && d.orientation !== state.orientation) return false;
      if (state.favsOnly && !favs.has(d.id)) return false;
      if (state.date !== 'all' && (!d.date || daysAgo(d.date) > Number(state.date))) return false;
      if (state.tags.length) {
        const has = (t) => d.tags.includes(t);
        if (state.andMode ? !state.tags.every(has) : !state.tags.some(has)) return false;
      }
      if (terms.length && !skipText) {
        const h = hay(d);
        if (!terms.every((t) => h.includes(t))) return false;
      }
      return true;
    });
  }

  const SORTERS = {
    newest: (a, b) => b.date.localeCompare(a.date),
    // ไม่มีแหล่งไหนให้ฟิลด์ views → ถ้าไม่มีให้เรียงด้วยจำนวนถูกใจแทน (สัญญาณความนิยมที่มีจริง)
    popular: (a, b) => (b.views - a.views) || (b.favorites - a.favorites),
    favorites: (a, b) => b.favorites - a.favorites,
    pages: (a, b) => b.pages - a.pages,
    title: (a, b) => a.title.localeCompare(b.title, 'th'),
  };

  /* ---------------- แถบด้านข้าง ---------------- */
  /* นับค่าที่มีจริงเท่านั้น — ค่าว่างแปลว่าต้นทางไม่ได้บอก ต้องไม่กลายเป็น facetปลอม */
  const countBy = (key) => {
    const m = new Map();
    library.forEach((d) => {
      const k = key === 'tags' ? (d.tags || []) : [d[key]];
      k.forEach((v) => {
        const val = String(v == null ? '' : v).trim();
        if (val) m.set(val, (m.get(val) || 0) + 1);
      });
    });
    return m;
  };

  /* ถ้าไม่มีค่าจริงเลย → บอกตรง ๆ ว่ายังไม่มี แทนการโชว์ค่าที่ไม่มีที่มา */
  const facetRows = (map, attr, labelFn) => {
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '<span class="muted">— ' + esc(HINT[attr] || 'ยังไม่มีข้อมูลจากต้นทาง') + ' —</span>';
    return rows.map(([k, n]) =>
      `<div class="side-row" data-${attr}="${esc(k)}"><span class="radio-dot"></span>${esc(labelFn ? labelFn(k) : k)}<span class="side-row__n">${n}</span></div>`).join('');
  };

  const HINT = {
    lang: 'ต้นทางยังไม่บอกภาษา — เปิดการ์ดเพื่อให้ดึงเพิ่ม',
    group: 'ต้นทางยังไม่บอกหมวดหมู่ — เปิดการ์ดเพื่อให้ดึงเพิ่ม',
    orientation: 'ต้นทางยังไม่บอกแนวทาง — เปิดการ์ดเพื่อให้ดึงเพิ่ม',
  };

  function buildSidebar() {
    $('#langList').innerHTML = facetRows(countBy('language'), 'lang', (k) => langLabel[k] || k);
    $('#groupList').innerHTML = facetRows(countBy('group'), 'group');
    // ช่อง "แนวทาง" ถูกถอดออกจาก UI แล้ว — ค่าจากต้นทางเป็นแท็กกระจุกปนสน ไม่ใช่แนวทางจริง
    const orientBox = $('#orientList');
    if (orientBox) orientBox.innerHTML = facetRows(countBy('orientation'), 'orientation');

    const tags = countBy('tags');
    const top = [...tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);
    $('#tagCloud').innerHTML = top.length
      ? top.map(([t, n]) =>
        `<button class="chip" data-tag="${esc(t)}" style="background:${tagColor(t)}"><span>${esc(t)}</span><span class="chip__n">${n}</span></button>`).join('')
      : '<span class="muted">— ค้นหาก่อนเพื่อดูแท็ก —</span>';

    if (!$('#sort').options.length) {
      $('#sort').innerHTML = sorts.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');
    }

    // นับจำนวนต่อช่วงเวลา
    $$('#sidebar .side-row[data-date]').forEach((r) => {
      const v = r.dataset.date;
      const n = v === 'all' ? library.length : library.filter((d) => d.date && daysAgo(d.date) <= Number(v)).length;
      const slot = r.querySelector('.side-row__n');
      if (slot) slot.textContent = n;
    });

    $('#favCount').textContent = favs.size;
  }

  /* ============================================================
     ดึงข้อมูลจริงจากต้นทางภายนอก
     ──────────────────────────────────────────────────────────
     ค้นหา → เรียก search ของทุกแหล่งที่เปิดใช้ → รวมผล → เรนเดอร์
     เปิดการ์ด → ค่อยดึงรายละเอียด + URL รูปทุกหน้าแบบ lazy
     (ไม่ดึงทั้งเล่มล่วงหน้า เพื่อไม่ให้ยิงเว็บต้นทางถี่เกินไป)
     ============================================================ */
  function setStatus(msg, kind) {
    const el = $('#status');
    if (!el) return;
    el.hidden = !msg;
    el.className = 'status' + (kind ? ' status--' + kind : '');
    el.innerHTML = msg;
  }

  let enabledSources = (SRC.defaultSources || ['miku']).slice();

  /* คำกันไว้ชั้นสุดท้ายก่อนเข้าคลัง — adapter กรองแล้ว แต่ถ้ามีใครเพิ่มเส้นทางใหม่
     ต้องไม่ให้หลุดรอด (ตอนนี้กฎเดียวที่เหลือคือ "ตัดแนว furry" เพราะผู้ใช้สั่งเอาทุกแนว) */
  const allowed = (items) => (items || []).filter(SRC.isAllowed);

  const mergeUnique = (base, add) => {
    const seen = new Set(base.map((d) => d.id));
    const out = base.slice();
    add.forEach((d) => { if (!seen.has(d.id)) { seen.add(d.id); out.push(d); } });
    return out;
  };

  async function searchLive(q, opts) {
    const query = (q || '').trim();
    const signal = opts && opts.signal;
    if (!query) {
      library = [];
      resetScroll();
      render();
      return loadLanding();
    }

    if (inflight) { try { inflight.abort(); } catch (e) { /* ignore */ } }
    const ctrl = new AbortController();
    inflight = ctrl;

    setStatus('⏳ กำลังค้น “' + esc(query) + '” จาก ' + enabledSources.map(srcName).join(', ') + '…', 'load');
    $('#grid').innerHTML = '';
    $('#empty').hidden = true;
    $('#grid').innerHTML = '';

    const results = await Promise.allSettled(
      enabledSources.map((id) => adapters[id].search(query, ctrl.signal))
    );
    if (ctrl.signal.aborted) return;

    const items = [];
    const errors = [];
    const okNames = [];
    let dropped = 0;
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') {
        errors.push(srcName(enabledSources[i]) + ': ' + (r.reason && r.reason.message || 'ล้มเหลว'));
        return;
      }
      okNames.push(srcName(enabledSources[i]));
      const val = r.value || {};
      // adapter คืน { items, dropped } แต่รองรับทั้ง array เปล่าไว้ด้วย
      const got = Array.isArray(val) ? val : val.items;
      items.push(...allowed(got));
      if (!Array.isArray(val)) dropped += val.dropped || 0;
    });

    const allOk = results.every((r) => r.status === 'fulfilled');

    if (!items.length && allOk) {
      library = [];
      usingLive = true;
      sourceNote = '';
      render();
      // ต้องบอกเหตุผลที่ชัด ๆ: ไม่พบเลย vs พบแต่โดนกฎตัดทิ้ง
      setStatus(dropped
        ? '🔎 <b>' + esc(okNames.join(' + ')) + '</b> ค้น “' + esc(query) + '” ได้ ' + dropped
          + ' รายการ แต่ถูกตัดทิ้งทั้งหมด (แนว furry หรือไม่ผ่านกฎของคลัง)'
        : '🔎 <b>' + esc(okNames.join(' + ')) + '</b> ค้น “' + esc(query)
          + '” แล้วไม่พบรายการ — ต้นทางตอบกลับปกติ ผลลัพธ์ว่างจริง', '');
      return;
    }

    if (!items.length) {
      library = [];
      usingLive = false;
      sourceNote = errors.join(' · ');
      render();
      setStatus('⚠️ ดึงข้อมูลไม่สำเร็จ (' + esc(sourceNote)
        + ') — ยังไม่มีข้อมูลสำรอง ลองใหม่อีกครั้ง', 'warn');
      return;
    }

    library = items.map(SRC.normalize);
    usingLive = true;
    sourceNote = errors.join(' · ');
    detailCache.clear();
    render();
    const droppedNote = dropped ? ' · ตัดทิ้ง ' + dropped + ' รายการตามกฎ' : '';
    setStatus(errors.length
      ? '⚠️ ดึงจริงจาก <b>' + esc(okNames.join(' + ')) + '</b> — ' + items.length
        + ' รายการ' + esc(droppedNote) + ' (ไม่สำเร็จ: ' + esc(sourceNote) + ')'
      : '✅ ดึงจริงจาก <b>' + esc(okNames.join(' + ')) + '</b> — ' + items.length
        + ' รายการ' + esc(droppedNote), errors.length ? 'warn' : 'ok');
  }

  /* โหลดรายละเอียดเมื่อเปิดการ์ด (lazy) */
  async function hydrate(id) {
    if (detailCache.has(id)) return detailCache.get(id);
    const d = library.find((x) => String(x.id) === String(id));
    if (!d) return null;
    const kind = String(id).split('-')[0];
    const adapter = adapters[kind];
    if (!adapter) return d;

    try {
      // ทุก adapter ใช้คีย์ของตัวเอง (slug / gid / topic id) เก็บไว้ที่ item.key
      const full = await adapter.detail(d.key || d.gid || d.slug);
      Object.assign(d, SRC.normalize(full));
      detailCache.set(id, d);
      // รายละเอียดมีค่าจริงของ หมวดหมู่/แนว/ภาษา → อัปเดต facet ข้าง ๆ ให้ตรงกับคลัง
      buildSidebar();
    } catch (e) {
      detailCache.set(id, d); // ใช้ข้อมูลจากหน้า listing ต่อ
    }
    return d;
  }

  /* ---------------- แสดงผล ---------------- */
  function cardHTML(d) {
    const on = favs.has(d.id);
    const isList = state.view === 'list';
    const tags = d.tags.slice(0, isList ? 10 : 6).map((t) =>
      `<span class="chip" style="background:${tagColor(t)}">${esc(t)}</span>`).join('');
    return `<article class="card" data-id="${d.id}">
      <a class="card__cover" href="#/d/${d.id}" data-open="${d.id}">
        <img loading="lazy" src="${esc(coverArt(d))}" data-fb="${esc(fallbackArt(d))}" alt="ปก ${esc(shortTitle(d))}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.removeAttribute('src');this.src='${esc(fallbackArt(d))}'">
        ${d.pages ? `<span class="card__pages">${d.pages}p</span>` : ''}
        ${d.language && d.language !== 'jp' ? `<span class="card__lang">${esc(d.language)}</span>` : ''}
      </a>
      <button class="fav-btn ${on ? 'is-on' : ''}" data-fav="${d.id}" title="ถูกใจ">${on ? '♥' : '♡'}</button>
      <div class="card__body">
        <a class="card__title" href="#/d/${d.id}" data-open="${d.id}" title="${esc(d.title)}">${esc(shortTitle(d))}</a>
        <div class="card__meta">${isList
          ? [esc(d.circle), esc(d.artist), d.date, d.favorites ? d.favorites.toLocaleString() + ' ♥' : ''].filter(Boolean).join(' · ')
          : [esc(d.artist), d.pages ? d.pages + 'p' : '', esc(d.source.replace(/\.com$/, ''))].filter(Boolean).join(' · ')}</div>
        ${isList ? `<p class="card__desc">${esc(d.description)}</p>
          <div class="tagline card__chars">${d.characters.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
        ${isList ? `<div class="tagline" style="margin-top:6px">${tags}</div>` : ''}
      </div>
    </article>`;
  }

  function renderChips() {
    const chips = [];
    state.tags.forEach((t) => chips.push(`<button class="chip is-on" data-tag="${esc(t)}" style="background:${tagColor(t)}">${esc(t)} ✕</button>`));
    if (state.lang !== 'all') chips.push(`<button class="chip is-on" data-chipclear="lang">ภาษา: ${esc(langLabel[state.lang] || state.lang)} ✕</button>`);
    if (state.group !== 'all') chips.push(`<button class="chip is-on" data-chipclear="group">หมวด: ${state.group} ✕</button>`);
    if (state.orientation !== 'all') chips.push(`<button class="chip is-on" data-chipclear="orientation">ท่าทาง: ${state.orientation} ✕</button>`);
    if (state.date !== 'all') chips.push(`<button class="chip is-on" data-chipclear="date">ช่วงเวลา: ${state.date}d ✕</button>`);
    if (state.favsOnly) chips.push(`<button class="chip is-on" data-chipclear="favs">♥ ถูกใจเท่านั้น ✕</button>`);
    $('#activeChips').innerHTML = chips.length
      ? chips.join('') + `<button class="chip" data-chipclear="all" style="background:#555">ล้างทั้งหมด</button>` : '';
  }

  /* ---------------- เลื่อนลงเพื่อโหลดต่อ (infinite scroll) ----------------
     ไม่มีปุ่ม "หน้า 1/2/3" แล้ว — ผู้ใช้เลื่อนลงจนสุดขอบจอ ระบบจะต่อท้ายรายการให้ทีละชุด
     ยิ่งเลื่อนถึงก้นหน้าเร็วเท่าไรก็ขยายได้มากขึ้น (โตจาก CHUNK คู่ไป CHUNK สี่) จนกว่าจะครบคลัง */
  const CHUNK = 12;
  let shown = CHUNK;

  function resetScroll() {
    shown = CHUNK;
  }

  /* ต่อท้ายรายการที่ยังไม่แสดง — คืน true ถ้ายังมีของให้ต่อ */
  function grow() {
    const list = filtered().sort(SORTERS[state.sort] || SORTERS.newest);
    if (shown >= list.length) { paintSentinel(list.length); return false; }
    shown = Math.min(list.length, shown + CHUNK * Math.max(1, Math.floor(shown / CHUNK)));
    paintGrid(list);
    return true;
  }

  /* ย่อยส่วนที่แสดงแล้วพร้อมสถานะท้ายหน้า */
  function paintGrid(list) {
    const slice = list.slice(0, shown);
    $('#grid').classList.toggle('is-list', state.view === 'list');
    $('#grid').innerHTML = slice.map(cardHTML).join('');
    loadArtFallbacks($('#grid'));
    $('#empty').hidden = slice.length > 0;
    $('#crumbs').innerHTML = crumbsHTML(list.length, slice.length);
    paintSentinel(list.length);
    renderChips();
    buildSidebar();
    syncControls();
  }

  function paintSentinel(total) {
    const el = $('#sentinel');
    if (!el) return;
    const left = Math.max(0, total - shown);
    if (left === 0) {
      el.hidden = false;
      el.textContent = total ? '— ครบทั้งคลังแล้ว —' : '';
      el.classList.toggle('is-done', true);
    } else {
      el.hidden = false;
      el.classList.remove('is-done');
      el.textContent = 'เลื่อนลงเพื่อโหลดต่อ (เหลืออีก ' + left + ' รายการ)';
    }
  }

  const crumbsHTML = (total, shownCount) => {
    const parts = ['<b>' + total + '</b> รายการ'];
    if (state.q) parts.push('· ค้นหา “' + esc(state.q) + '”');
    if (state.favsOnly) parts.push('· ♥ ถูกใจเท่านั้น');
    if (shownCount < total) parts.push('· แสดง ' + shownCount);
    return parts.join(' ');
  };

  /* ตัวสังเกตการเลื่อน — ทำครั้งเดียว แล้วผูกไว้กับ #sentinel ตลอดอายุหน้า
     มีทางสำรองเป็นการคลิกที่แถบนี้ด้วย เผื่อ IntersectionObserver ไม่ยิง
     (เช่นในเบราว์เซอร์ที่ไม่ได้วาดเฟรม หรือผู้ใช้กดคีย์บอร์ด) */
  let scrollGuard = false;
  function bindSentinel() {
    const el = $('#sentinel');
    if (!el) return;
    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((x) => x.isIntersecting)) return;
        if (scrollGuard) return;
        scrollGuard = true;
        grow();
        // ป้องกันยิงซ้ำติด ๆ กันในเฟรมเดียว
        requestAnimationFrame(() => { scrollGuard = false; });
      }, { rootMargin: '600px 0px' });
      io.observe(el);
    }
  }

  function render() {
    const list = filtered().sort(SORTERS[state.sort] || SORTERS.newest);
    // ค้นหา/กรองใหม่ → เริ่มแสดงจากต้นเสมอ
    if (shown > list.length) resetScroll();
    paintGrid(list);
  }

  function syncControls() {
    $$('#sidebar .side-row').forEach((r) => {
      const key = r.dataset.lang || r.dataset.group || r.dataset.orientation || r.dataset.date;
      const map = { lang: state.lang, group: state.group, orientation: state.orientation, date: state.date };
      const which = r.dataset.lang ? 'lang' : r.dataset.group ? 'group' : r.dataset.orientation ? 'orientation' : 'date';
      r.classList.toggle('is-on', map[which] === key);
    });
    $$('#tagCloud .chip').forEach((c) => c.classList.toggle('is-on', state.tags.includes(c.dataset.tag)));
    $('#q').value = state.q;
    $('#sort').value = state.sort;
    $('#btnAnd').textContent = state.andMode ? 'AND' : 'OR';
    $('#btnAnd').classList.toggle('is-active', state.andMode);
    $('#btnFavs').classList.toggle('is-active', state.favsOnly);
    $('#favCount').textContent = favs.size;
    $$('.seg button').forEach((b) => b.classList.toggle('is-active', b.dataset.view === state.view));
  }

  /* ---------------- นำทางด้วย hash ---------------- */
  /* ค่าเริ่มต้นต้องตรงกับ writeHash() ด้านล่าง ไม่งั้นลิงก์ที่แชร์จะคืนสภาพไม่ครบ */
  const DEFAULTS = {
    q: '', lang: 'all', group: 'all', orientation: 'all', date: 'all',
    sort: 'newest', view: 'grid', andMode: false, favsOnly: false,
  };

  function readHash() {
    let raw = (location.hash || '').replace(/^#\/?/, '');
    // id ของข้อมูลสดเป็นสตริง เช่น "miku-vtps23" ห้ามแปลงเป็นตัวเลข
    if (raw.startsWith('d/')) return { view: 'detail', id: decodeURIComponent(raw.slice(2)) };

    // รับทั้งแบบ query (#/?q=femboy) และแบบ path (#/q/femboy) — ลิงก์ที่คนแชร์กันมาทั้งสองแบบ
    const pathQ = raw.match(/^q\/([^&]+)/);
    if (pathQ) raw = 'q=' + pathQ[1] + (raw.includes('&') ? '&' + raw.slice(raw.indexOf('&') + 1) : '');

    const p = new URLSearchParams(raw);
    Object.assign(state, DEFAULTS);
    state.q = p.get('q') || '';
    state.lang = p.get('lang') || DEFAULTS.lang;
    state.group = p.get('group') || DEFAULTS.group;
    state.orientation = p.get('orientation') || DEFAULTS.orientation;
    state.date = p.get('date') || DEFAULTS.date;
    state.sort = p.get('sort') || DEFAULTS.sort;
    state.view = p.get('view') || DEFAULTS.view;
    state.andMode = p.get('andMode') === '1';
    state.favsOnly = p.get('favsOnly') === '1';
    state.tags = (p.get('tags') || '').split(',').filter(Boolean);
    return { view: 'list' };
  }

  function writeHash(replace) {
    const p = new URLSearchParams();
    ['q', 'lang', 'group', 'orientation', 'date', 'sort', 'view'].forEach((k) => {
      if (state[k] && state[k] !== DEFAULTS[k]) p.set(k, state[k]);
    });
    if (state.tags.length) p.set('tags', state.tags.join(','));
    if (state.andMode) p.set('andMode', '1');
    if (state.favsOnly) p.set('favsOnly', '1');
    const url = '#/' + p.toString();
    if (replace) history.replaceState(null, '', url); else location.hash = url;
  }

  function onRoute() {
    const r = readHash();
    if (r.view === 'detail') { openDetail(r.id); render(); return; }
    closeDetail();
    // ถ้าออกจากหน้ารายละเอียด/ลิงก์อื่นขณะตัวอ่านยังเปิดอยู่ ให้ปิดด้วย
    if (!$('#reader').hidden) closeReader();
    render();
  }

  /* ---------------- หน้ารายละเอียด ---------------- */
  let currentId = null;
  async function openDetail(id) {
    const seed = library.find((x) => x.id === id);
    if (!seed) return;
    currentId = id;
    paintDetail(seed, true);

    // ดึงรายละเอียดจริง (จำนวนหน้า, ศิลปิน, แท็ก) ถ้ายังไม่มี
    if (!seed.pageUrls) {
      const full = await hydrate(id);
      if (currentId === id && full) paintDetail(full, false);
    }
  }

  function paintDetail(d, loading) {
    const on = favs.has(d.id);
    const lang = langLabel[d.language] || d.language || '?';
    const rating = d.rating || 0;
    $('#detail').innerHTML = `<div class="detail">
      <div>
        <div class="detail__cover"><img src="${esc(coverArt(d))}" data-fb="${esc(fallbackArt(d))}" alt="ปก" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(fallbackArt(d))}'"></div>
        <div class="detail__actions">
          <button class="btn btn--primary" data-read="${d.id}">▶ อ่าน ${d.pages || '?'} หน้า</button>
          <button class="btn" data-fav="${d.id}">${on ? '♥ ถูกใจแล้ว' : '♡ ถูกใจ'}</button>
          ${d.readUrl ? `<a class="btn btn--ghost" href="${esc(d.readUrl)}" target="_blank" rel="noopener noreferrer">↗ ต้นทาง</a>` : ''}
        </div>
        ${loading ? '<div class="detail__loading">⏳ กำลังโหลดรายละเอียดจากต้นทาง…</div>' : ''}
      </div>
      <div>
        <h2>${esc(d.title)}</h2>
        ${d.title_jp ? `<div class="muted">${esc(d.title_jp)}</div>` : ''}
        ${rating ? `<div class="stars">${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))} ${rating.toFixed(2)}</div>` : ''}
        <dl class="kv">
          <dt>ผู้วาด</dt><dd>${esc(d.artist || 'Unknown')}</dd>
          <dt>Circle/ซีรีส์</dt><dd>${esc(d.circle || 'Unknown')}</dd>
          ${d.favorites ? `<dt>♥ ถูกใจ</dt><dd>${d.favorites.toLocaleString()}</dd>` : ''}
          <dt>ภาษา</dt><dd>${esc(lang)}</dd>
          <dt>หน้า</dt><dd>${d.pages || '?'}</dd>
          <dt>วันที่</dt><dd>${esc(d.date || '?')}</dd>
          ${(d.characters || []).length ? `<dt>ตัวละคร</dt><dd>${d.characters.map((c) => `<span class="chip" style="background:#4a4a55">${esc(c)}</span>`).join(' ')}</dd>` : ''}
          <dt>ต้นทาง</dt><dd><a href="${esc(d.readUrl || '#')}" target="_blank" rel="noopener noreferrer">${esc(d.source || '?')} #${esc(d.source_id || '?')}</a></dd>
        </dl>
        ${d.description ? `<div class="detail__desc">${esc(d.description)}</div>` : ''}
        <div class="tagline">${(d.tags || []).map((t) =>
          `<button class="chip" data-tag="${esc(t)}" style="background:${tagColor(t)}">${esc(t)}</button>`).join('')}</div>
      </div>
    </div>`;
    loadArtFallbacks($('#detail'));
    $('#modal').hidden = false;
  }
  const closeDetail = () => { $('#modal').hidden = true; currentId = null; };

  /* ---------------- ตัวอ่าน ---------------- */
  let reading = null, page = 1;
  async function openReader(id) {
    let d = library.find((x) => x.id === id);
    if (!d) return;
    // ยังไม่มี URL รูป → โหลดรายละเอียดก่อนเปิดอ่าน
    if (!d.pageUrls) {
      $('#rTitle').textContent = 'กำลังโหลด…';
      $('#reader').hidden = false;
      $('#rStage').innerHTML = '<div class="reader__note">⏳ กำลังโหลดหน้าจากต้นทาง…</div>';
      $('#rThumbs').innerHTML = '';
      document.body.style.overflow = 'hidden';
      const full = await hydrate(id);
      if (!full || !full.pageUrls) {
        $('#rStage').innerHTML = '<div class="reader__note">โหลดหน้าอ่านไม่สำเร็จ — <a href="' + esc(d.readUrl || '#') + '" target="_blank" rel="noopener noreferrer">เปิดที่ต้นทาง</a></div>';
        return;
      }
      d = full;
    }
    reading = d; page = 1;
    $('#reader').hidden = false;
    $('#rTitle').textContent = shortTitle(d);
    document.body.style.overflow = 'hidden';
    drawReader();
  }
  function closeReader() {
    reading = null;
    $('#reader').hidden = true;
    document.body.style.overflow = '';
  }
  function drawReader() {
    if (!reading) return;
    const urls = reading.pageUrls || [];
    const total = urls.length || reading.pages || 1;
    page = Math.min(total, Math.max(1, page));
    const src = urls[page - 1] || coverArt(reading);
    const lang = (reading.language || '').toUpperCase();
    $('#rCount').textContent = `${page} / ${total}${lang ? ' · ' + lang : ''}`;
    $('#rStage').innerHTML = `<div class="reader__page">
      <img src="${esc(src)}" alt="หน้า ${page}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(coverArt(reading))}'">
      ${urls.length ? `<div class="reader__note">หน้าที่ ${page} โหลดตรงจาก ${esc(reading.source || 'ต้นทาง')}${reading.readUrl ? ' · <a href="' + esc(reading.readUrl) + '" target="_blank" rel="noopener noreferrer">เปิดต้นทาง</a>' : ''}</div>` : ''}
    </div>`;
    // ทำ thumbnail เฉพาะหน้าที่อยู่ใกล้ ไม่สร้างทั้งเล่มพร้อมกัน
    const from = Math.max(1, page - 3);
    const to = Math.min(total, page + 8);
    let thumbs = '';
    for (let i = from; i <= to; i++) {
      thumbs += `<button class="reader__thumb ${i === page ? 'is-on' : ''}" data-page="${i}">
        <img loading="lazy" src="${esc(urls[i - 1] || '')}" alt="หน้า ${i}" referrerpolicy="no-referrer">
      </button>`;
    }
    $('#rThumbs').innerHTML = thumbs;
    const on = $('#rThumbs .is-on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  const turn = (d) => {
    if (!reading) return;
    page = Math.min(reading.pages, Math.max(1, page + d));
    drawReader();
  };

  /* ---------------- Toast ---------------- */
  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('is-on'), 1800);
  }

  /* ---------------- การกรองแท็ก ---------------- */
  function toggleTag(t) {
    const i = state.tags.indexOf(t);
    if (i >= 0) state.tags.splice(i, 1); else state.tags.push(t);
    resetScroll();
    writeHash();
    render();
  }

  /* ---------------- เหตุการณ์ ---------------- */
  function bind() {
    // age gate
    const gate = $('#gate');
    if (localStorage.getItem('femboy-vault:adult') === 'yes') gate.hidden = true;
    $('#gateOk').onclick = () => { localStorage.setItem('femboy-vault:adult', 'yes'); gate.hidden = true; };
    $('#gateNo').onclick = () => { document.body.innerHTML = '<p style="padding:40px;text-align:center;color:#a2a2b0">ออกแล้ว</p>'; };

    // ค้นหาแบบ debounce → ยิงไปยังต้นทางจริง
    let qT;
    $('#q').addEventListener('input', (e) => {
      clearTimeout(qT);
      const v = e.target.value;
      qT = setTimeout(() => {
        state.q = v.trim();
        writeHash(true);
        searchLive(state.q).then(render);
      }, 420);
    });

    // เลือกแหล่งข้อมูล
    $('#srcSel').onchange = (e) => {
      enabledSources = e.target.value.split(',');
      localStorage.setItem('femboy-vault:src', e.target.value);
      if (state.q) searchLive(state.q).then(render);
      else loadLanding();
    };

    $('#sort').onchange = (e) => { state.sort = e.target.value; resetScroll(); writeHash(); render(); };

    $('#btnFavs').onclick = () => { state.favsOnly = !state.favsOnly; resetScroll(); writeHash(); render(); };
    $('#btnAnd').onclick = () => { state.andMode = !state.andMode; writeHash(); render(); toast('โหมดกรองแท็ก: ' + (state.andMode ? 'AND (ต้องมีครบ)' : 'OR (มีอย่างน้อย 1)')); };
    $('#btnView').onclick = () => {
      state.view = state.view === 'grid' ? 'list' : 'grid';
      writeHash(); render();
    };
    $('#btnRandom').onclick = () => {
      const d = library[Math.floor(Math.random() * library.length)];
      location.hash = `#/d/${d.id}`;
    };

    // เปิด/ปิดตัวกรองบนมือถือ
    // สแกนเพิ่ม: ไล่หน้าใหม่ของเว็บเพื่อเติมคลัง (ต้องไม่ยิงซ้อนกับที่กำลังสแกนอยู่)
    $('#btnScan').onclick = () => {
      if (scanState.running) { stopScan(); toast('หยุดการสแกนแล้ว'); return; }
      if (state.q) { toast('ล้างช่องค้นก่อน แล้วค่อยสแกนทั้งคลัง'); return; }
      startScan();
    };

    $('#btnFilter').onclick = () => {
      const sb = $('#sidebar');
      const open = sb.classList.toggle('is-open');
      $('#btnFilter').setAttribute('aria-expanded', String(open));
    };

    // แตะตัวกรองบนมือถือแล้วเลือกอะไร → ปิดกล่องให้เห็นผลลัพธ์ทันที
    $('#sidebar').addEventListener('click', (e) => {
      if (e.target.closest('.side-row, .chip, [data-clear]')) {
        if (window.matchMedia('(max-width: 900px)').matches) $('#sidebar').classList.remove('is-open');
      }
    });

    // sidebar + sidebar chips
    document.addEventListener('click', (e) => {
      const row = e.target.closest('.side-row');
      if (row) {
        const which = row.dataset.lang ? 'lang' : row.dataset.group ? 'group' : row.dataset.orientation ? 'orientation' : 'date';
        state[which] = row.dataset[which];
                writeHash(); render();
        return;
      }
      const chip = e.target.closest('.chip');
      if (chip && chip.dataset.tag) { toggleTag(chip.dataset.tag); return; }
      if (chip && chip.dataset.chipclear) {
        const c = chip.dataset.chipclear;
        if (c === 'favs') state.favsOnly = false;
        else state[c] = 'all';
        if (c === 'all') { state.tags = []; state.q = ''; state.favsOnly = false; }
                writeHash(); render();
        return;
      }
      const clear = e.target.closest('[data-clear]');
      if (clear) {
        const k = clear.dataset.clear;
        if (k === 'tags') state.tags = []; else state[k] = 'all';
        resetScroll(); writeHash(); render();
        return;
      }
      const fav = e.target.closest('[data-fav]');
      if (fav) {
        const id = fav.dataset.fav;
        if (favs.has(id)) { favs.delete(id); } else { favs.add(id); toast('เพิ่มในรายการถูกใจแล้ว ♥'); }
        saveFavs(); writeHash(true); render();
        if (currentId) openDetail(currentId);
        return;
      }
      const open = e.target.closest('[data-open]');
      if (open) { e.preventDefault(); location.hash = `#/d/${open.dataset.open}`; return; }
      const read = e.target.closest('[data-read]');
      if (read) { openReader(read.dataset.read); return; }
      const rt = e.target.closest('#rThumbs [data-page]');
      if (rt) { page = Number(rt.dataset.page); drawReader(); return; }
      if (e.target.closest('.seg button')) {
        state.view = e.target.closest('.seg button').dataset.view;
        writeHash(); render();
      }
    });

    $('#btnReset').onclick = () => {
      state.tags = []; state.q = ''; state.lang = state.group = state.orientation = state.date = 'all';
      state.favsOnly = false;
      resetScroll(); writeHash(); render();
    };

    $('#modalClose').onclick = closeDetail;
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeDetail(); });
    $('#rClose').onclick = closeReader;
    $('#rPrev').onclick = () => turn(-1);
    $('#rNext').onclick = () => turn(1);
    $('#rStage').addEventListener('click', (e) => { if (e.offsetX > e.currentTarget.offsetWidth / 2) turn(1); else turn(-1); });

    document.addEventListener('keydown', (e) => {
      if (!$('#reader').hidden) {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); turn(1); }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); turn(-1); }
        if (e.key === 'Home') { page = 1; drawReader(); }
        if (e.key === 'End') { page = reading.pages; drawReader(); }
        if (e.key === 'Escape') closeReader();
        return;
      }
      if (e.key === 'Escape' && !$('#modal').hidden) { history.hash = '#/'; closeDetail(); }
      if (e.key === '/' && document.activeElement !== $('#q')) { e.preventDefault(); $('#q').focus(); }
    });

    bindSentinel();
    // ทางสำรอง: คลิกที่แถบบอกสถานะท้ายรายการเพื่อโหลดเพิ่ม (ใช้ได้แม้ auto-scroll ไม่ทำงาน)
    const sen = $('#sentinel');
    if (sen) {
      sen.style.cursor = 'pointer';
      sen.title = 'คลิกเพื่อโหลดรายการเพิ่ม';
      sen.addEventListener('click', () => { grow(); });
    }
  window.addEventListener('hashchange', onRoute);
  }

  /* หน้าแรก: ไล่หน้าล่าสุดของทุกแหล่ง (ได้ทันที ไม่ต้องค้น) แล้วค่อยไล่หน้า 1..N ต่อแบบเบื้องหลัง
   ผู้ใช้สั่ง "เอาทุกอย่างที่เจอเลย" → คลังจะเติมเองเรื่อย ๆ ไม่ต้องกดหาเอง
   ไม่มีข้อมูลสำรองให้แต่ง — ถ้าต้นทางล่มก็บอกตรง ๆ */
  let scanState = { running: false, pos: {}, found: 0, error: '' };
  let scanAbort = null;

  const SCAN_BATCH = 60;         // จำนวนหน้าต่อรอบ (proxy จำกัด 40 req/นาที/host → ~1.7 นาที)
  const SCAN_GAP_MS = 1700;      // เว้นระหว่างคำขอให้ไม่โดน 429
  const SCAN_KEY = 'femboy-vault:scan';

  /* ตำแหน่งหน้าที่สแกนถึงแล้ว เก็บใน localStorage — กด "สแกนเพิ่ม"ทีหลังจะไล่ต่อจากจุดเดิม
     doujin-th มี ~1,960 หน้า ถ้าไล่รวดเดียวใช้เวลาเกือบ 1 ชั่วโมง จึงแบ่งเป็นชุดละ 60 */
  const loadPos = () => { try { return JSON.parse(localStorage.getItem(SCAN_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const savePos = (p) => { try { localStorage.setItem(SCAN_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } };

  function scanTargets() {
    return enabledSources
      .map((id) => ({ id, ad: adapters[id], total: (adapters[id] && adapters[id].totalPages) || SCAN_BATCH }))
      .filter((t) => t.ad && typeof t.ad.scanPage === 'function');
  }

  function scanProgress() {
    const ts = scanTargets();
    let done = 0, total = 0;
    ts.forEach((t) => { done += Math.min(t.total, scanState.pos[t.id] || 0); total += t.total; });
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  async function loadLanding() {
    if (scanAbort) { try { scanAbort.abort(); } catch (e) { /* ignore */ } }
    setStatus('⏳ กำลังดึงข้อมูลล่าสุดจาก ' + enabledSources.map(srcName).join(', ') + '…', 'load');

    const ctrl = new AbortController();
    inflight = ctrl;
    // หน้าแรกให้ adapter เลือกวิธีเอง: landing() ไล่หน้าล่าสุดโดยไม่ต้องค้นคำใด ๆ
    // (ผู้ใช้สั่ง "เอาทุกอย่างที่เจอเลย ไม่ต้องค้น") ส่วนที่ไม่มี landing() ใช้ search('') แทน
    const results = await Promise.allSettled(
      enabledSources.map((id) => {
        const ad = adapters[id];
        return ad.landing ? ad.landing(ctrl.signal) : ad.search('', ctrl.signal);
      })
    );
    if (ctrl.signal.aborted) return;

    // นับรายการที่ผ่านกฎแยกตามแหล่ง เพื่อบอกความจริงว่าข้อมูลมาจากไหน — บางแหล่งอาจตอบ 200
    // แต่ว่างเปล่า (เช่น miku-doujin ตอบ stub 2KB) ถ้าเขียนชื่อแหล่งแรกตายตัวจะโกหกผู้ใช้
    const items = [];
    const errors = [];
    const hitNames = [];
    const blankNames = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        errors.push(srcName(enabledSources[i]) + ': ' + (r.reason && r.reason.message || 'ล้มเหลว'));
        return;
      }
      const v = r.value;        const got = allowed(Array.isArray(v) ? v : v && v.items);
      if (got.length) hitNames.push(srcName(enabledSources[i]) + ' (' + got.length + ')');
      else blankNames.push(srcName(enabledSources[i]));
      items.push(...got);
    });

    library = items.map(SRC.normalize);
    usingLive = true;
    sourceNote = errors.join(' · ');
    detailCache.clear();
    render();

    const blankNote = blankNames.length
      ? ' · ไม่ตอบรายการ: ' + esc(blankNames.join(', '))
      : '';
    // แหล่งที่ล้มต้องต้องบอกเสมอ แม้แหล่งอื่นจะมีข้อมูล — ไม่งั้นผู้ใช้คิดว่าทุกแหล่งทำงาน
    const failNote = errors.length ? ' · ไม่สำเร็จ: ' + esc(sourceNote) : '';

    if (!library.length) {
      setStatus(errors.length
        ? '⚠️ ติดต่อต้นทางไม่สำเร็จ (' + esc(sourceNote) + ') — ยังไม่มีข้อมูลสำรอง ลองใหม่อีกครั้ง'
        : '🔎 ต้นทางตอบกลับปกติ แต่ยังไม่มีรายการ'
          + (blankNames.length ? ' — ' + esc(blankNames.join(', ')) + ' คืนผลว่าง' : '')
          + ' — กด "สแกนหาเพิ่ม" เพื่อไล่หน้าใหม่', errors.length ? 'warn' : '');
    } else {
      setStatus('✅ พบ <b>' + library.length + '</b> รายการจาก '
        + esc(hitNames.join(' + ')) + ' · ปกโหลดตรงจากต้นทาง'
        + blankNote + failNote + ' · กำลังไล่หน้าที่เหลือแบบเบื้องหลัง', errors.length ? 'warn' : 'ok');
    }

    startScan();
  }

  /* ไล่หน้าของทุกแหล่งที่เปิดสแกนได้ แล้วเก็บทุกอย่างที่ผ่านกฎ (ตอนนี้กฎเหลือแค่ตัดแนว furry)
     ทำทีละหน้า เว้นเวลาไม่ให้โดน rate limit
     ผู้ใช้สั่ง "เอาทุกอย่างที่เจอเลย ไม่ต้องค้น" → ไล่ต่อเนื่องในเบื้องหลังจนกว่าจะครบ
     ทุกแหล่งหรือผู้ใช้กดหยุด (SCAN_BATCH ใช้แค่เป็นจังหวะเซฟตำแหน่ง/อัปเดตสถานะ) */
  async function startScan() {
    if (scanState.running) return;
    const targets = scanTargets();
    // แหล่งที่เลือกไม่มีหน้าแบบไล่หา (เช่น neko ที่ค้นผ่าน API) — ไม่ต้องเขียนทับ
    // ข้อความสถานะจริงจากการค้นหา ไม่งั้นผู้ใช้จะไม่เห็นว่าต้นทางล่มหรือถูกบล็อก
    if (!targets.length) return;

    scanState = { running: true, pos: Object.assign(loadPos(), scanState.pos), found: 0, error: '' };
    scanAbort = new AbortController();
    const ctrl = scanAbort;
    paintScanBtn();

    try {
      let done = false;
      while (!done) {
        done = true;
        for (const t of targets) {
          // เริ่มจากหน้าที่ค้างไว้ ถ้าไล่ครบแล้วให้ข้ามไป (ไม่ยิงซ้ำหน้าสุดท้าย)
          const from = Math.max(1, scanState.pos[t.id] || 1);
          if (from > t.total) continue;
          done = false;
          for (let p = from; p <= Math.min(t.total, from + SCAN_BATCH - 1); p++) {
            if (ctrl.signal.aborted) throw new Error('ยกเลิก');
            const pr = scanProgress();
            setStatus('🔎 ไล่ ' + esc(srcName(t.id)) + ' หน้า ' + p + '/' + t.total
              + ' — รวมทั้งคลัง ' + pr.pct + '% · เก็บแล้ว <b>' + library.length + '</b> รายการ'
              + ' · ทำงานต่อเนื่องในเบื้องหลัง กด "หยุด" ได้ตลอด', 'load');
            const found = allowed(await t.ad.scanPage(p, ctrl.signal));
            if (found.length) {
              library = mergeUnique(library, found.map(SRC.normalize));
              scanState.found += found.length;
              detailCache.clear();
              render();
            }
            scanState.pos[t.id] = p + 1;
            savePos(scanState.pos);
            paintScanBtn();
            await new Promise((res, rej) => {
              const tm = setTimeout(res, SCAN_GAP_MS);
              ctrl.signal.addEventListener('abort', () => { clearTimeout(tm); rej(new Error('ยกเลิก')); }, { once: true });
            });
          }
        }
      }
      if (!ctrl.signal.aborted) {
        scanState.running = false;
        const pr = scanProgress();
        setStatus(pr.done >= pr.total
          ? '✅ ไล่ครบทุกแหล่งแล้ว (' + pr.total + ' หน้า) — รวม <b>' + library.length + '</b> รายการ'
          : '✅ ไล่เสร็จรอบนี้ ' + pr.pct + '% (' + pr.done + '/' + pr.total + ' หน้า) — รวม <b>'
            + library.length + '</b> รายการ · กด "สแกนเพิ่ม" เพื่อไล่ต่อ', library.length ? 'ok' : '');
      }
    } catch (e) {
      scanState.running = false;
      scanState.error = e.message || 'หยุดการสแกน';
      // abort เอง (ผู้ใช้กดหยุด) stopScan() จะเขียนข้อความแล้ว ไม่ต้องเขียนซ้ำ
      if (!/ยกเลิก/.test(scanState.error)) {
        setStatus('⚠️ สแกนหยุดที่ ' + pr2() + ' — ' + esc(scanState.error), 'warn');
      }
    }
    paintScanBtn();
  }
  const pr2 = () => { const p = scanProgress(); return p.pct + '%'; };

  function stopScan() {
    if (scanAbort) { try { scanAbort.abort(); } catch (e) { /* ignore */ } }
    scanState.running = false;
    const p = scanProgress();
    setStatus('⏸ หยุดการสแกนที่ ' + p.pct + '% (' + p.done + '/' + p.total + ' หน้า) — ตอนนี้มี '
      + library.length + ' รายการ (กด "สแกนเพิ่ม" เพื่อไล่ต่อจากจุดเดิม)');
    paintScanBtn();
  }

  /* ปุ่มสแกนต้องสะท้อนสถานะจริงเสมอ ไม่งั้นผู้ใช้กดแล้วไม่รู้ว่าหยุดหรือยัง */
  function paintScanBtn() {
    const b = $('#btnScan');
    if (!b) return;
    const p = scanProgress();
    b.textContent = scanState.running ? '⏸ หยุด (' + p.pct + '%)' : '⟳ สแกนเพิ่ม';
    b.title = 'ไล่หน้าใหม่ของทุกแหล่งแล้วเติมคลังอัตโนมัติ · ไล่แล้ว ' + p.done + '/' + p.total + ' หน้า';
    b.classList.toggle('is-active', scanState.running);
  }

  /* ---------------- เริ่ม ---------------- */
  buildSidebar();
  bind();
  onRoute();

  // คืนค่าแหล่งข้อมูลที่เลือกไว้ และค้นหาทันทีถ้ามี query ใน URL
  const savedSrc = localStorage.getItem('femboy-vault:src');
  if (savedSrc && $('#srcSel').querySelector(`option[value="${savedSrc}"]`)) {
    $('#srcSel').value = savedSrc;
    enabledSources = savedSrc.split(',');
  }
  /* เรียกซ้ำหลังคลังข้อมูลมาแล้ว: ตอนบูต onRoute() ยังไม่มีรายการให้เปิด
     ลิงก์แชร์แบบ #/d/<id> จึงต้องรอให้คลังโหลดเสร็จก่อนค่อยเปิดหน้ารายละเอียด */
  const reRoute = () => onRoute();

  if (state.q) searchLive(state.q).then(() => { render(); reRoute(); });
  else loadLanding().then(reRoute);

  window.FEMBOY.app = {
    get library() { return library; },
    state, render, coverArt, filtered, searchLive, hydrate, setStatus, grow,
    get usingLive() { return usingLive; },
    get scan() { return { ...scanState }; },
    startScan, stopScan,
  }; // สำหรับ debug
})();
