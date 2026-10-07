/* ============================================================
   serve.js — static server + proxy สำหรับดึงข้อมูลจริงจากต้นทางภายนอก
   วิธีใช้:  node serve.js [port]        default 8899
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = Number(process.argv[2] || 8899);
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

/* ---------- กันยิงเว็บต้นทางแน่นเกินไป (rate limit) ---------- */
/* จำกัดจำนวนคำขอต่อ host ต่อหน้าต่างเวลา เพื่อไม่ให้ไปรบกวนเว็บต้นทาง */
const RATE = { windowMs: 60_000, max: 40 };
const hits = new Map();
function rateOk(key) {
  const now = Date.now();
  const rec = hits.get(key) || [];
  const kept = rec.filter((t) => now - t < RATE.windowMs);
  if (kept.length >= RATE.max) { hits.set(key, kept); return false; }
  kept.push(now);
  hits.set(key, kept);
  return true;
}

/* ---------- cache สั้น ๆ กันยิงซ้ำ ---------- */
const CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/* ---------- proxy ----------
   GET /api/proxy?url=<url>&source=miku|dth|netoru|neko
   อนุญาตเฉพาะ host ที่ตั้งไว้ข้างบนเท่านั้น กันการใช้เป็น open proxy */
const ALLOWED = {
  miku: { host: 'miku-doujin.com' },
  // ฟอรัม Invision — หน้า listing/tag/thread ดึงได้ตรง ๆ ไม่มี Cloudflare
  dth: { host: 'doujin-th.com' },
  // WordPress — รูปอยู่บน i0.wp.com ที่เบราว์เซอร์โหลดตรงได้ (ไม่ต้องบาย)
  netoru: { host: 'netoruhentai.com' },
  // อยู่หลัง Cloudflare managed challenge: curl/headless ได้ 403 เสมอ
  // โค้ดยังเปิดให้ใช้ (เผื่อภายหลังปลดบล็อก) แต่ถ้าบล็อกจะตอบ 403 พร้อมคำอธิบาย
  neko: { host: 'neko-hentai.net' },
};

/* ---------- บาย DNS ----------
   เผื่อไว้สำหรับโดเมนที่ DNS ของ ISP ไทย (nsc01.awn.co.th) ตอบว่า Non-existent domain
   แต่ DNS สาธารณะ (1.1.1.1 / 8.8.8.8) ตอบได้ปกติ → จึงบายด้วยการบังคับ IP
   ให้ curl เล็กนั้น (SNI + Host ยังเป็นชื่อเดิมตามปกติ TLS ใช้ได้)

   ตอนนี้ไม่มีโดเมนไหนที่ต้องบาย — คงโครงไว้เป็นทางออกฉุกเฉิน */
const DNS_FALLBACK_IP = {};

/* cache IP ที่หาได้ ไม่งั้นแย่ nslookup ทุกคำขอ */
const ipCache = new Map();

function resolveVia(host) {
  if (ipCache.has(host)) return ipCache.get(host);
  const ips = DNS_FALLBACK_IP[host] || [];
  const cached = ips[Math.floor(Math.random() * ips.length)];
  if (cached) ipCache.set(host, cached);
  return cached;
}

/* ดึง upstream ด้วย curl
   ─────────────────────
   ต้องใช้ curl เพราะ Cloudflare (ที่หน้า miku-doujin อยู่หลัง) บล็อก
   TLS fingerprint ของ Node — ทั้ง https.request และ fetch ของ Node
   ได้ 403 ทุกกรณี ไม่ว่าจะตั้ง header อะไร ขณะที่ curl ผ่านได้
   (ตรวจแล้วจริง: curl 200 / node 403) ถ้าเครื่องไม่มี curl
   จะตอบ 501 พร้อมบอกผู้ใช้ให้ติดตั้ง

   รองรับ POST ด้วย เพราะ search ของ miku-doujin เป็น AJAX POST
   (GET ?s= ได้ผลเหมือนหน้าแรกทุกคำค้น = ไม่ได้กรองจริง) */
function fetchUpstream(urlStr, res, timeoutMs = 25000, onSuccess, postBody) {
  const args = [
    '-sSL', '--compressed',
    '--max-time', String(Math.ceil(timeoutMs / 1000)),
    '-A', UA,
    '-H', 'Accept: text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    '-H', 'Accept-Language: th-TH,th;q=0.9,en;q=0.8',
  ];
  const u = new URL(urlStr);
  // ถ้า host อยู่ในรายการบาย DNS → บังคับให้ curl ใช้ IP นั้น
  const forcedIp = resolveVia(u.hostname);
  if (forcedIp) args.push('--resolve', `${u.hostname}:443:${forcedIp}`);
  args.push('-H', 'Referer: ' + u.origin + '/');
  if (postBody) {
    args.push('-H', 'X-Requested-With: XMLHttpRequest',
              '-H', 'Content-Type: application/x-www-form-urlencoded',
              '--data', postBody, '-X', 'POST');
  }
  args.push('-w', '\\n__STATUS__%{http_code}', urlStr);

  execFile('curl', args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
    if (err && !stdout) {
      const msg = /ENOENT/.test(String(err.message))
        ? 'curl ไม่พบในเครื่อง — ต้องติดตั้ง curl แล้วรันใหม่'
        : String(err.message || err);
      res.writeHead(501, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: msg }));
    }
    const raw = String(stdout);
    const marker = raw.lastIndexOf('\n__STATUS__');
    const body = marker >= 0 ? raw.slice(0, marker) : raw;
    const status = marker >= 0 ? parseInt(raw.slice(marker + 11).trim(), 10) : 502;
    const type = body.trimStart().startsWith('{') || body.trimStart().startsWith('[')
      ? 'application/json; charset=utf-8'
      : 'text/html; charset=utf-8';

    // Cloudflare ส่งหน้า "Just a moment..." มาพร้อม 403
    // ตอบเป็น JSON ให้ฝั่งเว็บอ่านข้อความได้ตรง ๆ แทนที่จะ parse หน้า challenge แล้วเพี้ยน
    const cfChallenge = status === 403 && /Just a moment|cf_chl|challenge-platform|Cf-Mitigated/i.test(body);
    if (cfChallenge) {
      res.writeHead(403, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(JSON.stringify({
        error: 'Cloudflare challenge — ต้นทางนี้บล็อกการดึงอัตโนมัติ (ต้องเปิดด้วยเบราว์เซอร์จริง)',
        blocked: true,
      }));
    }

    if (onSuccess && status >= 200 && status < 300) onSuccess(Buffer.from(body, 'utf8'), type);

    res.writeHead(status || 502, {
      'Content-Type': type,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
    });
    res.end(body);
  });
}

function handleProxy(q, res) {
  const raw = q.get('url');
  const source = q.get('source') || 'miku';
  const post = q.get('post'); // เนื้อหา form body สำหรับ POST (เช่น keysearch=...)

  if (!raw) { res.writeHead(400, { 'Access-Control-Allow-Origin': '*' }); return res.end('missing url'); }

  let u;
  try { u = new URL(raw); } catch { res.writeHead(400, { 'Access-Control-Allow-Origin': '*' }); return res.end('bad url'); }
  if (u.protocol !== 'https:') { res.writeHead(400, { 'Access-Control-Allow-Origin': '*' }); return res.end('https only'); }

  const rule = ALLOWED[source];
  if (!rule) { res.writeHead(403, { 'Access-Control-Allow-Origin': '*' }); return res.end('unknown source'); }
  if (u.hostname !== rule.host) {
    res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ error: `host not allowed: ${u.hostname}` }));
  }

  if (!rateOk(rule.host)) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ error: 'rate limited — please wait a moment' }));
  }

  const key = (post ? 'POST ' + post + ' ' : 'GET ') + u.toString();
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    res.writeHead(200, {
      'Content-Type': hit.type,
      'Access-Control-Allow-Origin': '*',
      'X-Cache': 'HIT',
    });
    return res.end(hit.buf);
  }

  fetchUpstream(u.toString(), res, 25000, (buf, type) => {
    CACHE.set(key, { at: Date.now(), buf, type });
  }, post || null);
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  const rel = decodeURIComponent(parsed.pathname);

  if (rel === '/api/proxy') return handleProxy(parsed.searchParams, res);

  let p = rel === '/' ? '/index.html' : rel;
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      // no-store กันเบราว์เซอร์ค้างโค้ดเก่าไว้ (สำคัญตอนพัฒนา)
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(buf);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`por Doujin -> http://127.0.0.1:${PORT}`);
  console.log(`proxy: /api/proxy?url=...&source=${Object.keys(ALLOWED).join('|')}  (allowlisted, ${RATE.max} req/min per host)`);
  console.log('หมายเหตุ: neko-hentai.net อยู่หลัง Cloudflare challenge — proxy จะตอบ 403 ตรง ๆ ไม่หลอกว่าได้ข้อมูล');
});