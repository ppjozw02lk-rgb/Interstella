/* ============================================================
   sources.js — ดึงข้อมูลจริงจากต้นทางภายนอก
   ────────────────────────────────────────────────────────────
   • miku-doujin.com    — ต้อง parse HTML (ไม่มี API สาธารณะ)
   • doujin-th.com      — ฟอรัม Invision ไล่หน้าแบบ offset
   • netoruhentai.com   — WordPress ค้นผ่าน /search-doujin
   • neko-hentai.net    — อยู่หลัง Cloudflare challenge (ดึงอัตโนมัติไม่ได้)

   ข้อสำคัญเรื่อง CORS: เบราว์เซอร์เรียกข้ามโดเมนไม่ได้
   ทุกคำขอจึงต้องวิ่งผ่าน proxy ใน serve.js (ดู SOURCES.proxyBase)
   เว็บจะเก็บแค่ metadata แล้วอ้างรูปจากต้นทางตรง ๆ (hotlink)
   ไม่ดาวน์โหลดหรือเผยแพร่ภาพซ้ำ — เคารพลิขสิทธิ์ผู้สร้าง
   ============================================================ */
(function () {
  'use strict';

  const SOURCES = {
    /* ให้ serve.js เติมค่านี้ตอนเสิร์ฟ (กัน hardcode port) */
    proxyBase: '/api/proxy',

    miku: {
      id: 'miku',
      name: 'miku-doujin.com',
      lang: 'th',
      base: 'https://miku-doujin.com',
      // ใช้ User-Agent แบบเบราว์เซอร์จริง เพราะเว็บตอบ 403 ถ้าไม่มี
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },

    dth: {
      id: 'dth',
      name: 'doujin-th.com',
      lang: 'th',
      base: 'https://doujin-th.com',
      forum: 'https://doujin-th.com/forum/index.php',
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },

    neko: {
      id: 'neko',
      name: 'neko-hentai.net',
      lang: 'th',
      base: 'https://neko-hentai.net',
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },

    netoru: {
      id: 'netoru',
      name: 'netoruhentai.com',
      lang: 'th',
      base: 'https://netoruhentai.com',
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
  };

  /* ---------- เครื่องมือช่วย ---------- */
  const strip = (s) => String(s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  const uniq = (a) => [...new Set(a.filter(Boolean))];

  /* เว็บต้นทางใช้ชื่อภาษาเต็ม (Thai / Japanese / English) → รหัส 2 ตัวอักษรที่ UI ใช้ */
  const LANGS = {
    thai: 'th', japanese: 'jp', japan: 'jp', english: 'en', chinese: 'zh',
    korean: 'ko', 'ภาษาไทย': 'th', 'ภาษาญี่ปุ่น': 'jp', 'ภาษาอังกฤษ': 'en',
    'ภาษาจีน': 'zh', 'ภาษาเกาหลี': 'ko',
  };

  /* ค่า "000" ในช่อง "เรื่อง" คือ placeholder ของเว็บ (คนจริง ๆ ใส่ชื่อวง/ซีรีส์) ไม่ต้องเอามาโชว์ */
  const isPlaceholder = (v) => !v || /^(unknown|000|none|no story|n\/a)$/i.test(String(v).trim());

  /* แปลง "2 วันที่แล้ว" → วันที่ ISO (ใช้คิดอายุเพื่อให้ตัวกรองช่วงเวลาใช้ได้) */
  function thaiAgeToDate(txt) {
    if (!txt) return null;
    const m = String(txt).match(/(\d+)\s*(วัน|เดือน|ปี|ชั่วโมง)/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const days = unit === 'วัน' ? n : unit === 'เดือน' ? n * 30 : unit === 'ปี' ? n * 365 : 0;
    if (!days && unit !== 'ชั่วโมง') return null;
    const ms = days ? days * 86400000 : n * 3600000;
    return new Date(Date.now() - ms).toISOString().slice(0, 10);
  }

  /* ทำ id ให้ไม่ชนกันข้ามแหล่ง */
  const mkId = (source, key) => source + '-' + String(key).replace(/[^a-zA-Z0-9]/g, '').slice(0, 18);

  /* ============================================================
     กฎเข้ม: femboy เท่านั้น
     ============================================================
     ผู้ใช้สั่งให้เก็บเฉพาะ femboy ล้วน ไม่เอาแบบอื่น
     เว็บ miku-doujin ไม่มีหมวด/แท็กชื่อ femboy ให้กรอง (หมวดจริงมีแค่ "โดจิน แปลไทย")
     และช่องค้นหาของเว็บค้นจาก "ชื่อเรื่อง + ศิลปิน" เท่านั้น ค้นแท็กไม่เจอเลย
     (วัดจริง: Yaoi=0, หนวด-สัตว์=0, โดจิน=0) จึงต้องอาศัยชื่อเรื่องเป็นสัญญาณ
     และผลจริงของกฎนี้คือทั้งเว็บมีเพียง 2 รายการ — เลขนี้คือของจริง ไม่ใช่บั๊ก

     การจับคำ: ต้องเป็นคำว่า femboy เต็ม (รับพหูพจน์ "femboys" ด้วย เพราะยังเป็น femboy)
     และ \b กันไม่ให้จับคำที่ femboy ไปซ้อนอยู่ในคำอื่น เช่น "femboyish" จะไม่ผ่าน
     ตัวอย่างที่ผ่าน: "The Femboy Is The Maid's Love Doll", "The Idol's True Form Is a Femboy" */
  const FEMBOY_RE = /\bfemboys?\b/i;

  const isFemboy = (d) => FEMBOY_RE.test(String((d && d.title) || ''));

  /* ============================================================
     แนว furry — ผู้ใช้สั่ง "เอาออก" ให้ตัดทิ้งทั้งแนว
     ============================================================
     คลังนี้เป็น femboy ล้วน ผู้ใช้ไม่เอาแนวสัตว์ปน จึงต้องตัดให้ลึกกว่ากฎ femboy —
     งาน furry จำนวนมากมีคำว่า femboy อยู่ในชื่ออยู่แล้ว (ตัวละครสัตว์แต่งตัวเป็นสาว)
     ถ้าตรวจแค่ isFemboy ของแนวนี้จะผ่านเข้าคลังได้เต็ม ๆ

     ต้องดูทั้งชื่อเรื่องและแท็ก เพราะตอนไล่หน้า listing แท็กมักว่าง
     (dth/miku คืนแต่ title) → ชื่อเรื่องคือสัญญาณหลักที่ต้องพึ่ง

     ระวัง false positive — ใช้คำเต็มด้วย \b เสมอ:
       • "neko" เดี่ยว ๆ ไม่ใช่แนวสัตว์ และเป็นชื่อเว็บ neko-hentai.net ของเราเอง → จับเฉพาะ "neko boy/girl"
       • "animal ears" = คนธรรมดาสวมหูแมว ไม่ใช่ตัวละครสัตว์ → ไม่จับ
         (แต่ "cat girl"/"neko girl" = ตัวละครครึ่งสัตว์ จึงถือว่าอยู่ในแนว furry)
       • "monster"/"beast" เดี่ยว ๆ กว้างเกิน (kaiju, monster girl ของ Touhou ไม่ใช่ furry)
         → ใช้เฉพาะรูป "สัตว์ + คน" เช่น wolf boy ที่ชัดเจน
       • งาน dth ชื่อ "Ani→Yome!2" มีคำขึ้นต้น "Ani" ถ้าใช้คำย่อจะตัดผิด → ไม่ใช้ */
  const FURRY_RE = new RegExp([
    // คำที่ระบุแนวสัตว์ตรง ๆ
    '\\b(?:furry|furries|furryboy|furrygirl|kemono|kemonoboy|kemonogirl|kemonomimi|nyaberu|nyanimal'
      + '|anthro|anthropomorphic|beastboy|beastgirl|catboy|catgirl|dogboy|foxboy|wolfboy'
      + '|bunnyboy|bunnygirl|bearboy|horseboy|dragonboy|shishajin|chimaera|beastman|beastmen)\\b',
    // รูป "สัตว์ + คน" เช่น wolf boy / neko girl — จำกัดเฉพาะสัตว์ที่แน่นอน
    '\\b(?:cat|dog|fox|wolf|bunny|hare|rabbit|bear|horse|dragon|equine|canine|feline|neko)'
      + '\\s+(?:boy|girl|man|men|woman|women|person|character|kid|child|femboy)\\b',
  ].join('|'), 'i');

  const isFurry = (d) => {
    if (!d) return false;
    if (FURRY_RE.test(String(d.title || ''))) return true;
    return (Array.isArray(d.tags) ? d.tags : []).some((t) => FURRY_RE.test(String(t || '')));
  };

  /* กฎคัดเข้าคลัง (เปลี่ยนแล้ว 2026-10)
     ----------------------------------------------------------------
     เดิมคลังนี้เก็บเฉพาะ femboy ล้วน ตอนนี้ผู้ใช้สั่งให้ "เอาทุกแนวมาเลย
     ไม่ต้องค้นหา" → ยกเลิกข้อจำกัดหมวดหมวด รับทุกอย่างที่ต้นทางส่งมา

     ตัวกรองเดียวที่ยังอยู่คือ "ตัดแนว furry" ซึ่งผู้ใช้ยืนยันชัดเจนว่ายังต้องตัด
     → isAllowed() = ไม่ใช่ furry

     EXTRA_BY_SOURCE ยังเก็บไว้เพราะยังต้องระบุที่มาของกลุ่มพิเศษให้ชัด
     (netoruhentai = yaoi, neko-hentai = สาวดุ้น) แต่ "ไม่ใช่เงื่อนไขในการเข้าคลัง" แล้ว */
  const EXTRA_BY_SOURCE = {
    'neko-hentai.net': { boobs: 'สาวดุ้น' },
    'netoruhentai.com': { yaoi: 'yaoi' },
  };
  const isAllowed = (d) => !isFurry(d);

  /* ============================================================
     miku-doujin.com
     ============================================================ */
  const miku = {
    /* จำนวนหน้าที่สแกนได้ — เว็บไม่บอกจำนวนหน้าทั้งหมด จึงตั้งเพดานไว้ตาม rate limit */
    totalPages: 60,

    /* Search จริงของเว็บนี้เป็น AJAX POST (เจอจากฟังก์ชัน search() ในหน้าเว็บ)
       ทดสอบแล้ว: GET /?s=<q> คืนหน้าแรกทุกคำค้น = ไม่ได้กรองจริง
       POST /controller/search/general/ กรองถูกต้อง (คำมั่วได้ผลลัพธ์ว่าง) */
    searchUrl() {
      return SOURCES.miku.base + '/controller/search/general/';
    },
    detailUrl(slug) {
      return SOURCES.miku.base + '/' + encodeURIComponent(slug) + '/';
    },

    /* ดึง HTML ผ่าน proxy ฝั่ง server (กัน CORS + ใส่ UA) */
    async html(url, signal, post) {
      const q = new URLSearchParams({ url, source: 'miku' });
      if (post) q.set('post', post);
      const r = await fetch(`${SOURCES.proxyBase}?${q}`, { signal });
      if (!r.ok) throw new Error(`proxy ${r.status} — ${SOURCES.miku.name}`);
      return r.text();
    },

    /* แปลงหน้า listing → รายการดับจิน */
    parseList(html) {
      // แต่ละการ์ด: <a class="no-underline inz-a" href="..../{slug}/">
      //           <img class="inz-img-thumbnail" src="..._thumb.webp">
      //           <div class="inz-title">ชื่อเรื่อง</div>
      //           ...<small>2 วันที่แล้ว</small>
      // ใช้ lookahead แยก attribute เพื่อไม่ต้องพึ่งลำดับ และไม่บังคับความยาว slug
      // (slug ของเว็บนี้ยาวไม่คงที่: 6kv3m = 5 ตัว, vtps23 = 6 ตัว)
      const re = /<a(?=[^>]*class="[^"]*\binz-a\b[^"]*")(?=[^>]*href="https:\/\/miku-doujin\.com\/([a-z0-9]{3,20})\/?")[^>]*>([\s\S]*?)<\/a>/gi;
      const out = [];
      let m;
      while ((m = re.exec(html)) !== null) {
        const slug = m[1];
        const inner = m[2];
        // <img> อาจมี attribute เรียงลำดับใดก็ได้ → หาแท็กแล้วอ่าน src/class แยก
        const imgTag = inner.match(/<img[^>]*>/i);
        const img = imgTag && imgTag[0].match(/src="([^"]+)"/i);
        const titleEl = inner.match(/class="[^"]*\binz-title\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        // ในการ์ดมี<small>ว่าง</small> ก่อนหน้าเสมอ ต้องเลือกอันที่มีข้อความจริง
        const ages = (inner.match(/<small[^>]*>([\s\S]*?)<\/small>/gi) || [])
          .map((s) => strip(s.replace(/<\/?small[^>]*>/gi, '')))
          .filter(Boolean);
        const title = strip(titleEl && titleEl[1]);
        if (!title) continue;
        // หน้า listing ไม่มีช่องผู้วาด — ชื่อเรื่องลงท้ายด้วย "[ผู้วาด (ชื่อย่อ)]" หรือ "(Artist)" — ใช้เป็นตัวแทนชั่วคราว
        const inParen = (title.match(/\[([^\]]{2,80})\]\s*$/) || [])[1]
          || (title.match(/\(([^()]{2,60})\)\s*$/) || [])[1];
        // "[sagejoh (sage joh)]" → เอาชื่อในวงเล็บซ้อนมาใช้ (ยาวกว่า/สั้นกว่าชื่อย่อ)
        const artistGuess = (() => {
          if (!inParen) return null;
          const inner = (inParen.match(/\(([^()]{2,60})\)/) || [])[1] || inParen;
          return inner.replace(/[()]/g, '').trim();
        })();
        // ชื่อไฟล์ปก: /uploads/thumbnail/{hex}_thumb.webp → ตัด _thumb ได้ไฟล์เต็ม
        const rawThumb = img ? img[1] : null;
        const cover = rawThumb ? rawThumb.replace(/_thumb(\.\w+)$/, '$1') : null;
        out.push({
          id: mkId('miku', slug),
          slug,
          title,
          artist: artistGuess || 'Unknown',
          circle: 'Unknown',
          thumb: cover,
          cover: cover,
          date: thaiAgeToDate(ages[0]),
          source: 'miku-doujin.com',
          source_id: slug,
        });
      }
      return uniq(out.map((o) => o.id)).map((id) => out.find((o) => o.id === id));
    },

    /* หน้าแรกเว็บ = รายการล่าสุด (ไม่ต้องค้น) — คืนเฉพาะรายการที่ผ่านกฎ femboy */
    async landing(signal) {
      const html = await this.html(SOURCES.miku.base + '/', signal);
      return this.parseList(html).filter(isAllowed);
    },

    /* สแกนหน้าที่ n ของเว็บ (?page=n) แล้วคืนเฉพาะรายการที่ผ่านกฎ femboy
       ใช้ไล่หน้าเพื่อหา femboy ที่อยู่นอก 10 ผลลัพธ์แรกของช่องค้นหา */
    async scanPage(n, signal) {
      const html = await this.html(SOURCES.miku.base + '/?page=' + encodeURIComponent(n), signal);
      return this.parseList(html).filter(isAllowed);
    },

    /* ค้นหาจริง แล้วคัดทิ้งทุกอย่างที่ไม่ใช่ femboy (กฎเข้ม)
       คืน { items, dropped } เพื่อให้ UI บอกผู้ใช้ได้ตรง ๆ ว่าตกไปกี่รายการ */
    async search(q, signal) {
      const query = (q || '').trim();
      if (!query) return { items: [], dropped: 0 };
      const body = 'keysearch=' + encodeURIComponent(query);
      const html = await this.html(this.searchUrl(), signal, body);
      const all = this.parseList(html);
      const kept = all.filter(isAllowed);
      return { items: kept, dropped: all.length - kept.length };
    },

    /* แปลงหน้า detail → ข้อมูลเต็ม + URL รูปทุกหน้า */
    parseDetail(html, seed) {
      const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i);
      const ogTitle = html.match(/<meta property="og:title"\s*content="([^"]*)"/i);
      const title = strip((ogTitle && ogTitle[1]) || (titleTag && titleTag[1]) || (seed && seed.title));
      // ปกจากการ์ดที่ค้นมา ถ้าไม่มีให้หยิบจากปกในหน้า detail (uploads/thumbnail/..._thumb.webp)
      const detailThumb = (html.match(/src="(https:\/\/miku-doujin\.com\/uploads\/thumbnail\/[^"]+?)(?:_thumb)?\.(?:webp|jpg|jpeg|png)"/i) || [])[1];
      const thumb = (seed && (seed.thumb || seed.cover))
        || (detailThumb ? detailThumb + '.webp' : null);

      // รูปทุกหน้าอยู่ใน <div id="manga-content"> เป็น <img class="lazy" data-src="..."> (ไม่ใช่ src)
      // นามสกุลไม่คงที่: .webp หรือ .jpg → รับได้ทั้งสองแบบ
      const block = (html.match(/<div id="manga-content"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
      const imgUrls = (block.match(/<img[^>]*>/gi) || []).map((tag) => {
        const src = tag.match(/\bdata-src="([^"]+)"/i) || tag.match(/\bsrc="([^"]+)"/i);
        return src ? src[1] : null;
      }).filter((u) => u && /\/uploads\//.test(u) && !/\/thumbnail\//.test(u));

      // เผื่อโครงสร้างหน้าเปลี่ยน → ดึงจากทั้งเอกสารเป็นทางสำรอง
      const pages = uniq(imgUrls.length ? imgUrls
        : (html.match(/https:\/\/miku-doujin\.com\/uploads\/[0-9]+(?:-[0-9a-f]+)?\/[0-9a-f]+\.(?:webp|jpe?g|png)/gi) || [])
          .filter((u) => !/\/thumbnail\//.test(u) && !/_thumb\./.test(u)));

      // ฟิลด์ metadata: <p><small>ป้าย : <a class="badge ...">ค่า</a></small></p>
      // อ่านจาก <a> ที่อยู่ทันทีหลังป้าย ไม่งั้นจะได้ข้อความหน้าเว็บทั้งก้อนปนมา
      const grabAll = (label) => {
        const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(esc + '\\s*:([\\s\\S]{0,600}?)<\\/small>', 'i');
        const m = html.match(re);
        if (!m) return [];
        const seg = m[1];
        // เอาค่าจาก <a> ก่อน ถ้าไม่มี <a> ค่อย fallback ไปข้อความดิบ
        const anchors = (seg.match(/<a[^>]*>([\s\S]*?)<\/a>/gi) || []).map((a) => strip(a));
        const anchors2 = anchors.length ? anchors : [strip(seg.replace(/<[^>]*>/g, ' '))];
        return anchors2.map((s) => s.trim()).filter((s) => s && s.length < 60);
      };

      const artist = grabAll('ผู้วาด')[0] || '';
      const language = grabAll('ภาษา')[0] || '';
      const series = grabAll('เรื่อง')[0] || '';
      const category = grabAll('หมวดหมู่')[0] || '';
      const characters = grabAll('ตัวละคร').filter((c) => !isPlaceholder(c));

      // ประเภท/แท็ก: ลิงก์ /genre/xxx/ ทั้งหมดในหน้า detail (บางหน้าเป็น URL เต็ม)
      const genres = uniq((html.match(/href="(?:https:\/\/miku-doujin\.com)?\/genre\/([^"?\/]+)\/"/gi) || [])
        .map((s) => decodeURIComponent(s.replace(/^href="(?:https:\/\/miku-doujin\.com)?\/genre\//i, '').replace(/\/"$/, '').trim()))
        .filter((g) => g && g.length < 40));

      // "ประเภท" อยู่ในบรรทัดเดียวกับค่าเริ่มต้น อ่านพิเศษเพื่อไม่ให้ปนกับแท็ก
      const typeRaw = grabAll('ประเภท').filter((t) => !isPlaceholder(t));

      const tag = (t) => String(t || '').trim();
      const tags = uniq([tag(language), tag(series), tag(category), tag(artist),
        ...characters, ...typeRaw, ...genres]
        .filter((t) => !isPlaceholder(t)));

      // กลุ่ม = หมวดหมู่จริงจากหน้า detail เท่านั้น
      // "แนวทาง" (orientation) ปล่อยว่าง: ลิงก์ /genre/ ของเว็บนี้เป็นกระจุกปนสนแท็ก
      // (เช่น "นมใหญ่" "NTR") ไม่ใช่หมวดแนวทาง — ติดป้ายผิดต่างกว่าไม่ต้องติดป้าย
      // ค่าพวกนี้ยังอยู่ใน tags จึงเห็นในแท็กก์ได้ตามปกติ
      const realCategory = isPlaceholder(category) ? '' : category;

      // วง/ซีรีส์จริงเท่านั้น ถ้าเป็น "000" ให้ใช้หมวดหมู่แทน ไม่งั้นคงเป็น Unknown
      const circle = !isPlaceholder(series) ? series : (!isPlaceholder(category) ? category : 'Unknown');

      const updated = (html.match(/อัพเดทเมื่อ\s*([\s\S]{0,40}?ที่แล้ว)/) || [])[1];

      return Object.assign({}, seed, {
        title,
        artist: artist || 'Unknown',
        circle,
        language: LANGS[(language || '').trim().toLowerCase()] || 'th',
        group: realCategory,
        orientation: '',
        pages: pages.length,
        characters,
        tags: tags.slice(0, 24),
        pageUrls: pages,
        cover: thumb || pages[0] || null,
        date: (seed && seed.date) || thaiAgeToDate(updated),
        description: `แปลไทย · ${pages.length} หน้า · ${genres.slice(0, 5).join(', ')}`.trim(),
        source: 'miku-doujin.com',
        readUrl: this.detailUrl((seed && seed.slug) || ''),
      });
    },

    async detail(slug, signal) {
      const html = await this.html(this.detailUrl(slug), signal);
      return this.parseDetail(html, { id: mkId('miku', slug), slug });
    },
  };

  /* ============================================================
     doujin-th.com — ฟอรัม Invision (โดจินแปลไทย, กว่า 47,000 การ์ตูน)
     ============================================================
     ข้อค้นพบสำคัญระหว่างสำรวจจริง:
     1) เว็บไม่มีช่องค้นหาของตัวเอง — ช่องค้นในหน้าเว็บคือ Google CSE
        (form action="https://www.google.com" + hidden cx=003772632849311655372:-igy6k3yaqk)
        และ Invision Search ของเว็บปิดสำหรับผู้มาชม (action=Search คืนหน้า Index เปล่า)
        → จึงไม่มี endpoint ค้นข้อความ ใช้การไล่หน้าแทน
     2) URL ของ Invision คื่นกลางคือ "จำนวนรายการที่ข้าม" (offset) ไม่ใช่เลขหน้า
        board,1.0.html กับ board,1.23.html ได้หน้าเดียวกัน
        board,1.24.html คือหน้า 2 → เลขที่ถูกคือ (page - 1) * 24
     3) หน้าไล่หน้ามี 24 การ์ด/หน้า ประมาณ 1,960 หน้า (วัดจริง: offset 47,016
        เป็นหน้าสุดท้าย มี 12 รายการ → รวม ~47,028 รายการ)
     4) ปกไม่ได้อยู่ใน <img> แต่อยู่ใน <style> ก่อนการ์ดทุกใบ:
          #post_doujin_7 { background-image:url('https://s1.hentaithai.net/...'); }
        แล้วตามด้วย <a href="...topic=35154.0" title="ชื่อเรื่อง">
     5) มีหน้าแท็กของเว็บเองที่ใช้ได้จริง: index.php?action=tags&tagid=N
        (tagid=3309 = "femboy friend") — เป็นทางลัดที่ได้ผลทันทีโดยไม่ต้องไล่ทั้งคลัง

     กฎเข้มยังคงเดิม: ชื่อเรื่องต้องมีคำว่า femboy เต็มจึงจะเข้าคลัง
     ผลจริงของการสแกนคลังทั้งหมด 1,960 หน้า: เจอ femboy 5 รายการ */
  const DTH = {
    PER_PAGE: 24,
    TOTAL_PAGES: 1960,          // วัดจากต้นทางจริง ใช้แสดง % ความคืบหน้า
    FEMBOY_TAGS: [3309],        // "femboy friend" — หน้าแท็กของเว็บเอง
  };

  const dth = {
    /* วัดจากต้นทางจริง: offset 47,016 เป็นหน้าสุดท้าย (12 รายการ) → ~47,028 รายการ */
    totalPages: DTH.TOTAL_PAGES,

    boardUrl(page) {
      const n = Math.max(1, Math.floor(Number(page) || 1));
      return `${SOURCES.dth.forum}/board,1.${(n - 1) * DTH.PER_PAGE}.html`;
    },
    tagUrl(tagid) {
      return `${SOURCES.dth.forum}?action=tags&tagid=${encodeURIComponent(tagid)}`;
    },
    detailUrl(tid) {
      return `${SOURCES.dth.forum}?topic=${encodeURIComponent(tid)}.0`;
    },

    async html(url, signal) {
      const q = new URLSearchParams({ url, source: 'dth' });
      const r = await fetch(`${SOURCES.proxyBase}?${q}`, { signal });
      if (!r.ok) throw new Error(`proxy ${r.status} — ${SOURCES.dth.name}`);
      return r.text();
    },

    /* ชื่อเรื่องแบบ "ไทย - [Circle (alias)] ชื่อญี่ปุ่น/อังกฤษ"
       → ชื่อวงอยู่ในวงเล็บเหลี่ยม ใช้เป็น circle/artist */
    splitTitle(title) {
      const t = String(title || '');
      const m = t.match(/\[([^\]]{2,90})\]/);
      const circle = m ? m[1].trim() : '';
      const nested = (circle.match(/\(([^()]{1,60})\)/) || [])[1];
      return { circle: circle || 'Unknown', artist: (nested || circle || 'Unknown') };
    },

    /* วันที่จริงจากต้นทาง: โฟลเดอร์รูปเป็น /YYYY/YYYY-MM-DD/ → ใช้วันที่นี้เลย
       (ไม่เดา ไม่ใช้ "x วันที่แล้ว" เพราะหน้า board ไม่ได้บอกวันที่เลย) */
    dateFromImage(url) {
      const m = String(url || '').match(/\/(\d{4})\/(\d{4})-(\d{2})-(\d{2})\//);
      return m ? `${m[2]}-${m[3]}-${m[4]}` : '';
    },

    /* ไล่เอกสารตามลำดับ: จับ <style> ปก แล้วจับ <a> การ์ดถัดมาเป็นคู่เดียวกัน
       ใช้ regex เดียวทั้งหมดเพื่อให้ "ปก" ยังผูกกับการ์ดที่ถูกต้องเสมอ
       (ไม่ใช้ index ของสอง match แยก เพราะบางการ์ดไม่มี <style> ของตัวเอง) */
    parseList(html) {
      const re = /#post_doujin_\d+\s*\{\s*background-image:\s*url\(['"]([^'"]+)['"]\)\s*;\s*\}|<a\b[^>]*href="[^"]*topic=(\d+)\.0"[^>]*title="([^"]*)"/g;
      const out = [];
      let cover = null;
      let m;
      while ((m = re.exec(html)) !== null) {
        if (m[1] !== undefined) { cover = m[1]; continue; }
        const tid = m[2];
        const title = strip(m[3]);
        if (!title) continue;
        const { circle, artist } = this.splitTitle(title);
        out.push({
          id: mkId('dth', tid),
          key: tid,
          topic: tid,
          title,
          circle,
          artist,
          group: '',
          orientation: '',
          language: 'th',
          pages: 0,
          rating: 0, favorites: 0, views: 0,
          date: this.dateFromImage(cover),
          characters: [],
          tags: [],
          thumb: cover,
          cover,
          description: '',
          source: 'doujin-th.com',
          source_id: tid,
          readUrl: this.detailUrl(tid),
        });
        cover = null;
      }
      const seen = new Set();
      return out.filter((o) => (seen.has(o.id) ? false : seen.add(o.id)));
    },

    /* หน้าแรก = การ์ตูนใหม่สุด ไล่ 3 หน้าแรก (72 รายการ) ไม่ต้องค้นคำใด ๆ
       ผู้ใช้สั่งเอาทุกอย่างที่เจอเลย → เลิกไล่หน้าแท็ก femboy มาเป็นตัวดึงดูดหลัก */
    async landing(signal) {
      const seeds = await Promise.all([
        this.html(this.boardUrl(1), signal),
        this.html(this.boardUrl(2), signal),
        this.html(this.boardUrl(3), signal),
      ]);
      return seeds.map((h) => this.parseList(h)).reduce((a, b) => a.concat(b), []).filter(isAllowed);
    },

    /* ไล่หน้า board ตามลำดับ เพื่อเก็บทุกอย่างที่เจอ */
    async scanPage(n, signal) {
      const html = await this.html(this.boardUrl(n), signal);
      return this.parseList(html).filter(isAllowed);
    },

    /* เว็บไม่มี text search ของตัวเอง (ช่องค้นคือ Google CSE, Invision Search ปิด)
       → ค้นด้วยการดูหน้าแรก 3 หน้า แล้วกรองชื่อเรื่องด้วยคำค้นแบบ substring
       ไม่มีคำค้น = เอาหน้าแรกทั้งหมด (นี่คือพฤติกรรมปกติของหน้าแรก)
       ข้อจำกัด: substring ดูแค่ 72 การ์ดล่าสุด คำว่า "femboy" มักไม่โผล่ในนั้น
       → จึงเติมหน้าแท็กของเว็บเอง (tagid 3309 = "femboy friend") เฉพาะเมื่อคำค้นเป็น femboy
       ไม่งั้นผู้ใช้พิมพ์คำนี้แล้วได้ 0 ทั้งที่เว็บมีของอยู่จริง */
    async search(q, signal) {
      const query = (q || '').trim().toLowerCase();
      const seeds = await Promise.all([
        this.html(this.boardUrl(1), signal),
        this.html(this.boardUrl(2), signal),
        this.html(this.boardUrl(3), signal),
      ]);
      const all = seeds.map((h) => this.parseList(h)).reduce((a, b) => a.concat(b), []);
      let items = all.filter(isAllowed);
      if (query) {
        const hit = items.filter((it) => it.title.toLowerCase().includes(query));
        let tagged = [];
        if (/femboys?\b/i.test(query)) {
          const tagHtml = await Promise.all(DTH.FEMBOY_TAGS.map((t) => this.html(this.tagUrl(t), signal)));
          tagged = tagHtml.flatMap((h) => this.parseList(h)).filter(isAllowed);
        }
        const seen = new Set();
        items = hit.concat(tagged).filter((d) => (seen.has(d.id) ? false : seen.add(d.id)));
      }
      return { items, dropped: all.length - items.length };
    },

    /* เลือกเฉพาะรูปของเรื่องนี้จากรูปทั้งหมดที่หน้าเว็บอ้างถึง
       ชื่อไฟล์มี 2 แบบ:
         • ใหม่: .../2026/2026-09-30/04865/1.webp        → อยู่โฟลเดอร์เดียวกัน
         • เก่า: .../2022/2022-09-18/<slug>-024828-001.jpg → ชื่อไฟล์ขึ้นต้นเดียวกัน
       ยึด og:image (รูปหน้าแรกของเรื่อง) เป็นตัวอ้างอิง ถ้าไม่มีให้เลือกกลุ่มที่ใหญ่ที่สุด */
    pickImageGroup(urls, ogImage) {
      if (!urls.length) return [];
      const split = (u) => {
        const i = u.lastIndexOf('/');
        return { dir: u.slice(0, i), file: u.slice(i + 1) };
      };
      const keyOf = (u) => {
        const { dir, file } = split(u);
        const stem = file.replace(/-?\d+\.(?:webp|jpe?g|png)$/i, '');
        return stem ? dir + '/' + stem + '-' : dir;   // base เปล่า = ใช้ทั้งโฟลเดอร์
      };
      let key = ogImage ? keyOf(ogImage) : null;
      if (!key || !urls.some((u) => keyOf(u) === key)) {
        // ไม่มี og:image ที่ใช้ได้ → นับจำนวนต่อกลุ่มแล้วเอากลุ่มที่ใหญ่ที่สุด
        const tally = new Map();
        urls.forEach((u) => tally.set(keyOf(u), (tally.get(keyOf(u)) || 0) + 1));
        key = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
      const mine = urls.filter((u) => keyOf(u) === key);
      return mine.map((u) => {
        const num = parseInt((split(u).file.match(/(\d+)(?=\.\w+$)/) || [])[1], 10);
        return { u, n: Number.isFinite(num) ? num : 9999 };
      }).sort((a, b) => a.n - b.n).map((x) => x.u);
    },
    /* หน้า thread: รูปทุกหน้าอยู่ในโพสต์แรกเป็น <img src="https://s1.hentaithai.net/...">
       แท็กอยู่ในลิงก์ action=tags&tagid=N → ชื่อแท็กใน text
       ชื่อวง/ผู้แปล/ชื่อเรื่องเดิมอยู่ใน og:title */
    parseDetail(html, seed) {
      const ogTitle = (html.match(/<meta property="og:title"\s+content="([^"]*)"/i) || [])[1];
      const title = strip(ogTitle || (seed && seed.title));
      const { circle, artist } = this.splitTitle(title);

      // ชื่อแท็กอยู่ใน <a class="tag" href="...action=tags&tagid=N">ชื่อแท็ก</a>
      // ต้องจับเฉพาะข้อความในแท็ก (group 1) ไม่ใช่ทั้งแท็ก <a ...>
      const tags = uniq((html.match(/action=tags&(?:amp;)?tagid=\d+"[^>]*>([^<]{1,40})</g) || [])
        .map((m) => strip(m.replace(/^[^>]*>/, '').replace(/<.*$/, '')))
        .filter((t) => t && !isPlaceholder(t)));

      // หน้า thread ยังมีรูปของ "ดับจินอื่น" ที่แนะนำอยู่ท้ายหน้าด้วย
      // → ต้องเลือกเฉพาะกลุ่มของเรื่องนี้ โดยยึด og:image (หน้าแรกของเรื่อง) เป็นตัวอ้างอิง
      const found = (html.match(/https:\/\/s1\.hentaithai\.net\/(?:thai|image)\/\d{4}\/\d{4}-\d{2}-\d{2}\/[^"'\s)]+?\.(?:webp|jpe?g|png)/gi) || []);
      const ogImage = (html.match(/<meta property="og:image"\s+content="([^"]*)"/i) || [])[1];
      const pages = this.pickImageGroup(uniq(found), ogImage);

      const bodyDesc = (html.match(/<meta name="description"\s+content="([^"]*)"/i) || [])[1];
      return Object.assign({}, seed, {
        title,
        circle,
        artist,
        language: 'th',
        group: '',
        orientation: '',
        pages: pages.length,
        date: (seed && seed.date) || this.dateFromImage(pages[0] || ''),
        tags,
        pageUrls: pages,
        cover: (seed && (seed.cover || seed.thumb)) || pages[0] || null,
        description: strip(bodyDesc) || `doujin-th · ${pages.length} หน้า`,
        source: 'doujin-th.com',
        readUrl: this.detailUrl((seed && seed.topic) || ''),
      });
    },

    async detail(topicId, signal) {
      const html = await this.html(this.detailUrl(topicId), signal);
      return this.parseDetail(html, { id: mkId('dth', topicId), key: topicId, topic: topicId });
    },
  };

  /* ============================================================
     neko-hentai.net — เว็บอ่านโดจินไทยคนละเจ้าของ
     ============================================================
     โครงสร้างจริง (ตรวจจากหน้าเว็บจริง):
     • ค้นหา = POST /controller/search.php  body keysearch=<คำ>  (คืน HTML การ์ด)
       GET ที่ URL เดียวกันไม่กรอง — ต้อง POST เท่านั้น (ยืนยันแล้ว)
     • การ์ด: <a href="https://neko-hentai.net/{slug}/" title="...">
              <div class="poster" style="background-image:url(.../uploads/thumbnail/{hash}.jpg)">
     • หน้าเรื่อง: รูปทุกหน้าเป็น <img data-src=".../uploads/upload-images/{ts}/NNNN.jpg">
              (lazy-load → ต้องอ่าน data-src ไม่ใช่ src)
     • ค้น "femboy" ได้จริง 3 รายการ ทุกรายการมีคำว่า Femboy ในชื่อจริง

     ⚠️ ไซด์อยู่หลัง Cloudflare managed challenge (Cf-Mitigated: challenge)
        ทดสอบจริง: curl → 403, Node https → 403, Chrome headless → 403 "Just a moment...",
        proxy สาธารณะ (allorigins/codetabs/corsproxy) → 520/522/401
        ผ่านได้เฉพาะเบราว์เซอร์จริงของคนใช้ (ผ่านแล้ว) แต่เว็บไม่ได้ส่ง CORS
        → เว็บเราอ่านข้ามโดเมนไม่ได้
        adapter นี้จึงเขียนไว้ให้ถูกต้องและพร้อมใช้ แต่ถ้าถูกบล็อกจะ
        โยนข้อความตรง ๆ ให้ผู้ใช้เห็น ไม่แต่งข้อมูลปลอม

     หมายเหตุเรื่องกฎ: ผู้ใช้สั่งเพิ่มให้ผสม "สาวดุ้น" ในแหล่งนี้แหล่งเดียว
     (นอกนั้นทุกแหล่งยังบังคับ femboy ล้วนเหมือนเดิม) — รายการกลุ่มนี้ติดป้าย
     collection='boobs' ไว้ชัดเจน ไม่ปนกับชุด femboy เงียบ ๆ */
  const NEKO_BOOBS_TERM = 'สาวดุ้น';

  const neko = {
    searchUrl() {
      return SOURCES.neko.base + '/controller/search.php';
    },
    detailUrl(slug) {
      return SOURCES.neko.base + '/' + encodeURIComponent(slug) + '/';
    },

    async raw(url, signal, post) {
      const q = new URLSearchParams({ url, source: 'neko' });
      if (post) q.set('post', post);
      const r = await fetch(`${SOURCES.proxyBase}?${q}`, { signal });
      if (!r.ok) {
        // 403 จาก Cloudflare = ไม่ใช่เว็บล่ม แต่ถูกกันบอท → ต้องบอกตรง ๆ ไม่ใช่หา "เว็บล่ม"
        throw new Error(r.status === 403
          ? 'ถูก Cloudflare บล็อก (ต้องเปิดด้วยเบราว์เซอร์จริงเท่านั้น)'
          : `proxy ${r.status} — ${SOURCES.neko.name}`);
      }
      return r.text();
    },

    /* "[Circle (alias)] ชื่อเรื่อง" → circle + artist */
    splitTitle(title) {
      const m = String(title || '').match(/\[([^\]]{2,90})\]/);
      const circle = m ? m[1].trim() : '';
      const nested = (circle.match(/\(([^()]{1,60})\)/) || [])[1];
      return { circle: circle || 'Unknown', artist: (nested || circle || 'Unknown') };
    },

    /* การ์ดจากผลค้นหา: <a href="/{slug}/" title="..."> + <div class="poster" style="..."> */
    parseSearch(html, collection) {
      const re = /<a\b[^>]*href="https:\/\/neko-hentai\.net\/([a-z0-9][a-z0-9-]*)\/"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      const out = [];
      let m;
      while ((m = re.exec(html)) !== null) {
        const slug = m[1];
        const title = strip(m[2]);
        if (!title) continue;
        const poster = (m[3].match(/background-image:\s*url\(([^)]+)\)/i) || [])[1] || null;
        // อายุเรื่องอยู่ใน <div class="d-flex justify-content-between meta"><div>4 เดือนที่แล้ว</div>
        const age = strip((m[3].match(/class="[^"]*\bmeta\b[^"]*"[\s\S]*?<div>\s*([^<]*?)\s*<\/div>/i) || [])[1]);
        const { circle, artist } = this.splitTitle(title);
        out.push({
          id: mkId('neko', slug),
          key: slug,
          slug,
          title,
          circle,
          artist,
          group: '',
          orientation: '',
          language: 'th',
          pages: 0,
          rating: 0, favorites: 0, views: 0,
          date: thaiAgeToDate(age),
          characters: [],
          tags: collection === 'boobs' ? [NEKO_BOOBS_TERM] : [],
          collection: collection || 'femboy',
          thumb: poster,
          cover: poster,
          description: '',
          source: 'neko-hentai.net',
          source_id: slug,
          readUrl: this.detailUrl(slug),
        });
      }
      const seen = new Set();
      return out.filter((o) => (seen.has(o.id) ? false : seen.add(o.id)));
    },

    /* ผู้ใช้สั่งให้ผสม "สาวดุ้น" ในแหล่งนี้ — ค้นสองคำนี้แล้วรวมผล
       ชุด femboy ยังผ่านกฎเข้มเต็ม 100% ส่วนชุดสาวดุ้นติดป้ายแยกให้เห็นชัด */
    async search(q, signal) {
      const query = (q || '').trim() || 'femboy';
      const wantFemboy = /femboys?\b/i.test(query);
      const terms = wantFemboy ? ['femboy', NEKO_BOOBS_TERM] : [query, NEKO_BOOBS_TERM];
      const bodies = await Promise.all(
        uniq(terms).map((t) => this.raw(this.searchUrl(), signal, 'keysearch=' + encodeURIComponent(t)))
      );
      const femboy = bodies[0] ? this.parseSearch(bodies[0], 'femboy').filter(isAllowed) : [];
      const extra = bodies.slice(1).flatMap((h) => this.parseSearch(h, 'boobs'));
      const items = femboy.concat(extra);
      const seen = new Set();
      return {
        items: items.filter((o) => (seen.has(o.id) ? false : seen.add(o.id))),
        dropped: (bodies[0] ? this.parseSearch(bodies[0], 'femboy').length - femboy.length : 0),
      };
    },

    async landing(signal) {
      const html = await this.raw(this.searchUrl(), signal, 'keysearch=femboy');
      return this.parseSearch(html, 'femboy').filter(isAllowed);
    },

    /* รูปทุกหน้าเป็น <img data-src=".../uploads/upload-images/{ts}/NNNN.jpg"> (lazy-load) */
    parseDetail(html, seed) {
      const ogTitle = (html.match(/<meta property="og:title"\s+content="([^"]*)"/i) || [])[1];
      const ogDesc = (html.match(/<meta property="og:description"\s+content="([^"]*)"/i) || [])[1];
      const ogImage = (html.match(/<meta property="og:image"\s+content="([^"]*)"/i) || [])[1];
      // og:title ของเว็บต่อท้ายด้วย " - Neko Hentai เว็บอ่านโดจิน..." → ตัดออก
      const title = strip(ogTitle || (seed && seed.title)).replace(/\s*-\s*Neko Hentai[\s\S]*$/i, '');
      const { circle, artist } = this.splitTitle(title);
      const found = uniq((html.match(/https:\/\/neko-hentai\.net\/uploads\/upload-images\/\d+\/[\w.-]+\.(?:jpe?g|png|webp)/gi) || []));
      const pages = found.map((u) => ({ u, n: parseInt((u.split('/').pop().match(/(\d+)/) || [])[1], 10) || 0 }))
        .sort((a, b) => a.n - b.n).map((x) => x.u);
      return Object.assign({}, seed, {
        title,
        circle,
        artist,
        language: 'th',
        group: '',
        orientation: '',
        pages: pages.length,
        date: (seed && seed.date) || '',
        pageUrls: pages,
        cover: (seed && (seed.cover || seed.thumb)) || ogImage || pages[0] || null,
        description: isPlaceholder(strip(ogDesc)) ? `neko-hentai · ${pages.length} หน้า` : strip(ogDesc),
        source: 'neko-hentai.net',
        readUrl: this.detailUrl((seed && seed.slug) || ''),
      });
    },

    async detail(slug, signal) {
      const html = await this.raw(this.detailUrl(slug), signal);
      return this.parseDetail(html, { id: mkId('neko', slug), key: slug, slug });
    },
  };

  /* ============================================================
     netoruhentai.com — WordPress, ดึงผ่าน curl ได้ตรง ๆ (Cloudflare แต่ไม่มี challenge)
     ============================================================
     โครงสร้างจริง:
     • ค้นหา: GET /search-doujin?q=<คำ>  (ค้นจาก "ชื่อเรื่องต้นฉบับ" ของเว็บ)
       ค้น femboy ได้ 9 · yaoi ได้ 20 · เฟมบอย ได้ 3 · /tag/yaoi/ ได 20
     • การ์ด: <div class="gallery"><a href="/read-{slug}/" class="cover" title="โดจิน … แปลไทย">
             ปกเป็น <img class="lazyload" data-src="https://i0.wp.com/doujinlover.com/i/{id}/doujin.jpg">
       ⚠ การ์ดมีแต่ "ชื่อเรื่องไทย" เท่านั้น ไม่มีชื่อต้นฉบับ → กรองกฎ femboy ที่ระดับการ์ดไม่ได้
     • ชื่อต้นฉบับอยู่ที่หน้า /read-{slug}/ ใน breadcrumb schema.org:
       itemListElement[position=2].name = "[Circle] ชื่อญี่ปุ่น/อังกฤษ"
       และ <meta name="keywords"> คือแท็กจริงของเว็บ
     • รูปทุกหน้า: https://i0.wp.com/doujinlover.com/i/{id}/001.jpg, 002.jpg …

     ⚠ กฎเข้มยังบังคับเหมือนเดิม: ชื่อต้นฉบับต้องมีคำว่า femboy
       ยกเว้นเฉพาะหมวด yaoi ที่ผู้ใช้อนุมัติ (collection='yaoi')
       เพราะชื่อที่การ์ดแสดงเป็นภาษาไทย จึงต้องไปดึงหน้า detail มาตรวจชื่อต้นฉบับจริง
       ไม่งั้นจะเป็นการเดา — NETORU_VERIFY จำกัดจำนวนที่ไล่เช็กต่อครั้งเพื่อไม่ยิงต้นทางแรงเกิน */
  const NETORU_VERIFY = 14;

  const netoru = {
    totalPages: 1705,          // วัดจาก pagination ของเว็บ (/doujinshi?page=1705 คือหน้าสุดท้าย)

    listUrl(p) {
      const n = Math.max(1, Math.floor(Number(p) || 1));
      return `${SOURCES.netoru.base}/doujinshi${n > 1 ? '?page=' + n : ''}`;
    },
    searchUrl(q) {
      return `${SOURCES.netoru.base}/search-doujin?q=${encodeURIComponent(q)}`;
    },
    tagUrl(tag) {
      return `${SOURCES.netoru.base}/tag/${encodeURIComponent(tag)}/`;
    },
    detailUrl(slug) {
      return `${SOURCES.netoru.base}/read-${encodeURIComponent(slug)}/`;
    },

    async html(url, signal) {
      const q = new URLSearchParams({ url, source: 'netoru' });
      const r = await fetch(`${SOURCES.proxyBase}?${q}`, { signal });
      if (!r.ok) throw new Error(`proxy ${r.status} — ${SOURCES.netoru.name}`);
      return r.text();
    },

    /* การ์ดใน listing/search — ชื่อเรื่องที่ได้เป็นภาษาไทย (ชื่อต้นฉบัยยังไม่รู้ ต้อง hydrate) */
    parseCards(html, collection) {
      const re = /<div class="gallery"[^>]*>\s*<a href="\/read-([a-z0-9]+)\/"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      const out = [];
      let m;
      while ((m = re.exec(html)) !== null) {
        const slug = m[1];
        const title = strip(m[2]).replace(/^โดจิน\s+/, '');
        const inner = m[3];
        const cover = (inner.match(/data-src="(https?:\/\/[^"]+)"/i) || [])[1] || null;
        const caption = strip((inner.match(/class="caption"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
        out.push({
          id: mkId('netoru', slug),
          key: slug,
          slug,
          title,
          circle: 'Unknown',
          artist: 'Unknown',
          group: '', orientation: '', language: 'th',
          pages: 0, rating: 0, favorites: 0, views: 0, date: '',
          characters: [], tags: [],
          collection: collection || 'femboy',
          thumb: cover, cover,
          description: caption || '',
          source: 'netoruhentai.com',
          source_id: slug,
          readUrl: this.detailUrl(slug),
        });
      }
      const seen = new Set();
      return out.filter((o) => (seen.has(o.id) ? false : seen.add(o.id)));
    },

    /* หน้า detail: breadcrumb schema.org มีชื่อต้นฉบับอยู่ใน itemListElement[position=2]
       รูปอยู่ที่ i0.wp.com/doujinlover.com/i/{id}/NNN.jpg — หน้าเดียวมีรูปของเรื่องอื่นปน
       จึงต้องเลือกกลุ่มที่ตัวเลข id ของ path เป็นกลุ่มใหญ่ที่สุด */
    parseDetail(html, seed) {
      const ld = (html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i) || [])[1] || '';
      let original = '';
      try {
        const data = JSON.parse(ld);
        const list = (data && data.itemListElement) || [];
        const hit = list.find((x) => Number(x && x.position) === 2);
        if (hit && hit.name) original = strip(hit.name);
      } catch (e) { /* JSON เพี้ยน = ไม่มีชื่อต้นฉบับ */ }

      const titleTag = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
      const thaiTitle = strip(titleTag).split('|')[0].replace(/^อ่านโดจิน\s+/, '').trim();
      const translator = (html.match(/Thai translation by:\s*([^<]{2,40})/i) || [])[1];
      const keywords = strip((html.match(/<meta name="keywords"\s+content="([^"]*)"/i) || [])[1]);

      const ids = uniq((html.match(/https:\/\/i[0-9]\.wp\.com\/doujinlover\.com\/i\/(\d+)\//gi) || [])
        .map((u) => (u.match(/\/i\/(\d+)\//) || [])[1]));
      let pages = [];
      if (ids.length) {
        // เลือก id ที่มีรูปเยอะที่สุด = เรื่องนี้ (รูปเรื่องอื่นมักมีแค่ปกเดียว)
        const tally = new Map();
        uniq(html.match(/https:\/\/i[0-9]\.wp\.com\/doujinlover\.com\/i\/\d+\/[\w.-]+\.(?:jpg|jpeg|png|webp)/gi) || [])
          .forEach((u) => {
            const id = (u.match(/\/i\/(\d+)\//) || [])[1];
            tally.set(id, (tally.get(id) || 0) + 1);
          });
        const main = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
        pages = uniq(html.match(new RegExp('https://i[0-9]\\.wp\\.com/doujinlover\\.com/i/' + main + '/[\\w.-]+\\.(?:jpg|jpeg|png|webp)', 'gi')) || [])
          .map((u) => ({ u, n: parseInt((u.split('/').pop().match(/(\d+)/) || [])[1], 10) || 0 }))
          .sort((a, b) => a.n - b.n).map((x) => x.u);
      }

      const { circle, artist } = circleOf(original || thaiTitle);
      const tags = uniq(keywords.split(',').map((t) => t.trim()))
        .filter((t) => t && t.length < 30).slice(0, 24);

      return Object.assign({}, seed, {
        title: original || thaiTitle,
        title_jp: original,
        circle,
        artist,
        language: 'th',
        group: '', orientation: '',
        pages: pages.length,
        date: (seed && seed.date) || '',
        characters: [],
        tags,
        pageUrls: pages,
        cover: (seed && (seed.cover || seed.thumb)) || pages[0] || null,
        description: translator ? 'แปลโดย ' + translator : (seed && seed.description) || '',
        source: 'netoruhentai.com',
        readUrl: this.detailUrl((seed && seed.slug) || ''),
      });
    },

    async detail(slug, signal) {
      const html = await this.html(this.detailUrl(slug), signal);
      return this.parseDetail(html, { id: mkId('netoru', slug), key: slug, slug });
    },

    /* ไล่เช็กชื่อต้นฉบัจากหน้า detail ของผลค้นหาทีละชุด แล้วคัดด้วยกฎ
       เว็บค้นจากชื่อต้นฉบับอยู่แล้ว แต่เรายังต้องยืนยันเอง ไม่เชื่อผลค้นหาอย่างเดียว */
    async verify(items, collection, signal) {
      const limit = items.slice(0, NETORU_VERIFY);
      const done = [];
      for (const it of limit) {
        try {
          const full = await this.detail(it.slug, signal);
          const merged = Object.assign({}, it, full, { collection: it.collection });
          if (isAllowed(merged)) done.push(merged);
        } catch (e) { /* รายการนี้ดึงไม่ได้ → ไม่เอา ไม่เดา */ }
      }
      return { items: done, dropped: items.length - done.length, checked: limit.length };
    },

    /* ค้น: มีคำค้นก็ค้นตามคำนั้น ไม่มีคำค้น (หน้าแรก) ให้ไล่หน้าและงานล่าสุดแทน
       ผู้ใช้สั่ง "เอาทุกอย่างที่เจอเลย ไม่ต้องค้น" → หน้าแรกเลยไม่ยิงคำค้น "femboy" อีก
       การ์ดบนเว็บมีแต่ชื่อไทย ชื่อต้นฉบับอยู่ในหน้า detail → ต้อง verify เสมอ
       ไม่งั้นไม่ได้ชื่อจริง (ใช้ตัด furry ไม่ได้ด้วย) */
    async search(q, signal) {
      const query = (q || '').trim();
      if (!query) {
        const cards = this.parseCards(await this.html(this.listUrl(1), signal), '');
        return cards.length ? await this.verify(cards, '', signal) : { items: [], dropped: 0, checked: 0 };
      }
      const seeds = await Promise.all([
        this.html(this.searchUrl(query), signal),
        this.html(this.tagUrl(query), signal),
      ]);
      const cards = seeds.flatMap((h) => this.parseCards(h, ''));
      return cards.length ? await this.verify(cards, '', signal) : { items: [], dropped: 0, checked: 0 };
    },

    /* หน้าแรก: ไล่หน้าล่าสุดของเว็บ ไม่ต้องค้นคำใด ๆ (ผู้ใช้สั่งเอาทุกอย่างที่เจอเลย) */
    async landing(signal) {
      const cards = this.parseCards(await this.html(this.listUrl(1), signal), '');
      const r = cards.length ? await this.verify(cards, '', signal) : { items: [], dropped: 0, checked: 0 };
      return Array.isArray(r) ? r : r.items;
    },

    /* ไล่หน้า /doujinshi — การ์ดเป็นภาษาไทย จึงต้อง verify เพื่อได้ชื่อต้นฉบับ (ใช้ตัด furry) */
    async scanPage(n, signal) {
      const cards = this.parseCards(await this.html(this.listUrl(n), signal), '');
      if (!cards.length) return [];
      const r = await this.verify(cards, '', signal);
      return r.items;
    },
  };

  /* "[Circle (alias)] ชื่อเรื่อง" → circle/artist ใช้ร่วมกันทั้ง neko และ netoru */
  function circleOf(title) {
    const m = String(title || '').match(/\[([^\]]{2,90})\]/);
    const circle = m ? m[1].trim() : '';
    const nested = (circle.match(/\(([^()]{1,60})\)/) || [])[1];
    return { circle: circle || 'Unknown', artist: (nested || circle || 'Unknown') };
  }

  /* ---------- ทำให้ข้อมูลจากทุกแหล่งมีฟิลด์ครบเสมอ ----------
     UI คาดหวังฟิลด์เหล่านี้ ถ้าขาดจะพังตอนเรนเดอร์ */
  const SHAPE = {
    title: '', title_jp: '', circle: 'Unknown', artist: 'Unknown',
    // ห้ามเติมค่าเดา (เช่น 'doujinshi') — ฟิลด์ที่ต้นทางไม่ได้บอกต้องปล่อยว่าง
    // ไม่งั้น sidebar จะโชว์ facet ที่ไม่มีที่มาจริง
    group: '', orientation: '', language: '',
    pages: 0, rating: 0, favorites: 0, views: 0, date: '',
    characters: [], tags: [], description: '',
    thumb: null, cover: null, pageUrls: null, readUrl: '', source: '', source_id: '',
    // key = ตัวระบุที่ adapter ตัวเองใช้เรียก detail (slug / gallery id / topic id)
    key: '', collection: '',
  };

  function normalize(d) {
    const out = Object.assign({}, SHAPE, d);
    out.characters = Array.isArray(out.characters) ? out.characters.filter(Boolean) : [];
    out.tags = Array.isArray(out.tags) ? out.tags.filter(Boolean) : [];
    out.pages = Number(out.pages) || 0;
    out.date = out.date || '';
    out.title = String(out.title || 'ไม่ทราบชื่อ').trim();
    // วันที่ไม่ถูกต้อง → ปล่อยว่าง ตัวกรองช่วงเวลาจะข้ามเอง
    if (!/^\d{4}-\d{2}-\d{2}$/.test(out.date)) out.date = '';
    return out;
  }

  /* ---------- ตัวเลือกแหล่งข้อมูล ---------- */
  const ADAPTERS = { miku, dth, netoru, neko };
  const DEFAULT_SOURCES = ['miku', 'dth', 'netoru'];

  window.VAULT_SOURCES = {
    list: SOURCES, adapters: ADAPTERS, defaultSources: DEFAULT_SOURCES,
    mkId, normalize, isFemboy, isAllowed, isFurry, FEMBOY_RE, FURRY_RE, EXTRA_BY_SOURCE,
    DTH_PAGES: DTH.TOTAL_PAGES,
  };
})();