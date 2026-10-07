/* ============================================================
   data.js — ค่าคงที่ของเว็บ (ไม่มีข้อมูลตัวอย่าง)
   ------------------------------------------------------------
   ไฟล์นี้เป็น JS (ไม่ใช่ JSON) เพื่อให้เปิดด้วย file:// ได้โดยไม่ติด CORS

   ⚠️ ห้ามใส่คลังข้อมูลตัวอย่างที่นี่อีก
      คลังทั้งหมดมาจากต้นทางจริงผ่าน adapter ใน sources.js เท่านั้น
      (เคยมี LIBRARY เดโม 16 รายการตั้งแต่ต้น — ลบทิ้งแล้วเพราะเป็นข้อมูลปลอม
       และมีแนว furry ปนอยู่ด้วย ตอนนี้ไฟล์นี้เหลือแต่ค่าคงที่ที่ UI ต้องใช้จริง)
   ============================================================ */

/* ---------- ตัวกรอง (taxonomy) ---------- */
const FACETS = {
  language: { label: 'ภาษา', icon: '🌐' },
  category: { label: 'หมวด', icon: '🗂' },
  pairing: { label: 'คู่', icon: '💞' },
  orientation: { label: 'ท่าทาง', icon: '🔞' },
  content: { label: 'เนื้อหา', icon: '⚠' },
  role: { label: 'บทบาท', icon: '🎭' },
  body: { label: 'รูปร่าง', icon: '👤' },
  series: { label: 'ซีรีส์', icon: '✨' },
};

/* สีป้ายกำกับ (อิงโทนเว็บอ้างอิง: doujin-th / miku-doujin / netoruhentai)
   ผู้ใช้สั่งตัด "แนว furry" ออกจากคลัง → สีของแนวสัตว์ตกไปด้วย
   (กันไว้ให้ชื่อแนวสัตว์ไม่เผยอายู่ใน UI และกันคนเพิ่มแท็กกลับมา) */
const TAG_COLORS = {
  /* series / origin */
  parodies: '#12a0a0', animated: '#2b7de9', doujinshi: '#3fa34d', games: '#a45de9',
  vocaloid: '#ff7ab8', touhou: '#8a6de9', original: '#9e9e9e', doujinshi_sub: '#3fa34d',
  /* identity */
  femboy: '#ff6b9d', crossdressing: '#e0518f', makeup: '#ff8fb1', cosplay: '#f06292',
  transformation: '#c266d9', transformations: '#c266d9', 'magical girl': '#d81b60',
  crossdressingmagic: '#e91e63', idol: '#ff5252', miko: '#d500f9',
  /* body */
  large: '#ab47bc', huge: '#8e24aa', inflation: '#00897b', 'big breasts': '#e91e63',
  lactation: '#f06292', nipples: '#ec407a', petite: '#4db6ac', mecha: '#546e7a',
  /* acts */
  anal: '#7e57c2', bdsm: '#5e35b1', exhibitionism: '#d81b60', footjob: '#8d6e63',
  oral: '#ef6c00', paizuri: '#ec407a', rape: '#c62828', gangbang: '#c0392b',
  femdom: '#ad1457', tentacle: '#4527a0', tentaclegrip: '#512da8',
  hypnosis: '#3949ab', mindcontrol: '#5c6bc0', maid: '#607d8b', drill: '#880e4f',
  /* count / relation */
  multiple: '#66bb6a', foursome: '#43a047', gangbang_multi: '#c0392b', twincest: '#d81b60',
  twin: '#e91e63', futa: '#ec407a', male: '#00838f', solo: '#78909c',
  /* theme */
  magic: '#7c4dff', vampire: '#6a1b9a', youkai: '#4a148c', deity: '#311b92',
  horror: '#212121', doll: '#616161', monster: '#33691e', incident: '#455a64',
  incest: '#6d4c41', photography: '#37474f', streaming: '#e53935',
  incesty: '#6d4c41', school: '#795548', maiden: '#ad1457',
  'kamen rider': '#1e88e5', swimsuit: '#00838f', rock: '#d81b60',
  royal: '#f9a825', teacher: '#00695c', lolicon: '#c62828',
};

const LANG_LABEL = {
  // รหัสที่ adapter ฝั่งต้นทาง emit ได้ ต้องมีในนี้ด้วย ไม่งั้นป้ายตัวกรองจะขึ้น Undefined
  th: 'ไทย', jp: 'ญี่ปุ่น', en: 'อังกฤษ', zh: 'จีน', ko: 'เกาหลี',
  cn: 'จีน', kr: 'เกาหลี',
  enru: 'รัสเซีย (มีซับ)', fan: 'แฟนแปล',
};

const SORT_OPTIONS = [
  { id: 'newest', label: 'ใหม่สุด' },
  { id: 'popular', label: 'ยอดนิยม' },
  { id: 'favorites', label: 'ถูกใจมาก' },
  { id: 'pages', label: 'หน้ามากสุด' },
  { id: 'title', label: 'ชื่อ ก-ฮ' },
];

/* ---------- จุดต่อกับส่วนอื่น ----------
   app.js อ่านแค่ tagColors / langLabel / sorts — ไม่มีคลังสำรองให้ fallback แล้ว
   ถ้าต้นทางล้มเว็บจะแสดงความจริงว่าดึงไม่ได้ ไม่ใช่แสดงข้อมูลปลอม */
window.FEMBOY = {
  facets: FACETS,
  tagColors: TAG_COLORS,
  langLabel: LANG_LABEL,
  sorts: SORT_OPTIONS,
  version: '2.0.0-live',
};
