/**
 * Backend ระบบยื่นคำขอสิ่งปฏิกูลที่ไม่ใช้แล้ว (Google Sheets + Apps Script)
 * ไฟล์ในโปรเจกต์ Apps Script: Code.gs (ไฟล์นี้) + Logic.gs (คัดลอกจาก assets/logic.js ทั้งไฟล์)
 * ติดตั้ง: รัน setup() หนึ่งครั้งจาก editor → Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)
 */
var SHEET_REQ = 'คำขอ';
var SHEET_USERS = 'ผู้ใช้';
var SEASON = '2569/70';
var TONS_PER_RAI = 20;
var WRITE_ACTIONS = ['submit', 'upload', 'save', 'checks', 'setStatus'];
var ROOT_FOLDER_ID = '15C0mQHPmuD6Yy6KRKI7zo7DPHr8psBqQ'; // โฟลเดอร์ Drive ของโปรเจกต์ (Sheet อยู่ในนี้)
// เดโมสาธารณะ = โปรเจกต์ Apps Script + Sheet แยก ที่มีไฟล์ Demo.gs บรรทัดเดียว: var DEMO_MODE = true;
// ตรวจตอนเรียกใช้ (ไม่ใช่ตอนโหลดไฟล์) เพราะ Apps Script โหลด Code.gs ก่อน Demo.gs
function isDemo_() { return typeof DEMO_MODE !== 'undefined' && DEMO_MODE === true; }
var DEMO_USERS = [
  { pin: '000000', name: 'แผนกสิ่งแวดล้อม (ทดลอง)', role: 'env', zone: '' },
  { pin: '111111', name: 'หัวหน้าเขต 1 (ทดลอง)', role: 'zone', zone: '1' },
  { pin: '555555', name: 'หัวหน้าเขต 5 (ทดลอง)', role: 'zone', zone: '5' },
];
function uploadFolderName_() { return (isDemo_() ? 'DEMO ' : '') + 'เอกสารคำขอ ' + SEASON.replace('/', '-'); }
// โครงสร้างโฟลเดอร์: เอกสารคำขอ 2569-70 / 01 ขี้หม้อกรอง / เขต 01 / 2569-0001 ชื่อผู้ขอ / 00 ใบคำร้อง.pdf …
var PRODUCT_DIRS = { filtercake: '01 ขี้หม้อกรอง', leaf: '02 กากใบอ้อย', ash: '03 ขี้เถ้า' };
var DOC_NAMES = {
  form: '00 ใบคำร้อง', idcard: '01 สำเนาบัตรประชาชน', house: '02 สำเนาทะเบียนบ้าน', farmer: '03 สำเนาทะเบียนเกษตรกร',
  deed: '04 สำเนาโฉนดที่ดิน', lease: '05 สัญญาเช่าที่ดิน', consent: '05 หนังสือยินยอมให้ใช้ที่ดิน', owner: '06 เอกสารเจ้าของโฉนด',
};

function setup() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_REQ) || ss.insertSheet(SHEET_REQ);
  sh.getRange(1, 1, 1, FC_FIELDS.length).setValues([FC_FIELDS.map(function (f) { return f[1]; })]).setFontWeight('bold');
  sh.getRange(2, 1, sh.getMaxRows() - 1, FC_FIELDS.length).setNumberFormat('@'); // เก็บเป็นข้อความ กันเลข 0 นำหน้า/วันที่เพี้ยน
  sh.setFrozenRows(1);
  var us = ss.getSheetByName(SHEET_USERS);
  if (!us) {
    us = ss.insertSheet(SHEET_USERS);
    us.getRange('A:A').setNumberFormat('@');
    us.getRange(1, 1, 3, 4).setValues([
      ['PIN (6 หลัก)', 'ชื่อ', 'บทบาท (env=แผนกสิ่งแวดล้อม / zone=หัวหน้าเขต)', 'เขต'],
      isDemo_() ? ['000000', 'แผนกสิ่งแวดล้อม (ทดลอง) — เดโมใช้ PIN ชุดนี้ตายตัว', 'env', ''] : [randomPin_(), 'แผนกสิ่งแวดล้อม', 'env', ''],
      isDemo_() ? ['111111', 'หัวหน้าเขต 1 (ทดลอง)', 'zone', '1'] : [randomPin_(), 'หัวหน้าเขต 1', 'zone', '1'],
    ]).setNumberFormat('@');
    us.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  var root = folder_();
  for (var k in PRODUCT_DIRS) child_(root, PRODUCT_DIRS[k]);
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1') || ss.getSheetByName('ชีต1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  if (isDemo_()) {
    if (loadDb_().rows.length === 0) seedDemo_();
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'resetDemo') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('resetDemo').timeBased().everyDays(1).atHour(3).create();
  }
  Logger.log('ตั้งค่าเสร็จ — ดู PIN ในแท็บ "%s" แล้ว Deploy เป็น Web app', SHEET_USERS);
}

function randomPin_() { return String(Math.floor(100000 + Math.random() * 900000)); }

function folder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) { try { var cached = DriveApp.getFolderById(id); if (cached.getName() === uploadFolderName_() && !cached.isTrashed()) return cached; } catch (e) {} }
  var parent;
  try { parent = DriveApp.getFolderById(ROOT_FOLDER_ID); } catch (e) { parent = DriveApp.getRootFolder(); }
  var it = parent.getFoldersByName(uploadFolderName_());
  var f = it.hasNext() ? it.next() : parent.createFolder(uploadFolderName_());
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function users_() {
  if (isDemo_()) return DEMO_USERS;
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS);
  if (!sh) return [];
  return sh.getDataRange().getDisplayValues().slice(1).filter(function (r) { return r[0]; })
    .map(function (r) { return { pin: String(r[0]).replace(/\D/g, ''), name: r[1], role: r[2] === 'env' ? 'env' : 'zone', zone: String(r[3]) }; });
}

function loadDb_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_REQ);
  if (!sh) { setup(); sh = SpreadsheetApp.getActive().getSheetByName(SHEET_REQ); }
  var vals = sh.getDataRange().getDisplayValues();
  var rows = vals.slice(1).filter(function (r) { return r[0]; }).map(function (r, i) {
    var o = { _row: i + 2 };
    FC_FIELDS.forEach(function (f, j) {
      var v = r[j];
      if (FC_JSON_FIELDS.indexOf(f[0]) >= 0) { try { v = v ? JSON.parse(v) : (f[0] === 'history' ? [] : {}); } catch (e) { v = f[0] === 'history' ? [] : {}; } }
      else if (['rai', 'tons', 'deliveredTons', 'trips'].indexOf(f[0]) >= 0 && v !== '') v = Number(v);
      o[f[0]] = v;
    });
    return o;
  });
  return { rows: rows, seq: 0, sheet: sh };
}

function saveDb_(db, changed) {
  var sh = db.sheet;
  changed.forEach(function (id) {
    var r = db.rows.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var line = FC_FIELDS.map(function (f) {
      var v = r[f[0]];
      if (FC_JSON_FIELDS.indexOf(f[0]) >= 0) v = JSON.stringify(v || (f[0] === 'history' ? [] : {}));
      return v == null ? '' : String(v);
    });
    if (!r._row) r._row = sh.getLastRow() + 1;
    sh.getRange(r._row, 1, 1, line.length).setNumberFormat('@').setValues([line]);
  });
}

function child_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function safeName_(v) { return String(v || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); }
function zoneDir_(z) { z = String(z || '-'); return 'เขต ' + (/^\d+$/.test(z) ? ('0' + z).slice(-2) : z); }

// โฟลเดอร์ของคำขอ — สร้างครั้งแรก และย้าย/เปลี่ยนชื่อให้ตรงชนิด/เขต/ชื่อ ถ้าข้อมูลถูกแก้ภายหลัง
function requestDir_(r) {
  var props = PropertiesService.getScriptProperties();
  var parent = child_(child_(folder_(), PRODUCT_DIRS[r.product] || '99 อื่น ๆ'), zoneDir_(r.zone));
  var name = r.id + ' ' + safeName_(r.name);
  var id = props.getProperty('DIR_' + r.id), dir = null;
  if (id) { try { dir = DriveApp.getFolderById(id); if (dir.isTrashed()) dir = null; } catch (e) { dir = null; } }
  if (!dir) { dir = parent.createFolder(name); props.setProperty('DIR_' + r.id, dir.getId()); return dir; }
  var parents = dir.getParents();
  if (!parents.hasNext() || parents.next().getId() !== parent.getId()) dir.moveTo(parent);
  if (dir.getName() !== name) dir.setName(name);
  return dir;
}

function fileId_(url) { var m = String(url || '').match(/[-\w]{25,}/); return m ? m[0] : ''; }

function logic_() {
  return FC_LOGIC_FACTORY({
    now: function () { return new Date().toISOString(); },
    users: users_,
    tonsPerRai: TONS_PER_RAI, season: SEASON,
    nextId: function () { // ปี พ.ศ. + ลำดับ (เริ่มใหม่ทุกปี) เช่น 2569-0001
      var p = PropertiesService.getScriptProperties();
      var y = String(Number(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy')) + 543);
      var n = Number(p.getProperty('SEQ_' + y) || 0) + 1;
      p.setProperty('SEQ_' + y, String(n));
      return y + '-' + ('000' + n).slice(-4);
    },
    storeFile: function (r, docType, f, replaceFiles) {
      var dir = requestDir_(r);
      (replaceFiles || []).forEach(function (old) { try { DriveApp.getFileById(fileId_(old.url)).setTrashed(true); } catch (e) {} });
      var base = DOC_NAMES[docType] || docType;
      var ext = f.mime === 'application/pdf' ? '.pdf' : (String(f.name).match(/\.\w{2,5}$/) || [''])[0];
      var name = base + ext, n = 1;
      while (dir.getFilesByName(name).hasNext()) name = base + ' (' + (++n) + ')' + ext;
      var file = dir.createFile(Utilities.newBlob(Utilities.base64Decode(f.data), f.mime || 'application/octet-stream', name));
      return { name: file.getName(), url: file.getUrl(), size: file.getSize(), folderUrl: dir.getUrl() };
    },
    readFile: function (f) {
      try {
        var file = DriveApp.getFileById(fileId_(f.url));
        if (file.isTrashed()) return null;
        var b = file.getBlob();
        return { mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) };
      } catch (e) { return null; }
    },
  });
}

// กันเดา PIN: ผิดเกิน 20 ครั้งใน 10 นาที → ปิดการเข้าระบบ 10 นาที
function pinGuard_(p, res) {
  if (!p.pin) return null;
  var c = CacheService.getScriptCache(), n = Number(c.get('pinfail') || 0);
  if (n >= 20) return { ok: false, error: 'ใส่ PIN ผิดหลายครั้ง กรุณารอ 10 นาที' };
  if (res && !res.ok && /PIN|เข้าสู่ระบบ/.test(res.error)) c.put('pinfail', String(n + 1), 600);
  return null;
}

var DEMO_VER = '3'; // เพิ่มเลขเมื่อรูปแบบข้อมูลเปลี่ยน → เดโมล้างและสร้างตัวอย่างใหม่เองหนึ่งครั้ง
function demoInit_() {
  var props = PropertiesService.getScriptProperties();
  var ready = props.getProperty('DEMO_READY');
  if (ready === DEMO_VER) return;
  if (ready) { resetDemo(); props.setProperty('DEMO_READY', DEMO_VER); return; }
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    if (props.getProperty('DEMO_READY') === DEMO_VER) return;
    var ss = SpreadsheetApp.getActive(), us = ss.getSheetByName(SHEET_USERS);
    if (us) ss.deleteSheet(us); // แท็บผู้ใช้เดิมถูกสร้างแบบของจริง → สร้างใหม่ให้แสดง PIN ทดลอง
    props.deleteProperty('FOLDER_ID');
    setup();
    props.setProperty('DEMO_READY', DEMO_VER);
  } finally { lock.releaseLock(); }
}

function handle_(p) {
  if (isDemo_()) demoInit_();
  var blocked = pinGuard_(p); if (blocked) return blocked;
  if (p.action === 'submit') {
    var c = CacheService.getScriptCache(), k = 'sub' + Math.floor(Date.now() / 60000), n = Number(c.get(k) || 0);
    if (n > 60) return { ok: false, error: 'มีผู้ยื่นจำนวนมาก กรุณาลองใหม่อีกครั้ง' };
    c.put(k, String(n + 1), 120);
  }
  var lock = null;
  if (WRITE_ACTIONS.indexOf(p.action) >= 0) { lock = LockService.getScriptLock(); lock.waitLock(20000); }
  try {
    var db = loadDb_();
    var res = logic_().handle(db, p.action, p);
    pinGuard_(p, res);
    if (res.ok && res.changed) {
      if (p.action === 'save') res.changed.forEach(function (id) { // แก้ชนิด/เขต/ชื่อ → ย้ายโฟลเดอร์ตาม
        var r = db.rows.filter(function (x) { return x.id === id; })[0];
        if (r && r.folderUrl) try { requestDir_(r); } catch (e) {}
      });
      saveDb_(db, res.changed);
    }
    delete res.dirty; delete res.changed;
    if (res.rows) res.rows = res.rows.map(function (r) { var o = {}; for (var k in r) if (k.charAt(0) !== '_') o[k] = r[k]; return o; });
    return res;
  } finally { if (lock) lock.releaseLock(); }
}

function doPost(e) {
  var out;
  try { out = handle_(JSON.parse(e.postData.contents)); }
  catch (err) { out = { ok: false, error: 'ผิดพลาด: ' + (err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'fc-request', season: SEASON })).setMimeType(ContentService.MimeType.JSON);
}

// ---------- เดโม: ข้อมูลตัวอย่าง + ล้างทุกคืน ----------
function fakeCid_(n) {
  var b = '3650' + ('00000000' + (10000123 + n * 7919)).slice(-8), s = 0;
  for (var i = 0; i < 12; i++) s += Number(b[i]) * (13 - i);
  return b + ((11 - (s % 11)) % 10);
}
function seedDemo_() {
  var db = loadDb_(), L = logic_(), env = { pin: '000000' }, z1 = { pin: '111111' };
  var people = [
    ['นายสมชาย ตัวอย่าง', '1', 'filtercake', 12, 'env_ok'], ['นางสมศรี ทดลองดี', '1', 'filtercake', 25, 'zone_ok'],
    ['นายประยุทธ ไร่อ้อยงาม', '1', 'ash', 8, 'submitted'], ['นางบุญมี ใจเย็น', '5', 'filtercake', 40, 'env_ok'],
    ['นายสุชาติ ขยันทำ', '5', 'leaf', 15, 'fix'], ['นางมาลี ดอกอ้อย', '5', 'ash', 30, 'env_ok'],
    ['นายวิชัย ปลูกดี', '3', 'filtercake', 18, 'zone_ok'], ['นางสาวกัลยา ตัวอย่าง', 'เกษตรกร', 'leaf', 10, 'submitted'],
  ];
  people.forEach(function (x, i) {
    var res = L.handle(db, 'submit', { data: { product: x[2], name: x[0], phone: '08' + ('0000000' + (1234567 + i * 1111)).slice(-8),
      citizenId: fakeCid_(i), zone: x[1], address: (10 + i) + ' ม.' + (i + 1) + ' ต.ท่าทอง อ.เมือง จ.พิษณุโลก', rai: x[3],
      landLocation: 'ม.' + (i + 2) + ' ต.ท่าทอง อ.เมือง จ.พิษณุโลก', distanceKm: 3 + i, ownership: i % 3 === 1 ? 'lease' : 'own',
      transport: i % 2 ? 'รถผู้ขอ' : 'รถโรงงาน', truckType: i % 2 ? 'รถบรรทุก 10 ล้อ' : '', plate: i % 2 ? '80-' + (1000 + i) + ' พล.' : '' } });
    var id = res.id, st = x[4];
    var path = { submitted: [], zone_ok: ['zone_ok'], fix: ['zone_ok', 'fix'], env_ok: ['zone_ok', 'env_ok'] }[st];
    path.forEach(function (to) {
      L.handle(db, 'setStatus', { pin: '000000', ids: [id], status: to, extra: {
        fixReason: 'สำเนาโฉนดยังไม่รับรองสำเนาหน้า 2' } });
    });
  });
  saveDb_(db, db.rows.map(function (r) { return r.id; }));
}
function resetDemo() {
  if (!isDemo_()) throw new Error('ใช้ได้เฉพาะโปรเจกต์เดโม');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_REQ);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    var props = PropertiesService.getScriptProperties(), all = props.getProperties();
    for (var k in all) if (k.indexOf('SEQ') === 0 || k.indexOf('DIR_') === 0) props.deleteProperty(k);
    var root = folder_(), it = root.getFolders();
    while (it.hasNext()) { var f = it.next(); var sub = f.getFolders(); while (sub.hasNext()) sub.next().setTrashed(true); }
    seedDemo_();
  } finally { lock.releaseLock(); }
}
