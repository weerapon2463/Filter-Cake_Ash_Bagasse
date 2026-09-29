/**
 * Backend ระบบยื่นคำขอสิ่งปฏิกูลที่ไม่ใช้แล้ว (Google Sheets + Apps Script)
 * ไฟล์ในโปรเจกต์ Apps Script: Code.gs (ไฟล์นี้) + Logic.gs (คัดลอกจาก assets/logic.js ทั้งไฟล์)
 * ติดตั้ง: รัน setup() หนึ่งครั้งจาก editor → Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)
 */
var SHEET_REQ = 'คำขอ';
var SHEET_USERS = 'ผู้ใช้';
var SEASON = '2569/70';
var TONS_PER_RAI = 20;
var BATCH_MAX = 30;
var WRITE_ACTIONS = ['submit', 'upload', 'save', 'checks', 'setStatus'];
var ROOT_FOLDER_ID = '15C0mQHPmuD6Yy6KRKI7zo7DPHr8psBqQ'; // โฟลเดอร์ Drive ของโปรเจกต์ (Sheet อยู่ในนี้)
var UPLOAD_FOLDER_NAME = 'เอกสารคำขอ ' + SEASON.replace('/', '-');
// โครงสร้างโฟลเดอร์: เอกสารคำขอ 2569-70 / 01 ขี้หม้อกรอง / เขต 01 / FC6970-0001 ชื่อผู้ขอ / 00 ใบคำร้อง.pdf …
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
      [randomPin_(), 'แผนกสิ่งแวดล้อม', 'env', ''],
      [randomPin_(), 'หัวหน้าเขต 1', 'zone', '1'],
    ]).setNumberFormat('@');
    us.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  var root = folder_();
  for (var k in PRODUCT_DIRS) child_(root, PRODUCT_DIRS[k]);
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1') || ss.getSheetByName('ชีต1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  Logger.log('ตั้งค่าเสร็จ — ดู PIN ในแท็บ "%s" แล้ว Deploy เป็น Web app', SHEET_USERS);
}

function randomPin_() { return String(Math.floor(100000 + Math.random() * 900000)); }

function folder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var parent;
  try { parent = DriveApp.getFolderById(ROOT_FOLDER_ID); } catch (e) { parent = DriveApp.getRootFolder(); }
  var it = parent.getFoldersByName(UPLOAD_FOLDER_NAME);
  var f = it.hasNext() ? it.next() : parent.createFolder(UPLOAD_FOLDER_NAME);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function users_() {
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
    tonsPerRai: TONS_PER_RAI, batchMax: BATCH_MAX, season: SEASON,
    nextId: function () {
      var p = PropertiesService.getScriptProperties();
      var n = Number(p.getProperty('SEQ') || 0) + 1;
      p.setProperty('SEQ', String(n));
      return 'FC' + SEASON.slice(2, 4) + SEASON.slice(-2) + '-' + ('000' + n).slice(-4);
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

function handle_(p) {
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
