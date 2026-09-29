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
var UPLOAD_FOLDER_NAME = 'ไฟล์เอกสารคำขอ';

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
  folder_();
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
    storeFile: function (id, docType, f) {
      var root = folder_();
      var it = root.getFoldersByName(id);
      var dir = it.hasNext() ? it.next() : root.createFolder(id);
      var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mime || 'application/octet-stream', docType + '_' + f.name);
      var file = dir.createFile(blob);
      return { name: file.getName(), url: file.getUrl(), size: file.getSize() };
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
    if (res.ok && res.changed) saveDb_(db, res.changed);
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
