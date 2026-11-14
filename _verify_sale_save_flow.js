/**
 * ตรวจสอบ flow ใหม่ของ Daily Sales: Add sale → Save (พร้อม timestamp) → เตือนเมื่อออกแท็บ → ล็อกแก้ไขหลัง 1 ชม.
 * วิธีรัน: node _verify_sale_save_flow.js  (Playwright เปิด index.html ตรงๆ, localStorage ว่าง ไม่แตะข้อมูลจริง)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const { pathToFileURL } = require('url');
const FILE_URL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const OUT_JSON = path.join(__dirname, '_verify_sale_flow_result.json');
const OUT_IMG = path.join(__dirname, 'preview_sale_save_flow.png');
const OUT_IMG2 = path.join(__dirname, 'preview_sale_log_saved.png');

let failed = 0;
function check(label, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  (' + detail + ')' : ''}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });

  await page.goto(FILE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    role = 'staff'; applyRole();
    activateTab(document.querySelector('#tabs button[data-tab="sales"]'));
  });
  await page.waitForTimeout(400);
  await page.addScriptTag({ content: `
    window.__testItem = () => ((S.items.find(i=>+i.price>0)||S.items[0]||{}).name) || null;
    window.__addSale = (qty) => {
      const item = __testItem(); if(!item) return false;
      document.getElementById('sDate').value = todayISO();
      document.getElementById('sItem').value = item;
      document.getElementById('sQty').value = String(qty||1);
      document.getElementById('sAdd').click();
      return true;
    };
    window.__stampAgo = (mins) => {
      const d = new Date(Date.now()-mins*60000);
      return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+"T"+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
    };
  ` });

  // ---------- A) Add sale → ยังไม่บันทึก ----------
  const A = await page.evaluate(() => {
    const before = S.sales.length;
    __addSale(2);
    return {
      before, after: S.sales.length, pending: pendingSales.length,
      saveBtn: document.getElementById('sSave').textContent.trim(),
      info: document.getElementById('sSaveInfo').textContent.trim(),
      pendingRows: document.querySelectorAll('#tSales tr.pending-row').length
    };
  });
  console.log('--- A) Add sale แล้วยังไม่กด Save ---');
  check('Add sale แล้วยังไม่ลง S.sales (เก็บเป็น pending)', A.after === A.before && A.pending === 1, `sales ${A.before}→${A.after}, pending ${A.pending}`);
  check('ปุ่ม Save แสดงจำนวนรายการค้าง', /\(1\)/.test(A.saveBtn), A.saveBtn);
  check('แถบสถานะเตือนว่ายังไม่บันทึก', /not saved|ยังไม่บันทึก/.test(A.info), A.info);
  check('ตารางแสดงแถว pending 1 แถว', A.pendingRows === 1, String(A.pendingRows));

  // ---------- B) กด Save ----------
  const B = await page.evaluate(() => {
    const before = S.sales.length;
    document.getElementById('sSave').click();
    const last = S.sales[S.sales.length - 1];
    return {
      before, after: S.sales.length, pending: pendingSales.length,
      savedAt: (last && last.savedAt) || '',
      info: document.getElementById('sSaveInfo').textContent.trim(),
      savedCells: Array.from(document.querySelectorAll('#tSales tbody tr td:nth-child(6)')).map(td => td.textContent.trim())
    };
  });
  console.log('\n--- B) กดปุ่ม Save ---');
  check('Save → ย้ายเข้า S.sales และล้าง pending', B.after === B.before + 1 && B.pending === 0, `sales ${B.before}→${B.after}, pending ${B.pending}`);
  check('มี savedAt (วันที่+เวลาที่บันทึก)', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(B.savedAt), B.savedAt);
  check('แถบสถานะแสดง "บันทึกล่าสุด / Last saved"', /Last saved|บันทึกล่าสุด/.test(B.info), B.info);
  check('คอลัมน์ Saved แสดงวันที่บันทึก', B.savedCells.some(t => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t)), B.savedCells.join(' | '));

  // ---------- C) สลับแท็บตอนยังไม่บันทึก → modal เตือน → Save & continue ----------
  const C1 = await page.evaluate(() => {
    __addSale(3);
    document.querySelector('#tabs button[data-tab="dash"]').click();
    return {
      modalOpen: document.getElementById('pendingModalBg').classList.contains('active'),
      info: document.getElementById('pmInfo').textContent.replace(/\s+/g, ' ').trim()
    };
  });
  console.log('\n--- C) เตือนเมื่อสลับแท็บทั้งที่ยังไม่กด Save ---');
  check('เปิดป็อปอัปเตือนเมื่อสลับแท็บ', C1.modalOpen === true);
  check('ข้อความในป็อปอัปบอกจำนวนที่ค้าง', /1/.test(C1.info), C1.info.slice(0, 80));

  const C2 = await page.evaluate(() => {
    const before = S.sales.length;
    document.getElementById('pmSave').click();
    return {
      before, after: S.sales.length, pending: pendingSales.length,
      dashOn: document.getElementById('sec-dash').classList.contains('on'),
      modalOpen: document.getElementById('pendingModalBg').classList.contains('active')
    };
  });
  check('Save & continue → บันทึกครบและสลับแท็บสำเร็จ', C2.after === C2.before + 1 && C2.pending === 0 && C2.dashOn === true && C2.modalOpen === false,
    `sales ${C2.before}→${C2.after}, pending ${C2.pending}, dash ${C2.dashOn}`);

  // ---------- D) Discard & continue ----------
  const D = await page.evaluate(() => {
    activateTab(document.querySelector('#tabs button[data-tab="sales"]'));
    __addSale(4);
    const before = S.sales.length;
    document.querySelector('#tabs button[data-tab="consumption"]').click();
    document.getElementById('pmDiscard').click();
    return {
      before, after: S.sales.length, pending: pendingSales.length,
      consumptionOn: document.getElementById('sec-consumption').classList.contains('on'),
      pendingRows: document.querySelectorAll('#tSales tr.pending-row').length
    };
  });
  console.log('\n--- D) ล้างรายการที่ยังไม่บันทึก ---');
  check('Discard & continue → ล้าง pending และไม่บันทึก', D.after === D.before && D.pending === 0 && D.consumptionOn === true,
    `sales ${D.before}→${D.after}, pending ${D.pending}, consumption ${D.consumptionOn}`);
  check('ไม่มีแถว pending ค้างในตาราง', D.pendingRows === 0, String(D.pendingRows));

  // ---------- E) ล็อกแก้ไข/ลบ หลังบันทึกเกิน 1 ชั่วโมง ----------
  const E = await page.evaluate(() => {
    activateTab(document.querySelector('#tabs button[data-tab="sales"]'));
    const item = __testItem();
    S.sales.push({ date: todayISO(), item, qty: 1, outlet: S.outlets[0], savedAt: __stampAgo(120) });
    const oldIdx = S.sales.length - 1;
    S.sales.push({ date: todayISO(), item, qty: 1, outlet: S.outlets[0], savedAt: __stampAgo(10) });
    const newIdx = S.sales.length - 1;
    renderAll();
    const lockedRows = document.querySelectorAll('#tSales tr.locked-row').length;
    const oldRow = document.querySelector('#tSales tr[data-edit-sale="' + oldIdx + '"]');
    if (oldRow) oldRow.click();
    const editingAfterOld = editingSale;
    const countBefore = S.sales.length;
    const delBtn = document.querySelector('#tSales tr[data-edit-sale="' + oldIdx + '"] .rowdel');
    if (delBtn) delBtn.click();
    const countAfter = S.sales.length;
    const newRow = document.querySelector('#tSales tr[data-edit-sale="' + newIdx + '"]');
    if (newRow) newRow.click();
    const editingNew = editingSale;
    resetSaleForm();
    return { lockedRows, oldIdx, newIdx, editingAfterOld, countBefore, countAfter, editingNew };
  });
  console.log('\n--- E) ล็อก 1 ชั่วโมงหลังบันทึก ---');
  check('แถวที่บันทึกเกิน 1 ชม. ถูกทำเครื่องหมาย locked', E.lockedRows >= 1, String(E.lockedRows));
  check('คลิกแถวที่ล็อก → ไม่เข้าโหมดแก้ไข', E.editingAfterOld === -1, 'editingSale=' + E.editingAfterOld);
  check('ลบแถวที่ล็อกไม่ได้', E.countAfter === E.countBefore, `${E.countBefore}→${E.countAfter}`);
  check('แถวที่เพิ่งบันทึก (10 นาที) ยังแก้ไขได้', E.editingNew === E.newIdx, 'editingSale=' + E.editingNew + ' / idx ' + E.newIdx);
  check('มีข้อความแจ้งเตือนเรื่องล็อก 1 ชั่วโมง', dialogs.some(m => /1 hour|1 ชั่วโมง/.test(m)), dialogs[dialogs.length - 1] || '');

  // ---------- E2) แอดมินต้องแก้ไข/ลบแถวที่เกิน 1 ชม.ได้ ----------
  const E2 = await page.evaluate((oldIdx) => {
    role = 'admin'; applyRole(); renderAll();
    const lockedRows = document.querySelectorAll('#tSales tr.locked-row').length;
    const row = document.querySelector('#tSales tr[data-edit-sale="' + oldIdx + '"]');
    if (row) row.click();
    const editing = editingSale;
    resetSaleForm();
    const before = S.sales.length;
    const delBtn = document.querySelector('#tSales tr[data-edit-sale="' + oldIdx + '"] .rowdel');
    if (delBtn) delBtn.click();
    return { lockedRows, editing, before, after: S.sales.length };
  }, E.oldIdx);
  console.log('\n--- E2) แอดมินแก้/ลบแถวที่เกิน 1 ชั่วโมงได้ ---');
  check('แอดมินไม่เห็นป้าย locked (เฉพาะ staff)', E2.lockedRows === 0, String(E2.lockedRows));
  check('แอดมินคลิกแถวที่เกิน 1 ชม. → เข้าโหมดแก้ไขได้', E2.editing === E.oldIdx, `editingSale=${E2.editing} / idx ${E.oldIdx}`);
  check('แอดมินลบแถวที่เกิน 1 ชม.ได้', E2.after === E2.before - 1, `${E2.before}→${E2.after}`);

  // ---------- F) ภาพหน้าจอ ----------
  await page.evaluate(() => {
    role = 'staff'; applyRole();
    activateTab(document.querySelector('#tabs button[data-tab="sales"]'));
    resetSaleForm();
    __addSale(2);
    document.getElementById('adminModalBg').classList.remove('active');
    document.body.classList.remove('login-screen', 'force-pw', 'locked');
  });
  await page.waitForTimeout(500);
  const cards = await page.$$('#sec-sales .card');
  if (cards[0]) await cards[0].screenshot({ path: OUT_IMG });
  if (cards[1]) await cards[1].screenshot({ path: OUT_IMG2 });

  fs.writeFileSync(OUT_JSON, JSON.stringify({ A, B, C1, C2, D, E, E2, dialogs }, null, 2), 'utf8');
  await browser.close();
  console.log(`\nสรุป: ${failed === 0 ? 'flow Add → Save → เตือน → ล็อก 1 ชม. ทำงานถูกต้อง' : failed + ' รายการไม่ผ่าน'}`);
  process.exit(failed === 0 ? 0 : 1);
})();
