// ทดสอบหน้าเว็บจริงใน Chrome (headless) กับข้อมูลในเบราว์เซอร์ (?mock=1) — ไม่เรียก Google เลย
// รัน: node tests/e2e.mjs   (ต้องมี Chrome; ตั้ง CHROME=<path> ถ้าหาไม่เจอ)  ใช้ Node 22+ (มี WebSocket ในตัว)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dbg = (...a) => process.env.DBG && console.log('·', ...a);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => fs.existsSync(p));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.pdf': 'application/pdf', '.json': 'application/json' };

// ---------- เว็บเซิร์ฟเวอร์ในเครื่อง ----------
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------- Chrome + DevTools Protocol ----------
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-e2e-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${prof}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((ok, bad) => {
  let buf = ''; chrome.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) ok(m[1]); });
  setTimeout(() => bad(new Error('Chrome ไม่ตอบ')), 20000);
});
dbg('chrome', wsUrl);
const browser = new WebSocket(wsUrl); await new Promise(r => (browser.onopen = r));
let nextId = 1; const waiting = new Map(), listeners = [];
browser.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.bad(new Error(m.error.message)) : w.ok(m.result); }
  else listeners.forEach(f => f(m));
};
const send = (method, params = {}, sessionId) => new Promise((ok, bad) => { const id = nextId++; waiting.set(id, { ok, bad }); browser.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
const errors = [];
listeners.push(m => {
  if (m.sessionId !== S) return;
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }, S);
});
await send('Page.enable', {}, S); await send('Runtime.enable', {}, S);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function viewport(w, h, mobile) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }, S); }
// เปลี่ยนแค่ #… หน้าไม่โหลดใหม่ (ไม่มี load event) → ผ่าน about:blank ก่อนทุกครั้ง
async function goto(url) { await goto0('about:blank'); await goto0(BASE + url); await sleep(400); }
async function goto0(full) {
  const loaded = new Promise((r, bad) => {
    const tm = setTimeout(() => bad(new Error('โหลดหน้าไม่เสร็จใน 15 วินาที: ' + full)), 15000);
    listeners.push(function f(m) { if (m.sessionId === S && m.method === 'Page.loadEventFired') { clearTimeout(tm); listeners.splice(listeners.indexOf(f), 1); r(); } });
  });
  dbg('goto', full); await send('Page.navigate', { url: full }, S); await loaded; dbg('loaded');
}
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }, S);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const waitFor = (cond, ms = 5000) => js(`for (let t = 0; t < ${ms}; t += 100) { if (${cond}) return true; await new Promise(r => setTimeout(r, 100)); } return false;`);

let pass = 0, fail = 0;
function t(name, ok, extra) { if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name, extra === undefined ? '' : JSON.stringify(extra)); } }
const overflow = () => js(`const W = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > W + 2 && getComputedStyle(e).position !== 'fixed' && !e.closest('.table-wrap,.scroll-x'); }).slice(0, 5).map(e => e.tagName + '.' + e.className);`);

try {
  // ---------- ข้อมูลตั้งต้น: คำขอ 2 รายการในเขต 1 และเขต 5 ----------
  await viewport(1280, 900, false);
  await goto('/index.html?mock=1');
  const seeded = await js(`
    localStorage.clear();
    const cid = n => { const b = '3650' + String(10000123 + n * 7919).slice(-8); let s = 0; for (let i = 0; i < 12; i++) s += +b[i] * (13 - i); return b + ((11 - s % 11) % 10); };
    const base = { product: 'filtercake', name: 'นายทดสอบ อัตโนมัติ', phone: '0812345678', address: '1 ม.1', rai: 20, ownership: 'own' };
    const a = await FC.api('submit', { data: Object.assign({}, base, { citizenId: cid(1), zone: '1' }) });
    const b = await FC.api('submit', { data: Object.assign({}, base, { citizenId: cid(2), zone: '5', name: 'นางเขตห้า ทดสอบ' }) });
    return [a.id, b.id];`);
  const [idA, idB] = seeded;
  console.log('ข้อมูลตั้งต้น', seeded);

  // ---------- หัวหน้าเขต 1 ----------
  console.log('หัวหน้าเขต 1');
  await goto('/staff.html?mock=1');
  await js(`sessionStorage.clear(); document.querySelector('#loginForm [name=pin]').value = '111111'; document.querySelector('#loginForm').requestSubmit();`);
  t('เข้าสู่ระบบได้', await waitFor(`!document.querySelector('#app').hidden`));
  await waitFor(`document.querySelectorAll('[data-rows] tr[data-id]').length > 0`);
  const ids = await js(`return [...document.querySelectorAll('[data-rows] tr[data-id]')].map(r => r.dataset.id);`);
  t('เห็นเฉพาะคำขอเขตตัวเอง', ids.includes(idA) && !ids.includes(idB), ids);
  await js(`document.querySelector('tr[data-id="${idA}"]').click();`);
  await waitFor(`document.querySelector('dialog[open] [data-act]')`);
  const acts = await js(`return [...document.querySelectorAll('dialog[open] [data-act]')].map(b => b.textContent.trim());`);
  t('มีปุ่ม "ให้ผู้ขอแก้ไข" และ "ส่งแผนกสิ่งแวดล้อม"', acts.includes('ให้ผู้ขอแก้ไข') && acts.includes('ส่งแผนกสิ่งแวดล้อม'), acts);
  t('ไม่มีปุ่ม "เอกสารผ่าน → เสร็จ" (เป็นของแผนกสิ่งแวดล้อม)', !acts.some(a => /เสร็จ/.test(a)), acts);
  await js(`[...document.querySelectorAll('dialog[open] [data-act]')].find(b => b.textContent.trim() === 'ให้ผู้ขอแก้ไข').click();`);
  await waitFor(`document.querySelector('#stForm textarea')`);
  await js(`document.querySelector('#stForm').requestSubmit();`); await sleep(300);
  t('ไม่ระบุเหตุผล → ส่งไม่ได้ (ฟอร์มบังคับกรอก)', await js(`return !!document.querySelector('#stForm') && !document.querySelector('#stForm').checkValidity();`));
  await js(`document.querySelector('#stForm textarea').value = 'โฉนดไม่ครบ 2 หน้า'; document.querySelector('#stForm').requestSubmit();`);
  await sleep(800);
  const st1 = await js(`return (await FC.api('status', { id: '${idA}', phone: '0812345678' })).req;`);
  t('สถานะเป็น "ให้แก้" พร้อมเหตุผล', st1.status === 'fix' && /โฉนด/.test(st1.fixReason), st1.status);

  // ---------- ผู้ขอเห็นสิ่งที่ต้องแก้ ----------
  console.log('ผู้ขอ');
  await goto('/index.html?mock=1#check');
  await js(`const f = document.querySelector('#checkForm'); f.id.value = '${idA}'; f.phone.value = '0812345678'; f.requestSubmit();`);
  t('หน้าตรวจสถานะแสดงสิ่งที่ต้องแก้', await waitFor(`/โฉนดไม่ครบ/.test(document.querySelector('[data-result]').textContent)`));
  t('หน้าตรวจสถานะปิดชื่อบางส่วน (***) และไม่แสดงเลขบัตร', await js(`const x = document.querySelector('[data-result]').textContent; return /\\*\\*\\*/.test(x) && !/3650/.test(x);`));

  // ---------- แผนกสิ่งแวดล้อม ----------
  console.log('แผนกสิ่งแวดล้อม');
  await goto('/staff.html?mock=1');
  await js(`sessionStorage.clear(); location.reload();`); await sleep(800);
  await js(`document.querySelector('#loginForm [name=pin]').value = '000000'; document.querySelector('#loginForm').requestSubmit();`);
  await waitFor(`document.querySelectorAll('[data-rows] tr[data-id]').length > 1`);
  const envIds = await js(`return [...document.querySelectorAll('[data-rows] tr[data-id]')].map(r => r.dataset.id);`);
  t('เห็นทุกเขต', envIds.includes(idA) && envIds.includes(idB), envIds);
  await js(`document.querySelector('tr[data-id="${idB}"]').click();`);
  await waitFor(`document.querySelector('dialog[open] [data-act]')`);
  const envActs = await js(`return [...document.querySelectorAll('dialog[open] [data-act]')].map(b => b.textContent.trim());`);
  t('มีปุ่ม "เอกสารผ่าน → เสร็จ"', envActs.some(a => /เสร็จ/.test(a)), envActs);
  await js(`[...document.querySelectorAll('dialog[open] [data-act]')].find(b => /เสร็จ/.test(b.textContent)).click();`);
  await waitFor(`document.querySelector('#stForm')`);
  await js(`document.querySelector('#stForm').requestSubmit();`); await sleep(800);
  t('ปิดงานได้', (await js(`return (await FC.api('status', { id: '${idB}', phone: '0812345678' })).req.status;`)) === 'env_ok');

  // ---------- หน้าจอมือถือ ----------
  console.log('มือถือ 375px');
  await viewport(375, 800, true);
  for (const u of ['/index.html?mock=1', '/index.html?mock=1#apply', '/index.html?mock=1#check', '/staff.html?mock=1']) {
    await goto(u); await sleep(300);
    const o = await overflow();
    t('ไม่ล้นจอ ' + u, !o.length, o);
  }
  // หน้าเจ้าหน้าที่หลังเข้าสู่ระบบ: รายการเป็นการ์ด ไม่ต้องเลื่อนซ้าย-ขวา
  await js(`document.querySelector('#loginForm [name=pin]').value = '000000'; document.querySelector('#loginForm').requestSubmit();`);
  await waitFor(`document.querySelectorAll('[data-rows] tr[data-id]').length > 1`);
  const card = await js(`const tr = document.querySelector('[data-rows] tr[data-id]'), w = document.querySelector('.table-wrap');
    return { display: getComputedStyle(tr).display, scroll: w.scrollWidth - w.clientWidth, h: Math.round(tr.getBoundingClientRect().height) };`);
  t('รายการเจ้าหน้าที่เป็นการ์ด ไม่ต้องเลื่อนซ้าย-ขวา', card.display === 'grid' && card.scroll <= 2, card);
  if (process.env.SHOT) fs.writeFileSync(process.env.SHOT, Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, S)).data, 'base64'));
  t('การ์ดไม่สูงเกินไป (≤ 170px)', card.h <= 170, card.h);
  const o2 = await overflow(); t('ไม่ล้นจอ หน้าเจ้าหน้าที่ (เข้าสู่ระบบแล้ว)', !o2.length, o2);
  await js(`document.querySelector('[data-rows] tr[data-id]').click();`);
  t('แตะการ์ดแล้วเปิดรายละเอียด', await waitFor(`document.querySelector('dialog[open] [data-act], dialog[open] .kv')`));
  t('ไม่มี error ใน console', !errors.length, errors.slice(0, 3));
} catch (x) {
  fail++; console.log('  ✗ หยุดกลางคัน: ' + x.message);
} finally {
  browser.close(); chrome.kill(); server.close();
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
}
console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
