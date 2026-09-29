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
    { id: 'idcard', label: 'สำเนาบัตรประจำตัวประชาชน', paper: 'สำเนาบัตรประจำตัวประชาชน', when: 'all' },
    { id: 'house', label: 'สำเนาทะเบียนบ้าน', paper: 'สำเนาทะเบียนบ้าน', when: 'all' },
    { id: 'farmer', label: 'สำเนาบัตรประจำตัวชาวไร่อ้อย / ทะเบียนเกษตรกร', paper: 'สำเนาทะเบียนเกษตรกร/ชาวไร่อ้อย', when: 'all' },
    { id: 'deed', label: 'สำเนาโฉนดที่ดิน (ทั้ง 2 หน้า)', paper: 'สำเนาโฉนดที่ดินพื้นที่ที่ต้องการนำสิ่งปฏิกูลไปใช้ประโยชน์', when: 'all' },
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
  const paperName = id => (CFG.PRODUCTS.find(p => p.id === id) || {}).paper || '';
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
  // ?demo=1 = บังคับโหมดทดลอง (ใช้ฝึกอบรม/สาธิต โดยไม่แตะข้อมูลจริง)
  const DEMO = !CFG.API_URL || /[?&]demo=1/.test(location.search);
  const ENDPOINT = DEMO ? CFG.DEMO_API_URL : CFG.API_URL;
  const LIVE = !!ENDPOINT; // มี backend จริง (รวมเดโมกลาง) — ไม่ใช่เก็บในเบราว์เซอร์
  async function api(action, payload = {}) {
    if (!LIVE) return Mock.call(action, JSON.parse(JSON.stringify(payload)));
    const DOWN = 'ระบบหลังบ้านยังไม่พร้อมใช้งาน (ผู้ดูแลยังไม่ได้เปิดสิทธิ์ Google) — ลองใหม่ภายหลัง หรือใช้โหมดทดลอง';
    let r, j;
    try {
      r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // เลี่ยง CORS preflight
        body: JSON.stringify(Object.assign({ action }, payload)),
      });
    } catch (x) { throw new Error(navigator.onLine === false ? 'ไม่มีอินเทอร์เน็ต' : DOWN); }
    try { j = await r.json(); } catch (x) { throw new Error(DOWN); }
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
    <form class="reqform paper" novalidate>
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="p-head">
        <div class="p-no"><span>เล่มที่</span><i>${esc(v.bookNo || '')}</i></div>
        <div class="p-org"><img src="assets/logo.png" alt="" class="p-logo">${esc(CFG.ORG_NAME)}</div>
        <div class="p-no"><span>เลขที่</span><i>${esc(v.id || '(ออกให้อัตโนมัติ)')}</i></div>
      </div>
      <h3 class="p-title">ใบคำร้องขอ<span data-ptitle>${esc(paperName(v.product) || 'กากตะกอนหม้อกรอง')}</span></h3>
      <div class="p-date">วันที่ <u>${fmtDate(v.created || new Date().toISOString())}</u></div>

      <div class="p-line">
        <label class="p-f w60">ข้าพเจ้า<input name="name" value="${esc(v.name)}" required autocomplete="name" placeholder="ชื่อ-นามสกุล"></label>
        <label class="p-f w40">เบอร์โทรศัพท์ติดต่อ<input name="phone" value="${esc(v.phone)}" inputmode="tel" required autocomplete="tel" placeholder="08x-xxx-xxxx"></label>
      </div>
      <div class="p-line">
        <label class="p-f w60">เลขที่บัตรประชาชน<input name="citizenId" value="${esc(v.citizenId)}" inputmode="numeric" maxlength="17" required placeholder="13 หลัก"></label>
        <label class="p-f w40">เขตอ้อยที่<select name="zone" required ${zoneLocked ? 'disabled' : ''}><option value="">– เลือก –</option>${opt(CFG.ZONES, zoneLocked ? opts.user.zone : v.zone)}</select></label>
      </div>
      <div class="p-line">
        <label class="p-f w100">บ้านเลขที่<input name="address" value="${esc(v.address)}" required placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด"></label>
      </div>
      <div class="p-line">
        <label class="p-f w60">มีความประสงค์ขอนำ<select name="product" required><option value="">– เลือกชนิด –</option>${CFG.PRODUCTS.map(p => `<option value="${p.id}" ${v.product === p.id ? 'selected' : ''}>${esc(p.paper)}</option>`).join('')}</select></label>
        <div class="p-f w40">จำนวน <u class="p-calc" data-tons>–</u> ตัน/ปี</div>
      </div>
      <div class="p-line"><div class="p-f w100 p-text">จาก <u>${esc(CFG.ORG_NAME)}</u> ทะเบียนโรงงานเลขที่ <u>${esc(CFG.FACTORY_REG)}</u></div></div>
      <div class="p-line">
        <label class="p-f w30">ที่ดินมีเนื้อที่ (ไร่)<input name="rai" type="number" min="0.25" step="0.25" value="${esc(v.rai)}" inputmode="decimal" required></label>
        <label class="p-f w70">ตั้งอยู่<input name="landLocation" value="${esc(v.landLocation)}" required placeholder="หมู่ ตำบล อำเภอ จังหวัด"></label>
      </div>
      <div class="p-line"><div class="p-f w100 p-text">เพื่อนำไปใช้ <u>${esc(CFG.PURPOSE)}</u> จริง</div></div>
      <div class="p-line">
        <label class="p-f w50">ประเภทรถ<select name="truckType">${opt(CFG.TRUCK_TYPES, v.truckType || '')}</select></label>
        <label class="p-f w50">ทะเบียน<input name="plate" value="${esc(v.plate)}" placeholder="เช่น กพ-1234 พิษณุโลก"></label>
      </div>

      <div class="p-sec">โดยมีเอกสารที่ใช้เป็นหลักฐานประกอบใบคำร้อง ดังนี้ <small class="muted">(ถ่ายรูปแนบได้ — ต้องรับรองสำเนาถูกต้องทุกแผ่น)</small></div>
      <div class="radios">
        <span class="lbl">สิทธิ์ในที่ดิน</span>
        ${OWNERSHIP.map(o => `<label><input type="radio" name="ownership" value="${o.id}" ${(v.ownership || 'own') === o.id ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}
      </div>
      <ol class="p-docs" data-docs></ol>
      ${staff ? '' : '<p class="hint">ถ้ายังไม่มีรูปครบ ยื่นคำร้องก่อนได้ แล้วส่งเอกสารฉบับจริงให้หัวหน้าเขต หรือเข้ามาแนบเพิ่มที่เมนู “ตรวจสถานะ”</p>'}

      <div class="p-sec">เงื่อนไขทางบริษัท</div>
      <ol class="p-cond">${CFG.CONDITIONS.map(c => `<li>${esc(c)}</li>`).join('')}</ol>

      <details class="p-extra" ${staff ? 'open' : ''}><summary>ข้อมูลเพิ่มเติม (สำหรับใบปะหน้าเขต)</summary>
        <div class="grid2">
          <label>รถขนส่ง<select name="transport">${opt(CFG.TRANSPORT, v.transport || CFG.TRANSPORT[0])}</select></label>
          <label>ระยะทางจากโรงงาน (กม.)<input name="distanceKm" type="number" min="0" step="0.1" value="${esc(v.distanceKm)}" inputmode="decimal"></label>
          ${staff ? `<label>เล่มที่ (ใบคำร้องกระดาษ)<input name="bookNo" value="${esc(v.bookNo)}"></label>` : ''}
          <label class="span2">หมายเหตุ<textarea name="note" rows="2">${esc(v.note)}</textarea></label>
        </div>
      </details>

      ${staff ? '' : `<label class="consent"><input type="checkbox" name="agree" required> ข้าพเจ้าขอรับรองว่าข้อมูลข้างต้นเป็นความจริง และขอยอมรับเงื่อนไขทางบริษัทฯ ทุกประการ (ลงชื่อจริงบนใบคำร้องที่พิมพ์ เมื่อส่งเอกสารให้หัวหน้าเขต)</label>`}
      <div class="actions">
        ${opts.onCancel ? '<button type="button" class="btn ghost" data-cancel>ยกเลิก</button>' : ''}
        <button class="btn primary" type="submit">${v.id ? 'บันทึก' : 'ยื่นคำร้อง'}</button>
      </div>
    </form>`;
    const f = $('form', host);
    const picked = {}; // docType -> File[]
    function drawDocs() {
      const own = f.ownership.value || 'own';
      const have = v.docs || {};
      $('[data-docs]', f).innerHTML = docsFor(own).map(d => {
        const n = (have[d.id] || []).length + (picked[d.id] || []).length;
        return `<li class="docrow"><div>${esc(d.label)} 1 ฉบับ${n ? `<span class="ok">✓ ${n} ไฟล์</span>` : ''}</div>
          <label class="btn small">📷 แนบรูป<input type="file" accept="image/*,application/pdf" multiple data-doc="${d.id}" hidden></label></li>`;
      }).join('');
    }
    function calc() { const r = num(f.rai.value); $('[data-tons]', f).textContent = r ? fmtNum(r * CFG.TONS_PER_RAI, 1) : '–'; }
    drawDocs(); calc();
    f.rai.addEventListener('input', calc);
    f.addEventListener('change', e => {
      if (e.target.name === 'ownership') drawDocs();
      if (e.target.name === 'product') $('[data-ptitle]', f).textContent = paperName(f.product.value) || 'กากตะกอนหม้อกรอง';
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
          zone: fd.zone, bookNo: fd.bookNo, address: fd.address, rai: num(fd.rai),
          landLocation: fd.landLocation, distanceKm: fd.distanceKm, ownership: fd.ownership, transport: fd.transport,
          truckType: fd.truckType, plate: fd.plate, note: fd.note, website: fd.website,
        };
        const res = staff ? await api('save', { pin: opts.user.pin, data }) : await api('submit', { data });
        const auth = staff ? { pin: opts.user.pin } : { phone: data.phone };
        let failed = 0;
        const types = Object.keys(picked).filter(t => picked[t].length);
        for (let i = 0; i < types.length; i++) {
          btn.textContent = `กำลังทำ PDF และอัปโหลด ${i + 1}/${types.length}…`;
          try { await uploadDocs(res.id, auth, types[i], picked[types[i]]); }
          catch (x) { failed++; console.warn(x); }
        }
        btn.textContent = 'กำลังสร้างใบคำร้อง PDF…';
        const full = Object.assign({}, v, data, { id: res.id, created: v.created || new Date().toISOString(), tons: data.rai * CFG.TONS_PER_RAI });
        if (!(await uploadFormPdf(full, auth))) failed++;
        if (failed) toast(`อัปโหลดไม่สำเร็จ ${failed} รายการ — แนบใหม่ได้ภายหลัง`, true);
        opts.onDone && opts.onDone(res.id, data);
      } catch (x) {
        toast(x.message, true);
      } finally { btn.disabled = false; btn.textContent = v.id ? 'บันทึก' : 'ยื่นคำร้อง'; }
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

  // ---------- พิมพ์ใบคำร้อง A4 (จำลองแบบฟอร์มกระดาษของบริษัท) ----------
  function paperHtml(r) {
    const dot = (v, w) => `<span class="dl" style="min-width:${w}">${esc(v || '')}</span>`;
    const d = new Date(r.created || Date.now());
    const need = docsFor(r.ownership || 'own');
    return `<div class="pp">
      <div class="pp-head"><div>เล่มที่${dot(r.bookNo, '28mm')}</div><div class="pp-org"><img src="${LOGO_URL}" alt="" class="pp-logo">${esc(CFG.ORG_NAME)}</div><div>เลขที่${dot(r.id, '32mm')}</div></div>
      <div class="pp-title">ใบคำร้องขอ${esc(paperName(r.product) || 'กากตะกอนหม้อกรอง')}</div>
      <div class="pp-r">วันที่${dot(isNaN(d) ? '' : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }), '60mm')}</div>
      <p class="pp-l ind">ข้าพเจ้า${dot(r.name, '66mm')} เบอร์โทรศัพท์ติดต่อ${dot(r.phone, '32mm')}</p>
      <p class="pp-l">เลขที่บัตรประชาชน${dot(r.citizenId, '75mm')} เขตอ้อยที่${dot(r.zone, '40mm')}</p>
      <p class="pp-l">บ้านเลขที่${dot(r.address, '160mm')}</p>
      <p class="pp-l">มีความประสงค์ขอนำ${dot('', '18mm')}${dot(paperName(r.product), '45mm')}จำนวน${dot(r.tons ? fmtNum(r.tons, 2) : '', '40mm')}ตัน/ปี</p>
      <p class="pp-l">จาก <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${esc(CFG.ORG_NAME)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> ทะเบียนโรงงานเลขที่ <u>&nbsp;${esc(CFG.FACTORY_REG)}&nbsp;</u></p>
      <p class="pp-l">ที่ดินมีเนื้อที่${dot((r.rai ? fmtNum(r.rai, 2) + ' ไร่' : '') + (r.landLocation ? '  ตั้งอยู่ ' + r.landLocation : ''), '155mm')}</p>
      <p class="pp-l">เพื่อนำไปใช้ <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${esc(CFG.PURPOSE)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> จริง</p>
      <p class="pp-l" style="margin-top:8mm">ประเภทรถ${dot(r.truckType, '62mm')}ทะเบียน${dot(r.plate, '55mm')}</p>
      <div>โดยมีเอกสารที่ใช้เป็นหลักฐานประกอบใบคำร้อง ดังนี้</div>
      <ol class="pp-ol">${need.map(x => `<li>${esc(x.paper || x.label)} 1 ฉบับ</li>`).join('')}</ol>
      <div>เงื่อนไขทางบริษัท</div>
      <ol class="pp-ol">${CFG.CONDITIONS.map(c => `<li>${esc(c)}</li>`).join('')}</ol>
      <div class="pp-sign">
        <div>ลงชื่อ${dot('', '55mm')}ผู้ขอ<br>(${dot(r.name, '55mm')})</div>
        <div>ลงชื่อ${dot('', '55mm')}ผู้รับเรื่อง<br>(${dot('', '55mm')})</div>
      </div>
      <div class="pp-sign one"><div>ลงชื่อ${dot('', '55mm')}ผู้อนุมัติคำขอ<br>(${dot('', '50mm')})</div></div>
    </div>`;
  }
  // โลโก้บริษัทบนใบคำร้อง — โหลดไว้ก่อน เพื่อให้ขึ้นทันทีตอนพิมพ์/สร้าง PDF
  const LOGO_URL = new URL('assets/logo.png', location.href).href;
  const logoImg = new Image(); logoImg.src = LOGO_URL;
  const logoReady = () => (logoImg.decode ? logoImg.decode() : Promise.resolve()).catch(() => {});

  async function printPaper(r) {
    let el = $('#print');
    if (!el) { el = document.createElement('div'); el.id = 'print'; document.body.appendChild(el); }
    el.innerHTML = paperHtml(r);
    await logoReady();
    window.print();
  }

  // ---------- สร้าง PDF ในเบราว์เซอร์ (jsPDF + html2canvas จาก cdnjs โหลดเมื่อใช้) ----------
  const libs = {};
  function loadScript(src) {
    return libs[src] || (libs[src] = new Promise((ok, bad) => {
      const s = document.createElement('script'); s.src = src; s.onload = ok;
      s.onerror = () => { delete libs[src]; bad(new Error('โหลดตัวสร้าง PDF ไม่ได้ — ตรวจอินเทอร์เน็ต')); };
      document.head.appendChild(s);
    }));
  }
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const H2C = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  const pdfOut = (doc, name) => ({ name, mime: 'application/pdf', data: doc.output('datauristring').split(',')[1] });

  // รูปหลายรูป → PDF ไฟล์เดียว (A4 หน้าละรูป ย่อให้พอดีหน้า)
  async function imagesToPdf(files, name) {
    await loadScript(JSPDF);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < files.length; i++) {
      const img = await readFileForUpload(files[i]); // ย่อเป็น JPEG ≤1800px
      const el = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = 'data:image/jpeg;base64,' + img.data; });
      const landscape = el.width > el.height;
      if (i) doc.addPage('a4', landscape ? 'l' : 'p'); else if (landscape) { doc.deletePage(1); doc.addPage('a4', 'l'); }
      const pw = landscape ? 297 : 210, ph = landscape ? 210 : 297, m = 8;
      const k = Math.min((pw - 2 * m) / el.width, (ph - 2 * m) / el.height);
      const w = el.width * k, h = el.height * k;
      doc.addImage(img.data, 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
    }
    return pdfOut(doc, name);
  }

  // ใบคำร้อง → PDF หน้าตาเหมือนฉบับพิมพ์
  async function formPdf(r) {
    await Promise.all([loadScript(JSPDF), loadScript(H2C), logoReady()]);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;padding:45px 57px;background:#fff;color:#000';
    box.innerHTML = paperHtml(r);
    document.body.appendChild(box);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const c = await window.html2canvas(box, { scale: 2, backgroundColor: '#fff' });
      const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const h = Math.min(297, c.height * 210 / c.width);
      doc.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, 210, h);
      return pdfOut(doc, 'ใบคำร้อง.pdf');
    } finally { box.remove(); }
  }

  // อัปโหลดเอกสารประเภทเดียว: รูปทั้งหมดรวมเป็น PDF 1 ไฟล์, ไฟล์ PDF ส่งตามเดิม
  async function uploadDocs(id, auth, docType, files, onStep) {
    files = [...files];
    const imgs = files.filter(f => f.type.startsWith('image/')), others = files.filter(f => !f.type.startsWith('image/'));
    const jobs = [];
    if (imgs.length) jobs.push(() => imagesToPdf(imgs, docType + '.pdf'));
    others.forEach(f => jobs.push(() => readFileForUpload(f)));
    for (const job of jobs) {
      onStep && onStep();
      await api('upload', Object.assign({ id, docType }, auth, await job()));
    }
  }
  async function uploadFormPdf(r, auth) {
    try { await api('upload', Object.assign({ id: r.id, docType: 'form' }, auth, await formPdf(r))); return true; }
    catch (x) { console.warn(x); return false; }
  }

  // คง ?demo=1 ไว้เมื่อย้ายหน้า
  function keepDemoLinks() {
    if (!/[?&]demo=1/.test(location.search)) return;
    $$('a[href$=".html"]').forEach(a => (a.href = a.getAttribute('href') + '?demo=1'));
  }

  function footer() {
    keepDemoLinks();
    const el = $('#footer');
    if (el) el.innerHTML = `${esc(CFG.DEPT_NAME)} · ${esc(CFG.ORG_NAME)} · โทร ${esc(CFG.CONTACT_TEL)}${!DEMO ? '' : LIVE ? '<br><span class="demo-flag">โหมดทดลอง — ข้อมูลตัวอย่าง ทุกคนเห็นชุดเดียวกัน (รีเซ็ตทุกคืน) ห้ามใส่ข้อมูลจริง</span>' : '<br><span class="demo-flag">โหมดทดลอง — ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น</span>'}`;
    if (DEMO && !$('.demo-banner')) document.body.insertAdjacentHTML('afterbegin', `<div class="demo-banner">🧪 โหมดทดลอง${LIVE ? ' — ข้อมูลตัวอย่างที่ทุกคนเห็นเหมือนกัน (ล้างกลับทุกคืน)' : ''} · ห้ามใส่ข้อมูลจริง${CFG.API_URL ? ' · <a href="' + location.pathname + '">ไปหน้าใช้งานจริง</a>' : ''}</div>`);
  }

  window.FC = { CFG, STATUS, STEPS, DOCS, OWNERSHIP, STAFF_CHECKS, docsFor, $, $$, esc, digits, num, fmtNum, fmtDate, validThaiId,
    productName, paperName, printPaper, uploadDocs, uploadFormPdf, statusBadge, toast, readFileForUpload, api, LIVE, DEMO, renderRequestForm, stepper, footer };
})();
