/**
 * Backend ระบบยื่นคำขอสิ่งปฏิกูลที่ไม่ใช้แล้ว (Google Sheets + Apps Script)
 * ไฟล์ในโปรเจกต์ Apps Script: Code.gs (ไฟล์นี้) + Logic.gs (คัดลอกจาก assets/logic.js ทั้งไฟล์)
 * ติดตั้ง: รัน setup() หนึ่งครั้งจาก editor → Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)
 */
var SHEET_REQ = 'คำขอ';
var SHEET_USERS = 'ผู้ใช้';
var SEASON = '2569/70';
var TONS_PER_RAI = 20;
var SHEET_SETTINGS = 'ตั้งค่า';
var SHEET_LOG = 'บันทึกการใช้งาน';
var WRITE_ACTIONS = ['submit', 'upload', 'save', 'checks', 'setStatus', 'removeRequest', 'removeFile',
  'userSave', 'userReset', 'userDelete', 'settingsSave'];
var ROLES = { admin: 'ผู้ดูแลระบบ', env: 'แผนกสิ่งแวดล้อม', zone: 'หัวหน้าเขต' };
var ROOT_FOLDER_ID = '15C0mQHPmuD6Yy6KRKI7zo7DPHr8psBqQ'; // โฟลเดอร์ Drive ของโปรเจกต์ (Sheet อยู่ในนี้)
// เดโมสาธารณะ = โปรเจกต์ Apps Script + Sheet แยก ที่มีไฟล์ Demo.gs บรรทัดเดียว: var DEMO_MODE = true;
// ตรวจตอนเรียกใช้ (ไม่ใช่ตอนโหลดไฟล์) เพราะ Apps Script โหลด Code.gs ก่อน Demo.gs
function isDemo_() { return typeof DEMO_MODE !== 'undefined' && DEMO_MODE === true; }
var DEMO_USERS = [
  { pin: '000000', name: 'แผนกสิ่งแวดล้อม (ทดลอง)', role: 'env', zone: '' },
  { pin: '111111', name: 'หัวหน้าเขต 1 (ทดลอง)', role: 'zone', zone: '1' },
  { pin: '555555', name: 'หัวหน้าเขต 5 (ทดลอง)', role: 'zone', zone: '5' },
  { pin: '999999', name: 'ผู้ดูแลระบบ (ทดลอง)', role: 'admin', zone: '' },
];
function uploadFolderName_() { return (isDemo_() ? 'DEMO ' : '') + 'เอกสารคำขอ ' + season_().replace('/', '-'); }
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

// แท็บ "ผู้ใช้": PIN | ชื่อ | บทบาท (admin/env/zone) | เขต | สถานะ (ใช้งาน/ปิด)
function sheetUsers_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS);
  if (!sh) return [];
  return sh.getDataRange().getDisplayValues().map(function (r, i) {
    return { row: i + 1, pin: String(r[0]).replace(/\D/g, ''), name: r[1], role: ROLES[r[2]] ? r[2] : 'zone', zone: String(r[3] || ''),
      active: String(r[4] || '').indexOf('ปิด') < 0 };
  }).slice(1).filter(function (u) { return u.pin; });
}
function users_() {
  var list = sheetUsers_().filter(function (u) { return u.active; });
  if (!isDemo_()) return list;
  var fixed = DEMO_USERS.map(function (u) { return u.pin; }); // เดโม: PIN ตัวอย่างใช้ได้เสมอ + ผู้ใช้ที่ลองเพิ่มเอง
  return DEMO_USERS.concat(list.filter(function (u) { return fixed.indexOf(u.pin) < 0; }));
}
function findUser_(pin) {
  pin = String(pin || '').replace(/\D/g, ''); if (pin.length < 6) return null;
  return users_().filter(function (u) { return u.pin === pin; })[0] || null;
}

// ---------- ตั้งค่าระบบ (แท็บ "ตั้งค่า": ชื่อค่า | ค่า JSON) — ค่าที่ไม่ได้ตั้งใช้ค่าเริ่มต้นใน config.js ----------
var SETTING_KEYS = {
  SEASON: 'text', TONS_PER_RAI: 'number', CONTACT_TEL: 'text', FACTORY_REG: 'text', PURPOSE: 'text',
  ZONES: 'list', CONDITIONS: 'list', CALENDAR: 'pairs', OPEN: 'bool', CLOSED_MSG: 'text', ANNOUNCE: 'text',
};
function settings_() {
  var c = CacheService.getScriptCache(), hit = c.get('settings');
  if (hit) return JSON.parse(hit);
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SETTINGS), out = {};
  if (sh) sh.getDataRange().getDisplayValues().slice(1).forEach(function (r) {
    if (SETTING_KEYS[r[0]]) try { out[r[0]] = JSON.parse(r[1]); } catch (e) {}
  });
  c.put('settings', JSON.stringify(out), 600);
  return out;
}
function season_() { return settings_().SEASON || SEASON; }
function cleanSetting_(type, v) {
  if (type === 'number') { v = Number(v); return v > 0 && v < 1000 ? v : null; }
  if (type === 'bool') return !!v;
  if (type === 'text') return String(v == null ? '' : v).trim().slice(0, 500);
  if (type === 'list') return (Array.isArray(v) ? v : []).map(function (x) { return String(x).trim().slice(0, 300); }).filter(String).slice(0, 60);
  if (type === 'pairs') return (Array.isArray(v) ? v : []).map(function (x) { return [String(x[0] || '').trim().slice(0, 200), String(x[1] || '').trim().slice(0, 100)]; })
    .filter(function (x) { return x[0]; }).slice(0, 40);
  return null;
}

// ---------- บันทึกการใช้งาน ----------
var ACTION_NAMES = { submit: 'ยื่นคำขอ', upload: 'แนบไฟล์', save: 'บันทึก/แก้ไขคำขอ', checks: 'บันทึกการตรวจเอกสาร', setStatus: 'เปลี่ยนสถานะ',
  login: 'เข้าสู่ระบบ', loginFail: 'ใส่ PIN ผิด', file: 'เปิดดูไฟล์', removeRequest: 'ลบคำขอ', removeFile: 'ลบไฟล์',
  userSave: 'บันทึกผู้ใช้', userReset: 'ตั้ง PIN ใหม่', userDelete: 'ลบผู้ใช้', settingsSave: 'แก้ตั้งค่าระบบ' };
function logSheet_() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_LOG);
    sh.getRange(1, 1, 1, 5).setValues([['เวลา', 'ผู้ใช้', 'บทบาท', 'การกระทำ', 'รายละเอียด']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function log_(who, role, action, detail) {
  try { logSheet_().appendRow([new Date().toISOString(), who, role, ACTION_NAMES[action] || action, String(detail || '').slice(0, 300)]); } catch (e) {}
}

// ---------- ปรับโครงสร้าง Sheet เดิมให้รองรับหลังบ้าน (ทำครั้งเดียว) ----------
var SCHEMA = '2';
function ensureSchema_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA') === SCHEMA) return;
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    if (props.getProperty('SCHEMA') === SCHEMA) return;
    var ss = SpreadsheetApp.getActive(), us = ss.getSheetByName(SHEET_USERS);
    if (us) {
      us.getRange(1, 3, 1, 3).setValues([['บทบาท (admin=ผู้ดูแลระบบ / env=แผนกสิ่งแวดล้อม / zone=หัวหน้าเขต)', 'เขต', 'สถานะ (ใช้งาน/ปิด)']]).setFontWeight('bold');
      // ของจริง: ยังไม่มีผู้ดูแลระบบ → เพิ่มให้ 1 คน (ดู PIN ในแท็บนี้ แล้วเปลี่ยนชื่อได้ในหน้าหลังบ้าน)
      if (!isDemo_() && !sheetUsers_().some(function (u) { return u.role === 'admin'; }))
        us.appendRow([randomPin_(), 'ผู้ดูแลระบบ', 'admin', '', 'ใช้งาน']);
      us.getRange('A:A').setNumberFormat('@');
    }
    if (!ss.getSheetByName(SHEET_SETTINGS)) {
      var st = ss.insertSheet(SHEET_SETTINGS);
      st.getRange(1, 1, 1, 2).setValues([['ชื่อค่า', 'ค่า (JSON) — แก้จากหน้าหลังบ้าน']]).setFontWeight('bold');
      st.getRange('B:B').setNumberFormat('@');
    }
    logSheet_();
    props.setProperty('SCHEMA', SCHEMA);
  } finally { lock.releaseLock(); }
}

// ---------- คำสั่งหลังบ้าน (ไม่ผ่าน logic.js เพราะต้องใช้ Sheet โดยตรง) ----------
function uniquePin_() {
  var all = sheetUsers_().map(function (u) { return u.pin; }).concat(DEMO_USERS.map(function (u) { return u.pin; })), pin;
  do { pin = randomPin_(); } while (all.indexOf(pin) >= 0);
  return pin;
}
function isFixedDemo_(u) { return isDemo_() && DEMO_USERS.some(function (d) { return d.pin === u.pin; }); }
var ADMIN = {
  config: function () { return { ok: true, settings: settings_() }; }, // สาธารณะ: หน้าเว็บโหลดค่าตั้งค่า
  adminUsers: function () {
    var fixed = isDemo_() ? DEMO_USERS.map(function (u) { return { row: 0, name: u.name, role: u.role, zone: u.zone, active: true, locked: true }; }) : [];
    return { ok: true, users: fixed.concat(sheetUsers_().filter(function (u) { return !isFixedDemo_(u); })
      .map(function (u) { return { row: u.row, name: u.name, role: u.role, zone: u.zone, active: u.active }; })) };
  },
  userSave: function (p) {
    var d = p.data || {}, role = ROLES[d.role] ? d.role : '', name = String(d.name || '').trim().slice(0, 80), zone = String(d.zone || '').trim().slice(0, 20);
    if (!name) return { ok: false, error: 'กรอกชื่อ' };
    if (!role) return { ok: false, error: 'เลือกบทบาท' };
    if (role === 'zone' && !zone) return { ok: false, error: 'หัวหน้าเขตต้องระบุเขต' };
    if (role !== 'zone') zone = '';
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS), users = sheetUsers_();
    if (d.row) {
      var u = users.filter(function (x) { return x.row === Number(d.row); })[0];
      if (!u || isFixedDemo_(u)) return { ok: false, error: 'ไม่พบผู้ใช้ (โหลดใหม่แล้วลองอีกครั้ง)' };
      var others = users.filter(function (x) { return x !== u && x.active && x.role === 'admin'; }).length + (isDemo_() ? 1 : 0);
      if (u.role === 'admin' && (role !== 'admin' || d.active === false) && !others) return { ok: false, error: 'ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน' };
      sh.getRange(u.row, 2, 1, 4).setValues([[name, role, zone, d.active === false ? 'ปิด' : 'ใช้งาน']]);
      return { ok: true, detail: name };
    }
    var pin = uniquePin_();
    sh.appendRow(['', name, role, zone, 'ใช้งาน']);
    sh.getRange(sh.getLastRow(), 1).setNumberFormat('@').setValue(pin);
    return { ok: true, pin: pin, detail: name };
  },
  userReset: function (p) {
    var u = sheetUsers_().filter(function (x) { return x.row === Number(p.row); })[0];
    if (!u || isFixedDemo_(u)) return { ok: false, error: 'ไม่พบผู้ใช้' };
    var pin = uniquePin_();
    SpreadsheetApp.getActive().getSheetByName(SHEET_USERS).getRange(u.row, 1).setNumberFormat('@').setValue(pin);
    return { ok: true, pin: pin, detail: u.name };
  },
  userDelete: function (p) {
    var users = sheetUsers_(), u = users.filter(function (x) { return x.row === Number(p.row); })[0];
    if (!u || isFixedDemo_(u)) return { ok: false, error: 'ไม่พบผู้ใช้' };
    if (u.role === 'admin' && !isDemo_() && !users.some(function (x) { return x !== u && x.active && x.role === 'admin'; }))
      return { ok: false, error: 'ลบผู้ดูแลระบบคนสุดท้ายไม่ได้' };
    SpreadsheetApp.getActive().getSheetByName(SHEET_USERS).deleteRow(u.row);
    return { ok: true, detail: u.name };
  },
  settingsSave: function (p) {
    var d = p.data || {}, sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SETTINGS), changed = [];
    var at = {};
    sh.getDataRange().getDisplayValues().forEach(function (r, i) { if (i) at[r[0]] = i + 1; });
    for (var k in d) {
      if (!SETTING_KEYS[k]) continue;
      var v = cleanSetting_(SETTING_KEYS[k], d[k]);
      if (v === null) return { ok: false, error: 'ค่าไม่ถูกต้อง: ' + k };
      var json = JSON.stringify(v);
      if (at[k]) sh.getRange(at[k], 2).setValue(json); else { sh.appendRow([k, json]); at[k] = sh.getLastRow(); }
      changed.push(k);
    }
    CacheService.getScriptCache().remove('settings');
    return { ok: true, settings: settings_(), detail: changed.join(', ') };
  },
  log: function (p) {
    var sh = logSheet_(), n = sh.getLastRow() - 1, take = Math.min(n, Number(p.limit) || 500);
    if (take <= 0) return { ok: true, rows: [] };
    return { ok: true, rows: sh.getRange(n + 2 - take, 1, take, 5).getDisplayValues().reverse() };
  },
};

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
    tonsPerRai: Number(settings_().TONS_PER_RAI) || TONS_PER_RAI, season: season_(),
    isOpen: function () { return settings_().OPEN !== false; },
    closedMessage: function () { return settings_().CLOSED_MSG || ''; },
    removeRequest: function (r) {
      var props = PropertiesService.getScriptProperties(), id = props.getProperty('DIR_' + r.id);
      if (id) { try { DriveApp.getFolderById(id).setTrashed(true); } catch (e) {} props.deleteProperty('DIR_' + r.id); }
    },
    trashFile: function (f) { try { DriveApp.getFileById(fileId_(f.url)).setTrashed(true); } catch (e) {} },
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
  ensureSchema_();
  var blocked = pinGuard_(p); if (blocked) return blocked;
  if (ADMIN[p.action]) {
    var me = null;
    if (p.action !== 'config') {
      me = findUser_(p.pin);
      if (!me) { var bad = { ok: false, error: 'กรุณาเข้าสู่ระบบใหม่' }; pinGuard_(p, bad); return bad; }
      if (me.role !== 'admin') return { ok: false, error: 'เฉพาะผู้ดูแลระบบ' };
    }
    var alock = null;
    if (WRITE_ACTIONS.indexOf(p.action) >= 0) { alock = LockService.getScriptLock(); alock.waitLock(20000); }
    try {
      var ares = ADMIN[p.action](p);
      if (ares.ok && me && ACTION_NAMES[p.action]) log_(me.name, me.role, p.action, ares.detail);
      delete ares.detail;
      return ares;
    } finally { if (alock) alock.releaseLock(); }
  }
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
    if (res.ok && res.removed) { // ลบแถวคำขอ (หาแถวใหม่ตามเลขที่ กันแถวเลื่อน)
      var ids = db.sheet.getRange(1, 1, db.sheet.getLastRow(), 1).getDisplayValues();
      for (var i = ids.length - 1; i > 0; i--) if (ids[i][0] === res.removed) { db.sheet.deleteRow(i + 1); break; }
    }
    logAction_(p, res);
    if (res.ok && res.changed) {
      if (p.action === 'save') res.changed.forEach(function (id) { // แก้ชนิด/เขต/ชื่อ → ย้ายโฟลเดอร์ตาม
        var r = db.rows.filter(function (x) { return x.id === id; })[0];
        if (r && r.folderUrl) try { requestDir_(r); } catch (e) {}
      });
      saveDb_(db, res.changed);
    }
    delete res.dirty; delete res.changed; delete res.removed;
    if (res.rows) res.rows = res.rows.map(function (r) { var o = {}; for (var k in r) if (k.charAt(0) !== '_') o[k] = r[k]; return o; });
    return res;
  } finally { if (lock) lock.releaseLock(); }
}

// บันทึกการใช้งาน: ทุกคำสั่งที่เปลี่ยนข้อมูล + เข้าสู่ระบบ + เปิดดูไฟล์ (ข้อมูลส่วนบุคคล)
function logAction_(p, res) {
  var a = p.action;
  if (a === 'login' && !res.ok) a = 'loginFail';
  if (!ACTION_NAMES[a] || (!res.ok && a !== 'loginFail')) return;
  var me = findUser_(p.pin), ph = String(p.phone || (p.data && p.data.phone) || '').replace(/\D/g, '');
  var who = me ? me.name : a === 'loginFail' ? '-' : 'ผู้ขอ' + (ph ? ' (…' + ph.slice(-4) + ')' : '');
  var detail = [p.id || res.id || (p.data && p.data.id) || (p.ids || []).join(','), p.status, p.docType].filter(function (x) { return x; }).join(' · ');
  log_(who, me ? me.role : '', a, detail);
}

function doPost(e) {
  var out;
  try { out = handle_(JSON.parse(e.postData.contents)); }
  catch (err) { out = { ok: false, error: 'ผิดพลาด: ' + (err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'fc-request', season: season_() })).setMimeType(ContentService.MimeType.JSON);
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
    [SHEET_SETTINGS, SHEET_LOG].forEach(function (n) { var x = SpreadsheetApp.getActive().getSheetByName(n); if (x && x.getLastRow() > 1) x.deleteRows(2, x.getLastRow() - 1); });
    var us = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS), keep = DEMO_USERS.map(function (u) { return u.pin; });
    if (us) for (var ui = us.getLastRow(); ui > 1; ui--) if (keep.indexOf(String(us.getRange(ui, 1).getDisplayValue())) < 0) us.deleteRow(ui);
    CacheService.getScriptCache().remove('settings');
    var props = PropertiesService.getScriptProperties(), all = props.getProperties();
    for (var k in all) if (k.indexOf('SEQ') === 0 || k.indexOf('DIR_') === 0) props.deleteProperty(k);
    var root = folder_(), it = root.getFolders();
    while (it.hasNext()) { var f = it.next(); var sub = f.getFolders(); while (sub.hasNext()) sub.next().setTrashed(true); }
    seedDemo_();
  } finally { lock.releaseLock(); }
}
