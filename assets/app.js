/* แกนกลางที่ใช้ร่วมกันทุกหน้า: ค่าคงที่, ตัวช่วย, API (จริง/โหมดทดลอง), ฟอร์มคำขอ */
(function () {
  const CFG = window.FC_CONFIG;

  // ---------- สถานะ ----------
  const STATUS = {
    submitted: { label: 'ยื่นคำขอแล้ว รอหัวหน้าเขตตรวจ', short: 'รอเขตตรวจ', tone: 'gray', step: 1 },
    zone_ok:   { label: 'เขตตรวจแล้ว ส่งแผนกสิ่งแวดล้อม', short: 'ส่งสิ่งแวดล้อม', tone: 'blue', step: 2 },
    fix:       { label: 'ต้องแก้ไขเอกสาร', short: 'ต้องแก้ไข', tone: 'amber', step: 2 },
    env_ok:    { label: 'เอกสารผ่าน รอยื่นกรมโรงงาน', short: 'เอกสารผ่าน', tone: 'teal', step: 3 },
    filed:     { label: 'ยื่นกรมโรงงานแล้ว รอผลพิจารณา (ประมาณ 45–60 วัน)', short: 'ยื่นกรมโรงงาน', tone: 'violet', step: 4 },
    approved:  { label: 'ได้รับอนุญาต รอรับตั๋วนำออก', short: 'ได้รับอนุญาต', tone: 'green', step: 5 },
    done:      { label: 'นำออกแล้ว', short: 'นำออกแล้ว', tone: 'green', step: 6 },
    rejected:  { label: 'ไม่ได้รับอนุญาต', short: 'ไม่อนุญาต', tone: 'red', step: 5 },
    cancelled: { label: 'ยกเลิก', short: 'ยกเลิก', tone: 'red', step: 0 },
  };
  const STEPS = ['ยื่นคำขอ', 'เขตตรวจ', 'สิ่งแวดล้อมตรวจ', 'ยื่นกรมโรงงาน', 'อนุญาต', 'นำออก'];

  // ---------- เอกสารแนบ ----------
  const OWNERSHIP = [
    { id: 'own', label: 'เป็นเจ้าของที่ดินเอง (โฉนดชื่อผู้ขอ)' },
    { id: 'lease', label: 'เช่าที่ดิน มีสัญญาเช่า' },
    { id: 'consent', label: 'ใช้ที่ดินผู้อื่น ไม่มีสัญญาเช่า (ทำหนังสือยินยอม)' },
  ];
  const DOCS = [
    { id: 'idcard', label: 'สำเนาบัตรประจำตัวประชาชน', when: 'all' },
    { id: 'house', label: 'สำเนาทะเบียนบ้าน', when: 'all' },
    { id: 'farmer', label: 'สำเนาบัตรประจำตัวชาวไร่อ้อย / ทะเบียนเกษตรกร', when: 'all' },
    { id: 'deed', label: 'สำเนาโฉนดที่ดิน (ทั้ง 2 หน้า)', when: 'all' },
    { id: 'lease', label: 'สำเนาสัญญาเช่าที่ดิน', when: 'lease' },
    { id: 'consent', label: 'หนังสือยินยอมให้ใช้ประโยชน์ในที่ดิน', when: 'consent' },
    { id: 'owner', label: 'สำเนาบัตรประชาชน + ทะเบียนบ้าน ของเจ้าของโฉนด', when: 'lease consent' },
  ];
  const STAFF_CHECKS = [
    { id: 'certified', label: 'รับรองสำเนาถูกต้องครบทุกแผ่น (โฉนด: เจ้าของรับรองทั้ง 2 หน้า)' },
    { id: 'samename', label: 'เอกสารทุกฉบับเป็นชื่อผู้ขอคนเดียวกัน' },
    { id: 'notexpired', label: 'บัตรประชาชน / บัตรชาวไร่ยังไม่หมดอายุ' },
    { id: 'signed', label: 'ผู้ขอเซ็นใบคำขอ และผู้รับเรื่องเซ็นแล้ว' },
    { id: 'measures', label: 'ผู้ขอเซ็นรับเอกสารมาตรการป้องกันผลกระทบฯ แล้ว' },
  ];
  function docsFor(ownership) {
    return DOCS.filter(d => d.when === 'all' || d.when.split(' ').includes(ownership));
  }

  // ---------- ตัวช่วย ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const digits = v => String(v ?? '').replace(/\D/g, '');
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const fmtNum = (n, d = 0) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: d });
  function fmtDate(iso, withTime) {
    if (!iso) return '–';
    const d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    const o = { day: 'numeric', month: 'short', year: '2-digit' };
    if (withTime) Object.assign(o, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleString('th-TH', o);
  }
  function validThaiId(id) {
    id = digits(id);
    if (id.length !== 13) return false;
    let s = 0;
    for (let i = 0; i < 12; i++) s += +id[i] * (13 - i);
    return (11 - (s % 11)) % 10 === +id[12];
  }
  const productName = id => (CFG.PRODUCTS.find(p => p.id === id) || {}).short || id || '–';
  const statusBadge = st => {
    const s = STATUS[st] || { short: st, tone: 'gray' };
    return `<span class="badge tone-${s.tone}">${esc(s.short)}</span>`;
  };
  function toast(msg, bad) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(t._h); t._h = setTimeout(() => (t.className = ''), 3200);
  }

  // ย่อรูปก่อนอัปโหลด (ยาวสุด 1800px, JPEG) — PDF ส่งตามเดิม
  function readFileForUpload(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
      if (!file.type.startsWith('image/')) {
        if (file.size > 8 * 1024 * 1024) return reject(new Error('ไฟล์ใหญ่เกิน 8 MB'));
        fr.onload = () => resolve({ name: file.name, mime: file.type || 'application/octet-stream', data: fr.result.split(',')[1] });
        return fr.readAsDataURL(file);
      }
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 1800 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/jpeg', 0.75);
          resolve({ name: file.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', data: url.split(',')[1] });
        };
        img.onerror = () => reject(new Error('ไฟล์รูปเสีย'));
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // ---------- API ----------
  const LIVE = !!CFG.API_URL;
  async function api(action, payload = {}) {
    if (!LIVE) return Mock.call(action, JSON.parse(JSON.stringify(payload)));
    const r = await fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // เลี่ยง CORS preflight
      body: JSON.stringify(Object.assign({ action }, payload)),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'เกิดข้อผิดพลาด');
    return j;
  }

  // ---------- โหมดทดลอง: จำลอง backend ใน localStorage (ตรรกะเดียวกับ Code.gs) ----------
  const Mock = (() => {
    const KEY = 'fc-demo-v1';
    const USERS = [
      { pin: '000000', name: 'แผนกสิ่งแวดล้อม (ทดลอง)', role: 'env', zone: '' },
      { pin: '111111', name: 'หัวหน้าเขต 1 (ทดลอง)', role: 'zone', zone: '1' },
      { pin: '555555', name: 'หัวหน้าเขต 5 (ทดลอง)', role: 'zone', zone: '5' },
    ];
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { rows: [], seq: 0 }; } catch { return { rows: [], seq: 0 }; } };
    const save = db => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { throw new Error('พื้นที่เก็บข้อมูลเต็ม'); } };
    const logic = window.FC_LOGIC_FACTORY({
      now: () => new Date().toISOString(),
      users: () => USERS,
      nextId(db) { db.seq++; return 'FC' + CFG.SEASON.slice(2, 4) + CFG.SEASON.slice(-2) + '-' + String(db.seq).padStart(4, '0'); },
      storeFile: (id, docType, f) => ({ name: f.name, url: '', size: Math.round(f.data.length * 0.75) }),
      tonsPerRai: CFG.TONS_PER_RAI, batchMax: CFG.BATCH_MAX, season: CFG.SEASON,
    });
    return {
      async call(action, p) {
        await new Promise(r => setTimeout(r, 150));
        const db = load();
        const res = logic.handle(db, action, p);
        if (res.dirty) save(db);
        if (!res.ok) throw new Error(res.error);
        delete res.dirty;
        return res;
      },
    };
  })();

  // ---------- ฟอร์มคำขอ (ใช้ทั้งหน้าชาวไร่และหน้าเจ้าหน้าที่) ----------
  function renderRequestForm(host, opts = {}) {
    const v = opts.initial || {};
    const staff = !!opts.user;
    const zoneLocked = staff && opts.user.role === 'zone';
    const opt = (list, cur) => list.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
    host.innerHTML = `
    <form class="reqform" novalidate>
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <fieldset>
        <legend>1. ชนิดสิ่งปฏิกูลที่ต้องการ</legend>
        <div class="choice-grid">
          ${CFG.PRODUCTS.map(p => `<label class="choice"><input type="radio" name="product" value="${p.id}" ${v.product === p.id ? 'checked' : ''} required><span>${esc(p.name)}</span></label>`).join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend>2. ข้อมูลผู้ขอ</legend>
        <div class="grid2">
          <label>ชื่อ-นามสกุล *<input name="name" value="${esc(v.name)}" required autocomplete="name"></label>
          <label>เบอร์โทร *<input name="phone" value="${esc(v.phone)}" inputmode="tel" required autocomplete="tel" placeholder="08x-xxx-xxxx"></label>
          <label>เลขบัตรประชาชน 13 หลัก *<input name="citizenId" value="${esc(v.citizenId)}" inputmode="numeric" maxlength="17" required></label>
          <label>เลขที่โควตา / เลขชาวไร่<input name="quotaNo" value="${esc(v.quotaNo)}"></label>
          <label>เขต *<select name="zone" required ${zoneLocked ? 'disabled' : ''}><option value="">– เลือกเขต –</option>${opt(CFG.ZONES, zoneLocked ? opts.user.zone : v.zone)}</select></label>
          <label class="span2">ที่อยู่ (บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด) *<input name="address" value="${esc(v.address)}" required></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>3. ที่ดินที่จะนำไปใช้ประโยชน์ (ปรับปรุงพื้นที่ปลูกอ้อย)</legend>
        <div class="grid2">
          <label>จำนวนไร่ *<input name="rai" type="number" min="0.25" step="0.25" value="${esc(v.rai)}" inputmode="decimal" required></label>
          <label class="span2">ที่ดินตั้งอยู่ (หมู่ ตำบล อำเภอ จังหวัด) *<input name="landLocation" value="${esc(v.landLocation)}" required></label>
          <label>ระยะทางจากโรงงาน (กม.)<input name="distanceKm" type="number" min="0" step="0.1" value="${esc(v.distanceKm)}" inputmode="decimal"></label>
          <div class="calc"><span>จำนวนที่ขออนุญาต (ไร่ × ${CFG.TONS_PER_RAI})</span><b data-tons>–</b> ตัน</div>
        </div>
        <div class="radios">
          <span class="lbl">สิทธิ์ในที่ดิน *</span>
          ${OWNERSHIP.map(o => `<label><input type="radio" name="ownership" value="${o.id}" ${(v.ownership || 'own') === o.id ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend>4. การขนส่ง</legend>
        <div class="grid2">
          <label>รถขนส่ง<select name="transport">${opt(CFG.TRANSPORT, v.transport || CFG.TRANSPORT[0])}</select></label>
          <label>ประเภทรถ / ทะเบียน (ถ้าใช้รถผู้ขอ)<input name="truck" value="${esc(v.truck)}" placeholder="เช่น บรรทุก 10 ล้อ กพ-1234"></label>
          <label class="span2">หมายเหตุ<textarea name="note" rows="2">${esc(v.note)}</textarea></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>5. แนบรูปเอกสาร <small>(ถ่ายรูปด้วยมือถือได้ — ต้องรับรองสำเนาถูกต้องทุกแผ่น)</small></legend>
        <div data-docs></div>
        ${staff ? '' : '<p class="hint">ถ้ายังไม่มีรูปครบ ยื่นคำขอก่อนได้ แล้วส่งเอกสารฉบับจริงให้หัวหน้าเขต หรือเข้ามาแนบเพิ่มที่เมนู “ตรวจสถานะ”</p>'}
      </fieldset>
      ${staff ? '' : `<label class="consent"><input type="checkbox" name="agree" required> ข้าพเจ้ายืนยันว่าข้อมูลเป็นความจริง และยอมรับเงื่อนไขของบริษัทฯ (รับเองตามคิว, ขนย้ายต้องปิดคลุมท้ายรถทุกครั้ง, พื้นที่กองต้องไม่กระทบแปลงผู้อื่น, บริษัทฯ ไม่รับผิดชอบค่าใช้จ่ายการขนส่ง)</label>`}
      <div class="actions">
        ${opts.onCancel ? '<button type="button" class="btn ghost" data-cancel>ยกเลิก</button>' : ''}
        <button class="btn primary" type="submit">${v.id ? 'บันทึก' : 'ยื่นคำขอ'}</button>
      </div>
    </form>`;
    const f = $('form', host);
    const picked = {}; // docType -> File[]
    function drawDocs() {
      const own = f.ownership.value || 'own';
      const have = v.docs || {};
      $('[data-docs]', f).innerHTML = docsFor(own).map(d => {
        const n = (have[d.id] || []).length + (picked[d.id] || []).length;
        return `<div class="docrow"><div><b>${esc(d.label)}</b>${n ? `<span class="ok">✓ ${n} ไฟล์</span>` : ''}</div>
          <label class="btn small">📷 เลือกรูป/ไฟล์<input type="file" accept="image/*,application/pdf" multiple data-doc="${d.id}" hidden></label></div>`;
      }).join('');
    }
    function calc() { const r = num(f.rai.value); $('[data-tons]', f).textContent = r ? fmtNum(r * CFG.TONS_PER_RAI, 1) : '–'; }
    drawDocs(); calc();
    f.rai.addEventListener('input', calc);
    f.addEventListener('change', e => {
      if (e.target.name === 'ownership') drawDocs();
      if (e.target.dataset.doc) { picked[e.target.dataset.doc] = (picked[e.target.dataset.doc] || []).concat([...e.target.files]); drawDocs(); }
    });
    if (opts.onCancel) $('[data-cancel]', f).onclick = opts.onCancel;
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(f));
      if (zoneLocked) fd.zone = opts.user.zone;
      const err = [];
      if (!fd.product) err.push('เลือกชนิดสิ่งปฏิกูล');
      if (!fd.name || fd.name.trim().length < 4) err.push('กรอกชื่อ-นามสกุล');
      if (!/^0\d{8,9}$/.test(digits(fd.phone))) err.push('เบอร์โทรไม่ถูกต้อง');
      if (!validThaiId(fd.citizenId)) err.push('เลขบัตรประชาชนไม่ถูกต้อง');
      if (!fd.zone) err.push('เลือกเขต');
      if (!fd.address) err.push('กรอกที่อยู่');
      if (!(num(fd.rai) > 0)) err.push('กรอกจำนวนไร่');
      if (!fd.landLocation) err.push('กรอกที่ตั้งที่ดิน');
      if (!staff && !fd.agree) err.push('ติ๊กยืนยันข้อมูล');
      if (err.length) return toast(err.join(' • '), true);
      const btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = 'กำลังส่ง…';
      try {
        const data = {
          id: v.id, product: fd.product, name: fd.name.trim(), phone: digits(fd.phone), citizenId: digits(fd.citizenId),
          quotaNo: fd.quotaNo, zone: fd.zone, address: fd.address, rai: num(fd.rai),
          landLocation: fd.landLocation, distanceKm: fd.distanceKm, ownership: fd.ownership, transport: fd.transport,
          truck: fd.truck, note: fd.note, website: fd.website,
        };
        const res = staff ? await api('save', { pin: opts.user.pin, data }) : await api('submit', { data });
        const auth = staff ? { pin: opts.user.pin } : { phone: data.phone };
        let failed = 0, done = 0;
        const all = Object.entries(picked).flatMap(([t, files]) => files.map(file => [t, file]));
        for (const [docType, file] of all) {
          btn.textContent = `กำลังอัปโหลด ${++done}/${all.length}…`;
          try { await api('upload', Object.assign({ id: res.id, docType }, auth, await readFileForUpload(file))); }
          catch (x) { failed++; console.warn(x); }
        }
        if (failed) toast(`อัปโหลดไม่สำเร็จ ${failed} ไฟล์ — แนบใหม่ได้ภายหลัง`, true);
        opts.onDone && opts.onDone(res.id, data);
      } catch (x) {
        toast(x.message, true);
      } finally { btn.disabled = false; btn.textContent = v.id ? 'บันทึก' : 'ยื่นคำขอ'; }
    });
    return f;
  }

  function stepper(st) {
    const s = STATUS[st] || {};
    if (st === 'cancelled' || st === 'rejected') return `<div class="stepper-note tone-red">${esc(s.label)}</div>`;
    return `<ol class="stepper">${STEPS.map((name, i) => {
      const n = i + 1, cls = n < s.step || st === 'done' ? 'done' : n === s.step ? (st === 'fix' ? 'warn' : 'cur') : '';
      return `<li class="${cls}"><span>${n}</span>${esc(name)}</li>`;
    }).join('')}</ol>`;
  }

  function footer() {
    const el = $('#footer');
    if (el) el.innerHTML = `${esc(CFG.DEPT_NAME)} · ${esc(CFG.ORG_NAME)} · โทร ${esc(CFG.CONTACT_TEL)}${LIVE ? '' : '<br><span class="demo-flag">โหมดทดลอง — ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น</span>'}`;
  }

  window.FC = { CFG, STATUS, STEPS, DOCS, OWNERSHIP, STAFF_CHECKS, docsFor, $, $$, esc, digits, num, fmtNum, fmtDate, validThaiId,
    productName, statusBadge, toast, readFileForUpload, api, LIVE, renderRequestForm, stepper, footer };
})();
