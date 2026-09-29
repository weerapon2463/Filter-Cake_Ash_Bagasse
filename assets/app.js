/* แกนกลางที่ใช้ร่วมกันทุกหน้า: ค่าคงที่, ตัวช่วย, API (จริง/โหมดทดลอง), ฟอร์มคำขอ */
(function () {
  const CFG = window.FC_CONFIG;

  // ---------- สถานะ ----------
  const STATUS = {
    submitted: { label: 'ยื่นคำขอแล้ว รอหัวหน้าเขตตรวจ', short: 'รอเขตตรวจ', tone: 'gray', step: 1 },
    zone_ok:   { label: 'เขตตรวจแล้ว ส่งแผนกสิ่งแวดล้อม', short: 'ส่งสิ่งแวดล้อม', tone: 'blue', step: 2 },
    fix:       { label: 'ต้องแก้ไขเอกสาร', short: 'ต้องแก้ไข', tone: 'amber', step: 2 },
    env_ok:    { label: 'เสร็จ — แผนกสิ่งแวดล้อมตรวจเอกสารผ่านแล้ว', short: 'เสร็จ', tone: 'green', step: 4 },
    cancelled: { label: 'ยกเลิก', short: 'ยกเลิก', tone: 'red', step: 0 },
  };
  const STEPS = ['ยื่นคำขอ', 'เขตตรวจ', 'สิ่งแวดล้อมตรวจ', 'เสร็จ'];

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
    { id: 'certified', label: 'มีลายน้ำ + ตรา "สำเนาถูกต้อง" พร้อมลายเซ็นครบทุกแผ่น (โฉนด: ครบทั้ง 2 หน้า)' },
    { id: 'samename', label: 'เอกสารทุกฉบับเป็นชื่อผู้ขอคนเดียวกัน' },
    { id: 'notexpired', label: 'บัตรประชาชน / บัตรชาวไร่ยังไม่หมดอายุ' },
    { id: 'signed', label: 'ใบคำร้องมีลายเซ็นผู้ขอ' },
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
      nextId(db) { // ปี พ.ศ. + ลำดับ (เริ่มใหม่ทุกปี) เช่น 2569-0001
        const y = String(new Date().getFullYear() + 543) + '-';
        const n = db.rows.reduce((m, r) => String(r.id).startsWith(y) ? Math.max(m, parseInt(String(r.id).slice(y.length), 10) || 0) : m, 0);
        return y + String(n + 1).padStart(4, '0');
      },
      storeFile: (id, docType, f) => ({ name: f.name, url: '', size: Math.round(f.data.length * 0.75) }),
      tonsPerRai: CFG.TONS_PER_RAI, season: CFG.SEASON,
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
        <div></div>
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

      <div class="p-sec">โดยมีเอกสารที่ใช้เป็นหลักฐานประกอบใบคำร้อง ดังนี้ <small class="muted">(ถ่ายรูปเอกสารตัวจริง — ระบบใส่ลายน้ำและลายเซ็นรับรองสำเนาให้ทุกแผ่น)</small></div>
      <div class="radios">
        <span class="lbl">สิทธิ์ในที่ดิน</span>
        ${OWNERSHIP.map(o => `<label><input type="radio" name="ownership" value="${o.id}" ${(v.ownership || 'own') === o.id ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}
      </div>
      <ol class="p-docs" data-docs></ol>
      ${staff ? '' : '<p class="hint">ถ้ายังถ่ายไม่ครบ ยื่นคำร้องก่อนได้ แล้วเข้ามาถ่ายเพิ่มที่เมนู “ตรวจสถานะ”</p>'}

      <div class="p-sec">เงื่อนไขทางบริษัท</div>
      <ol class="p-cond">${CFG.CONDITIONS.map(c => `<li>${esc(c)}</li>`).join('')}</ol>

      <details class="p-extra" ${staff ? 'open' : ''}><summary>ข้อมูลเพิ่มเติม (สำหรับใบปะหน้าเขต)</summary>
        <div class="grid2">
          <label>รถขนส่ง<select name="transport">${opt(CFG.TRANSPORT, v.transport || CFG.TRANSPORT[0])}</select></label>
          <label>ระยะทางจากโรงงาน (กม.)<input name="distanceKm" type="number" min="0" step="0.1" value="${esc(v.distanceKm)}" inputmode="decimal"></label>
          <label class="span2">หมายเหตุ<textarea name="note" rows="2">${esc(v.note)}</textarea></label>
        </div>
      </details>

      <div class="p-sec">ลงชื่อผู้ขอ <small class="muted">(ใช้นิ้วเซ็นในกรอบ — ใช้รับรองใบคำร้องและรับรองสำเนาเอกสารทุกแผ่น)</small>${staff ? ' <small class="muted">— ถ้าผู้ขออยู่ด้วย</small>' : ''}</div>
      <div class="sigbox" data-sigbox></div>
      ${staff ? '' : `<label class="consent"><input type="checkbox" name="agree" required> ข้าพเจ้าขอรับรองว่าข้อมูลข้างต้นเป็นความจริง สำเนาเอกสารที่แนบถูกต้อง และขอยอมรับเงื่อนไขทางบริษัทฯ ทุกประการ</label>`}
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
        const n = (have[d.id] || []).length;
        const mine = picked[d.id] || [];
        return `<li class="docrow"><div>${esc(d.label)} 1 ฉบับ${n ? `<span class="ok">✓ ส่งแล้ว ${n} ไฟล์</span>` : ''}</div>
          ${docButtons(d.id)}
          ${mine.length ? `<div class="thumbs">${mine.map((file, i) => `<span class="thumb" data-view="${d.id}" title="ดูตัวอย่าง / แก้ไข">${file.type.startsWith('image/') ? `<img src="${thumbUrl(file)}" alt="">` : '<b>PDF</b>'}<button type="button" data-rm="${d.id}:${i}" aria-label="ลบรูป">✕</button></span>`).join('')}<button type="button" class="btn small" data-view="${d.id}">👁 ดูตัวอย่าง / แก้ไข</button></div>` : ''}</li>`;
      }).join('');
    }
    function calc() { const r = num(f.rai.value); $('[data-tons]', f).textContent = r ? fmtNum(r * CFG.TONS_PER_RAI, 1) : '–'; }
    drawDocs(); calc();
    const pad = signaturePad($('[data-sigbox]', f));
    const groupsOf = only => docsFor(f.ownership.value || 'own').filter(d => !only || d.id === only)
      .map(d => ({ docId: d.id, label: d.label, files: (picked[d.id] = picked[d.id] || []) }));
    const markNow = () => ({ product: f.product.value, name: f.name.value.trim(), sign: pad.isEmpty() ? '' : pad.toDataURL() });
    $('[data-docs]', f).addEventListener('click', async e => {
      const b = e.target.closest('[data-rm]');
      if (b) { const [doc, i] = b.dataset.rm.split(':'); picked[doc].splice(+i, 1); return drawDocs(); }
      const v2 = e.target.closest('[data-view]');
      if (v2) { await reviewDocs(groupsOf(v2.dataset.view), { title: 'ตัวอย่างสำเนาเอกสาร', mark: markNow(), signRequired: !staff }); drawDocs(); }
    });
    f.rai.addEventListener('input', calc);
    f.addEventListener('change', e => {
      if (e.target.name === 'ownership') drawDocs();
      if (e.target.name === 'product') $('[data-ptitle]', f).textContent = paperName(f.product.value) || 'กากตะกอนหม้อกรอง';
      if (e.target.dataset.doc) {
        const doc = e.target.dataset.doc, files = [...e.target.files]; e.target.value = '';
        signEach(files, markNow(), { required: !staff }).then(ok => { picked[doc] = (picked[doc] || []).concat(ok); drawDocs(); });
      }
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
      if (!staff && pad.isEmpty()) err.push('เซ็นชื่อผู้ขอในกรอบ');
      if (!staff && !fd.agree) err.push('ติ๊กยืนยันข้อมูล');
      if (err.length) return toast(err.join(' • '), true);
      // ตรวจก่อนส่ง: ใบคำร้อง + เอกสารทุกหน้า (แก้/ลบได้)
      const preview = Object.assign({}, v, fd, { id: v.id || '(ออกให้เมื่อส่ง)', name: fd.name.trim(), created: v.created || new Date().toISOString(),
        rai: num(fd.rai), tons: num(fd.rai) * CFG.TONS_PER_RAI, sign: pad.isEmpty() ? '' : pad.toDataURL() });
      const go = await reviewDocs(groupsOf().filter(gr => gr.files.length || !staff), { title: 'ตรวจก่อนส่ง', mark: markNow(), signRequired: !staff,
        formHtml: paperHtml(preview), okText: v.id ? 'ยืนยันบันทึก' : 'ยืนยันส่งคำร้อง' });
      drawDocs();
      if (!go) return;
      const btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = 'กำลังส่ง…';
      try {
        const data = {
          id: v.id, product: fd.product, name: fd.name.trim(), phone: digits(fd.phone), citizenId: digits(fd.citizenId),
          zone: fd.zone, address: fd.address, rai: num(fd.rai),
          landLocation: fd.landLocation, distanceKm: fd.distanceKm, ownership: fd.ownership, transport: fd.transport,
          truckType: fd.truckType, plate: fd.plate, note: fd.note, website: fd.website,
        };
        const res = staff ? await api('save', { pin: opts.user.pin, data }) : await api('submit', { data });
        const auth = staff ? { pin: opts.user.pin } : { phone: data.phone };
        const sign = pad.isEmpty() ? '' : pad.toDataURL();
        const mark = { product: data.product, name: data.name, sign };
        let failed = 0;
        const types = Object.keys(picked).filter(t => picked[t].length);
        for (let i = 0; i < types.length; i++) {
          btn.textContent = `กำลังทำ PDF และอัปโหลด ${i + 1}/${types.length}…`;
          try { await uploadDocs(res.id, auth, types[i], picked[types[i]], null, mark); }
          catch (x) { failed++; console.warn(x); }
        }
        btn.textContent = 'กำลังสร้างใบคำร้อง PDF…';
        const full = Object.assign({}, v, data, { id: res.id, created: v.created || new Date().toISOString(), tons: data.rai * CFG.TONS_PER_RAI, sign });
        if (!(await uploadFormPdf(full, auth))) failed++;
        if (failed) toast(`อัปโหลดไม่สำเร็จ ${failed} รายการ — แนบใหม่ได้ภายหลัง`, true);
        opts.onDone && opts.onDone(res.id, data, sign);
      } catch (x) {
        toast(x.message, true);
      } finally { btn.disabled = false; btn.textContent = v.id ? 'บันทึก' : 'ยื่นคำร้อง'; }
    });
    return f;
  }

  function stepper(st) {
    const s = STATUS[st] || {};
    if (st === 'cancelled') return `<div class="stepper-note tone-red">${esc(s.label)}</div>`;
    return `<ol class="stepper">${STEPS.map((name, i) => {
      const n = i + 1, cls = n < s.step || st === 'env_ok' ? 'done' : n === s.step ? (st === 'fix' ? 'warn' : 'cur') : '';
      return `<li class="${cls}"><span>${n}</span>${esc(name)}</li>`;
    }).join('')}</ol>`;
  }

  // ---------- พิมพ์ใบคำร้อง A4 (จำลองแบบฟอร์มกระดาษของบริษัท) ----------
  function paperHtml(r) {
    const dot = (v, w) => `<span class="dl" style="min-width:${w}">${esc(v || '')}</span>`;
    const d = new Date(r.created || Date.now());
    const need = docsFor(r.ownership || 'own');
    return `<div class="pp">
      <div class="pp-head"><div></div><div class="pp-org"><img src="${LOGO_URL}" alt="" class="pp-logo">${esc(CFG.ORG_NAME)}</div><div>เลขที่${dot(r.id, '32mm')}</div></div>
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
        <div>ลงชื่อ<span class="dl pp-signed" style="min-width:55mm">${r.sign ? `<img src="${r.sign}" alt="">` : ''}</span>ผู้ขอ<br>(${dot(r.name, '55mm')})</div>
        <div>ลงชื่อ${dot('', '55mm')}ผู้รับเรื่อง<br>(${dot('', '55mm')})</div>
      </div>
      <div class="pp-sign one"><div>ลงชื่อ${dot('', '55mm')}ผู้อนุมัติคำขอ<br>(${dot('', '50mm')})</div></div>
    </div>`;
  }
  // โลโก้บริษัทบนใบคำร้อง — โหลดไว้ก่อน เพื่อให้ขึ้นทันทีตอนพิมพ์/สร้าง PDF
  const LOGO_URL = new URL('assets/logo.png', location.href).href;
  new Image().src = LOGO_URL;
  const imagesReady = el => Promise.race([ // รอรูปโหลด แต่ไม่เกิน 3 วิ (กันปุ่มพิมพ์ค้าง)
    Promise.all([...el.querySelectorAll('img')].map(i => i.complete ? null
      : new Promise(ok => { i.onload = i.onerror = ok; }))),
    new Promise(ok => setTimeout(ok, 3000)),
  ]);

  async function printPaper(r) {
    let el = $('#print');
    if (!el) { el = document.createElement('div'); el.id = 'print'; document.body.appendChild(el); }
    el.innerHTML = paperHtml(r);
    await imagesReady(el);
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

  const loadImg = src => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('ไฟล์รูปเสีย')); im.src = src; });

  // ---------- หน้าสำเนาเอกสาร A4 (ใช้ทั้งตัวอย่างก่อนส่ง และ PDF จริง — หน้าตาเดียวกัน) ----------
  // mark = { product, name, sign (dataURL), preview (true = ยังไม่เซ็นก็แสดงช่องเซ็นว่าง) }
  const rotations = new WeakMap(); // File -> องศาที่ผู้ใช้หมุน
  const pageSigns = new WeakMap(); // File -> ลายเซ็นที่เซ็นลงบนหน้านั้น (ขนาดเท่ากรอบ)
  const PAGE_W = 1240, PAGE_H = 1754; // A4 ที่ 150 dpi
  async function pageCanvas(file, mark = {}) {
    const img = await readFileForUpload(file); // ย่อเป็น JPEG ≤1800px
    let el = await loadImg('data:image/jpeg;base64,' + img.data);
    const deg = rotations.get(file) || 0;
    if (deg) { // หมุนรูป
      const t = document.createElement('canvas'), q = deg % 180 !== 0;
      t.width = q ? el.height : el.width; t.height = q ? el.width : el.height;
      const tg = t.getContext('2d'); tg.translate(t.width / 2, t.height / 2); tg.rotate(deg * Math.PI / 180); tg.drawImage(el, -el.width / 2, -el.height / 2);
      el = t;
    }
    const c = document.createElement('canvas'); c.width = PAGE_W; c.height = PAGE_H;
    const g = c.getContext('2d'), M = 80;
    g.fillStyle = '#fff'; g.fillRect(0, 0, PAGE_W, PAGE_H);
    // รูปชิดบน เว้นที่ด้านล่างไว้สำหรับช่องเซ็นรับรอง
    const stampH = 400, maxH = PAGE_H - M * 2 - stampH - 30;
    const k = Math.min((PAGE_W - M * 2) / el.width, maxH / el.height);
    const w = el.width * k, h = el.height * k, x = (PAGE_W - w) / 2, y = M;
    g.drawImage(el, x, y, w, h);
    g.strokeStyle = '#ccc'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
    // ลายน้ำเฉียงทับรูป
    const d = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    const text = `ใช้สำหรับขอรับ${paperName(mark.product) || 'สิ่งปฏิกูล'} ${CFG.ORG_NAME} เท่านั้น · ${d}`;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.translate(x + w / 2, y + h / 2); g.rotate(-Math.atan2(h, w));
    g.font = '700 34px Sarabun, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(200, 30, 30, .30)';
    const diag = Math.hypot(w, h);
    for (let yy = -diag / 2, n = 0; yy < diag / 2; yy += 150, n++) g.fillText(text, (n % 2) * 160, yy);
    g.restore();
    // ช่องเซ็นรับรองสำเนา (ใต้รูป ชิดขวา)
    const own = mark.signing ? '' : pageSigns.get(file);
    const bw = 900, bh = stampH - 20, bx = PAGE_W - M - bw, by = y + h + 30;
    c.box = { x: bx / PAGE_W, y: by / PAGE_H, w: bw / PAGE_W, h: bh / PAGE_H };
    if (own || mark.sign || mark.preview || mark.signing) {
      const signed = !!(own || mark.sign);
      g.strokeStyle = '#1d3f9a'; g.lineWidth = 3; g.setLineDash(signed ? [] : [14, 10]); g.strokeRect(bx, by, bw, bh); g.setLineDash([]);
      g.fillStyle = '#1d3f9a'; g.textAlign = 'center';
      g.font = '700 50px Sarabun, sans-serif'; g.fillText('สำเนาถูกต้อง', bx + bw / 2, by + 64);
      if (own) g.drawImage(await loadImg(own), bx, by, bw, bh); // เซ็นตรงไหน อยู่ตรงนั้น
      else if (mark.signing) {
        g.font = '30px Sarabun, sans-serif'; g.fillStyle = '#8a97bd'; g.fillText('✍ เซ็นชื่อในกรอบนี้', bx + bw / 2, by + 200);
        g.fillStyle = '#1d3f9a';
      } else if (mark.sign) {
        const sig = await loadImg(mark.sign);
        const sh = 200, sw = Math.min(bw - 80, sh * sig.width / sig.height);
        g.drawImage(sig, bx + (bw - sw) / 2, by + 90, sw, sh);
      } else {
        g.font = '28px Sarabun, sans-serif'; g.fillStyle = '#8a97bd'; g.fillText('(ลายเซ็นผู้ขอจะอยู่ตรงนี้)', bx + bw / 2, by + 200);
        g.fillStyle = '#1d3f9a';
      }
      g.font = '34px Sarabun, sans-serif';
      g.fillText(mark.name ? `(${mark.name})  ${d}` : `ลงวันที่ ${d}`, bx + bw / 2, by + bh - 25);
    }
    return c;
  }

  // รูปหลายรูป → PDF ไฟล์เดียว (A4 แนวตั้ง หน้าละรูป) หน้าตาเหมือนตัวอย่างที่ผู้ขอเห็น
  async function imagesToPdf(files, name, mark) {
    await loadScript(JSPDF);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < files.length; i++) {
      const c = await pageCanvas(files[i], Object.assign({}, mark, { preview: false }));
      if (i) doc.addPage('a4', 'p');
      doc.addImage(c.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 210, 297);
    }
    return pdfOut(doc, name);
  }

  // ---------- ตรวจก่อนส่ง: ดูทุกหน้า หมุน / ถ่ายใหม่ / ลบ ----------
  // groups = [{ docId, label, files: File[] (แก้ในที่) }], opts = { title, mark, formHtml, okText }
  function reviewDocs(groups, opts = {}) {
    return new Promise(done => {
      const d = document.createElement('dialog'); d.className = 'review';
      document.body.appendChild(d); d.showModal();
      const close = v => { d.close(); d.remove(); done(v); };
      async function draw() {
        const total = groups.reduce((n, gr) => n + gr.files.length, 0);
        d.innerHTML = `<div class="dhead"><b>${esc(opts.title || 'ตรวจเอกสารก่อนส่ง')}</b><button type="button" class="btn small ghost" data-x aria-label="ปิด">✕</button></div>
          <div class="dbody">
          <p class="muted">แตะหน้าเพื่อดูใหญ่ · ✍ เซ็นใหม่ · ↻ หมุน · 📷 ถ่ายใหม่ · 🗑 ลบ — หน้าตาตามที่จะส่งจริง</p>
          ${opts.formHtml ? `<h4>ใบคำร้อง</h4><div class="pv-form"><div class="pv-paper">${opts.formHtml}</div></div>` : ''}
          ${groups.map((gr, gi) => `<h4>${esc(gr.label)} <small class="muted">${gr.files.length ? gr.files.length + ' หน้า' : 'ยังไม่มี'}</small></h4>
            <div class="pv-grid">${gr.files.map((f, fi) => `<figure class="pv-page" data-g="${gi}" data-i="${fi}">
              <div class="pv-img">${f.type.startsWith('image/') ? '<span class="muted">กำลังจัดหน้า…</span>' : '<b>ไฟล์ PDF</b><small>' + esc(f.name) + '</small>'}</div>
              <figcaption>${f.type.startsWith('image/') ? '<button type="button" class="btn small" data-sign title="เซ็นใหม่">✍</button><button type="button" class="btn small" data-rot title="หมุน">↻</button>' : ''}
                <label class="btn small">📷<input type="file" accept="image/*" capture="environment" data-re hidden></label>
                <button type="button" class="btn small danger" data-del>🗑</button></figcaption></figure>`).join('')}</div>`).join('')}
          <div class="actions"><button type="button" class="btn ghost" data-x>${opts.okText ? 'กลับไปแก้' : 'ปิด'}</button>
            ${opts.okText ? `<button type="button" class="btn primary" data-ok>${esc(opts.okText)}${total ? ` (${total} หน้า)` : ''}</button>` : ''}</div></div>`;
        $$('[data-x]', d).forEach(b => (b.onclick = () => close(false)));
        const ok = $('[data-ok]', d); if (ok) ok.onclick = () => close(true);
        $$('.pv-page', d).forEach(fig => {
          const gr = groups[+fig.dataset.g], i = +fig.dataset.i, f = gr.files[i];
          const rot = $('[data-rot]', fig);
          if (rot) rot.onclick = () => { rotations.set(f, ((rotations.get(f) || 0) + 90) % 360); draw(); };
          const sg = $('[data-sign]', fig);
          if (sg) sg.onclick = async () => { const got = await signPage(f, opts.mark, {}); if (got) gr.files[i] = got; draw(); };
          $('[data-del]', fig).onclick = () => { gr.files.splice(i, 1); draw(); };
          $('[data-re]', fig).onchange = async e => {
            const nf = e.target.files[0]; if (!nf) return;
            const got = opts.signRequired ? await signPage(nf, opts.mark, { required: true }) : nf;
            if (got) gr.files[i] = got; draw();
          };
          $('.pv-img', fig).onclick = () => fig.classList.toggle('big');
        });
        // จัดหน้าทีละรูป (ไม่ให้ค้าง)
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        for (const fig of $$('.pv-page', d)) {
          const f = groups[+fig.dataset.g].files[+fig.dataset.i];
          if (!f || !f.type.startsWith('image/') || !d.open) continue;
          try {
            const c = await pageCanvas(f, Object.assign({ preview: true }, opts.mark));
            $('.pv-img', fig).innerHTML = `<img src="${c.toDataURL('image/jpeg', 0.7)}" alt="ตัวอย่างหน้าเอกสาร">`;
          } catch (x) { $('.pv-img', fig).innerHTML = `<span class="tone-red">${esc(x.message)}</span>`; }
        }
      }
      draw();
    });
  }

  // ---------- ช่องเซ็นชื่อบนจอ ----------
  // ช่องเซ็นชื่อ — เส้นหนา/บางตามความเร็ว เหมือนปากกาลูกลื่นหมึกน้ำเงิน
  // opts.overlay = วางทับกรอบบนหน้าเอกสาร (โปร่งใส ไม่มีปุ่มในกรอบ)
  function signaturePad(host, opts = {}) {
    host.innerHTML = '<canvas aria-label="กรอบเซ็นชื่อ"></canvas>' +
      (opts.overlay ? '' : '<button type="button" class="btn small ghost" data-sigclear>ล้างลายเซ็น</button><span class="sighint">เซ็นตรงนี้</span>');
    const c = $('canvas', host), g = c.getContext('2d');
    let empty = true, last = null, lastW = 0;
    const base = () => Math.max(2, c.getBoundingClientRect().width / 150); // ขนาดเส้นตามขนาดกรอบ
    function fit() {
      const r = c.getBoundingClientRect(), k = window.devicePixelRatio || 1;
      if (!r.width || (c.width === Math.round(r.width * k) && c.height === Math.round(r.height * k))) return;
      const keep = empty ? null : c.toDataURL();
      c.width = Math.round(r.width * k); c.height = Math.round(r.height * k);
      g.setTransform(k, 0, 0, k, 0, 0); g.lineCap = g.lineJoin = 'round'; g.strokeStyle = g.fillStyle = '#1a3a8f';
      if (keep) loadImg(keep).then(im => g.drawImage(im, 0, 0, r.width, r.height));
    }
    const pos = e => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp || Date.now() }; };
    c.addEventListener('pointerdown', e => {
      fit(); try { c.setPointerCapture(e.pointerId); } catch (x) {}
      last = pos(e); lastW = base() * 1.1; e.preventDefault();
      g.beginPath(); g.arc(last.x, last.y, lastW / 2, 0, Math.PI * 2); g.fill();
    });
    c.addEventListener('pointermove', e => {
      if (!last) return;
      const p = pos(e), dist = Math.hypot(p.x - last.x, p.y - last.y), v = dist / Math.max(1, p.t - last.t);
      const w = Math.max(base() * .45, Math.min(base() * 1.5, base() * 1.6 - v * base() * .9));
      lastW = lastW * .6 + w * .4; // เปลี่ยนความหนาแบบนุ่ม ๆ
      g.lineWidth = lastW; g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p;
      if (empty) { empty = false; host.classList.add('signed'); }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => c.addEventListener(t, () => (last = null)));
    const clear = () => { g.clearRect(0, 0, c.width, c.height); empty = true; host.classList.remove('signed'); };
    const cb = $('[data-sigclear]', host); if (cb) cb.onclick = clear;
    if (window.ResizeObserver) new ResizeObserver(fit).observe(c); else window.addEventListener('resize', fit);
    return {
      isEmpty: () => empty,
      clear,
      rawDataURL: () => c.toDataURL('image/png'), // ขนาดเท่ากรอบ (ใช้วางกลับตำแหน่งเดิม)
      toDataURL() { // ตัดขอบว่าง ให้ลายเซ็นเต็มกรอบเวลาวางบนเอกสาร
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
        for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2)
          if (d[(y * c.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 <= x0) return c.toDataURL('image/png');
        const o = document.createElement('canvas'), pad = 8;
        o.width = x1 - x0 + pad * 2; o.height = y1 - y0 + pad * 2;
        o.getContext('2d').drawImage(c, x0 - pad, y0 - pad, o.width, o.height, 0, 0, o.width, o.height);
        return o.toDataURL('image/png');
      },
    };
  }

  // ถ่ายรูปเสร็จ → เห็นหน้าสำเนา A4 ที่มีลายน้ำแล้ว → เซ็นลงกรอบ "สำเนาถูกต้อง" บนหน้านั้นเลย
  // คืน File ที่ใช้ (อาจเป็นรูปที่ถ่ายใหม่) หรือ null ถ้ายกเลิก; opts.required = ต้องเซ็นก่อนกดใช้
  function signPage(file, mark = {}, opts = {}) {
    return new Promise(done => {
      const d = document.createElement('dialog'); d.className = 'signpage';
      document.body.appendChild(d); d.showModal();
      const close = v => { d.close(); d.remove(); done(v); };
      async function draw() {
        d.innerHTML = `<div class="dhead"><b>เซ็นรับรองสำเนาถูกต้อง</b><button type="button" class="btn small ghost" data-x aria-label="ปิด">✕</button></div>
          <div class="dbody"><p class="muted">ตรวจรูปให้ชัด แล้วใช้นิ้วเซ็นในกรอบ "สำเนาถูกต้อง" ด้านล่างรูป</p>
          <div class="sp-wrap"><span class="muted">กำลังจัดหน้า…</span></div>
          <div class="actions"><button type="button" class="btn ghost" data-x>ยกเลิก</button>
            <label class="btn">📷 ถ่ายใหม่<input type="file" accept="image/*" capture="environment" data-re hidden></label>
            <button type="button" class="btn" data-clear>ล้างลายเซ็น</button>
            <button type="button" class="btn primary" data-ok>✓ ใช้หน้านี้</button></div></div>`;
        $$('[data-x]', d).forEach(b => (b.onclick = () => close(null)));
        $('[data-re]', d).onchange = e => { if (e.target.files[0]) { file = e.target.files[0]; draw(); } };
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        let c;
        try { c = await pageCanvas(file, Object.assign({}, mark, { signing: true })); }
        catch (x) { $('.sp-wrap', d).innerHTML = `<b class="tone-red">${esc(x.message)}</b>`; return; }
        const b = c.box, wrap = $('.sp-wrap', d);
        wrap.innerHTML = `<img src="${c.toDataURL('image/jpeg', 0.8)}" alt="หน้าสำเนาเอกสาร"><div class="sp-pad" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%"></div>`;
        const pad = signaturePad($('.sp-pad', wrap), { overlay: true });
        $('.sp-pad', wrap).scrollIntoView({ block: 'center' });
        $('[data-clear]', d).onclick = pad.clear;
        $('[data-ok]', d).onclick = () => {
          if (pad.isEmpty() && opts.required) return toast('เซ็นชื่อในกรอบ "สำเนาถูกต้อง" ก่อน', true);
          if (pad.isEmpty()) pageSigns.delete(file); else pageSigns.set(file, pad.rawDataURL());
          close(file);
        };
      }
      draw();
    });
  }
  // เซ็นทีละรูปตามลำดับ (PDF ข้ามไป) — คืนรายการที่ผู้ใช้กดใช้
  async function signEach(files, mark, opts) {
    const out = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) { out.push(f); continue; }
      const got = await signPage(f, mark, opts);
      if (got) out.push(got);
    }
    return out;
  }

  // ขอลายเซ็น (ตอนแนบเอกสารเพิ่มภายหลัง) — จำไว้จนปิดหน้า
  let sessionSign = '';
  function askSignature() {
    if (sessionSign) return Promise.resolve(sessionSign);
    return new Promise(done => {
      const d = document.createElement('dialog');
      d.innerHTML = `<div class="dhead"><b>เซ็นรับรองสำเนาถูกต้อง</b></div><div class="dbody">
        <p class="muted">ลายเซ็นจะอยู่บนตรา "สำเนาถูกต้อง" มุมเอกสารทุกแผ่น</p><div class="sigbox" data-sigbox></div>
        <div class="actions"><button type="button" class="btn ghost" data-no>ยกเลิก</button><button type="button" class="btn primary" data-ok>ใช้ลายเซ็นนี้</button></div></div>`;
      document.body.appendChild(d); d.showModal();
      const pad = signaturePad($('[data-sigbox]', d));
      const close = v => { d.close(); d.remove(); done(v); };
      $('[data-no]', d).onclick = () => close('');
      $('[data-ok]', d).onclick = () => { if (pad.isEmpty()) return toast('เซ็นชื่อในกรอบก่อน', true); sessionSign = pad.toDataURL(); close(sessionSign); };
    });
  }

  // ปุ่มแนบเอกสาร: ถ่ายรูปด้วยกล้อง / เลือกไฟล์ (รูปหรือ PDF)
  function docButtons(docId, label = '📷 ถ่ายรูป') {
    return `<span class="docbtns"><label class="btn small primary">${label}<input type="file" accept="image/*" capture="environment" data-doc="${docId}" hidden></label>` +
      `<label class="btn small">📎 ไฟล์<input type="file" accept="image/*,application/pdf" multiple data-doc="${docId}" hidden></label></span>`;
  }
  const thumbs = new WeakMap();
  function thumbUrl(file) { if (!thumbs.has(file)) thumbs.set(file, URL.createObjectURL(file)); return thumbs.get(file); }

  // ใบคำร้อง → PDF หน้าตาเหมือนฉบับพิมพ์
  async function formPdf(r) {
    await Promise.all([loadScript(JSPDF), loadScript(H2C)]);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;padding:45px 57px;background:#fff;color:#000';
    box.innerHTML = paperHtml(r);
    document.body.appendChild(box);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await imagesReady(box);
      const c = await window.html2canvas(box, { scale: 2, backgroundColor: '#fff' });
      const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const k = Math.min(210 / c.width, 297 / c.height); // A4 หน้าเดียว — ยาวเกินก็ย่อ ไม่ตัดท้าย
      const w = c.width * k, h = c.height * k;
      doc.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', (210 - w) / 2, 0, w, h);
      return pdfOut(doc, 'ใบคำร้อง.pdf');
    } finally { box.remove(); }
  }

  // อัปโหลดเอกสารประเภทเดียว: รูปทั้งหมดรวมเป็น PDF 1 ไฟล์, ไฟล์ PDF ส่งตามเดิม
  // แนบเพิ่มภายหลัง: ดูตัวอย่าง/แก้ก่อน แล้วค่อยส่ง — คืน false ถ้าผู้ใช้ยกเลิก
  async function reviewAndUpload(id, auth, docId, files, mark, needSign) {
    files = needSign ? await signEach([...files], mark, { required: true }) : [...files];
    if (!files.length) return false;
    const gr = [{ docId, label: (DOCS.find(x => x.id === docId) || {}).label || docId, files }];
    if (!(await reviewDocs(gr, { title: 'ตรวจก่อนส่ง', mark, okText: 'ยืนยันส่งเอกสาร', signRequired: needSign })) || !gr[0].files.length) return false;
    await uploadDocs(id, auth, docId, gr[0].files, null, mark);
    return true;
  }
  async function uploadDocs(id, auth, docType, files, onStep, mark) {
    files = [...files];
    const imgs = files.filter(f => f.type.startsWith('image/')), others = files.filter(f => !f.type.startsWith('image/'));
    const jobs = [];
    if (imgs.length) jobs.push(() => imagesToPdf(imgs, docType + '.pdf', mark));
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
    productName, paperName, printPaper, uploadDocs, uploadFormPdf, statusBadge, toast, readFileForUpload, api, LIVE, DEMO, renderRequestForm, stepper, footer,
    askSignature, docButtons, reviewAndUpload };
})();
