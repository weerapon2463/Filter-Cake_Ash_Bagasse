// ทดสอบตรรกะธุรกิจ (assets/logic.js) โดยไม่ต้องใช้ Google — รัน: node tests/logic.test.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logic.js'), 'utf8');
const { FC_LOGIC_FACTORY } = new Function(src + '; return { FC_LOGIC_FACTORY };')();

let clock = Date.parse('2026-10-01T08:00:00Z'), seq = 0, pass = 0, failN = 0;
const users = [
  { pin: '100001', name: 'สิ่งแวดล้อม', role: 'env', zone: '' },
  { pin: '200001', name: 'หัวหน้าเขต 1', role: 'zone', zone: '1' },
  { pin: '200005', name: 'หัวหน้าเขต 5', role: 'zone', zone: '5' },
];
const L = FC_LOGIC_FACTORY({
  now: () => new Date(clock).toISOString(), users: () => users, season: '2569/70',
  nextId: () => '2569-' + String(++seq).padStart(4, '0'),
  storeFile: (r, docType, f) => ({ name: docType + '.pdf', url: 'x', size: 1 }),
});
const db = { rows: [] };
const call = (a, p) => L.handle(db, a, p);
function t(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name); } else { failN++; console.log('  ✗ ' + name, extra || ''); } }

function cid(n) { const b = '3650' + String(10000123 + n * 7919).slice(-8); let s = 0; for (let i = 0; i < 12; i++) s += +b[i] * (13 - i); return b + ((11 - s % 11) % 10); }
const base = (o = {}) => Object.assign({ product: 'filtercake', name: 'นายทดสอบ ระบบ', phone: '0812345678', citizenId: cid(1), zone: '1', address: '1 ม.1', rai: 20, ownership: 'own' }, o);

console.log('ตรวจข้อมูลที่ยื่น');
t('เลขบัตรหลักตรวจสอบผิด → ปฏิเสธ', !call('submit', { data: base({ citizenId: '1234567890123' }) }).ok);
t('ชนิดสิ่งปฏิกูลที่ไม่รู้จัก → ปฏิเสธ', !call('submit', { data: base({ product: 'gold' }) }).ok);
const a = call('submit', { data: base() });
t('ยื่นคำขอปกติได้', a.ok && a.id === '2569-0001', a);
t('สิทธิ์ที่ดินหลายแบบเก็บครบ', call('submit', { data: base({ citizenId: cid(9), ownership: 'own lease junk consent' }) }).ok && db.rows[1].ownership === 'own lease consent');

console.log('คำขอซ้ำ');
t('กดส่งซ้ำภายใน 30 นาที → ซ้ำ', /มีคำขอนี้อยู่แล้ว/.test(call('submit', { data: base() }).error || ''));
clock += 31 * 60 * 1000;
t('แปลงที่สอง ไร่เท่ากัน ยื่นทีหลัง → ได้', call('submit', { data: base() }).ok);
t('ชนิดอื่น คนเดิม → ได้', call('submit', { data: base({ product: 'ash' }) }).ok);

console.log('สิทธิ์หัวหน้าเขต');
t('หัวหน้าเขตส่งกลับให้แก้ได้ (ต้องมีเหตุผล)', !call('setStatus', { pin: '200001', ids: [a.id], status: 'fix', extra: {} }).ok &&
  call('setStatus', { pin: '200001', ids: [a.id], status: 'fix', extra: { fixReason: 'โฉนดไม่ครบ 2 หน้า' } }).ok);
t('หัวหน้าเขตอื่นแก้คำขอเขต 1 ไม่ได้', !call('setStatus', { pin: '200005', ids: [a.id], status: 'zone_ok' }).ok);
t('หัวหน้าเขตตั้ง "เสร็จ" เองไม่ได้', !call('setStatus', { pin: '200001', ids: [a.id], status: 'env_ok' }).ok);
t('ส่งต่อแผนกฯ ได้หลังแก้', call('setStatus', { pin: '200001', ids: [a.id], status: 'zone_ok' }).ok);

console.log('ไฟล์');
const up = (o) => call('upload', Object.assign({ id: a.id, data: 'QUJD', mime: 'application/pdf', name: 'f.pdf' }, o));
t('ผู้ขอแนบใบคำร้องครั้งแรกได้', up({ phone: '0812345678', docType: 'form' }).ok);
t('ผู้ขอเขียนทับใบคำร้องไม่ได้', !up({ phone: '0812345678', docType: 'form' }).ok);
t('ผู้ขอแนบลายเซ็นครั้งแรกได้ / ทับไม่ได้', up({ phone: '0812345678', docType: 'sign' }).ok && !up({ phone: '0812345678', docType: 'sign' }).ok);
t('เจ้าหน้าที่สร้างใบคำร้องใหม่ทับได้', up({ pin: '100001', docType: 'form' }).ok && db.rows[0].docs.form.length === 1);
t('เบอร์ผิด แนบไม่ได้', !up({ phone: '0899999999', docType: 'idcard' }).ok);

console.log('ตรวจสถานะ');
const st = call('status', { id: a.id, phone: '0812345678' });
t('ค้นด้วยเลขคำขอ + เบอร์ ได้ชื่อเต็มของเจ้าของ', st.ok && st.req.ownerName === 'นายทดสอบ ระบบ' && /\*\*\*$/.test(st.req.name));
t('ค้นด้วยเลขบัตร ได้ทุกคำขอของคนนั้น', call('status', { id: cid(1), phone: '0812345678' }).reqs.length === 3);
t('เบอร์ไม่ครบ ค้นไม่ได้', !call('status', { id: a.id, phone: '5678' }).ok);

console.log(`\n${pass} ผ่าน · ${failN} ไม่ผ่าน`);
process.exit(failN ? 1 : 0);
