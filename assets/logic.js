/* ตรรกะธุรกิจ — ใช้ไฟล์เดียวกันทั้งในเบราว์เซอร์ (โหมดทดลอง) และใน Apps Script (คัดลอกไปเป็น Logic.gs)
   db = { rows: [...], seq: n }  — handle() แก้ db ในที่ แล้วคืน { ok, ..., dirty, changed: [id] } */
var FC_FIELDS = [
  ['id', 'เลขที่คำขอ'], ['created', 'วันที่ยื่น'], ['channel', 'ช่องทาง'], ['season', 'ปีการผลิต'],
  ['product', 'ชนิด'], ['name', 'ชื่อ-นามสกุล'], ['phone', 'เบอร์โทร'], ['citizenId', 'เลขบัตรประชาชน'],
  ['quotaNo', 'เลขโควตา'], ['zone', 'เขต'], ['address', 'ที่อยู่'],
  ['landLocation', 'ที่ดินตั้งอยู่'], ['rai', 'จำนวนไร่'], ['tons', 'จำนวนขอ(ตัน)'], ['distanceKm', 'ระยะทาง(กม.)'],
  ['ownership', 'สิทธิ์ในที่ดิน'], ['transport', 'รถขนส่ง'], ['truck', 'ประเภทรถ/ทะเบียน'], ['note', 'หมายเหตุผู้ขอ'],
  ['status', 'สถานะ'], ['fixReason', 'สิ่งที่ต้องแก้ไข'], ['batchNo', 'ชุดยื่นกรมโรงงาน'], ['filedDate', 'วันที่ยื่นกรมโรงงาน'],
  ['permitNo', 'เลขที่หนังสืออนุญาต'], ['approvedDate', 'วันที่อนุญาต'], ['ticketNo', 'เลขที่ตั๋วนำออก'],
  ['deliveredTons', 'นำออกจริง(ตัน)'], ['trips', 'จำนวนเที่ยว'], ['doneDate', 'วันที่นำออก'], ['staffNote', 'หมายเหตุเจ้าหน้าที่'],
  ['docs', 'ไฟล์เอกสาร(JSON)'], ['checks', 'ตรวจเอกสาร(JSON)'], ['history', 'ประวัติ(JSON)'], ['updated', 'อัปเดตล่าสุด'],
];
var FC_JSON_FIELDS = ['docs', 'checks', 'history'];

var FC_LOGIC_FACTORY = function (env) {
  var TPR = env.tonsPerRai || 20, BATCH_MAX = env.batchMax || 30, SEASON = env.season || '2569/70';
  var EDITABLE = ['product', 'name', 'phone', 'citizenId', 'quotaNo', 'zone', 'address', 'landLocation', 'rai',
    'distanceKm', 'ownership', 'transport', 'truck', 'note'];
  var STATUSES = ['submitted', 'zone_ok', 'fix', 'env_ok', 'filed', 'approved', 'done', 'rejected', 'cancelled'];
  var ZONE_MOVES = { zone_ok: ['submitted', 'fix'], cancelled: ['submitted', 'fix', 'zone_ok'] };
  var UPLOAD_OPEN = ['submitted', 'zone_ok', 'fix'];

  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 300); }
  function fail(msg) { return { ok: false, error: msg }; }
  function find(db, id) { id = str(id).toUpperCase(); for (var i = 0; i < db.rows.length; i++) if (db.rows[i].id === id) return db.rows[i]; return null; }
  function touch(db, row, by, action) {
    row.updated = env.now();
    row.history = row.history || [];
    row.history.push({ t: row.updated, by: by, a: action });
    db._changed = db._changed || [];
    if (db._changed.indexOf(row.id) < 0) db._changed.push(row.id);
  }
  function done(db, extra) {
    var r = extra || {}; r.ok = true;
    if (db._changed && db._changed.length) { r.dirty = true; r.changed = db._changed; }
    delete db._changed;
    return r;
  }
  function user(p) {
    var pin = digits(p.pin);
    if (pin.length < 6) return null;
    var us = env.users();
    for (var i = 0; i < us.length; i++) if (String(us[i].pin) === pin) return us[i];
    return null;
  }
  function canSee(u, row) { return u.role === 'env' || String(row.zone) === String(u.zone); }
  function clean(data) {
    var o = {};
    EDITABLE.forEach(function (k) { if (data[k] !== undefined) o[k] = str(data[k], k === 'note' || k === 'address' ? 500 : 200); });
    if (o.phone !== undefined) o.phone = digits(o.phone);
    if (o.citizenId !== undefined) o.citizenId = digits(o.citizenId);
    if (o.rai !== undefined) { o.rai = Math.round(parseFloat(o.rai) * 100) / 100 || 0; o.tons = Math.round(o.rai * TPR * 100) / 100; }
    if (o.distanceKm !== undefined) o.distanceKm = parseFloat(o.distanceKm) || '';
    if (o.ownership !== undefined && ['own', 'lease', 'consent'].indexOf(o.ownership) < 0) o.ownership = 'own';
    return o;
  }
  function validate(o) {
    if (!o.product) return 'เลือกชนิดสิ่งปฏิกูล';
    if (!o.name || o.name.length < 4) return 'กรอกชื่อ-นามสกุล';
    if (!/^0\d{8,9}$/.test(o.phone)) return 'เบอร์โทรไม่ถูกต้อง';
    if (o.citizenId.length !== 13) return 'เลขบัตรประชาชนไม่ถูกต้อง';
    if (!o.zone) return 'เลือกเขต';
    if (!o.landLocation) return 'กรอกที่ตั้งที่ดิน';
    if (!(o.rai > 0) || o.rai > 5000) return 'จำนวนไร่ไม่ถูกต้อง';
    return '';
  }
  function duplicate(db, o, exceptId) {
    for (var i = 0; i < db.rows.length; i++) {
      var r = db.rows[i];
      if (r.id !== exceptId && r.season === SEASON && r.status !== 'cancelled' && r.citizenId === o.citizenId &&
        r.product === o.product && String(r.landLocation).replace(/s/g, "") === String(o.landLocation).replace(/s/g, "")) return r;
    }
    return null;
  }
  function create(db, o, channel, by) {
    var row = { id: env.nextId(db), created: env.now(), channel: channel, season: SEASON, status: 'submitted', docs: {}, checks: {}, history: [] };
    for (var k in o) row[k] = o[k];
    db.rows.push(row);
    touch(db, row, by, 'ยื่นคำขอ');
    return row;
  }
  function publicView(r) {
    var names = {};
    for (var k in (r.docs || {})) names[k] = (r.docs[k] || []).length;
    var nm = String(r.name || '');
    return {
      id: r.id, created: r.created, product: r.product, name: nm.slice(0, Math.max(3, Math.ceil(nm.length / 2))) + '***',
      zone: r.zone, rai: r.rai, tons: r.tons, ownership: r.ownership, status: r.status, fixReason: r.fixReason,
      filedDate: r.filedDate, permitNo: r.permitNo, approvedDate: r.approvedDate, ticketNo: r.ticketNo,
      deliveredTons: r.deliveredTons, doneDate: r.doneDate, docCount: names, updated: r.updated,
      canUpload: UPLOAD_OPEN.indexOf(r.status) >= 0,
      history: (r.history || []).map(function (h) { return { t: h.t, a: h.a }; }),
    };
  }

  var A = {
    submit: function (db, p) {
      var d = p.data || {};
      if (d.website) return done(db, { id: 'FC-OK' }); // honeypot กันบอท
      var o = clean(d);
      var e = validate(o); if (e) return fail(e);
      var dup = duplicate(db, o);
      if (dup) return fail('มีคำขอนี้อยู่แล้ว เลขที่ ' + dup.id + ' (ตรวจสถานะได้ที่เมนูตรวจสถานะ)');
      var row = create(db, o, 'ออนไลน์', 'ผู้ขอ');
      return done(db, { id: row.id });
    },
    status: function (db, p) {
      var r = find(db, p.id), ph = digits(p.phone);
      if (!r || ph.length < 4 || r.phone.slice(-ph.length) !== ph) return fail('ไม่พบคำขอ — ตรวจเลขที่คำขอและเบอร์โทรอีกครั้ง');
      return done(db, { req: publicView(r) });
    },
    upload: function (db, p) {
      var r = find(db, p.id); if (!r) return fail('ไม่พบคำขอ');
      var u = user(p);
      if (u) { if (!canSee(u, r)) return fail('ไม่มีสิทธิ์'); }
      else {
        var ph = digits(p.phone);
        if (ph.length < 9 || r.phone !== ph) return fail('ไม่มีสิทธิ์แนบไฟล์');
        if (UPLOAD_OPEN.indexOf(r.status) < 0) return fail('คำขอนี้ปิดการแนบไฟล์แล้ว');
      }
      if (!p.data || !p.docType) return fail('ไม่มีไฟล์');
      if (p.data.length > 11 * 1024 * 1024) return fail('ไฟล์ใหญ่เกินไป');
      var files = (r.docs[p.docType] || []);
      if (files.length >= 10) return fail('แนบได้สูงสุด 10 ไฟล์ต่อรายการ');
      var f = env.storeFile(r.id, p.docType, { name: str(p.name, 120) || 'file', mime: str(p.mime, 80), data: p.data });
      r.docs[p.docType] = files.concat([f]);
      touch(db, r, u ? u.name : 'ผู้ขอ', 'แนบไฟล์ ' + p.docType);
      return done(db, { file: f });
    },
    login: function (db, p) {
      var u = user(p); if (!u) return fail('รหัส PIN ไม่ถูกต้อง');
      return done(db, { user: { name: u.name, role: u.role, zone: u.zone } });
    },
    list: function (db, p) {
      var u = user(p); if (!u) return fail('กรุณาเข้าสู่ระบบใหม่');
      return done(db, { rows: db.rows.filter(function (r) { return canSee(u, r); }) });
    },
    save: function (db, p) {
      var u = user(p); if (!u) return fail('กรุณาเข้าสู่ระบบใหม่');
      var d = p.data || {}, o = clean(d);
      if (u.role === 'zone') o.zone = String(u.zone);
      if (d.id) {
        var r = find(db, d.id); if (!r || !canSee(u, r)) return fail('ไม่พบคำขอ');
        if (u.role === 'zone' && UPLOAD_OPEN.indexOf(r.status) < 0) return fail('ส่งต่อแล้ว แก้ไขไม่ได้ — ติดต่อแผนกสิ่งแวดล้อม');
        var merged = {}; for (var k in r) merged[k] = r[k]; for (var k2 in o) merged[k2] = o[k2];
        var e = validate(merged); if (e) return fail(e);
        var dup = duplicate(db, merged, r.id); if (dup) return fail('ซ้ำกับคำขอ ' + dup.id);
        for (var k3 in o) r[k3] = o[k3];
        touch(db, r, u.name, 'แก้ไขข้อมูล');
        return done(db, { id: r.id });
      }
      var e2 = validate(o); if (e2) return fail(e2);
      var dup2 = duplicate(db, o); if (dup2) return fail('มีคำขอนี้อยู่แล้ว เลขที่ ' + dup2.id);
      var row = create(db, o, 'เจ้าหน้าที่: ' + u.name, u.name);
      return done(db, { id: row.id });
    },
    checks: function (db, p) {
      var u = user(p); if (!u) return fail('กรุณาเข้าสู่ระบบใหม่');
      var r = find(db, p.id); if (!r || !canSee(u, r)) return fail('ไม่พบคำขอ');
      r.checks = {}; for (var k in (p.checks || {})) if (p.checks[k]) r.checks[str(k, 40)] = true;
      touch(db, r, u.name, 'ตรวจเอกสาร');
      return done(db, {});
    },
    setStatus: function (db, p) {
      var u = user(p); if (!u) return fail('กรุณาเข้าสู่ระบบใหม่');
      var st = p.status, x = p.extra || {};
      if (STATUSES.indexOf(st) < 0) return fail('สถานะไม่ถูกต้อง');
      var ids = (p.ids || []).slice(0, 500), rows = [];
      for (var i = 0; i < ids.length; i++) {
        var r = find(db, ids[i]); if (!r || !canSee(u, r)) return fail('ไม่พบคำขอ ' + ids[i]);
        if (u.role === 'zone' && (ZONE_MOVES[st] || []).indexOf(r.status) < 0) return fail(r.id + ': หัวหน้าเขตเปลี่ยนเป็นสถานะนี้ไม่ได้');
        rows.push(r);
      }
      if (!rows.length) return fail('ไม่ได้เลือกรายการ');
      if (st === 'fix' && !str(x.fixReason)) return fail('ระบุสิ่งที่ต้องแก้ไข');
      if (st === 'filed') {
        var b = str(x.batchNo, 40); if (!b) return fail('ระบุเลขชุดยื่น');
        var inBatch = db.rows.filter(function (r) { return r.batchNo === b && rows.indexOf(r) < 0; }).length;
        if (inBatch + rows.length > BATCH_MAX) return fail('ชุด ' + b + ' มี ' + inBatch + ' รายแล้ว — ยื่นได้ครั้งละไม่เกิน ' + BATCH_MAX + ' ราย');
      }
      var today = env.now().slice(0, 10);
      rows.forEach(function (r) {
        r.status = st;
        if (st === 'fix') r.fixReason = str(x.fixReason, 500);
        if (st === 'zone_ok' || st === 'env_ok') r.fixReason = r.fixReason ? '(แก้แล้ว) ' + String(r.fixReason).replace(/^\(แก้แล้ว\) /, '') : '';
        if (st === 'filed') { r.batchNo = str(x.batchNo, 40); r.filedDate = str(x.date) || today; }
        if (st === 'approved') { if (x.permitNo) r.permitNo = str(x.permitNo, 60); r.approvedDate = str(x.date) || today; }
        if (st === 'done') {
          if (x.ticketNo) r.ticketNo = str(x.ticketNo, 60);
          if (x.deliveredTons !== undefined && x.deliveredTons !== '') r.deliveredTons = parseFloat(x.deliveredTons) || 0;
          if (x.trips !== undefined && x.trips !== '') r.trips = parseInt(x.trips, 10) || 0;
          r.doneDate = str(x.date) || today;
        }
        if (x.staffNote) r.staffNote = str(x.staffNote, 500);
        touch(db, r, u.name, 'สถานะ → ' + st + (st === 'fix' ? ': ' + r.fixReason : ''));
      });
      return done(db, { count: rows.length });
    },
  };

  return {
    handle: function (db, action, p) {
      if (!A[action]) return fail('ไม่รู้จักคำสั่ง ' + action);
      try { return A[action](db, p || {}); } catch (e) { return fail('ผิดพลาด: ' + (e && e.message || e)); }
    },
  };
};
if (typeof window !== 'undefined') { window.FC_LOGIC_FACTORY = FC_LOGIC_FACTORY; window.FC_FIELDS = FC_FIELDS; }
