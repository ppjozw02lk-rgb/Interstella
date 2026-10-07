/* ทดสอบ parser กับ HTML จริงที่ proxy ดึงมา */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSources() {
  const src = fs.readFileSync(path.join(__dirname, 'assets/js/sources.js'), 'utf8');
  // URLSearchParams/URL/TextDecoder ใช้ใน sources.js — sandbox ต้องมีด้วย (เบราว์เซอร์มีให้อยู่แล้ว)
  const sandbox = { window: {}, console, URLSearchParams, URL, TextDecoder, encodeURIComponent, decodeURIComponent };
  // ใช้ fetch ของ Node จริง แล้วชี้ proxyBase ไปที่เซิร์ฟที่รันอยู่
  sandbox.fetch = (url, opts) => fetch(url.startsWith('http') ? url : 'http://127.0.0.1:8899' + url, opts);
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.window.VAULT_SOURCES;
}

(async () => {
  const S = loadSources();
  const miku = S.adapters.miku;

  /* ---------- กฎเข้ม: femboy เท่านั้น ----------
     นี่คือ invariant หลักของทั้งแอป ถ้าพังข้อนี้ คลังจะเริ่มมีของที่ไม่ใช่ femboy
     ต้องรันผ่านก่อนไปตรวจ parser อื่น */
  const FEMBOY_CASES = [
    ["The Femboy Is The Maid's Love Doll", true],
    ["The Idol's True Form Is a Femboy", true],
    ['femboy', true], ['FEMBOY', true], ['FeMbOy', true],
    ['femboys', true],            // พหูพจน์ยังเป็น femboy
    ['femboyish', false],         // \b กันคำที่ซ้อนอยู่ในคำอื่น
    ['thefemboy', false],
    ['Otome wa x', false],
    ['จากแฟนคลับ เป็นแฟนครับ [Kitahara Eiji]', false],
    ['หนวด-สัตว์', false], ['Yaoi', false], ['NTR', false], ['Uncensored', false],
    ['', false], [undefined, false], [{}, false],
  ];
  const ruleFails = FEMBOY_CASES
    .filter(([t, want]) => S.isFemboy({ title: t }) !== want)
    .map(([t, want]) => `${JSON.stringify(t)} expected ${want}`);
  console.log('--- RULE: femboy เท่านั้น ---');
  console.log(ruleFails.length
    ? 'PROBLEMS -> ' + ruleFails.join('; ')
    : `ผ่าน ${FEMBOY_CASES.length} เคส`);
  const ruleOk = !ruleFails.length;

  // ดึงหน้าแรกจริงผ่าน proxy (ไม่พึ่งไฟล์ fixture ที่อาจหายไป)
  const listHtml = await miku.html(S.list.miku.base + '/');
  const list = miku.parseList(listHtml);
  console.log('--- LIST ---');
  console.log('count:', list.length);
  list.slice(0, 4).forEach((d) => {
    console.log(` ${d.id}\n   title: ${d.title}\n   thumb: ${d.thumb}\n   date:  ${d.date}`);
  });

  // ไปดึง detail ของรายการแรก
  const detail = await miku.detail(list[0].slug);
  console.log('\n--- DETAIL ---');
  console.log('title:     ', detail.title);
  console.log('artist:    ', detail.artist);
  console.log('circle:    ', detail.circle);
  console.log('language:  ', detail.language);
  console.log('characters:', JSON.stringify(detail.characters));
  console.log('pages:     ', detail.pages);
  console.log('tags:      ', JSON.stringify(detail.tags));
  console.log('date:      ', detail.date);
  console.log('cover:     ', detail.cover);
  console.log('pageUrls[0]:', detail.pageUrls[0]);
  console.log('readUrl:   ', detail.readUrl);
  const bad = [];
  if (!detail.pages) bad.push('pages=0');
  if (!detail.pageUrls.length) bad.push('no pageUrls');
  if (!detail.title) bad.push('no title');
  if (detail.artist === 'Unknown') bad.push('artist not parsed');
  if (detail.tags.length < 2) bad.push('too few tags: ' + detail.tags.length);
  console.log('\nRESULT:', bad.length ? 'PROBLEMS -> ' + bad.join('; ') : 'all fields parsed');

  /* ---------- doujin-th.com (ฟอรัม Invision) ---------- */
  const dt = S.adapters.dth;
  const dtBad = [];
  console.log('\n--- DOUJIN-TH board (offset paging) ---');
  try {
    const firstIds = (h) => (h.match(/topic=(\d+)\.0/g) || []).slice(0, 3).join(',');
    const p1 = await dt.html(dt.boardUrl(1));
    const p2 = await dt.html(dt.boardUrl(2));
    const p3 = await dt.html(dt.boardUrl(3));
    // เลขกลางของ Invision คือ "จำนวนรายการที่ข้าม" → offset 0..23 = หน้า 1, offset 24 = หน้า 2
    const off0 = await dt.html(`${S.list.dth.forum}/board,1.0.html`);
    const off23 = await dt.html(`${S.list.dth.forum}/board,1.23.html`);
    const off24 = await dt.html(`${S.list.dth.forum}/board,1.24.html`);
    const off48 = await dt.html(`${S.list.dth.forum}/board,1.48.html`);
    console.log('page 1 (board,1.0)  :', firstIds(p1));
    console.log('board,1.23        :', firstIds(off23), ' <- ต้องซ้ำกับหน้า 1');
    console.log('board,1.24        :', firstIds(off24), ' <- ต้องต่าง = หน้า 2');
    console.log('board,1.48        :', firstIds(off48), ' <- ต้องตรงกับ page 3');
    if (firstIds(p1) !== firstIds(off0)) dtBad.push('boardUrl(1) ไม่ตรงกับ board,1.0');
    if (firstIds(p1) !== firstIds(off23)) dtBad.push('offset mapping ผิด: board,1.23 ควรเป็นหน้าเดียวกับหน้า 1');
    if (firstIds(p1) === firstIds(off24)) dtBad.push('offset mapping ผิด: board,1.24 ควรเป็นหน้า 2');
    if (firstIds(p3) !== firstIds(off48)) dtBad.push('offset mapping ผิด: board,1.48 ควรเป็นหน้า 3');
    if (firstIds(p2) !== firstIds(off24)) dtBad.push('boardUrl(2) ไม่ตรงกับ offset 24');

    const list = dt.parseList(p1);
    console.log('items หน้า 1:', list.length, '(ต้อง 24)');
    if (list.length !== 24) dtBad.push('หน้า 1 ได้ ' + list.length + ' รายการ ไม่ใช่ 24');
    list.slice(0, 2).forEach((d) => console.log(` ${d.id} | ${d.date} | ${d.circle} | ${(d.title || '').slice(0, 52)}`));
    if (list.some((d) => !d.title)) dtBad.push('มีรายการไม่มีชื่อเรื่อง');
    if (list.some((d) => !d.cover)) dtBad.push('มีรายการไม่มีปก (จับคู่ <style> ผิด)');
    if (list.some((d) => !d.date)) dtBad.push('มีรายการไม่มีวันที่จาก path รูป');

    // กฎเข้ม: หน้าแรกต้องไม่มีอะไรหลุดมา (ทุกชื่อไม่มีคำว่า femboy)
    if (list.some((d) => S.isFemboy(d))) dtBad.push('หน้า 1 มี femboy แต่เดิมไม่มี — กฎใหม่ผิด?');

    // หน้าแท็กของเว็บเอง (tagid=3309 = "femboy friend")
    const tagged = dt.parseList(await dt.html(dt.tagUrl(3309)));
    console.log('tag "femboy friend":', tagged.length, 'รายการ');
    tagged.forEach((d) => console.log('  -', d.id, '|', (d.title || '').slice(0, 60)));
    if (!tagged.length) dtBad.push('หน้าแท็ก 3309 ไม่มีรายการ');
    if (tagged.some((d) => !S.isFemboy(d))) dtBad.push('หน้าแท็กมีชื่อที่ไม่ใช่ femboy');

    // search: ค้นคำ → substring กรองชื่อเรื่อง, ไม่มีคำค้น → เอาหน้าแรกทั้งหมด
    const res = await dt.search('femboy');
    console.log('search("femboy") ได้', res.items.length, '| ตัดทิ้ง', res.dropped);
    if (!res.items.length) dtBad.push('search ไม่ได้อะไรเลย');
    if (res.items.some((d) => !S.isAllowed(d))) dtBad.push('search มีรายการที่ไม่ผ่าน isAllowed');

    // หน้าแรกแบบไม่ต้องค้น (ผู้ใช้สั่ง "เอาทุกอย่างที่เจอเลย") ต้องได้ของที่ไม่ใช่ femboy ด้วย
    const none = await dt.search('');
    const notFemboy = none.items.filter((d) => !S.isFemboy(d)).length;
    console.log('search("") ได้', none.items.length, 'รายการ | ไม่ใช่ femboy:', notFemboy);
    if (!none.items.length) dtBad.push('ไม่มีคำค้น → ต้องได้รายการจากหน้าแรก');
    if (!notFemboy) dtBad.push('ไม่มีคำค้น → ยังไม่มีของที่ไม่ใช่ femboy (ควรเอาทุกแนว)');
    if (none.items.some((d) => S.isFurry(d))) dtBad.push('มีแนว furry หลุดเข้าคลัง');

    // detail ของรายการ femboy ที่เจอแน่นอน
    const det = await dt.detail(35154);
    console.log('\n--- DOUJIN-TH DETAIL (topic 35154) ---');
    console.log('title:   ', det.title.slice(0, 70));
    console.log('circle:  ', det.circle, '| artist:', det.artist);
    console.log('pages:   ', det.pages, '| date:', det.date);
    console.log('tags:    ', JSON.stringify(det.tags));
    console.log('pageUrls[0]:', det.pageUrls[0]);
    if (!det.pages) dtBad.push('pages=0');
    if (det.pageUrls.length !== det.pages) dtBad.push(`pageUrls ${det.pageUrls.length} != pages ${det.pages}`);
    if (det.tags.length < 2) dtBad.push('แท็กน้อยเกินไป: ' + det.tags.length);
    if (det.artist === 'Unknown') dtBad.push('artist ไม่ได้');
    // หน้ารูปต้องเรียงตามเลข 1..N ไม่ใช่ตามลำดับที่เจอใน HTML
    const nums = det.pageUrls.map((u) => parseInt(u.split('/').pop().match(/(\d+)(?=\.\w+$)/)[1], 10));
    if (nums.some((n, i) => n !== i + 1)) dtBad.push('ลำดับหน้าไม่เรียง 1..N');
    console.log('เลขหน้าเรียง:', nums.slice(0, 6).join(','), '...', nums[nums.length - 1]);
  } catch (e) {
    dtBad.push('เรียกไม่สำเร็จ: ' + (e && e.message));
    console.log('\n--- DOUJIN-TH --- ไม่สำเร็จ:', e && e.message);
  }
  console.log('\nDOUJIN-TH RESULT:', dtBad.length ? 'PROBLEMS -> ' + dtBad.join('; ') : 'all fields parsed');

  /* ---------- neko-hentai.net (Cloudflare) ----------
     คาดหวังว่าจะถูกบล็อก: ต้องได้ข้อความที่บอกตรง ๆ ไม่ใช่ error กลม ๆ
     ถ้าวันหนึ่งเว็บเปิดให้ curl แล้ว ผลจะเปลี่ยนเป็น "parsed" อัตโนมัติ */
  const nk = S.adapters.neko;
  let nkStatus = 'blocked';
  console.log('\n--- NEKO-HENTAI ---');
  try {
    const r = await nk.search('femboy');
    nkStatus = 'parsed';
    console.log('ได้', r.items.length, 'รายการ (femboy + สาวดุ้น)');
    if (!r.items.length) dtBad.push('neko: ไม่ได้รายการ');
    r.items.slice(0, 3).forEach((d) => console.log(`  - [${d.collection}] ${d.title.slice(0, 58)}`));
    if (r.items.some((d) => d.collection === 'femboy' && !S.isFemboy(d))) dtBad.push('neko: ชุด femboy มีของที่ไม่ใช่ femboy');
    if (!S.isAllowed(r.items[0])) dtBad.push('neko: isAllowed ไม่ยอมรับรายการที่ adapter คืนมา');
  } catch (e) {
    console.log('ถูกบล็อกตามคาด:', e && e.message);
    if (!/Cloudflare/.test(String(e && e.message))) dtBad.push('neko: ข้อความ error ไม่ชัดว่าถูก Cloudflare บล็อก');
  }
  console.log('NEKO STATUS:', nkStatus, '(blocked = Cloudflare, parsed = ดึงได้จริง)');

  /* ไซต์บล็อกการดึงอัตโนมัติ แต่ parser ต้องยังถูกต้อง
     → ทดสอบกับ HTML จริงที่บันทึกไว้ตอนเปิดด้วยเบราว์เซอร์ (fixture) เสมอ ไม่ว่าเว็บจะบล็อกหรือไม่ */
  console.log('\n--- NEKO PARSER (fixture จาก HTML จริง) ---');
  const fx = (n) => fs.readFileSync(path.join(__dirname, n), 'utf8');
  const nkParsed = nk.parseSearch(fx('.tmp-neko-search-fixture.html'), 'femboy');
  console.log('ผลค้นหา femboy:', nkParsed.length, 'รายการ');
  nkParsed.forEach((d) => console.log(`  - ${d.id} | ${d.date} | ${d.circle} | ${d.title.slice(0, 46)}`));
  if (nkParsed.length !== 3) dtBad.push(`parseSearch ได้ ${nkParsed.length} รายการ ไม่ใช่ 3`);
  if (nkParsed.some((d) => !S.isFemboy(d))) dtBad.push('parseSearch: มีรายการที่ชื่อไม่ใช่ femboy');
  if (nkParsed.some((d) => d.artist === 'Unknown' || d.circle === 'Unknown')) dtBad.push('parseSearch: ยังไม่แยก circle/artist จาก [Circle (alias)]');
  if (nkParsed.some((d) => !d.cover || !/\/uploads\/thumbnail\//.test(d.cover))) dtBad.push('parseSearch: ไม่ได้ปก');
  if (nkParsed.some((d) => !d.date)) dtBad.push('parseSearch: ไม่ได้วันที่จาก "x เดือนที่แล้ว"');

  const nkBoobs = nk.parseSearch(fx('.tmp-neko-boobs-fixture.html'), 'boobs');
  console.log('ผลค้นหา สาวดุ้น:', nkBoobs.length, 'รายการ');
  if (nkBoobs.length !== 2) dtBad.push(`parseSearch สาวดุ้น ได้ ${nkBoobs.length} รายการ ไม่ใช่ 2`);
  if (nkBoobs.some((d) => !S.isAllowed(d))) dtBad.push('รายการสาวดุ้นไม่ผ่าน isAllowed');
  if (nkBoobs.some((d) => S.isFemboy(d))) dtBad.push('รายการสาวดุ้นติดป้าย collection ผิด');

  const nkDet = nk.parseDetail(fx('.tmp-neko-detail-fixture.html'), { id: 'neko-146pz', slug: '146pz' });
  console.log('\n--- NEKO DETAIL (fixture) ---');
  console.log('title:   ', nkDet.title.slice(0, 60));
  console.log('circle:  ', nkDet.circle, '| artist:', nkDet.artist);
  console.log('pages:   ', nkDet.pages, '| cover:', (nkDet.cover || '').slice(0, 60));
  console.log('pageUrls:', JSON.stringify(nkDet.pageUrls, null, 0).slice(0, 150));
  if (!nkDet.pages) dtBad.push('neko detail: pages=0');
  if (nkDet.pageUrls.length !== nkDet.pages) dtBad.push('neko detail: pageUrls ไม่ตรงกับ pages');
  if (!/maid no love doll/i.test(nkDet.title)) dtBad.push('neko detail: og:title ไม่ได้');
  if (nkDet.artist === 'Unknown') dtBad.push('neko detail: artist ไม่ได้');
  // data-src คือ lazy-load → ถ้าไม่มี data-src ต้องได้ 0 ไม่ใช่ไปอ่าน src ที่เป็น base64
  if (nkDet.pageUrls.some((u) => u.startsWith('data:'))) dtBad.push('neko detail: ไปอ่าน src ที่เป็น base64 placeholder');

  /* ---------- netoruhentai.com (WordPress) ---------- */
  const nt = S.adapters.netoru;
  const ntBad = [];
  console.log('\n--- NETORUHENTAI ---');
  try {
    const list = nt.parseCards(await nt.html(nt.listUrl(1)), 'femboy');
    console.log('หน้า /doujinshi:', list.length, 'การ์ด');
    list.slice(0, 2).forEach((d) => console.log('  -', d.id, '|', d.cover ? 'ปก✓' : 'ปก✗', '|', d.title.slice(0, 40)));
    if (!list.length) ntBad.push('หน้า list ไม่มีการ์ด');
    if (list.some((d) => !d.title)) ntBad.push('การ์ดไม่มีชื่อเรื่อง');
    if (list.some((d) => !d.cover || !/wp\.com/.test(d.cover))) ntBad.push('การ์ดไม่ได้ปก (data-src)');

    // pagination ของเว็บ
    const p2 = nt.parseCards(await nt.html(nt.listUrl(2)), 'femboy');
    console.log('หน้า 2:', p2.length, 'การ์ด | slug ต่างจากหน้า 1:',
      p2.length && list.length && p2[0].slug !== list[0].slug ? 'ใช่' : 'ไม่');
    if (p2.length && list.length && p2[0].slug === list[0].slug) ntBad.push('หน้า 2 ได้การ์ดเดิม = URL ผิด');

    // ไม่มีคำค้น = ไล่หน้าล่าสุด (ผู้ใช้สั่งเอาทุกอย่างที่เจอเลย ไม่ต้องค้น)
    const r = await nt.search('');
    console.log('search("") ได้', r.items.length, 'รายการ | ตัดทิ้ง', r.dropped, '| ตรวจชื่อจริง', r.checked);
    r.items.slice(0, 5).forEach((d) => console.log('  -', d.id, '|', d.pages + 'p', '|', d.title.slice(0, 54)));
    if (!r.items.length) ntBad.push('ไล่หน้าล่าสุดไม่ได้รายการ');
    if (r.items.some((d) => !S.isAllowed(d))) ntBad.push('มีรายการที่ไม่ผ่าน isAllowed');
    if (r.items.some((d) => S.isFurry(d))) ntBad.push('มีแนว furry หลุดเข้าคลัง');
    if (r.items.some((d) => !d.pages)) ntBad.push('ไม่ได้ URL รูปทุกหน้า');
    // ชื่อต้นฉบับต้องไม่ใช่ภาษาไทยล้วน (การ์ดบนเว็บมีแต่ชื่อไทย → verify ต้องดึงชื่อจริงมา)
    if (r.items.length && r.items.every((d) => /^[\u0E00-\u0E7F\s]+$/.test(d.title))) {
      ntBad.push('ชื่อยังเป็นภาษาไทยล้วน — verify ไม่ได้ดึงชื่อต้นฉบับ');
    }

    // ค้นคำที่ระบุ → ยังค้นได้ตามปกติ
    const rq = await nt.search('femboy');
    console.log('search("femboy") ได้', rq.items.length, 'รายการ');
    if (!rq.items.length) ntBad.push('ค้นคำ "femboy" แล้วไม่ได้รายการ');
    if (rq.items.some((d) => !S.isAllowed(d))) ntBad.push('ค้นคำแล้วมีรายการที่ไม่ผ่าน isAllowed');
  } catch (e) {
    ntBad.push('เรียกไม่สำเร็จ: ' + (e && e.message));
    console.log('\n--- NETORUHENTAI --- ไม่สำเร็จ:', e && e.message);
  }
  console.log('\nNETORU RESULT:', ntBad.length ? 'PROBLEMS -> ' + ntBad.join('; ') : 'all fields parsed');

  /* กฎ isAllowed (เปลี่ยนแล้ว): ผู้ใช้สั่ง "เอาทุกแนว" → รับทุกอย่างยกเว้นแนว furry
     จุดสำคัญ: ตอนนี้เนื้อหาที่ไม่ใช่ femboy (yaoi, สาวดุ้น, doujinshi ทั่วไป) ต้องผ่าน */
  const allowCases = [
    [{ title: 'x Femboy y', source: 'doujin-th.com' }, true],
    [{ title: 'femboys', source: 'miku-doujin.com' }, true],
    // ไม่ใช่ femboy แต่ต้องผ่าน เพราะเอาทุกแนว
    [{ title: 'โดจิน ทั่วไป ไม่มีคำว่า femboy', source: 'doujin-th.com' }, true],
    [{ title: 'Yaoi doujin', source: 'netoruhentai.com', collection: 'yaoi' }, true],
    [{ title: 'สาวดุ้น', source: 'neko-hentai.net', collection: 'boobs' }, true],
    [{ title: 'Tetora no Kaiju Suit', source: 'miku-doujin.com' }, true],
    [{ title: 'Shinryaku na Senpai', source: 'netoruhentai.com' }, true],
    [{ title: '' }, true],
    [{ title: 'ไม่มีอะไรเลย', source: 'netoruhentai.com' }, true],
    // ตัดแนว furry เท่านั้น
    [{ title: 'Kemonomimi Femboy', source: 'doujin-th.com' }, false],
    [{ title: 'Furry doujin', source: 'miku-doujin.com' }, false],
    [{ title: 'Yaoi', source: 'netoruhentai.com', collection: 'yaoi', tags: ['furry'] }, false],
  ];
  const allowFails = allowCases.filter(([d, want]) => S.isAllowed(d) !== want)
    .map(([d, want]) => `${JSON.stringify(d)} expected ${want}`);
  console.log('\n--- RULE: isAllowed (ทุกแนว ยกเว้น furry) ---');
  console.log(allowFails.length ? 'PROBLEMS -> ' + allowFails.join('; ') : `ผ่าน ${allowCases.length} เคส`);

  /* กฎตัดแนว furry — ผู้ใช้สั่ง "เอาออก"
     ต้องตัดแม้ชื่อผ่านกฎ femboy และตัดได้แม้ไม่มีแท็ก (ตอนไล่ listing แท็กมักว่าง)
     และต้องไม่ไปตัดงานธรรมดาที่คนมักเข้าใจผิดว่าเป็น furry */
  const FURRY_CASES = [
    // ต้องตัด
    [{ title: 'Kemonomimi Femboy' }, true],
    [{ title: 'Furry Boy in the City' }, true],
    [{ title: 'Neko Boy Femboy Life' }, true],
    [{ title: 'Neko Girl to Femboy' }, true],
    [{ title: '[Circle X] Wolf Boy no Femboy Himitsu' }, true],
    [{ title: 'Catboy Service' }, true],
    [{ title: 'Anthro Femboy Zettai' }, true],
    [{ title: 'Bunny Boy Joshi' }, true],
    // แท็กบอกแนว แม้ชื่อเรื่องไม่บอก
    [{ title: 'Femboy no Hanashi', tags: ['furry'] }, true],
    [{ title: 'Femboy no Hanashi', tags: ['kemono'] }, true],
    [{ title: 'Femboy no Hanashi', tags: ['catboy'] }, true],
    // ต้องไม่ตัด (false positive ที่เคยกังวล)
    [{ title: 'Ani→Yome!2 ~Kinjo no Kirai~' }, false],        // มี "Ani" ขึ้นต้นคำ
    [{ title: 'Ima, Boku no Femboy' }, false],               // มี "bo" ไม่ใช่ "boy"
    [{ title: 'Neko Hentai Anthology' }, false],             // ชื่อเว็บ ไม่ใช่แนวสัตว์
    [{ title: 'Animal Ears Femboy' }, false],                // สาวแมวสวมหูแมว ไม่ใช่ furry
    [{ title: 'Cat Girl Cosplay Femboy' }, true],      // ตัวละครครึ่งสัตว์ = แนว furry
    [{ title: 'Monster Girl wa Femboy' }, false],           // Touhou ไม่ใช่ furry
    [{ title: 'Femboy Friend - Part 2' }, false],            // ของจริงในคลัง ต้องไม่หาย
    [{ title: 'Frame Binder + Tentacle Suit (Femboy)' }, false],
    [{ title: 'Otokonoko wa Maid no Love Doll' }, false],
    [{ title: '' }, false], [{ title: 'Teddy Bear no Femboy' }, false],
  ];
  const furryFails = FURRY_CASES
    .filter(([d, want]) => S.isFurry(d) !== want)
    .map(([d, want]) => `isFurry ${JSON.stringify(d)} expected ${want}`);
  // isAllowed ต้องตัดแนว furry แม้อยู่ในชุดที่ผู้ใช้อนุมัติ
  const furryBlocked = [
    { title: 'Kemonomimi Femboy', source: 'doujin-th.com' },
    { title: 'ไม่มีคำ femboy เลย', source: 'netoruhentai.com', collection: 'yaoi', tags: ['furry'] },
    { title: 'สาวดุ้น', source: 'neko-hentai.net', collection: 'boobs', tags: ['wolfboy'] },
  ].filter((d) => S.isAllowed(d) !== false)
    .map((d) => `isAllowed ${JSON.stringify(d)} expected false`);
  console.log('\n--- RULE: ตัดแนว furry ---');
  const furryBad = furryFails.concat(furryBlocked);
  console.log(furryBad.length ? 'PROBLEMS -> ' + furryBad.join('; ') : `ผ่าน ${FURRY_CASES.length} + ${furryBlocked.length + 3} เคส`);

  // กฎ femboy สำคัญที่สุด → ให้ exit code สะท้อนผลของมันด้วย
  const allBad = [].concat(
    bad.map((x) => 'miku: ' + x),
    dtBad.map((x) => 'doujin-th/neko: ' + x),
    ntBad.map((x) => 'netoru: ' + x),
    allowFails.map((x) => 'isAllowed: ' + x),
    furryFails.map((x) => 'furry: ' + x),
    furryBlocked.map((x) => 'furry: ' + x)
  );
  console.log('\n=== สรุป ===');
  console.log(allBad.length ? 'PROBLEMS -> ' + allBad.join(' | ') : 'ทุกชุดผ่าน');
  if (!ruleOk || bad.length || dtBad.length || ntBad.length || allowFails.length
      || furryFails.length || furryBlocked.length) process.exitCode = 1;
})();